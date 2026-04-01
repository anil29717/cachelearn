import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const u = await signIn(email, password);
      if (u.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/profile');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      
      // Better error message
      if (err.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials.');
      } else {
        setError(err.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // If already signed in (session cookie + profile loaded), redirect away from login
  useEffect(() => {
    if (!loading && user) {
      const role = user.role;
      if (role === 'admin') navigate('/admin');
      else navigate('/profile');
    }
  }, [loading, user]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-red-50 to-red-100 flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-red-200/30 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-red-300/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
      
      <div className="max-w-md w-full relative z-10">
        <Card className="shadow-2xl border-0 backdrop-blur-sm bg-white/90">
          <CardHeader className="text-center space-y-4">
            <div className="relative inline-block mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-500 to-red-400 rounded-2xl blur opacity-50 animate-pulse"></div>
              <div className="relative inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 via-red-500 to-red-400 rounded-2xl shadow-xl">
                <LogIn className="h-8 w-8 text-white" />
              </div>
            </div>
            <div>
              <CardTitle>Welcome Back</CardTitle>
              <CardDescription>Sign in to continue your learning journey</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-12"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600 via-red-500 to-red-400 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="relative w-full bg-gradient-to-r from-red-600 via-red-500 to-red-400 hover:from-red-700 hover:via-red-600 hover:to-red-500 shadow-lg transform hover:scale-105 transition-all duration-300"
                  size="lg"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
