'use client';

import AppNav from '@/components/AppNav';
import { useEffect, useState, useRef } from 'react';
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

const CATEGORIES: { key: UploadCategory; label: string; latin: string }[] = [
  { key: 'lecture_notes',   label: 'Lecture Notes',          latin: 'Lectiones'   },
  { key: 'past_questions',  label: 'Past Questions',          latin: 'Quaestiones' },
  { key: 'aoc',             label: 'Areas of Concentration',  latin: 'Themata'     },
  { key: 'syllabus',        label: 'Syllabus',                latin: 'Cursus'      },
];

const CAT_COLORS: Record<UploadCategory, string> = {
  lecture_notes:  '#c4a050',
  past_questions: '#818cf8',
  aoc:            '#f472b6',
  syllabus:       '#2dd4bf',
};

const DEPARTMENTS = ['philosophy', 'theology'];
const DEPT_LABELS: Record<string, string> = { philosophy: 'Philosophy', theology: 'Theology' };
const YEARS = [1, 2, 3, 4];
const SEMESTERS = [1, 2];

// Accepted MIME types — mirrors manifest.json share_target + markdown
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.md,.markdown,.txt';

// ── Per-file assignment ──────────────────────────────────────────────────────
interface FileAssignment {
  department: string;
  year: number | '';
  semester: number | '';
  courseId: string;
  courseNotListed: boolean;
  manualCourseName: string;
  category: UploadCategory;
}

type FileStatus = {
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number;
  progressLabel?: string;
  error?: string;
  reported?: boolean;
};

function defaultAssignment(): FileAssignment {
  return {
    department: '', year: '', semester: '',
    courseId: '', courseNotListed: false,
    manualCourseName: '', category: 'lecture_notes',
  };
}

// ── Shared input styles (theme-aware via CSS vars) ────────────────────────────
const selStyle: React.CSSProperties = {
  width: '100%', background: 'var(--navy-soft)',
  border: '1px solid var(--border)', borderRadius: '10px',
  padding: '10px 12px', color: 'var(--text-primary)',
  fontSize: '0.83rem', boxSizing: 'border-box',
  outline: 'none', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none',
};
const inpStyle: React.CSSProperties = { ...selStyle, cursor: 'text' };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'Playfair Display, Georgia, serif',
      fontSize: '0.62rem', letterSpacing: '0.22em',
      textTransform: 'uppercase', color: 'var(--gold)',
      opacity: 0.55, margin: '0 0 6px',
    }}>{children}</p>
  );
}

function GoldDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, var(--border), transparent)' }} />
      <span style={{ color: 'var(--gold)', opacity: 0.2, fontSize: '0.55rem' }}>✦</span>
      <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, var(--border), transparent)' }} />
    </div>
  );
}

// ── Detect file type badge label ──────────────────────────────────────────────
function fileBadge(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase() ?? 'FILE';
  // Shorten long extensions for display
  const map: Record<string, string> = { MARKDOWN: 'MD', DOCX: 'DOC', PPTX: 'PPT', JPEG: 'JPG' };
  return map[ext] ?? ext;
}

