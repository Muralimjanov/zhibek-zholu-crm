import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Menu, Moon, Sun, UserRound, X } from 'lucide-react';
import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { fetchObjectUrl } from '@/api/client';
import { useAuth, useUser } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/misc';
import { useTheme } from '@/hooks/useTheme';
import { ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { GROUP_LABELS, SHIFT_ROLES, navFor, type NavItem } from './nav';
import { ShiftControl } from './ShiftControl';

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="grid size-9 place-items-center rounded-lg bg-white/10 font-mono text-sm font-bold text-white" aria-hidden>
        УЖЖ
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-white">Улуу Жибек Жолу</p>
        <p className="truncate text-xs text-sidebar-muted">CRM</p>
      </div>
    </div>
  );
}

function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const groups = (Object.keys(GROUP_LABELS) as NavItem['group'][]).map((g) => [g, items.filter((i) => i.group === g)] as const).filter(([, list]) => list.length);
  return (
    <nav aria-label="Основное меню" className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
      {groups.map(([g, list]) => (
        <div key={g}>
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">{GROUP_LABELS[g]}</p>
          <ul className="space-y-0.5">
            {list.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/5 hover:text-white',
                      isActive && 'bg-sidebar-active text-white shadow-[inset_3px_0_0_0_#5eead4]',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Avatar({ user, size = 32 }: { user: { id: string; fullName: string; avatarUrl: string | null }; size?: number }) {
  const { data: url } = useQuery({
    queryKey: ['avatar', user.id, user.avatarUrl],
    queryFn: () => fetchObjectUrl(`/${user.avatarUrl}`),
    enabled: Boolean(user.avatarUrl),
    staleTime: Infinity,
  });
  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary" style={{ width: size, height: size }} aria-hidden>
      {initials || '?'}
    </span>
  );
}

export function AppShell() {
  const user = useUser();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const items = navFor(user.role);
  const mainRef = React.useRef<HTMLElement>(null);

  // Move focus to the page content on navigation (screen readers).
  React.useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        К содержимому
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col bg-sidebar lg:flex">
        <Brand />
        <SidebarNav items={items} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="uzz-fade fixed inset-0 z-50 bg-black/50 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl lg:hidden">
            <DialogPrimitive.Title className="sr-only">Меню</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Разделы CRM</DialogPrimitive.Description>
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label="Закрыть меню">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <SidebarNav items={items} onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Открыть меню">
            <Menu />
          </Button>
          <div className="flex-1" />
          {SHIFT_ROLES.includes(user.role) && <ShiftControl compact />}
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-10 items-center gap-2 rounded-md px-1.5 hover:bg-muted" aria-label="Меню пользователя">
                <Avatar user={user} />
                <span className="hidden max-w-40 text-left leading-tight md:block">
                  <span className="block truncate text-[13px] font-medium">{user.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => navigate('/profile')}>
                <UserRound /> Профиль
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => void logout().then(() => navigate('/login', { replace: true, state: null }))}>
                <LogOut /> Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 outline-none sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
