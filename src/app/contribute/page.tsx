'use client';

import AppNav from '@/components/AppNav';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { saveReport } from '@/lib/firestore/materials';
import ShareReceiver from '@/components/contribute/ShareReceiver';

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
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number;
  progressLabel?: string;
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
  const [activeMode, setActiveMode] = useState<'careful' | 'detect'>('careful');

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

  const [detectFiles, setDetectFiles] = useState<File[]>([]);
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [shareHint, setShareHint] = useState(0);

  useEffect(() => {
    const handler = (e: any) => {
      setShareHint(e.detail.count);
      setActiveMode('detect');
    };
    window.addEventListener('share-target-hint', handler);
    return () => window.removeEventListener('share-target-hint', handler);
  }, []);

  const handleSharedFiles = (files: File[]) => {
    setSharedFiles(files);
    setActiveMode('detect'); // Auto-detect is best for shared files
    setDetectFiles(prev => {
      const ex = new Set(prev.map(f => f.name));
      return [...prev, ...files.filter(f => !ex.has(f.name))];
    });
  };
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

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const uploadToR2 = async (
    file: File,
    folder: string,
    onProgress: (pct: number, loaded: number, total: number) => void
  ): Promise<{ key: string; publicUrl: string; fileHash: string }> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const sigRes = await fetch('/api/cloudinary-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, folder, fileHash, mimeType: file.type }),
    });
    if (sigRes.status === 409) {
      const data = await sigRes.json();
      throw Object.assign(new Error('duplicate'), { duplicate: true, data });
    }
    if (!sigRes.ok) throw new Error('Failed to get upload URL');
    const { signedUrl, key, publicUrl } = await sigRes.json();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 204) resolve({ key, publicUrl, fileHash });
        else reject(new Error('R2 upload failed: ' + xhr.status));
      };
      xhr.onerror = () => reject(new Error('Network error uploading to R2'));
      xhr.send(file);
    });
  };

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
        const folder = courseId ? 'contributions/' + courseId : 'contributions/auto-detect';
        const { key, fileHash } = await uploadToR2(file, folder, (pct, loaded, total) => {
          setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'uploading', progress: pct, progressLabel: pct + '% - ' + formatBytes(loaded) + ' of ' + formatBytes(total) } }));
        });
        const res = await fetch('/api/process-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, fileHash, fileName: file.name, mimeType: file.type, uploadedBy: firebaseUser.uid, uploadedByRole: 'student', uploaderEmail, suggestedCourseName: courseName, suggestedCourseId: courseId, category: selectedCategory }),
        });
        if (!res.ok) throw new Error('Server registration failed');
        setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100 } }));
      } catch (err: any) {
        if (err?.duplicate) {
          setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 100, error: 'This file already exists in the system.' } }));
        } else {
          setCarefulStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 0, error: 'Upload failed. Check your connection and try again.' } }));
        }
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

  const handleDetectSubmit = async () => {
    if (detectFiles.length === 0 || !firebaseUser || detectUploading) return;
    setDetectUploading(true);
    const uploaderEmail = firebaseUser.email ?? 'unknown';
    const initial: Record<string, FileStatus> = {};
    detectFiles.forEach(f => { initial[f.name] = { status: 'uploading', progress: 0 }; });
    setDetectStatuses(initial);

    for (const file of detectFiles) {
      try {
        const { key, fileHash } = await uploadToR2(file, 'contributions/auto-detect', (pct, loaded, total) => {
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'uploading', progress: pct, progressLabel: pct + '% - ' + formatBytes(loaded) + ' of ' + formatBytes(total) } }));
        });
        const res = await fetch('/api/process-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, fileHash, fileName: file.name, mimeType: file.type, uploadedBy: firebaseUser.uid, uploadedByRole: 'student', uploaderEmail, suggestedCourseName: null, suggestedCourseId: null, category: 'other' }),
        });
        if (!res.ok) throw new Error('Server registration failed');
        const result = await res.json();
        setDetectStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100, result: { materialId: result.materialId, detectedStatus: result.status, category: result.category ?? 'other', suggestedCourseName: result.suggestedCourseName ?? null, detectedCourseName: result.detectedCourseName ?? null, confidence: result.confidence ?? 'low', wordCount: result.wordCount ?? 0 } } }));
      } catch (err: any) {
        if (err?.duplicate) {
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 100, error: 'This file already exists in the system.' } }));
        } else {
          setDetectStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 0, error: 'Upload failed. Check your connection and try again.' } }));
        }
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
      return { type: 'weak', message: 'Your file has been received and is in the review queue. An admin will place it in the right course shortly. Refresh the page anytime to upload more files!' };
    }
    return { type: 'strong', message: 'Got it. Detected as ' + (course ? '"' + course + '"' : 'an unknown course') + ' - ' + result.category.replace('_', ' ') + '. Confidence: ' + result.confidence + '. Admins will confirm before it goes live.' };
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
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '10px' }}>Contribute Materials</h1>
        <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '24px' }}>Sign in to get started.</p>
        <button onClick={handleGoogleSignIn} disabled={signingIn}
          style={{ width: '100%', padding: '12px 20px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: signingIn ? 0.6 : 1 }}>
          {signingIn ? 'Signing in...' : 'Continue with Google'}
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ marginTop: '14px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>Back to dashboard</button>
      </div>
    </div>
  );

  return (
    <AppNav>
      <ShareReceiver onFilesReceived={handleSharedFiles} />
      <div style={{ minHeight: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>Back to dashboard</button>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>Contribute Materials</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>Signed in as <span style={{ color: 'var(--gold)' }}>{firebaseUser?.email}</span></p>

          {(sharedFiles.length > 0 || shareHint > 0) && (
            <div style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>📎</span>
              <div>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c4b5fd', marginBottom: '4px' }}>
                  {sharedFiles.length > 0
                    ? `${sharedFiles.length} file${sharedFiles.length > 1 ? 's' : ''} received`
                    : `${shareHint} file${shareHint > 1 ? 's' : ''} shared — please re-select below`}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sharedFiles.map(f => f.name).join(', ')}</p>
                <p style={{ fontSize: '0.7rem', color: '#a78bfa', marginTop: '4px' }}>
                  {sharedFiles.length > 0
                    ? 'Switched to Auto-detect — scroll down to submit'
                    : 'Your browser could not pass the files directly. Tap the file picker below and re-select them.'}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
            <button onClick={() => setActiveMode('careful')}
              style={{ padding: '16px 14px', borderRadius: '14px', border: '2px solid ' + (activeMode === 'careful' ? 'var(--gold)' : 'var(--border)'), background: activeMode === 'careful' ? 'rgba(196,160,80,0.1)' : 'var(--navy-card)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🎯</div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: activeMode === 'careful' ? 'var(--gold)' : 'var(--text-primary)', marginBottom: '4px' }}>Upload by course</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>You pick the course. Fastest route to going live.</p>
            </button>
            <button onClick={() => setActiveMode('detect')}
              style={{ padding: '16px 14px', borderRadius: '14px', border: '2px solid ' + (activeMode === 'detect' ? '#a78bfa' : 'var(--border)'), background: activeMode === 'detect' ? 'rgba(167,139,250,0.08)' : 'var(--navy-card)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🔍</div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: activeMode === 'detect' ? '#c4b5fd' : 'var(--text-primary)', marginBottom: '4px' }}>Auto-detect</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>Drop files. AI sorts them. Admin confirms.</p>
            </button>
          </div>

          {activeMode === 'careful' && (
            <div style={{ background: 'var(--navy-card)', border: '2px solid rgba(196,160,80,0.25)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Department</label>
                <select value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              {department && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Year</label>
                    <select value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle}>
                      <option value="">Year</option>
                      {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Semester</label>
                    <select value={semester} onChange={e => setSemester(Number(e.target.value))} style={inputStyle}>
                      <option value="">Semester</option>
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
                        <option value="">Select course</option>
                        {filteredCourses.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                      </select>
                      <button onClick={() => { setCourseNotListed(true); setSelectedCourseId(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}>My course is not listed</button>
                    </>
                  ) : (
                    <>
                      <input type="text" value={manualCourseName} onChange={e => setManualCourseName(e.target.value)} placeholder="Type the full course name..." style={inputStyle} />
                      <button onClick={() => { setCourseNotListed(false); setManualCourseName(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}>Back to course list</button>
                    </>
                  )}
                </div>
              )}
              {(selectedCourseId || (courseNotListed && manualCourseName.trim())) && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {CATEGORIES.map(({ key, label, icon, description }) => (
                      <button key={key} onClick={() => setSelectedCategory(key)}
                        style={{ textAlign: 'left', padding: '12px', borderRadius: '10px', border: '1px solid ' + (selectedCategory === key ? 'var(--gold)' : 'var(--border)'), background: selectedCategory === key ? 'var(--gold)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', color: selectedCategory === key ? 'var(--navy)' : 'var(--text-primary)' }}>
                        <p style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{icon}</p>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700 }}>{label}</p>
                        <p style={{ fontSize: '0.65rem', opacity: 0.7 }}>{description}</p>
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '24px', borderRadius: '12px', cursor: 'pointer', border: '2px dashed rgba(196,160,80,0.4)', background: 'rgba(196,160,80,0.03)' }}>
                    <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
                      onChange={e => { if (!e.target.files) return; const inc = Array.from(e.target.files); setCarefulFiles(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...inc.filter(f => !ex.has(f.name))]; }); }} />
                    <span style={{ fontSize: '1.8rem' }}>📎</span>
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--gold)' }}>Click to add files</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PDF, DOCX, JPG, PNG</span>
                  </label>
                  {carefulFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {carefulFiles.map(file => {
                        const fs = carefulStatuses[file.name];
                        return (
                          <div key={file.name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                              <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                              {!fs || fs.status === 'idle' ? (
                                <button onClick={() => setCarefulFiles(p => p.filter(f => f.name !== file.name))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>x</button>
                              ) : fs.status === 'uploading' ? (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{fs.progress}%</span>
                              ) : fs.status === 'done' ? (
                                <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>Done</span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Failed</span>
                              )}
                            </div>
                            {fs?.status === 'error' && fs.error && (
                              <div style={{ padding: '8px 12px', marginTop: '4px', borderRadius: '8px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <p style={{ fontSize: '0.72rem', color: '#fca5a5', marginBottom: '4px' }}>{fs.error}</p>
                                <button onClick={() => handleReportCareful(file.name, fs.error!)} disabled={fs.reported} style={{ fontSize: '0.7rem', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer', color: fs.reported ? '#6b7280' : '#f87171', padding: 0 }}>
                                  {fs.reported ? 'Reported' : 'Report this issue'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button onClick={handleCarefulSubmit} disabled={!carefulCanSubmit}
                        style={{ width: '100%', padding: '13px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: carefulCanSubmit ? 'pointer' : 'not-allowed', opacity: carefulCanSubmit ? 1 : 0.5 }}>
                        {carefulUploading ? 'Uploading...' : carefulDone ? 'All files submitted' : 'Submit ' + carefulFiles.length + ' file' + (carefulFiles.length > 1 ? 's' : '')}
                      </button>
                      {carefulDone && <p style={{ fontSize: '0.75rem', textAlign: 'center', color: '#22c55e' }}>Your files are in. Admins will review shortly.</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeMode === 'detect' && (
            <div style={{ background: 'var(--navy-card)', border: '2px solid rgba(167,139,250,0.25)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#c4b5fd' }}>Auto-detect mode</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>Drop files and the AI will sort them. Admins confirm placement before anything goes live.</p>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '28px', borderRadius: '12px', cursor: 'pointer', border: '2px dashed rgba(167,139,250,0.35)', background: 'rgba(167,139,250,0.03)' }}>
                <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => { if (!e.target.files) return; const inc = Array.from(e.target.files); setDetectFiles(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...inc.filter(f => !ex.has(f.name))]; }); }} />
                <span style={{ fontSize: '1.8rem' }}>🔍</span>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#c4b5fd' }}>Click to add files</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PDF, DOCX, JPG, PNG</span>
              </label>
              {detectFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {detectFiles.map(file => {
                    const fs = detectStatuses[file.name];
                    const resultMsg = fs?.result ? getDetectResultMessage(fs.result) : null;
                    return (
                      <div key={file.name}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          {!fs || fs.status === 'idle' ? (
                            <button onClick={() => setDetectFiles(p => p.filter(f => f.name !== file.name))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>x</button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: fs.status === 'done' ? '#22c55e' : fs.status === 'error' ? '#ef4444' : '#a78bfa' }}>
                              {fs.status === 'uploading' ? (fs.progressLabel || fs.progress + '%') : fs.status === 'done' ? 'Done' : 'Failed'}
                            </span>
                          )}
                        </div>
                        {fs?.status === 'done' && resultMsg && (
                          <div style={{ padding: '9px 12px', marginTop: '4px', borderRadius: '9px', background: resultMsg.type === 'strong' ? 'rgba(34,197,94,0.07)' : 'rgba(234,179,8,0.07)', border: '1px solid ' + (resultMsg.type === 'strong' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)') }}>
                            <p style={{ fontSize: '0.72rem', color: resultMsg.type === 'strong' ? '#86efac' : '#fde68a', lineHeight: 1.6 }}>{resultMsg.message}</p>
                          </div>
                        )}
                        {fs?.status === 'error' && fs.error && (
                          <div style={{ padding: '9px 12px', marginTop: '4px', borderRadius: '9px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <p style={{ fontSize: '0.72rem', color: '#fca5a5', marginBottom: '6px' }}>{fs.error}</p>
                            <button onClick={() => handleReportDetect(file.name, fs.error!)} disabled={fs.reported} style={{ fontSize: '0.7rem', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer', color: fs.reported ? '#6b7280' : '#f87171', padding: 0 }}>
                              {fs.reported ? 'Reported' : 'Report this issue'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={handleDetectSubmit} disabled={detectUploading || detectFiles.every(f => detectStatuses[f.name]?.status === 'done')}
                    style={{ width: '100%', padding: '13px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: (detectUploading || detectFiles.every(f => detectStatuses[f.name]?.status === 'done')) ? 0.5 : 1 }}>
                    {detectUploading ? 'Analysing...' : detectFiles.every(f => detectStatuses[f.name]?.status === 'done') ? 'All processed' : 'Analyse ' + detectFiles.length + ' file' + (detectFiles.length > 1 ? 's' : '')}
                  </button>
                </div>
              )}
            </div>
          )}
          <p style={{ fontSize: '0.72rem', textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px', paddingBottom: '24px' }}>Submitted as {firebaseUser?.email}. All contributions are reviewed before going live.</p>
        </div>
      </div>
    </AppNav>
  );
}
