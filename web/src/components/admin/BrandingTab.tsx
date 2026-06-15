import { useState, useEffect, useCallback } from 'react';
import { brandingApi } from '../../lib/api';
import type { BrandingConfig } from '../../lib/api';
import { Upload, Trash2, Palette, Save, Building2 } from 'lucide-react';

const SERVICES = ['cores', 'rental', 'warehouse', 'planner'] as const;
const POSITIONS = ['sidebar', 'login', 'favicon'] as const;

const SERVICE_LABELS: Record<string, string> = {
  cores: 'Cores Dashboard',
  rental: 'RentalCore',
  warehouse: 'WarehouseCore',
  planner: 'PlannerCore',
};

const POSITION_LABELS: Record<string, string> = {
  sidebar: 'Sidebar',
  login: 'Login',
  favicon: 'Favicon',
};

export function BrandingTab() {
  const [cfg, setCfg] = useState<BrandingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null); // "service_position"
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await brandingApi.get();
      setCfg(res.data);
    } catch {
      setMsg({ type: 'error', text: 'Konfiguration konnte nicht geladen werden' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  // ---- Save all branding settings ----
  const saveAll = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await brandingApi.update({
        companyName: cfg.companyName,
        brandName: cfg.brandName,
        logoSizeSidebar: cfg.logoSizeSidebar,
        logoSizeLogin: cfg.logoSizeLogin,
      });
      setCfg(res.data);
      showMsg('success', 'Branding-Konfiguration gespeichert');
    } catch {
      showMsg('error', 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  // ---- Logo upload ----
  const handleUpload = async (service: string, position: string, file: File) => {
    const key = `${service}_${position}`;
    setUploading(key);
    try {
      await brandingApi.uploadLogo(service, position, file);
      await fetchConfig(); // refresh
      showMsg('success', `Logo "${SERVICE_LABELS[service]} / ${POSITION_LABELS[position]}" hochgeladen`);
    } catch {
      showMsg('error', 'Upload fehlgeschlagen (max. 2 MB, PNG/JPG/SVG)');
    } finally {
      setUploading(null);
    }
  };

  // ---- Logo delete ----
  const handleDelete = async (service: string, position: string) => {
    if (!confirm(`Logo "${SERVICE_LABELS[service]} / ${POSITION_LABELS[position]}" wirklich löschen?`)) return;
    try {
      await brandingApi.deleteLogo(service, position);
      await fetchConfig();
      showMsg('success', 'Logo gelöscht');
    } catch {
      showMsg('error', 'Löschen fehlgeschlagen');
    }
  };

  // ---- Helpers ----
  const logoPath = (service: string, position: string): string | null => {
    if (!cfg) return null;
    const cfgAny = cfg as unknown as Record<string, unknown>;
    if (position === 'favicon') {
      return (cfgAny[`favicon${service.charAt(0).toUpperCase() + service.slice(1)}`] as string) || (cfgAny['faviconPath'] as string) || null;
    }
    const key = `logo${service.charAt(0).toUpperCase() + service.slice(1)}${position.charAt(0).toUpperCase() + position.slice(1)}`;
    return (cfgAny[key] as string) || null;
  };

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Lade Branding-Konfiguration…</div>;
  }
  if (!cfg) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-error)' }}>Fehler beim Laden der Konfiguration.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Status message */}
      {msg && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          msg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Section 1: Company Information */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Firmen-Informationen</h3>
        </div>
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Firmenname</label>
              <input
                type="text"
                value={cfg.companyName}
                onChange={e => setCfg({ ...cfg, companyName: e.target.value })}
                placeholder="z.B. Tsunami Events GmbH"
                className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Brand-Name (Kurzform)</label>
              <input
                type="text"
                value={cfg.brandName}
                onChange={e => setCfg({ ...cfg, brandName: e.target.value })}
                placeholder="z.B. Tsunami Events"
                className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2"
                style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Logo Upload Table */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5" style={{ color: 'var(--accent-green)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Logos pro Service</h3>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Service</th>
                {POSITIONS.map(pos => (
                  <th key={pos} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {POSITION_LABELS[pos]} Logo
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICES.map(svc => (
                <tr key={svc} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {SERVICE_LABELS[svc]}
                  </td>
                  {POSITIONS.map(pos => {
                    const path = logoPath(svc, pos);
                    const key = `${svc}_${pos}`;
                    return (
                      <td key={pos} className="px-4 py-3">
                        <LogoTile
                          service={svc}
                          position={pos}
                          logoPath={path}
                          isUploading={uploading === key}
                          onUpload={handleUpload}
                          onDelete={handleDelete}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {SERVICES.map(svc => (
            <div key={svc} className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{SERVICE_LABELS[svc]}</p>
              <div className="grid grid-cols-3 gap-3">
                {POSITIONS.map(pos => {
                  const path = logoPath(svc, pos);
                  const key = `${svc}_${pos}`;
                  return (
                    <div key={pos}>
                      <p className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{POSITION_LABELS[pos]}</p>
                      <LogoTile
                        service={svc}
                        position={pos}
                        logoPath={path}
                        isUploading={uploading === key}
                        onUpload={handleUpload}
                        onDelete={handleDelete}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3: Logo Size Sliders */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5" style={{ color: 'var(--accent-purple, #a78bfa)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Logo-Größen</h3>
        </div>
        <div className="rounded-xl p-5 space-y-6" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          {/* Sidebar size */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Sidebar Logo-Größe</label>
              <span className="text-sm font-mono font-bold" style={{ color: 'var(--accent-blue)' }}>{cfg.logoSizeSidebar}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={cfg.logoSizeSidebar}
              onChange={e => setCfg({ ...cfg, logoSizeSidebar: parseInt(e.target.value) || 100 })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: 'var(--border-subtle)' }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              <span>50% (klein)</span>
              <span>100% (normal)</span>
              <span>200% (groß)</span>
            </div>
          </div>

        </div>
      </section>

      {/* Section 4: Live Preview */}
      <section>
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Vorschau</h3>
        <div className="rounded-xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Firmenname: <strong style={{ color: 'var(--text-primary)' }}>{cfg.companyName || '(nicht gesetzt)'}</strong>
          </p>

          {/* Sidebar preview */}
          <div className="rounded-lg p-4 mb-4 flex items-center gap-3" style={{ background: 'var(--sidebar-bg, #0f172a)' }}>
            {logoPath('cores', 'sidebar') ? (
              <img
                src={logoPath('cores', 'sidebar')!}
                alt="Sidebar Logo"
                style={{ height: `${cfg.logoSizeSidebar}%`, maxHeight: '6rem' }}
              />
            ) : (
              <div className="text-sm px-3 py-2 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                Logo Sidebar (Cores)
              </div>
            )}
          </div>

          {/* Login preview */}
          <div className="rounded-lg p-6 text-center" style={{ background: '#0a0a0a' }}>
            <div className="flex flex-col items-center gap-2">
              {logoPath('cores', 'login') ? (
                <img
                  src={logoPath('cores', 'login')!}
                  alt="Login Logo"
                  style={{ height: `${cfg.logoSizeLogin}%`, maxHeight: '10rem' }}
                />
              ) : (
                <div className="text-sm px-4 py-3 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                  Logo Login (Cores)
                </div>
              )}
              <p style={{ color: 'var(--text-secondary)' }}>{cfg.companyName || 'Firmenname'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Global save button */}
      <div className="sticky bottom-0 py-4 flex justify-end" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={saveAll}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg"
          style={{ background: 'var(--accent-blue)', color: '#fff' }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Speichere…' : 'Alle Änderungen speichern'}
        </button>
      </div>
    </div>
  );
}

// ---- Sub-component: Logo Tile (upload/delete/preview) ----

function LogoTile({
  service,
  position,
  logoPath: currentPath,
  isUploading,
  onUpload,
  onDelete,
}: {
  service: string;
  position: string;
  logoPath: string | null;
  isUploading: boolean;
  onUpload: (service: string, position: string, file: File) => void;
  onDelete: (service: string, position: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Preview */}
      {currentPath ? (
        <img
          src={currentPath + '?t=' + Date.now()}
          alt={`${service} ${position}`}
          className="h-10 max-w-[100px] object-contain rounded"
          style={{ background: 'var(--surface-1)' }}
        />
      ) : (
        <div
          className="h-10 w-16 rounded flex items-center justify-center text-xs"
          style={{ background: 'var(--surface-1)', color: 'var(--text-tertiary)', border: '1px dashed var(--border-subtle)' }}
        >
          {isUploading ? '…' : '—'}
        </div>
      )}

      {/* Upload button */}
      <label className="cursor-pointer p-1.5 rounded-lg transition-colors hover:bg-white/5" title="Logo hochladen">
        <Upload className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onUpload(service, position, file);
            e.target.value = '';
          }}
        />
      </label>

      {/* Delete button */}
      {currentPath && (
        <button
          onClick={() => onDelete(service, position)}
          className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
          title="Logo löschen"
        >
          <Trash2 className="w-4 h-4" style={{ color: 'var(--text-error, #ef4444)' }} />
        </button>
      )}
    </div>
  );
}
