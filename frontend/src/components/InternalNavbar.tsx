import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';

export function InternalNavbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const homeHref = user?.role === 'admin' ? '/admin' : user ? '/profile' : '/';

  return (
    <nav className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-red-100">
      <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link to={homeHref} className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-600 via-red-500 to-red-400 rounded-xl">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Cache Learning</div>
              <div className="text-[11px] text-gray-500">Internal Knowledge Hub</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  <div className="text-[11px] text-gray-500 capitalize">{user.role}</div>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => navigate('/login')}>
                Login
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

