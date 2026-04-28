// Dashboard Layout — Sidebar + Navbar + Main Content
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace('/login');
    } else if (!userProfile?.onboardingComplete) {
      router.replace('/onboarding');
    }
  }, [firebaseUser, userProfile, loading, router]);

  if (loading || !firebaseUser || !userProfile?.onboardingComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
        <img src="https://i.imgur.com/MPk1vBA.png" alt="Loading" style={{ width: '64px', height: '64px', objectFit: 'contain', opacity: 0.8, animation: 'pulse 1.5s infinite' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--navy)' }}>
      {/* Sidebar — Hidden on mobile, visible on desktop */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-[var(--sidebar-width)]">
        <Navbar />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
