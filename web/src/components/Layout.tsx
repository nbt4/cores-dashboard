import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Settings, LogOut, User, ExternalLink, Menu, X, ChevronDown,
  Users, Shield, Layers, Lightbulb, Cpu, FolderTree, Tag, Ruler,
  Database, KeyRound, Download, Cable, ShoppingCart, BookUser, Wrench,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../hooks/useAppConfig';

const ADMIN_ITEMS = [
  { path: '/admin/contacts',     label: 'Kontakte',           icon: BookUser },
  { path: '/admin/services',    label: 'Dienstleistungen',   icon: Wrench },
  { path: '/admin/users',       label: 'Benutzer',          icon: Users },
  { path: '/admin/roles',       label: 'Rollen',            icon: Shield },
  { path: '/admin/zonetypes',   label: 'Lagertypen',        icon: Layers },
  { path: '/admin/led',         label: 'LED-Verhalten',     icon: Lightbulb },
  { path: '/admin/controllers', label: 'ESP-Controller',    icon: Cpu },
  { path: '/admin/categories',  label: 'Kategorien',        icon: FolderTree },
  { path: '/admin/brands',      label: 'Marken & Hersteller',            icon: Tag },
  { path: '/admin/counttypes',  label: 'Maßeinheiten',      icon: Ruler },
  { path: '/admin/cables',      label: 'Kabel-Typen & Anschlüsse', icon: Cable },
  { path: '/admin/rentalfields', label: 'Mietprodukt-Felder', icon: ShoppingCart },
  { path: '/admin/apisettings', label: 'API-Einstellungen', icon: Database },
  { path: '/admin/apikeys',     label: 'API-Keys',          icon: KeyRound },
  { path: '/admin/export',      label: 'CSV-Export',        icon: Download },
];

function SidebarContent({ expanded, onClose }: { expanded: boolean; onClose: () => void }) {
  const config = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const onAdmin = location.pathname.startsWith('/admin');
  const [adminOpen, setAdminOpen] = useState(onAdmin);

  useEffect(() => { if (onAdmin) setAdminOpen(true); }, [onAdmin]);

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
          src="/logos/cores_white_side.svg"
          alt="Cores"
          className="flex-shrink-0 h-12"
          style={{ filter: 'drop-shadow(0 0 14px rgba(var(--accent-red-rgb), 0.3))' }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {/* Dashboard */}
        <Link to="/" onClick={onClose} className={linkCls(isActive('/'))}>
          <Home className="w-5 h-5 flex-shrink-0" />
          {expanded && <span>Dashboard</span>}
        </Link>

        {/* Administration */}
        <div>
          <button
            onClick={() => {
              if (expanded) {
                setAdminOpen(o => !o);
              } else {
                navigate('/admin/users');
                onClose();
              }
            }}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors
              ${onAdmin ? 'bg-accent-red/10 text-accent-red' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {expanded && (
              <>
                <span className="flex-1 text-left">Administration</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>

          {/* Sub-items */}
          {expanded && adminOpen && (
            <div className="ml-3 mt-0.5 pl-3 border-l border-white/10 flex flex-col gap-0.5">
              {ADMIN_ITEMS.map(({ path, label, icon: Icon }) => (
                <Link key={path} to={path} onClick={onClose}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${isActive(path) ? 'text-white bg-white/8' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

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
          src="/logos/cores_white_side.svg"
          alt="Cores"
          className="h-9"
          style={{ filter: 'drop-shadow(0 0 12px rgba(var(--accent-red-rgb), 0.25))' }}
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
