import React, { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { InternalNavbar } from './components/InternalNavbar';
import { InternalFooter } from './components/InternalFooter';
import { AppRoutes } from './routes/AppRoutes';
import { ToastContainer } from '@/lib/toast';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-gradient-to-br from-white via-red-50 to-red-100">
          <InternalNavbar />
          <ScrollToTop />
          <AppRoutes />
          <InternalFooter />
          <ToastContainer
            position="top-right"
            autoClose={3500}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
