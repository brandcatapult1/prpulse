import { useCallback, useEffect, useState } from 'react';
import { loadOrgLogoUrl, ORG_LOGO_CHANGED } from '../lib/orgBranding.js';

export function useOrgLogo() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = await loadOrgLogoUrl();
      setLogoUrl(url);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(ORG_LOGO_CHANGED, refresh);
    return () => window.removeEventListener(ORG_LOGO_CHANGED, refresh);
  }, [refresh]);

  return { logoUrl, loading, refresh };
}
