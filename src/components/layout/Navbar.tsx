// Navbar — Top bar with hamburger menu for mobile
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import MobileMenu from './MobileMenu';

export default function Navbar() {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { userProfile } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <>
      <nav
        className="flex items-center justify-between px-4 border-b flex-shrink-0"
        style={{
          height: 'var(--navbar-height)',
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Left — Mobile hamburger + Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMobileMenu(true)}
            className="md:hidden btn-ghost text-lg"
            id="mobile-menu-button"
          >
            ☰
          </button>
          <div className="md:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-seminary-gold to-seminary-burgundy flex items-center justify-center">
              <span className="text-sm font-bold text-white font-display">S</span>
            </div>
            <span className="text-sm font-bold font-display">Our Study AI</span>
          </div>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-2">
          {/* Help button */}
          <button className="btn-ghost text-sm" title="Help & FAQ">
            ❓
          </button>

          {/* Profile (mobile only) */}
          <div className="md:hidden flex items-center">
            <button className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center"
              onClick={handleSignOut}
              title="Sign out">
              <span className="text-xs font-bold text-white">
                {userProfile?.displayName?.[0] || '?'}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <MobileMenu onClose={() => setShowMobileMenu(false)} />
      )}
    </>
  );
}
