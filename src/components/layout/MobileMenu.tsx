'use client';

import { useState } from 'react';
import SettingsPanel from '@/components/SettingsPanel';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import { updateUserProfile, softDeleteUserAccount } from '@/lib/firestore/users';

const LOGO = 'https://i.imgur.com/MPk1vBA.png';
const SUPREME = 'ourstudyai@gmail.com';
const DEPARTMENTS = ['philosophy', 'theology'];
const YEARS = [1, 2, 3, 4];
const SEMESTERS = [1, 2];

interface MobileMenuProps { onClose: () => void; }

export default function MobileMenu({ onClose }: MobileMenuProps) {
  const { userProfile, firebaseUser, refreshProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Profile edit state
  const [editDept, setEditDept] = useState(userProfile?.department ?? '');
  const [editYear, setEditYear] = useState<number | ''>(userProfile?.year ?? '');
  const [editSem, setEditSem] = useState<number | ''>(userProfile?.currentSemester ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;

  const handleNav = (href: string) => {
    router.push(href);
    onClose();
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
    onClose();
  };

  const handleDeleteAccount = async () => {
    if (!firebaseUser || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      await softDeleteUserAccount(firebaseUser.uid);
      await firebaseUser.delete();
      router.replace('/login');
    } catch {
      setSaveMsg('❌ Delete failed. Please sign out and sign in again first.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!firebaseUser || !editDept || !editYear || !editSem) return;
    setSaving(true);
    try {
      await updateUserProfile(firebaseUser.uid, {
        department: editDept as any,
        year: Number(editYear),
        currentSemester: Number(editSem),
      });
      await refreshProfile();
      setSaveMsg('✅ Saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setSaveMsg('❌ Failed');
    } finally {
      setSaving(false);
    }
  };

  const readinessDot = (status?: string) => {
    if (status === 'verified') return '#22c55e';
    if (status === 'partial') return '#facc15';
    return '#ef4444';
  };

  const navBtn = (href: string, icon: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <button
        key={href}
        onClick={() => handleNav(href)}
        className="w-full text-left p-3 rounded-xl mb-1 flex items-center gap-3 transition-all"
        style={{
          background: active ? 'var(--gold-dim)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${active ? 'rgba(201,150,58,0.3)' : 'var(--border)'}`,
          color: active ? 'var(--gold-light)' : 'var(--text-primary)',
        }}
      >
        <span>{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </button>
    );
  };

  if (showSignOutConfirm) return (
    <div className="fixed inset-0 z-50 md:hidden flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)' }}>
        <p className="text-2xl mb-3">👋</p>
        <p className="font-bold mb-1" style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)' }}>Sign out?</p>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>You'll need to sign in again to continue studying.</p>
        <div className="flex gap-3">
          <button onClick={() => setShowSignOutConfirm(false)}
            className="flex-1 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleSignOut}
            className="flex-1 py-2 rounded-xl text-sm font-bold"
            style={{ background: '#ef4444', color: 'white', border: 'none' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  if (showProfile) return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col" style={{ background: 'var(--navy)' }}>
      <div className="flex items-center gap-3 p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setShowProfile(false)} className="btn-ghost text-lg">←</button>
        <span className="font-bold" style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)' }}>My Profile</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* Identity */}
        <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--gold-dim)', border: '1px solid var(--border-hover)' }}>
              <span className="text-lg font-bold" style={{ color: 'var(--gold-light)' }}>{userProfile?.displayName?.[0] || '?'}</span>
            </div>
            <div>
              <p className="font-bold text-sm">{userProfile?.displayName}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{userProfile?.email}</p>
              <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
                style={{ background: 'var(--gold-dim)', color: 'var(--gold-light)', border: '1px solid rgba(201,150,58,0.3)' }}>
                {isAdmin ? (firebaseUser?.email === SUPREME ? '⭐ Supreme Admin' : '🛡️ Admin') : '🎓 Student'}
              </span>
            </div>
          </div>
        </div>

        {/* Academic info */}
        <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--navy-mid)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--gold)', opacity: 0.7 }}>Academic Profile</p>
          <div className="flex flex-col gap-2 mb-3">
            <select value={editDept} onChange={e => setEditDept(e.target.value)}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Department</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
            <div className="flex gap-2">
              <select value={editYear} onChange={e => setEditYear(Number(e.target.value))}
                className="flex-1 p-2 rounded-lg text-sm"
                style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Year</option>
                {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
              <select value={editSem} onChange={e => setEditSem(Number(e.target.value))}
                className="flex-1 p-2 rounded-lg text-sm"
                style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Semester</option>
                {SEMESTERS.map(s => <option key={s} value={s}>Sem {s}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full py-2 rounded-xl text-sm font-bold"
            style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saveMsg && <p className="text-center text-xs mt-2">{saveMsg}</p>}
        </div>

        {/* Sign out */}
        <button onClick={() => setShowSignOutConfirm(true)}
          className="w-full py-3 rounded-xl text-sm font-bold mb-3"
          style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}>
          Sign Out
        </button>

        {/* Delete account */}
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-2 rounded-xl text-xs"
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            Delete Account
          </button>
        ) : (
          <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#ef4444' }}>⚠️ Delete Account</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Your account will be deactivated. Your contributions remain available to the community. This cannot be undone. Type DELETE to confirm.</p>
            <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full p-2 rounded-lg text-sm mb-2"
              style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                className="flex-1 py-2 rounded-lg text-xs"
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeleteAccount} disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="flex-1 py-2 rounded-lg text-xs font-bold"
                style={{ background: deleteConfirmText === 'DELETE' ? '#ef4444' : 'var(--navy)', color: deleteConfirmText === 'DELETE' ? '#fff' : 'var(--text-muted)', border: 'none', cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed' }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 md:hidden flex flex-col animate-fade-in" style={{ background: 'var(--navy)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <img src={LOGO} alt="Onus Meum Leve" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <div>
            <h1 className="text-sm font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>Lux Studiorum</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {userProfile?.department === 'theology' ? '✝️ Theology' : '🏛️ Philosophy'} · Year {userProfile?.year} · Sem {userProfile?.currentSemester}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost text-xl px-3 py-2">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Nav links */}
        <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Navigate</p>
        {navBtn('/dashboard', '🏠', 'Dashboard')}
        {navBtn('/library', '📚', 'Library')}
        {navBtn('/contribute', '📤', 'Contribute')}
        {isAdmin && navBtn('/admin', '🛡️', 'Admin Panel')}
        <button
          onClick={() => setShowSettings(true)}
          className="w-full text-left p-3 rounded-xl mb-1 flex items-center gap-3 transition-all"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <span>⚙️</span>
          <span className="text-sm font-medium">Settings</span>
        </button>
      </div>

      {/* Footer — profile button */}
      <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setShowProfile(true)}
          className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--gold-dim)', border: '1px solid var(--border-hover)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>{userProfile?.displayName?.[0] || '?'}</span>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium truncate">{userProfile?.displayName}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{userProfile?.email}</p>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>›</span>
        </button>
      </div>
    </div>

    <SettingsPanel externalOpen={showSettings} onClose={() => setShowSettings(false)} />
  );
}
