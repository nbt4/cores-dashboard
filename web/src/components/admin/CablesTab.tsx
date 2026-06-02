import { useState, useEffect } from 'react';
import { Cable, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { warehouseApi as api } from '../../lib/api';

interface CableType {
  cable_type_id: number;
  name: string;
  count: number;
}

interface CableConnector {
  connector_id: number;
  name: string;
  abbreviation: string | null;
  gender: string | null;
}

type View = 'types' | 'connectors';

function CableTypesSection() {
  const [items, setItems] = useState<CableType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CableType[]>('/admin/cable-types');
      setItems(data || []);
    } catch { setMsg('Laden fehlgeschlagen.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!name.trim()) { setMsg('Name ist erforderlich.'); return; }
    setSaving(true); setMsg('');
    try {
      if (editing === 'new') await api.post('/admin/cable-types', { name });
      else await api.put(`/admin/cable-types/${editing}`, { name });
      await load();
      setEditing(null); setName('');
    } catch (e: any) { setMsg(e?.response?.data?.error ?? 'Speichern fehlgeschlagen.'); }
    finally { setSaving(false); }
  };

  const remove = async (item: CableType) => {
    if (!confirm(`Kabel-Typ "${item.name}" löschen?`)) return;
    try {
      await api.delete(`/admin/cable-types/${item.cable_type_id}`);
      await load();
    } catch (e: any) { setMsg(e?.response?.data?.error ?? 'Löschen fehlgeschlagen.'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Kabel-Typen</h3>
        <button onClick={() => { setEditing('new'); setName(''); setMsg(''); }}
          className="px-3 py-1.5 bg-accent-red text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 hover:opacity-90">
          <Plus className="w-3.5 h-3.5" /> Neu
        </button>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm font-semibold ${msg.includes('fehlgeschlagen') || msg.includes('verwendet') ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>{msg}</div>
      )}

      {editing && (
        <div className="glass rounded-xl p-4 space-y-3 border-2 border-accent-red">
          <input type="text" placeholder="Name (z.B. DMX, Strom, Audio)" value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg glass text-white text-sm" />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />{saving ? 'Speichert...' : 'Speichern'}
            </button>
            <button onClick={() => { setEditing(null); setMsg(''); }}
              className="flex-1 px-3 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
              <X className="w-3.5 h-3.5" />Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-400 text-sm">Lädt...</p> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.cable_type_id} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-white text-sm font-semibold">{item.name}</p>
                <p className="text-gray-500 text-xs">{item.count} Kabel</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(item.cable_type_id); setName(item.name); setMsg(''); }}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-blue-400"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(item)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Kabel-Typen vorhanden.</p>}
        </div>
      )}
    </div>
  );
}

function CableConnectorsSection() {
  const [items, setItems] = useState<CableConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', gender: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<CableConnector[]>('/admin/cable-connectors');
      setItems(data || []);
    } catch { setMsg('Laden fehlgeschlagen.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { setMsg('Name ist erforderlich.'); return; }
    setSaving(true); setMsg('');
    const payload = {
      name: form.name,
      abbreviation: form.abbreviation || null,
      gender: form.gender || null,
    };
    try {
      if (editing === 'new') await api.post('/admin/cable-connectors', payload);
      else await api.put(`/admin/cable-connectors/${editing}`, payload);
      await load();
      setEditing(null); setForm({ name: '', abbreviation: '', gender: '' });
    } catch (e: any) { setMsg(e?.response?.data?.error ?? 'Speichern fehlgeschlagen.'); }
    finally { setSaving(false); }
  };

  const remove = async (item: CableConnector) => {
    if (!confirm(`Anschluss "${item.name}" löschen?`)) return;
    try {
      await api.delete(`/admin/cable-connectors/${item.connector_id}`);
      await load();
    } catch (e: any) { setMsg(e?.response?.data?.error ?? 'Löschen fehlgeschlagen.'); }
  };

  const startEdit = (item: CableConnector) => {
    setEditing(item.connector_id);
    setForm({ name: item.name, abbreviation: item.abbreviation ?? '', gender: item.gender ?? '' });
    setMsg('');
  };

  const genderLabel = (g: string | null) => g === 'M' ? 'Stecker (M)' : g === 'F' ? 'Buchse (F)' : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Kabel-Anschlüsse</h3>
        <button onClick={() => { setEditing('new'); setForm({ name: '', abbreviation: '', gender: '' }); setMsg(''); }}
          className="px-3 py-1.5 bg-accent-red text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 hover:opacity-90">
          <Plus className="w-3.5 h-3.5" /> Neu
        </button>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm font-semibold ${msg.includes('fehlgeschlagen') || msg.includes('verwendet') ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>{msg}</div>
      )}

      {editing && (
        <div className="glass rounded-xl p-4 space-y-3 border-2 border-accent-red">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="text" placeholder="Name (z.B. XLR, Schuko)" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg glass text-white text-sm" />
            <input type="text" placeholder="Abkürzung (z.B. XLR)" value={form.abbreviation}
              onChange={e => setForm({ ...form, abbreviation: e.target.value })}
              className="w-full px-3 py-2 rounded-lg glass text-white text-sm" />
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}
              className="w-full px-3 py-2 rounded-lg glass text-white text-sm">
              <option value="">Kein Geschlecht</option>
              <option value="M">Stecker (M)</option>
              <option value="F">Buchse (F)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />{saving ? 'Speichert...' : 'Speichern'}
            </button>
            <button onClick={() => { setEditing(null); setMsg(''); }}
              className="flex-1 px-3 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
              <X className="w-3.5 h-3.5" />Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-400 text-sm">Lädt...</p> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.connector_id} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-white text-sm font-semibold">{item.name}</p>
                  <div className="flex gap-2 mt-0.5">
                    {item.abbreviation && <span className="text-gray-500 text-xs">{item.abbreviation}</span>}
                    {item.gender && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.gender === 'M' ? 'bg-blue-500/15 text-blue-400' : 'bg-pink-500/15 text-pink-400'}`}>
                        {genderLabel(item.gender)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(item)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-blue-400"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(item)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500 text-sm">Keine Anschlüsse vorhanden.</p>}
        </div>
      )}
    </div>
  );
}

export function CablesTab() {
  const [view, setView] = useState<View>('types');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Cable className="w-5 h-5 text-accent-red" />
        <h2 className="text-white font-semibold text-lg">Kabel-Verwaltung</h2>
      </div>

      <div className="flex gap-2">
        {(['types', 'connectors'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${view === v ? 'bg-accent-red text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}>
            {v === 'types' ? 'Kabel-Typen' : 'Anschlüsse'}
          </button>
        ))}
      </div>

      {view === 'types' ? <CableTypesSection /> : <CableConnectorsSection />}
    </div>
  );
}
