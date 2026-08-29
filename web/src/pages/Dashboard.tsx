import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Boxes, BriefcaseBusiness, Building2,
  CheckCircle2, CircleDollarSign, Clock3, Database, ExternalLink, HeartPulse,
  Kanban, PackageCheck, RefreshCw, Server, ShoppingBasket, Sparkles, Warehouse,
  Wrench,
} from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { useAppConfig } from '../hooks/useAppConfig';
import { useAuth } from '../contexts/AuthContext';
import { suiteGreeting } from '../lib/cores-design';

interface ServiceHealth {
  status: string;
  version?: string;
  error?: string;
  latency_ms?: number;
}

interface AnalyticsSummary {
  rental: {
    totalRevenue?: number;
    totalJobs?: number;
    avgJobValue?: number;
    revenueGrowth?: number;
    error?: string;
  };
  warehouse: {
    total?: number;
    in_storage?: number;
    ready_for_dispatch?: number;
    active_jobs?: number;
    return_pending?: number;
    location_unknown?: number;
    open_defects?: number;
    overdue_inspections?: number;
    cases_packing?: number;
    cases_return_check?: number;
    movements_today?: number;
    error?: string;
  };
  warehouseOverview: {
    active_locations?: number;
    unplaced_devices?: number;
    unplaced_cases?: number;
    unplaced_product_quantity?: number;
    open_tasks?: number;
    counts_due?: number;
    error?: string;
  };
  maintenance: { open_defects?: number; overdue_inspections?: number; error?: string };
  planner: {
    openTasks?: number;
    overdue?: number;
    dueToday?: number;
    inProgress?: number;
    priorities?: PlannerPriority[];
    error?: string;
  };
  procurement: {
    pendingApprovals?: number;
    triggeredAlerts?: number;
    activeProducts?: number;
    preferredSuppliers?: number;
    spend?: { cents?: number };
    savings?: { cents?: number };
    error?: string;
  };
  services: Record<string, ServiceHealth | string> & { timestamp?: string };
  timestamp: string;
}

interface PlannerPriority {
  id: string;
  planId: string;
  title: string;
  priority: string;
  progress: number;
  isLate: boolean;
  dueDate?: string;
}

type Tone = 'critical' | 'warning' | 'info';

const SERVICE_NAMES: Record<string, string> = {
  'cores-dashboard': 'Cores Dashboard',
  rentalcore: 'RentalCore',
  warehousecore: 'WarehouseCore',
  plannercore: 'PlannerCore',
  procurementcore: 'ProcurementCore',
  database: 'Datenbank',
};

function isHealthy(status?: string) {
  return status === 'ok' || status === 'healthy';
}

function joinURL(base: string | undefined, path: string) {
  if (!base) return '#';
  try {
    return new URL(path, base).href;
  } catch {
    return base;
  }
}

