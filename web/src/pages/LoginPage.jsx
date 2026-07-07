import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { GlassTile } from '../components/ui/Primitives.jsx';
import { DEFAULT_DEMO_ORG_LOGO, loadPublicOrgLogoUrl } from '../lib/orgBranding.js';

const LOGIN_ERROR_MESSAGES = {
  not_allowlisted: "You don't have access to PR Pulse. Please ask your admin to add you.",
  account_inactive: 'Your access has been deactivated. Please contact your admin.',
  sign_in_failed: "Sign-in didn't complete. Please try again.",
  auth_not_configured: 'Sign-in is not available right now.',
};

function loginErrorMessage(errorKey) {
  if (!errorKey) return null;
  return LOGIN_ERROR_MESSAGES[errorKey] ?? null;
}

export function LoginPage() {
  const { loading } = useAuth();
  const [searchParams] = useSearchParams();
  const errorKey = searchParams.get('error');
  const errorMessage = useMemo(() => loginErrorMessage(errorKey), [errorKey]);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_DEMO_ORG_LOGO);

  useEffect(() => {
    loadPublicOrgLogoUrl().then((url) => {
      setLogoUrl(url ?? DEFAULT_DEMO_ORG_LOGO);
    });
  }, []);

  if (loading) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <GlassTile className="w-full max-w-sm px-6 py-9 text-center sm:px-8 sm:py-10">
        <img
          src={logoUrl}
          alt=""
          className="mx-auto h-11 w-auto max-w-[220px] object-contain sm:h-12"
          decoding="async"
        />
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">PR Pulse</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          Relationship operations for Brand Catapult
        </p>

        {errorMessage && (
          <p
            className="mt-6 rounded-lg border border-line/70 bg-canvas/80 px-4 py-3 text-2xs leading-relaxed text-ink-secondary"
            role="status"
          >
            {errorMessage}
          </p>
        )}

        <a
          href="/api/auth/google"
          className={`btn-primary flex h-11 w-full items-center justify-center rounded-lg text-sm ${
            errorMessage ? 'mt-4' : 'mt-8'
          }`}
        >
          Continue with Google
        </a>
      </GlassTile>
    </div>
  );
}

export function LoginRedirect() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) return <LoginPage />;
  return <Navigate to="/login" replace />;
}
