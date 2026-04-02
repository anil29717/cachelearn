import React from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, User } from 'lucide-react';

/**
 * Employee-only shell: Library + My profile tabs under the main app navbar.
 */
export function EmployeeAreaLayout() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'border-red-600 text-red-700 bg-white'
        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-200'
    }`;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl gap-1">
          <NavLink to="/profile" end className={tabClass}>
            <BookOpen className="h-4 w-4" />
            Library
          </NavLink>
          <NavLink to="/profile/account" className={tabClass}>
            <User className="h-4 w-4" />
            My profile
          </NavLink>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
