'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  getMaterialsByStatus,
  updateMaterialStatus,
  updateMaterial,
} from '@/lib/firestore/materials';
import { db } from '@/lib/firebase/config';
import {
  collection, getDocs, query, orderBy, where,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { Material } from '@/lib/firestore/materials';
import AppNav from '@/components/AppNav';
import ApprovalModal from '@/components/admin/ApprovalModal';

const SUPREME = 'ourstudyai@gmail.com';

type Tab = 'pending' | 'approved' | 'quarantined' | 'resurrection' |
           'users' | 'reports' | 'courses' | 'timetables' | 'assignments';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'pending',      label: 'Pending',     icon: '⏳' },
  { key: 'approved',     label: 'Approved',    icon: '✓' },
  { key: 'quarantined',  label: 'Quarantined', icon: '⚠' },
  { key: 'resurrection', label: 'Resurrection',icon: '↺' },
  { key: 'courses',      label: 'Courses',     icon: '📚' },
  { key: 'assignments',  label: 'Assignments', icon: '📋' },
  { key: 'timetables',   label: 'Timetables',  icon: '🗓' },
  { key: 'users',        label: 'Users',       icon: '👥' },
  { key: 'reports',      label: 'Reports',     icon: '📊' },
];

type Course = { id: string; name: string; code?: string; department: string; year: number; semester: number; description?: string };

