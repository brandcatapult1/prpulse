import { useCallback, useEffect, useState } from 'react';
import { loadOrgLogoUrl, ORG_LOGO_CHANGED } from '../lib/orgBranding.js';

export function useOrgLogo({ demoMode = true } = {}) {
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = await loadOrgLogoUrl({ demoMode });
      setLogoUrl(url);
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => {
      refresh();
    };
    window.addEventListener(ORG_LOGO_CHANGED, onChange);
    return () => window.removeEventListener(ORG_LOGO_CHANGED, onChange);
  }, [refresh]);

  return { logoUrl, loading, refresh };
}
