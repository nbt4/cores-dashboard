import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { warehouseApi as api } from '../../lib/api';

interface FieldDefinition {
  id: number;
  name: string;
  field_type: 'text' | 'number' | 'dropdown';
  unit: string | null;
  dropdown_options: string | null;
  is_active: boolean;
}

interface FormData {
  name: string;
  field_type: 'text' | 'number' | 'dropdown';
  unit: string;
  dropdown_options: string;
  is_active: boolean;
}

const EMPTY_FORM: FormData = {
  name: '',
  field_type: 'text',
  unit: '',
  dropdown_options: '',
  is_active: true,
};

function fieldTypeLabel(t: string) {
  if (t === 'text') return 'Text';
  if (t === 'number') return 'Zahl';
  if (t === 'dropdown') return 'Auswahlliste';
  return t;
}

function fieldTypeIcon(t: string) {
  if (t === 'number') return '#';
  if (t === 'dropdown') return '☰';
  return 'T';
}

export function RentalFieldsTab() {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<FieldDefinition[]>('/admin/rental-field-definitions');
      setFields(data || []);
    } catch {
      setMessage('Felder konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditing(null);
    setFormData(EMPTY_FORM);
    setMessage('');
  };

  const startEdit = (f: FieldDefinition) => {
    setEditing(f.id);
    setFormData({
      name: f.name,
      field_type: f.field_type,
      unit: f.unit ?? '',
      dropdown_options: f.dropdown_options
        ? JSON.parse(f.dropdown_options).join(', ')
        : '',
      is_active: f.is_active,
    });
    setMessage('');
  };

  const buildPayload = () => {
    const opts = formData.field_type === 'dropdown' && formData.dropdown_options.trim()
      ? JSON.stringify(formData.dropdown_options.split(',').map(s => s.trim()).filter(Boolean))
      : null;
    return {
      name: formData.name.trim(),
      field_type: formData.field_type,
      unit: formData.field_type === 'number' && formData.unit.trim() ? formData.unit.trim() : null,
      dropdown_options: opts,
      is_active: formData.is_active,
    };
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setMessage('Name ist erforderlich.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      if (editing === 'new') {
        await api.post('/admin/rental-field-definitions', buildPayload());
      } else {
        await api.put(`/admin/rental-field-definitions/${editing}`, buildPayload());
      }
      await load();
      resetForm();
      setMessage('Feld gespeichert.');
    } catch (e: any) {
      setMessage(e?.response?.data?.error || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Felddefinition löschen? (Bei Verwendung wird sie deaktiviert.)')) return;
    setMessage('');
    try {
      const { data } = await api.delete<{ message: string; action: string }>(`/admin/rental-field-definitions/${id}`);
      await load();
      setMessage(data.action === 'deactivated' ? 'Feld deaktiviert (wird noch verwendet).' : 'Feld gelöscht.');
    } catch {
      setMessage('Löschen fehlgeschlagen.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Mietprodukt-Felder</h2>
          <p className="text-sm text-gray-400 mt-0.5">Dynamische Zusatzfelder für Mietprodukte (z.B. Breite, Tiefe, Material)</p>
        </div>
        {editing === null && (
          <button
            onClick={() => { setEditing('new'); setFormData(EMPTY_FORM); setMessage(''); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-red hover:bg-red-600 text-white transition-colors"
          >
            <Plus size={16} /> Feld anlegen
          </button>
        )}
      </div>

      {message && (
        <div className="text-sm px-3 py-2 rounded-lg bg-white/5 text-gray-300">{message}</div>
      )}

      {editing !== null && (
        <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold text-white">{editing === 'new' ? 'Neues Feld' : 'Feld bearbeiten'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input
                className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 text-white focus:outline-none focus:border-accent-red"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="z.B. Breite"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Typ *</label>
              <select
                className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 text-white focus:outline-none focus:border-accent-red"
                value={formData.field_type}
                onChange={e => setFormData(p => ({ ...p, field_type: e.target.value as FormData['field_type'] }))}
              >
                <option value="text">Text</option>
                <option value="number">Zahl</option>
                <option value="dropdown">Auswahlliste</option>
              </select>
            </div>
            {formData.field_type === 'number' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Einheit (optional)</label>
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 text-white focus:outline-none focus:border-accent-red"
                  value={formData.unit}
                  onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))}
                  placeholder="z.B. m, kg, W"
                />
              </div>
            )}
            {formData.field_type === 'dropdown' && (
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Optionen (kommagetrennt)</label>
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm bg-black/40 border border-white/10 text-white focus:outline-none focus:border-accent-red"
                  value={formData.dropdown_options}
                  onChange={e => setFormData(p => ({ ...p, dropdown_options: e.target.value }))}
                  placeholder="z.B. Holz, Stahl, Aluminium"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={e => setFormData(p => ({ ...p, is_active: e.target.checked }))}
                className="accent-red-500"
              />
              <label htmlFor="is_active" className="text-sm text-gray-300">Aktiv</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-red hover:bg-red-600 text-white transition-colors disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={14} /> Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Felder definiert.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--surface-3)' }}>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Einheit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {fields.map(f => (
                <tr key={f.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300">
                      {fieldTypeIcon(f.field_type)} {fieldTypeLabel(f.field_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{f.name}</td>
                  <td className="px-4 py-3 text-gray-400">{f.unit ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.is_active ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {f.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(f)} className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
