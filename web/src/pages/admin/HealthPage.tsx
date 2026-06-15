import { useEffect, useState, useCallback } from 'react';
import { Activity, Database, Server, Clock } from 'lucide-react';
import { api } from '../../lib/api';

interface ServiceHealth {
  status: string;
  version?: string;
  error?: string;
}

interface AggregatedHealth {
  'cores-dashboard': ServiceHealth;
  rentalcore: ServiceHealth;
  warehousecore: ServiceHealth;
  plannercore: ServiceHealth;
  database: ServiceHealth;
  timestamp: string;
}

const SERVICE_LABELS: Record<string, string> = {
  'cores-dashboard': 'Cores Dashboard',
  rentalcore: 'RentalCore',
  warehousecore: 'WarehouseCore',
  plannercore: 'PlannerCore',
  database: 'Datenbank',
};

const SERVICE_ICONS: Record<string, React.ElementType> = {
  'cores-dashboard': Activity,
  rentalcore: Server,
  warehousecore: Server,
  plannercore: Server,
  database: Database,
};

function HealthCard({
  name,
  health,
}: {
  name: string;
  health: ServiceHealth;
}) {
  const Icon = SERVICE_ICONS[name] || Server;
  const label = SERVICE_LABELS[name] || name;

  let statusColor = 'var(--color-green)';
  let statusLabel = 'OK';
  let statusBg = 'rgba(34,197,94,0.12)';
  let borderColor = 'rgba(34,197,94,0.3)';

  if (health.status === 'unreachable' || health.status === 'error') {
    statusColor = 'var(--accent-red)';
    statusLabel = health.status === 'unreachable' ? 'NICHT ERREICHBAR' : 'FEHLER';
    statusBg = 'rgba(208,2,27,0.12)';
    borderColor = 'rgba(208,2,27,0.3)';
  } else if (health.status === 'degraded') {
    statusColor = '#eab308';
    statusLabel = 'EINGESCHRÄNKT';
    statusBg = 'rgba(234,179,8,0.12)';
    borderColor = 'rgba(234,179,8,0.3)';
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: 'var(--surface-1)',
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: statusBg }}
        >
          <Icon className="w-5 h-5" style={{ color: statusColor }} />
        </div>
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{label}</h3>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: statusColor }}
            />
            <span className="text-xs font-medium" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {health.version && (
        <p className="text-gray-500 text-xs mt-1">
          Version: <span className="text-gray-300 font-mono">{health.version}</span>
        </p>
      )}

      {health.error && (
        <p className="text-red-400 text-xs mt-2 bg-red-400/5 rounded-lg px-3 py-2 border border-red-400/10 break-all">
          {health.error}
        </p>
      )}
    </div>
  );
}

export function HealthPage() {
  const [health, setHealth] = useState<AggregatedHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string>('');

  const fetchHealth = useCallback(async () => {
    try {
      const r = await api.get('/admin/health');
      setHealth(r.data as AggregatedHealth);
      setError(null);
      setLastCheck(new Date().toLocaleTimeString('de-DE'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Abrufen');
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Service-Status</h2>
          <p className="text-gray-500 text-sm mt-1">
            Echtzeit-Überwachung aller Cores-Dienste
          </p>
        </div>
        {lastCheck && (
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>Letzter Check: {lastCheck}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-400/5 border border-red-400/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {health && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(health)
            .filter(([key]) => key !== 'timestamp')
            .map(([key, value]) => (
              <HealthCard key={key} name={key} health={value as ServiceHealth} />
            ))}
        </div>
      )}

      {!health && !error && (
        <div className="text-gray-500 text-sm py-12 text-center">
          <div className="w-8 h-8 border-2 border-accent-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Lade Service-Status...
        </div>
      )}

      {health?.timestamp && (
        <p className="text-gray-600 text-xs text-right">
          Zeitstempel: {new Date(health.timestamp).toLocaleString('de-DE')}
        </p>
      )}
    </div>
  );
}
