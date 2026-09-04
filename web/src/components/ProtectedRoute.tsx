import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen bg-dark flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-red border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?${new URLSearchParams({ redirect }).toString()}`} replace />;
  }
  return <>{children}</>;
}
