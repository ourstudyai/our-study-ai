// src/components/admin/ReviewQueue.tsx
'use client';

import { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Material } from '@/lib/firestore/materials';
import { CATEGORY_LABEL, normalizeCategory } from '@/lib/categories';
import { authFetch } from '@/lib/auth/authFetch';
import { acceptMaterial, acceptBlockReason, CourseLite } from '@/lib/reviewApprove';

const KIND_LABEL: Record<string, string> = {
  handout: 'Handout', student_notes: "Student's notes", past_questions: 'Past questions',
  aoc: 'Areas of concentration', syllabus: 'Syllabus', textbook: 'Textbook', other: 'Other',
};
const CONF_COLOR: Record<string, string> = { high: '#22c55e', medium: '#eab308', low: '#ef4444' };

type Props = {
  materials: Material[];
  courses: CourseLite[];
  onEdit: (m: Material) => void;
  onChanged: () => void;
};

const btn = (primary: boolean, disabled?: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
  border: primary ? 'none' : '1px solid var(--border)',
  background: primary ? 'var(--gold)' : 'transparent',
  color: primary ? 'var(--navy)' : 'var(--text-secondary)',
  opacity: disabled ? 0.5 : 1, minHeight: 36,
});

export default function ReviewQueue({ materials, courses, onEdit, onChanged }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [firstPage, setFirstPage] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [bulkMsg, setBulkMsg] = useState('');
  const [reading, setReading] = useState(false);

  function info(m: Material) {
    const a = m as any;
    const r = a.reading || null;
    const course = courses.find(c => c.id === a.suggestedCourseId) || null;
    const upYear = Number(a.uploadYear) || null;
    const yearFlag = !!(course && upYear && course.year !== upYear);
    const deptFlag = !!(course && a.uploadDepartment && course.department !== a.uploadDepartment);
    const block = acceptBlockReason(a, courses);
    const ready = !!(r && r.confidence === 'high' && course && !yearFlag && !deptFlag && !block);
    return { a, r, course, upYear, yearFlag, deptFlag, block, ready };
  }

  const ready = materials.filter(m => info(m).ready);
  const unread = materials.filter(m => !(m as any).reading && (m as any).readStatus !== 'queued');

  async function toggle(m: Material) {
    if (open === m.id) { setOpen(null); return; }
    setOpen(m.id);
    if (firstPage[m.id] === undefined) {
      try {
        const s = await getDoc(doc(db, 'materials', m.id, 'body', 'reading'));
        const t = String((s.data() as any)?.firstPage ?? '');
        setFirstPage(p => ({ ...p, [m.id]: t || 'No cleaned preview yet.' }));
      } catch {
        setFirstPage(p => ({ ...p, [m.id]: 'Could not load the preview.' }));
      }
    }
  }

  async function accept(m: Material) {
    setBusy(m.id);
    setErrs(e => ({ ...e, [m.id]: '' }));
    const out = await acceptMaterial(m as any, courses);
    if (!out.ok) setErrs(e => ({ ...e, [m.id]: out.error || 'Failed.' }));
    setBusy(null);
    if (out.ok) onChanged();
  }

  async function acceptAllConfident() {
    setBulk('running');
    let done = 0; let failed = 0;
    for (let i = 0; i < ready.length; i++) {
      setBulkMsg('Accepting ' + (i + 1) + ' of ' + ready.length + '…');
      const out = await acceptMaterial(ready[i] as any, courses);
      if (out.ok) done++; else { failed++; setErrs(e => ({ ...e, [ready[i].id]: out.error || 'Failed.' })); }
    }
    setBulkMsg(done + ' accepted' + (failed ? ', ' + failed + ' need attention' : '') + '.');
    setBulk('idle');
    onChanged();
  }

  async function readNow(ids: string[]) {
    if (ids.length === 0) return;
    setReading(true);
    try {
      await authFetch('/api/admin/read-now', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialIds: ids }),
      });
    } catch { /* the cards keep showing "not read yet" */ }
    setReading(false);
    onChanged();
  }

  async function switchCourse(m: Material, c: { id: string; name: string }) {
    try {
      await updateDoc(doc(db, 'materials', m.id), { suggestedCourseId: c.id, suggestedCourseName: c.name });
      onChanged();
    } catch {
      setErrs(e => ({ ...e, [m.id]: 'Could not change the course.' }));
    }
  }

  if (materials.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p style={{ fontSize: '2rem', marginBottom: 8 }}>✓</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>All clear. Nothing to review.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {materials.length} to review · {ready.length} ready to accept
        </span>
        {ready.length > 0 && bulk === 'idle' && (
          <button onClick={() => setBulk('confirm')} style={btn(true)}>Accept all confident ({ready.length})</button>
        )}
        {bulk === 'confirm' && (
          <>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Approve and index {ready.length} files?</span>
            <button onClick={acceptAllConfident} style={btn(true)}>Yes, accept</button>
            <button onClick={() => setBulk('idle')} style={btn(false)}>Cancel</button>
          </>
        )}
        {unread.length > 0 && bulk === 'idle' && (
          <button onClick={() => readNow(unread.map(m => m.id))} disabled={reading} style={btn(false, reading)}>
            {reading ? 'Sending…' : 'Read ' + unread.length + ' unread now'}
          </button>
        )}
      </div>
      {bulkMsg && <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{bulkMsg}</p>}

      {materials.map(m => {
        const { a, r, course, upYear, yearFlag, deptFlag, block, ready: isReady } = info(m);
        const kind = r ? (r.handwritten ? 'Handwritten notes' : (KIND_LABEL[r.kind] || 'Other')) : (CATEGORY_LABEL[normalizeCategory(a.category)] || '');
        const conf = r?.confidence || a.confidence || '';
        const isOpen = open === m.id;
        const alts: any[] = [];
        if (r?.course && (!course || r.course.id !== course.id)) alts.push(r.course);
        (r?.alsoFits || []).forEach((c: any) => { if (!course || c.id !== course.id) alts.push(c); });
        return (
          <div key={m.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {course ? ((course.code ? course.code + ' · ' : '') + course.name) : 'No course matched'}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(r?.title || a.fileName || '')}{course ? ' · Year ' + course.year + ' · Sem ' + course.semester : ''}
                </p>
              </div>
              {conf && <span style={{ fontSize: '0.64rem', fontWeight: 700, color: CONF_COLOR[conf] || 'var(--text-muted)', whiteSpace: 'nowrap' }}>● {conf}</span>}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {kind && <span style={{ fontSize: '0.64rem', background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', borderRadius: 99, padding: '2px 8px' }}>{kind}</span>}
              {!r && <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{a.readStatus === 'queued' ? 'AI is reading…' : a.readStatus === 'failed' ? 'AI could not read it' : 'Not read by AI yet'}</span>}
              {a.wordCount ? <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{Number(a.wordCount).toLocaleString()} words</span> : null}
            </div>

            {r?.summary && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6,
                display: isOpen ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {r.summary}
              </p>
            )}

            {(yearFlag || deptFlag) && course && (
              <p style={{ fontSize: '0.72rem', color: '#eab308', marginBottom: 6 }}>
                ⚠ Uploaded to {a.uploadDepartment ? a.uploadDepartment + ' ' : ''}Year {upYear || '?'}, but this fits {course.department} Year {course.year}.
              </p>
            )}

            {alts.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Also fits:</span>
                {alts.slice(0, 4).map((c: any) => (
                  <button key={c.id} onClick={() => switchCourse(m, c)} style={{
                    fontSize: '0.66rem', padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
                    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                  }}>
                    {(c.code || c.name)} · Y{c.year || '?'} S{c.semester || '?'}
                  </button>
                ))}
              </div>
            )}

            {errs[m.id] && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: 6 }}>{errs[m.id]}</p>}
            {!isReady && block && !errs[m.id] && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>{block}</p>}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => accept(m)} disabled={!!block || busy === m.id || bulk === 'running'} style={btn(true, !!block || busy === m.id || bulk === 'running')}>
                {busy === m.id ? 'Accepting…' : 'Accept'}
              </button>
              <button onClick={() => onEdit(m)} style={btn(false)}>Edit</button>
              {!r && a.readStatus !== 'queued' && (
                <button onClick={() => readNow([m.id])} disabled={reading} style={btn(false, reading)}>Read now</button>
              )}
              <button onClick={() => toggle(m)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer' }}>
                {isOpen ? 'Hide ▴' : 'Details ▾'}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {r?.keyPoints?.length > 0 && (
                  <ul style={{ margin: '0 0 10px 16px', padding: 0, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {r.keyPoints.map((k: string, i: number) => <li key={i}>{k}</li>)}
                  </ul>
                )}
                {r?.reason && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>Why: {r.reason}</p>}
                <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: 4 }}>Opening of the file (cleaned text, not the original)</p>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.55,
                  maxHeight: 260, overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 }}>
                  {firstPage[m.id] === undefined ? 'Loading…' : firstPage[m.id]}
                </div>
                <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  {a.fileName} · {a.uploaderEmail || 'unknown uploader'}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