export function Dashboard() {
  const config = useAppConfig();
  const { user } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (notify = false) => {
    setRefreshing(true);
    try {
      const response = await api.get<AnalyticsSummary>('/analytics/summary');
      setSummary(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      if (notify) toast.error(`Lagebild konnte nicht aktualisiert werden: ${String(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const services = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.services)
      .filter(([key, value]) => key !== 'timestamp' && typeof value === 'object')
      .map(([key, value]) => ({ key, health: value as ServiceHealth }));
  }, [summary]);

  if (loading && !summary) return <DashboardSkeleton />;
  if (!summary) return <EmptyDashboard onRetry={() => void load(true)} />;

  const w = summary.warehouse || {};
  const wo = summary.warehouseOverview || {};
  const planner = summary.planner || {};
  const procurement = summary.procurement || {};
  const rental = summary.rental || {};
  const unassigned = (wo.unplaced_devices || 0) + (wo.unplaced_cases || 0);
  const healthyServices = services.filter(({ health }) => isHealthy(health.status)).length;
  const readiness = w.total ? Math.round(((w.ready_for_dispatch || 0) / w.total) * 100) : 0;
  const unhealthy = services.filter(({ health }) => !isHealthy(health.status));

  const priorities: Array<{ title: string; detail: string; value: number; tone: Tone; href: string }> = [];
  if (unhealthy.length > 0) priorities.push({ title: 'Cores-Dienst gestört', detail: unhealthy.map(({ key }) => SERVICE_NAMES[key] || key).join(', '), value: unhealthy.length, tone: 'critical', href: '#service-status' });
  if (wo.active_locations === 0) priorities.push({ title: 'Lagerstruktur fehlt', detail: `${unassigned} Geräte und Cases warten auf eine Zuordnung.`, value: unassigned, tone: 'critical', href: joinURL(config?.warehouseUrl, '/zones') });
  else if (unassigned > 0) priorities.push({ title: 'Material nicht zugeordnet', detail: `${wo.unplaced_devices || 0} Geräte · ${wo.unplaced_cases || 0} Cases`, value: unassigned, tone: 'warning', href: joinURL(config?.warehouseUrl, '/zones') });
  if ((w.return_pending || 0) + (w.cases_return_check || 0) > 0) priorities.push({ title: 'Rücklauf bearbeiten', detail: 'Material wartet auf Prüfung und Wiedereinlagerung.', value: (w.return_pending || 0) + (w.cases_return_check || 0), tone: 'warning', href: joinURL(config?.warehouseUrl, '/scan') });
  if ((w.open_defects || 0) + (w.overdue_inspections || 0) > 0) priorities.push({ title: 'Technische Klärung', detail: `${w.open_defects || 0} Defekte · ${w.overdue_inspections || 0} Prüfungen überfällig`, value: (w.open_defects || 0) + (w.overdue_inspections || 0), tone: 'warning', href: joinURL(config?.warehouseUrl, '/maintenance') });
  if ((planner.overdue || 0) > 0) priorities.push({ title: 'Aufgaben überfällig', detail: `${planner.dueToday || 0} weitere Aufgaben sind heute fällig.`, value: planner.overdue || 0, tone: 'warning', href: config?.plannerUrl || '/planner/' });
  if ((procurement.pendingApprovals || 0) > 0) priorities.push({ title: 'Beschaffung freigeben', detail: 'Eingereichte Bedarfe warten auf eine Entscheidung.', value: procurement.pendingApprovals || 0, tone: 'info', href: joinURL(config?.procurementUrl, '/requisitions') });
  if ((procurement.triggeredAlerts || 0) > 0) priorities.push({ title: 'Preisalarme prüfen', detail: 'Beschaffungsangebote haben definierte Schwellwerte erreicht.', value: procurement.triggeredAlerts || 0, tone: 'info', href: joinURL(config?.procurementUrl, '/alerts') });

  return (
    <div className="suite-dashboard">
      <header className="suite-dashboard-header">
        <div className="suite-dashboard-heading">
          <div className="suite-dashboard-eyebrow" style={{ color: unhealthy.length ? 'var(--color-warning)' : 'var(--color-success)' }}>
            <span className="suite-dashboard-eyebrow-dot animate-pulse" />
            Cores Live-Lagebild
          </div>
          <h1 className="suite-dashboard-title">{suiteGreeting(user)}</h1>
          <p className="suite-dashboard-subtitle">Was heute zählt – über alle Cores hinweg.</p>
        </div>
        <div className="suite-dashboard-actions">
          {lastUpdated && <span className="suite-dashboard-timestamp">Aktualisiert {lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="suite-button"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Aktualisieren</button>
        </div>
      </header>

      <section className="suite-kpi-grid">
        <KpiCard icon={CircleDollarSign} label="Umsatz · 30 Tage" value={formatEuro(rental.totalRevenue)} detail={`${formatNumber(rental.totalJobs)} abgeschlossene Jobs`} color="var(--color-success)" href={config?.rentalUrl || '#'} />
        <KpiCard icon={BriefcaseBusiness} label="Aktive Jobs" value={formatNumber(w.active_jobs)} detail={`${w.in_storage || 0} Geräte physisch im Lager`} color="var(--accent-red)" href={config?.rentalUrl || '#'} />
        <KpiCard icon={PackageCheck} label="Lagerbereit" value={`${readiness}%`} detail={`${w.ready_for_dispatch || 0} von ${w.total || 0} Geräten`} color="var(--color-info)" href={config?.warehouseUrl || '#'} progress={readiness} />
        <KpiCard icon={HeartPulse} label="Plattformstatus" value={`${healthyServices}/${services.length}`} detail={unhealthy.length ? `${unhealthy.length} Dienst${unhealthy.length === 1 ? '' : 'e'} prüfen` : 'Alle Dienste erreichbar'} color={unhealthy.length ? 'var(--color-warning)' : 'var(--color-success)'} href="#service-status" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="card overflow-hidden">
          <SectionHeader icon={AlertTriangle} title="Jetzt bearbeiten" subtitle="Nach betrieblicher Auswirkung priorisiert" tone={priorities.length ? 'var(--color-warning)' : 'var(--color-success)'} />
          {priorities.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center p-8 text-center"><div><CheckCircle2 className="mx-auto h-10 w-10" style={{ color: 'var(--color-success)' }} /><div className="mt-3 font-bold text-white">Keine kritischen Vorgänge</div><div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Das operative Lagebild ist aktuell im grünen Bereich.</div></div></div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>{priorities.map((item) => <PriorityRow key={item.title} {...item} />)}</div>
          )}
        </div>

        <div id="service-status" className="card overflow-hidden scroll-mt-5">
          <SectionHeader icon={Server} title="Systemzustand" subtitle={`${healthyServices} von ${services.length} Komponenten online`} tone={unhealthy.length ? 'var(--color-warning)' : 'var(--color-success)'} />
          <div className="divide-y px-4 sm:px-5" style={{ borderColor: 'var(--border-subtle)' }}>
            {services.map(({ key, health }) => <ServiceRow key={key} name={SERVICE_NAMES[key] || key} health={health} database={key === 'database'} />)}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><h2 className="font-bold text-white">Arbeitsbereiche</h2><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>Direkter Einstieg mit aktuellem Kontext</p></div><Sparkles className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} /></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CoreCard icon={BriefcaseBusiness} name="RentalCore" eyebrow="Aufträge & Kunden" color="var(--accent-red)" href={config?.rentalUrl || '#'} metrics={[`${formatEuro(rental.totalRevenue)} Umsatz`, `${formatNumber(rental.totalJobs)} Jobs · 30 Tage`]} error={rental.error} />
          <CoreCard icon={Warehouse} name="WarehouseCore" eyebrow="Lager & Material" color="var(--color-info)" href={config?.warehouseUrl || '#'} metrics={[`${w.ready_for_dispatch || 0} lagerbereit`, `${w.movements_today || 0} Bewegungen heute`]} error={w.error} />
          <CoreCard icon={Kanban} name="PlannerCore" eyebrow="Aufgaben & Planung" color="var(--accent-red)" href={config?.plannerUrl || '/planner/'} metrics={[`${planner.openTasks || 0} offene Aufgaben`, `${planner.overdue || 0} überfällig · ${planner.dueToday || 0} heute`]} error={planner.error} />
          <CoreCard icon={ShoppingBasket} name="ProcurementCore" eyebrow="Einkauf & Beschaffung" color="var(--accent-red)" href={config?.procurementUrl || '#'} metrics={[`${procurement.pendingApprovals || 0} Freigaben offen`, `${formatEuroCents(procurement.spend?.cents)} Bestellwert`]} error={procurement.error} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="card overflow-hidden">
          <SectionHeader icon={Kanban} title="Meine Planner-Prioritäten" subtitle={`${planner.inProgress || 0} Aufgaben in Arbeit`} tone="var(--accent-red)" />
          {!planner.priorities?.length ? <EmptyPanel icon={CheckCircle2} text="Keine überfälligen oder hoch priorisierten Aufgaben." /> : <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>{planner.priorities.map(task => <a key={task.id} href={config?.plannerUrl || '/planner/'} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.035] sm:px-5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: task.isLate ? 'var(--color-danger)' : 'var(--accent-red)' }} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{task.title}</div><div className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{task.isLate ? 'Überfällig' : task.priority === 'urgent' ? 'Dringend' : 'Hohe Priorität'} · {task.progress}%</div></div><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-tertiary)' }} /></a>)}</div>}
        </div>

        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between"><div><h2 className="font-bold text-white">Operativer Puls</h2><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>Heute und aktuell offene Vorgänge</p></div><Activity className="h-5 w-5" style={{ color: 'var(--color-info)' }} /></div>
          <div className="mt-5 space-y-4">
            <PulseRow icon={Boxes} label="Material ohne Lagerplatz" value={unassigned} detail={`${wo.unplaced_product_quantity || 0} Mengeneinheiten zusätzlich`} color={unassigned ? 'var(--color-danger)' : 'var(--color-success)'} />
            <PulseRow icon={Clock3} label="Rücklauf offen" value={(w.return_pending || 0) + (w.cases_return_check || 0)} detail={`${w.cases_packing || 0} Cases im Packprozess`} color="var(--color-warning)" />
            <PulseRow icon={Wrench} label="Technische Vorgänge" value={(w.open_defects || 0) + (w.overdue_inspections || 0)} detail="Defekte und überfällige Prüfungen" color="var(--color-error)" />
            <PulseRow icon={Building2} label="Beschaffungsalarme" value={(procurement.pendingApprovals || 0) + (procurement.triggeredAlerts || 0)} detail={`${formatEuroCents(procurement.savings?.cents)} dokumentierte Ersparnis`} color="var(--color-warning)" />
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, detail, color, href, progress }: { icon: React.ElementType; label: string; value: string; detail: string; color: string; href: string; progress?: number }) {
  return <a href={href} className="card group block p-4 transition-all hover:-translate-y-0.5 hover:border-white/15 sm:p-5"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}><Icon className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" style={{ color: 'var(--text-tertiary)' }} /></div><div className="mt-4 text-3xl font-black leading-none" style={{ color }}>{value}</div><div className="mt-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</div><div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{detail}</div>{progress !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(progress, 100)}%`, background: color }} /></div>}</a>;
}

function SectionHeader({ icon: Icon, title, subtitle, tone }: { icon: React.ElementType; title: string; subtitle: string; tone: string }) {
  return <div className="flex items-center justify-between border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border-subtle)' }}><div><h2 className="font-bold text-white">{title}</h2><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p></div><Icon className="h-5 w-5" style={{ color: tone }} /></div>;
}

function PriorityRow({ title, detail, value, tone, href }: { title: string; detail: string; value: number; tone: Tone; href: string }) {
  const color = tone === 'critical' ? 'var(--color-danger)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-info)';
  return <a href={href} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.035] sm:px-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="font-semibold text-white">{title}</div><div className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{detail}</div></div><span className="text-xl font-black" style={{ color }}>{value}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-tertiary)' }} /></a>;
}

