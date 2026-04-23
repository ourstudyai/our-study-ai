// Login Page — Premium Google Sign-In
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInWithGoogle } from '@/lib/firebase/auth';
import { getOrCreateUserProfile } from '@/lib/firestore/users';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (firebaseUser && userProfile?.onboardingComplete) {
      router.replace('/dashboard');
    } else if (firebaseUser && !userProfile?.onboardingComplete) {
      router.replace('/onboarding');
    }
  }, [firebaseUser, userProfile, loading, router]);

    const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      await getOrCreateUserProfile(
        user.uid,
        user.email || '',
        user.displayName || '',
        user.photoURL || undefined
      );
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
        <div className="pulse-dot" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'var(--navy)' }}>

      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(124, 108, 240, 0.4), transparent 70%)' }} />
        <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(201, 168, 76, 0.4), transparent 70%)' }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.2), transparent)' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-seminary-gold via-seminary-burgundy to-seminary-navy flex items-center justify-center shadow-2xl">
                <span className="text-3xl font-bold text-white font-display">S</span>
              </div>
              <div className="absolute -inset-1 rounded-2xl glow-gold opacity-40" />
            </div>
          </div>
          <h1 className="text-3xl font-bold font-display tracking-tight mb-2"
            style={{ color: 'var(--text-primary)' }}>
            Our Study AI
          </h1>
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
            St. Jerome&apos;s Formation House
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="w-8 h-px" style={{ background: 'var(--color-gold)' }} />
            <span className="text-xs tracking-[0.2em] uppercase font-medium"
              style={{ color: 'var(--color-gold)' }}>
              Lux in Tenebris
            </span>
            <div className="w-8 h-px" style={{ background: 'var(--color-gold)' }} />
          </div>
        </div>

        {/* Sign-in Card */}
        <div className="card p-8 shadow-gold">
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome Back
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Sign in with your seminary Google account to continue
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-xl border"
              style={{ background: 'rgba(239, 71, 111, 0.1)', borderColor: 'rgba(239, 71, 111, 0.3)' }}>
              <p className="text-sm" style={{ color: '#ef476f' }}>{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 border disabled:opacity-50 disabled:cursor-not-allowed group"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              borderColor: 'var(--border)',
            }}
            id="google-sign-in-button"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Signing in...</span>
              </>
            ) : (
              <>
                {/* Google Icon */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="group-hover:text-white transition-colors"
                  style={{ color: 'var(--text-primary)' }}>
                  Continue with Google
                </span>
              </>
            )}
          </button>

          <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Your study data is private and secure.
            <br />
            AI does not train on your conversations.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-8" style={{ color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} Our Study AI · A Catholic seminary learning tool
        </p>
      </div>
    </div>
  );
}
