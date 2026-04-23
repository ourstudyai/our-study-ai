'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, writeBatch, where } from 'firebase/firestore';

const FAQ_CONTENT: Record<string, { title: string; content: string }> = {
  '/dashboard': { title: 'Dashboard Guide', content: `**Your Dashboard**\n\nBrowse all courses available to your year and department.\n\n**Opening a course**\nTap any course card to enter the AI study chat.\n\n**Navigation**\n- **Library** — Browse indexed study materials\n- **Contribute** — Upload lecture notes and past questions\n- **Admin** — Manage materials (admins only)` },
  '/library': { title: 'Library Guide', content: `**The Materials Library**\n\nA curated collection of approved study materials.\n\n**Study this** — Opens AI chat with material in context.\n**View full text** — Expands extracted text inline.\n**Download** — Approved members only. Links expire in 15 minutes.\n**Bookmarks** — Save materials for later.` },
  '/contribute': { title: 'Contribute Guide', content: `**Contributing Materials**\n\nUpload study materials for your courses.\n\n**What to upload**\n- Freely distributed lecture notes\n- Past exam questions\n- AOC summaries\n- Syllabi\n\n**What NOT to upload**\n- Copyrighted textbooks\n\nMaterials are reviewed by admins before going live.` },
  '/admin': { title: 'Admin Guide', content: `**Admin Panel**\n\nFor administrators only.\n\n**Approve** — Makes material available in the AI system.\n**Quarantine** — Flags problematic content.\n**Add to Index** — Adds approved material to the Library with AI topic generation.\n\nYou can remove materials from the index at any time without deleting them.` },
};

const DEFAULT_FAQ = { title: 'Help & Guide', content: `**St. Jerome's AI**\n\nA study platform for seminary students.\n\n**AI Chat modes**\n- Plain Explainer\n- Practice Questions\n- Exam Prep\n- Research\n\n**Privacy**\nConversations are private. AI does not train on your data.` };

interface AppNavProps { children: React.ReactNode; }

interface AdminNotification {
  id: string;
  type: 'new_upload' | 'admin_action' | 'role_change';
  title: string;
  body: string;
  read: boolean;
  createdAt: any;
  data?: Record<string, string>;
  targetRole?: string;
}

