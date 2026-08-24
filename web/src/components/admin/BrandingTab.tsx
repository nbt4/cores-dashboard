import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Building2, Image, Info, Save, Trash2, Upload } from 'lucide-react';
import { brandingApi } from '../../lib/api';
import type { BrandingAssetSet, BrandingConfig } from '../../lib/api';

const SERVICES = ['cores', 'rental', 'warehouse', 'planner', 'procurement'] as const;
type ServiceId = typeof SERVICES[number] | 'company';
type AssetPosition =
  | 'mark-on-dark' | 'mark-on-light'
  | 'horizontal-on-dark' | 'horizontal-on-light'
  | 'stacked-on-dark' | 'stacked-on-light'
  | 'favicon' | 'app-icon' | 'maskable-icon' | 'print';

const SERVICE_LABELS: Record<ServiceId, string> = {
  cores: 'Cores Dashboard', rental: 'RentalCore', warehouse: 'WarehouseCore',
  planner: 'PlannerCore', procurement: 'ProcurementCore', company: 'Unternehmensmarke',
};

const PRODUCT_ASSETS: Array<{ position: AssetPosition; label: string; help: string }> = [
  { position: 'mark-on-dark', label: 'Symbol · dunkel', help: 'Eingeklappte Sidebar auf dunklem Grund' },
  { position: 'mark-on-light', label: 'Symbol · hell', help: 'Kleine Darstellung auf hellem Grund' },
  { position: 'horizontal-on-dark', label: 'Horizontal · dunkel', help: 'Erweiterte Sidebar und App-Header' },
  { position: 'horizontal-on-light', label: 'Horizontal · hell', help: 'Helle Flächen und Dokumentation' },
  { position: 'stacked-on-dark', label: 'Gestapelt · dunkel', help: 'Login und Splashscreen' },
  { position: 'stacked-on-light', label: 'Gestapelt · hell', help: 'Präsentationen und helle Landingpages' },
  { position: 'favicon', label: 'Favicon', help: 'Quadratisch, SVG oder transparentes PNG' },
  { position: 'app-icon', label: 'App-Icon', help: 'Quadratisches PWA-/Apple-Icon' },
  { position: 'maskable-icon', label: 'Maskable Icon', help: 'Motiv innerhalb der zentralen 60 %' },
];

const COMPANY_ASSETS: Array<{ position: AssetPosition; label: string; help: string }> = [
  { position: 'horizontal-on-dark', label: 'Firma · dunkel', help: 'Absender auf dunklen digitalen Flächen' },
  { position: 'horizontal-on-light', label: 'Firma · hell', help: 'Rechnungen, Angebote und E-Mails' },
  { position: 'print', label: 'Firma · Druck', help: 'Monochrom für Etiketten und Thermodruck' },
];

const assetKey: Record<AssetPosition, keyof BrandingAssetSet> = {
  'mark-on-dark': 'markOnDark', 'mark-on-light': 'markOnLight',
  'horizontal-on-dark': 'horizontalOnDark', 'horizontal-on-light': 'horizontalOnLight',
  'stacked-on-dark': 'stackedOnDark', 'stacked-on-light': 'stackedOnLight',
  favicon: 'favicon', 'app-icon': 'appIcon', 'maskable-icon': 'maskableIcon', print: 'print',
};

function legacyPath(cfg: BrandingConfig, service: ServiceId, position: AssetPosition): string | null {
  if (service === 'company') return null;
  const name = service.charAt(0).toUpperCase() + service.slice(1);
  const raw = cfg as unknown as Record<string, string | null>;
  if (position === 'horizontal-on-dark') return raw[`logo${name}Sidebar`] || null;
  if (position === 'stacked-on-dark') return raw[`logo${name}Login`] || null;
  if (position === 'favicon') return raw[`favicon${name}`] || cfg.faviconPath || null;
  return null;
}

function getAsset(cfg: BrandingConfig, service: ServiceId, position: AssetPosition): string | null {
  return cfg.assets?.[service]?.[assetKey[position]] || legacyPath(cfg, service, position);
}

