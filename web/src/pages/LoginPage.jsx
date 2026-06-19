import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const errors = {
  sign_in_failed: 'Sign-in failed. Try again or contact your admin.',
  account_inactive: 'Your account is inactive.',
  auth_not_configured: 'Google sign-in is not configured on the server yet.',
};

export function LoginPage() {
  const { googleConfigured } = useAuth();
  const [params] = useSearchParams();
  const error = errors[params.get('error')] ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="panel w-full max-w-sm p-8">
        <div className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-brand">Brand Catapult</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">PR Pulse</h1>
          <p className="mt-2 text-2xs leading-relaxed text-ink-secondary">
            Relationship operations for influencer outreach — not a CRM.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-700">
            {error}
          </div>
        )}

        {googleConfigured ? (
          <a href="/api/auth/google" className="btn-primary flex h-10 w-full items-center justify-center text-sm">
            Continue with Google
          </a>
        ) : (
          <div className="rounded-md border border-line bg-canvas px-3 py-3 text-2xs text-ink-secondary">
            Google sign-in needs <code className="text-ink">GOOGLE_CLIENT_ID</code> and{' '}
            <code className="text-ink">GOOGLE_CLIENT_SECRET</code> on Render. Ask your admin to configure them.
          </div>
        )}

        <p className="mt-6 text-center text-2xs text-ink-tertiary">
          Internal use only · Brand Catapult team
        </p>
      </div>
    </div>
  );
}