// ── FileRow — collapsible card with inline per-file course assignment ─────────
function FileRow({
  file, assignment, allCourses, onChange, onRemove, status, onReport, uploading,
}: {
  file: File;
  assignment: FileAssignment;
  allCourses: Course[];
  onChange: (a: FileAssignment) => void;
  onRemove: () => void;
  status?: FileStatus;
  onReport: (msg: string) => void;
  uploading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const filtered = allCourses.filter(c =>
    c.department === assignment.department &&
    c.year === Number(assignment.year) &&
    c.semester === Number(assignment.semester)
  );

  const isAssigned = !!(assignment.department && assignment.year && assignment.semester &&
    (assignment.courseNotListed ? assignment.manualCourseName.trim().length > 0 : assignment.courseId));

  const isDone      = status?.status === 'done';
  const isError     = status?.status === 'error';
  const isUploading = status?.status === 'uploading';

  const borderColor = isDone
    ? 'rgba(34,197,94,0.25)'
    : isError
    ? 'rgba(239,68,68,0.2)'
    : isAssigned
    ? 'var(--border-hover)'
    : 'var(--border)';

  return (
    <div style={{
      background: 'var(--navy-card)', border: `1px solid ${borderColor}`,
      borderRadius: '14px', overflow: 'hidden', transition: 'border-color 0.2s',
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* ── Header row ── */}
      <div
        onClick={() => !isDone && !isUploading && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '13px 14px',
          cursor: (!isDone && !isUploading) ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Type badge */}
        <div style={{
          flexShrink: 0, width: '36px', height: '36px', borderRadius: '8px',
          background: isDone ? 'rgba(34,197,94,0.1)' : isError ? 'rgba(239,68,68,0.1)' : 'var(--gold-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${isDone ? 'rgba(34,197,94,0.2)' : isError ? 'rgba(239,68,68,0.15)' : 'var(--border)'}`,
        }}>
          {isDone
            ? <span style={{ color: '#22c55e', fontSize: '0.95rem' }}>✓</span>
            : isError
            ? <span style={{ color: '#ef4444', fontSize: '0.95rem' }}>✕</span>
            : <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--gold)', opacity: 0.8 }}>{fileBadge(file.name)}</span>
          }
        </div>

        {/* Name + sub-label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0,
          }}>{file.name}</p>
          <p style={{
            fontSize: '0.65rem', margin: '2px 0 0',
            color: isAssigned ? 'var(--gold)' : 'var(--text-muted)',
            opacity: isAssigned ? 0.75 : 0.6,
          }}>
            {isDone
              ? 'Submitted for review'
              : isUploading
              ? (status?.progressLabel ?? `${status?.progress ?? 0}%`)
              : isAssigned
              ? `${DEPT_LABELS[assignment.department]} · Yr ${assignment.year} · Sem ${assignment.semester}`
              : 'Tap to assign a course'}
          </p>
        </div>

        {/* Right controls */}
        {!isDone && !isUploading && (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '1.15rem', lineHeight: 1, padding: '4px', flexShrink: 0,
            }}
          >×</button>
        )}
        {isUploading && (
          <div style={{
            flexShrink: 0, width: '18px', height: '18px',
            border: '1.5px solid var(--gold)', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'lux-spin 0.8s linear infinite',
          }} />
        )}
      </div>

      {/* Progress bar */}
      {isUploading && (
        <div style={{ height: '2px', background: 'var(--navy-soft)', margin: '0 14px 10px' }}>
          <div style={{
            height: '100%', background: 'var(--gold)',
            width: `${status?.progress ?? 0}%`,
            borderRadius: '1px', transition: 'width 0.3s',
          }} />
        </div>
      )}

      {/* ── Expanded assignment panel ── */}
      {expanded && !isDone && !isUploading && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 14px 14px',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}>

          {/* Department */}
          <div>
            <SectionLabel>Department</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {DEPARTMENTS.map(d => (
                <button key={d} onClick={() => onChange({
                  ...assignment, department: d,
                  year: '', semester: '', courseId: '', courseNotListed: false, manualCourseName: '',
                })} style={{
                  padding: '9px 12px', borderRadius: '9px', cursor: 'pointer',
                  border: `1px solid ${assignment.department === d ? 'var(--border-strong)' : 'var(--border)'}`,
                  background: assignment.department === d ? 'var(--gold-dim)' : 'transparent',
                  color: assignment.department === d ? 'var(--gold)' : 'var(--text-secondary)',
                  fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                  fontFamily: 'Playfair Display, Georgia, serif',
                }}>{DEPT_LABELS[d]}</button>
              ))}
            </div>
          </div>

          {/* Year + Semester */}
          {assignment.department && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <SectionLabel>Year</SectionLabel>
                <select
                  value={assignment.year}
                  onChange={e => onChange({ ...assignment, year: Number(e.target.value), courseId: '', courseNotListed: false, manualCourseName: '' })}
                  style={selStyle}
                >
                  <option value="">Year</option>
                  {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
              <div>
                <SectionLabel>Semester</SectionLabel>
                <select
                  value={assignment.semester}
                  onChange={e => onChange({ ...assignment, semester: Number(e.target.value), courseId: '', courseNotListed: false, manualCourseName: '' })}
                  style={selStyle}
                >
                  <option value="">Semester</option>
                  {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Course */}
          {assignment.department && assignment.year && assignment.semester && (
            <div>
              <SectionLabel>Course</SectionLabel>
              {!assignment.courseNotListed ? (
                <>
                  <select
                    value={assignment.courseId}
                    onChange={e => onChange({ ...assignment, courseId: e.target.value })}
                    style={selStyle}
                  >
                    <option value="">Select course</option>
                    {filtered.map(c => (
                      <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>
                    ))}
                  </select>
                  {filtered.length === 0 && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      No courses found for this selection.
                    </p>
                  )}
                  <button
                    onClick={() => onChange({ ...assignment, courseNotListed: true, courseId: '' })}
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text-muted)',
                      fontSize: '0.68rem', cursor: 'pointer', padding: '4px 0 0',
                      display: 'block', fontStyle: 'italic',
                    }}
                  >My course is not listed →</button>
                </>
              ) : (
                <>
                  <input
                    type="text" value={assignment.manualCourseName}
                    onChange={e => onChange({ ...assignment, manualCourseName: e.target.value })}
                    placeholder="Full course name…"
                    style={inpStyle}
                  />
                  <button
                    onClick={() => onChange({ ...assignment, courseNotListed: false, manualCourseName: '' })}
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text-muted)',
                      fontSize: '0.68rem', cursor: 'pointer', padding: '4px 0 0',
                      display: 'block', fontStyle: 'italic',
                    }}
                  >← Back to list</button>
                </>
              )}
            </div>
          )}

          {/* Category — only shown once course is set */}
          {isAssigned && (
            <div>
              <SectionLabel>Material Type</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {CATEGORIES.map(({ key, label, latin }) => {
                  const active = assignment.category === key;
                  return (
                    <button key={key} onClick={() => onChange({ ...assignment, category: key })} style={{
                      textAlign: 'left', padding: '9px 11px', borderRadius: '9px', cursor: 'pointer',
                      border: `1px solid ${active ? CAT_COLORS[key] + '80' : 'var(--border)'}`,
                      background: active ? CAT_COLORS[key] + '18' : 'transparent',
                      transition: 'all 0.15s',
                    }}>
                      <p style={{ fontSize: '0.73rem', fontWeight: 700, color: active ? CAT_COLORS[key] : 'var(--text-primary)', margin: 0 }}>{label}</p>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', margin: '1px 0 0', fontStyle: 'italic', fontFamily: 'IM Fell English, Georgia, serif' }}>{latin}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Error panel ── */}
      {isError && status?.error && (
        <div style={{
          margin: '0 14px 14px', padding: '10px 12px', borderRadius: '9px',
          background: status.error === 'EXISTS_IN_SYSTEM' ? 'var(--gold-glow)' : 'rgba(239,68,68,0.07)',
          border: `1px solid ${status.error === 'EXISTS_IN_SYSTEM' ? 'var(--border)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          {status.error === 'EXISTS_IN_SYSTEM' ? (
            <>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px', fontFamily: 'Playfair Display, Georgia, serif' }}>
                Already in the library
              </p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                This file has already been contributed. An admin can share it to additional courses if needed.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.7rem', color: '#fca5a5', margin: '0 0 4px' }}>{status.error}</p>
              <button
                onClick={() => onReport(status.error!)}
                disabled={status.reported}
                style={{
                  fontSize: '0.68rem', fontWeight: 700, textDecoration: 'underline',
                  background: 'transparent', border: 'none',
                  cursor: status.reported ? 'default' : 'pointer',
                  color: status.reported ? 'var(--text-muted)' : '#f87171', padding: 0,
                }}
              >{status.reported ? 'Reported' : 'Report this issue'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════
export default function ContributePage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [assignments, setAssignments] = useState<Record<string, FileAssignment>>({});
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load courses
  useEffect(() => {
    const load = async () => {
      const q = query(collection(db, 'courses'), orderBy('department'));
      const snap = await getDocs(q);
      setAllCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    };
    load();
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { console.error('Sign in failed:', err); }
    finally { setSigningIn(false); }
  };

  // Add files — new files inherit last assignment as default
  const addFiles = (incoming: File[]) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      const fresh = incoming.filter(f => !existing.has(f.name));
      if (fresh.length === 0) return prev;
      setAssignments(a => {
        const next = { ...a };
        const lastKey = prev.length > 0 ? prev[prev.length - 1].name : null;
        const base: FileAssignment = lastKey ? { ...a[lastKey] } : defaultAssignment();
        fresh.forEach(f => { next[f.name] = { ...base }; });
        return next;
      });
      return [...prev, ...fresh];
    });
    setAllDone(false);
  };

  const removeFile = (name: string) => {
    setFiles(p => p.filter(f => f.name !== name));
    setAssignments(a => { const n = { ...a }; delete n[name]; return n; });
    setStatuses(s => { const n = { ...s }; delete n[name]; return n; });
  };

  const formatBytes = (b: number) =>
    b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  // R2 upload
  const uploadToR2 = async (
    file: File,
    folder: string,
    onProgress: (pct: number, loaded: number, total: number) => void
  ): Promise<{ key: string; publicUrl: string; fileHash: string }> => {
    const ab = await file.arrayBuffer();
    const hb = await crypto.subtle.digest('SHA-256', ab);
    const fileHash = Array.from(new Uint8Array(hb)).map(b => b.toString(16).padStart(2, '0')).join('');

    const sigRes = await fetch('/api/cloudinary-signature', {
      method: 'POST', credentials: 'include',
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
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100), e.loaded, e.total);
      };
      xhr.onload = () =>
        (xhr.status === 200 || xhr.status === 204)
          ? resolve({ key, publicUrl, fileHash })
          : reject(new Error('Upload failed: ' + xhr.status));
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(file);
    });
  };

  // Files that have a complete course assignment
  const readyFiles = files.filter(f => {
    const a = assignments[f.name];
    if (!a || !a.department || !a.year || !a.semester) return false;
    return a.courseNotListed ? a.manualCourseName.trim().length > 0 : !!a.courseId;
  });

  // Files still awaiting any upload attempt
  const pendingFiles = readyFiles.filter(
    f => !statuses[f.name] || statuses[f.name].status === 'idle' || statuses[f.name].status === 'error'
  );

  const canSubmit = pendingFiles.length > 0 && !uploading;

  const handleSubmit = async () => {
    if (!canSubmit || !firebaseUser) return;
    setUploading(true);
    setAllDone(false);

    const uploaderEmail = firebaseUser.email ?? 'unknown';
    const toUpload = pendingFiles;

    // Mark all as uploading
    setStatuses(prev => {
      const next = { ...prev };
      toUpload.forEach(f => { next[f.name] = { status: 'uploading', progress: 0 }; });
      return next;
    });

    let anyFailed = false;

    for (const file of toUpload) {
      const a = assignments[file.name];
      const courseId = a.courseNotListed ? null : a.courseId;
      const courseName = a.courseNotListed
        ? a.manualCourseName.trim()
        : allCourses.find(c => c.id === a.courseId)?.name ?? '';

      try {
        const folder = courseId ? `contributions/${courseId}` : 'contributions/unassigned';
        const { key, fileHash } = await uploadToR2(file, folder, (pct, loaded, total) => {
          setStatuses(p => ({
            ...p,
            [file.name]: {
              status: 'uploading', progress: pct,
              progressLabel: `${pct}% · ${formatBytes(loaded)} of ${formatBytes(total)}`,
            },
          }));
        });

        const res = await fetch('/api/process-upload', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key, fileHash,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            uploadedBy: firebaseUser.uid,
            uploadedByRole: 'student',
            uploaderEmail,
            suggestedCourseName: courseName,
            suggestedCourseId: courseId,
            category: a.category,
          }),
        });

        if (!res.ok) throw new Error('Server registration failed');
        setStatuses(p => ({ ...p, [file.name]: { status: 'done', progress: 100 } }));
      } catch (err: any) {
        if (err?.duplicate) {
          setStatuses(p => ({
            ...p,
            [file.name]: {
              status: 'error', progress: 100,
              error: err?.data?.duplicateType === 'name' ? 'EXISTS_IN_SYSTEM' : 'This file already exists in the system.',
            },
          }));
        } else {
          setStatuses(p => ({
            ...p,
            [file.name]: { status: 'error', progress: 0, error: 'Upload failed. Check your connection and try again.' },
          }));
        }
        anyFailed = true;
      }
    }

    setUploading(false);
    if (!anyFailed) setAllDone(true);
  };

  const handleReport = async (fileName: string, errorMsg: string) => {
    if (!firebaseUser) return;
    try {
      await saveReport({
        uploaderEmail: firebaseUser.email ?? 'unknown',
        uploadedBy: firebaseUser.uid,
        fileName, errorType: 'upload_failed', description: errorMsg,
      });
      setStatuses(p => ({ ...p, [fileName]: { ...p[fileName], reported: true } }));
    } catch {}
  };

  const doneCount = Object.values(statuses).filter(s => s.status === 'done').length;
  const unassignedCount = files.filter(f => {
    const s = statuses[f.name];
    if (s && (s.status === 'done' || s.status === 'uploading')) return false;
    const a = assignments[f.name];
    if (!a || !a.department || !a.year || !a.semester) return true;
    return a.courseNotListed ? !a.manualCourseName.trim() : !a.courseId;
  }).length;

  // ── Auth loading ─────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--navy)',
    }}>
      <img
        src="https://i.imgur.com/MPk1vBA.png" alt=""
        style={{ width: '44px', height: '44px', objectFit: 'contain', opacity: 0.5, animation: 'lux-breathe 2s ease-in-out infinite' }}
      />
      <style>{`@keyframes lux-breathe{0%,100%{opacity:0.3}50%{opacity:0.8}}`}</style>
    </div>
  );

  // ── Unauthenticated ──────────────────────────────────────────────────────────
  if (!firebaseUser) return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', background: 'var(--body-bg)', backgroundImage: 'var(--body-bg-image)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 65%)',
        animation: 'lux-ambient 5s ease-in-out infinite', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '360px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="https://i.imgur.com/MPk1vBA.png" alt="Lux Studiorum"
            style={{
              width: '64px', height: '64px', objectFit: 'contain', marginBottom: '16px',
              filter: 'drop-shadow(0 0 16px var(--gold-glow))',
              animation: 'lux-glow 3s ease-in-out infinite',
            }}
          />
          <h1 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: '1.7rem', fontWeight: 700, color: 'var(--gold)',
            letterSpacing: '0.08em', margin: '0 0 8px',
          }}>Contribute</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ width: '28px', height: '1px', background: 'var(--gold)', opacity: 0.3 }} />
            <span style={{
              fontFamily: 'IM Fell English, Georgia, serif', fontStyle: 'italic',
              fontSize: '0.68rem', letterSpacing: '0.12em', color: 'var(--gold)', opacity: 0.45,
            }}>pro communitate</span>
            <div style={{ width: '28px', height: '1px', background: 'var(--gold)', opacity: 0.3 }} />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Sign in to donate materials to the library.
          </p>
        </div>

        {/* Sign-in card */}
        <div style={{
          background: 'var(--navy-card)', border: '1px solid var(--border)',
          borderRadius: '18px', padding: '24px', boxShadow: 'var(--shadow-card)',
        }}>
          <button
            onClick={handleGoogleSignIn} disabled={signingIn}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '12px', padding: '14px 20px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: '12px', cursor: signingIn ? 'not-allowed' : 'pointer',
              opacity: signingIn ? 0.7 : 1, transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => { if (!signingIn) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
          >
            {signingIn ? (
              <>
                <div style={{ width: '18px', height: '18px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lux-spin 0.8s linear infinite' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Signing in…</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>Continue with Google</span>
              </>
            )}
          </button>

          <button
            onClick={() => router.push('/dashboard')}
            style={{
              width: '100%', marginTop: '12px', background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '8px',
            }}
          >← Back to dashboard</button>
        </div>
      </div>

      <style>{`
        @keyframes lux-spin    { to { transform: rotate(360deg); } }
        @keyframes lux-ambient { 0%,100%{opacity:0.6;transform:translate(-50%,-50%) scale(1)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.1)} }
        @keyframes lux-glow    { 0%,100%{filter:drop-shadow(0 0 8px var(--gold-glow))} 50%{filter:drop-shadow(0 0 20px var(--gold-dim))} }
      `}</style>
    </div>
  );

  // ── Authenticated view ───────────────────────────────────────────────────────
  return (
    <AppNav>
      {/* ShareReceiver: handles Android PWA share target + launchQueue */}
      <ShareReceiver onFilesReceived={addFiles} />

      <div style={{
        minHeight: '100dvh',
        background: 'var(--body-bg)', backgroundImage: 'var(--body-bg-image)',
        color: 'var(--text-primary)', padding: '24px 16px 80px',
      }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          {/* Back */}
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              fontSize: '0.75rem', cursor: 'pointer', marginBottom: '24px',
              padding: 0, display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >← Dashboard</button>

          {/* Page header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '1px', background: 'linear-gradient(to right, transparent, var(--gold))', opacity: 0.4 }} />
              <span style={{
                fontFamily: 'IM Fell English, Georgia, serif', fontStyle: 'italic',
                fontSize: '0.65rem', letterSpacing: '0.14em', color: 'var(--gold)', opacity: 0.5,
              }}>pro communitate</span>
            </div>
            <h1 style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: '2rem', fontWeight: 700, color: 'var(--gold)',
              margin: '0 0 6px', letterSpacing: '-0.01em',
            }}>Contribute Materials</h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
              Signed in as <span style={{ color: 'var(--gold)', opacity: 0.8 }}>{firebaseUser.email}</span>.
              {' '}All contributions are reviewed by admins before going live.
            </p>
          </div>

          <GoldDivider />

          {/* ── File picker / drop zone ── */}
          <div style={{ margin: '20px 0' }}>
            <input
              ref={fileInputRef}
              type="file" multiple accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={e => {
                if (!e.target.files) return;
                addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '8px', padding: '28px 20px',
                borderRadius: '16px', cursor: 'pointer',
                border: '2px dashed var(--border-hover)',
                background: 'var(--gold-glow)', outline: 'none', transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--gold-dim)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--gold-glow)';
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'var(--gold-dim)', border: '1px solid var(--border-hover)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <span style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: '0.95rem', fontWeight: 700, color: 'var(--gold)',
              }}>
                {files.length === 0 ? 'Select files to contribute' : 'Add more files'}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                PDF · DOCX · PPT · MD · JPG · PNG · multiple allowed
              </span>
            </button>
          </div>

          {/* ── File list ── */}
          {files.length > 0 && (
            <>
              {/* List meta bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <p style={{
                  fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  fontFamily: 'Playfair Display, Georgia, serif',
                }}>
                  {files.length} file{files.length !== 1 ? 's' : ''}
                  {doneCount > 0 ? ` · ${doneCount} submitted` : ''}
                </p>
                {pendingFiles.length > 0 && !uploading && (
                  <span style={{
                    fontSize: '0.65rem', color: 'var(--gold)', opacity: 0.65,
                    fontStyle: 'italic', fontFamily: 'IM Fell English, Georgia, serif',
                  }}>
                    {pendingFiles.length} ready to submit
                  </span>
                )}
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {files.map(file => (
                  <FileRow
                    key={file.name}
                    file={file}
                    assignment={assignments[file.name] ?? defaultAssignment()}
                    allCourses={allCourses}
                    onChange={a => setAssignments(prev => ({ ...prev, [file.name]: a }))}
                    onRemove={() => removeFile(file.name)}
                    status={statuses[file.name]}
                    onReport={msg => handleReport(file.name, msg)}
                    uploading={uploading}
                  />
                ))}
              </div>

              {/* Submit block */}
              <div style={{ marginTop: '20px' }}>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  style={{
                    width: '100%', padding: '15px 24px',
                    background: canSubmit
                      ? 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold) 100%)'
                      : 'var(--navy-soft)',
                    color: canSubmit ? 'var(--ink)' : 'var(--text-muted)',
                    border: `1px solid ${canSubmit ? 'rgba(255,255,255,0.12)' : 'var(--border)'}`,
                    borderRadius: '12px', fontWeight: 700,
                    fontFamily: 'Playfair Display, Georgia, serif',
                    fontSize: '0.92rem', letterSpacing: '0.02em',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    boxShadow: canSubmit ? '0 4px 20px rgba(201,150,58,0.3)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {uploading
                    ? 'Uploading…'
                    : allDone
                    ? '✓ All files submitted'
                    : pendingFiles.length === 0
                    ? 'Assign courses to files above'
                    : `Submit ${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''}`}
                </button>

                {/* Helper text */}
                {allDone && (
                  <p style={{
                    textAlign: 'center', fontSize: '0.72rem', color: 'var(--green)',
                    marginTop: '10px', fontStyle: 'italic',
                    fontFamily: 'IM Fell English, Georgia, serif',
                  }}>
                    Gratias tibi — your contributions are with the admins.
                  </p>
                )}
                {!uploading && !allDone && unassignedCount > 0 && (
                  <p style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    {unassignedCount} file{unassignedCount !== 1 ? 's' : ''} still need{unassignedCount === 1 ? 's' : ''} a course assigned
                  </p>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <p style={{
            textAlign: 'center', fontSize: '0.62rem', color: 'var(--text-muted)',
            marginTop: '56px', opacity: 0.4, letterSpacing: '0.06em',
            fontFamily: 'Playfair Display, Georgia, serif',
          }}>
            Lux Studiorum · Bigard Memorial Seminary
          </p>
        </div>
      </div>

      <style>{`
        @keyframes lux-spin { to { transform: rotate(360deg); } }
      `}</style>
    </AppNav>
  );
}
