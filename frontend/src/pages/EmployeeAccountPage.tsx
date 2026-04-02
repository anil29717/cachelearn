import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/api';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

function validateNewPassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  return null;
}

export function EmployeeAccountPage() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const createdLabel = useMemo(() => {
    if (!user?.created_at) return '—';
    try {
      return new Date(user.created_at).toLocaleString();
    } catch {
      return String(user.created_at);
    }
  }, [user?.created_at]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Name must be at least 2 characters.');
      return;
    }
    setNameSaving(true);
    try {
      await apiClient.updateProfile({ name: trimmed });
      await refreshProfile();
      toast.success('Profile updated');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update profile';
      toast.error(msg);
    } finally {
      setNameSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Enter your current password.');
      return;
    }
    const strength = validateNewPassword(newPassword);
    if (strength) {
      toast.error(strength);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('New password must be different from your current password.');
      return;
    }
    setPasswordSaving(true);
    try {
      await apiClient.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      if (err.code === 'WRONG_PASSWORD' || /current password/i.test(String(err.message))) {
        toast.error('Current password is incorrect.');
      } else {
        toast.error(err.message || 'Failed to change password');
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My profile</h1>
          <p className="text-sm text-gray-600">View your account and update your name or password.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Your sign-in identity and display name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Input id="role" value={String(user.role)} readOnly className="bg-gray-50 capitalize" />
            </div>
            <div className="space-y-1.5">
              <Label>Member since</Label>
              <p className="text-sm text-gray-700">{createdLabel}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                autoComplete="name"
                maxLength={120}
              />
            </div>
            <Button type="button" onClick={handleSaveName} disabled={nameSaving || name.trim() === (user.name || '').trim()}>
              {nameSaving ? 'Saving…' : 'Save name'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>
              Use your current password, then choose a strong new password (8+ characters with upper, lower, and a
              number).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(ev) => setCurrentPassword(ev.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(ev) => setNewPassword(ev.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(ev) => setConfirmPassword(ev.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
