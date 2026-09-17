import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { hasCsrf, onExpired, refreshSession, setSession } from '@/api/client';
import { authApi, legalApi } from '@/api/endpoints';
import type { Session, User, UserRole } from '@/api/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: Status;
  user: User | null;
  consentsAccepted: boolean;
  completeLogin: (session: Session) => Promise<void>;
  setUser: (user: User) => void;
  refreshConsents: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<Status>('loading');
  const [user, setUserState] = React.useState<User | null>(null);
  const [consentsAccepted, setConsentsAccepted] = React.useState(false);

  const clear = React.useCallback(() => {
    setSession(null, null);
    setUserState(null);
    setConsentsAccepted(false);
    setStatus('anonymous');
    queryClient.clear();
    toast.dismiss();
  }, [queryClient]);

  const refreshConsents = React.useCallback(async () => {
    const s = await legalApi.consentStatus();
    setConsentsAccepted(s.allRequiredAccepted);
  }, []);

  const loadProfile = React.useCallback(async () => {
    const [me, consents] = await Promise.all([authApi.me(), legalApi.consentStatus()]);
    setUserState(me);
    setConsentsAccepted(consents.allRequiredAccepted);
    setStatus('authenticated');
  }, []);

  // Restore the session after a reload (refresh cookie + CSRF token).
  // Signing out in one tab signs out every tab.
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'uzz-csrf' && !e.newValue) clear();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clear]);

  React.useEffect(() => {
    onExpired(clear);
    let cancelled = false;
    (async () => {
      if (!hasCsrf()) return setStatus('anonymous');
      const ok = await refreshSession();
      if (cancelled) return;
      if (!ok) return setStatus('anonymous');
      try {
        await loadProfile();
      } catch {
        if (!cancelled) clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear, loadProfile]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      consentsAccepted,
      completeLogin: async (session) => {
        setSession(session.accessToken, session.csrfToken);
        setUserState(session.user);
        await loadProfile();
      },
      setUser: setUserState,
      refreshConsents,
      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          /* the local session is cleared regardless */
        }
        clear();
      },
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [status, user, consentsAccepted, loadProfile, refreshConsents, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The signed-in user (only use under a protected route). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser without a session');
  return user;
}
