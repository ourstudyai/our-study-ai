'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import BottomNav from '@/components/layout/BottomNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
        <div className="pulse-dot" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--navy)' }}>
      {/* Sidebar — desktop only */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-[var(--sidebar-width)]">
        <Navbar />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav />
    </div>
  );
}