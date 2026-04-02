import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { EmployeeAreaLayout } from '@/pages/EmployeeAreaLayout';
import { EmployeeAccountPage } from '@/pages/EmployeeAccountPage';
import { AdminDashboard } from '@/pages/AdminDashboard';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/profile" element={<EmployeeAreaLayout />}>
        <Route index element={<ProfilePage />} />
        <Route path="account" element={<EmployeeAccountPage />} />
      </Route>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
