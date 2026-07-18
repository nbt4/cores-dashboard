import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, LogOut, User, ExternalLink, Menu, X, ChevronDown,
  Users, Shield, Layers, Lightbulb, Cpu, FolderTree, Tag, Ruler,
  Database, KeyRound, Download, Cable, ShoppingCart, BookUser, Wrench, Palette,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../hooks/useAppConfig';
import { useBranding } from '../hooks/useBranding';

const ADMIN_SECTIONS = [
  { label: 'Stammdaten', items: [
    { path: '/admin/contacts', label: 'Kontakte', icon: BookUser },
    { path: '/admin/services', label: 'Dienstleistungen', icon: Wrench },
    { path: '/admin/categories', label: 'Kategorien', icon: FolderTree },
    { path: '/admin/brands', label: 'Marken & Hersteller', icon: Tag },
    { path: '/admin/counttypes', label: 'Maßeinheiten', icon: Ruler },
    { path: '/admin/cables', label: 'Kabel-Typen & Anschlüsse', icon: Cable },
    { path: '/admin/rentalfields', label: 'Mietprodukt-Felder', icon: ShoppingCart },
    { path: '/admin/zonetypes', label: 'Lagertypen', icon: Layers },
  ]},
  { label: 'Benutzer & Rechte', items: [
    { path: '/admin/users', label: 'Benutzer', icon: Users },
    { path: '/admin/roles', label: 'Rollen', icon: Shield },
  ]},
  { label: 'Geräte & System', items: [
    { path: '/admin/led', label: 'LED-Verhalten', icon: Lightbulb },
    { path: '/admin/controllers', label: 'ESP-Controller', icon: Cpu },
    { path: '/admin/apisettings', label: 'API-Einstellungen', icon: Database },
    { path: '/admin/apikeys', label: 'API-Keys', icon: KeyRound },
    { path: '/admin/export', label: 'CSV-Export', icon: Download },
    { path: '/admin/branding', label: 'Branding', icon: Palette },
  ]},
];

function SidebarContent({ expanded, onClose }: { expanded: boolean; onClose: () => void }) {
  const config = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const branding = useBranding();
  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
     ${active ? 'bg-accent-red text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-white/5 flex-shrink-0">
        <img
          src={branding.sidebarLogo}
          alt={branding.companyName}
          className="flex-shrink-0 h-12"
          style={{ filter: 'drop-shadow(0 0 14px rgba(var(--accent-red-rgb), 0.3))', height: `${48 * branding.logoSizeSidebar / 100}px` }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {/* Dashboard */}
        <Link to="/" onClick={onClose} className={linkCls(isActive('/'))}>
          <Home className="w-5 h-5 flex-shrink-0" />
          {expanded && <span>Dashboard</span>}
        </Link>

        {ADMIN_SECTIONS.map(({ label: sectionLabel, items }) => (
          <div key={sectionLabel} className="mt-3 first:mt-1">
            {expanded && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">{sectionLabel}</p>}
            <div className="flex flex-col gap-0.5">
              {items.map(({ path, label, icon: Icon }) => (
                <Link key={path} to={path} onClick={onClose} className={linkCls(isActive(path))}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {expanded && <span>{label}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* External links */}
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-0.5">
          {config?.rentalUrl && (
            <a href={config.rentalUrl}
              className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              {expanded && <span>RentalCore</span>}
            </a>
          )}
          {config?.warehouseUrl && (
            <a href={config.warehouseUrl}
              className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              {expanded && <span>WarehouseCore</span>}
            </a>
          )}
          {config?.plannerUrl && (
            <a href={config.plannerUrl}
              className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              {expanded && <span>PlannerCore</span>}
            </a>
          )}
        </div>
      </nav>

      {/* User + Security + Logout */}
      <div className="p-2 border-t border-white/5 flex-shrink-0">
        <Link to="/profile/security" onClick={onClose}
          className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${isActive('/profile/security') ? 'bg-accent-red/10 text-accent-red' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
          <div className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-gray-400" />
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{user?.username}</p>
              <p className="text-xs text-gray-600">Sicherheit & Passkeys</p>
            </div>
          )}
        </Link>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-red-400 transition-colors">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {expanded && <span>Abmelden</span>}
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const layoutBranding = useBranding();

  // Close drawer on route change
  const location = useLocation();
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen bg-dark flex">

      {/* ── MOBILE top bar ─────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-4 gap-3 bg-dark-100 border-b border-white/5">
        <button onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:bg-white/5">
          <Menu className="w-5 h-5" />
        </button>
        <img
          src={layoutBranding.sidebarLogo}
          alt={layoutBranding.companyName}
          className="h-9"
          style={{ filter: 'drop-shadow(0 0 12px rgba(var(--accent-red-rgb), 0.25))', height: `${36 * layoutBranding.logoSizeSidebar / 100}px` }}
        />
      </header>

      {/* ── MOBILE drawer overlay ───────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="relative z-50 w-64 h-full flex flex-col bg-dark-100 border-r border-white/5">
            <button onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
            <SidebarContent expanded={true} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── DESKTOP sidebar ────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-full z-20 transition-all duration-200 bg-dark-100 border-r border-white/5
          ${desktopExpanded ? 'w-56' : 'w-14'}`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setDesktopExpanded(e => !e)}
          className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-dark-300 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white z-10"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${desktopExpanded ? 'rotate-90' : '-rotate-90'}`} />
        </button>
        <SidebarContent expanded={desktopExpanded} onClose={() => {}} />
      </aside>

      {/* ── Main content ───────────────────────────────────── */}
      <main className={`flex-1 min-w-0 pt-14 md:pt-0 transition-all duration-200
        ${desktopExpanded ? 'md:ml-56' : 'md:ml-14'}`}>
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
