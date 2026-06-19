import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Skeleton } from '../ui/Primitives.jsx';

export function RequireAuth() {
  const { user, loading, devMode } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-48 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }
  if (!user) {
    if (!devMode) return <Navigate to="/login" replace />;
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-center">
        <p className="text-sm text-ink-secondary">
          Dev sign-in failed. Check that <code className="text-ink">DATABASE_URL</code> is set on Render.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
