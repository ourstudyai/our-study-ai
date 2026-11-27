'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import AudiobookPlayer from '@/components/AudiobookPlayer';
import TextSearch from '@/components/TextSearch';
import FullscreenButton from '@/components/FullscreenToggle';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import AppNav from '@/components/AppNav';
import ExternalLibraryButton from '@/components/ExternalLibraryButton';
import { db } from '@/lib/firebase/config';
import LuxLoader from '@/components/LuxLoader';
import UnsortedBrowser, { LibraryTabs } from '@/components/library/UnsortedBrowser';
import { Chevron, ShelfRail, groupByCategory } from '@/components/library/shelfUi';
import { courseLabel as courseShortLabel, courseAliases, displayName, downloadBase } from '@/lib/courseLabel';
import MiniLoader from '@/components/MiniLoader';
import { authFetch } from '@/lib/auth/authFetch';
import {
  collection, getDocs, query, where,
  addDoc, deleteDoc, doc, serverTimestamp, updateDoc,
  getDoc,
} from 'firebase/firestore';

const SUPREME = 'ourstudyai@gmail.com';

interface TopicNode {
  title: string;
  level: number;
  subtopics: TopicNode[];
}

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
  sharedCourseIds?: string[];
  department?: string;
  year?: number;
  semester?: number;
  indexed: boolean;
  contentList?: string[];
  topicTree?: TopicNode[];
  aiSummary?: string;
  indexDisplayName?: string;
  indexedAt?: string | null;
  createdAt?: { toDate: () => Date } | null;
}

type SortKey = 'recent' | 'name' | 'category';
const NAT = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const CAT_COLORS: Record<string, string> = {
  lecture_notes: '#c4a050',
  past_questions: '#818cf8',
  aoc: '#f472b6',
  syllabus: '#2dd4bf',
  student_notes: '#4ade80',
  other: '#94a3b8',
};
const CAT_DARK: Record<string, string> = {
  lecture_notes: '#7a6020',
  past_questions: '#4338ca',
  aoc: '#be185d',
  syllabus: '#0f766e',
  student_notes: '#15803d',
  other: '#475569',
};
const CAT_LABELS: Record<string, string> = {
  lecture_notes: 'Handout',
  past_questions: 'Past Questions',
  aoc: 'AOC',
  syllabus: 'Syllabus',
  student_notes: "Student's Notes",
  other: 'Other',
};

const SPINE_WIDTH = 44;
const SPINE_HEIGHT = 160;
const FONT = "'Noto Serif', 'Noto Serif Hebrew', Georgia, serif";

// ── Inline markdown renderer ─────────────────────────────────────────────────
function Inline({ text }: { text: string }) {
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  const parts: React.ReactNode[] = [];
  let last = 0; let match; let idx = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={idx}><em>{match[2]}</em></strong>);
    else if (match[3]) parts.push(<strong key={idx}>{match[3]}</strong>);
    else if (match[4]) parts.push(<em key={idx}>{match[4]}</em>);
    last = match.index + match[0].length; idx++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ── Full markdown renderer ───────────────────────────────────────────────────
