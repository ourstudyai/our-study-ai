'use client';

import AppNav from '@/components/AppNav';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { saveReport } from '@/lib/firestore/materials';

interface Course {
  id: string; name: string; code: string; department: string; year: number; semester: number;
}

type UploadCategory = 'lecture_notes' | 'past_questions' | 'aoc' | 'syllabus';

const CATEGORIES: { key: UploadCategory; label: string; icon: string; description: string }[] = [
  { key: 'lecture_notes', label: 'Lecture Notes', icon: '📖', description: 'Class notes, handouts, summaries' },
  { key: 'past_questions', label: 'Past Questions', icon: '📝', description: 'Past exam papers and questions' },
  { key: 'aoc', label: 'Areas of Concentration', icon: '🎯', description: 'Topics likely to appear in exams' },
  { key: 'syllabus', label: 'Syllabus', icon: '📋', description: 'Course outline or reading list' },
];

const DEPARTMENTS = ['philosophy', 'theology'];
const YEARS = [1, 2, 3, 4];
const SEMESTERS = [1, 2];

type FileStatus = {
  status: 'idle' | 'uploading' | 'extracting' | 'classifying' | 'done' | 'error';
  progress: number;
  error?: string;
  reported?: boolean;
  result?: {
    materialId: string;
    detectedStatus: string;
    category: string;
    suggestedCourseName: string | null;
    detectedCourseName: string | null;
    confidence: string;
    wordCount: number;
  };
};

