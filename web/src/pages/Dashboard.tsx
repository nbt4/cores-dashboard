// File: cores-dashboard/web/src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { ExternalLink, Briefcase, Package, TrendingUp, Wrench, AlertTriangle, BarChart2, Kanban } from 'lucide-react';
import { api } from '../lib/api';
import { useAppConfig } from '../hooks/useAppConfig';

interface AnalyticsSummary {
  rental: { totalRevenue?: number; totalJobs?: number; error?: string };
  warehouse: { in_storage?: number; on_job?: number; total?: number; error?: string };
  maintenance: { open_defects?: number; overdue_inspections?: number; error?: string };
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-dark-100 rounded-xl p-4 flex items-center gap-4" style={{ border: '1px solid var(--border-subtle)' }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-gray-500 text-xs mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<AnalyticsSummary | null>(null);
  const config = useAppConfig();

  useEffect(() => {
    api.get('/analytics/summary')
      .then(r => setStats(r.data as AnalyticsSummary))
      .catch(console.error);
  }, []);

  const fmt = (n?: number) => n !== undefined ? n.toLocaleString('de-DE') : '—';
  const fmtEur = (n?: number) => n !== undefined ? `€${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` : '—';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Cores</h1>
        <p className="text-gray-500 text-sm mt-1">Management Hub</p>
      </div>

      {/* Hub Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <a href={config?.rentalUrl ?? '#'}
          className="group relative overflow-hidden rounded-2xl p-6 flex flex-col justify-between min-h-40 transition-transform hover:scale-[1.01]"
          style={{ background: 'var(--gradient-accent)' }}>
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-wider uppercase">Auftragsmanagement</p>
            <h2 className="text-white text-2xl font-black mt-1">RentalCore</h2>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium mt-4">
            <span>Öffnen</span>
            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute right-4 bottom-4 opacity-10">
            <Briefcase className="w-20 h-20 text-white" />
          </div>
        </a>

        <a href={config?.warehouseUrl ?? '#'}
          className="group relative overflow-hidden rounded-2xl p-6 flex flex-col justify-between min-h-40 transition-transform hover:scale-[1.01]"
          style={{ background: 'var(--gradient-primary)', border: '1px solid var(--border-default)' }}>
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-wider uppercase">Lagermanagement</p>
            <h2 className="text-white text-2xl font-black mt-1">WarehouseCore</h2>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium mt-4">
            <span>Öffnen</span>
            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute right-4 bottom-4 opacity-10">
            <Package className="w-20 h-20 text-white" />
          </div>
        </a>

        <a href={config?.plannerUrl ?? (config?.rentalUrl ? new URL('/planner', config.rentalUrl).href : '#')}
          className="group relative overflow-hidden rounded-2xl p-6 flex flex-col justify-between min-h-40 transition-transform hover:scale-[1.01]"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)' }}>
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-wider uppercase">Aufgaben & Planung</p>
            <h2 className="text-white text-2xl font-black mt-1">PlannerCore</h2>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium mt-4">
            <span>Öffnen</span>
            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute right-4 bottom-4 opacity-10">
            <Kanban className="w-20 h-20 text-white" />
          </div>
        </a>
      </div>

      {/* Analytics Grid */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-accent-red" />
          Übersicht (letzte 30 Tage)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Umsatz" value={fmtEur(stats?.rental?.totalRevenue)} icon={TrendingUp} color="#22c55e" />
          <StatCard label="Abgeschl. Jobs" value={fmt(stats?.rental?.totalJobs)} icon={Briefcase} color="#D0021B" />
          <StatCard label="Geräte im Lager" value={fmt(stats?.warehouse?.in_storage)} icon={Package} color="#60a5fa" />
          <StatCard label="Geräte auf Job" value={fmt(stats?.warehouse?.on_job)} icon={Package} color="#eab308" />
          <StatCard label="Offene Defekte" value={fmt(stats?.maintenance?.open_defects)} icon={AlertTriangle} color="#f87171" />
          <StatCard label="Überfäll. Wartungen" value={fmt(stats?.maintenance?.overdue_inspections)} icon={Wrench} color="#fb923c" />
        </div>
      </div>
    </div>
  );
}
