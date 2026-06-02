import { useEffect, useState, useCallback } from 'react';
import {
  Users, Plus, Search, RefreshCw, Edit2, Trash2, X, Check,
  Mail, Phone, MapPin, ChevronLeft,
} from 'lucide-react';
import { contactsApi, type Contact, type ContactPayload } from '../../lib/api';

type RoleFilter = 'all' | 'customer' | 'supplier';
type View = 'list' | 'detail' | 'form';

function displayName(c: Contact) {
  if (c.companyname) return c.companyname;
  return `${c.firstname || ''} ${c.lastname || ''}`.trim() || '—';
}

const emptyForm = (): ContactPayload => ({
  companyname: '',
  firstname: '',
  lastname: '',
  email: '',
  phonenumber: '',
  street: '',
  housenumber: '',
  ZIP: '',
  city: '',
  country: 'Deutschland',
  customertype: '',
  is_customer: true,
  is_supplier: false,
  notes: '',
});

function ContactForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Contact;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ContactPayload>(
    initial
      ? {
          companyname: initial.companyname ?? '',
          firstname: initial.firstname ?? '',
          lastname: initial.lastname ?? '',
          email: initial.email ?? '',
          phonenumber: initial.phonenumber ?? '',
          street: initial.street ?? '',
          housenumber: initial.housenumber ?? '',
          ZIP: initial.ZIP ?? '',
          city: initial.city ?? '',
          country: initial.country ?? 'Deutschland',
          customertype: initial.customertype ?? '',
          is_customer: initial.is_customer,
          is_supplier: initial.is_supplier,
          notes: initial.notes ?? '',
        }
      : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const f = (field: keyof ContactPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (initial) {
        await contactsApi.update(initial.customer_id, form);
      } else {
        await contactsApi.create(form);
      }
      onSave();
    } catch {
      setError('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
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
          {initial ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
        </h2>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Unternehmen</label>
          <input className={inputCls} value={form.companyname ?? ''} onChange={f('companyname')} placeholder="Firma GmbH" />
        </div>
        <div>
          <label className={labelCls}>Vorname</label>
          <input className={inputCls} value={form.firstname ?? ''} onChange={f('firstname')} />
        </div>
        <div>
          <label className={labelCls}>Nachname</label>
          <input className={inputCls} value={form.lastname ?? ''} onChange={f('lastname')} />
        </div>
        <div>
          <label className={labelCls}>E-Mail</label>
          <input className={inputCls} type="email" value={form.email ?? ''} onChange={f('email')} />
        </div>
        <div>
          <label className={labelCls}>Telefon</label>
          <input className={inputCls} value={form.phonenumber ?? ''} onChange={f('phonenumber')} />
        </div>
        <div>
          <label className={labelCls}>Straße</label>
          <input className={inputCls} value={form.street ?? ''} onChange={f('street')} />
        </div>
        <div>
          <label className={labelCls}>Hausnummer</label>
          <input className={inputCls} value={form.housenumber ?? ''} onChange={f('housenumber')} />
        </div>
        <div>
          <label className={labelCls}>PLZ</label>
          <input className={inputCls} value={form.ZIP ?? ''} onChange={f('ZIP')} />
        </div>
        <div>
          <label className={labelCls}>Stadt</label>
          <input className={inputCls} value={form.city ?? ''} onChange={f('city')} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Kundentyp</label>
          <input className={inputCls} value={form.customertype ?? ''} onChange={f('customertype')} placeholder="z.B. Privat, Gewerbe" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notizen</label>
          <textarea className={inputCls} rows={2} value={form.notes ?? ''} onChange={f('notes')} />
        </div>
      </div>

      <div className="flex gap-4 pt-1">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded"
            checked={form.is_customer}
            onChange={e => setForm(p => ({ ...p, is_customer: e.target.checked }))}
          />
          Kunde
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded"
            checked={form.is_supplier}
            onChange={e => setForm(p => ({ ...p, is_supplier: e.target.checked }))}
          />
          Lieferant
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-accent-red hover:bg-accent-red/80 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Check className="w-4 h-4" />
          {saving ? 'Wird gespeichert...' : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
        >
          <X className="w-4 h-4" /> Abbrechen
        </button>
      </div>
    </form>
  );
}

function ContactDetail({ contact, onBack, onEdit, onDelete }: {
  contact: Contact;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-lg">
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">{displayName(contact)}</h2>
          <div className="flex gap-2 mt-1">
            {contact.is_customer && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Kunde</span>
            )}
            {contact.is_supplier && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Lieferant</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm transition-colors">
            <Edit2 className="w-3.5 h-3.5" /> Bearbeiten
          </button>
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Löschen
          </button>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <Row label="Unternehmen" value={contact.companyname} />
        <Row label="Vorname" value={contact.firstname} />
        <Row label="Nachname" value={contact.lastname} />
        <Row label="E-Mail" value={contact.email} />
        <Row label="Telefon" value={contact.phonenumber} />
        <Row label="Adresse" value={contact.street ? `${contact.street} ${contact.housenumber ?? ''}`.trim() : null} />
        <Row label="PLZ / Stadt" value={[contact.ZIP, contact.city].filter(Boolean).join(' ') || null} />
        <Row label="Kundentyp" value={contact.customertype} />
        {contact.notes && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs text-gray-400 mb-1">Notizen</p>
            <p className="text-sm text-gray-300">{contact.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    contactsApi
      .getAll(roleFilter === 'all' ? {} : { role: roleFilter })
      .then(r => setContacts(r.data.customers ?? []))
      .catch(() => setError('Kontakte konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [roleFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (c: Contact) => {
    if (!confirm(`Kontakt "${displayName(c)}" wirklich löschen?`)) return;
    await contactsApi.delete(c.customer_id);
    load();
  };

  const openDetail = (c: Contact) => { setSelected(c); setView('detail'); };
  const openEdit = (c: Contact) => { setSelected(c); setView('form'); };
  const openNew = () => { setSelected(null); setView('form'); };
  const backToList = () => { setView('list'); setSelected(null); };

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return (
      displayName(c).toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q)
    );
  });

  if (view === 'form') {
    return (
      <ContactForm
        initial={selected ?? undefined}
        onSave={() => { backToList(); load(); }}
        onCancel={backToList}
      />
    );
  }

  if (view === 'detail' && selected) {
    return (
      <ContactDetail
        contact={selected}
        onBack={backToList}
        onEdit={() => openEdit(selected)}
        onDelete={() => { handleDelete(selected); backToList(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-red" /> Kontakte
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{contacts.length} Einträge insgesamt</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-accent-red hover:bg-accent-red/80 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Neuer Kontakt
        </button>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-1">
        {(['all', 'customer', 'supplier'] as RoleFilter[]).map(role => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              roleFilter === role ? 'bg-accent-red text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {role === 'all' ? 'Alle' : role === 'customer' ? 'Kunden' : 'Lieferanten'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Kontakt suchen..."
          className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-gray-600"
        />
        <button onClick={load} className="text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* List */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-7 h-7 border-4 border-accent-red/20 border-t-accent-red rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-gray-500">
            <Users className="w-9 h-9 mx-auto mb-2 opacity-25" />
            <p className="text-sm">{search ? 'Keine Treffer' : 'Noch keine Kontakte'}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(c => (
              <div
                key={c.customer_id}
                className="flex items-center justify-between px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => openDetail(c)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{displayName(c)}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.email && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.phonenumber && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{c.phonenumber}</span>}
                    {c.city && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{c.city}</span>}
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    {c.is_customer && <span className="text-xs text-blue-400">Kunde</span>}
                    {c.is_supplier && <span className="text-xs text-green-400">Lieferant</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(c)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors">
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