export function BrandingTab() {
  const [cfg, setCfg] = useState<BrandingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await brandingApi.get();
      setCfg(response.data);
    } catch {
      setMessage({ type: 'error', text: 'Branding-Konfiguration konnte nicht geladen werden.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);

  const notify = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const saveIdentity = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const response = await brandingApi.update({ companyName: cfg.companyName, brandName: cfg.brandName });
      setCfg(response.data);
      notify('success', 'Markenidentität gespeichert.');
    } catch {
      notify('error', 'Markenidentität konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (service: ServiceId, position: AssetPosition, file: File) => {
    const key = `${service}:${position}`;
    setUploading(key);
    try {
      await brandingApi.uploadLogo(service, position, file);
      await fetchConfig();
      notify('success', `${SERVICE_LABELS[service]} aktualisiert.`);
    } catch {
      notify('error', 'Upload abgelehnt. Bitte Dateityp, Bildinhalt und Seitenverhältnis prüfen.');
    } finally {
      setUploading(null);
    }
  };

  const remove = async (service: ServiceId, position: AssetPosition) => {
    if (!window.confirm(`${SERVICE_LABELS[service]}: „${position}“ wirklich auf den Standard zurücksetzen?`)) return;
    try {
      await brandingApi.deleteLogo(service, position);
      await fetchConfig();
      notify('success', 'Individuelles Asset entfernt; der integrierte Standard wird verwendet.');
    } catch {
      notify('error', 'Asset konnte nicht entfernt werden.');
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Lade Branding…</div>;
  if (!cfg) return <div className="p-8 text-center" style={{ color: 'var(--text-error)' }}>Branding ist nicht verfügbar.</div>;

  return (
    <div className="space-y-8">
      {message && <div className="rounded-lg border p-3 text-sm" style={{
        color: message.type === 'success' ? 'var(--accent-green)' : 'var(--text-error)',
        borderColor: message.type === 'success' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)',
        background: message.type === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
      }}>{message.text}</div>}

      <section>
        <SectionTitle icon={<Building2 className="h-5 w-5" />} title="Markenidentität" />
        <div className="grid grid-cols-1 gap-4 rounded-xl p-5 md:grid-cols-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <Field label="Rechtlicher Firmenname" value={cfg.companyName} placeholder="Tsunami Events UG" onChange={companyName => setCfg({ ...cfg, companyName })} />
          <Field label="Kurzmarke / Absender" value={cfg.brandName} placeholder="Tsunami Events" onChange={brandName => setCfg({ ...cfg, brandName })} />
          <div className="flex justify-end md:col-span-2">
            <button onClick={saveIdentity} disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent-blue)', color: '#fff' }}>
              <Save className="h-4 w-4" />{saving ? 'Speichere…' : 'Identität speichern'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle icon={<Image className="h-5 w-5" />} title="Unternehmensmarke" />
        <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Diese Logos erscheinen auf Rechnungen, Angeboten, E-Mails und Etiketten. Produktlogos bleiben davon getrennt.</p>
        <AssetGrid cfg={cfg} service="company" definitions={COMPANY_ASSETS} uploading={uploading} onUpload={upload} onDelete={remove} />
      </section>

      <section>
        <SectionTitle icon={<Image className="h-5 w-5" />} title="Produktmarken" />
        <div className="space-y-5">
          {SERVICES.map(service => <div key={service} className="rounded-xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
            <h4 className="mb-4 font-semibold" style={{ color: 'var(--text-primary)' }}>{SERVICE_LABELS[service]}</h4>
            <AssetGrid cfg={cfg} service={service} definitions={PRODUCT_ASSETS} uploading={uploading} onUpload={upload} onDelete={remove} />
          </div>)}
        </div>
      </section>

      <section className="rounded-xl p-5" style={{ background: 'rgba(var(--accent-blue-rgb), .06)', border: '1px solid rgba(var(--accent-blue-rgb), .2)' }}>
        <div className="flex gap-3"><Info className="mt-0.5 h-5 w-5 flex-none" style={{ color: 'var(--accent-blue)' }} /><div className="text-sm" style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Einsatzregel:</strong> Symbol für Favicons und kompakte Navigation, horizontales Logo für Sidebars und Header, gestapeltes Logo für Login und Splash. „Dunkel“ bezeichnet den Hintergrund, nicht die Logofarbe.</div></div>
      </section>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="mb-4 flex items-center gap-2" style={{ color: 'var(--accent-blue)' }}>{icon}<h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3></div>;
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span><input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }} /></label>;
}

function AssetGrid({ cfg, service, definitions, uploading, onUpload, onDelete }: {
  cfg: BrandingConfig;
  service: ServiceId;
  definitions: Array<{ position: AssetPosition; label: string; help: string }>;
  uploading: string | null;
  onUpload: (service: ServiceId, position: AssetPosition, file: File) => void;
  onDelete: (service: ServiceId, position: AssetPosition) => void;
}) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{definitions.map(definition => {
    const path = getAsset(cfg, service, definition.position);
    const onLight = definition.position.endsWith('on-light') || definition.position === 'print';
    const compact = definition.position.includes('mark') || definition.position.includes('icon') || definition.position === 'favicon';
    return <div key={definition.position} className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
      <div className="flex h-28 items-center justify-center p-4" style={{ background: onLight ? '#f4f4f2' : '#0b0b0b' }}>
        {path ? <img src={`${path}${path.includes('?') ? '&' : '?'}preview=${cfg.updatedAt}`} alt={definition.label} className={compact ? 'h-16 w-16 object-contain' : 'max-h-20 max-w-full object-contain'} /> : <span className="text-xs" style={{ color: onLight ? '#737373' : 'var(--text-tertiary)' }}>Integrierter Standard</span>}
      </div>
      <div className="flex items-center gap-2 p-3" style={{ background: 'var(--surface-1)' }}>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{definition.label}</p><p className="truncate text-xs" title={definition.help} style={{ color: 'var(--text-tertiary)' }}>{definition.help}</p></div>
        <label className="cursor-pointer rounded-lg p-2 hover:bg-white/5" title="Asset hochladen"><Upload className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} /><input type="file" className="hidden" accept={definition.position === 'print' ? 'image/png,image/jpeg,image/svg+xml' : 'image/png,image/svg+xml'} disabled={uploading === `${service}:${definition.position}`} onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(service, definition.position, file); event.target.value = ''; }} /></label>
        {path && <button className="rounded-lg p-2 hover:bg-red-500/10" title="Individuelles Asset entfernen" onClick={() => onDelete(service, definition.position)}><Trash2 className="h-4 w-4" style={{ color: 'var(--text-error)' }} /></button>}
      </div>
    </div>;
  })}</div>;
}
