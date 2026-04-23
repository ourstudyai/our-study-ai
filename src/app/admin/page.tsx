'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import AppNav from '@/components/AppNav';
import {
  getMaterialsByStatus,
  updateMaterialStatus,
  saveChunks,
  getReports,
  markReportRead,
  Material,
  UploadReport,
} from '@/lib/firestore/materials';
import { db } from '@/lib/firebase/config';
import {
  collection, getDocs, query, orderBy, addDoc, serverTimestamp,
  where, doc, updateDoc,
} from 'firebase/firestore';
import { Course } from '@/lib/types';

const SUPREME = 'ourstudyai@gmail.com';

type Tab = 'pending' | 'approved' | 'quarantined' | 'resurrection' | 'users' | 'reports';
type SortKey = 'newest' | 'oldest' | 'confidence' | 'category';

const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const CONF_COLOR: Record<string, string> = {
  high: '#22c55e', medium: '#eab308', low: '#ef4444',
};
const CONF_ICON: Record<string, string> = { high: '🟢', medium: '🟡', low: '🔴' };
const CAT_COLORS: Record<string, string> = {
  lecture_notes: 'rgba(196,160,80,0.15)',
  past_questions: 'rgba(99,102,241,0.15)',
  aoc: 'rgba(236,72,153,0.15)',
  syllabus: 'rgba(20,184,166,0.15)',
};
const CAT_TEXT: Record<string, string> = {
  lecture_notes: '#c4a050', past_questions: '#818cf8', aoc: '#f472b6', syllabus: '#2dd4bf',
};

interface UserDoc {
  uid: string; email: string; displayName: string; role: string;
}

interface IndexedMaterial extends Material {
  indexed?: boolean;
  contentList?: string[];
  aiSummary?: string;
  indexDisplayName?: string;
  indexedAt?: unknown;
}

function notifySupreme(action: string, fileName: string, adminEmail: string, extra?: string) {
  const labels: Record<string, string> = {
    approve: '✅ Material Approved',
    quarantine: '🔒 Material Quarantined',
    delete: '🗑️ Material Deleted',
    index: '📚 Material Indexed',
    bulk_approve: '✅ Bulk Approval',
    resurrect: '♻️ Material Resurrected',
  };
  const title = labels[action] ?? `🔔 Admin Action: ${action}`;
  const body = extra ? `${adminEmail}: ${fileName} — ${extra}` : `${adminEmail}: ${fileName}`;
  fetch('/api/notify-admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'admin_action', title, body, data: { action, fileName, adminEmail } }),
  }).catch(() => {});
}

function logActivity(action: string, materialId: string, fileName: string, adminEmail: string) {
  addDoc(collection(db, 'admin_activity'), {
    action, materialId, fileName, adminEmail, timestamp: serverTimestamp(),
  }).catch(() => {});
}

