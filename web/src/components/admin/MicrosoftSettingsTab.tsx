import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Cloud, RefreshCw, Save, X } from 'lucide-react';
import { api } from '../../lib/api';

type UserMode = 'local' | 'microsoft' | 'hybrid';

interface MicrosoftSettings {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailboxId: string;
  syncInterval: string;
  calendarMailbox: string;
  appBaseUrl: string;
  userMode: UserMode;
  userSyncEnabled: boolean;
  userGroupId: string;
  userSyncIntervalMinutes: number;
  disableRemovedUsers: boolean;
  microsoftLoginEnabled: boolean;
  lastUserSyncAt?: string;
  lastUserSyncStatus?: string;
  lastUserSyncError?: string;
  lastUserSyncCount?: number;
}

const defaults: MicrosoftSettings = {
  tenantId: '', clientId: '', clientSecret: '', mailboxId: '', syncInterval: '5m',
  calendarMailbox: '', appBaseUrl: '', userMode: 'local', userSyncEnabled: false,
  userGroupId: '', userSyncIntervalMinutes: 60, disableRemovedUsers: true,
  microsoftLoginEnabled: false,
};

const modes: { value: UserMode; title: string; description: string }[] = [
  { value: 'local', title: 'Lokal', description: 'Benutzer und Passwörter werden nur in Cores gepflegt.' },
  { value: 'microsoft', title: 'Microsoft', description: 'Benutzer kommen ausschließlich aus der ausgewählten Entra-Gruppe.' },
  { value: 'hybrid', title: 'Hybrid', description: 'Lokale und synchronisierte Microsoft-Benutzer können parallel verwendet werden.' },
];

