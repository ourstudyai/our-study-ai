'use client';

import { authFetch } from '@/lib/auth/authFetch';
import { setUploadGuard } from '@/lib/uploadGuard';

import AppNav from '@/components/AppNav';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/config';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import ShareReceiver from '@/components/contribute/ShareReceiver';
import { CATEGORY_OPTIONS } from '@/lib/categories';

const DEPARTMENTS = ['philosophy', 'theology'];
const DEPT_LABELS: Record<string, string> = { philosophy: 'Philosophy', theology: 'Theology' };
const YEARS = [1, 2, 3, 4];
const ACCEPT = '.pdf,.docx,.pptx,.jpg,.jpeg,.png,.md,.markdown,.txt';
const MAX_ATTEMPTS = 3;
const SEMESTERS = [1, 2];
const CATEGORIES = CATEGORY_OPTIONS;
interface Course { id: string; name: string; code?: string; department: string; year: number; semester: number; }
interface Cls { courseId: string | null; courseName: string; category: string; }

type ItemStatus = 'queued' | 'hashing' | 'uploading' | 'done' | 'error' | 'retracted';
interface Item { id: string; file: File; status: ItemStatus; progress: number; error?: string; materialId?: string; dup?: boolean; dupWhere?: string; dupName?: string; dupFor?: string; dupShare?: boolean; dupPlace?: string; }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function formatBytes(b: number) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function badge(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['ppt', 'pptx'].includes(ext)) return '📊';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return '🖼';
  return '📃';
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function putFile(url: string, file: File, onProgress: (p: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Cancelled')); return; }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Storage error ' + xhr.status)));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Timed out'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    if (signal) signal.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

