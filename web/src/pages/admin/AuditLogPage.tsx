import { useEffect, useState, useCallback } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';

interface AuditEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  resource: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#22c55e',
  UPDATE: '#60a5fa',
  DELETE: '#ef4444',
  READ: '#a855f7',
  LOGIN: '#eab308',
  LOGOUT: '#9ca3af',
};

export function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');

  // Pagination
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit, offset };
      if (filterUser) params.user_id = filterUser;
      if (filterAction) params.action = filterAction;
      if (filterResource) params.resource = filterResource;

      const r = await api.get('/admin/audit', { params });
      setData(r.data as AuditResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [limit, offset, filterUser, filterAction, filterResource]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const currentPage = Math.floor(offset / limit) + 1;

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    if (filterUser) params.set('user_id', filterUser);
    if (filterAction) params.set('action', filterAction);
    if (filterResource) params.set('resource', filterResource);

    // Open CSV download in new tab
    window.open(`/api/v1/admin/audit?${params.toString()}`, '_blank');
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('de-DE');
  };

  const detailSummary = (details: Record<string, unknown>): string => {
    if (!details || Object.keys(details).length === 0) return '-';
    const method = details.method as string | undefined;
    const path = details.path as string | undefined;
    const status = details.status_code as number | undefined;
    if (method && path && status) {
      return `${method} ${path} → ${status}`;
    }
    return JSON.stringify(details);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Audit-Log</h2>
          <p className="text-gray-500 text-sm mt-1">
            Protokoll aller Admin-Aktionen
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent-red hover:bg-accent-red/80 transition-colors"
        >
          <Download className="w-4 h-4" />
          CSV Export
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="User ID..."
            value={filterUser}
            onChange={(e) => { setFilterUser(e.target.value); setOffset(0); }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-accent-red/50"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setOffset(0); }}
          className="px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white text-sm focus:outline-none focus:border-accent-red/50"
        >
          <option value="">Alle Aktionen</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="READ">READ</option>
        </select>
        <select
          value={filterResource}
          onChange={(e) => { setFilterResource(e.target.value); setOffset(0); }}
          className="px-3 py-2 rounded-lg bg-dark-300 border border-white/10 text-white text-sm focus:outline-none focus:border-accent-red/50"
        >
          <option value="">Alle Ressourcen</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={() => { setFilterUser(''); setFilterAction(''); setFilterResource(''); setOffset(0); }}
          className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          Filter zurücksetzen
        </button>
      </div>

      {error && (
        <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-gray-500 text-sm py-12 text-center">
          <div className="w-8 h-8 border-2 border-accent-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Lade Audit-Log...
        </div>
      )}

      {data && !loading && (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-dark-300 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Zeit</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Aktion</th>
                  <th className="text-left px-4 py-3">Ressource</th>
                  <th className="text-left px-4 py-3">Details</th>
                  <th className="text-left px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Keine Einträge gefunden
                    </td>
                  </tr>
                ) : (
                  data.entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-mono text-xs">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="px-4 py-3 text-white">
                        <span className="font-medium">{entry.username}</span>
                        <span className="text-gray-600 text-xs ml-1">#{entry.user_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            color: ACTION_COLORS[entry.action] || '#9ca3af',
                            background: `${ACTION_COLORS[entry.action] || '#9ca3af'}15`,
                          }}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {entry.resource}
                        {entry.resource_id && (
                          <span className="text-gray-600 ml-1">#{entry.resource_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-64 truncate">
                        {detailSummary(entry.details)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                        {entry.ip_address || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Einträge {offset + 1}–{Math.min(offset + limit, data.total)} von {data.total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-gray-400">
                  Seite {currentPage} von {totalPages}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= data.total}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
