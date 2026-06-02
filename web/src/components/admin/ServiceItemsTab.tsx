import { useEffect, useState, useCallback } from 'react';
import {
  Wrench, Plus, Search, RefreshCw, Edit2, Trash2, X, Check, ChevronLeft,
} from 'lucide-react';
import { serviceItemsApi, type ServiceItem, type ServiceItemPayload } from '../../lib/api';

type View = 'list' | 'form';

const emptyForm = (): ServiceItemPayload => ({
  name: '',
  description: '',
  default_price: 0,
  category: '',
  unit: 'pauschal',
});

function ServiceItemForm({ initial, onSave, onCancel }: {
  initial?: ServiceItem;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ServiceItemPayload>(
    initial
      ? { name: initial.name, description: initial.description ?? '', default_price: initial.default_price, category: initial.category ?? '', unit: initial.unit }
      : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name ist erforderlich.'); return; }
    setSaving(true); setError('');
    try {
      if (initial) {
        await serviceItemsApi.update(initial.id, form);
      } else {
        await serviceItemsApi.create(form);
      }
      onSave();
    } catch { setError('Speichern fehlgeschlagen.'); } finally { setSaving(false); }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:border-accent-red placeholder:text-gray-600';
  const labelCls = 'block text-xs text-gray-400 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={onCancel} className="p-1.5 hover:bg-white/10 rounded-lg">
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <h2 className="text-base font-semibold text-white">
          {initial ? 'Dienstleistung bearbeiten' : 'Neue Dienstleistung'}
        </h2>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div>
        <label className={labelCls}>Name *</label>
        <input className={inputCls} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="z.B. Fahrtkosten, Personal (Techniker)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Standardpreis (€)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={form.default_price || ''} onChange={e => setForm(p => ({ ...p, default_price: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>Einheit</label>
          <select className={inputCls} value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
            <option value="pauschal">Pauschal</option>
            <option value="pro Stunde">Pro Stunde</option>
            <option value="pro Tag">Pro Tag</option>
            <option value="pro km">Pro km</option>
            <option value="pro Person">Pro Person</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Kategorie</label>
        <input className={inputCls} value={form.category ?? ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="z.B. Transport, Personal, Sonstiges" />
      </div>
      <div>
        <label className={labelCls}>Beschreibung</label>
        <textarea className={inputCls} rows={2} value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-accent-red hover:bg-accent-red/80 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          <Check className="w-4 h-4" />{saving ? 'Speichert…' : 'Speichern'}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
          <X className="w-4 h-4" /> Abbrechen
        </button>
      </div>
    </form>
  );
}

export function ServiceItemsTab() {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    serviceItemsApi.getAll()
      .then(r => setItems(r.data.service_items ?? []))
      .catch(() => setError('Dienstleistungen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (item: ServiceItem) => {
    if (!confirm(`"${item.name}" wirklich löschen?`)) return;
    await serviceItemsApi.delete(item.id);
    load();
  };

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q);
  });

  if (view === 'form') {
    return <ServiceItemForm initial={editing ?? undefined} onSave={() => { setView('list'); setEditing(null); load(); }} onCancel={() => { setView('list'); setEditing(null); }} />;
  }

  const formatPrice = (v: number) => v > 0 ? `${v.toFixed(2)} €` : '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-accent-red" /> Dienstleistungen
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{items.length} Einträge — Kostenpositionen ohne physische Geräte</p>
        </div>
        <button onClick={() => { setEditing(null); setView('form'); }} className="flex items-center gap-2 px-4 py-2 bg-accent-red hover:bg-accent-red/80 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Neue Dienstleistung
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Dienstleistung suchen…" className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-gray-600" />
        <button onClick={load} className="text-gray-500 hover:text-gray-300 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
        {loading ? (
          <div className="flex justify-center py-14"><div className="w-7 h-7 border-4 border-accent-red/20 border-t-accent-red rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-gray-500">
            <Wrench className="w-9 h-9 mx-auto mb-2 opacity-25" />
            <p className="text-sm">{search ? 'Keine Treffer' : 'Noch keine Dienstleistungen'}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(item => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500">{formatPrice(item.default_price)}</span>
                    {item.unit && item.unit !== 'pauschal' && <span className="text-xs text-gray-500">· {item.unit}</span>}
                    {item.category && <span className="text-xs text-blue-400">{item.category}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                  <button onClick={() => { setEditing(item); setView('form'); }} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
