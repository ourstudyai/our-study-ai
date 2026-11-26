'use client';

import { useMemo, useState } from 'react';
import { writeBatch, doc } from 'firebase/firestore';
import { buildNames } from '@/lib/materialNaming';
import RenameTool from '@/components/admin/RenameTool';
import CourseShortNames from '@/components/admin/CourseShortNames';
import HashBackfillTool from '@/components/admin/HashBackfillTool';
import BackfillCourseFields from '@/components/admin/BackfillCourseFields';
import SmartSortPanel from '@/components/admin/SmartSortPanel';
import DuplicateHits from '@/components/admin/DuplicateHits';
import { db } from '@/lib/firebase/config';
import { Material } from '@/lib/firestore/materials';

type Course = { id: string; name: string; code?: string; department: string; year: number; semester: number; published?: boolean };

interface Props {
  uploads: Material[];
  courses: Course[];
  onRefresh: () => void;
  firebaseUser: any;
}

type Group = { key: string; dept: string; year: number; items: Material[] };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function formatBytes(b?: number) {
  if (!b) return '';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function dateOf(m: Material): string {
  const c: any = m.createdAt;
  const d = typeof c === 'string' ? new Date(c) : c?.toDate?.() ?? null;
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
}

// Every word typed must appear somewhere in the file's searchable text.
function matches(m: Material, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [m.fileName, m.uploaderEmail, m.suggestedCourseName, m.category, m.uploadDepartment, m.uploadYear ? 'year ' + m.uploadYear : '']
    .filter(Boolean).join(' ').toLowerCase().replace(/_/g, ' ');
  return words.every(w => hay.includes(w));
}

const selStyle: React.CSSProperties = {
  background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 8px', color: 'var(--text-primary)', fontSize: '0.75rem', minWidth: 0,
};

function GroupBlock({ group, courses, firebaseUser, forceOpen, onChanged }: {
  group: Group; courses: Course[]; firebaseUser: any; forceOpen: boolean; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dept, setDept] = useState(group.dept);
  const [year, setYear] = useState<number | ''>(group.year || '');
  const [sem, setSem] = useState<number | ''>('');
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);

  const isOpen = open || forceOpen;
  const depts = useMemo(() => Array.from(new Set(courses.map(c => String(c.department)))), [courses]);
  const options = useMemo(
    () => courses
      .filter(c => String(c.department) === dept && c.year === Number(year) && c.semester === Number(sem))
      .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name)),
    [courses, dept, year, sem]
  );

  // Actions only ever touch files that are visible in this group right now.
  const selIds = group.items.filter(m => sel.has(m.id)).map(m => m.id);
  const allSelected = group.items.length > 0 && selIds.length === group.items.length;
  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(p => {
    const n = new Set(p);
    group.items.forEach(m => (allSelected ? n.delete(m.id) : n.add(m.id)));
    return n;
  });

  // Accept-suggested only works when the suggested course is still live.
  const suggestedSel = group.items.filter(m =>
    sel.has(m.id) && m.suggestedCourseId && courses.some(c => c.id === m.suggestedCourseId)
  );

  async function approve() {
    const course = courses.find(c => c.id === courseId);
    if (!course || selIds.length === 0) return;
    setBusy(true);
    try {
      const names = await buildNames(course, group.items.filter(m => selIds.includes(m.id)));
      const now = new Date().toISOString();
      for (let i = 0; i < selIds.length; i += 400) {
        const batch = writeBatch(db);
        selIds.slice(i, i + 400).forEach(id =>
          batch.update(doc(db, 'materials', id), {
            status: 'sorted',
            confirmedCourseId: course.id,
            confirmedCourseName: course.name,
            department: course.department,
            year: course.year,
            semester: course.semester,
            ...(names.get(id) ? { indexDisplayName: names.get(id) } : {}),
            sortedBy: firebaseUser?.email ?? '',
            sortedAt: now,
            updatedAt: now,
          })
        );
        await batch.commit();
      }
      setSel(new Set());
      onChanged();
    } catch (e: any) {
      alert('Failed to sort: ' + (e?.message ?? e));
    } finally { setBusy(false); }
  }

  async function acceptSuggested() {
    if (suggestedSel.length === 0) return;
    setBusy(true);
    try {
      const names = new Map<string, string>();
      const cf = (cid: string) => { const c = courses.find(x => x.id === cid); return c ? { department: c.department, year: c.year, semester: c.semester } : {}; };
      const byCourse = new Map<string, Material[]>();
      suggestedSel.forEach(m => {
        const k = m.suggestedCourseId as string;
        byCourse.set(k, [...(byCourse.get(k) ?? []), m]);
      });
      for (const [cid, list] of Array.from(byCourse.entries())) {
        const c = courses.find(x => x.id === cid);
        if (c) (await buildNames(c, list)).forEach((v, k) => names.set(k, v));
      }
      const now = new Date().toISOString();
      for (let i = 0; i < suggestedSel.length; i += 400) {
        const batch = writeBatch(db);
        suggestedSel.slice(i, i + 400).forEach(m =>
          batch.update(doc(db, 'materials', m.id), {
            status: 'sorted',
            confirmedCourseId: m.suggestedCourseId,
            confirmedCourseName: m.suggestedCourseName ?? '',
            ...cf(String(m.suggestedCourseId)),
            ...(names.get(m.id) ? { indexDisplayName: names.get(m.id) } : {}),
            sortedBy: firebaseUser?.email ?? '',
            sortedAt: now,
            updatedAt: now,
          })
        );
        await batch.commit();
      }
      setSel(new Set());
      onChanged();
    } catch (e: any) {
      alert('Failed to sort: ' + (e?.message ?? e));
    } finally { setBusy(false); }
  }

  async function removeSelected() {
    if (selIds.length === 0) return;
    if (!window.confirm(`Delete ${selIds.length} file${selIds.length !== 1 ? 's' : ''} permanently?`)) return;
    setBusy(true);
    let failed = 0;
    try {
      for (const id of selIds) {
        const m = group.items.find(x => x.id === id);
        const res = await fetch('/api/admin/delete-material', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId: id, publicId: m?.publicId }),
        });
        if (!res.ok) failed++;
      }
      if (failed) alert(`${failed} file(s) could not be deleted.`);
      setSel(new Set());
      onChanged();
    } finally { setBusy(false); }
  }

  const label = group.dept
    ? `${cap(group.dept)} · Year ${group.year || '?'}`
    : 'Year not specified';

  return (
    <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: 'var(--gold)', color: '#0a1020', borderRadius: 99, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>{group.items.length}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{isOpen ? '▲' : '▼'}</span>
        </span>
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
          <SmartSortPanel items={group.items} dept={group.dept} year={group.year} courses={courses} firebaseUser={firebaseUser} onChanged={onChanged} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <select value={dept} onChange={e => { setDept(e.target.value); setCourseId(''); }} style={selStyle}>
              <option value="">Dept</option>
              {depts.map(d => <option key={d} value={d}>{cap(d)}</option>)}
            </select>
            <select value={year} onChange={e => { setYear(e.target.value ? Number(e.target.value) : ''); setCourseId(''); }} style={selStyle}>
              <option value="">Year</option>
              {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <select value={sem} onChange={e => { setSem(e.target.value ? Number(e.target.value) : ''); setCourseId(''); }} style={selStyle}>
              <option value="">Semester</option>
              {[1, 2].map(s => <option key={s} value={s}>Sem {s}</option>)}
            </select>
            <select value={courseId} onChange={e => setCourseId(e.target.value)} disabled={!sem} style={{ ...selStyle, flex: 1, minWidth: 140 }}>
              <option value="">{sem ? (options.length ? 'Course…' : 'No live courses') : 'Pick semester first'}</option>
              {options.map(c => <option key={c.id} value={c.id}>{c.code ? c.code + ' · ' : ''}{c.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all
            </label>
            <span style={{ flex: 1 }} />
            <button onClick={approve} disabled={busy || !courseId || selIds.length === 0}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '0.76rem',
                background: courseId && selIds.length ? 'var(--gold)' : 'var(--border)', color: courseId && selIds.length ? '#0a1020' : 'var(--text-muted)',
                cursor: courseId && selIds.length ? 'pointer' : 'not-allowed' }}>
              {busy ? 'Working…' : `Approve & sort (${selIds.length})`}
            </button>
            <button onClick={acceptSuggested} disabled={busy || suggestedSel.length === 0}
              style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(196,160,80,0.4)', background: 'transparent', color: 'var(--gold)', fontSize: '0.76rem', fontWeight: 600, cursor: suggestedSel.length ? 'pointer' : 'not-allowed', opacity: suggestedSel.length ? 1 : 0.4 }}>
              ✓ Accept suggested ({suggestedSel.length})
            </button>
            <button onClick={removeSelected} disabled={busy || selIds.length === 0}
              style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(239,68,68,0.35)', background: 'transparent', color: '#ef4444', fontSize: '0.76rem', fontWeight: 600, cursor: selIds.length ? 'pointer' : 'not-allowed', opacity: selIds.length ? 1 : 0.4 }}>
              🗑 Delete
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.items.map(m => {
              const suggestionLive = !m.suggestedCourseId || courses.some(c => c.id === m.suggestedCourseId);
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: sel.has(m.id) ? 'rgba(196,160,80,0.1)' : 'var(--navy)', border: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</p>
                    <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[formatBytes(m.fileSize), dateOf(m), m.uploaderEmail].filter(Boolean).join(' · ')}
                    </p>
                    {(m.suggestedCourseName || m.category) && (
                      <p style={{ fontSize: '0.66rem', color: suggestionLive ? 'var(--gold)' : '#eab308', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🏷 {[m.suggestedCourseName, m.category ? String(m.category).replace(/_/g, ' ') : ''].filter(Boolean).join(' · ')}
                        {!suggestionLive && ' · course not live'}
                      </p>
                    )}
                  </div>
                  <a href={m.fileUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize: '0.72rem', color: 'var(--gold)', textDecoration: 'none', padding: '4px 8px', border: '1px solid rgba(196,160,80,0.3)', borderRadius: 8, flexShrink: 0 }}>
                    Open
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UploadsPanel({ uploads, courses, onRefresh, firebaseUser }: Props) {
  const [q, setQ] = useState('');

  // Only courses that are currently live can be used for tagging.
  const live = useMemo(() => courses.filter(c => c.published !== false), [courses]);

  const filtered = useMemo(() => uploads.filter(m => matches(m, q)), [uploads, q]);

  const groups = useMemo(() => {
    const byId = new Map(live.map(c => [c.id, c]));
    const map = new Map<string, Group>();
    for (const m of filtered) {
      const sc = m.suggestedCourseId ? byId.get(m.suggestedCourseId) : undefined;
      const dept = String(m.uploadDepartment ?? sc?.department ?? '');
      const year = Number(m.uploadYear ?? sc?.year ?? 0) || 0;
      const key = `${dept}|${year}`;
      if (!map.has(key)) map.set(key, { key, dept, year, items: [] });
      map.get(key)!.items.push(m);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.dept !== !b.dept) return a.dept ? -1 : 1;
      return a.dept.localeCompare(b.dept) || a.year - b.year;
    });
  }, [filtered, live]);

  const searching = q.trim().length > 0;

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search file name, uploader, course, type…"
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 10 }} />
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
        {uploads.length === 0
          ? 'Nothing waiting. New uploads appear here, grouped by the year contributors chose.'
          : searching
            ? `${filtered.length} of ${uploads.length} files match.`
            : `${uploads.length} file${uploads.length !== 1 ? 's' : ''} waiting to be sorted. Open a year, tick files, pick semester and course, then Approve & sort. Sorted files move to the OCR Queue.`}
      </p>
      {groups.map(g => (
        <GroupBlock key={g.key} group={g} courses={live} firebaseUser={firebaseUser} forceOpen={searching} onChanged={onRefresh} />
      ))}
      <DuplicateHits courses={live} firebaseUser={firebaseUser} />
      <RenameTool firebaseUser={firebaseUser} />
      <CourseShortNames />
      <HashBackfillTool firebaseUser={firebaseUser} />
      <BackfillCourseFields firebaseUser={firebaseUser} />
    </div>
  );
}
