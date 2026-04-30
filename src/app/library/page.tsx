'use client';

import { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import AppNav from '@/components/AppNav';
import { db } from '@/lib/firebase/config';
import {
  collection, getDocs, query, orderBy, where,
  addDoc, deleteDoc, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore';

const SUPREME = 'ourstudyai@gmail.com';

interface IndexedMaterial {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploaderEmail: string;
  extractedText?: string;
  wordCount?: number;
  pageCount?: number;
  category: string;
  confirmedCourseId?: string;
  confirmedCourseName?: string;
  department?: string;
  year?: number;
  semester?: number;
  indexed: boolean;
  contentList?: string[];
  aiSummary?: string;
  indexDisplayName?: string;
  indexedAt?: string | null;
  createdAt?: { toDate: () => Date } | null;
}

type SortKey = 'recent' | 'name' | 'pages' | 'category';

export default function LibraryPage() {
  const { userProfile, firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isChiefOrSupreme = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;

  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [materials, setMaterials] = useState<IndexedMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [filterDept, setFilterDept] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [textExpanded, setTextExpanded] = useState<Set<string>>(new Set());
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  // Admin email whitelist manager
  const [whitelistEmails, setWhitelistEmails] = useState<{ id: string; email: string }[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [addingEmail, setAddingEmail] = useState(false);

  // Access gate
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    async function checkAccess() {
      if (isAdmin) { setHasAccess(true); setAccessChecked(true); return; }
      const snap = await getDocs(
        query(collection(db, 'approved_index_emails'), where('email', '==', firebaseUser!.email))
      );
      if (snap.empty) {
        router.replace('/library/restricted');
      } else {
        setHasAccess(true);
      }
      setAccessChecked(true);
    }
    checkAccess();
  }, [authLoading, firebaseUser, isAdmin, router]);

  // Load materials
  useEffect(() => {
    if (!hasAccess) return;
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'materials'), where('indexed', '==', true)));
        const mats = snap.docs.map(d => ({ id: d.id, ...d.data() } as IndexedMaterial));

        // Enrich with course metadata if missing
        const courseSnap = await getDocs(collection(db, 'courses'));
        const courseMap: Record<string, { department: string; year: number; semester: number }> = {};
        courseSnap.docs.forEach(d => { courseMap[d.id] = d.data() as { department: string; year: number; semester: number }; });

        const enriched = mats.map(m => {
          const course = m.confirmedCourseId ? courseMap[m.confirmedCourseId] : null;
          return { ...m, department: m.department || course?.department, year: m.year || course?.year, semester: m.semester || course?.semester };
        });

        setMaterials(enriched);

        // Load viewed from localStorage
        const storedViewed = JSON.parse(localStorage.getItem('sjr_viewed') ?? '[]');
        setViewed(new Set(storedViewed));

        // Load bookmarks from Firestore
        if (firebaseUser) {
          const bSnap = await getDocs(query(collection(db, 'bookmarks'), where('userId', '==', firebaseUser.uid), where('type', '==', 'library')));
          setBookmarks(new Set(bSnap.docs.map(d => (d.data() as { materialId: string }).materialId)));
        }

        if (isAdmin) {
          const wSnap = await getDocs(collection(db, 'approved_index_emails'));
          setWhitelistEmails(wSnap.docs.map(d => ({ id: d.id, email: (d.data() as { email: string }).email })));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hasAccess, firebaseUser, isAdmin]);

  function markViewed(id: string) {
    const next = new Set(viewed); next.add(id);
    setViewed(next);
    localStorage.setItem('sjr_viewed', JSON.stringify(Array.from(next)));
  }

  async function toggleBookmark(m: IndexedMaterial) {
    if (!firebaseUser) return;
    if (bookmarks.has(m.id)) {
      const snap = await getDocs(query(collection(db, 'bookmarks'), where('userId', '==', firebaseUser.uid), where('materialId', '==', m.id)));
      for (const d of snap.docs) await deleteDoc(doc(db, 'bookmarks', d.id));
      setBookmarks(b => { const n = new Set(b); n.delete(m.id); return n; });
    } else {
      await addDoc(collection(db, 'bookmarks'), { userId: firebaseUser.uid, materialId: m.id, type: 'library', savedAt: serverTimestamp() });
      setBookmarks(b => new Set(b).add(m.id));
    }
  }

  async function handleCopyText(m: IndexedMaterial) {
    if (!m.extractedText) return;
    try {
      await navigator.clipboard.writeText(m.extractedText);
      alert('Text copied to clipboard!');
    } catch { alert('Copy failed — try selecting the text manually.'); }
  }

  function handleDownloadTxt(m: IndexedMaterial) {
    if (!m.extractedText) return;
    const blob = new Blob([m.extractedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (m.indexDisplayName || m.fileName).replace(/\.[^/.]+$/, '') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf(m: IndexedMaterial) {
    if (!m.extractedText) return;
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const title = m.indexDisplayName || m.fileName;
      const margin = 15;
      const pageWidth = 210 - margin * 2;
      const lineHeight = 6;
      let y = 20;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(40, 40, 40);
      const titleLines = pdf.splitTextToSize(title, pageWidth);
      pdf.text(titleLines, margin, y);
      y += titleLines.length * 8 + 6;

      if (m.confirmedCourseName) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text(m.confirmedCourseName, margin, y);
        y += 8;
      }

      pdf.setDrawColor(196, 160, 80);
      pdf.setLineWidth(0.5);
      pdf.line(margin, y, 210 - margin, y);
      y += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);

      const lines = pdf.splitTextToSize(m.extractedText, pageWidth);
      for (const line of lines) {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
      }

      pdf.save((m.indexDisplayName || m.fileName).replace(/\.[^/.]+$/, '') + '.pdf');
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Try downloading as text instead.');
    }
  }

  async function handleDownload(m: IndexedMaterial) {
    const res = await fetch('/api/download-material', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId: m.id }),
    });
    if (!res.ok) { alert('Download failed. You may not have access.'); return; }
    const { signedUrl } = await res.json();
    window.open(signedUrl, '_blank');
  }

  async function handleRemoveFromIndex(id: string) {
    await fetch('/api/index-material', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId: id, action: 'remove' }),
    });
    setMaterials(ms => ms.filter(m => m.id !== id));
    setRemoveConfirm(null);
  }

  async function addWhitelistEmail() {
    if (!newEmail.trim()) return;
    setAddingEmail(true);
    try {
      const ref = await addDoc(collection(db, 'approved_index_emails'), { email: newEmail.trim().toLowerCase() });
      setWhitelistEmails(w => [...w, { id: ref.id, email: newEmail.trim().toLowerCase() }]);
      setNewEmail('');
    } finally {
      setAddingEmail(false);
    }
  }

  async function removeWhitelistEmail(id: string) {
    await deleteDoc(doc(db, 'approved_index_emails', id));
    setWhitelistEmails(w => w.filter(x => x.id !== id));
  }

  function exportList(filtered: IndexedMaterial[]) {
    const lines = filtered.map(m => `${m.confirmedCourseName || 'Unknown Course'} — ${m.indexDisplayName || m.fileName}`).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'library-list.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  // Filtering + sorting
  const filtered = useMemo(() => {
    let list = materials;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.indexDisplayName?.toLowerCase().includes(q) ||
        m.fileName?.toLowerCase().includes(q) ||
        m.confirmedCourseName?.toLowerCase().includes(q) ||
        m.contentList?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (filterDept) list = list.filter(m => m.department === filterDept);
    if (filterYear) list = list.filter(m => String(m.year) === filterYear);
    if (filterSem) list = list.filter(m => String(m.semester) === filterSem);
    if (filterCat) list = list.filter(m => m.category === filterCat);

    return [...list].sort((a, b) => {
      if (sort === 'recent') return (b.indexedAt ? new Date(b.indexedAt as string).getTime() : 0) - (a.indexedAt ? new Date(a.indexedAt as string).getTime() : 0);
      if (sort === 'name') return (a.indexDisplayName || a.fileName).localeCompare(b.indexDisplayName || b.fileName);
      if (sort === 'pages') return (b.pageCount ?? 0) - (a.pageCount ?? 0);
      if (sort === 'category') return a.category.localeCompare(b.category);
      return 0;
    });
  }, [materials, search, sort, filterDept, filterYear, filterSem, filterCat]);

  const isNew = (m: IndexedMaterial) => {
    if (!m.indexedAt) return false;
    return Date.now() - new Date(m.indexedAt as string).getTime() < 7 * 24 * 60 * 60 * 1000;
  };

  const depts = Array.from(new Set(materials.map(m => m.department).filter(Boolean)));
  const years = Array.from(new Set(materials.map(m => String(m.year)).filter(Boolean))).sort();
  const cats = Array.from(new Set(materials.map(m => m.category).filter(Boolean)));

  const CAT_COLORS: Record<string, string> = {
    lecture_notes: '#c4a050', past_questions: '#818cf8', aoc: '#f472b6', syllabus: '#2dd4bf',
  };

  if (authLoading || !accessChecked) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <p style={{ color: 'var(--gold)' }}>Loading...</p>
    </div>
  );

  if (!hasAccess) return null;

  return (
    <AppNav>
      <div style={{ minHeight: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', padding: '24px 16px', paddingTop: '80px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: '4px' }}>
              Lux Studiorum
            </p>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '2px' }}>
              Materials Library
            </h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {filtered.length} material{filtered.length !== 1 ? 's' : ''} indexed
              {materials.length !== filtered.length ? ` · ${materials.length} total` : ''}
            </p>
          </div>
          {isChiefOrSupreme && <button onClick={() => exportList(filtered)}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '9px', padding: '7px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}>
            ↓ Export list
          </button>}
        </div>

        {/* ── Permanent disclaimer ────────────────────────────────────── */}
        <div style={{ borderLeft: '3px solid var(--gold)', background: 'rgba(196,160,80,0.06)', borderRadius: '0 10px 10px 0', padding: '12px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            This library is intended exclusively for Catholic seminarians. All materials contained here are freely distributed lecture notes and student study aids. No commercial or restricted materials are indexed here. Unauthorised access or redistribution is not permitted.
          </p>
        </div>

        {/* ── Controls ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials, topics, courses..."
            style={{ flex: '2 1 200px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 13px', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
            style={{ flex: '1 1 130px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 10px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <option value="recent">Most recent</option>
            <option value="name">Course A–Z</option>
            <option value="pages">Most pages</option>
            <option value="category">Category</option>
          </select>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {[
            { label: 'Dept', options: depts, value: filterDept, set: setFilterDept },
            { label: 'Year', options: years, value: filterYear, set: setFilterYear },
            { label: 'Sem', options: ['1', '2'], value: filterSem, set: setFilterSem },
            { label: 'Category', options: cats, value: filterCat, set: setFilterCat },
          ].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
              style={{ background: f.value ? 'rgba(196,160,80,0.12)' : 'var(--navy-card)', border: `1px solid ${f.value ? 'rgba(196,160,80,0.4)' : 'var(--border)'}`, borderRadius: '99px', padding: '5px 12px', color: f.value ? 'var(--gold)' : 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
              <option value="">All {f.label === 'Category' ? 'Categories' : f.label + 's'}</option>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          {(filterDept || filterYear || filterSem || filterCat || search) && (
            <button onClick={() => { setFilterDept(''); setFilterYear(''); setFilterSem(''); setFilterCat(''); setSearch(''); }}
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '99px', padding: '5px 12px', color: '#fca5a5', fontSize: '0.75rem', cursor: 'pointer' }}>
              Clear all ✕
            </button>
          )}
        </div>

        {/* ── Material grid ───────────────────────────────────────────── */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>Loading library...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: '2rem', marginBottom: '12px' }}>📭</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '6px' }}>No materials match this combination.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Try adjusting your filters or check back later.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {filtered.map(m => {
              const isTopicsOpen = expanded.has(m.id);
              const isTextOpen = textExpanded.has(m.id);
              const bookmarked = bookmarks.has(m.id);
              const wasViewed = viewed.has(m.id);
              const newBadge = isNew(m);
              const related = materials.filter(x => x.id !== m.id && x.confirmedCourseId === m.confirmedCourseId).slice(0, 2);

              return (
                <div key={m.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>

                  {/* Badge row + bookmark */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {newBadge && (
                      <span style={{ background: 'rgba(196,160,80,0.15)', color: 'var(--gold)', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New</span>
                    )}
                    {wasViewed && (
                      <span style={{ background: 'rgba(107,114,128,0.12)', color: '#6b7280', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Viewed</span>
                    )}
                    <span style={{ marginLeft: 'auto', background: CAT_COLORS[m.category] ? 'transparent' : 'transparent', color: CAT_COLORS[m.category] || 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {m.category?.replace('_', ' ')}
                    </span>
                    <button onClick={() => toggleBookmark(m)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', color: bookmarked ? 'var(--gold)' : 'var(--text-muted)', padding: '0', flexShrink: 0 }}>
                      {bookmarked ? '🔖' : '🏷️'}
                    </button>
                  </div>

                  {/* Title */}
                  <div>
                    <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.95rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1.3, marginBottom: '4px' }}>
                      {m.indexDisplayName || m.fileName}
                    </h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>{m.confirmedCourseName || '—'}</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {m.department && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.department.charAt(0).toUpperCase() + m.department.slice(1)}</span>}
                      {m.year && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Year {m.year}</span>}
                      {m.semester && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Sem {m.semester}</span>}
                    </div>
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {m.pageCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.pageCount} pages</span>}
                    {m.wordCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.wordCount.toLocaleString()} words</span>}
                    {m.indexedAt && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Added {typeof m.indexedAt === 'string' ? new Date(m.indexedAt).toLocaleDateString() : m.indexedAt?.toDate().toLocaleDateString()}</span>}
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Uploaded by: A community member</span>
                  </div>

                  {/* AI Summary */}
                  {m.aiSummary && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>{m.aiSummary}</p>
                  )}

                  {/* Topics toggle */}
                  {m.contentList && m.contentList.length > 0 && (
                    <div>
                      <button onClick={() => setExpanded(s => { const n = new Set(s); isTopicsOpen ? n.delete(m.id) : n.add(m.id); return n; })}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Show topics {isTopicsOpen ? '▴' : '▾'}
                      </button>
                      {isTopicsOpen && (
                        <ul style={{ marginTop: '8px', paddingLeft: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {m.contentList.map((t, i) => (
                            <li key={i} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', paddingLeft: '10px', borderLeft: '2px solid rgba(196,160,80,0.3)', lineHeight: 1.4 }}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Related materials */}
                  {related.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Related:</span>
                      {related.map(r => (
                        <button key={r.id} onClick={() => { setSearch(''); setFilterCat(''); }}
                          style={{ background: 'rgba(196,160,80,0.08)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: '99px', padding: '2px 8px', color: 'var(--gold)', fontSize: '0.65rem', cursor: 'pointer' }}>
                          {r.indexDisplayName || r.fileName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* View full text */}
                  {m.extractedText && (
                    <div>
                      <button onClick={() => setTextExpanded(s => { const n = new Set(s); isTextOpen ? n.delete(m.id) : n.add(m.id); return n; })}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', padding: 0 }}>
                        {isTextOpen ? 'Show less ▴' : 'View full text ▾'}
                      </button>
                      {isTextOpen && (
                        <div style={{ marginTop: '8px', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                          {isTextOpen
                            ? m.extractedText
                            : m.extractedText.slice(0, 500) + (m.extractedText.length > 500 ? '...' : '')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto' }}>
                    {m.confirmedCourseId && (
                      <button
                        onClick={() => { markViewed(m.id); router.push(`/dashboard/course/${m.confirmedCourseId}`); }}
                        style={{ width: '100%', padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                        📖 Study this
                      </button>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleDownloadTxt(m)}
                        style={{ flex: 1, padding: '9px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                        📄 Text
                      </button>
                      <button onClick={() => handleDownloadPdf(m)}
                        style={{ flex: 1, padding: '9px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                        🖨️ PDF
                      </button>
                      <button onClick={() => handleDownload(m)}
                        style={{ flex: 1, padding: '9px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                        📥 Original
                      </button>
                    </div>
                    {isAdmin && (
                      removeConfirm === m.id ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleRemoveFromIndex(m.id)}
                            style={{ flex: 1, padding: '7px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                            Confirm remove
                          </button>
                          <button onClick={() => setRemoveConfirm(null)}
                            style={{ padding: '7px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setRemoveConfirm(m.id)}
                          style={{ width: '100%', padding: '7px', background: 'rgba(239,68,68,0.06)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '9px', fontSize: '0.75rem', cursor: 'pointer' }}>
                          Remove from index
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Admin email whitelist manager ───────────────────────────── */}
        {isAdmin && (
          <div style={{ marginTop: '40px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <button onClick={() => setWhitelistOpen(o => !o)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔑 Library access whitelist {whitelistOpen ? '▴' : '▾'}
            </button>
            {whitelistOpen && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addWhitelistEmail()}
                    placeholder="Add email address..."
                    style={{ flex: 1, background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                  <button onClick={addWhitelistEmail} disabled={addingEmail || !newEmail.trim()}
                    style={{ background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: (!newEmail.trim() || addingEmail) ? 0.5 : 1 }}>
                    {addingEmail ? '...' : 'Add'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {whitelistEmails.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
                      <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)' }}>{e.email}</span>
                      <button onClick={() => removeWhitelistEmail(e.id)}
                        style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                    </div>
                  ))}
                  {whitelistEmails.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No approved emails yet.</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppNav>
  );
}
