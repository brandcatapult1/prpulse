import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function LoginPage() {
  const { devMode, loading } = useAuth();

  useEffect(() => {
    if (devMode) window.location.replace('/');
  }, [devMode]);

  if (loading || devMode) return null;

  return <LoginForm />;
}

function LoginForm() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="panel w-full max-w-sm p-8">
        <div className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-brand">Brand Catapult</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">PR Pulse</h1>
          <p className="mt-2 text-2xs leading-relaxed text-ink-secondary">
            Sign in with Google to continue.
          </p>
        </div>
        <a href="/api/auth/google" className="btn-primary flex h-10 w-full items-center justify-center text-sm">
          Continue with Google
        </a>
      </div>
    </div>
  );
}

export function LoginRedirect() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) return <LoginForm />;
  return <Navigate to="/login" replace />;
}
