import { useEffect, useState } from 'react';
import { Users, Plus, Edit2, Trash2, Save, X, Key, Shield, Cloud, Lock, Briefcase, Building2 } from 'lucide-react';
import { api } from '../../lib/api';

interface AppUser {
  userID: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  forcePasswordChange: boolean;
  identitySource: 'local' | 'microsoft';
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  lastSyncedAt?: string;
}

interface UserForm {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  forcePasswordChange: boolean;
}

const emptyForm: UserForm = {
  username: '', email: '', password: '', firstName: '', lastName: '', displayName: '',
  isAdmin: false, isActive: true, forcePasswordChange: true,
};

export function UsersTab() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [userMode, setUserMode] = useState<'local' | 'microsoft' | 'hybrid'>('local');

  const load = async () => {
    setLoading(true);
    try {
      const [usersResponse, settingsResponse] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/microsoft/settings'),
      ]);
      const data = usersResponse.data as { users?: AppUser[] } | AppUser[];
      setUsers(Array.isArray(data) ? data : data.users ?? []);
      setUserMode(settingsResponse.data.userMode ?? 'local');
    } catch {
      setMessage('Benutzer konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startNew = () => { setEditing('new'); setForm(emptyForm); setMessage(''); };
  const startEdit = (u: AppUser) => {
    if (u.identitySource === 'microsoft') return;
    setEditing(u.userID);
    setForm({
      username: u.username, email: u.email, password: '', firstName: u.firstName ?? '',
      lastName: u.lastName ?? '', displayName: u.displayName ?? '', isAdmin: u.isAdmin,
      isActive: u.isActive, forcePasswordChange: u.forcePasswordChange,
    });
    setMessage('');
  };

  const cancel = () => { setEditing(null); setMessage(''); };
  const save = async () => {
    if (!form.username || !form.email || !form.displayName) {
      setMessage('Anzeigename, Benutzername und E-Mail sind Pflichtfelder.');
      return;
    }
    if (editing === 'new' && !form.password) {
      setMessage('Passwort ist bei neuen Benutzern erforderlich.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (editing === 'new') await api.post('/admin/users', form);
      else await api.put(`/admin/users/${editing}`, form);
      await load();
      setEditing(null);
      setMessage('Gespeichert.');
    } catch (e: any) {
      setMessage(e?.response?.data?.error ?? 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: AppUser) => {
    if (u.identitySource === 'microsoft') return;
    if (!confirm(`Benutzer „${u.displayName}“ wirklich löschen?`)) return;
    try {
      await api.delete(`/admin/users/${u.userID}`);
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.error ?? 'Löschen fehlgeschlagen.');
    }
  };

  const toggleMicrosoftAdmin = async (u: AppUser) => {
    const next = !u.isAdmin;
    if (!confirm(`${u.displayName} ${next ? 'Cores-Administratorrechte geben' : 'Cores-Administratorrechte entziehen'}?`)) return;
    try {
      await api.put(`/admin/users/${u.userID}/access`, { isAdmin: next });
      await load();
      setMessage('Cores-Zugriffsrechte aktualisiert. Weitere Rollen können unter „Rollen“ gepflegt werden.');
    } catch (e: any) {
      setMessage(e?.response?.data?.error ?? 'Rechte konnten nicht aktualisiert werden.');
    }
  };

  const field = (label: string, child: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</label>
      {child}
    </div>
  );
  const input = (key: keyof UserForm, placeholder?: string, type = 'text') => (
    <input type={type} placeholder={placeholder} value={form[key] as string}
      onChange={e => setForm({ ...form, [key]: e.target.value })}
      className="w-full px-3 py-2 rounded-lg glass text-white text-sm" />
  );
  const toggle = (key: keyof UserForm, label: string) => (
    <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
      <input type="checkbox" checked={form[key] as boolean}
        onChange={e => setForm({ ...form, [key]: e.target.checked })}
        className="w-4 h-4 rounded border-white/20 bg-white/10 text-accent-red" />
      {label}
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-red" />
            <h2 className="text-white font-semibold text-lg">Benutzerverwaltung</h2>
          </div>
          <p className="text-gray-500 text-xs mt-1">
            {userMode === 'hybrid' ? 'Lokale und synchronisierte Microsoft-Benutzer' : userMode === 'microsoft' ? 'Benutzer werden aus Microsoft Entra synchronisiert' : 'Lokale Cores-Benutzer'}
          </p>
        </div>
        {userMode !== 'microsoft' && (
          <button onClick={startNew} className="px-3 py-2 bg-accent-red text-white rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90">
            <Plus className="w-4 h-4" /> Neuer Benutzer
          </button>
        )}
      </div>

      {message && <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${message.toLowerCase().includes('fehl') || message.toLowerCase().includes('nicht') ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>{message}</div>}

      {editing && (
        <div className="glass rounded-xl p-5 space-y-4 border-2 border-accent-red">
          <h3 className="text-white font-semibold">{editing === 'new' ? 'Neuer lokaler Benutzer' : 'Lokalen Benutzer bearbeiten'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('Anzeigename *', input('displayName', 'Max Mustermann'))}
            {field('Benutzername *', input('username', 'mmustermann'))}
            {field('E-Mail *', input('email', 'email@example.com', 'email'))}
            {field('Vorname', input('firstName', 'Max'))}
            {field('Nachname', input('lastName', 'Mustermann'))}
            {field(editing === 'new' ? 'Passwort *' : 'Neues Passwort (leer = unverändert)', input('password', '••••••••', 'password'))}
          </div>
          <div className="flex flex-wrap gap-5 pt-1">
            {toggle('isActive', 'Aktiv')}{toggle('isAdmin', 'Administrator')}{toggle('forcePasswordChange', 'Passwortänderung erzwingen')}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold">
              <Save className="w-4 h-4" />{saving ? 'Speichert...' : 'Speichern'}
            </button>
            <button onClick={cancel} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-semibold">
              <X className="w-4 h-4" />Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="text-gray-400 text-sm">Lade Benutzer...</div> : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.userID} className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-base font-semibold">{u.displayName || u.username}</p>
                  {u.identitySource === 'microsoft' && <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300"><Cloud className="w-3 h-3" />Microsoft</span>}
                  {u.isAdmin && <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400"><Shield className="w-3 h-3" />Admin</span>}
                  {u.forcePasswordChange && u.identitySource === 'local' && <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400"><Key className="w-3 h-3" />PW ändern</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{u.isActive ? 'Aktiv' : 'Inaktiv'}</span>
                </div>
                <p className="text-gray-400 text-sm mt-0.5">{u.email}</p>
                <p className="text-gray-600 text-xs">@{u.username}</p>
                {(u.jobTitle || u.department) && <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                  {u.jobTitle && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{u.jobTitle}</span>}
                  {u.department && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{u.department}</span>}
                </div>}
              </div>
              <div className="flex gap-1 ml-3 flex-shrink-0">
                {u.identitySource === 'local' ? <>
                  <button onClick={() => startEdit(u)} title="Benutzer bearbeiten" className="p-2 hover:bg-white/10 rounded-lg text-blue-400 transition-colors"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => remove(u)} title="Benutzer löschen" className="p-2 hover:bg-white/10 rounded-lg text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </> : <>
                  <button onClick={() => toggleMicrosoftAdmin(u)} title={u.isAdmin ? 'Cores-Administratorrecht entziehen' : 'Cores-Administratorrecht geben'} className={`p-2 hover:bg-white/10 rounded-lg transition-colors ${u.isAdmin ? 'text-yellow-400' : 'text-blue-400'}`}><Shield className="w-4 h-4" /></button>
                  <span title="Microsoft-Stammdaten sind schreibgeschützt. Weitere Cores-Rollen bleiben im Bereich Rollen änderbar." className="p-2 text-gray-500"><Lock className="w-4 h-4" /></span>
                </>}
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="text-gray-500 text-sm">Keine Benutzer gefunden.</p>}
        </div>
      )}
    </div>
  );
}
