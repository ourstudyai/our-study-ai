'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import { useState } from 'react';
import MobileMenu from './MobileMenu';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [showMenu, setShowMenu] = useState(false);

  const { userProfile } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const isOnCourse = pathname.includes('/course/');
  const isOnDashboard = pathname === '/dashboard';

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t"
        style={{
          background: 'var(--navy-mid)',
          borderColor: 'var(--border)',
          height: '60px',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Home */}
        <button
          onClick={() => router.push('/dashboard')}
          className="flex flex-col items-center gap-0.5 px-5 py-2 transition-all"
          style={{ color: isOnDashboard ? 'var(--gold-light)' : 'var(--text-muted)' }}
        >
          <span className="text-xl">🏠</span>
          <span className="text-xs font-medium">Home</span>
        </button>

        {/* Courses */}
        <button
          onClick={() => setShowMenu(true)}
          className="flex flex-col items-center gap-0.5 px-5 py-2 transition-all"
          style={{ color: isOnCourse ? 'var(--gold-light)' : 'var(--text-muted)' }}
        >
          <span className="text-xl">📚</span>
          <span className="text-xs font-medium">Courses</span>
        </button>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          className="flex flex-col items-center gap-0.5 px-5 py-2 transition-all"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="text-xl">👤</span>
          <span className="text-xs font-medium">Sign Out</span>
        </button>
      </nav>

      {showMenu && <MobileMenu onClose={() => setShowMenu(false)} />}
    </>
  );
}