export default function ContributePage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'auth' | 'form' | 'success'>('auth');
  const [signingIn, setSigningIn] = useState(false);

  // Mode toggle
  const [activeMode, setActiveMode] = useState<'careful' | 'detect'>('careful');

  // Careful upload state
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [semester, setSemester] = useState<number | ''>('');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseNotListed, setCourseNotListed] = useState(false);
  const [manualCourseName, setManualCourseName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<UploadCategory>('lecture_notes');
  const [carefulFiles, setCarefulFiles] = useState<File[]>([]);
  const [carefulUploading, setCarefulUploading] = useState(false);
  const [carefulStatuses, setCarefulStatuses] = useState<Record<string, FileStatus>>({});
  const [carefulDone, setCarefulDone] = useState(false);

  // Auto-detect state
  const [detectFiles, setDetectFiles] = useState<File[]>([]);
  const [detectStatuses, setDetectStatuses] = useState<Record<string, FileStatus>>({});
  const [detectUploading, setDetectUploading] = useState(false);

  useEffect(() => {
    if (!authLoading) setStep(firebaseUser ? 'form' : 'auth');
  }, [firebaseUser, authLoading]);

  useEffect(() => {
    const load = async () => {
      const q = query(collection(db, 'courses'), orderBy('department'));
      const snap = await getDocs(q);
      setAllCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    };
    load();
  }, []);

  useEffect(() => {
    if (!department || !year || !semester) { setFilteredCourses([]); return; }
    setFilteredCourses(allCourses.filter(c => c.department === department && c.year === Number(year) && c.semester === Number(semester)));
    setSelectedCourseId('');
    setCourseNotListed(false);
  }, [department, year, semester, allCourses]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { console.error('Sign in failed:', err); }
    finally { setSigningIn(false); }
  };

  // ── File size helper ─────────────────────────────────────────────────────
  const fileSizeMB = (file: File) => (file.size / (1024 * 1024)).toFixed(1);
  const isLargeFile = (file: File) => file.size > 5 * 1024 * 1024; // 5MB+

  // ── Careful upload ──────────────────────────────────────────────────────
  const carefulCanSubmit = department && year && semester &&
    (courseNotListed ? manualCourseName.trim().length > 0 : selectedCourseId) &&
    carefulFiles.length > 0 && !carefulUploading;

  const handleCarefulSubmit = async () => {
    if (!carefulCanSubmit || !firebaseUser) return;
    setCarefulUploading(true);
    setCarefulDone(false);
    const uploaderEmail = firebaseUser.email ?? 'unknown';
    const courseName = courseNotListed ? manualCourseName.trim() : allCourses.find(c => c.id === selectedCourseId)?.name ?? '';
    const courseId = courseNotListed ? null : selectedCourseId;
    const initial: Record<string, FileStatus> = {};
    carefulFiles.forEach(f => { initial[f.name] = { status: 'uploading', progress: 0 }; });
    setCarefulStatuses(initial);
    let anyFailed = false;

    for (const file of carefulFiles) {
      try {
        let fakeProgress = 0;
        const interval = setInterval(() => {
          fakeProgress = Math.min(fakeProgress + 8, 85);
          setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'uploading', progress: fakeProgress } }));
        }, 300);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploadedBy', firebaseUser.uid);
        formData.append('uploadedByRole', 'student');
        formData.append('uploaderEmail', uploaderEmail);
        formData.append('suggestedCourseName', courseName);
        if (courseId) formData.append('suggestedCourseId', courseId);
        formData.append('category', selectedCategory);
        const res = await fetch('/api/process-upload', { method: 'POST', body: formData });
        clearInterval(interval);
        if (res.status === 409) {
          setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 100, error: `This file already exists in the system and won't be uploaded again.` } }));
          anyFailed = true;
        } else {
          setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100 } }));
        }
      } catch {
        const sizeMB = fileSizeMB(file);
        const sizeNote = isLargeFile(file) ? ` This file is ${sizeMB}MB — files over 5MB must upload within 60 seconds. A fast, stable WiFi connection is required.` : ' Check your internet connection and try again.';
        setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 0, error: `Upload failed for ${file.name}.${sizeNote}` } }));
        anyFailed = true;
      }
    }
    setCarefulUploading(false);
    if (!anyFailed) setCarefulDone(true);
  };

  const handleReportCareful = async (fileName: string, errorMsg: string) => {
    if (!firebaseUser) return;
    try {
      await saveReport({ uploaderEmail: firebaseUser.email ?? 'unknown', uploadedBy: firebaseUser.uid, fileName, errorType: 'upload_failed', description: errorMsg });
      setCarefulStatuses(p => ({ ...p, [fileName]: { ...p[fileName], reported: true } }));
    } catch (err) { console.error(err); }
  };

  // ── Auto-detect upload ──────────────────────────────────────────────────
  const handleDetectSubmit = async () => {
    if (detectFiles.length === 0 || !firebaseUser || detectUploading) return;
    setDetectUploading(true);
    const uploaderEmail = firebaseUser.email ?? 'unknown';
    const initial: Record<string, FileStatus> = {};
    detectFiles.forEach(f => { initial[f.name] = { status: 'uploading', progress: 0 }; });
    setDetectStatuses(initial);

    for (const file of detectFiles) {
      try {
        let fakeProgress = 0;
        const interval = setInterval(() => {
          fakeProgress = Math.min(fakeProgress + 7, 80);
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'uploading', progress: fakeProgress } }));
        }, 350);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploadedBy', firebaseUser.uid);
        formData.append('uploadedByRole', 'student');
        formData.append('uploaderEmail', uploaderEmail);
        const res = await fetch('/api/process-upload', { method: 'POST', body: formData });
        clearInterval(interval);
        if (res.status === 409) {
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 100, error: `This file already exists in the system and won't be uploaded again.` } }));
        } else if (!res.ok) {
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100, result: { materialId: '', detectedStatus: 'processing', category: 'other', suggestedCourseName: null, detectedCourseName: null, confidence: 'low', wordCount: 0 } } }));
        } else {
          const result = await res.json();
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100, result: { materialId: result.materialId, detectedStatus: result.status, category: result.category, suggestedCourseName: result.suggestedCourseName, detectedCourseName: result.detectedCourseName, confidence: result.confidence, wordCount: result.wordCount } } }));
        }
      } catch {
        setDetectStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 0, error: `Something went wrong with ${file.name}. Please try again.` } }));
      }
    }
    setDetectUploading(false);
  };

  const handleReportDetect = async (fileName: string, errorMsg: string) => {
    if (!firebaseUser) return;
    try {
      await saveReport({ uploaderEmail: firebaseUser.email ?? 'unknown', uploadedBy: firebaseUser.uid, fileName, errorType: 'processing_failed', description: errorMsg });
      setDetectStatuses(p => ({ ...p, [fileName]: { ...p[fileName], reported: true } }));
    } catch (err) { console.error(err); }
  };

  const getDetectResultMessage = (result: FileStatus['result']) => {
    if (!result) return null;
    const course = result.suggestedCourseName ?? result.detectedCourseName;
    if (result.detectedStatus === 'quarantined' || result.confidence === 'low') {
      return { type: 'weak', message: `We received your file but couldn't place it confidently. An admin will sort it manually. For faster placement, try the course selector mode.` };
    }
    return { type: 'strong', message: `Got it. Detected as ${course ? `"${course}"` : 'an unknown course'} — ${result.category.replace('_', ' ')}. Confidence: ${result.confidence}. Admins will confirm before it goes live.` };
  };

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '0.84rem', boxSizing: 'border-box' as const };

  if (authLoading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <p style={{ color: 'var(--gold)' }}>Loading...</p>
    </div>
  );

  if (step === 'auth') return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--navy)' }}>
      <div style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}>
        <p style={{ fontSize: '3rem', marginBottom: '12px' }}>📚</p>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: '6px' }}>Lux Studiorum</p>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '10px' }}>Contribute Materials</h1>
        <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Every note, past question, and handout you share makes Lux Studiorum stronger. Sign in to get started.
        </p>
        <button onClick={handleGoogleSignIn} disabled={signingIn}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px 20px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: signingIn ? 0.6 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z" /></svg>
          {signingIn ? 'Signing in...' : 'Continue with Google'}
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ marginTop: '14px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>← Back to dashboard</button>
      </div>
    </div>
  );

  if (step === 'success') return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--navy)' }}>
      <div style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}>
        <p style={{ fontSize: '3.5rem', marginBottom: '14px' }}>🙏</p>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '10px' }}>Thank you.</h1>
        <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '6px' }}>Your files have been received. Our team will review and make them available soon.</p>
        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '24px' }}>Every past question, every handout helps. Keep them coming. 🔥</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => {
              setCarefulFiles([]); setCarefulStatuses({}); setCarefulDone(false);
              setSelectedCourseId(''); setCourseNotListed(false); setManualCourseName('');
              setDepartment(''); setYear(''); setSemester('');
              setDetectFiles([]); setDetectStatuses({});
              setActiveMode('careful');
              setStep('form');
            }}
            style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
            Upload more materials →
          </button>
          <button onClick={() => router.push('/dashboard')}
            style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <AppNav>
      <div style={{ minHeight: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>

          {/* Header */}
          <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Back to dashboard</button>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: '4px' }}>Lux Studiorum</p>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>Contribute Materials</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Signed in as <span style={{ color: 'var(--gold)' }}>{firebaseUser?.email}</span>
          </p>

          {/* ══════════════════════════════════════════════════════════
              MODE SWITCHER — the two modes clearly distinguished
          ══════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
            {/* Mode A */}
            <button onClick={() => setActiveMode('careful')}
              style={{
                padding: '16px 14px', borderRadius: '14px', border: `2px solid ${activeMode === 'careful' ? 'var(--gold)' : 'var(--border)'}`,
                background: activeMode === 'careful' ? 'rgba(196,160,80,0.1)' : 'var(--navy-card)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🎯</div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: activeMode === 'careful' ? 'var(--gold)' : 'var(--text-primary)', marginBottom: '4px' }}>Upload by course</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>You pick the course. Fastest route to going live.</p>
              {activeMode === 'careful' && (
                <p style={{ fontSize: '0.65rem', color: 'var(--gold)', marginTop: '6px', fontWeight: 700 }}>● Selected</p>
              )}
            </button>

            {/* Mode B */}
            <button onClick={() => setActiveMode('detect')}
              style={{
                padding: '16px 14px', borderRadius: '14px', border: `2px solid ${activeMode === 'detect' ? '#a78bfa' : 'var(--border)'}`,
                background: activeMode === 'detect' ? 'rgba(167,139,250,0.08)' : 'var(--navy-card)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🔍</div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: activeMode === 'detect' ? '#c4b5fd' : 'var(--text-primary)', marginBottom: '4px' }}>Auto-detect</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Drop files. AI sorts them. Admin confirms.</p>
              {activeMode === 'detect' && (
                <p style={{ fontSize: '0.65rem', color: '#a78bfa', marginTop: '6px', fontWeight: 700 }}>● Selected</p>
              )}
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════
              SECTION A — Upload by course (careful)
          ══════════════════════════════════════════════════════════ */}
          {activeMode === 'careful' && (
            <div style={{ background: 'var(--navy-card)', border: '2px solid rgba(196,160,80,0.25)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Section label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(196,160,80,0.15)', border: '1px solid rgba(196,160,80,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>🎯</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gold)' }}>Upload by course</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Select your course — fastest route to going live</p>
                </div>
              </div>

              {/* Department */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Department</label>
                <select value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle}>
                  <option value="">— Select department —</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>

              {department && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Year</label>
                    <select value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle}>
                      <option value="">— Year —</option>
                      {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Semester</label>
                    <select value={semester} onChange={e => setSemester(Number(e.target.value))} style={inputStyle}>
                      <option value="">— Semester —</option>
                      {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {department && year && semester && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Course</label>
                  {!courseNotListed ? (
                    <>
                      <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} style={inputStyle}>
                        <option value="">— Select course —</option>
                        {filteredCourses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                      </select>
                      <button onClick={() => { setCourseNotListed(true); setSelectedCourseId(''); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                        My course isn't listed →
                      </button>
                    </>
                  ) : (
                    <>
                      <input type="text" value={manualCourseName} onChange={e => setManualCourseName(e.target.value)}
                        placeholder="Type the full course name..." style={inputStyle} />
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>No problem — your material will be linked once the course is added.</p>
                      <button onClick={() => { setCourseNotListed(false); setManualCourseName(''); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                        ← Back to course list
                      </button>
                    </>
                  )}
                </div>
              )}

              {(selectedCourseId || (courseNotListed && manualCourseName.trim())) && (
                <>
                  {/* Category */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Category</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {CATEGORIES.map(({ key, label, icon, description }) => (
                        <button key={key} onClick={() => setSelectedCategory(key)}
                          style={{ textAlign: 'left', padding: '12px', borderRadius: '10px', border: `1px solid ${selectedCategory === key ? 'var(--gold)' : 'var(--border)'}`, background: selectedCategory === key ? 'var(--gold)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', color: selectedCategory === key ? 'var(--navy)' : 'var(--text-primary)', transition: 'all 0.12s' }}>
                          <p style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{icon}</p>
                          <p style={{ fontSize: '0.75rem', fontWeight: 700 }}>{label}</p>
                          <p style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '2px' }}>{description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File drop */}
                  <div>
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '24px', borderRadius: '12px', cursor: 'pointer', border: '2px dashed rgba(196,160,80,0.4)', background: 'rgba(196,160,80,0.03)' }}>
                      <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
                        onChange={e => { if (!e.target.files) return; const incoming = Array.from(e.target.files); setCarefulFiles(prev => { const existing = new Set(prev.map(f => f.name)); return [...prev, ...incoming.filter(f => !existing.has(f.name))]; }); }} />
                      <span style={{ fontSize: '1.8rem' }}>📎</span>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--gold)' }}>Click to add files</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PDF, DOCX, DOC, JPG, PNG · Multiple files supported</span>
                    </label>
                  </div>

                  {/* File list */}
                  {carefulFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {carefulFiles.map(file => {
                        const fs = carefulStatuses[file.name];
                        return (
                          <div key={file.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                              <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{file.name}</span>
                              {!fs || fs.status === 'idle' ? (
                                <button onClick={() => setCarefulFiles(p => p.filter(f => f.name !== file.name))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}>✕</button>
                              ) : fs.status === 'uploading' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                  <div style={{ width: '60px', height: '4px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: '99px', background: 'var(--gold)', width: `${fs.progress}%`, transition: 'width 0.3s' }} />
                                  </div>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{fs.progress}%</span>
                                </div>
                              ) : fs.status === 'extracting' ? (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>Extracting...</span>
                              ) : fs.status === 'classifying' ? (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>Classifying...</span>
                              ) : fs.status === 'done' ? (
                                <span style={{ fontSize: '0.75rem', color: '#22c55e', flexShrink: 0 }}>✓ Done</span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#ef4444', flexShrink: 0 }}>✗ Failed</span>
                              )}
                            </div>
                            {fs?.status === 'error' && fs.error && (
                              <div style={{ padding: '8px 12px', marginTop: '4px', borderRadius: '8px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <p style={{ fontSize: '0.72rem', color: '#fca5a5', marginBottom: '4px' }}>{fs.error}</p>
                                <button onClick={() => handleReportCareful(file.name, fs.error!)} disabled={fs.reported}
                                  style={{ fontSize: '0.7rem', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer', color: fs.reported ? '#6b7280' : '#f87171', padding: 0 }}>
                                  {fs.reported ? 'Reported ✓' : 'Report this issue →'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button onClick={handleCarefulSubmit} disabled={!carefulCanSubmit}
                        style={{ width: '100%', padding: '13px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: carefulCanSubmit ? 'pointer' : 'not-allowed', opacity: carefulCanSubmit ? 1 : 0.5, marginTop: '4px' }}>
                        {carefulUploading ? `Uploading ${carefulFiles.length} file${carefulFiles.length > 1 ? 's' : ''}...` : carefulDone ? '✓ All files submitted' : `Submit ${carefulFiles.length} file${carefulFiles.length > 1 ? 's' : ''} →`}
                      </button>

                      {carefulDone && (
                        <p style={{ fontSize: '0.75rem', textAlign: 'center', color: '#22c55e' }}>
                          Your files are in. Admins will review and make them live soon. Thank you.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              SECTION B — Auto-detect
          ══════════════════════════════════════════════════════════ */}
          {activeMode === 'detect' && (
            <div style={{ background: 'var(--navy-card)', border: '2px solid rgba(167,139,250,0.25)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Section label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>🔍</div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#c4b5fd' }}>Auto-detect mode</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Drop files — let the AI sort them</p>
                </div>
              </div>

              {/* Explanation */}
              <div style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Have files that don't fit neatly into a course right now? Drop them here. Our system will read them and do its best to sort them automatically. Admins will confirm placement before anything goes live.
                </p>
                <p style={{ fontSize: '0.72rem', color: '#a78bfa', marginTop: '8px', fontWeight: 600 }}>
                  💡 For fastest placement, use Upload by course instead.
                </p>
              </div>

              {/* File drop */}
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '28px', borderRadius: '12px', cursor: 'pointer', border: '2px dashed rgba(167,139,250,0.35)', background: 'rgba(167,139,250,0.03)' }}>
                <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => { if (!e.target.files) return; const incoming = Array.from(e.target.files); setDetectFiles(prev => { const existing = new Set(prev.map(f => f.name)); return [...prev, ...incoming.filter(f => !existing.has(f.name))]; }); }} />
                <span style={{ fontSize: '1.8rem' }}>🔍</span>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#c4b5fd' }}>Click to add files</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PDF, DOCX, DOC, JPG, PNG · Multiple files supported</span>
              </label>

              {/* File list */}
              {detectFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {detectFiles.map(file => {
                    const fs = detectStatuses[file.name];
                    const resultMsg = fs?.result ? getDetectResultMessage(fs.result) : null;
                    return (
                      <div key={file.name}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{file.name}</span>
                          {!fs || fs.status === 'idle' ? (
                            <button onClick={() => setDetectFiles(p => p.filter(f => f.name !== file.name))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', flexShrink: 0, color: fs.status === 'done' ? '#22c55e' : fs.status === 'error' ? '#ef4444' : '#a78bfa' }}>
                              {fs.status === 'uploading' ? `${fs.progress}%` : fs.status === 'done' ? 'Done ✓' : fs.status === 'error' ? 'Failed' : 'Processing...'}
                            </span>
                          )}
                        </div>
                        {fs?.status === 'uploading' && (
                          <div style={{ marginTop: '4px', height: '3px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#a78bfa', width: `${fs.progress}%`, transition: 'width 0.3s', borderRadius: '99px' }} />
                          </div>
                        )}
                        {fs?.status === 'done' && resultMsg && (
                          <div style={{ padding: '9px 12px', marginTop: '4px', borderRadius: '9px', background: resultMsg.type === 'strong' ? 'rgba(34,197,94,0.07)' : 'rgba(234,179,8,0.07)', border: `1px solid ${resultMsg.type === 'strong' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)'}` }}>
                            <p style={{ fontSize: '0.72rem', color: resultMsg.type === 'strong' ? '#86efac' : '#fde68a', lineHeight: 1.6 }}>{resultMsg.message}</p>
                          </div>
                        )}
                        {fs?.status === 'error' && fs.error && (
                          <div style={{ padding: '9px 12px', marginTop: '4px', borderRadius: '9px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <p style={{ fontSize: '0.72rem', color: '#fca5a5', marginBottom: '6px' }}>{fs.error}</p>
                            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px' }}>For faster placement, try Upload by course instead.</p>
                            <button onClick={() => handleReportDetect(file.name, fs.error!)} disabled={fs.reported}
                              style={{ fontSize: '0.7rem', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer', color: fs.reported ? '#6b7280' : '#f87171', padding: 0 }}>
                              {fs.reported ? 'Reported ✓' : 'Report this issue →'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button onClick={handleDetectSubmit}
                    disabled={detectUploading || detectFiles.every(f => detectStatuses[f.name]?.status === 'done')}
                    style={{ width: '100%', padding: '13px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: (detectUploading || detectFiles.every(f => detectStatuses[f.name]?.status === 'done')) ? 0.5 : 1, marginTop: '4px' }}>
                    {detectUploading ? `Analysing ${detectFiles.length} file${detectFiles.length > 1 ? 's' : ''}...` : detectFiles.every(f => detectStatuses[f.name]?.status === 'done') ? '✓ All processed' : `Analyse ${detectFiles.length} file${detectFiles.length > 1 ? 's' : ''} →`}
                  </button>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: '0.72rem', textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px', paddingBottom: '24px' }}>
            Submitted as {firebaseUser?.email}. All contributions are reviewed before going live.
          </p>
        </div>
      </div>
    </AppNav>
  );
}
