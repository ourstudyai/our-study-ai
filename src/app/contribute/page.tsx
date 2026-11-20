'use client';

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
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.md,.markdown,.txt';
const MAX_ATTEMPTS = 3;
const SEMESTERS = [1, 2];
const CATEGORIES = CATEGORY_OPTIONS;
interface Course { id: string; name: string; code?: string; department: string; year: number; semester: number; }
interface Cls { courseId: string | null; courseName: string; category: string; }

type ItemStatus = 'queued' | 'hashing' | 'uploading' | 'done' | 'error';
interface Item { id: string; file: File; status: ItemStatus; progress: number; error?: string; dup?: boolean; }

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

function putFile(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Storage error ' + xhr.status)));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Timed out'));
    xhr.send(file);
  });
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

  const addFiles = useCallback((incoming: File[]) => {
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

  async function uploadOne(item: Item, d: string, y: number, cls: Cls | null): Promise<boolean> {
    setItem(item.id, { status: 'hashing', progress: 0, error: undefined });
    const fileHash = await sha256Hex(item.file);

    // Same bytes already on the platform: nothing to upload, count it as received.
    const chk = await fetch('/api/check-hash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ fileHash, dept: d, year: y, courseId: cls?.courseId ?? null, courseName: cls?.courseName ?? null }),
    });
    if (chk.ok && (await chk.json()).exists) { setItem(item.id, { status: 'done', progress: 100, dup: true }); return true; }

    setItem(item.id, { status: 'uploading', progress: 0 });
    const sigRes = await fetch('/api/cloudinary-signature', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ fileName: item.file.name, folder: cls?.courseId ? `contributions/${cls.courseId}` : `contributions/unsorted/${d}-y${y}`, mimeType: item.file.type || 'application/octet-stream' }),
    });
    if (!sigRes.ok) throw new Error('Could not start upload (' + sigRes.status + ')');
    const { signedUrl, key } = await sigRes.json();

    await putFile(signedUrl, item.file, p => setItem(item.id, { progress: p }));

    const reg = await fetch('/api/process-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        key, fileHash, fileName: item.file.name, mimeType: item.file.type || 'application/octet-stream',
        fileSize: item.file.size, uploadDepartment: d, uploadYear: y,
        ...(cls ? { suggestedCourseId: cls.courseId, suggestedCourseName: cls.courseName, category: cls.category } : {}),
      }),
    });
    if (!reg.ok) throw new Error('Could not save file (' + reg.status + ')');
    setItem(item.id, { status: 'done', progress: 100 });
    return false;
  }

  async function handleUpload() {
    if (!dept || !year || running) return;
    const targets = items.filter(i => i.status === 'queued' || i.status === 'error');
    if (!targets.length) return;
    setRunning(true); setResult(null);
    let ok = 0, fail = 0, dup = 0;

    for (const item of targets) {
      let done = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
        try { if (await uploadOne(item, dept, year as number, cls)) dup++; done = true; }
        catch (e: any) {
          if (attempt === MAX_ATTEMPTS) setItem(item.id, { status: 'error', error: e?.message ?? 'Failed' });
          else await sleep(attempt * 1500);
        }
      }
      if (done) ok++; else fail++;
    }

    if (ok - dup > 0) {
      fetch('/api/process-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ notifyOnly: true, count: ok - dup, label: `${DEPT_LABELS[dept]} Year ${year}` }),
      }).catch(() => {});
    }
    setResult({ ok, fail, dup });
    setRunning(false);
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

        <button onClick={() => router.push('/dashboard')}
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
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PDF, Word, PowerPoint, images, text. Choose as many as you like.</p>
        </div>

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
                      {it.status === 'done' && (it.dup ? 'Already on the platform' : 'Received')}
                      {it.status === 'error' && (it.error ?? 'Failed') + ', tap Retry'}
                    </p>
                  </div>
                  {it.status === 'done' && <span style={{ color: '#22c55e', fontSize: '1.1rem', fontWeight: 700 }}>✓</span>}
                  {!running && it.status !== 'done' && (
                    <button onClick={() => setItems(p => p.filter(x => x.id !== it.id))} aria-label="Remove"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1rem', cursor: 'pointer', padding: 4 }}>✕</button>
                  )}
                </div>
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
          </div>
        )}

        {(!dept || !year) && items.length > 0 && (
          <p style={{ fontSize: '0.74rem', color: '#eab308', marginBottom: 10 }}>Choose your department and year to continue.</p>
        )}

        <button onClick={handleUpload} disabled={!canUpload}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: '0.92rem',
            background: canUpload ? 'var(--gold)' : 'var(--border)', color: canUpload ? '#0a1020' : 'var(--text-muted)',
            cursor: canUpload ? 'pointer' : 'not-allowed',
          }}>
          {running
            ? `Uploading… ${doneCount}/${items.length}. Keep this page open`
            : failedCount > 0 && failedCount === pending ? `Retry ${failedCount} failed`
            : pending > 0 ? `Upload ${pending} file${pending !== 1 ? 's' : ''}` : 'Upload'}
        </button>
      </div>
      </div>
    </AppNav>
  );
}
