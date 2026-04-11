// Root Page — Redirect based on auth state
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function RootPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace('/login');
    } else if (!userProfile?.onboardingComplete) {
      router.replace('/onboarding');
    } else {
      router.replace('/dashboard');
    }
  }, [firebaseUser, userProfile, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-seminary-gold to-seminary-burgundy flex items-center justify-center">
            <span className="text-2xl font-bold text-white font-display">S</span>
          </div>
          <div className="absolute inset-0 rounded-2xl glow-gold animate-pulse-soft" />
        </div>
        <div className="flex items-center gap-2">
          <div className="pulse-dot" />
          <span className="text-sm text-[var(--text-muted)]">Loading...</span>
        </div>
      </div>
    </div>
  );
}
