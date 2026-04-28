// Navbar — Top bar with hamburger menu for mobile
'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import MobileMenu from './MobileMenu';

export default function Navbar() {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const HELP: Record<string, { title: string; content: string }> = {
    '/dashboard': { title: 'Dashboard Guide', content: 'Browse all courses. Tap any course to open the AI study chat. Use the menu (☰) to navigate to Library, Contribute, or Admin.' },
    '/library': { title: 'Library Guide', content: 'Browse approved study materials. Download, bookmark, or open any material in the AI chat. Admins can remove materials from the index.' },
    '/contribute': { title: 'Contribute Guide', content: 'Upload lecture notes, past questions, AOCs, or syllabi. Choose a course manually or let AI detect it. Materials are reviewed before going live.' },
    '/admin': { title: 'Admin Guide', content: 'Review uploaded materials. Approve to make them available in the AI system. Quarantine problematic content. Add to Index to make them searchable in the Library.' },
  };
  const helpKey = Object.keys(HELP).find(k => pathname.startsWith(k)) ?? '';
  const help = HELP[helpKey] ?? { title: 'Help & Guide', content: "Lux Studiorum is a study platform for seminary students. Use the menu to navigate between Dashboard, Library, Contribute, and Admin." };

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
          background: 'var(--navy-mid)',
          borderColor: 'var(--border)',
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
            <img src="https://i.imgur.com/MPk1vBA.png" alt="Onus Meum Leve" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            <span className="text-sm font-bold font-display">Lux Studiorum</span>
          </div>
        </div>

        {/* Right — Actions */}
        <div className="flex items-center gap-2">
          {/* Help button */}
          <button className="btn-ghost text-sm" title="Help & FAQ" onClick={() => setShowHelp(true)}>
            ❓
          </button>

          {/* Profile (mobile only) */}
          <div className="md:hidden flex items-center">
            <button className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center"
              onClick={() => setShowSignOutConfirm(true)}
              title="Profile">
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

      {/* Help panel */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowHelp(false)}>
          <div className="w-full max-w-lg rounded-t-2xl p-6" style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)', maxHeight: '60vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold" style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)' }}>{help.title}</span>
              <button onClick={() => setShowHelp(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7 }}>{help.content}</p>
          </div>
        </div>
      )}

      {/* Sign out confirmation */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)' }}>
            <p className="text-2xl mb-3">👋</p>
            <p className="font-bold mb-1" style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)' }}>Sign out?</p>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>You'll need to sign in again to continue studying.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSignOut}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer' }}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
