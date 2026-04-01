import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import HeroCarousel from '../components/HeroCarousel';

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    navigate(user.role === 'admin' ? '/admin' : '/profile', { replace: true });
  }, [user, navigate]);

  if (user) return null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gray-50">
      <HeroCarousel />

      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-red-100 bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-700">
              Organization Learning & Content Platform
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              One secure place for internal videos, documents, and team knowledge.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-gray-600">
              Admins organize folders and manage access. Employees open only the content shared
              with them, without the clutter of the old public LMS experience.
            </p>
          </div>

          <div className="rounded-[28px] border border-gray-200 bg-gradient-to-br from-gray-900 to-gray-800 p-8 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-300">
              Private Access
            </p>
            <p className="mt-4 text-lg leading-8 text-gray-100">
              Internal use only. If you do not have credentials, contact your admin for account
              setup and folder access.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">Centralized Content</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Keep internal videos and documents in one place for the whole organization.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">Secure Access</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Role-based access ensures admins and employees only see the right content.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">Structured by Folders</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Organize knowledge by department, topic, or workflow for faster discovery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
