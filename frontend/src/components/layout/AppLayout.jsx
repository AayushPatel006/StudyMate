import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, ListChecks, CalendarDays, Clock, Settings, Sparkles, Menu, X, LogOut } from 'lucide-react';
import { Logo, cx } from '../ui/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'My Tasks', icon: ListChecks },
  { to: '/planner', label: 'Study Planner', icon: CalendarDays },
  { to: '/availability', label: 'Availability', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavItem({ item, onClick }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        cx(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
          isActive ? 'bg-white text-slate-900 shadow-soft ring-1 ring-slate-200/80' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cx('size-[18px]', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const [ai, setAi] = useState(null);
  useEffect(() => {
    api.get('/ai/status').then((r) => setAi(r.data)).catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-6">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => (
          <NavItem key={item.to} item={item} onClick={onNavigate} />
        ))}
        <p className="px-2.5 pt-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">AI</p>
        <NavLink
          to="/assistant"
          onClick={onNavigate}
          className={({ isActive }) =>
            cx('group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition', isActive ? 'bg-white text-slate-900 shadow-soft ring-1 ring-slate-200/80' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900')
          }
        >
          <span className="ai-gradient flex size-[18px] items-center justify-center rounded-[5px]">
            <Sparkles className="size-3 text-white" />
          </span>
          AI Assistant
        </NavLink>
      </nav>

      <div className="space-y-3 p-3">
        {ai && (
          <NavLink to="/settings" onClick={onNavigate} className="block rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 shadow-soft hover:border-slate-300">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span className={cx('size-2 rounded-full', ai.configured ? 'bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]' : 'bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.2)]')} />
              {ai.configured ? 'Gemini connected' : 'Fallback mode'}
            </div>
            <p className="mt-0.5 truncate pl-4 text-[11px] text-slate-500">{ai.configured ? `${ai.model} · free tier` : 'Built-in scheduler active'}</p>
          </NavLink>
        )}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-semibold text-white">
            {user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700" title="Log out" aria-label="Log out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200/80 bg-slate-100/70 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in bg-slate-50 shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