function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        h1: ({ children }) => <h1 style={{ fontFamily: FONT, fontSize: '1.15rem', fontWeight: 700, color: 'var(--gold)', marginTop: '24px', marginBottom: '8px', lineHeight: 1.4, borderBottom: '1px solid rgba(196,160,80,0.25)', paddingBottom: '6px' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontFamily: FONT, fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', marginTop: '20px', marginBottom: '6px', lineHeight: 1.4, opacity: 0.9 }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontFamily: FONT, fontSize: '0.93rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '16px', marginBottom: '4px', lineHeight: 1.4 }}>{children}</h3>,
        h4: ({ children }) => <h4 style={{ fontFamily: FONT, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', marginBottom: '4px', fontStyle: 'italic' }}>{children}</h4>,
        p: ({ children }) => <p style={{ fontFamily: FONT, fontSize: '0.85rem', lineHeight: 1.9, color: 'var(--text-primary)', marginBottom: '10px' }}>{children}</p>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
        ul: ({ children }) => <ul style={{ paddingLeft: '20px', margin: '6px 0 10px', listStyleType: 'disc', fontSize: '0.85rem', lineHeight: 1.85, color: 'var(--text-primary)', fontFamily: FONT }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: '24px', margin: '6px 0 10px', fontSize: '0.85rem', lineHeight: 1.85, color: 'var(--text-primary)', fontFamily: FONT }}>{children}</ol>,
        li: ({ children }) => <li style={{ marginBottom: '3px' }}>{children}</li>,
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(196,160,80,0.2)', margin: '16px 0' }} />,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid rgba(196,160,80,0.4)', paddingLeft: '1rem', margin: '0.8rem 0', color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: FONT }}>{children}</blockquote>,
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.82rem', fontFamily: FONT }}>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead style={{ background: 'rgba(196,160,80,0.1)' }}>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr style={{ borderBottom: '1px solid rgba(196,160,80,0.15)' }}>{children}</tr>,
        th: ({ children }) => <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--gold)', borderBottom: '2px solid rgba(196,160,80,0.35)', whiteSpace: 'nowrap' }}>{children}</th>,
        td: ({ children }) => <td style={{ padding: '7px 12px', color: 'var(--text-primary)', verticalAlign: 'top' }}>{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ── Downloads ────────────────────────────────────────────────────────────────
function buildHtmlDoc(title: string, course: string, text: string, asPdf: boolean): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Convert markdown to basic HTML for the print window
  const lines = text.split('\n');
  const htmlLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '') { htmlLines.push('<br/>'); i++; continue; }
    if (l.startsWith('# ')) { htmlLines.push(`<h1>${esc(l.slice(2))}</h1>`); i++; continue; }
    if (l.startsWith('## ')) { htmlLines.push(`<h2>${esc(l.slice(3))}</h2>`); i++; continue; }
    if (l.startsWith('### ')) { htmlLines.push(`<h3>${esc(l.slice(4))}</h3>`); i++; continue; }
    if (l.startsWith('#### ')) { htmlLines.push(`<h4>${esc(l.slice(5))}</h4>`); i++; continue; }
    if (/^[-*_]{3,}$/.test(l.trim())) { htmlLines.push('<hr/>'); i++; continue; }
    if (l.trimStart().startsWith('- ') || l.trimStart().startsWith('* ')) {
      htmlLines.push('<ul>');
      while (i < lines.length && (lines[i].trimStart().startsWith('- ') || lines[i].trimStart().startsWith('* '))) {
        htmlLines.push(`<li>${esc(lines[i].trimStart().slice(2))}</li>`); i++;
      }
      htmlLines.push('</ul>'); continue;
    }
    if (/^\d+\.\s/.test(l.trimStart())) {
      htmlLines.push('<ol>');
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trimStart())) {
        htmlLines.push(`<li>${esc(lines[i].trimStart().replace(/^\d+\.\s/, ''))}</li>`); i++;
      }
      htmlLines.push('</ol>'); continue;
    }
    // table — detect | ... | rows
    if (l.trimStart().startsWith('|')) {
      htmlLines.push('<table>');
      let isHeader = true;
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        const row = lines[i];
        // skip separator rows like |---|---|
        if (/^\|[\s\-:|]+\|/.test(row)) { isHeader = false; i++; continue; }
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        if (isHeader) {
          htmlLines.push('<thead><tr>' + cells.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>');
          isHeader = false;
        } else {
          htmlLines.push('<tr>' + cells.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>');
        }
        i++;
      }
      htmlLines.push('</tbody></table>'); continue;
    }
    // inline bold/italic
    const inline = esc(l)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
    htmlLines.push(`<p>${inline}</p>`); i++;
  }
  const body = htmlLines.join('\n');
  const printScript = asPdf ? '<script>window.onload=()=>{window.print();}<\/script>' : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400&family=Noto+Serif+Hebrew&display=swap" rel="stylesheet"/>
  <style>
    body{font-family:'Noto Serif','Noto Serif Hebrew',Georgia,serif;font-size:11pt;line-height:1.85;color:#1a1a1a;margin:40px;max-width:700px;}
    h1{font-size:16pt;font-weight:700;margin:24px 0 8px;color:#1a1a1a;border-bottom:1px solid #c4a050;padding-bottom:6px;}
    h2{font-size:13pt;font-weight:700;margin:20px 0 6px;color:#2a2a2a;}
    h3{font-size:11.5pt;font-weight:700;margin:16px 0 4px;}
    h4{font-size:10.5pt;font-weight:700;font-style:italic;margin:12px 0 4px;color:#444;}
    p{margin:0 0 8px;}
    ul,ol{padding-left:24px;margin:6px 0 10px;}
    li{margin-bottom:3px;}
    hr{border:none;border-top:1px solid #c4a050;margin:16px 0;}
    table{border-collapse:collapse;width:100%;margin:12px 0 16px;font-size:10.5pt;}
    th{padding:7px 12px;text-align:left;font-weight:700;color:#7a6020;border-bottom:2px solid #c4a050;background:#fdf8ee;white-space:nowrap;}
    td{padding:6px 12px;border-bottom:1px solid #e8dfc8;vertical-align:top;}
    tr:nth-child(even) td{background:#fdfaf4;}
    .title-block{margin-bottom:20px;}
    .course{font-size:10pt;color:#666;font-style:italic;margin-bottom:4px;}
    .divider{border:none;border-top:1px solid #c4a050;margin:16px 0 24px;}
    @media print{body{margin:20mm;}}
  </style>
</head>
<body>
  <div class="title-block">
    <h1 style="border:none;margin-bottom:4px;">${esc(title)}</h1>
    ${course ? `<p class="course">${esc(course)}</p>` : ''}
  </div>
  <hr class="divider"/>
  ${body}
  ${printScript}
</body>
</html>`;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function LibraryPage() {
  const { userProfile, firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;
  const isChiefOrSupreme = userProfile?.role === 'chief_admin' || firebaseUser?.email === SUPREME;

  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [materials, setMaterials] = useState<IndexedMaterial[]>([]);
  const [courseMap, setCourseMap] = useState<Record<string, { name: string; department: string; year: number; semester: number }>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [filterDept, setFilterDept] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [libView, setLibView] = useState<'library' | 'unsorted' | 'all'>('library');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'unsorted' || v === 'all') setLibView(v);
    const qs = params.get('q');
    if (qs && v !== 'unsorted' && v !== 'all') setSearch(qs);
  }, []);
  const switchView = (v: 'library' | 'unsorted' | 'all') => {
    setLibView(v);
    window.history.replaceState(null, '', v === 'library' ? '/library' : `/library?view=${v}`);
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullTextViewer, setFullTextViewer] = useState<{ fileName: string; text: string } | null>(null);
  const [bodyCache, setBodyCache] = useState<Record<string, string>>({});
  const [bodyFetching, setBodyFetching] = useState<string | null>(null);

  const [shelfView, setShelfView] = useState<Record<string, 'covers' | 'spine' | 'list'>>({});
  const [shelfCollapsed, setShelfCollapsed] = useState<Set<string>>(new Set());

  const [whitelistEmails, setWhitelistEmails] = useState<{ id: string; email: string }[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [addingEmail, setAddingEmail] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    // Library is open to every signed-in user (no settings/whitelist gate).
    setHasAccess(true); setAccessChecked(true);
  }, [authLoading, firebaseUser, isAdmin, router]);

  useEffect(() => {
    if (!hasAccess) return;
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'materials'), where('indexed', '==', true), where('status', '==', 'approved')));
        const mats = snap.docs.map(d => ({ id: d.id, ...d.data() } as IndexedMaterial));
        const courseSnap = await getDocs(collection(db, 'courses'));
        const cMap: Record<string, { name: string; department: string; year: number; semester: number }> = {};
        courseSnap.docs.forEach(d => { cMap[d.id] = d.data() as any; });
        setCourseMap(cMap);
        const enriched = mats.map(m => {
          const course = m.confirmedCourseId ? cMap[m.confirmedCourseId] : null;
          return { ...m, department: m.department || course?.department, year: m.year || course?.year, semester: m.semester || course?.semester };
        });
        setMaterials(enriched);
        const storedViewed = JSON.parse(localStorage.getItem('sjr_viewed') ?? '[]');
        setViewed(new Set(storedViewed));
        if (firebaseUser) {
          const bSnap = await getDocs(query(collection(db, 'bookmarks'), where('userId', '==', firebaseUser.uid), where('type', '==', 'library')));
          setBookmarks(new Set(bSnap.docs.map(d => (d.data() as { materialId: string }).materialId)));
        }
        if (isAdmin) {
          const wSnap = await getDocs(collection(db, 'approved_index_emails'));
          setWhitelistEmails(wSnap.docs.map(d => ({ id: d.id, email: (d.data() as { email: string }).email })));
        }
      } finally { setLoading(false); }
    }
    load();
  }, [hasAccess, firebaseUser, isAdmin]);

  function markViewed(id: string) {
    const next = new Set(viewed); next.add(id);
    setViewed(next);
    localStorage.setItem('sjr_viewed', JSON.stringify(Array.from(next)));
  }
async function fetchBody(materialId: string): Promise<string> {
    if (bodyCache[materialId]) return bodyCache[materialId];
    setBodyFetching(materialId);
    try {
      const res = await fetch('/api/material-body?materialId=' + encodeURIComponent(materialId));
      const { extractedText } = await res.json();
      const text = extractedText ?? '';
      setBodyCache(c => ({ ...c, [materialId]: text }));
      return text;
    } finally {
      setBodyFetching(null);
    }
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

  async function handleDownloadTxt(m: IndexedMaterial) {
    const text = await fetchBody(m.id);
    if (!text) return;
    const html = buildHtmlDoc(downloadBase(m, (courseMap as any)[m.confirmedCourseId ?? '']), courseShortLabel((courseMap as any)[m.confirmedCourseId ?? ''], m.confirmedCourseName ?? ''), text, false);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadBase(m, (courseMap as any)[m.confirmedCourseId ?? '']) + '.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf(m: IndexedMaterial) {
    const text = await fetchBody(m.id);
    if (!text) return;
    const html = buildHtmlDoc(downloadBase(m, (courseMap as any)[m.confirmedCourseId ?? '']), courseShortLabel((courseMap as any)[m.confirmedCourseId ?? ''], m.confirmedCourseName ?? ''), text, true);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) alert('Allow popups to download as PDF.');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function handleDownload(m: IndexedMaterial) { window.open(m.fileUrl, '_blank'); }

  // Display name only: nothing else about the material (file, chunks, course) is touched.
  async function handleRename(m: IndexedMaterial, next: string) {
    const name = next.trim();
    if (!name || name === displayName(m)) { setRenamingId(null); return; }
    setRenameBusy(true);
    try {
      await updateDoc(doc(db, 'materials', m.id), {
        indexDisplayName: name, previousDisplayName: m.indexDisplayName ?? null, updatedAt: new Date().toISOString(),
      });
      setMaterials(prev => prev.map(x => (x.id === m.id ? { ...x, indexDisplayName: name } : x)));
      setRenamingId(null);
    } catch (e: any) { alert('Rename failed: ' + (e?.message ?? e)); }
    finally { setRenameBusy(false); }
  }

  async function handleRemoveFromIndex(id: string) {
    await authFetch('/api/index-material', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId: id, action: 'remove' }) });
    setMaterials(ms => ms.filter(m => m.id !== id));
    setRemoveConfirm(null);
    if (selectedId === id) setSelectedId(null);
  }

  async function addWhitelistEmail() {
    if (!newEmail.trim()) return;
    setAddingEmail(true);
    try {
      const ref = await addDoc(collection(db, 'approved_index_emails'), { email: newEmail.trim().toLowerCase() });
      setWhitelistEmails(w => [...w, { id: ref.id, email: newEmail.trim().toLowerCase() }]);
      setNewEmail('');
    } finally { setAddingEmail(false); }
  }

  async function removeWhitelistEmail(id: string) {
    await deleteDoc(doc(db, 'approved_index_emails', id));
    setWhitelistEmails(w => w.filter(x => x.id !== id));
  }

  function exportList(filtered: IndexedMaterial[]) {
    const lines = filtered.map(m => `${m.confirmedCourseName || 'Unknown Course'} — ${displayName(m)}`).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'library-list.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  const isNew = (m: IndexedMaterial) => {
    if (!m.indexedAt) return false;
    return Date.now() - new Date(m.indexedAt as string).getTime() < 7 * 24 * 60 * 60 * 1000;
  };

  const filtered = useMemo(() => {
    let list = materials;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.indexDisplayName?.toLowerCase().includes(q) || m.fileName?.toLowerCase().includes(q) || m.confirmedCourseName?.toLowerCase().includes(q) || m.contentList?.some(t => t.toLowerCase().includes(q)));
    }
    if (filterDept) list = list.filter(m => m.department === filterDept);
    if (filterYear) list = list.filter(m => String(m.year) === filterYear);
    if (filterSem) list = list.filter(m => String(m.semester) === filterSem);
    if (filterCat) list = list.filter(m => m.category === filterCat);
    return [...list].sort((a, b) => {
      if (sort === 'recent') return (b.indexedAt ? new Date(b.indexedAt as string).getTime() : 0) - (a.indexedAt ? new Date(a.indexedAt as string).getTime() : 0);
      if (sort === 'name') return NAT.compare(displayName(a), displayName(b));
      if (sort === 'category') return a.category.localeCompare(b.category);
      return 0;
    });
  }, [materials, search, sort, filterDept, filterYear, filterSem, filterCat]);

  const depts = Array.from(new Set(materials.map(m => m.department).filter(Boolean))) as string[];
  const years = Array.from(new Set(materials.map(m => String(m.year)).filter(Boolean))).sort();
  const cats = Array.from(new Set(materials.map(m => m.category).filter(Boolean))) as string[];

  const shelfTree = useMemo(() => {
    const tree: Record<string, Record<string, Record<string, Record<string, IndexedMaterial[]>>>> = {};
    const place = (m: IndexedMaterial, courseId: string | null | undefined) => {
      const course = courseId ? (courseMap as any)[courseId] : null;
      const dept = (m.department || course?.department || 'Uncategorised') as string;
      const yr = course?.year ? `Year ${course.year}` : m.year ? `Year ${m.year}` : 'Year Unknown';
      const sem = course?.semester ? `Semester ${course.semester}` : m.semester ? `Semester ${m.semester}` : 'Semester Unknown';
      if (!tree[dept]) tree[dept] = {};
      if (!tree[dept][yr]) tree[dept][yr] = {};
      const ck = courseId && course ? courseId : 'unassigned';
      if (!tree[dept][yr][sem]) tree[dept][yr][sem] = {};
      if (!tree[dept][yr][sem][ck]) tree[dept][yr][sem][ck] = [];
      if (!tree[dept][yr][sem][ck].find(x => x.id === m.id)) tree[dept][yr][sem][ck].push(m);
    };
    for (const m of filtered) {
      place(m, m.confirmedCourseId);
      if (m.sharedCourseIds?.length) for (const sid of m.sharedCourseIds) place(m, sid);
    }
    return tree;
  }, [filtered, courseMap]);

  const titleCase = (t: string) => t.replace(/\b\w/g, c => c.toUpperCase());
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const yearNo = (yr: string) => yr.replace(/^Year\s+/i, '');
  const semNo = (sem: string) => sem.replace(/^Semester\s+/i, '');
  const shelfId = (dept: string, yr: string, sem: string) => `shelf-${slug(dept)}-${slug(yr)}-${slug(sem)}`;
  // "Theology 2 · Semester 1"
  const semHeading = (dept: string, yr: string, sem: string) =>
    /^\d+$/.test(yearNo(yr)) ? `${titleCase(dept)} ${yearNo(yr)} · ${sem}` : `${titleCase(dept)} · ${yr} · ${sem}`;

  const jumpTargets = useMemo(() => {
    const out: { id: string; key: string; label: string }[] = [];
    const multi = Object.keys(shelfTree).length > 1;
    Object.entries(shelfTree).sort(([a], [b]) => a.localeCompare(b)).forEach(([dept, yrs]) => {
      Object.entries(yrs).sort(([a], [b]) => NAT.compare(a, b)).forEach(([yr, sems]) => {
        Object.keys(sems).sort((a, b) => NAT.compare(a, b)).forEach(sem => {
          const y = /^\d+$/.test(yearNo(yr)) ? `Y${yearNo(yr)}` : 'Y?';
          const sm = /^\d+$/.test(semNo(sem)) ? `S${semNo(sem)}` : 'S?';
          out.push({
            id: shelfId(dept, yr, sem),
            key: `${dept}|${yr}|${sem}`,
            label: multi ? `${titleCase(dept)} ${y} · ${sm}` : `${y} · ${sm}`,
          });
        });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfTree]);

  const [allSems, setAllSems] = useState(false);
  const [bypass, setBypass] = useState(false);
  const [libViewMode, setLibViewMode] = useState<'covers' | 'spine' | 'list'>('covers');
  useEffect(() => {
    try {
      const v = localStorage.getItem('lux_lib_view');
      if (v === 'covers' || v === 'spine' || v === 'list') setLibViewMode(v);
    } catch { /* ignore */ }
  }, []);
  const chooseView = (v: 'covers' | 'spine' | 'list') => {
    setLibViewMode(v);
    try { localStorage.setItem('lux_lib_view', v); } catch { /* ignore */ }
  };

  const classCards = useMemo(() => {
    const map = new Map<string, { dept: string; year: string; count: number }>();
    materials.forEach(m => {
      const d = String(m.department ?? '').trim();
      const y = m.year ? String(m.year) : '';
      if (!d || !y) return;
      const k = `${d}|${y}`;
      const cur = map.get(k) ?? { dept: d, year: y, count: 0 };
      cur.count += 1;
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.dept.localeCompare(b.dept) || NAT.compare(a.year, b.year));
  }, [materials]);

  const changeClass = () => { setFilterDept(''); setFilterYear(''); setFilterSem(''); setAllSems(false); setBypass(false); };
  const openInLibrary = (id: string) => {
    const m = materials.find(x => x.id === id);
    setLibView('library');
    window.history.replaceState(null, '', '/library');
    if (m) {
      setFilterDept(String(m.department ?? '')); setFilterYear(m.year ? String(m.year) : '');
      setFilterSem(''); setAllSems(true); setSearch(''); setSelectedId(id);
    }
  };

  const shut = (k: string) => shelfCollapsed.has(k);
  const toggleShelf = (k: string) => setShelfCollapsed(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const expandAll = () => setShelfCollapsed(new Set());
  const collapseAll = () => setShelfCollapsed(new Set(jumpTargets.map(t => t.key)));

  const jumpTo = (t: { id: string; key: string }) => {
    const yearKey = t.key.split('|').slice(0, 2).join('|');
    setShelfCollapsed(prev => {
      if (!prev.has(t.key) && !prev.has(yearKey)) return prev;
      const n = new Set(prev); n.delete(t.key); n.delete(yearKey); return n;
    });
    setTimeout(() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // A big library starts with every semester closed (so the structure is visible); searching or filtering opens everything.
  const shelvesInit = useRef(false);
  useEffect(() => {
    if (!jumpTargets.length) return;
    if (search || filterDept || filterYear || filterSem || filterCat) { setShelfCollapsed(new Set()); return; }
    if (!shelvesInit.current) {
      shelvesInit.current = true;
      if (filtered.length > 24) setShelfCollapsed(new Set(jumpTargets.map(t => t.key)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTargets, search, filterDept, filterYear, filterSem, filterCat]);

  const selectedMaterial = selectedId ? materials.find(m => m.id === selectedId) ?? null : null;

  const courseLabel = (ck: string) => {
    if (ck === 'unassigned') return 'Course not specified';
    const c = (courseMap as any)[ck];
    return c ? [c.code, c.name].filter(Boolean).join(' · ') : 'Course not specified';
  };

  // Under a course heading, drop the repeated course prefix: "PHL 201 · Handout 3" -> "Handout 3".
  const shortTitle = (m: IndexedMaterial, ck: string) => {
    const full = displayName(m);
    const c = (courseMap as any)[ck];
    const names = [...courseAliases(c), ck === m.confirmedCourseId ? m.confirmedCourseName : ''].filter(Boolean) as string[];
    let t = full;
    for (const n of names) {
      const re = new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[·—–:-]\\s*', 'i');
      if (re.test(t)) { t = t.replace(re, ''); break; }
    }
    const plain: Record<string, string> = {
      'lecture notes': 'Handout', 'notes': 'Handout', 'past questions': 'Past Questions',
      'aoc': 'Areas of Concentration', 'syllabus': 'Syllabus', 'material': 'Material', 'other': 'Material',
    };
    t = t.trim();
    return t ? (plain[t.toLowerCase()] ?? t) : full;
  };

  // ── Topic tree renderer (collapsible) ─────────────────────────────────────
  function LibraryTopicTree({ nodes, depth = 0 }: { nodes: TopicNode[]; depth?: number }): React.ReactNode {
    const [collapsed, setCollapsed] = useState<Set<number>>(
      () => new Set(nodes.map((_, i) => i).filter(() => depth > 0))
    );
    const toggle = (i: number) => setCollapsed(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {nodes.map((node, i) => {
          const hasChildren = Array.isArray(node.subtopics) && node.subtopics.length > 0;
          const isCollapsed = collapsed.has(i);
          return (
            <li key={i} style={{ paddingLeft: depth * 12 }}>
              <div
                onClick={() => hasChildren && toggle(i)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '4px',
                  padding: '3px 0',
                  cursor: hasChildren ? 'pointer' : 'default',
                  borderLeft: depth === 0 ? '2px solid rgba(196,160,80,0.4)' : depth === 1 ? '1px solid rgba(196,160,80,0.15)' : 'none',
                  paddingLeft: depth === 0 ? '8px' : depth === 1 ? '6px' : '0',
                }}
              >
                {hasChildren && (
                  <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', flexShrink: 0, marginTop: '4px', display: 'inline-block', transition: 'transform 0.15s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', userSelect: 'none' }}>▾</span>
                )}
                {!hasChildren && depth > 0 && (
                  <span style={{ fontSize: '0.5rem', color: 'rgba(196,160,80,0.3)', flexShrink: 0, marginTop: '4px' }}>–</span>
                )}
                <span style={{
                  display: 'block', fontFamily: FONT,
                  fontSize: depth === 0 ? '0.8rem' : depth === 1 ? '0.74rem' : '0.7rem',
                  color: depth === 0 ? 'var(--text-primary)' : depth === 1 ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: depth === 0 ? 700 : depth === 1 ? 500 : 400,
                  lineHeight: 1.5, flex: 1,
                }}>
                  {node.title}
                </span>
                {hasChildren && isCollapsed && (
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', background: 'rgba(196,160,80,0.08)', borderRadius: '99px', padding: '1px 5px', flexShrink: 0, marginTop: '3px' }}>
                    {countLibraryNodes(node.subtopics)}
                  </span>
                )}
              </div>
              {hasChildren && !isCollapsed && <LibraryTopicTree nodes={node.subtopics} depth={depth + 1} />}
            </li>
          );
        })}
      </ul>
    );
  }

  function countLibraryNodes(nodes: TopicNode[]): number {
    let n = nodes.length;
    for (const node of nodes) { if (node.subtopics?.length) n += countLibraryNodes(node.subtopics); }
    return n;
  }

  // ── Detail card ────────────────────────────────────────────────────────────
  const renderDetailCard = (m: IndexedMaterial) => {
    const isTopicsOpen = expanded.has(m.id);
    const bookmarked = bookmarks.has(m.id);
    const wasViewed = viewed.has(m.id);
    const related = materials.filter(x => x.id !== m.id && x.confirmedCourseId === m.confirmedCourseId).slice(0, 2);
    return (
      <div style={{ margin: '0', padding: '20px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', animation: 'fadeSlideIn 0.15s ease' }}>
        <style>{`@keyframes fadeSlideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
              {isNew(m) && <span style={{ background: 'rgba(196,160,80,0.15)', color: 'var(--gold)', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', textTransform: 'uppercase' }}>New</span>}
              {wasViewed && <span style={{ background: 'rgba(107,114,128,0.12)', color: '#6b7280', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px', textTransform: 'uppercase' }}>Viewed</span>}
              <span style={{ color: CAT_COLORS[m.category] || 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.category?.replace('_', ' ')}</span>
            </div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', lineHeight: 1.3, marginBottom: '4px' }}>{displayName(m)}</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>{m.confirmedCourseName || '—'}</p>
            {m.sharedCourseIds && m.sharedCourseIds.length > 0 && (
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Also in: {m.sharedCourseIds.map(id => { const c = (courseMap as any)[id]; return c ? `${c.name} (Y${c.year} S${c.semester})` : null; }).filter(Boolean).join(', ')}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {m.department && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.department.charAt(0).toUpperCase() + m.department.slice(1)}</span>}
              {m.year && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Year {m.year}</span>}
              {m.semester && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Sem {m.semester}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
            <button onClick={() => toggleBookmark(m)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: bookmarked ? 'var(--gold)' : 'var(--text-muted)', padding: '0' }}>{bookmarked ? '🔖' : '🏷️'}</button>
            <button onClick={() => setSelectedId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {isAdmin && (
          renamingId === m.id ? (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <input value={renameDraft} onChange={e => setRenameDraft(e.target.value)} autoFocus maxLength={120}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(m, renameDraft); if (e.key === 'Escape') setRenamingId(null); }}
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              <button onClick={() => handleRename(m, renameDraft)} disabled={renameBusy}
                style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: 'var(--gold)', color: '#0a1020', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>
                {renameBusy ? '…' : 'Save'}
              </button>
              <button onClick={() => setRenamingId(null)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.74rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => { setRenamingId(m.id); setRenameDraft(displayName(m)); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', padding: 0, marginBottom: '10px' }}>
              ✏️ Rename (display name only)
            </button>
          )
        )}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {m.wordCount && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.wordCount.toLocaleString()} words</span>}
          {m.indexedAt && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Added {new Date(m.indexedAt).toLocaleDateString()}</span>}
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Uploaded by: A community member</span>
        </div>

        {m.aiSummary && <p style={{ fontFamily: FONT, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic', marginBottom: '10px' }}>{m.aiSummary}</p>}

        {((m.topicTree && m.topicTree.length > 0) || (m.contentList && m.contentList.length > 0)) && (
          <div style={{ marginBottom: '10px' }}>
            <button onClick={() => setExpanded(s => { const n = new Set(s); isTopicsOpen ? n.delete(m.id) : n.add(m.id); return n; })}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isTopicsOpen ? '▴' : '▾'} Topics ({
                m.topicTree && m.topicTree.length > 0
                  ? (() => {
                      const sub = countLibraryNodes(m.topicTree) - m.topicTree.length;
                      return sub > 0
                        ? `${m.topicTree.length} · ${sub} sub`
                        : String(m.topicTree.length);
                    })()
                  : String(m.contentList?.length ?? 0)
              })
            </button>
            {isTopicsOpen && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(196,160,80,0.04)', borderRadius: '8px', border: '1px solid rgba(196,160,80,0.1)' }}>
                {m.topicTree && m.topicTree.length > 0
                  ? <LibraryTopicTree nodes={m.topicTree} depth={0} />
                  : m.contentList?.map((t, i) => (
                      <div key={i} style={{ fontFamily: FONT, fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '10px', borderLeft: '2px solid rgba(196,160,80,0.3)', lineHeight: 1.6, marginBottom: '2px' }}>{t}</div>
                    ))
                }
              </div>
            )}
          </div>
        )}

        {related.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Related:</span>
            {related.map(r => (
              <button key={r.id} onClick={() => setSelectedId(r.id)} style={{ background: 'rgba(196,160,80,0.08)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: '99px', padding: '2px 8px', color: 'var(--gold)', fontSize: '0.65rem', cursor: 'pointer' }}>
                {displayName(r)}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={async () => {
              const text = await fetchBody(m.id);
              if (text) setFullTextViewer({ fileName: displayName(m), text });
            }}
            disabled={bodyFetching === m.id}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 14px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            {bodyFetching === m.id ? '⏳ Loading…' : '📄 View full text ↗'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {m.confirmedCourseId && (
            <button onClick={() => { markViewed(m.id); router.push(`/dashboard/course/${m.confirmedCourseId}`); }}
              style={{ width: '100%', padding: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              📖 Study this
            </button>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => handleDownloadTxt(m)} style={{ flex: 1, padding: '9px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>📄 HTML</button>
            <button onClick={() => handleDownloadPdf(m)} style={{ flex: 1, padding: '9px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>🖨️ PDF</button>
            <button onClick={() => handleDownload(m)} style={{ flex: 1, padding: '9px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '9px', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>📥 Original</button>
          </div>
          {isAdmin && (
            removeConfirm === m.id ? (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleRemoveFromIndex(m.id)} style={{ flex: 1, padding: '7px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Confirm remove</button>
                <button onClick={() => setRemoveConfirm(null)} style={{ padding: '7px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setRemoveConfirm(m.id)} style={{ width: '100%', padding: '7px', background: 'rgba(239,68,68,0.06)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '9px', fontSize: '0.75rem', cursor: 'pointer' }}>Remove from index</button>
            )
          )}
        </div>
      </div>
    );
  };

  if (authLoading || !accessChecked) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', flexDirection: 'column', gap: 12, padding: 24 }}>
      <LuxLoader label="Loading library..." />
      <div style={{ color: 'var(--gold)', fontSize: '0.7rem', textAlign: 'center', opacity: 0.8 }}>
        authLoading: {String(authLoading)} | accessChecked: {String(accessChecked)} | hasAccess: {String(hasAccess)} | isAdmin: {String(isAdmin)} | role: {userProfile?.role ?? 'null'}
      </div>
    </div>
  );

  if (!hasAccess) return null;

  if (libView !== 'library') return (
    <AppNav>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 16px 60px' }}>
        <div style={{ paddingTop: '80px', marginBottom: '14px' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '2px' }}>{libView === 'all' ? 'All Files' : 'Unsorted Uploads'}</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {libView === 'all' ? 'Every file on the platform, sorted or not, with where it is now.' : 'Browse files while they wait for admins to sort and approve them.'}
          </p>
        </div>
        <LibraryTabs value={libView} onChange={switchView} />
        <UnsortedBrowser firebaseUser={firebaseUser} mode={libView} onOpenLibrary={openInLibrary} />
      </div>
    </AppNav>
  );

  // Class first, then semester, then the materials load.
  const classChosen = !!(filterDept && filterYear);
  const semChosen = !!filterSem || allSems;
  const landing = !bypass && !classChosen && !search && !filterCat;
  const needSem = !bypass && classChosen && !semChosen && !search && !filterCat;
  const semCount = (s: string) => materials.filter(m => m.department === filterDept && String(m.year) === filterYear && String(m.semester) === s).length;
  const classTotal = materials.filter(m => m.department === filterDept && String(m.year) === filterYear).length;
  const pickCard: React.CSSProperties = { textAlign: 'left', padding: '16px 14px', borderRadius: '12px', border: '1px solid rgba(196,160,80,0.3)', background: 'linear-gradient(160deg, rgba(196,160,80,0.12), rgba(196,160,80,0.03))', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px' };

  return (
    <AppNav>
      {/* Fullscreen text viewer */}
      {fullTextViewer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--navy)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--navy-card)' }}>
            <button onClick={() => setFullTextViewer(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullTextViewer.fileName}</p>
            <TextSearch text={fullTextViewer.text} />
            <FullscreenButton />
          </div>
          <div data-tts-scroll="1" style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
            <MarkdownBody text={fullTextViewer.text} />
          </div>
          <AudiobookPlayer text={fullTextViewer.text} title={fullTextViewer.fileName} storageKey={'lib:' + fullTextViewer.fileName} />
        </div>
      )}

      <div style={{ minHeight: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', paddingTop: '80px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 16px 60px' }}>

          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: '4px' }}>Lux Studiorum</p>
              <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(1.2rem, 5vw, 1.6rem)', fontWeight: 700, color: 'var(--gold)', marginBottom: '2px' }}>Materials Library</h1>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{filtered.length} material{filtered.length !== 1 ? 's' : ''} indexed{materials.length !== filtered.length ? ` · ${materials.length} total` : ''}</p>
              {isChiefOrSupreme && (
                <button onClick={() => exportList(filtered)} style={{ marginTop: '8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '9px', padding: '7px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}>↓ Export list</button>
              )}
            </div>
            <ExternalLibraryButton />
          </div>

          <div style={{ borderLeft: '3px solid var(--gold)', background: 'rgba(196,160,80,0.06)', borderRadius: '0 10px 10px 0', padding: '12px 16px', marginBottom: '20px' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>This library is intended exclusively for Catholic seminarians. All materials contained here are freely distributed lecture notes and student study aids. No commercial or restricted materials are indexed here. Unauthorised access or redistribution is not permitted.</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials, topics, courses..."
              style={{ flex: '2 1 200px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 13px', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              style={{ flex: '1 1 130px', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 10px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              <option value="recent">Most recent</option>
              <option value="name">Course A–Z</option>
              <option value="category">Category</option>
            </select>
          </div>

          <LibraryTabs value={libView} onChange={switchView} />

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
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

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px', alignItems: 'center' }}>
            {Object.entries(CAT_COLORS).map(([cat, color]) => (
              <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block', flexShrink: 0 }} />
                {CAT_LABELS[cat] ?? cat.replace('_', ' ')}
              </span>
            ))}
          </div>

          {!loading && !landing && !needSem && filtered.length > 0 && <ShelfRail targets={jumpTargets} onJump={jumpTo} />}

          {!loading && !search && (classChosen || bypass) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(196,160,80,0.3)', background: 'rgba(196,160,80,0.07)' }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.92rem', marginRight: 'auto' }}>
                {classChosen ? `${titleCase(filterDept)} · Year ${filterYear}${semChosen ? ` · ${filterSem ? `Semester ${filterSem}` : 'All semesters'}` : ''}` : 'Everything, all classes'}
              </span>
              {classChosen && semChosen && (
                <button onClick={() => { setFilterSem(''); setAllSems(false); }} style={{ padding: '5px 12px', borderRadius: '99px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Change semester</button>
              )}
              <button onClick={changeClass} style={{ padding: '5px 12px', borderRadius: '99px', border: '1px solid rgba(196,160,80,0.4)', background: 'transparent', color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Change class</button>
            </div>
          )}

          {!loading && landing && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.15rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>Choose your class</p>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.6 }}>Pick your department and year first, then a semester. The materials load after that. Or type in the search box to look across everything.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                {classCards.map(c => (
                  <button key={`${c.dept}|${c.year}`} onClick={() => { setFilterDept(c.dept); setFilterYear(c.year); setFilterSem(''); setAllSems(false); }} style={pickCard}>
                    <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{c.dept}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 700 }}>Year {c.year}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.count} item{c.count !== 1 ? 's' : ''}</span>
                  </button>
                ))}
                <button onClick={() => setBypass(true)} style={{ ...pickCard, border: '1px dashed var(--border)', background: 'transparent' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Everything</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>All classes</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{materials.length} items</span>
                </button>
              </div>
            </div>
          )}

          {!loading && needSem && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.15rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>Choose a semester</p>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '14px' }}>The materials for it load once you pick.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                {['1', '2'].map(s => (
                  <button key={s} onClick={() => setFilterSem(s)} style={pickCard}>
                    <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Semester {s}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{semCount(s)} item{semCount(s) !== 1 ? 's' : ''}</span>
                  </button>
                ))}
                <button onClick={() => setAllSems(true)} style={{ ...pickCard, border: '1px dashed var(--border)', background: 'transparent' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>All semesters</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{classTotal} items</span>
                </button>
              </div>
            </div>
          )}

          {!loading && (landing || needSem) ? null : loading ? (
            <MiniLoader label="Loading materials..." />
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: '2rem', marginBottom: '12px' }}>📭</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '6px' }}>No materials match this combination.</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <div className="lux-shelves" style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
              <style>{`.lux-shelves{padding-right:50px}@media (min-width:1260px){.lux-shelves{padding-right:0}}`}</style>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '-30px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
                  {filtered.length} item{filtered.length !== 1 ? 's' : ''} · tap a heading to open or close it
                </span>
                <button onClick={expandAll} style={{ padding: '5px 12px', borderRadius: '99px', border: '1px solid rgba(196,160,80,0.4)', background: 'transparent', color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Expand all</button>
                <button onClick={collapseAll} style={{ padding: '5px 12px', borderRadius: '99px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Collapse all</button>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
                  {(['covers', 'spine', 'list'] as const).map(v => (
                    <button key={v} onClick={() => chooseView(v)} aria-pressed={libViewMode === v}
                      style={{ padding: '5px 11px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, background: libViewMode === v ? 'rgba(196,160,80,0.22)' : 'transparent', color: libViewMode === v ? 'var(--gold)' : 'var(--text-muted)' }}>
                      {v === 'covers' ? '▦ Covers' : v === 'spine' ? '⫿ Spines' : '☰ List'}
                    </button>
                  ))}
                </div>
              </div>
              {Object.entries(shelfTree).sort(([a], [b]) => a.localeCompare(b)).map(([dept, deptYears]) => (
                <div key={dept}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '26px' }}>
                    <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, transparent, var(--gold))', opacity: 0.5 }} />
                    <div style={{ textAlign: 'center' }}>
                      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.22em', whiteSpace: 'nowrap', margin: 0 }}>{dept}</h2>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: '5px' }}>
                        ✦ {new Set(Object.values(deptYears).flatMap(s => Object.values(s).flatMap(c => Object.values(c).flat().map(x => x.id)))).size} items ✦
                      </p>
                    </div>
                    <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to left, transparent, var(--gold))', opacity: 0.5 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {Object.entries(deptYears).sort(([a], [b]) => NAT.compare(a, b)).map(([yr, semesters]) => (
                      <div key={yr}>
                        <button onClick={() => toggleShelf(`${dept}|${yr}`)} aria-expanded={!shut(`${dept}|${yr}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '14px', padding: '11px 14px', background: 'linear-gradient(90deg, rgba(196,160,80,0.18), rgba(196,160,80,0.03))', border: 'none', borderLeft: '4px solid var(--gold)', borderRadius: '0 10px 10px 0' }}>
                          <Chevron open={!shut(`${dept}|${yr}`)} size={24} />
                          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--gold)', flex: 1 }}>
                            {/^\d+$/.test(yearNo(yr)) ? `${titleCase(dept)} · ${yr}` : 'Year not specified'}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                            {Object.keys(semesters).length} semester{Object.keys(semesters).length !== 1 ? 's' : ''} · {new Set(Object.values(semesters).flatMap(c => Object.values(c).flat().map(x => x.id))).size} items
                          </span>
                        </button>
                        <div style={{ display: shut(`${dept}|${yr}`) ? 'none' : 'flex', flexDirection: 'column', gap: '20px' }}>
                          {Object.entries(semesters).sort(([a], [b]) => NAT.compare(a, b)).map(([sem, semCourses]) => {
                            const shelfKey = `${dept}|${yr}|${sem}`;
                            const isCollapsed = shelfCollapsed.has(shelfKey);
                            const viewMode = libViewMode;
                            const cm = courseMap as any;
                            const courseEntries = Object.entries(semCourses).sort(([a], [b]) => {
                              if (a === 'unassigned') return 1;
                              if (b === 'unassigned') return -1;
                              return NAT.compare(String(cm[a]?.code || cm[a]?.name || ''), String(cm[b]?.code || cm[b]?.name || ''));
                            });
                            const semAll = Array.from(new Map(courseEntries.flatMap(([, it]) => it).map(x => [x.id, x] as const)).values());
                            const cardCourseKey = selectedMaterial
                              ? courseEntries.find(([, it]) => it.some(x => x.id === selectedMaterial.id))?.[0]
                              : undefined;
                            return (
                              <div key={sem} id={shelfId(dept, yr, sem)} style={{ scrollMarginTop: 100 }}>
                                <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                                  <div style={{ padding: '8px 16px', borderBottom: isCollapsed ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(196,160,80,0.04)' }}>
                                    <button onClick={() => toggleShelf(shelfKey)} aria-expanded={!isCollapsed}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', flex: 1, textAlign: 'left', minWidth: 0 }}>
                                      <Chevron open={!isCollapsed} />
                                      <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>{semHeading(dept, yr, sem)}</span>
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{courseEntries.length} course{courseEntries.length !== 1 ? 's' : ''} · {semAll.length} item{semAll.length !== 1 ? 's' : ''}</span>
                                      {!isCollapsed && (
                                        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                                          {(['covers', 'spine', 'list'] as const).map(mode => (
                                            <button key={mode} onClick={() => chooseView(mode)}
                                              title={mode === 'covers' ? 'Cover view' : mode === 'spine' ? 'Spine view' : 'List view'}
                                              style={{ background: viewMode === mode ? 'rgba(196,160,80,0.18)' : 'transparent', border: 'none', borderRight: mode !== 'list' ? '1px solid var(--border)' : 'none', color: viewMode === mode ? 'var(--gold)' : 'var(--text-muted)', padding: '4px 8px', cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1 }}>
                                              {mode === 'covers' ? '▦' : mode === 'spine' ? '⫿' : '☰'}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {!isCollapsed && (
                                    <div>
                                      {courseEntries.map(([ck, semMaterials]) => (
                                      <div key={ck} style={{ borderTop: '1px solid rgba(196,160,80,0.14)' }}>
                                      <button onClick={() => toggleShelf(`${shelfKey}|${ck}`)} aria-expanded={!shut(`${shelfKey}|${ck}`)}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '9px', padding: '13px 16px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                        <Chevron open={!shut(`${shelfKey}|${ck}`)} size={18} />
                                        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.86rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.03em', flex: 1, minWidth: 0 }}>{courseLabel(ck)}</span>
                                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>{semMaterials.length} item{semMaterials.length !== 1 ? 's' : ''}</span>
                                      </button>
                                      {groupByCategory(semMaterials).map(({ key: catKey, label: catLabel, items: semMaterials }) => {
                                        const catK = `${shelfKey}|${ck}|${catKey}`;
                                        const catShut = shut(catK);
                                        const catColor = CAT_COLORS[semMaterials[0]?.category] ?? '#94a3b8';
                                        return (
                                      <div key={catKey} style={{ display: shut(`${shelfKey}|${ck}`) ? 'none' : 'block' }}>
                                        <button onClick={() => toggleShelf(catK)} aria-expanded={!catShut}
                                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px 4px 38px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                                          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{catLabel}</span>
                                          <span style={{ flex: 1, borderBottom: '1px dotted rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: '2px' }} />
                                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{semMaterials.length}</span>
                                          <span style={{ fontSize: '0.62rem', color: 'var(--gold)', fontWeight: 700, width: '38px', textAlign: 'right' }}>{catShut ? 'Show' : 'Hide'}</span>
                                        </button>
                                        <div style={{ display: catShut ? 'none' : 'block' }}>
                                      {viewMode === 'covers' ? (
                                        <div style={{ padding: '12px 16px 0' }}>
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '10px' }}>
                                            {semMaterials.map(m => {
                                              const color = CAT_COLORS[m.category] ?? '#94a3b8';
                                              const darkColor = CAT_DARK[m.category] ?? '#475569';
                                              const isSelected = selectedId === m.id;
                                              return (
                                                <button key={m.id} onClick={() => setSelectedId(isSelected ? null : m.id)} title={displayName(m)}
                                                  style={{
                                                    aspectRatio: '3 / 4', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                                    textAlign: 'left', padding: '9px 8px 8px 12px', cursor: 'pointer',
                                                    background: `linear-gradient(160deg, ${color}dd 0%, ${darkColor} 100%)`,
                                                    border: isSelected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
                                                    borderLeft: `6px solid ${darkColor}`, borderRadius: '3px 6px 6px 3px',
                                                    boxShadow: isSelected ? '0 8px 20px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.35)',
                                                    transform: isSelected ? 'translateY(-4px)' : 'none', transition: 'transform 0.15s ease',
                                                  }}>
                                                  <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>{CAT_LABELS[m.category] ?? ''}</span>
                                                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.25, color: '#fff', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{shortTitle(m, ck)}</span>
                                                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.58rem', color: 'rgba(255,255,255,0.75)' }}>
                                                    {bookmarks.has(m.id) && <span>🔖</span>}
                                                    {isNew(m) && <span style={{ color: 'rgba(255,220,100,0.95)', fontWeight: 700 }}>NEW</span>}
                                                  </span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div style={{ height: '12px', marginTop: '10px', background: 'linear-gradient(180deg, #5a4220 0%, #3d2c14 100%)', borderTop: '1px solid rgba(255,255,255,0.12)', borderRadius: '0 0 4px 4px' }} />
                                        </div>
                                      ) : viewMode === 'spine' ? (
                                        <div>
                                          <div style={{ padding: '20px 16px 0', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', minWidth: 'max-content' }}>
                                              {semMaterials.map(m => {
                                                const color = CAT_COLORS[m.category] ?? '#94a3b8';
                                                const darkColor = CAT_DARK[m.category] ?? '#475569';
                                                const isSelected = selectedId === m.id;
                                                const bookmarked = bookmarks.has(m.id);
                                                const newBadge = isNew(m);
                                                const title = shortTitle(m, ck);
                                                const hashCode = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                                                const heightVar = SPINE_HEIGHT + (hashCode % 40);
                                                return (
                                                  <button key={m.id} onClick={() => setSelectedId(isSelected ? null : m.id)} title={title}
                                                    style={{ width: `${SPINE_WIDTH}px`, height: `${heightVar}px`, flexShrink: 0, background: isSelected ? `linear-gradient(180deg,${color} 0%,${darkColor} 100%)` : `linear-gradient(180deg,${color}cc 0%,${darkColor}aa 100%)`, border: isSelected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.08)', borderBottom: 'none', borderRadius: '3px 3px 0 0', cursor: 'pointer', position: 'relative', overflow: 'hidden', transform: isSelected ? 'translateY(-8px)' : 'translateY(0)', transition: 'transform 0.15s ease,box-shadow 0.15s ease', boxShadow: isSelected ? `0 8px 24px rgba(0,0,0,0.5),2px 0 0 rgba(255,255,255,0.1) inset` : `1px 0 0 rgba(255,255,255,0.06) inset,-1px 0 0 rgba(0,0,0,0.3) inset`, padding: 0 }}>
                                                    <div style={{ position: 'absolute', top: 0, left: '4px', bottom: 0, width: '1px', background: 'rgba(255,255,255,0.12)' }} />
                                                    <div style={{ position: 'absolute', top: 0, right: '5px', bottom: 0, width: '1px', background: 'rgba(0,0,0,0.2)' }} />
                                                    {bookmarked && <div style={{ position: 'absolute', top: '6px', left: '50%', transform: 'translateX(-50%)', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.8)' }} />}
                                                    {newBadge && <div style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(255,220,100,0.9)' }} />}
                                                    <div style={{ position: 'absolute', inset: '12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'hidden' }}>
                                                      <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)', letterSpacing: '0.04em', fontFamily: 'Playfair Display, serif', overflow: 'hidden', maxHeight: '100%', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', lineHeight: 1.3, textAlign: 'center' }}>{title}</span>
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                            <div style={{ height: '12px', background: 'linear-gradient(180deg,rgba(196,160,80,0.25) 0%,rgba(196,160,80,0.08) 100%)', borderTop: '1px solid rgba(196,160,80,0.3)', borderRadius: '0 0 4px 4px' }} />
                                          </div>
                                        </div>
                                      ) : (
                                        <div style={{ padding: '4px 0' }}>
                                          {semMaterials.map(m => {
                                            const color = CAT_COLORS[m.category] ?? '#94a3b8';
                                            const isSelected = selectedId === m.id;
                                            const bookmarked = bookmarks.has(m.id);
                                            const title = shortTitle(m, ck);
                                            return (
                                              <button key={m.id} onClick={() => setSelectedId(isSelected ? null : m.id)}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 16px', background: isSelected ? 'rgba(196,160,80,0.07)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}>
                                                <div style={{ width: '3px', height: '32px', borderRadius: '99px', background: color, flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Playfair Display, serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '1px' }}>{title}</p>
                                                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.confirmedCourseName || '—'}</p>
                                                </div>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color, background: `${color}18`, padding: '2px 7px', borderRadius: '99px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.category?.replace('_', ' ')}</span>
                                                {bookmarked && <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>🔖</span>}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                        </div>
                                      </div>
                                        );
                                      })}
                                      {!shut(`${shelfKey}|${ck}`) && selectedMaterial && ck === cardCourseKey && renderDetailCard(selectedMaterial)}
                                      </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div style={{ marginTop: '40px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <button onClick={() => setWhitelistOpen(o => !o)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🔑 Library access whitelist {whitelistOpen ? '▴' : '▾'}
              </button>
              {whitelistOpen && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWhitelistEmail()} placeholder="Add email address..."
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
                        <button onClick={() => removeWhitelistEmail(e.id)} style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                      </div>
                    ))}
                    {whitelistEmails.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No approved emails yet.</p>}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </AppNav>
  );
}