export function MicrosoftSettingsTab() {
  const [settings, setSettings] = useState<MicrosoftSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | 'sync' | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = async () => {
    try {
      const response = await api.get<MicrosoftSettings>('/admin/microsoft/settings');
      setSettings({ ...defaults, ...response.data });
    } catch {
      setMessage({ text: 'Microsoft-Konfiguration konnte nicht geladen werden.', error: true });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setBusy('save'); setMessage(null);
    try {
      const response = await api.put<MicrosoftSettings>('/admin/microsoft/settings', settings);
      setSettings(response.data);
      setMessage({ text: 'Microsoft-Konfiguration gespeichert.' });
    } catch (e: any) {
      setMessage({ text: e?.response?.data?.error ?? 'Speichern fehlgeschlagen.', error: true });
    } finally { setBusy(null); }
  };

  const test = async () => {
    setBusy('test'); setMessage(null);
    try {
      const response = await api.post<{ usersFound: number }>('/admin/microsoft/test');
      setMessage({ text: `Verbindung erfolgreich. ${response.data.usersFound} Gruppenmitglieder gefunden.` });
    } catch (e: any) {
      setMessage({ text: e?.response?.data?.error ?? 'Verbindungstest fehlgeschlagen.', error: true });
    } finally { setBusy(null); }
  };

  const sync = async () => {
    setBusy('sync'); setMessage(null);
    try {
      const response = await api.post<{ imported: number; updated: number; disabled: number; skipped: number }>('/admin/microsoft/sync');
      const r = response.data;
      setMessage({ text: `Synchronisiert: ${r.imported} neu, ${r.updated} aktualisiert, ${r.disabled} deaktiviert, ${r.skipped} übersprungen.` });
      await load();
    } catch (e: any) {
      setMessage({ text: e?.response?.data?.error ?? 'Synchronisation fehlgeschlagen.', error: true });
    } finally { setBusy(null); }
  };

  const update = <K extends keyof MicrosoftSettings>(key: K, value: MicrosoftSettings[K]) => setSettings(current => ({ ...current, [key]: value }));
  const field = (label: string, key: keyof MicrosoftSettings, placeholder = '', type: 'text' | 'password' | 'number' | 'url' = 'text') => (
    <label className="flex flex-col gap-1">
      <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
      <input type={type} value={(settings[key] as string | number) ?? ''} placeholder={placeholder}
        onChange={event => update(key, (type === 'number' ? Number(event.target.value) : event.target.value) as never)}
        className="w-full px-3 py-2 rounded-lg glass text-white text-sm" />
    </label>
  );

  if (loading) return <p className="text-gray-400 text-sm">Lade Microsoft-Konfiguration…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Cloud className="w-6 h-6 text-blue-400 mt-0.5" />
          <div><h2 className="text-xl font-bold text-white">Microsoft 365 & Entra</h2><p className="text-gray-400 text-sm">Eine App-Registrierung für Anmeldung, Benutzer, Kontakte und Kalender</p></div>
        </div>
        <button onClick={() => setHelpOpen(true)} title="Einrichtungshilfe" className="p-2 rounded-lg text-blue-300 hover:bg-blue-500/10"><CircleHelp className="w-5 h-5" /></button>
      </div>

      {message && <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${message.error ? 'bg-red-500/15 text-red-300' : 'bg-green-500/15 text-green-300'}`}>
        {message.error ? <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}{message.text}
      </div>}

      <section className="space-y-3">
        <h3 className="text-white font-semibold">Benutzerquelle</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {modes.map(mode => <button key={mode.value} onClick={() => update('userMode', mode.value)}
            className={`text-left p-4 rounded-xl border transition-colors ${settings.userMode === mode.value ? 'border-blue-400 bg-blue-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}>
            <span className="text-white font-semibold">{mode.title}</span><p className="text-gray-400 text-xs mt-1 leading-relaxed">{mode.description}</p>
          </button>)}
        </div>
        {settings.userMode === 'microsoft' && <p className="text-xs text-orange-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />Vor dem Umschalten zuerst im Hybridmodus synchronisieren, dem eigenen Microsoft-Benutzer die nötigen Cores-Rollen geben und die Microsoft-Anmeldung testen. So bleibt der Adminzugang erhalten.</p>}
      </section>

      <section className="glass rounded-xl p-5 space-y-4">
        <div><h3 className="text-white font-semibold">App-Registrierung</h3><p className="text-gray-500 text-xs mt-1">Das Client-Secret-Feld leer bzw. maskiert lassen, um den gespeicherten Wert beizubehalten.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field('Tenant-ID', 'tenantId', '00000000-0000-0000-0000-000000000000')}
          {field('Client-ID (Anwendungs-ID)', 'clientId', '00000000-0000-0000-0000-000000000000')}
          {field('Client-Secret-Wert', 'clientSecret', '••••••••', 'password')}
          {field('Öffentliche Cores-URL', 'appBaseUrl', 'https://cores.example.com', 'url')}
        </div>
      </section>

      <section className="glass rounded-xl p-5 space-y-4">
        <div><h3 className="text-white font-semibold">Entra-Benutzersynchronisation</h3><p className="text-gray-500 text-xs mt-1">Nur Benutzer dieser Gruppe werden Cores-weit verfügbar.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field('Gruppen-Objekt-ID', 'userGroupId', '00000000-0000-0000-0000-000000000000')}
          {field('Intervall (Minuten)', 'userSyncIntervalMinutes', '60', 'number')}
        </div>
        <div className="flex flex-col sm:flex-row gap-4 text-sm text-gray-300">
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.userSyncEnabled} onChange={e => update('userSyncEnabled', e.target.checked)} />Synchronisation aktiv</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.microsoftLoginEnabled} onChange={e => update('microsoftLoginEnabled', e.target.checked)} />Microsoft-Anmeldung aktiv</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.disableRemovedUsers} onChange={e => update('disableRemovedUsers', e.target.checked)} />Entfernte Gruppenmitglieder deaktivieren</label>
        </div>
        {settings.lastUserSyncAt && <p className="text-xs text-gray-500">Letzter Lauf: {new Date(settings.lastUserSyncAt).toLocaleString('de-DE')} · Status: {settings.lastUserSyncStatus} · {settings.lastUserSyncCount ?? 0} Benutzer</p>}
        {settings.lastUserSyncError && <p className="text-xs text-orange-300 break-words">{settings.lastUserSyncError}</p>}
      </section>

      <section className="glass rounded-xl p-5 space-y-4">
        <div><h3 className="text-white font-semibold">RentalCore: Kontakte & Kalender</h3><p className="text-gray-500 text-xs mt-1">Diese Felder verwenden dieselbe App-Registrierung.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field('Shared-Mailbox-ID / E-Mail', 'mailboxId', 'kontakte@example.com')}
          {field('Kalender-Mailbox', 'calendarMailbox', 'events@example.com')}
          {field('Kontakt-Sync-Intervall', 'syncInterval', '5m')}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy !== null} className="px-4 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{busy === 'save' ? 'Speichert…' : 'Speichern'}</button>
        <button onClick={test} disabled={busy !== null} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"><CheckCircle2 className="w-4 h-4" />{busy === 'test' ? 'Prüft…' : 'Verbindung testen'}</button>
        <button onClick={sync} disabled={busy !== null || settings.userMode === 'local' || !settings.userSyncEnabled} className="px-4 py-2 bg-white/10 text-white rounded-lg flex items-center gap-2 disabled:opacity-40"><RefreshCw className={`w-4 h-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />Jetzt synchronisieren</button>
      </div>

      {helpOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setHelpOpen(false)}>
        <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 bg-dark-100 border border-white/10" onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-white text-lg font-bold">Microsoft-App einrichten</h3><p className="text-gray-400 text-sm">Microsoft Entra Admin Center → App-Registrierungen → Neue Registrierung</p></div><button onClick={() => setHelpOpen(false)} className="p-1 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button></div>
          <div className="mt-5 space-y-5 text-sm text-gray-300 leading-relaxed">
            <div><h4 className="text-white font-semibold mb-1">Benötigte Werte</h4><ul className="list-disc pl-5 space-y-1"><li>Verzeichnis-/Tenant-ID</li><li>Anwendungs-/Client-ID</li><li><strong>Wert</strong> eines Client-Secrets (nicht die Secret-ID)</li><li>Objekt-ID der erlaubten Entra-Gruppe</li><li>Öffentliche Cores-Basis-URL</li></ul></div>
            <div><h4 className="text-white font-semibold mb-1">Authentifizierung</h4><p>Als Plattform „Web“ hinzufügen. Redirect-URI exakt: <code className="text-blue-300 break-all">{(settings.appBaseUrl || 'https://cores.example.com').replace(/\/$/, '')}/api/v1/auth/microsoft/callback</code></p></div>
            <div><h4 className="text-white font-semibold mb-1">Microsoft Graph – Anwendung</h4><ul className="list-disc pl-5 space-y-1"><li><code>User.Read.All</code> – vollständige Benutzerprofile lesen</li><li><code>GroupMember.Read.All</code> – Mitglieder der gewählten Gruppe lesen</li><li><code>Contacts.ReadWrite</code> – RentalCore-Shared-Mailbox-Kontakte (falls genutzt)</li><li><code>Calendars.ReadWrite</code> – RentalCore-Benutzerkalender (falls genutzt)</li></ul><p className="text-orange-300 mt-2">Für diese Anwendungsrechte ist die Administratorzustimmung erforderlich.</p></div>
            <div><h4 className="text-white font-semibold mb-1">Microsoft Graph – Delegiert</h4><ul className="list-disc pl-5 space-y-1"><li><code>User.Read</code> für die Microsoft-Anmeldung</li><li>OIDC-Scopes <code>openid</code>, <code>profile</code> und <code>email</code> werden beim Login angefordert</li></ul></div>
            <div><h4 className="text-white font-semibold mb-1">Optional: Exchange/GAL</h4><p>Nur für die vorhandene RentalCore-GAL-Verwaltung: Office 365 Exchange Online <code>Exchange.ManageAsAppV2</code> (bzw. im älteren Portal <code>Exchange.ManageAsApp</code>) und eine passende Exchange-RBAC-Zuweisung. Für Least Privilege einen eingeschränkten Exchange-Rollenbereich statt Global Admin verwenden.</p></div>
            <p className="text-gray-500 text-xs">Nach dem Speichern zuerst „Verbindung testen“, dann „Jetzt synchronisieren“. Microsoft-Stammdaten bleiben in Cores schreibgeschützt; Cores-Rollen werden weiterhin unter „Rollen“ gepflegt.</p>
          </div>
        </div>
      </div>}
    </div>
  );
}