function ServiceRow({ name, health, database }: { name: string; health: ServiceHealth; database: boolean }) {
  const okay = isHealthy(health.status);
  const color = okay ? 'var(--color-success)' : health.status === 'degraded' ? 'var(--color-warning)' : 'var(--color-danger)';
  const Icon = database ? Database : Server;
  return <div className="flex items-center gap-3 py-3"><Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{name}</div><div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{health.version && <span>v{health.version}</span>}{health.latency_ms !== undefined && <span>{health.latency_ms} ms</span>}</div></div><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color }}><span className="h-2 w-2 rounded-full" style={{ background: color }} />{okay ? 'Online' : 'Prüfen'}</span></div>;
}

function CoreCard({ icon: Icon, name, eyebrow, color, href, metrics, error }: { icon: React.ElementType; name: string; eyebrow: string; color: string; href: string; metrics: string[]; error?: string }) {
  return <a href={href} className="card group relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-white/15"><div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} /><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}><Icon className="h-5 w-5" /></div><ExternalLink className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ color: 'var(--text-tertiary)' }} /></div><div className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color }}>{eyebrow}</div><h3 className="mt-1 text-lg font-black text-white">{name}</h3>{error ? <p className="mt-4 text-xs" style={{ color: 'var(--color-danger)' }}>Daten momentan nicht verfügbar</p> : <div className="mt-4 space-y-1">{metrics.map(metric => <p key={metric} className="text-xs" style={{ color: 'var(--text-secondary)' }}>{metric}</p>)}</div>}</a>;
}

