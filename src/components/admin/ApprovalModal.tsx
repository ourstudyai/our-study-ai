// src/components/admin/ApprovalModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Material } from '@/lib/firestore/materials';

type Course = { id: string; name: string; code?: string; department: string; year: number; semester: number };

interface Props {
  material: Material;
  courses: Course[];
  onClose: () => void;
  onDone: () => void;
}

export default function ApprovalModal({ material, courses, onClose, onDone }: Props) {

  const [ocrText, setOcrText] = useState(material.extractedText || '');
  const [selectedCourseId, setSelectedCourseId] = useState((material as any).suggestedCourseId || '');
  const [category, setCategory] = useState(material.category || 'other');
  const [displayName, setDisplayName] = useState(material.fileName || '');

  const [loading, setLoading] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [shouldIndex, setShouldIndex] = useState(true);
  const [freshUrl, setFreshUrl] = useState('');
  const [landscape, setLandscape] = useState(false);

  const previewRef = useRef<HTMLIFrameElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const syncingRef = useRef(false);

  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  // Load R2 fileUrl directly — Cloudinary removed
  useEffect(() => {
    const url = (material as any).fileUrl || '';
    if (url) { setFreshUrl(url); return; }
    fetch('/api/material-url?materialId=' + encodeURIComponent(material.id))
      .then(r => r.json()).then(d => { if (d.url) setFreshUrl(d.url); })
      .catch(() => {});
  }, [material]);

  const canApprove = selectedCourseId && ocrText.trim().length > 0;

  const filteredCourses = courses.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.code || '').toLowerCase().includes(search.toLowerCase())
  );

  function handleTextScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }

  const handleApprove = async () => {
    if (!canApprove) return;
    setLoading(true); setStatus('Saving and reindexing...');
    try {
      const course = courses.find(c => c.id === selectedCourseId);
      const res = await fetch('/api/admin/reindex-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: material.id,
          courseId: selectedCourseId,
          courseName: course?.name || '',
          category,
          extractedText: ocrText,
          indexDisplayName: displayName,
          department: course?.department || '',
          year: course?.year || null,
          semester: course?.semester || null,
          shouldIndex,
        }),
      });
      if (!res.ok) throw new Error('Reindex failed');
      setStatus(shouldIndex ? 'Approved and indexed.' : 'Approved (not indexed).');
      setTimeout(onDone, 800);
    } catch { setStatus('Error. Try again.'); }
    finally { setLoading(false); }
  };

  const handleQuarantine = async () => {
    setLoading(true); setStatus('Quarantining...');
    try {
      await fetch('/api/admin/reindex-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: material.id, quarantine: true }),
      });
    } catch {}
    const { updateDoc, doc } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase/config');
    await updateDoc(doc(db, 'materials', material.id), { status: 'quarantined' });
    setStatus('Quarantined.');
    setTimeout(onDone, 600);
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true); setStatus('Deleting...');
    try {
      await fetch('/api/admin/delete-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: material.id, publicId: (material as any).publicId || null }),
      });
      setStatus('Deleted.');
      setTimeout(onDone, 600);
    } catch { setStatus('Delete failed.'); }
    finally { setLoading(false); }
  };

  const inp: React.CSSProperties = {
    background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.8rem',
    width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--navy-card)' }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', flexShrink: 0 }}>✕</button>
        <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.fileName}</p>
        {freshUrl && (
          <a href={freshUrl} target="_blank" rel="noopener noreferrer"
            style={{ flexShrink: 0, background: 'rgba(196,160,80,0.1)', border: '1px solid rgba(196,160,80,0.2)', borderRadius: 7, padding: '5px 10px', color: 'var(--gold)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'none' }}>
            View Original ↗
          </a>
        )}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Side by side</span>
        <button onClick={() => setLandscape(l => !l)} style={{ flexShrink: 0, background: landscape ? 'rgba(196,160,80,0.2)' : 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', color: 'var(--gold)', fontSize: '0.72rem', cursor: 'pointer' }}>
          {landscape ? 'On' : 'Off'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: landscape ? 'row' : 'column', overflow: 'hidden', minHeight: 0 }}>

        {landscape && freshUrl && (
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, borderRight: '1px solid var(--border)', background: '#0a0a0f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', flex: 1 }}>Original Preview</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                R2 files cannot be embedded directly.
              </p>
              <a href={freshUrl} target="_blank" rel="noopener noreferrer"
                style={{ background: 'var(--gold)', color: 'var(--navy)', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>
                Open Original in New Tab ↗
              </a>
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '10px 12px', gap: 6 }}>
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Extracted Text (editable)</span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{ocrText.split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <textarea
              ref={textRef}
              onScroll={handleTextScroll}
              value={ocrText}
              onChange={e => setOcrText(e.target.value)}
              style={{ flex: 1, ...inp, resize: 'none', lineHeight: 1.7, fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          </div>

          <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: '320px' }}>
            <p style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7 }}>Bind to Course</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search course...' style={inp} />
            <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} style={{ ...inp, height: 80 }} size={4}>
              <option value=''>— Select course —</option>
              {filteredCourses.map(c => (
                <option key={c.id} value={c.id}>{c.name} · Y{c.year} S{c.semester} · {c.department}</option>
              ))}
            </select>
            {selectedCourse && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[selectedCourse.department, 'Year ' + selectedCourse.year, 'Sem ' + selectedCourse.semester].map(t => (
                  <span key={t} style={{ fontSize: '0.65rem', background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '2px 8px' }}>{t}</span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 4 }}>Category</p>
                <select value={category} onChange={e => setCategory(e.target.value as any)} style={inp}>
                  {['notes','textbook','past_questions','aoc','other'].map(c => (
                    <option key={c} value={c}>{c.replace('_',' ')}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 2 }}>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 4 }}>Display name</p>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inp} placeholder='Name shown to students' />
              </div>
            </div>
            {status && <p style={{ fontSize: '0.72rem', color: status.includes('Error') || status.includes('failed') ? '#ef4444' : 'var(--gold)', textAlign: 'center' }}>{status}</p>}
            <div style={{ display: 'flex', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={shouldIndex} onChange={e => setShouldIndex(e.target.checked)} />
                Add to Library & Chat index
              </label>
              <button onClick={handleApprove} disabled={!canApprove || loading} style={{
                flex: 2, padding: '10px', background: canApprove ? 'var(--gold)' : 'rgba(196,160,80,0.2)',
                color: canApprove ? 'var(--navy)' : 'var(--text-muted)', border: 'none',
                borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: canApprove ? 'pointer' : 'not-allowed',
              }}>
                {loading ? 'Working...' : '✓ Approve'}
              </button>
              <button onClick={handleQuarantine} disabled={loading} style={{
                flex: 1, padding: '10px', background: 'transparent',
                border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8,
                color: '#fde047', fontSize: '0.78rem', cursor: 'pointer',
              }}>⚠ Hold</button>
              {!delConfirm ? (
                <button onClick={() => setDelConfirm(true)} disabled={loading} style={{
                  flex: 1, padding: '10px', background: 'transparent',
                  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                  color: '#fca5a5', fontSize: '0.78rem', cursor: 'pointer',
                }}>🗑 Delete</button>
              ) : (
                <button onClick={handleDelete} disabled={loading} style={{
                  flex: 1, padding: '10px', background: '#ef4444',
                  border: 'none', borderRadius: 8,
                  color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                }}>Confirm</button>
              )}
            </div>
            {delConfirm && (
              <button onClick={() => setDelConfirm(false)} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'center' }}>Cancel delete</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