// A clearly formatted notice: icon, bold title, short plain text.
function Callout({ tone, title, children }: { tone: 'warn' | 'error' | 'info' | 'ok'; title?: string; children: React.ReactNode }) {
  const t = {
    warn: { fg: '#eab308', bg: 'rgba(234,179,8,0.08)', bd: 'rgba(234,179,8,0.35)', icon: '⚠' },
    error: { fg: '#ef4444', bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.35)', icon: '⛔' },
    info: { fg: 'var(--gold)', bg: 'rgba(196,160,80,0.07)', bd: 'rgba(196,160,80,0.3)', icon: 'ℹ' },
    ok: { fg: '#22c55e', bg: 'rgba(34,197,94,0.08)', bd: 'rgba(34,197,94,0.3)', icon: '✓' },
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
      <span style={{ color: t.fg, fontSize: '0.95rem', lineHeight: 1.3 }}>{t.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <p style={{ fontSize: '0.78rem', fontWeight: 700, color: t.fg, marginBottom: 2 }}>{title}</p>}
        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

export default function ContributePage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [dept, setDept] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; dup: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<'quick' | 'classify'>('quick');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [sem, setSem] = useState<number | ''>('');
  const [courseId, setCourseId] = useState('');
  const [notListed, setNotListed] = useState(false);
  const [manualName, setManualName] = useState('');
  const [category, setCategory] = useState('lecture_notes');
  const [guardMsg, setGuardMsg] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [confirmRetract, setConfirmRetract] = useState<string | null>(null);
  const [retractBusy, setRetractBusy] = useState<string | null>(null);
  const [retractErr, setRetractErr] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const cancelRef = useRef(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const retractedRef = useRef(0);
  runningRef.current = running;

  useEffect(() => {
    getDocs(query(collection(db, 'courses'), orderBy('department')))
      .then(snap => setAllCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)).filter((c: any) => c.published !== false)))
      .catch(() => {});
  }, []);

  const courseOptions = allCourses.filter(c => c.department === dept && c.year === Number(year) && c.semester === Number(sem));
  const classifyReady = mode === 'quick' || (!!dept && !!year && (notListed ? manualName.trim().length > 2 : courseOptions.some(c => c.id === courseId)));
  const cls: Cls | null = mode === 'classify'
    ? { courseId: notListed ? null : courseId, courseName: notListed ? manualName.trim() : (allCourses.find(c => c.id === courseId)?.name ?? ''), category }
    : null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, patch: Partial<Item>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const addFiles = useCallback((picked: File[]) => {
    if (runningRef.current) return;
    // Old Word / PowerPoint formats (.doc, .ppt) cannot be read by the site: ask for a re-save instead.
    const isOld = (f: File) => /\.(doc|ppt)$/i.test(f.name);
    setRejected(picked.filter(isOld).map(f => f.name));
    const incoming = picked.filter(f => !isOld(f));
    if (!incoming.length) return;
    setResult(null);
    setItems(prev => {
      const seen = new Set(prev.map(i => `${i.file.name}|${i.file.size}|${i.file.lastModified}`));
      const fresh: Item[] = [];
      for (const f of incoming) {
        const k = `${f.name}|${f.size}|${f.lastModified}`;
        if (seen.has(k)) continue;
        seen.add(k);
        fresh.push({ id: uid(), file: f, status: 'queued', progress: 0 });
      }
      return [...prev, ...fresh];
    });
  }, []);

  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running]);

  // While a batch is uploading, links into the library are shown as plain text so nobody leaves the page by mistake.
  useEffect(() => {
    setUploadGuard(running);
    const h = () => { setGuardMsg(true); window.setTimeout(() => setGuardMsg(false), 4000); };
    window.addEventListener('upload-guard-blocked', h);
    return () => { setUploadGuard(false); window.removeEventListener('upload-guard-blocked', h); };
  }, [running]);

  // While uploading, every button, link and field outside the upload controls is locked.
  // Controls marked data-upload-allow (Cancel, Remove, confirmations) stay live.
  useEffect(() => {
    if (!running) return;
    const flash = () => { setGuardMsg(true); window.setTimeout(() => setGuardMsg(false), 4000); };
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest('[data-upload-allow]')) return;
      if (t.closest('button, a, select, input, label, summary, [role="button"]')) { e.preventDefault(); e.stopPropagation(); flash(); }
    };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  }, [running]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const siteLink = (href: string, text: string, bold = false) => running
    ? <span title="Available when all uploads finish" style={{ color: 'var(--text-muted)', textDecoration: 'underline dotted', fontWeight: bold ? 700 : 400, cursor: 'not-allowed' }}>{text}</span>
    : <a href={href} style={{ color: 'var(--gold)', fontWeight: bold ? 700 : 400 }}>{text}</a>;

  // Tells the student exactly where the existing copy is, so they can check it instead of uploading again.
  const dupLine = (it: Item) => {
    const w = it.dupWhere ?? '';
    const label = w === 'library' ? 'the Library' : w === 'removed' ? 'All files' : 'Unsorted';
    const view = w === 'library' ? 'library' : w === 'removed' ? 'all' : 'unsorted';
    const href = `/library?view=${view}${it.dupName ? `&q=${encodeURIComponent(it.dupName)}` : ''}`;
    return (
      <>
        Already on the platform{it.dupName ? <> as “{it.dupName}”</> : null}{it.dupPlace ? <> ({it.dupPlace})</> : null}, so it was not uploaded again.
        {it.dupShare ? <> We have told the admins it is wanted in {it.dupFor}; they can share it there.</> : null}{' '}
        {siteLink(href, `See it in ${label}`, true)}{running ? ' (available when all uploads finish)' : null}
      </>
    );
  };

  async function uploadOne(item: Item, d: string, y: number, cls: Cls | null): Promise<boolean> {
    setItem(item.id, { status: 'hashing', progress: 0, error: undefined });
    const fileHash = await sha256Hex(item.file);
    if (cancelRef.current) throw new Error('Cancelled');

    // Same bytes already on the platform: nothing to upload, count it as received.
    const chk = await authFetch('/api/check-hash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ fileHash, dept: d, year: y, courseId: cls?.courseId ?? null, courseName: cls?.courseName ?? null, fileName: item.file.name }),
    });
    if (chk.ok) {
      const cj = await chk.json();
      if (cj.exists) { setItem(item.id, { status: 'done', progress: 100, dup: true, dupWhere: cj.where, dupName: cj.name ?? undefined, dupFor: `${(DEPT_LABELS as Record<string, string>)[d] ?? d} Year ${y}`, dupShare: !!cj.shareRequested, dupPlace: cj.originalPlace || undefined }); return true; }
    }

    if (cancelRef.current) throw new Error('Cancelled');
    setItem(item.id, { status: 'uploading', progress: 0 });
    const sigRes = await authFetch('/api/cloudinary-signature', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ fileName: item.file.name, folder: cls?.courseId ? `contributions/${cls.courseId}` : `contributions/unsorted/${d}-y${y}`, mimeType: item.file.type || 'application/octet-stream' }),
    });
    if (!sigRes.ok) throw new Error('Could not start upload (' + sigRes.status + ')');
    const { signedUrl, key } = await sigRes.json();

    await putFile(signedUrl, item.file, p => setItem(item.id, { progress: p }), ctrlRef.current?.signal);

    const reg = await authFetch('/api/process-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        key, fileHash, fileName: item.file.name, mimeType: item.file.type || 'application/octet-stream',
        fileSize: item.file.size, uploadDepartment: d, uploadYear: y,
        ...(cls ? { suggestedCourseId: cls.courseId, suggestedCourseName: cls.courseName, category: cls.category } : {}),
      }),
    });
    if (!reg.ok) throw new Error('Could not save file (' + reg.status + ')');
    const regJson = await reg.json().catch(() => ({} as any));
    setItem(item.id, { status: 'done', progress: 100, materialId: regJson?.materialId });
    return false;
  }

  // Waits while the phone is offline instead of burning retry attempts.
  const waitOnline = async () => {
    while (typeof navigator !== 'undefined' && navigator.onLine === false && !cancelRef.current) await sleep(1000);
  };

  async function handleUpload() {
    if (!dept || !year || running) return;
    const targets = items.filter(i => i.status === 'queued' || i.status === 'error');
    if (!targets.length) return;
    setRunning(true); setResult(null); setWasCancelled(false); setConfirmCancel(false);
    cancelRef.current = false; ctrlRef.current = new AbortController(); retractedRef.current = 0;
    let ok = 0, fail = 0, dup = 0, stopped = false;

    for (const item of targets) {
      if (cancelRef.current) { stopped = true; break; }
      let done = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done && !cancelRef.current; attempt++) {
        try {
          await waitOnline();
          if (cancelRef.current) break;
          if (await uploadOne(item, dept, year as number, cls)) dup++;
          done = true;
        } catch (e: any) {
          if (cancelRef.current || e?.message === 'Cancelled') { setItem(item.id, { status: 'queued', progress: 0, error: undefined }); break; }
          if (attempt === MAX_ATTEMPTS) setItem(item.id, { status: 'error', error: e?.message ?? 'Failed' });
          else await sleep(attempt * 1500);
        }
      }
      if (done) ok++;
      else if (cancelRef.current) { stopped = true; break; }
      else fail++;
    }

    const newCount = ok - dup - retractedRef.current;
    if (newCount > 0) {
      authFetch('/api/process-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ notifyOnly: true, count: newCount, label: `${DEPT_LABELS[dept]} Year ${year}` }),
      }).catch(() => {});
    }
    if (stopped) { setWasCancelled(true); setResult(null); }
    else setResult({ ok: Math.max(0, ok - retractedRef.current), fail, dup });
    ctrlRef.current = null;
    setRunning(false);
  }

  // Stops the batch: the file being sent is dropped, the rest are not started. Received files stay.
  function doCancel() {
    cancelRef.current = true;
    ctrlRef.current?.abort();
    setConfirmCancel(false);
  }

  // Takes back a file that was already received (wrong file, or something private).
  async function retract(it: Item) {
    if (!it.materialId) return;
    setRetractBusy(it.id); setRetractErr(null);
    try {
      const r = await authFetch('/api/retract-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ materialId: it.materialId }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error(j?.error || 'Could not remove the file (' + r.status + ')');
      retractedRef.current += 1;
      setItem(it.id, { status: 'retracted', materialId: undefined });
      setResult(prev => (prev ? { ...prev, ok: Math.max(0, prev.ok - 1) } : prev));
      setConfirmRetract(null);
    } catch (e: any) {
      setRetractErr(e?.message ?? 'Failed');
    } finally {
      setRetractBusy(null);
    }
  }

  async function handleSignIn() {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch { /* user closed popup */ }
  }

  const pending = items.filter(i => i.status === 'queued' || i.status === 'error').length;
  const doneCount = items.filter(i => i.status === 'done').length;
  const failedCount = items.filter(i => i.status === 'error').length;
  const canUpload = !!dept && !!year && pending > 0 && !running && classifyReady;

  if (authLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <img src="/icons/icon-192.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain', opacity: 0.5, animation: 'lux-breathe 2s ease-in-out infinite' }} />
        <style>{`@keyframes lux-breathe{0%,100%{opacity:0.3}50%{opacity:0.8}}`}</style>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--body-bg)', backgroundImage: 'var(--body-bg-image)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <p style={{ fontSize: '2.4rem', marginBottom: 12 }}>📤</p>
          <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Contribute Materials</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 24 }}>Sign in to share notes, past questions and study materials.</p>
          <button onClick={handleSignIn} style={{ width: '100%', padding: '13px', background: 'var(--gold)', color: '#0a1020', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
            Sign in with Google
          </button>
          <button onClick={() => router.push('/')} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer' }}>← Back</button>
        </div>
      </div>
    );
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, cursor: running ? 'default' : 'pointer',
    background: active ? 'var(--gold)' : 'var(--navy-card)', color: active ? '#0a1020' : 'var(--text-secondary)',
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`, opacity: running ? 0.6 : 1,
  });

  return (
    <AppNav>
      <ShareReceiver onFilesReceived={addFiles} />
      <div style={{ minHeight: '100dvh', background: 'var(--body-bg)', backgroundImage: 'var(--body-bg-image)', color: 'var(--text-primary)', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        <button onClick={() => { if (!running) router.push('/dashboard'); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', marginBottom: 20, padding: 0 }}>
          ← Dashboard
        </button>

        <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: 2 }}>📤 Contribute</p>
        <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.4rem', fontWeight: 700, marginBottom: 14 }}>Upload Materials</h1>

        <div style={{ background: 'rgba(196,160,80,0.07)', border: '1px solid rgba(196,160,80,0.25)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>How it works</p>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.75 }}>
            <li>Choose your department and year.</li>
            <li>Tap <b>Select files</b> and pick <b>all</b> the files you want to share, in one go.</li>
            <li>Tap <b>Upload</b> once, and keep this page open until every file shows ✓.</li>
          </ol>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            No need to name or sort anything. Admins will organise the files into the right courses.
          </p>
        </div>

        <div style={{ opacity: running ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Department</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {DEPARTMENTS.map(d => (
            <button key={d} disabled={running} onClick={() => setDept(d)} style={chip(dept === d)}>{DEPT_LABELS[d]}</button>
          ))}
        </div>

        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Year</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {YEARS.map(y => (
            <button key={y} disabled={running} onClick={() => setYear(y)} style={chip(year === y)}>Year {y}</button>
          ))}
        </div>

        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>How do you want to upload?</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button disabled={running} onClick={() => setMode('quick')} style={chip(mode === 'quick')}>⚡ Quick upload</button>
          <button disabled={running} onClick={() => setMode('classify')} style={chip(mode === 'classify')}>🏷 I'll classify</button>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
          {mode === 'quick'
            ? 'Just upload. Admins will sort the files into courses.'
            : 'Tell us the course and type. This applies to every file in this upload, so upload files from different courses in separate rounds.'}
        </p>

        {mode === 'classify' && (
          <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Semester</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {SEMESTERS.map(s => (
                <button key={s} disabled={running} onClick={() => { setSem(s); setCourseId(''); setNotListed(false); }} style={chip(sem === s)}>Semester {s}</button>
              ))}
            </div>

            {dept && year && sem ? (
              <>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Course</p>
                {!notListed && (
                  <select value={courseId} disabled={running} onChange={e => setCourseId(e.target.value)}
                    style={{ width: '100%', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 8 }}>
                    <option value="">{courseOptions.length ? 'Select course' : 'No courses found for this selection'}</option>
                    {courseOptions.map(c => <option key={c.id} value={c.id}>{c.code ? c.code + ' · ' : ''}{c.name}</option>)}
                  </select>
                )}
                {notListed && (
                  <input value={manualName} disabled={running} onChange={e => setManualName(e.target.value)} placeholder="Full course name…"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 8 }} />
                )}
                <button disabled={running} onClick={() => { setNotListed(n => !n); setCourseId(''); setManualName(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.74rem', cursor: 'pointer', padding: 0, marginBottom: 14 }}>
                  {notListed ? '← Pick from the list' : 'My course is not listed →'}
                </button>

                <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Type of material</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CATEGORIES.map(c => (
                    <button key={c.key} disabled={running} onClick={() => setCategory(c.key)} style={chip(category === c.key)}>{c.label}</button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: '0.74rem', color: '#eab308' }}>
                {!dept || !year ? 'Choose department and year above first.' : 'Choose a semester to see courses.'}
              </p>
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
          onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />

        <div
          onClick={() => !running && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!running) addFiles(Array.from(e.dataTransfer.files)); }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--border)'}`, borderRadius: 16, padding: '28px 16px',
            textAlign: 'center', cursor: running ? 'default' : 'pointer', background: 'var(--navy-card)', marginBottom: 16,
          }}>
          <p style={{ fontSize: '1.8rem', marginBottom: 6 }}>📁</p>
          <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Select files</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PDF, Word (.docx), PowerPoint (.pptx), images, text. Choose as many as you like.</p>
        </div>
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
          Already have the file? Check {siteLink('/library', 'Library')},{' '}
          {siteLink('/library?view=unsorted', 'Unsorted')} or{' '}
          {siteLink('/library?view=all', 'All files')} first. Anything we already hold is recognised and not stored twice.{running ? ' These links are available when all uploads finish.' : null}
        </p>

        {rejected.length > 0 && (
          <Callout tone="warn" title="Some files were not added">
            {rejected.join(', ')}: old format that the site cannot read. Open the file, choose <b>Save As</b> .docx / .pptx (or PDF), then add that file.
          </Callout>
        )}

        {items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {items.map(it => (
              <div key={it.id} style={{ background: 'var(--navy-card)', border: `1px solid ${it.status === 'error' ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>{badge(it.file.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.file.name}</p>
                    <p style={{ fontSize: '0.68rem', color: it.status === 'error' ? '#ef4444' : 'var(--text-muted)' }}>
                      {formatBytes(it.file.size)} ·{' '}
                      {it.status === 'queued' && 'Ready'}
                      {it.status === 'hashing' && 'Checking…'}
                      {it.status === 'uploading' && `Uploading ${it.progress}%`}
                      {it.status === 'done' && (it.dup ? dupLine(it) : 'Received')}
                      {it.status === 'error' && (it.error ?? 'Failed') + ', tap Retry'}
                      {it.status === 'retracted' && 'Removed from the platform'}
                    </p>
                  </div>
                  {it.status === 'done' && <span style={{ color: '#22c55e', fontSize: '1.1rem', fontWeight: 700 }}>✓</span>}
                  {it.status === 'done' && !it.dup && it.materialId && (
                    <button data-upload-allow onClick={() => { setRetractErr(null); setConfirmRetract(it.id); }} disabled={retractBusy === it.id}
                      style={{ background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#f87171', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', padding: '3px 8px' }}>
                      Remove
                    </button>
                  )}
                  {!running && it.status !== 'done' && (
                    <button onClick={() => setItems(p => p.filter(x => x.id !== it.id))} aria-label="Remove"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1rem', cursor: 'pointer', padding: 4 }}>✕</button>
                  )}
                </div>
                {confirmRetract === it.id && (
                  <div data-upload-allow style={{ marginTop: 10 }}>
                    <Callout tone="error" title="Remove this file from the platform?">
                      It will be permanently deleted from our storage and cannot be recovered. Use this if you picked the wrong file or it contains something private. If an admin has already started sorting it, you will need to ask them instead.
                      {retractErr && <span style={{ display: 'block', color: '#f87171', marginTop: 6, fontWeight: 600 }}>{retractErr}</span>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button onClick={() => retract(it)} disabled={retractBusy === it.id}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: retractBusy === it.id ? 0.6 : 1 }}>
                          {retractBusy === it.id ? 'Removing…' : 'Yes, remove it'}
                        </button>
                        <button onClick={() => setConfirmRetract(null)}
                          style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                          Keep it
                        </button>
                      </div>
                    </Callout>
                  </div>
                )}
                {it.status === 'uploading' && (
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${it.progress}%`, height: '100%', background: 'var(--gold)', transition: 'width 0.2s' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {result && !running && (
          <div style={{ background: result.fail ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${result.fail ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: result.fail ? '#ef4444' : '#22c55e', marginBottom: 2 }}>
              {result.ok - result.dup} file{result.ok - result.dup !== 1 ? 's' : ''} received{result.dup ? `, ${result.dup} already on the platform` : ''}{result.fail ? `, ${result.fail} failed` : ''}
            </p>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {result.fail ? 'Tap Retry to upload the failed files again.' : 'Thank you! Admins will sort them into the right courses.'}
            </p>
            {result.dup > 0 && (
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                Files marked "Already on the platform" were found in our records and not stored twice. Look for them in{' '}
                <a href="/library" style={{ color: 'var(--gold)', fontWeight: 700 }}>Library</a>,{' '}
                <a href="/library?view=unsorted" style={{ color: 'var(--gold)', fontWeight: 700 }}>Unsorted</a> or{' '}
                <a href="/library?view=all" style={{ color: 'var(--gold)', fontWeight: 700 }}>All files</a>.
              </p>
            )}
          </div>
        )}

        {guardMsg && (
          <Callout tone="warn" title="Locked while uploading">
            Menus, links and settings are switched off until every file is received, so nothing interrupts the upload. Use <b>Cancel upload</b> if you need to stop.
          </Callout>
        )}

        {offline && (running || pending > 0) && (
          <Callout tone="error" title="No internet connection">
            {running ? 'The upload is paused and will carry on by itself when the connection returns. You can also cancel it.' : 'Reconnect to the internet before you upload.'}
          </Callout>
        )}

        {wasCancelled && !running && (
          <Callout tone="warn" title="Upload stopped">
            {doneCount} file{doneCount !== 1 ? 's' : ''} received, {pending} not sent yet. Tap <b>Continue</b> to send the rest. Files already received stay on the platform. Use <b>Remove</b> on a file if you sent one by mistake.
          </Callout>
        )}

        {(!dept || !year) && items.length > 0 && (
          <Callout tone="warn" title="Choose your department and year">
            We need to know where these files belong before they can be uploaded.
          </Callout>
        )}

        {mode === 'classify' && !!dept && !!year && items.length > 0 && !classifyReady && (
          <Callout tone="warn" title="Finish the course details">
            Pick the semester, course and type above, or switch to Quick upload.
          </Callout>
        )}

        {running && (
          <Callout tone="info" title={`Uploading ${doneCount} of ${items.length}. Keep this page open`}>
            Leaving or closing the page stops the upload. Files already received are safe. If something goes wrong, you can continue with the files that are left.
          </Callout>
        )}

        {running ? (
          <div data-upload-allow>
            {confirmCancel ? (
              <Callout tone="warn" title="Stop uploading?">
                The file being sent right now is dropped and the rest are not sent. Files already received stay on the platform, and you can continue afterwards.
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={doCancel}
                    style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>Yes, stop</button>
                  <button onClick={() => setConfirmCancel(false)}
                    style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 14px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>Keep uploading</button>
                </div>
              </Callout>
            ) : (
              <button onClick={() => setConfirmCancel(true)}
                style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                Cancel upload
              </button>
            )}
          </div>
        ) : (
          <button onClick={handleUpload} disabled={!canUpload}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: '0.92rem',
              background: canUpload ? 'var(--gold)' : 'var(--border)', color: canUpload ? '#0a1020' : 'var(--text-muted)',
              cursor: canUpload ? 'pointer' : 'not-allowed',
            }}>
            {failedCount > 0 && failedCount === pending ? `Retry ${failedCount} failed`
              : doneCount > 0 && pending > 0 ? `Continue: ${pending} file${pending !== 1 ? 's' : ''} left`
              : pending > 0 ? `Upload ${pending} file${pending !== 1 ? 's' : ''}` : 'Upload'}
          </button>
        )}
      </div>
      </div>
    </AppNav>
  );
}
