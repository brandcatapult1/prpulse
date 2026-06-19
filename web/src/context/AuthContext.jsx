import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await authApi.status();
        setGoogleConfigured(s.google_configured);
        setDevMode(s.dev_mode);
      } catch {
        /* ignore */
      }
      await refresh();
    })();
  }, [refresh]);

  const logout = useCallback(async () => {
    if (devMode) {
      window.location.href = '/';
      return;
    }
    await authApi.logout();
    setUser(null);
    window.location.href = '/login';
  }, [devMode]);

  const value = useMemo(
    () => ({ user, loading, googleConfigured, devMode, logout, refresh }),
    [user, loading, googleConfigured, devMode, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