export default function AppNav({ children }: AppNavProps) {
  const { userProfile, firebaseUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [faqOpen, setFaqOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin';
  const isSupreme = firebaseUser?.email === 'ourstudyai@gmail.com';
  const faqKey = Object.keys(FAQ_CONTENT).find(k => pathname.startsWith(k)) ?? '';
  const faq = FAQ_CONTENT[faqKey] ?? DEFAULT_FAQ;

  // ── Listen to admin_notifications ──────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(db, 'admin_notifications'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminNotification));
      // Admins see upload notifications; supreme sees everything
      const filtered = all.filter(n => {
        if (isSupreme) return true;
        return n.type === 'new_upload';
      });
      setNotifications(filtered.slice(0, 30));
    });
    return unsub;
  }, [isAdmin, isSupreme]);

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markAllRead() {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'admin_notifications', n.id), { read: true });
    });
    await batch.commit();
  }

  async function markOneRead(id: string) {
    await updateDoc(doc(db, 'admin_notifications', id), { read: true });
  }

  function timeAgo(ts: any) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function notifBg(type: string) {
    if (type === 'role_change') return 'rgba(239,68,68,0.08)';
    if (type === 'admin_action') return 'rgba(196,160,80,0.06)';
    return 'transparent';
  }

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠', show: true },
    { href: '/library', label: 'Library', icon: '📚', show: true },
    { href: '/contribute', label: 'Contribute', icon: '📤', show: true },
    { href: '/admin', label: 'Admin', icon: '🛡️', show: isAdmin },
  ];

  const linkStyle = (href: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 12px', borderRadius: '10px', width: '100%',
    textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
    fontWeight: pathname === href || pathname.startsWith(href + '/') ? 700 : 500,
    background: pathname === href || pathname.startsWith(href + '/') ? 'rgba(196,160,80,0.15)' : 'transparent',
    color: pathname === href || pathname.startsWith(href + '/') ? 'var(--gold)' : 'var(--text-secondary)',
    border: pathname === href || pathname.startsWith(href + '/') ? '1px solid rgba(196,160,80,0.3)' : '1px solid transparent',
    transition: 'all 0.15s',
  });

  const renderFaq = (text: string) => text.split('\n').map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**') && line.length > 4)
      return <p key={i} style={{ fontWeight: 700, color: 'var(--gold)', marginTop: '16px', marginBottom: '4px', fontFamily: 'Playfair Display, serif' }}>{line.replace(/\*\*/g, '')}</p>;
    if (line.startsWith('- '))
      return <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', paddingLeft: '12px', marginBottom: '3px' }}>• {line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
    if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
    return <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '4px' }}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
  });

  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 0' }}>
      <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0 12px', marginBottom: '4px', marginTop: '8px' }}>Navigation</p>
      {navLinks.filter(l => l.show).map(link => (
        <button key={link.href} onClick={() => { router.push(link.href); onNav?.(); }} style={linkStyle(link.href)}>
          <span>{link.icon}</span>{link.label}
        </button>
      ))}
      <button onClick={() => { setFaqOpen(true); onNav?.(); }}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' }}>
        <span>❓</span>Help & Guide
      </button>
    </div>
  );

  // ── Bell Button ─────────────────────────────────────────────────────────
  const BellButton = ({ size = 'md' }: { size?: 'sm' | 'md' }) => {
    if (!isAdmin) return null;
    return (
      <div ref={notifRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setNotifOpen(o => !o); if (unreadCount > 0) markAllRead(); }}
          style={{
            position: 'relative', background: notifOpen ? 'rgba(196,160,80,0.15)' : 'transparent',
            border: '1px solid var(--border)', borderRadius: '8px',
            padding: size === 'sm' ? '5px 10px' : '7px 10px',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: size === 'sm' ? '1rem' : '1.1rem',
          }}
        >
          🔔
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#ef4444', color: '#fff', borderRadius: '999px',
              fontSize: '0.6rem', fontWeight: 700, minWidth: '16px', height: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>

        {notifOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: '320px', maxHeight: '420px', overflowY: 'auto',
            background: 'var(--navy-card)', border: '1px solid var(--border)',
            borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>Notifications</span>
              {notifications.some(n => !n.read) && (
                <button onClick={markAllRead} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { markOneRead(n.id); router.push(n.type === 'role_change' ? '/admin?tab=users' : '/admin'); setNotifOpen(false); }}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', background: n.read ? 'transparent' : notifBg(n.type),
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{
                        fontSize: '0.8rem', fontWeight: n.read ? 500 : 700,
                        color: n.type === 'role_change' ? '#ef4444' : 'var(--text-primary)',
                        marginBottom: '2px',
                      }}>{n.title}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.body}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                      {!n.read && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: n.type === 'role_change' ? '#ef4444' : 'var(--gold)', display: 'block' }} />}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const Logo = () => (
    <button onClick={() => router.push('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: 'transparent', border: 'none', padding: '0' }}>
      <img src="https://www.retedeldono.it/sites/default/files/images/foto-onlus/Logo_SGE_Bianco.png" alt="St. Jerome's" style={{ width: '32px', height: '32px', objectFit: 'contain', flexShrink: 0 }} />
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: '0.85rem', color: 'var(--gold)', lineHeight: 1.2 }}>St. Jerome's</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.2 }}>AI Study</div>
      </div>
    </button>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--body-bg)', maxWidth: '100vw', overflow: 'hidden' }}>
      <aside className="hidden md:flex" style={{ width: '220px', flexShrink: 0, flexDirection: 'column', background: 'var(--navy-card)', borderRight: '1px solid var(--border)', padding: '20px 12px' }}>
        <div style={{ marginBottom: '24px' }}><Logo /></div>
        <NavLinks />
        {isAdmin && (
          <div style={{ padding: '8px 4px', marginTop: '8px' }}>
            <BellButton size="md" />
          </div>
        )}
        {userProfile && (
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile.displayName || userProfile.email}</p>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>Year {userProfile.year} · {userProfile.department}{isAdmin ? ' · Admin' : ''}</p>
          </div>
        )}
      </aside>

      <div className="md:hidden" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, background: 'var(--navy-card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', height: '52px' }}>
        <Logo />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAdmin && <BellButton size="sm" />}
          <button onClick={() => setFaqOpen(true)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>❓</button>
          <button onClick={() => setMobileNavOpen(true)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px', color: 'var(--text-secondary)', cursor: 'pointer' }}>☰</button>
        </div>
      </div>

      {mobileNavOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)' }} onClick={() => setMobileNavOpen(false)}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '260px', background: 'var(--navy-card)', borderLeft: '1px solid var(--border)', padding: '20px 16px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '1rem' }}>Menu</span>
              <button onClick={() => setMobileNavOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <NavLinks onNav={() => setMobileNavOpen(false)} />
            {userProfile && (
              <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{userProfile.displayName || userProfile.email}</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>Year {userProfile.year} · {userProfile.department}{isAdmin ? ' · Admin' : ''}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <main style={{ flex: 1, minWidth: 0 }} className="pt-[52px] md:pt-0">
        {children}
      </main>

      {faqOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setFaqOpen(false)}>
          <div style={{ background: 'var(--navy-card)', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: '480px', maxHeight: '70vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '1rem' }}>{faq.title}</span>
              <button onClick={() => setFaqOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            {renderFaq(faq.content)}
          </div>
        </div>
      )}
    </div>
  );
}
