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
          <img src="https://i.imgur.com/MPk1vBA.png" alt="Lux Studiorum" style={{ width: '72px', height: '72px', objectFit: 'contain' }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="pulse-dot" />
          <span className="text-sm text-[var(--text-muted)]">Loading...</span>
        </div>
      </div>
    </div>
  );
}
