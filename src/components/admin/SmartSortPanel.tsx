'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { buildNames } from '@/lib/materialNaming';
import { CATEGORY_OPTIONS, normalizeCategory } from '@/lib/categories';
import { suggestOne, type SuggestCourse, type Suggestion } from '@/lib/keywordSuggest';
import { Material } from '@/lib/firestore/materials';
import InfoTip from '@/components/admin/InfoTip';

type Override = { courseId?: string; category?: string; tick?: boolean };
type Props = { items: Material[]; dept: string; year: number; courses: SuggestCourse[]; firebaseUser: any; onChanged: () => void };

const ROW_LIMIT = 40;
const COLOR = { high: '#22c55e', medium: '#eab308', none: '#6b7280' } as const;
const selStyle: CSSProperties = {
  background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 7px', color: 'var(--text-primary)', fontSize: '0.72rem', minWidth: 0,
};

// Reads each waiting file's title, suggests its course (within the year it was uploaded to) and its category.
// Sure matches can be sorted in one tap; the rest are reviewed row by row.
export default function SmartSortPanel({ items, dept, year, courses, firebaseUser, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ov, setOv] = useState<Record<string, Override>>({});
  const [shown, setShown] = useState(ROW_LIMIT);

  const scope = useMemo(() => {
    const s = courses.filter(c =>
      (!dept || String(c.department).toLowerCase() === dept.toLowerCase()) && (!year || Number(c.year) === year));
    return s.length ? s : courses;
  }, [courses, dept, year]);

  const rows = useMemo(() => items.map(m => ({
    m,
    s: suggestOne(
      { fileName: m.fileName, contributorCategory: normalizeCategory(m.category), contributorCourseId: m.suggestedCourseId },
      scope, courses),
  })), [items, scope, courses]);

  const eff = rows.map(r => {
    const o = ov[r.m.id] ?? {};
    const courseId = o.courseId !== undefined ? o.courseId : (r.s.courseId ?? '');
    const category = o.category ?? r.s.category;
    const tick = courseId ? (o.tick ?? (o.courseId ? true : r.s.confidence === 'high')) : false;
    return { ...r, courseId, category, tick };
  });

  const sure = eff.filter(r => r.s.confidence === 'high' && r.courseId && r.tick);
  const nHigh = rows.filter(r => r.s.confidence === 'high').length;
  const nMed = rows.filter(r => r.s.confidence === 'medium').length;
  const nNone = rows.length - nHigh - nMed;
  const ticked = eff.filter(r => r.tick && r.courseId);

  const order = { high: 0, medium: 1, none: 2 } as const;
  const sorted = [...eff].sort((a, b) => order[a.s.confidence] - order[b.s.confidence] || b.s.score - a.s.score);

  const setRow = (id: string, patch: Override) => setOv(p => ({ ...p, [id]: { ...p[id], ...patch } }));

  async function sortRows(list: { m: Material; courseId: string; category: string; s: Suggestion }[]) {
    if (!list.length) return;
    setBusy(true);
    try {
      const byCourse = new Map<string, typeof list>();
      list.forEach(r => byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]));
      const names = new Map<string, string>();
      for (const [cid, rs] of Array.from(byCourse.entries())) {
        const c = courses.find(x => x.id === cid);
        if (!c) continue;
        (await buildNames(c, rs.map(r => ({ id: r.m.id, fileName: r.m.fileName, category: r.category }))))
          .forEach((v, k) => names.set(k, v));
      }
      const now = new Date().toISOString();
      for (let i = 0; i < list.length; i += 400) {
        const batch = writeBatch(db);
        list.slice(i, i + 400).forEach(r => {
          const c = courses.find(x => x.id === r.courseId);
          if (!c) return;
          batch.update(doc(db, 'materials', r.m.id), {
            status: 'sorted',
            confirmedCourseId: c.id,
            confirmedCourseName: c.name,
            department: c.department,
            year: c.year,
            semester: c.semester,
            category: r.category,
            ...(names.get(r.m.id) ? { indexDisplayName: names.get(r.m.id) } : {}),
            // How it was sorted, and what it looked like before, so it can be inspected, edited or undone.
            autoSorted: {
              method: 'keywords',
              confidence: r.courseId === (r.s.courseId ?? '') ? r.s.confidence : 'none',
              why: r.courseId === (r.s.courseId ?? '') ? r.s.why : 'chosen by you in review',
              suggestedCourseId: r.s.courseId ?? null,
              suggestedCategory: r.s.category,
              changedByAdmin: r.courseId !== (r.s.courseId ?? '') || r.category !== r.s.category,
              at: now,
              by: firebaseUser?.email ?? '',
            },
            sortUndo: {
              status: (r.m as any).status ?? 'upload_review',
              category: (r.m as any).category ?? null,
              indexDisplayName: (r.m as any).indexDisplayName ?? null,
              department: (r.m as any).department ?? null,
              year: (r.m as any).year ?? null,
              semester: (r.m as any).semester ?? null,
            },
            sortedBy: firebaseUser?.email ?? '',
            sortedAt: now,
            updatedAt: now,
          });
        });
        await batch.commit();
      }
      setOv({});
      onChanged();
    } catch (e: any) {
      alert('Failed to sort: ' + (e?.message ?? e));
    } finally { setBusy(false); }
  }

  if (!rows.length) return null;

  const courseOptions = (extraId: string) => {
    const pool = scope.some(c => c.id === extraId) || !extraId ? scope : [...scope, ...courses.filter(c => c.id === extraId)];
    const sems = Array.from(new Set(pool.map(c => Number(c.semester)))).sort();
    return sems.map(sem => (
      <optgroup key={sem} label={`Semester ${sem}`}>
        {pool.filter(c => Number(c.semester) === sem)
          .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name))
          .map(c => <option key={c.id} value={c.id}>{c.code ? c.code + ' · ' : ''}{c.name}{Number(c.year) !== year && year ? ` (Y${c.year})` : ''}</option>)}
      </optgroup>
    ));
  };

  const goldBtn = (enabled: boolean): CSSProperties => ({
    padding: '8px 14px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '0.76rem',
    background: enabled ? 'var(--gold)' : 'var(--border)', color: enabled ? '#0a1020' : 'var(--text-muted)',
    cursor: enabled && !busy ? 'pointer' : 'not-allowed',
  });

  return (
    <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid rgba(196,160,80,0.35)', background: 'rgba(196,160,80,0.05)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--gold)' }}>✨ Smart sort from file names</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <span style={{ color: COLOR.high }}>● {nHigh} sure</span> · <span style={{ color: COLOR.medium }}>● {nMed} unsure</span> · <span style={{ color: COLOR.none }}>● {nNone} no match</span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button disabled={busy || sure.length === 0} onClick={() => sortRows(sure)} style={goldBtn(sure.length > 0)}>
          {busy ? 'Working…' : `Sort ${sure.length} sure file${sure.length !== 1 ? 's' : ''}`}
        </button>
        <button onClick={() => setOpen(o => !o)}
          style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(196,160,80,0.4)', background: 'transparent', color: 'var(--gold)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
          {open ? 'Hide review ▲' : 'Review all ▼'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <InfoTip
            todo="Green files are safe to sort in one tap. For amber and grey files, check the course and type, change them if wrong, tick the ones you want, then tap Sort ticked."
            means="The app only compares the file name with the course names and codes of this year (plus words like 'past questions' or 'syllabus' for the type). It never reads the file itself. Nothing moves until you tap a Sort button, and a sorted file can be re-assigned later." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.slice(0, shown).map(r => (
              <div key={r.m.id} style={{ padding: '8px 10px', borderRadius: 10, background: r.tick ? 'rgba(196,160,80,0.1)' : 'var(--navy)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={r.tick} disabled={!r.courseId} onChange={e => setRow(r.m.id, { tick: e.target.checked })} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR[r.s.confidence], flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.m.fileName}</span>
                </div>
                <p style={{ margin: '3px 0 6px 40px', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                  {ov[r.m.id]?.courseId !== undefined ? 'Your choice' : r.s.why}
                  {r.s.categoryFound === 'name' ? ' · type from name' : r.s.categoryFound === 'default' ? ' · type guessed (Handout)' : ''}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 24 }}>
                  <select value={r.courseId} onChange={e => setRow(r.m.id, { courseId: e.target.value, tick: e.target.value ? true : false })} style={{ ...selStyle, flex: '1 1 160px' }}>
                    <option value="">— pick a course —</option>
                    {courseOptions(r.courseId)}
                  </select>
                  <select value={normalizeCategory(r.category)} onChange={e => setRow(r.m.id, { category: e.target.value })} style={{ ...selStyle, flex: '0 1 150px' }}>
                    {CATEGORY_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
          {sorted.length > shown && (
            <button onClick={() => setShown(s => s + ROW_LIMIT)}
              style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
              Show {Math.min(ROW_LIMIT, sorted.length - shown)} more
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={busy || ticked.length === 0} onClick={() => sortRows(ticked)} style={goldBtn(ticked.length > 0)}>
              {busy ? 'Working…' : `Sort ticked (${ticked.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
