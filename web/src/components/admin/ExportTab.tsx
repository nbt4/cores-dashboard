import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { toast } from '../../lib/toast';

type TransferField = {
  key: string;
  label: string;
  type: string;
  writable: boolean;
  required?: boolean;
  default_selected?: boolean;
};

type TransferDataset = {
  key: string;
  label: string;
  description: string;
  import_supported: boolean;
  fields: TransferField[];
};

type TransferCatalog = {
  datasets: TransferDataset[];
  formats: string[];
  delimiters: string[];
  max_rows: number;
};

type ImportRow = {
  row_number: number;
  values: Record<string, string>;
  existing?: Record<string, string>;
  status: 'new' | 'conflict' | 'invalid';
  match_field?: string;
  errors?: string[];
};

type ImportPreview = {
  dataset: string;
  filename: string;
  mapped_fields: string[];
  unknown_columns: string[];
  rows: ImportRow[];
  new_rows: number;
  conflicts: number;
  invalid_rows: number;
};

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
};

const transferBase = '/api/v1/proxy/warehouse/api/v1/admin/data-transfer';

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function downloadedFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded.replace(/["']/g, ''));
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

export function ExportTab() {
  const [catalog, setCatalog] = useState<TransferCatalog | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [datasetKey, setDatasetKey] = useState('products');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [format, setFormat] = useState('csv');
  const [delimiter, setDelimiter] = useState('semicolon');
  const [headers, setHeaders] = useState('labels');
  const [exporting, setExporting] = useState(false);
  const [importDatasetKey, setImportDatasetKey] = useState('products');
  const [file, setFile] = useState<File | null>(null);
  const [importDelimiter, setImportDelimiter] = useState('auto');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'merge'>('skip');
  const [fieldPolicies, setFieldPolicies] = useState<Record<string, 'incoming' | 'existing' | 'if_empty'>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingCatalog(true);
    fetch(`${transferBase}/catalog`, { credentials: 'include' })
      .then(async response => {
        if (!response.ok) throw new Error(await responseError(response, 'Datentransfer konnte nicht geladen werden'));
        return response.json() as Promise<TransferCatalog>;
      })
      .then(data => {
        if (!active) return;
        setCatalog(data);
        const initial = data.datasets.find(dataset => dataset.key === 'products') || data.datasets[0];
        if (initial) {
          setDatasetKey(initial.key);
          setSelectedFields(initial.fields.filter(field => field.default_selected).map(field => field.key));
        }
        const importInitial = data.datasets.find(dataset => dataset.key === 'products' && dataset.import_supported)
          || data.datasets.find(dataset => dataset.import_supported);
        if (importInitial) setImportDatasetKey(importInitial.key);
      })
      .catch(error => toast.error(error instanceof Error ? error.message : 'Datentransfer konnte nicht geladen werden'))
      .finally(() => active && setLoadingCatalog(false));
    return () => { active = false; };
  }, []);

  const dataset = catalog?.datasets.find(item => item.key === datasetKey);
  const importDataset = catalog?.datasets.find(item => item.key === importDatasetKey);
  const mappedImportFields = useMemo(() => {
    if (!preview || !importDataset) return [];
    return preview.mapped_fields
      .map(key => importDataset.fields.find(field => field.key === key))
      .filter((field): field is TransferField => Boolean(field));
  }, [importDataset, preview]);

  const chooseDataset = (key: string) => {
    setDatasetKey(key);
    const next = catalog?.datasets.find(item => item.key === key);
    setSelectedFields(next?.fields.filter(field => field.default_selected).map(field => field.key) || []);
  };

  const chooseImportDataset = (key: string) => {
    setImportDatasetKey(key);
    setPreview(null);
    setConflictPolicy('skip');
    setFieldPolicies({});
  };

  const toggleField = (key: string) => {
    setSelectedFields(current => current.includes(key) ? current.filter(field => field !== key) : [...current, key]);
  };

  const exportData = async () => {
    if (!dataset || selectedFields.length === 0) return;
    setExporting(true);
    try {
      const response = await fetch(`${transferBase}/export`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: dataset.key, fields: selectedFields, format, delimiter, headers }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Export fehlgeschlagen'));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadedFilename(response, `${dataset.key}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`${dataset.label} erfolgreich exportiert`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  };

  const previewImport = async () => {
    if (!file || !importDataset) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const params = new URLSearchParams({ dataset: importDataset.key, delimiter: importDelimiter });
      const response = await fetch(`${transferBase}/import/preview?${params}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!response.ok) throw new Error(await responseError(response, 'Importvorschau fehlgeschlagen'));
      const next = await response.json() as ImportPreview;
      setPreview(next);
      const defaults: Record<string, 'incoming'> = {};
      next.mapped_fields.forEach(key => { defaults[key] = 'incoming'; });
      setFieldPolicies(defaults);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Importvorschau fehlgeschlagen');
    } finally {
      setPreviewing(false);
    }
  };

  const applyImport = async () => {
    if (!preview || preview.invalid_rows > 0) return;
    setApplying(true);
    try {
      const response = await fetch(`${transferBase}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: preview.dataset,
          rows: preview.rows.map(row => ({ row_number: row.row_number, values: row.values })),
          conflict_policy: conflictPolicy,
          field_policies: fieldPolicies,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Import fehlgeschlagen'));
      const result = await response.json() as ImportResult;
      toast.success(`${result.created} erstellt, ${result.updated} aktualisiert, ${result.skipped} übersprungen`);
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import fehlgeschlagen');
    } finally {
      setApplying(false);
    }
  };

  if (loadingCatalog) {
    return <div className="suite-card flex items-center gap-3 p-6"><RefreshCw className="h-5 w-5 animate-spin" /> Datentransfer wird geladen…</div>;
  }
  if (!catalog || !dataset) {
    return <div className="suite-card p-6">Datentransfer ist derzeit nicht verfügbar.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-accent-red" />
          <h2 className="text-2xl font-bold">Daten importieren und exportieren</h2>
        </div>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
          Felder frei auswählen, CSV oder Excel verwenden und bestehende Datensätze kontrolliert zusammenführen.
        </p>
      </div>

      <div className="suite-card flex gap-2 p-2" role="tablist" aria-label="Datentransfer-Modus">
        <button type="button" role="tab" aria-selected={mode === 'export'} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium ${mode === 'export' ? 'bg-accent-red text-white' : ''}`} onClick={() => setMode('export')}>
          <Download className="h-4 w-4" /> Export
        </button>
        <button type="button" role="tab" aria-selected={mode === 'import'} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium ${mode === 'import' ? 'bg-accent-red text-white' : ''}`} onClick={() => setMode('import')}>
          <Upload className="h-4 w-4" /> Import
        </button>
      </div>

      {mode === 'export' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.42fr)]">
          <section className="suite-card space-y-5 p-6" aria-labelledby="export-fields-heading">
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="export-dataset">Datensatz</label>
              <select id="export-dataset" className="w-full" value={datasetKey} onChange={event => chooseDataset(event.target.value)}>
                {catalog.datasets.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{dataset.description}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="export-fields-heading" className="font-semibold">Felder</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selectedFields.length} von {dataset.fields.length} ausgewählt</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSelectedFields(dataset.fields.map(field => field.key))}>Alle</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setSelectedFields(dataset.fields.filter(field => field.default_selected).map(field => field.key))}>Standard</button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dataset.fields.map(field => (
                <label key={field.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <input type="checkbox" className="mt-1" checked={selectedFields.includes(field.key)} onChange={() => toggleField(field.key)} />
                  <span><span className="block text-sm font-medium">{field.label}</span><span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{field.key}</span></span>
                </label>
              ))}
            </div>
          </section>

          <aside className="suite-card h-fit space-y-5 p-6">
            <h3 className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-5 w-5 text-accent-red" /> Dateiformat</h3>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="export-format">Format</label>
              <select id="export-format" className="w-full" value={format} onChange={event => setFormat(event.target.value)}>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xlsx)</option>
              </select>
            </div>
            {format === 'csv' && (
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="export-delimiter">Trennzeichen</label>
                <select id="export-delimiter" className="w-full" value={delimiter} onChange={event => setDelimiter(event.target.value)}>
                  <option value="semicolon">Semikolon (;)</option>
                  <option value="comma">Komma (,)</option>
                  <option value="tab">Tabulator</option>
                </select>
              </div>
            )}
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="export-headers">Spaltenüberschriften</label>
              <select id="export-headers" className="w-full" value={headers} onChange={event => setHeaders(event.target.value)}>
                <option value="labels">Lesbare Namen</option>
                <option value="keys">Technische Feldnamen</option>
              </select>
            </div>
            <button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-red px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={exporting || selectedFields.length === 0} onClick={exportData}>
              {exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? 'Export wird erstellt…' : `${format.toUpperCase()} herunterladen`}
            </button>
          </aside>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="suite-card grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.35fr)_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="import-dataset">Datensatz</label>
              <select id="import-dataset" className="w-full" value={importDatasetKey} onChange={event => chooseImportDataset(event.target.value)}>
                {catalog.datasets.filter(item => item.import_supported).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{importDataset?.description}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="import-file">CSV- oder XLSX-Datei</label>
              <input ref={fileInput} id="import-file" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full text-sm" onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); }} />
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Maximal {catalog.max_rows.toLocaleString('de-DE')} Zeilen; Zuordnung erfolgt über die Überschrift.</p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold" htmlFor="import-delimiter">CSV-Trennzeichen</label>
              <select id="import-delimiter" value={importDelimiter} onChange={event => setImportDelimiter(event.target.value)}>
                <option value="auto">Automatisch</option><option value="semicolon">Semikolon (;)</option><option value="comma">Komma (,)</option><option value="tab">Tabulator</option>
              </select>
              <button type="button" className="flex items-center justify-center gap-2 rounded-lg bg-accent-red px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={!file || previewing} onClick={previewImport}>
                {previewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Vorschau prüfen
              </button>
            </div>
          </section>

          {preview && (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="suite-card p-4"><div className="text-2xl font-bold">{preview.new_rows}</div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Neue Datensätze</div></div>
                <div className="suite-card p-4"><div className="text-2xl font-bold">{preview.conflicts}</div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Bestehende Datensätze</div></div>
                <div className="suite-card p-4"><div className="text-2xl font-bold">{preview.invalid_rows}</div><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Fehlerhafte Zeilen</div></div>
              </section>

              {preview.unknown_columns.length > 0 && (
                <div className="suite-card flex gap-3 p-4" role="status">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-red" />
                  <div><strong>Nicht zugeordnete Spalten</strong><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{preview.unknown_columns.join(', ')} — diese Spalten werden ignoriert.</p></div>
                </div>
              )}

              {preview.conflicts > 0 && (
                <section className="suite-card space-y-4 p-6">
                  <div><h3 className="font-semibold">Konflikte behandeln</h3><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Bestehende Datensätze wurden über ID, Code, Barcode, E-Mail oder Namen erkannt.</p></div>
                  <select className="w-full max-w-md" value={conflictPolicy} onChange={event => setConflictPolicy(event.target.value as 'skip' | 'merge')}>
                    <option value="skip">Bestehende Datensätze überspringen</option><option value="merge">Bestehende Datensätze zusammenführen</option>
                  </select>
                  {conflictPolicy === 'merge' && (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {mappedImportFields.filter(field => field.writable).map(field => (
                        <label key={field.key} className="rounded-lg border p-3">
                          <span className="mb-2 block text-sm font-medium">{field.label}</span>
                          <select className="w-full" value={fieldPolicies[field.key] || 'incoming'} onChange={event => setFieldPolicies(current => ({ ...current, [field.key]: event.target.value as 'incoming' | 'existing' | 'if_empty' }))}>
                            <option value="incoming">Importwert verwenden</option><option value="existing">Bestehenden Wert behalten</option><option value="if_empty">Nur leere Felder füllen</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="suite-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                  <div><h3 className="font-semibold">Importvorschau</h3><p className="text-sm" style={{ color: 'var(--text-muted)' }}>{preview.filename} · {preview.rows.length} Zeilen</p></div>
                  <button type="button" className="flex items-center gap-2 rounded-lg bg-accent-red px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={applying || preview.invalid_rows > 0} onClick={applyImport}>
                    {applying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {applying ? 'Import läuft…' : 'Import ausführen'}
                  </button>
                </div>
                <div className="suite-table-wrap overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr><th>Zeile</th><th>Status</th>{mappedImportFields.slice(0, 6).map(field => <th key={field.key}>{field.label}</th>)}</tr></thead>
                    <tbody>
                      {preview.rows.slice(0, 25).map(row => (
                        <tr key={row.row_number}>
                          <td>{row.row_number}</td>
                          <td><span className="inline-flex items-center gap-1 font-medium">{row.status === 'invalid' ? <AlertCircle className="h-4 w-4 text-accent-red" /> : <CheckCircle2 className="h-4 w-4" />}{row.status === 'new' ? 'Neu' : row.status === 'conflict' ? 'Konflikt' : 'Fehler'}</span>{row.errors?.map(error => <div key={error} className="mt-1 max-w-xs text-xs text-accent-red">{error}</div>)}</td>
                          {mappedImportFields.slice(0, 6).map(field => {
                            const incoming = row.values[field.key] || '';
                            const current = row.existing?.[field.key] || '';
                            return (
                              <td key={field.key}>
                                {incoming || <span style={{ color: 'var(--text-muted)' }}>–</span>}
                                {row.status === 'conflict' && current !== incoming && (
                                  <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Aktuell: {current || '–'}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 25 && <p className="border-t p-3 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Die ersten 25 von {preview.rows.length} Zeilen werden angezeigt.</p>}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