function PulseRow({ icon: Icon, label, value, detail, color }: { icon: React.ElementType; label: string; value: number; detail: string; color: string }) {
  return <div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--bg-subtle)', color }}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{label}</div><div className="truncate text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{detail}</div></div><span className="text-xl font-black" style={{ color }}>{value}</span></div>;
}

function EmptyPanel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return <div className="flex min-h-48 items-center justify-center p-6 text-center"><div><Icon className="mx-auto h-8 w-8" style={{ color: 'var(--color-success)' }} /><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</p></div></div>;
}

function DashboardSkeleton() {
  return <div className="animate-pulse space-y-5"><div className="h-20 rounded-xl" style={{ background: 'var(--surface-1)' }} /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 rounded-xl" style={{ background: 'var(--surface-1)' }} />)}</div><div className="grid gap-4 xl:grid-cols-2"><div className="h-80 rounded-xl" style={{ background: 'var(--surface-1)' }} /><div className="h-80 rounded-xl" style={{ background: 'var(--surface-1)' }} /></div></div>;
}

function EmptyDashboard({ onRetry }: { onRetry: () => void }) {
  return <div className="card flex min-h-80 items-center justify-center p-8 text-center"><div><AlertTriangle className="mx-auto h-10 w-10" style={{ color: 'var(--color-danger)' }} /><h1 className="mt-3 text-xl font-bold text-white">Lagebild nicht verfügbar</h1><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Die Cores-Daten konnten nicht geladen werden.</p><button type="button" onClick={onRetry} className="mt-5 rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: 'var(--accent-red)' }}>Erneut versuchen</button></div></div>;
}

function formatNumber(value?: number) {
  return value === undefined ? '—' : value.toLocaleString('de-DE');
}

function formatEuro(value?: number) {
  return value === undefined ? '—' : value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function formatEuroCents(value?: number) {
  return value === undefined ? '—' : (value / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
