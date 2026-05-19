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
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number;
  progressLabel?: string;
  error?: string;
  reported?: boolean;
};

export default function ContributePage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  const [department, setDepartment] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [semester, setSemester] = useState<number | ''>('');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseNotListed, setCourseNotListed] = useState(false);
  const [manualCourseName, setManualCourseName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<UploadCategory>('lecture_notes');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [done, setDone] = useState(false);

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
    setFilteredCourses(allCourses.filter(c =>
      c.department === department && c.year === Number(year) && c.semester === Number(semester)
    ));
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
      credentials: 'include',
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

  const canSubmit = department && year && semester &&
    (courseNotListed ? manualCourseName.trim().length > 0 : selectedCourseId) &&
    files.length > 0 && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit || !firebaseUser) return;
    setUploading(true);
    setDone(false);
    const uploaderEmail = firebaseUser.email ?? 'unknown';
    const courseName = courseNotListed ? manualCourseName.trim() : allCourses.find(c => c.id === selectedCourseId)?.name ?? '';
    const courseId = courseNotListed ? null : selectedCourseId;
    const initial: Record<string, FileStatus> = {};
    files.forEach(f => { initial[f.name] = { status: 'uploading', progress: 0 }; });
    setStatuses(initial);
    let anyFailed = false;

    for (const file of files) {
      try {
        const folder = courseId ? 'contributions/' + courseId : 'contributions/unassigned';
        const { key, fileHash } = await uploadToR2(file, folder, (pct, loaded, total) => {
          setStatuses(p => ({ ...p, [file.name]: { status: 'uploading', progress: pct, progressLabel: pct + '% · ' + formatBytes(loaded) + ' of ' + formatBytes(total) } }));
        });
        const res = await fetch('/api/process-upload', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, fileHash, fileName: file.name, mimeType: file.type, uploadedBy: firebaseUser.uid, uploadedByRole: 'student', uploaderEmail, suggestedCourseName: courseName, suggestedCourseId: courseId, category: selectedCategory }),
        });
        if (!res.ok) throw new Error('Server registration failed');
        setStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100 } }));
      } catch (err: any) {
        if (err?.duplicate) {
          setStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 100, error: err?.data?.duplicateType === 'name' ? 'EXISTS_IN_SYSTEM' : 'This file already exists in the system.' } }));
        } else {
          setStatuses(p => ({ ...p, [file.name]: { status: 'error', progress: 0, error: 'Upload failed. Check your connection and try again.' } }));
        }
        anyFailed = true;
      }
    }
    setUploading(false);
    if (!anyFailed) setDone(true);
  };

  const handleReport = async (fileName: string, errorMsg: string) => {
    if (!firebaseUser) return;
    try {
      await saveReport({ uploaderEmail: firebaseUser.email ?? 'unknown', uploadedBy: firebaseUser.uid, fileName, errorType: 'upload_failed', description: errorMsg });
      setStatuses(p => ({ ...p, [fileName]: { ...p[fileName], reported: true } }));
    } catch (err) { console.error(err); }
  };

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '9px', padding: '9px 12px', color: 'var(--text-primary)', fontSize: '0.84rem', boxSizing: 'border-box' as const };

  if (authLoading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <p style={{ color: 'var(--gold)' }}>Loading...</p>
    </div>
  );

  if (!firebaseUser) return (
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
      <div style={{ minHeight: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', padding: '28px 16px 48px' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '20px', padding: 0 }}>← Back to dashboard</button>

          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.8rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '6px' }}>Contribute Materials</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
            Signed in as <span style={{ color: 'var(--gold)' }}>{firebaseUser.email}</span>. All contributions are reviewed before going live.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Department */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Department</label>
              <select value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle}>
                <option value="">Select department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>

            {/* Year + Semester */}
            {department && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Year</label>
                  <select value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle}>
                    <option value="">Year</option>
                    {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Semester</label>
                  <select value={semester} onChange={e => setSemester(Number(e.target.value))} style={inputStyle}>
                    <option value="">Semester</option>
                    {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Course */}
            {department && year && semester && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course</label>
                {!courseNotListed ? (
                  <>
                    <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} style={inputStyle}>
                      <option value="">Select course</option>
                      {filteredCourses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                    </select>
                    <button onClick={() => { setCourseNotListed(true); setSelectedCourseId(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', padding: 0, marginTop: '2px' }}>My course is not listed</button>
                  </>
                ) : (
                  <>
                    <input type="text" value={manualCourseName} onChange={e => setManualCourseName(e.target.value)} placeholder="Type the full course name..." style={inputStyle} />
                    <button onClick={() => { setCourseNotListed(false); setManualCourseName(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left', padding: 0, marginTop: '2px' }}>Back to course list</button>
                  </>
                )}
              </div>
            )}

            {/* Category + Files — only show once course is set */}
            {(selectedCourseId || (courseNotListed && manualCourseName.trim())) && (
              <>
                {/* Category */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Material Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {CATEGORIES.map(({ key, label, icon, description }) => (
                      <button key={key} onClick={() => setSelectedCategory(key)}
                        style={{ textAlign: 'left', padding: '12px', borderRadius: '10px', border: '1px solid ' + (selectedCategory === key ? 'var(--gold)' : 'var(--border)'), background: selectedCategory === key ? 'var(--gold)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', color: selectedCategory === key ? 'var(--navy)' : 'var(--text-primary)', transition: 'all 0.15s' }}>
                        <p style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{icon}</p>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700 }}>{label}</p>
                        <p style={{ fontSize: '0.65rem', opacity: 0.7 }}>{description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* File picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Files</label>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '28px 20px', borderRadius: '14px', cursor: 'pointer', border: '2px dashed rgba(196,160,80,0.4)', background: 'rgba(196,160,80,0.03)', transition: 'background 0.15s' }}>
                    <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }}
                      onChange={e => { if (!e.target.files) return; const inc = Array.from(e.target.files); setFiles(prev => { const ex = new Set(prev.map(f => f.name)); return [...prev, ...inc.filter(f => !ex.has(f.name))]; }); }} />
                    <span style={{ fontSize: '2rem' }}>📎</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--gold)' }}>Tap to select files</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PDF, DOCX, JPG, PNG · multiple allowed</span>
                  </label>
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {files.map(file => {
                      const fs = statuses[file.name];
                      return (
                        <div key={file.name}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                            {!fs || fs.status === 'idle' ? (
                              <button onClick={() => setFiles(p => p.filter(f => f.name !== file.name))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                            ) : fs.status === 'uploading' ? (
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fs.progressLabel || fs.progress + '%'}</span>
                            ) : fs.status === 'done' ? (
                              <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>✓ Done</span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Failed</span>
                            )}
                          </div>
                          {fs?.status === 'error' && fs.error && (
                            fs.error === 'EXISTS_IN_SYSTEM' ? (
                              <div style={{ padding: '12px 14px', marginTop: '4px', borderRadius: '10px', background: 'rgba(196,160,80,0.07)', border: '1px solid rgba(196,160,80,0.25)' }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '6px' }}>This material is already in the system.</p>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '8px' }}>Thank you for contributing — it looks like this file has already been added. If it's needed for a different course, an admin can share it from among the approved materials.</p>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Please refresh the page if you have something else to upload.</p>
                              </div>
                            ) : (
                              <div style={{ padding: '9px 12px', marginTop: '4px', borderRadius: '9px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <p style={{ fontSize: '0.72rem', color: '#fca5a5', marginBottom: '4px' }}>{fs.error}</p>
                                <button onClick={() => handleReport(file.name, fs.error!)} disabled={fs.reported} style={{ fontSize: '0.7rem', fontWeight: 700, textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer', color: fs.reported ? '#6b7280' : '#f87171', padding: 0 }}>
                                  {fs.reported ? 'Reported' : 'Report this issue'}
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}

                    <button onClick={handleSubmit} disabled={!canSubmit}
                      style={{ width: '100%', padding: '14px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5, marginTop: '4px' }}>
                      {uploading ? 'Uploading...' : done ? 'All files submitted ✓' : `Submit ${files.length} file${files.length > 1 ? 's' : ''}`}
                    </button>
                    {done && <p style={{ fontSize: '0.75rem', textAlign: 'center', color: '#22c55e' }}>Your files are in. Admins will review shortly.</p>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppNav>
  );
}