export default function AdminPage() {
  const { userProfile, firebaseUser } = useAuth();
  const router = useRouter();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin';
  const isChiefAdmin = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isSupreme = firebaseUser?.email === SUPREME;

  const [tab, setTab] = useState<Tab>('pending');
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');

  const [pending, setPending] = useState<Material[]>([]);
  const [approved, setApproved] = useState<Material[]>([]);
  const [quarantined, setQuarantined] = useState<Material[]>([]);
  const [resurrection, setResurrection] = useState<Material[]>([]);
  const [reports, setReports] = useState<UploadReport[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [editedText, setEditedText] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [categoryOverride, setCategoryOverride] = useState('');
  const [modalAction, setModalAction] = useState<'idle' | 'approving' | 'quarantining' | 'deleting' | 'indexing'>('idle');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [indexSuccess, setIndexSuccess] = useState<string | null>(null);

  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  const [statsOpen, setStatsOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<unknown[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);

  // ── Resurrection state ──────────────────────────────────────────────────
  const [resurrectCourses, setResurrectCourses] = useState<Record<string, string>>({});
  const [resurrectLoading, setResurrectLoading] = useState<Record<string, boolean>>({});

  const adminEmail = firebaseUser?.email ?? 'unknown';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, q, r, proc, ocr, rpts] = await Promise.all([
        getMaterialsByStatus('pending_review'),
        getMaterialsByStatus('approved'),
        getMaterialsByStatus('quarantined'),
        getMaterialsByStatus('awaiting_course'),
        getMaterialsByStatus('processing'),
        getMaterialsByStatus('ocr_pending'),
        getReports(),
      ]);
      setPending([...p, ...proc, ...ocr]); setApproved(a); setQuarantined(q); setResurrection(r); setReports(rpts);

      const coursesSnap = await getDocs(query(collection(db, 'courses'), orderBy('department'), orderBy('year'), orderBy('name')));
      setCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));

      const actSnap = await getDocs(query(collection(db, 'admin_activity'), orderBy('timestamp', 'desc')));
      setActivityLog(actSnap.docs.slice(0, 20).map(d => ({ id: d.id, ...d.data() })));

      if (isChiefAdmin) {
        const usersSnap = await getDocs(collection(db, 'users'));
        setUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserDoc)));
      }
    } finally {
      setLoading(false);
    }
  }, [isChiefAdmin]);

  useEffect(() => {
    if (!isAdmin) { router.replace('/dashboard'); return; }
    loadData();
  }, [isAdmin, loadData, router]);

  // ── Filtering + sorting ──────────────────────────────────────────────────
  function filterAndSort(list: Material[]) {
    const q = search.toLowerCase();
    let filtered = q
      ? list.filter(m =>
          m.fileName?.toLowerCase().includes(q) ||
          m.confirmedCourseName?.toLowerCase().includes(q) ||
          m.suggestedCourseName?.toLowerCase().includes(q) ||
          m.uploaderEmail?.toLowerCase().includes(q)
        )
      : list;

    return [...filtered].sort((a, b) => {
      if (sort === 'newest') return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
      if (sort === 'oldest') return (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0);
      if (sort === 'confidence') return (CONFIDENCE_ORDER[a.confidence] ?? 2) - (CONFIDENCE_ORDER[b.confidence] ?? 2);
      if (sort === 'category') return (a.category ?? '').localeCompare(b.category ?? '');
      return 0;
    });
  }

  const listMap: Record<Tab, Material[]> = {
    pending: filterAndSort(pending),
    approved: filterAndSort(approved),
    quarantined: filterAndSort(quarantined),
    resurrection: filterAndSort(resurrection),
    users: [],
    reports: [],
  };

  // ── Modal open ──────────────────────────────────────────────────────────
  function openModal(m: Material) {
    setSelectedMaterial(m);
    setEditedText(m.extractedText ?? '');
    setSelectedCourseId(m.confirmedCourseId ?? '');
    setCategoryOverride(m.category ?? '');
    setDeleteConfirm(false);
    setIndexSuccess(null);
    setModalAction('idle');
  }

  function closeModal() {
    setSelectedMaterial(null);
    setDeleteConfirm(false);
    setIndexSuccess(null);
  }

  // ── Approve ─────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!selectedMaterial) return;
    const courseId = selectedCourseId || selectedMaterial.confirmedCourseId;
    if (!courseId) { alert('Please select a course before approving.'); return; }
    setModalAction('approving');
    try {
      // Save edited text back to material
      await updateDoc(doc(db, 'materials', selectedMaterial.id), {
        extractedText: editedText,
        ...(categoryOverride ? { category: categoryOverride } : {}),
      });
      const course = courses.find(c => c.id === courseId);
      await saveChunks(selectedMaterial.id, courseId, categoryOverride as never || selectedMaterial.category, editedText);
      await updateMaterialStatus(selectedMaterial.id, 'approved', courseId, course?.name ?? selectedMaterial.confirmedCourseName ?? '');
      logActivity('approve', selectedMaterial.id, selectedMaterial.fileName, adminEmail);
      notifySupreme('approve', selectedMaterial.fileName, adminEmail, courseId ? 'assigned to course' : undefined);
      setPending(p => p.filter(m => m.id !== selectedMaterial.id));
      setQuarantined(q => q.filter(m => m.id !== selectedMaterial.id));
      setResurrection(r => r.filter(m => m.id !== selectedMaterial.id));
      closeModal();
      await loadData();
    } finally {
      setModalAction('idle');
    }
  }

  // ── Quarantine ──────────────────────────────────────────────────────────
  async function handleQuarantine() {
    if (!selectedMaterial) return;
    setModalAction('quarantining');
    try {
      await updateMaterialStatus(selectedMaterial.id, 'quarantined');
      logActivity('quarantine', selectedMaterial.id, selectedMaterial.fileName, adminEmail);
      notifySupreme('quarantine', selectedMaterial.fileName, adminEmail);
      await loadData();
      closeModal();
    } finally {
      setModalAction('idle');
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selectedMaterial) return;
    setModalAction('deleting');
    try {
      const res = await fetch('/api/delete-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: selectedMaterial.id }),
      });
      if (!res.ok) throw new Error('Delete failed');
      logActivity('delete', selectedMaterial.id, selectedMaterial.fileName, adminEmail);
      notifySupreme('delete', selectedMaterial.fileName, adminEmail);
      await loadData();
      closeModal();
    } catch {
      alert('Delete failed. Please try again.');
    } finally {
      setModalAction('idle');
    }
  }

  // ── Index ───────────────────────────────────────────────────────────────
  async function handleIndex() {
    if (!selectedMaterial) return;
    setModalAction('indexing');
    setIndexSuccess(null);
    try {
      const res = await fetch('/api/index-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: selectedMaterial.id }),
      });
      if (!res.ok) throw new Error('Index failed');
      logActivity('index', selectedMaterial.id, selectedMaterial.fileName, adminEmail);
      notifySupreme('index', selectedMaterial.fileName, adminEmail);
      setIndexSuccess('Added to Library ✓');
      await loadData();
    } catch {
      setIndexSuccess('Failed — please try again');
    } finally {
      setModalAction('idle');
    }
  }

  // ── Bulk approve ─────────────────────────────────────────────────────────
  async function handleBulkApprove() {
    if (bulkSelected.size === 0) return;
    setBulkApproving(true);
    for (const id of Array.from(bulkSelected)) {
      const m = pending.find(x => x.id === id);
      if (!m || !m.confirmedCourseId) continue;
      try {
        await saveChunks(m.id, m.confirmedCourseId, m.category, m.extractedText);
        await updateMaterialStatus(m.id, 'approved', m.confirmedCourseId, m.confirmedCourseName ?? '');
        logActivity('bulk_approve', m.id, m.fileName, adminEmail);
        notifySupreme('bulk_approve', m.fileName, adminEmail);
      } catch {}
    }
    setBulkSelected(new Set());
    setBulkApproving(false);
    await loadData();
  }

  // ── Resurrection ─────────────────────────────────────────────────────────
  async function handleResurrectOne(m: Material) {
    const courseId = resurrectCourses[m.id];
    if (!courseId) return;
    setResurrectLoading(l => ({ ...l, [m.id]: true }));
    try {
      const course = courses.find(c => c.id === courseId);
      await saveChunks(m.id, courseId, m.category, m.extractedText);
      await updateMaterialStatus(m.id, 'approved', courseId, course?.name ?? '');
      logActivity('resurrect', m.id, m.fileName, adminEmail);
      notifySupreme('resurrect', m.fileName, adminEmail);
      await loadData();
    } finally {
      setResurrectLoading(l => ({ ...l, [m.id]: false }));
    }
  }

  // ── Role management ──────────────────────────────────────────────────────
  async function setRole(uid: string, role: string) {
    setRoleActionLoading(uid);
    try {
      const res = await fetch('/api/admin/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, role }),
      });
      if (!res.ok) throw new Error('Role change failed');
      setUsers(u => u.map(x => x.uid === uid ? { ...x, role } : x));
    } catch { alert('Role change failed.'); }
    finally { setRoleActionLoading(null); }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const thisWeek = approved.filter(m => {
    if (!m.createdAt) return false;
    const d = (m.createdAt as { toDate: () => Date }).toDate();
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  // ── Grouped courses for dropdown ─────────────────────────────────────────
  const groupedCourses = courses.reduce<Record<string, Course[]>>((acc, c) => {
    const key = `${c.department.charAt(0).toUpperCase() + c.department.slice(1)} · Year ${c.year} · Sem ${c.semester}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  if (!isAdmin) return null;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: 'Pending', count: pending.length },
    { key: 'approved', label: 'Approved', count: approved.length },
    { key: 'quarantined', label: 'Quarantined', count: quarantined.length },
    { key: 'resurrection', label: 'Resurrection', count: resurrection.length },
    ...(isChiefAdmin ? [{ key: 'users' as Tab, label: 'Users' }] : []),
    { key: 'reports', label: 'Reports', count: reports.filter(r => !r.read).length || undefined },
  ];

  const currentList = listMap[tab] ?? [];

  return (
    <AppNav>
      <div style={{ minHeight: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', padding: '24px 16px', maxWidth: '900px', margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: '4px' }}>
            St. Jerome's AI
          </p>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>
            Admin Panel
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {isSupreme ? '⭐ Supreme Chief Admin' : isChiefAdmin ? '🔑 Chief Admin' : '🛡️ Admin'} · {adminEmail}
          </p>
        </div>

        {/* ── Stats strip ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {[
            { label: 'Pending', value: pending.length, color: '#eab308' },
            { label: 'Approved this week', value: thisWeek, color: '#22c55e' },
            { label: 'Quarantined', value: quarantined.length, color: '#ef4444' },
            { label: 'Awaiting course', value: resurrection.length, color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} style={{ flex: '1 1 120px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px' }}>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: s.color }}>{s.value}</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: '1 1 80px', padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: tab === t.key ? 700 : 500,
                background: tab === t.key ? 'rgba(196,160,80,0.15)' : 'transparent',
                color: tab === t.key ? 'var(--gold)' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {/* ── Search + sort (for material tabs) ──────────────────────── */}
        {['pending', 'approved', 'quarantined', 'resurrection'].includes(tab) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search filename, course, email..."
              style={{ flex: '1 1 200px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence">By confidence</option>
              <option value="category">By category</option>
            </select>
          </div>
        )}

        {/* ── Bulk approve bar ────────────────────────────────────────── */}
        {tab === 'pending' && bulkSelected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--gold)', flex: 1 }}>{bulkSelected.size} selected</span>
            <button onClick={handleBulkApprove} disabled={bulkApproving}
              style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '6px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: bulkApproving ? 0.6 : 1 }}>
              {bulkApproving ? 'Approving...' : 'Approve all selected'}
            </button>
            <button onClick={() => setBulkSelected(new Set())}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>
              Clear
            </button>
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {loading && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '0.85rem' }}>Loading...</p>
        )}

        {/* ── Material cards ──────────────────────────────────────────── */}
        {!loading && ['pending', 'approved', 'quarantined'].includes(tab) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentList.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '0.85rem' }}>
                Nothing here{search ? ' matching your search' : ''}.
              </p>
            )}
            {currentList.map(m => {
              const isHighConf = m.confidence === 'high' && !!m.confirmedCourseId;
              const isChecked = bulkSelected.has(m.id);
              return (
                <div key={m.id}
                  onClick={() => openModal(m)}
                  style={{ background: 'var(--navy-card)', border: `1px solid ${isChecked ? 'var(--gold)' : 'var(--border)'}`, borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  {/* Bulk checkbox */}
                  {tab === 'pending' && isHighConf && (
                    <div onClick={e => { e.stopPropagation(); setBulkSelected(s => { const n = new Set(s); isChecked ? n.delete(m.id) : n.add(m.id); return n; }); }}
                      style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${isChecked ? 'var(--gold)' : 'var(--border)'}`, background: isChecked ? 'var(--gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px', cursor: 'pointer' }}>
                      {isChecked && <span style={{ color: 'var(--navy)', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
                      <span style={{ background: CAT_COLORS[m.category] || 'rgba(196,160,80,0.1)', color: CAT_TEXT[m.category] || 'var(--gold)', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {m.category?.replace('_', ' ') || 'unknown'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: CONF_COLOR[m.confidence] }}>
                        {CONF_ICON[m.confidence]} {m.confidence}
                      </span>
                    </div>
                    <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                      {m.fileName}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      {m.confirmedCourseName || m.suggestedCourseName || m.detectedCourseName || 'Course undetected'}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.uploaderEmail}</span>
                      {m.wordCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.wordCount.toLocaleString()} words</span>}
                      {m.pageCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.pageCount} pages</span>}
                      {m.createdAt && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{(m.createdAt as { toDate: () => Date }).toDate().toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>›</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Resurrection tab ────────────────────────────────────────── */}
        {!loading && tab === 'resurrection' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {currentList.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '0.85rem' }}>No materials awaiting course assignment.</p>
            )}
            {currentList.map(m => (
              <div key={m.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>{m.fileName}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Detected: "{m.detectedCourseName || 'none'}" · Suggested: "{m.suggestedCourseName || 'none'}" · {CONF_ICON[m.confidence]} {m.confidence}
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={resurrectCourses[m.id] ?? ''} onChange={e => setResurrectCourses(r => ({ ...r, [m.id]: e.target.value }))}
                    style={{ flex: 1, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                    <option value="">— Assign course —</option>
                    {Object.entries(groupedCourses).map(([group, cs]) => (
                      <optgroup key={group} label={group}>
                        {cs.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={() => handleResurrectOne(m)} disabled={!resurrectCourses[m.id] || resurrectLoading[m.id]}
                    style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '7px 14px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: (!resurrectCourses[m.id] || resurrectLoading[m.id]) ? 0.5 : 1 }}>
                    {resurrectLoading[m.id] ? 'Approving...' : 'Approve →'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Reports tab ─────────────────────────────────────────────── */}
        {!loading && tab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reports.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '0.85rem' }}>No reports.</p>}
            {reports.map(r => (
              <div key={r.id} style={{ background: 'var(--navy-card)', border: `1px solid ${r.read ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '12px', padding: '14px 16px', opacity: r.read ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: '2px' }}>{r.fileName}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{r.uploaderEmail} · {r.errorType}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.description}</p>
                  </div>
                  {!r.read && (
                    <button onClick={() => markReportRead(r.id).then(loadData)}
                      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', padding: '4px 10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', flexShrink: 0 }}>
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── User management tab ─────────────────────────────────────── */}
        {!loading && tab === 'users' && isChiefAdmin && (
          <div>
            <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search by email or name..."
              style={{ width: '100%', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: '12px', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {users
                .filter(u => !userSearch || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.displayName?.toLowerCase().includes(userSearch.toLowerCase()))
                .map(u => {
                  const isThisSupreme = u.email === SUPREME;
                  const loading = roleActionLoading === u.uid;
                  return (
                    <div key={u.uid} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName || u.email}</p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.email}</p>
                        <p style={{ fontSize: '0.68rem', color: isThisSupreme ? 'var(--gold)' : 'var(--text-muted)', marginTop: '2px' }}>
                          {isThisSupreme ? '⭐ Supreme' : u.role}
                        </p>
                      </div>
                      {!isThisSupreme && !loading && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {u.role === 'student' && (
                            <button onClick={() => setRole(u.uid, 'admin')}
                              style={{ background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.3)', borderRadius: '7px', padding: '4px 10px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.72rem' }}>
                              → Admin
                            </button>
                          )}
                          {u.role === 'student' && isSupreme && (
                            <button onClick={() => setRole(u.uid, 'chief_admin')}
                              style={{ background: 'rgba(196,160,80,0.15)', border: '1px solid rgba(196,160,80,0.4)', borderRadius: '7px', padding: '4px 10px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                              → Chief Admin
                            </button>
                          )}
                          {u.role === 'admin' && (
                            <button onClick={() => setRole(u.uid, 'student')}
                              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', padding: '4px 10px', color: '#fca5a5', cursor: 'pointer', fontSize: '0.72rem' }}>
                              Remove admin
                            </button>
                          )}
                          {u.role === 'chief_admin' && isSupreme && (
                            <button onClick={() => setRole(u.uid, 'student')}
                              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '7px', padding: '4px 10px', color: '#fca5a5', cursor: 'pointer', fontSize: '0.72rem' }}>
                              Remove chief admin
                            </button>
                          )}
                        </div>
                      )}
                      {loading && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Updating...</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Collapsible stats ───────────────────────────────────────── */}
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button onClick={() => setStatsOpen(s => !s)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📊 Stats {statsOpen ? '▴' : '▾'}
          </button>
          {statsOpen && (
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
              {[
                { label: 'Total materials', value: pending.length + approved.length + quarantined.length + resurrection.length },
                { label: 'Pending review', value: pending.length },
                { label: 'Approved', value: approved.length },
                { label: 'Quarantined', value: quarantined.length },
                { label: 'Awaiting course', value: resurrection.length },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)' }}>{s.value}</p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Activity log ────────────────────────────────────────────── */}
        <div style={{ marginTop: '12px' }}>
          <button onClick={() => setActivityOpen(s => !s)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📋 Activity log {activityOpen ? '▴' : '▾'}
          </button>
          {activityOpen && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(activityLog as Record<string, string>[]).map((a, i) => (
                <div key={i} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{a.action}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fileName}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>{a.adminEmail}</span>
                </div>
              ))}
              {activityLog.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No activity yet.</p>}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PREVIEW MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {selectedMaterial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column' }}>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--navy-card)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <p style={{ flex: 1, fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedMaterial.fileName}
            </p>
            <span style={{ fontSize: '0.72rem', color: CONF_COLOR[selectedMaterial.confidence] }}>{CONF_ICON[selectedMaterial.confidence]} {selectedMaterial.confidence}</span>
            <button onClick={closeModal} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>✕ Close</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Left — file preview */}
              <div style={{ flex: 1, background: '#111', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedMaterial.mimeType === 'application/pdf' || selectedMaterial.fileUrl?.toLowerCase().includes('.pdf') ? (
                  <iframe src={selectedMaterial.fileUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
                ) : selectedMaterial.mimeType?.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedMaterial.fileUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No preview available for this file type.</p>
                )}
              </div>

              {/* Right — edit panel */}
              <div style={{ width: '380px', flexShrink: 0, background: 'var(--navy-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Uploader</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{selectedMaterial.uploaderEmail}</p>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    {selectedMaterial.wordCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{selectedMaterial.wordCount.toLocaleString()} words</span>}
                    {selectedMaterial.pageCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{selectedMaterial.pageCount} pages</span>}
                  </div>
                </div>

                {/* Course assignment */}
                {!selectedMaterial.confirmedCourseId && (
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Assign Course <span style={{ color: '#ef4444' }}>*</span></p>
                    <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}
                      style={{ width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                      <option value="">— Select course —</option>
                      {Object.entries(groupedCourses).map(([group, cs]) => (
                        <optgroup key={group} label={group}>
                          {cs.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                {/* Category override */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Category</p>
                  <select value={categoryOverride} onChange={e => setCategoryOverride(e.target.value)}
                    style={{ width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                    {['lecture_notes', 'past_questions', 'aoc', 'syllabus'].map(c => (
                      <option key={c} value={c}>{c.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Extracted text editor */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>Extracted Text <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>(editable)</span></p>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => setEditedText(e.currentTarget.innerText)}
                    style={{ flex: 1, minHeight: '200px', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.6, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                    {editedText}
                  </div>
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', background: 'var(--navy-card)', borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
              <button onClick={handleApprove} disabled={modalAction !== 'idle'}
                style={{ flex: 1, padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: modalAction !== 'idle' ? 0.6 : 1 }}>
                {modalAction === 'approving' ? 'Approving...' : '✅ Approve'}
              </button>
              <button onClick={handleQuarantine} disabled={modalAction !== 'idle'}
                style={{ flex: 1, padding: '10px', background: 'rgba(234,179,8,0.1)', color: '#fde68a', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: modalAction !== 'idle' ? 0.6 : 1 }}>
                {modalAction === 'quarantining' ? '...' : '🔒 Quarantine'}
              </button>
              {selectedMaterial.status === 'approved' && (
                <button onClick={handleIndex} disabled={modalAction !== 'idle'}
                  style={{ flex: 1, padding: '10px', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: modalAction !== 'idle' ? 0.6 : 1 }}>
                  {modalAction === 'indexing' ? 'Indexing...' : indexSuccess ?? '📚 Add to Index'}
                </button>
              )}
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} disabled={modalAction !== 'idle'}
                  style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: modalAction !== 'idle' ? 0.6 : 1 }}>
                  🗑️
                </button>
              ) : (
                <button onClick={handleDelete} disabled={modalAction !== 'idle'}
                  style={{ padding: '10px 14px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                  {modalAction === 'deleting' ? 'Deleting...' : 'Confirm delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppNav>
  );
}