export default function AdminPage() {
  const { userProfile, firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;

  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending]       = useState<Material[]>([]);
  const [approved, setApproved]     = useState<Material[]>([]);
  const [quarantined, setQuarantined] = useState<Material[]>([]);
  const [resurrection, setResurrection] = useState<Material[]>([]);
  const [users, setUsers]           = useState<never[]>([]);
  const [courses, setCourses]       = useState<Course[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Material | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch]         = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [p, a, q, r] = await Promise.all([
        getMaterialsByStatus('pending_review'),
        getMaterialsByStatus('approved'),
        getMaterialsByStatus('quarantined'),
        getMaterialsByStatus('ocr_pending'),
      ]);
      setPending(p); setApproved(a); setQuarantined(q); setResurrection(r);
      const cSnap = await getDocs(query(collection(db, 'courses'), orderBy('name')));
      setCourses(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (!isAdmin) { router.replace('/dashboard'); return; }
    load();
  }, [authLoading, firebaseUser, isAdmin, load, router]);

  function filterAndSort(list: Material[]) {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(m =>
      m.fileName?.toLowerCase().includes(q) ||
      m.uploaderEmail?.toLowerCase().includes(q) ||
      m.suggestedCourseName?.toLowerCase().includes(q) ||
      m.detectedCourseName?.toLowerCase().includes(q)
    );
  }

  const listMap: Partial<Record<Tab, Material[]>> = {
    pending: filterAndSort(pending),
    approved: filterAndSort(approved),
    quarantined: filterAndSort(quarantined),
    resurrection: filterAndSort(resurrection),
  };

  const counts: Partial<Record<Tab, number>> = {
    pending: pending.length,
    approved: approved.length,
    quarantined: quarantined.length,
    resurrection: resurrection.length,
    courses: courses.length,
  };

  async function handleApprove(m: Material, courseId?: string, courseName?: string) {
    setActionLoading(true);
    try {
      await updateMaterial(m.id, { status: 'approved', confirmedCourseId: courseId ?? m.suggestedCourseId ?? '', confirmedCourseName: courseName ?? m.suggestedCourseName ?? '' });
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  async function handleReject(m: Material) {
    setActionLoading(true);
    try {
      await updateMaterialStatus(m.id, 'ocr_pending');
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  async function handleDelete(m: Material) {
    if (!window.confirm('Permanently delete this material?')) return;
    setActionLoading(true);
    try {
      await updateMaterialStatus(m.id, 'quarantined');
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  async function handleQuarantine(m: Material) {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'materials', m.id), { status: 'quarantined' });
      await load();
      setDrawerOpen(false); setSelected(null);
    } finally { setActionLoading(false); }
  }

  function openDetail(m: Material) { setSelected(m); if (m.status === 'pending_review' || m.status === 'ocr_pending') { setApprovalOpen(true); } else { setDrawerOpen(true); } }

  if (authLoading || loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--gold)', fontSize: '0.8rem', opacity: 0.7 }}>Loading</p>
      </div>
    </div>
  );

  const currentList = listMap[tab] ?? [];

  function MainContent() {
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
          <div>
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 2 }}>
              {TABS.find(t => t.key === tab)?.icon} {TABS.find(t => t.key === tab)?.label}
            </p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.3rem', fontWeight: 700 }}>Admin Panel</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isChiefAdmin && <span style={{ fontSize: '0.65rem', background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: 99, padding: '3px 9px', color: 'var(--gold)' }}>★ Chief</span>}
          </div>
        </div>

        {/* Search */}
        {['pending','approved','quarantined','resurrection'].includes(tab) && (
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search filename, course, email…"
            style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 14, boxSizing: 'border-box' as const }}
          />
        )}

        {/* Material list */}
        {['pending','approved','quarantined','resurrection'].includes(tab) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <p style={{ fontSize: '2rem', marginBottom: 8 }}>✓</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>All clear — nothing {tab === 'pending' ? 'pending review' : tab}.</p>
              </div>
            ) : currentList.map(m => {
              const isHighConf = m.confidence === 'high' && m.suggestedCourseId;
              return (
                <div key={m.id} className="card-hover" onClick={() => openDetail(m)} style={{
                  background: 'var(--navy-card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{m.fileName}</p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>{m.uploaderEmail}</p>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {m.category && <span style={{ fontSize: '0.62rem', background: 'rgba(196,160,80,0.08)', color: 'var(--gold)', borderRadius: 99, padding: '1px 7px' }}>{m.category.replace('_',' ')}</span>}
                        {m.confidence && <span style={{ fontSize: '0.62rem', color: m.confidence === 'high' ? '#22c55e' : '#eab308' }}>● {m.confidence}</span>}
                        {m.wordCount ? <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{m.wordCount.toLocaleString()} words</span> : null}
                      </div>
                      {(m.suggestedCourseName || m.detectedCourseName) && (
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          📖 {m.suggestedCourseName || m.detectedCourseName}
                        </p>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {isHighConf && <span style={{ fontSize: '0.6rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 99, padding: '1px 6px' }}>Auto-ready</span>}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Courses tab */}
        {tab === 'courses' && <CoursesPanel courses={courses} onRefresh={load} />}

        {/* Assignments tab */}
        {tab === 'assignments' && <AssignmentsPanel courses={courses} />}

        {/* Users tab */}
        {tab === 'users' && <UsersPanel currentUserEmail={firebaseUser?.email ?? ''} />}

        {/* Reports tab */}
        {tab === 'reports' && <div className="p-6" style={{color:'var(--text-muted)'}}>Reports coming soon.</div>}

        {/* Timetables tab */}
        {tab === 'timetables' && <TimetablesPanel courses={courses} />}
      </div>
    );
  }


  return (
    <AppNav>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .tab-bar::-webkit-scrollbar { display: none; }
        .tab-bar { -ms-overflow-style: none; scrollbar-width: none; }
        .card-hover { transition: border-color 0.15s, background 0.15s; }
        .card-hover:hover { border-color: rgba(196,160,80,0.4) !important; background: rgba(196,160,80,0.04) !important; }
        @media (max-width: 899px) {
          .main-content { padding-bottom: 80px !important; }
        }
      `}</style>
      {/* ── Mobile Tab Bar ── */}
      <div className="lg:hidden tab-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--navy-card)', borderTop: '1px solid var(--border)',
        display: 'flex', overflowX: 'auto', padding: '8px 0 12px',
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '4px 14px', background: 'transparent', border: 'none',
            color: tab === t.key ? 'var(--gold)' : 'var(--text-muted)',
            fontSize: '0.6rem', fontWeight: tab === t.key ? 700 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            borderTop: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: '1rem' }}>{t.icon}</span>
            {t.label}
            {counts[t.key] ? (
              <span style={{ fontSize: '0.58rem', fontWeight: 700,
                color: t.key === 'quarantined' ? '#ef4444' : '#eab308' }}>
                {counts[t.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Desktop layout wrapper ── */}
      <div className="hidden lg:flex" style={{ flex: 1, minHeight: '100dvh', paddingTop: '56px' }}>

        {/* Desktop admin tab sidebar */}
        <div style={{
          width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--navy-card)', borderRight: '1px solid var(--border)',
          padding: '20px 0', overflowY: 'auto',
        }}>
          <div style={{ padding: '0 16px 16px' }}>
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 4 }}>Admin Panel</p>
            {isChiefAdmin && <span style={{ fontSize: '0.62rem', background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: 99, padding: '2px 8px', color: 'var(--gold)' }}>★ Chief Admin</span>}
          </div>
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
            {[{ label: 'Pending', val: pending.length, color: '#eab308' }, { label: 'Quarantined', val: quarantined.length, color: '#ef4444' }].map(s => s.val > 0 ? (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(196,160,80,0.06)', borderRadius: 6, padding: '3px 10px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: s.color }}>{s.val}</span>
              </div>
            ) : null)}
          </div>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
              background: tab === t.key ? 'rgba(196,160,80,0.1)' : 'transparent',
              border: 'none', borderLeft: tab === t.key ? '3px solid var(--gold)' : '3px solid transparent',
              color: tab === t.key ? 'var(--gold)' : 'var(--text-muted)',
              fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400,
              cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '0.85rem' }}>{t.icon}</span>
              {t.label}
              {counts[t.key] ? (
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700,
                  color: t.key === 'quarantined' ? '#ef4444' : t.key === 'pending' ? '#eab308' : 'var(--gold)',
                  background: 'rgba(196,160,80,0.1)', borderRadius: 99, padding: '1px 6px' }}>
                  {counts[t.key]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Desktop main content */}
        <div style={{ flex: 1, minHeight: '100dvh', background: 'var(--navy)', padding: '16px', paddingTop: '72px', overflowY: 'auto', minWidth: 0 }}>
          <MainContent />
        </div>
      </div>

      {/* Mobile main content */}
      <div className="lg:hidden" style={{ background: 'var(--navy)', padding: '16px', paddingTop: '68px', paddingBottom: '80px', minHeight: '100dvh' }}>
        <MainContent />
      </div>

      {/* Detail Drawer */}
      {drawerOpen && selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)' }} onClick={() => setDrawerOpen(false)}>
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70,
            background: 'var(--navy-card)', borderTop: '1px solid var(--border)',
            borderRadius: '20px 20px 0 0', maxHeight: '90dvh', overflowY: 'auto',
            animation: 'slideUp 0.25s ease',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 99 }} />
            </div>
            <div style={{ padding: '0 16px 32px' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', flex: 1 }}>{selected.fileName}</p>
                  <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 0, flexShrink: 0 }}>✕</button>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>{selected.uploaderEmail}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selected.category && <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '2px 8px' }}>{selected.category.replace('_',' ')}</span>}
                  {selected.confidence && <span style={{ fontSize: '0.65rem', color: selected.confidence === 'high' ? '#22c55e' : '#eab308', background: 'rgba(34,197,94,0.08)', borderRadius: 99, padding: '2px 8px' }}>● {selected.confidence} confidence</span>}
                  {selected.wordCount && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{selected.wordCount.toLocaleString()} words</span>}
                </div>
              </div>
              {(selected.suggestedCourseName || selected.detectedCourseName) && (
                <div style={{ background: 'rgba(196,160,80,0.06)', border: '1px solid rgba(196,160,80,0.15)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--gold)', opacity: 0.7, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Classifier Suggestion</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{selected.suggestedCourseName || selected.detectedCourseName}</p>
                  {selected.classifierReason && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{selected.classifierReason}</p>}
                </div>
              )}
              {selected.extractedText && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Extracted Text Preview</p>
                  <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', maxHeight: 200, overflowY: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selected.extractedText.slice(0, 1200).replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/^-\s/gm, '• ')}{selected.extractedText.length > 1200 ? '…' : ''}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Assign to Course</p>
                <CourseSelector
                  courses={courses}
                  defaultCourseId={selected.suggestedCourseId ?? ''}
                  onSelect={(id, name) => handleApprove(selected, id, name)}
                  loading={actionLoading}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.status === 'pending_review' && (
                  <button onClick={() => handleApprove(selected)} disabled={actionLoading} style={{
                    width: '100%', padding: '12px', background: 'var(--gold)', color: 'var(--navy)',
                    border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                    opacity: actionLoading ? 0.6 : 1,
                  }}>
                    {actionLoading ? 'Approving…' : '✓ Approve'}
                  </button>
                )}
                {selected.status !== 'quarantined' && (
                  <button onClick={() => handleQuarantine(selected)} disabled={actionLoading} style={{
                    width: '100%', padding: '10px', background: 'transparent',
                    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                    color: '#fca5a5', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                  }}>⚠ Quarantine</button>
                )}
                <button onClick={() => handleDelete(selected)} disabled={actionLoading} style={{
                  width: '100%', padding: '10px', background: 'transparent',
                  border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                  color: '#ef4444', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
                }}>🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approvalOpen && selected && (
        <ApprovalModal
          material={selected}
          courses={courses}
          onClose={() => { setApprovalOpen(false); setSelected(null); }}
          onDone={() => { setApprovalOpen(false); setSelected(null); load(); }}
        />
      )}
    </AppNav>
  );
}


// ── Course Selector ────────────────────────────────────────────────────────────
function CourseSelector({ courses, defaultCourseId, onSelect, loading }: {
  courses: Course[]; defaultCourseId: string;
  onSelect: (id: string, name: string) => void; loading: boolean;
}) {
  const [selected, setSelected] = useState(defaultCourseId);
  const grouped = courses.reduce<Record<string, Course[]>>((acc, c) => {
    const key = `${c.department} · Year ${c.year} · Sem ${c.semester}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select value={selected} onChange={e => setSelected(e.target.value)} style={{
        flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem'
      }}>
        <option value="">— No course —</option>
        {Object.entries(grouped).map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map(c => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
          </optgroup>
        ))}
      </select>
      <button
        onClick={() => { const c = courses.find(x => x.id === selected); if (c) onSelect(c.id, c.name); }}
        disabled={loading || !selected}
        style={{ padding: '8px 14px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: (!selected || loading) ? 0.5 : 1 }}>
        Assign
      </button>
    </div>
  );
}

// ── Courses Panel ──────────────────────────────────────────────────────────────
function CoursesPanel({ courses, onRefresh }: { courses: Course[]; onRefresh: () => void }) {
  const { userProfile, firebaseUser } = useAuth();
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', department: 'philosophy', year: 1, semester: 1, description: '', sharedWith: '', published: true });

  const grouped = courses.reduce<Record<string, Course[]>>((acc, c) => {
    const key = `${c.department.charAt(0).toUpperCase() + c.department.slice(1)} · Year ${c.year} · Sem ${c.semester}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  function openEdit(c: any) {
    setEditId(c.id);
    setForm({ name: c.name, code: c.code || '', department: c.department, year: c.year, semester: c.semester, description: c.description || '', sharedWith: (c.sharedWith || []).join(', '), published: c.published !== false });
    setShowForm(true);
  }

  function openAdd() {
    setEditId(null);
    setForm({ name: '', code: '', department: 'philosophy', year: 1, semester: 1, description: '', sharedWith: '', published: true });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    try {
      const data = { name: form.name, code: form.code, department: form.department, year: Number(form.year), semester: Number(form.semester), description: form.description, published: form.published, sharedWith: form.sharedWith ? form.sharedWith.split(',').map((s: string) => s.trim()).filter(Boolean) : [] };
      if (editId) {
        await updateDoc(doc(db, 'courses', editId), data);
      } else {
        await addDoc(collection(db, 'courses'), { ...data, createdAt: serverTimestamp() });
      }
      setShowForm(false);
      setEditId(null);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!isChiefAdmin) { alert('Only chief admin can delete courses. Please contact chief admin.'); return; }
    if (!window.confirm('Delete this course permanently? All linked materials will lose their course assignment.')) return;
    await deleteDoc(doc(db, 'courses', id));
    onRefresh();
  }

  async function handleTogglePublish(c: any) {
    await updateDoc(doc(db, 'courses', c.id), { published: !(c.published !== false) });
    onRefresh();
  }

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 8, boxSizing: 'border-box' as const };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
        <button onClick={openAdd} style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ Add Course</button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '0.9rem', marginBottom: 12, fontWeight: 700 }}>{editId ? 'Edit Course' : 'New Course'}</p>
          <input style={inputStyle} placeholder="Course name *" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <input style={inputStyle} placeholder="Course code (e.g. PHI301)" value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value}))} />
          <input style={inputStyle} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              <option value="philosophy">Philosophy</option>
              <option value="theology">Theology</option>
            </select>
            <select value={form.year} onChange={e => setForm(f => ({...f, year: Number(e.target.value)}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              {[1,2,3,4].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <select value={form.semester} onChange={e => setForm(f => ({...f, semester: Number(e.target.value)}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              <option value={1}>Sem 1</option>
              <option value={2}>Sem 2</option>
            </select>
          </div>
          <input style={inputStyle} placeholder="Shared with course IDs (comma-separated, optional)" value={form.sharedWith} onChange={e => setForm(f => ({...f, sharedWith: e.target.value}))} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({...f, published: e.target.checked}))} />
            Published (visible to students)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !form.name} style={{ flex: 1, padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: saving || !form.name ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {Object.entries(grouped).sort().map(([group, list]) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 8 }}>{group}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map((c: any) => (
              <div key={c.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.85rem', color: c.published !== false ? 'var(--text-primary)' : 'var(--text-muted)' }}>{c.name}</p>
                    <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 99, background: c.published !== false ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: c.published !== false ? '#22c55e' : '#ef4444' }}>{c.published !== false ? 'Live' : 'Hidden'}</span>
                  </div>
                  {c.code && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.code}</p>}
                </div>
                <button onClick={() => handleTogglePublish(c)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.68rem', flexShrink: 0 }}>{c.published !== false ? 'Hide' : 'Publish'}</button>
                <button onClick={() => openEdit(c)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.68rem', flexShrink: 0 }}>Edit</button>
                <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', color: isChiefAdmin ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: '0.8rem', padding: '3px 6px', borderRadius: 6, flexShrink: 0 }} title={isChiefAdmin ? 'Delete' : 'Only chief admin can delete'}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {courses.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>📚</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No courses yet. Add your first course above.</p>
        </div>
      )}
    </div>
  );
}

// ── Assignments Panel ──────────────────────────────────────────────────────────
function AssignmentsPanel({ courses }: { courses: Course[] }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extending, setExtending] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState('');
  const [form, setForm] = useState({ title: '', description: '', type: 'Essay', courseId: '', dueDate: '' });
  const TYPES = ['Essay', 'Presentation', 'Test', 'Seminar paper', 'Report', 'Other'];

  useEffect(() => { loadAssignments(); }, []);

  async function loadAssignments() {
    try {
      const snap = await getDocs(query(collection(db, 'assignments'), where('status', '==', 'active'), orderBy('dueDate', 'asc')));
      const now = new Date();
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => new Date(a.dueDate) >= now));
    } catch {}
  }

  async function handleSave() {
    if (!form.title || !form.dueDate || !form.courseId) return;
    setSaving(true);
    try {
      const course = courses.find(c => c.id === form.courseId);
      await addDoc(collection(db, 'assignments'), {
        ...form, courseName: course?.name ?? '',
        department: course?.department ?? '', year: course?.year ?? 1, semester: course?.semester ?? 1,
        status: 'active', createdAt: new Date().toISOString(),
      });
      setShowForm(false);
      setForm({ title: '', description: '', type: 'Essay', courseId: '', dueDate: '' });
      await loadAssignments();
    } catch { alert('Failed to save'); } finally { setSaving(false); }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this assignment?')) return;
    await updateDoc(doc(db, 'assignments', id), { status: 'cancelled', updatedAt: new Date().toISOString() });
    await loadAssignments();
  }

  async function handleExtend(id: string) {
    if (!extendDate) return;
    await updateDoc(doc(db, 'assignments', id), { dueDate: extendDate, extended: true, updatedAt: new Date().toISOString() });
    setExtending(null); setExtendDate('');
    await loadAssignments();
  }

  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const urgencyColor = (d: number) => d <= 1 ? '#ef4444' : d <= 3 ? '#eab308' : '#22c55e';

  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 8, boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{assignments.length} active</p>
        <button onClick={() => setShowForm(s => !s)} style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <input style={inputStyle} placeholder="Title *" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} />
          <input style={inputStyle} placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} style={{...inputStyle, marginBottom: 0, flex: 1}}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="date" value={form.dueDate} onChange={e => setForm(f => ({...f, dueDate: e.target.value}))} style={{...inputStyle, marginBottom: 0, flex: 1}} />
          </div>
          <select value={form.courseId} onChange={e => setForm(f => ({...f, courseId: e.target.value}))} style={inputStyle}>
            <option value="">Select course *</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !form.title || !form.courseId || !form.dueDate} style={{ flex: 1, padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {assignments.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: '1.8rem', marginBottom: 8 }}>📋</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active assignments.</p>
        </div>
      )}

      {assignments.map((a: any) => {
        const days = daysUntil(a.dueDate);
        return (
          <div key={a.id} style={{ background: 'var(--navy-card)', border: `1px solid ${days <= 3 ? urgencyColor(days) + '33' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '2px 7px' }}>{a.type}</span>
                  {a.extended && <span style={{ fontSize: '0.6rem', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', borderRadius: 99, padding: '2px 7px' }}>Extended</span>}
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: urgencyColor(days) }}>{days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days}d left`}</span>
                </div>
                <p style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 2 }}>{a.title}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{a.courseName}</p>
                {a.description && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{a.description}</p>}
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>Due: {new Date(a.dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
            {extending === a.id ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} style={{ flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text-primary)', fontSize: '0.78rem' }} />
                <button onClick={() => handleExtend(a.id)} style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: 6, padding: '5px 12px', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Save</button>
                <button onClick={() => setExtending(null)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => { setExtending(a.id); setExtendDate(a.dueDate); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.72rem' }}>Extend</button>
                <button onClick={() => handleCancel(a.id)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', color: '#fca5a5', cursor: 'pointer', fontSize: '0.72rem' }}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Users Panel ────────────────────────────────────────────────────────────────
function UsersPanel({ currentUserEmail }: { currentUserEmail: string }) {
  const { userProfile, firebaseUser } = useAuth();
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      .then(snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function setRole(uid: string, role: string) {
    if (!isChiefAdmin) { alert('Only chief admin can change roles.'); return; }
    setActionLoading(uid);
    try {
      const res = await fetch('/api/admin/set-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUid: uid, role }) });
      if (res.ok) setUsers(u => u.map(x => x.uid === uid ? { ...x, role } : x));
      else alert('Role change failed.');
    } finally { setActionLoading(null); }
  }

  async function handleDeactivate(uid: string) {
    if (!isChiefAdmin) { alert('Only chief admin can deactivate users.'); return; }
    if (!window.confirm('Deactivate this user? They will not be able to log in.')) return;
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { isActive: false, updatedAt: new Date().toISOString() });
      setUsers(u => u.map(x => x.uid === uid ? { ...x, isActive: false } : x));
    } finally { setActionLoading(null); }
  }

  async function handleReactivate(uid: string) {
    if (!isChiefAdmin) { alert('Only chief admin can reactivate users.'); return; }
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { isActive: true, updatedAt: new Date().toISOString() });
      setUsers(u => u.map(x => x.uid === uid ? { ...x, isActive: true } : x));
    } finally { setActionLoading(null); }
  }

  async function handleDelete(uid: string) {
    if (!isChiefAdmin) { alert('Only chief admin can delete users. Please contact chief admin.'); return; }
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { isActive: false, deletedAt: new Date().toISOString(), fcmToken: null });
      setConfirmDelete(null);
      setUsers(u => u.filter(x => x.uid !== uid));
    } catch { alert('Delete failed.'); }
    finally { setActionLoading(null); }
  }

  const filtered = users.filter(u => !search || (u.email || '').toLowerCase().includes(search.toLowerCase()) || (u.displayName || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>;

  const ROLE_COLORS: Record<string, string> = { chief_admin: 'var(--gold)', admin: '#a5b4fc', student: 'var(--text-muted)', class_rep: '#34d399' };

  return (
    <div>
      {!isChiefAdmin && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.8rem', color: '#fca5a5' }}>⚠️ Full user management is restricted to chief admin. Contact chief admin for role changes or deletions.</div>}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 12, boxSizing: 'border-box' as const }} />
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</p>
      {filtered.map(u => {
        const isThisSupreme = u.email === SUPREME;
        const isBusy = actionLoading === u.uid;
        return (
          <div key={u.uid || u.id} style={{ background: 'var(--navy-card)', border: `1px solid ${u.isActive === false ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, opacity: u.isActive === false ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName || u.email}</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{u.email}</p>
                {u.department && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{u.department} · Yr {u.year} · Sem {u.currentSemester}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: ROLE_COLORS[u.role] || 'var(--text-muted)', borderRadius: 99, padding: '2px 8px' }}>{isThisSupreme ? '⭐ Supreme' : u.role || 'student'}</span>
                {u.isActive === false && <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>Inactive</span>}
              </div>
            </div>
            {isChiefAdmin && !isThisSupreme && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {u.role === 'student' && <button onClick={() => setRole(u.uid, 'admin')} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(165,180,252,0.3)', background: 'transparent', color: '#a5b4fc', cursor: 'pointer' }}>→ Admin</button>}
                {u.role === 'student' && <button onClick={() => setRole(u.uid, 'chief_admin')} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(196,160,80,0.3)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer' }}>→ Chief</button>}
                {(u.role === 'admin' || u.role === 'chief_admin') && <button onClick={() => setRole(u.uid, 'student')} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#fca5a5', cursor: 'pointer' }}>Remove role</button>}
                {u.isActive !== false ? <button onClick={() => handleDeactivate(u.uid)} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Deactivate</button>
                : <button onClick={() => handleReactivate(u.uid)} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'transparent', color: '#22c55e', cursor: 'pointer' }}>Reactivate</button>}
                {confirmDelete === u.uid ? (
                  <>
                    <button onClick={() => handleDelete(u.uid)} disabled={isBusy} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Confirm delete</button>
                    <button onClick={() => setConfirmDelete(null)} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(u.uid)} style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', color: 'rgba(239,68,68,0.6)', cursor: 'pointer' }}>Delete</button>
                )}
                {isBusy && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>…</span>}
              </div>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 0' }}><p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No users found.</p></div>}
    </div>
  );
}

// ── Timetables Panel ───────────────────────────────────────────────────────────
function TimetablesPanel({ courses }: { courses: Course[] }) {
  const [timetables, setTimetables] = useState<any[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});

  const SLOTS = [
    { key: 'philosophy_normal', dept: 'philosophy', type: 'normal', label: 'Philosophy — General Timetable', desc: 'Daily/weekly schedule for Philosophy students' },
    { key: 'philosophy_exam', dept: 'philosophy', type: 'exam', label: 'Philosophy — Exam Timetable', desc: 'Regular exam schedule for Philosophy' },
    { key: 'philosophy_bphil', dept: 'philosophy', type: 'bphil', label: 'Philosophy — BPhil Exams (Year 4)', desc: 'Bachelor of Philosophy final exams' },
    { key: 'theology_normal', dept: 'theology', type: 'normal', label: 'Theology — General Timetable', desc: 'Daily/weekly schedule for Theology students' },
    { key: 'theology_exam', dept: 'theology', type: 'exam', label: 'Theology — Exam Timetable', desc: 'Regular exam schedule for Theology' },
    { key: 'theology_bth', dept: 'theology', type: 'bth', label: 'Theology — BTh Exams (Year 3)', desc: 'Bachelor of Theology final exams' },
  ];

  useEffect(() => { loadTimetables(); }, []);

  async function loadTimetables() {
    try {
      const snap = await getDocs(collection(db, 'timetables'));
      setTimetables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {}
  }

  function getExisting(dept: string, type: string) {
    return timetables.find((t: any) => t.department === dept && t.type === type);
  }

  async function handleUpload(slot: typeof SLOTS[0]) {
    const file = files[slot.key];
    if (!file) return;
    setUploading(slot.key);
    setResult(r => ({ ...r, [slot.key]: '' }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('department', slot.dept);
      formData.append('type', slot.type);
      const res = await fetch('/api/upload-timetable', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult(r => ({ ...r, [slot.key]: `✅ Uploaded. ${data.examDates?.length ?? 0} dates extracted.` }));
        await loadTimetables();
        setFiles(f => ({ ...f, [slot.key]: null }));
      } else {
        setResult(r => ({ ...r, [slot.key]: `❌ ${data.error}` }));
      }
    } catch { setResult(r => ({ ...r, [slot.key]: '❌ Upload failed' })); }
    finally { setUploading(null); }
  }

  const inputStyle: React.CSSProperties = { background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.82rem' };

  return (
    <div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>Upload one timetable per slot. Re-uploading replaces the existing one. OCR automatically extracts exam dates.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SLOTS.map(slot => {
          const existing = getExisting(slot.dept, slot.type);
          const isUploading = uploading === slot.key;
          const msg = result[slot.key];
          return (
            <div key={slot.key} style={{ background: 'var(--navy-card)', border: `1px solid ${existing ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 2 }}>{slot.label}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{slot.desc}</p>
                </div>
                {existing && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.62rem', color: '#22c55e' }}>✓ Uploaded</span>
                  <a href={existing.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: 'var(--gold)', textDecoration: 'none' }}>View →</a>
                </div>}
              </div>
              {existing?.examDates?.length > 0 && (
                <div style={{ marginBottom: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  {existing.examDates.slice(0, 2).map((d: any, i: number) => (
                    <p key={i} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>📅 {d.date} — {(d.courseName || '').substring(0, 45)}</p>
                  ))}
                  {existing.examDates.length > 2 && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+{existing.examDates.length - 2} more dates</p>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={e => setFiles(f => ({ ...f, [slot.key]: e.target.files?.[0] ?? null }))} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1 }} />
                <button onClick={() => handleUpload(slot)} disabled={!files[slot.key] || isUploading} style={{ ...inputStyle, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 700, cursor: 'pointer', opacity: (!files[slot.key] || isUploading) ? 0.6 : 1, padding: '7px 16px', flexShrink: 0 }}>
                  {isUploading ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
                </button>
              </div>
              {msg && <p style={{ fontSize: '0.75rem', marginTop: 6, color: msg.startsWith('✅') ? '#22c55e' : '#ef4444' }}>{msg}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
