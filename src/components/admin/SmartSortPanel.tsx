'use client';
// SmartSortPanel v2: suggestions grouped by course, every file inspectable and editable.

import { useMemo, useState, type CSSProperties } from 'react';
import { writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { buildNames } from '@/lib/materialNaming';
import { CATEGORY_OPTIONS, CATEGORY_LABEL, normalizeCategory } from '@/lib/categories';
import { suggestOne, scopeFor, type SuggestCourse, type Suggestion } from '@/lib/keywordSuggest';
import { Material } from '@/lib/firestore/materials';
import InfoTip from '@/components/admin/InfoTip';
import WrongYearBlock from '@/components/admin/WrongYearBlock';
import { undoMoves, movedFromLabel } from '@/lib/moveUpload';

type Override = { courseId?: string; category?: string; tick?: boolean };
type Props = { items: Material[]; dept: string; year: number; courses: SuggestCourse[]; firebaseUser: any; onChanged: () => void };
type Eff = { m: Material; s: Suggestion; courseId: string; category: string; tick: boolean };

const NONE = '__none';
const EITHER = '__either';
const COLOR = { high: '#22c55e', medium: '#eab308', either: '#f59e0b', none: '#6b7280' } as const;
const ORDER = { high: 0, medium: 1, either: 2, none: 3 } as const;
const selStyle: CSSProperties = {
  background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 7px', color: 'var(--text-primary)', fontSize: '0.72rem', minWidth: 0,
};
const courseText = (c?: SuggestCourse) => (c ? `${c.code ? c.code + ' · ' : ''}${c.name}` : 'Needs a course');

function fmtBytes(b: any): string {
  const n = Number(b);
  return n ? (n / (1024 * 1024)).toFixed(1) + ' MB' : '';
}
function fmtDate(m: Material): string {
  const c: any = (m as any).createdAt;
  const d = typeof c === 'string' ? new Date(c) : c?.toDate?.() ?? null;
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

// Reads each waiting file's title and files it under the course it most likely belongs to (within the year it was
// uploaded to). Sure matches start ticked, unsure ones unticked. Open any file to inspect or change it.
export default function SmartSortPanel({ items, dept, year, courses, firebaseUser, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [ov, setOv] = useState<Record<string, Override>>({});
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const scope = useMemo(() => scopeFor(courses, dept, year), [courses, dept, year]);
  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const semOf = (id: string) => { const c = byId.get(id); return c ? `Sem ${c.semester}` : ''; };

  const allRows = useMemo(() => items.map(m => ({
    m,
    s: suggestOne(
      { fileName: m.fileName, contributorCategory: normalizeCategory(m.category), contributorCourseId: m.suggestedCourseId },
      scope, courses),
  })), [items, scope, courses]);

  // Files whose name matches a course in another year are listed in their own block and kept out of the sort list.
  const isFlagged = (r: { m: Material; s: Suggestion }) => r.s.elsewhere.length > 0 && !(r.m as any).keepInYear;
  const flagged = allRows.filter(isFlagged);
  const rows = allRows.filter(r => !isFlagged(r));

  const eff: Eff[] = rows.map(r => {
    const o = ov[r.m.id] ?? {};
    const courseId = o.courseId !== undefined ? o.courseId : (r.s.courseId ?? '');
    const category = o.category ?? r.s.category ?? '';
    const courseOk = o.courseId ? true : r.s.confidence === 'high';
    const typeOk = o.category !== undefined ? true : r.s.categoryState === 'sure';
    const tick = courseId && category ? (o.tick ?? (courseOk && typeOk)) : false;
    return { ...r, courseId, category, tick };
  });

  const nHigh = rows.filter(r => r.s.confidence === 'high').length;
  const nMed = rows.filter(r => r.s.confidence === 'medium').length;
  const nEither = rows.filter(r => r.s.confidence === 'either').length;
  const nNone = rows.length - nHigh - nMed - nEither;
  const nType = rows.filter(r => r.s.categoryState !== 'sure' && ov[r.m.id]?.category === undefined).length;
  const ticked = eff.filter(r => r.tick && r.courseId);

  const groupMap = new Map<string, Eff[]>();
  eff.forEach(r => { const k = r.courseId || (r.s.ambiguous && ov[r.m.id]?.courseId === undefined ? EITHER : NONE); groupMap.set(k, [...(groupMap.get(k) ?? []), r]); });
  const inScope = (id: string) => scope.some(c => c.id === id);
  const blocks = Array.from(groupMap.entries())
    .map(([id, list]) => ({
      id, course: byId.get(id),
      list: [...list].sort((a, b) => ORDER[a.s.confidence] - ORDER[b.s.confidence] || a.m.fileName.localeCompare(b.m.fileName)),
    }))
    .sort((a, b) => {
      const rk = (id: string) => (id === NONE ? 2 : id === EITHER ? 1 : 0);
      if (rk(a.id) !== rk(b.id)) return rk(a.id) - rk(b.id);
      const oa = inScope(a.id) ? 0 : 1, ob = inScope(b.id) ? 0 : 1;
      return oa - ob
        || Number(a.course?.semester ?? 0) - Number(b.course?.semester ?? 0)
        || (a.course?.code ?? a.course?.name ?? '').localeCompare(b.course?.code ?? b.course?.name ?? '');
    });

  const setRow = (id: string, patch: Override) => setOv(p => ({ ...p, [id]: { ...p[id], ...patch } }));
  const resetRow = (id: string) => setOv(p => { const n = { ...p }; delete n[id]; return n; });
  const toggleSet = (setter: (f: (p: Set<string>) => Set<string>) => void, id: string) =>
    setter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function sortRows(list: Eff[]) {
    if (!list.length) return;
    setBusy(true);
    try {
      const byCourse = new Map<string, Eff[]>();
      list.forEach(r => byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]));
      const names = new Map<string, string>();
      for (const [cid, rs] of Array.from(byCourse.entries())) {
        const c = byId.get(cid);
        if (!c) continue;
        (await buildNames(c, rs.map(r => ({ id: r.m.id, fileName: r.m.fileName, category: r.category }))))
          .forEach((v, k) => names.set(k, v));
      }
      const now = new Date().toISOString();
      for (let i = 0; i < list.length; i += 400) {
        const batch = writeBatch(db);
        list.slice(i, i + 400).forEach(r => {
          const c = byId.get(r.courseId);
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
              suggestedCategory: r.s.category ?? null,
              categoryState: r.s.categoryState,
              changedByAdmin: r.courseId !== (r.s.courseId ?? '') || r.category !== (r.s.category ?? ''),
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

  async function undoMoveRow(m: Material) {
    setBusy(true);
    try { await undoMoves([m]); onChanged(); }
    catch (e: any) { alert('Could not undo the move: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  if (!rows.length && !flagged.length) return null;

  const courseOptions = (extraId: string) => {
    const pool = !extraId || inScope(extraId) ? scope : [...scope, ...courses.filter(c => c.id === extraId)];
    const sems = Array.from(new Set(pool.map(c => Number(c.semester)))).sort();
    return sems.map(sem => (
      <optgroup key={sem} label={`Semester ${sem}`}>
        {pool.filter(c => Number(c.semester) === sem)
          .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name))
          .map(c => <option key={c.id} value={c.id}>{courseText(c)}{year && Number(c.year) !== year ? ` (Y${c.year})` : ''}</option>)}
      </optgroup>
    ));
  };

  const btn = (kind: 'gold' | 'ghost', enabled: boolean): CSSProperties => ({
    padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: '0.74rem',
    border: kind === 'gold' ? 'none' : '1px solid rgba(196,160,80,0.4)',
    background: kind === 'gold' ? (enabled ? 'var(--gold)' : 'var(--border)') : 'transparent',
    color: kind === 'gold' ? (enabled ? '#0a1020' : 'var(--text-muted)') : 'var(--gold)',
    cursor: enabled && !busy ? 'pointer' : 'not-allowed', opacity: kind === 'ghost' && !enabled ? 0.5 : 1,
  });

  function renderRow(r: Eff) {
    const isOpen = openRows.has(r.m.id);
    const changed = ov[r.m.id] !== undefined;
    return (
      <div key={r.m.id} style={{ borderRadius: 10, background: r.tick ? 'rgba(196,160,80,0.1)' : 'var(--navy)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
          <input type="checkbox" checked={r.tick} disabled={!r.courseId || !r.category} title={!r.courseId ? 'Pick a course first' : !r.category ? 'Pick a type first' : ''} onChange={e => setRow(r.m.id, { tick: e.target.checked })} />
          <button onClick={() => toggleSet(setOpenRows, r.m.id)}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: COLOR[r.s.confidence] }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.m.fileName}</span>
              <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.category ? (CATEGORY_LABEL[normalizeCategory(r.category)] ?? r.category) : '◆ pick a type'} · {changed && ov[r.m.id]?.courseId !== undefined ? 'your choice' : r.s.why}
              </span>
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{isOpen ? '▲' : '▼'}</span>
          </button>
        </div>

        {movedFromLabel(r.m) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0 10px 8px 36px' }}>
            <span style={{ fontSize: '0.64rem', color: '#60a5fa' }}>↪ Moved from {movedFromLabel(r.m)}</span>
            <button onClick={() => undoMoveRow(r.m)} disabled={busy}
              style={{ padding: '3px 9px', borderRadius: 99, border: '1px solid rgba(96,165,250,0.5)', background: 'transparent', color: '#60a5fa', fontSize: '0.66rem', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
              Undo move
            </button>
          </div>
        )}

        {r.s.ambiguous && ov[r.m.id]?.courseId === undefined && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '0 10px 8px 36px' }}>
            <span style={{ fontSize: '0.64rem', color: '#f59e0b' }}>⚠ {r.s.why}. Pick one:</span>
            {[...(r.s.courseId ? [{ courseId: r.s.courseId }] : []), ...r.s.alternatives].map(a => (
              <button key={a.courseId} onClick={() => setRow(r.m.id, { courseId: a.courseId, tick: true })}
                style={{ padding: '4px 9px', borderRadius: 99, border: '1px solid rgba(245,158,11,0.5)', background: 'transparent', color: '#f59e0b', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                {semOf(a.courseId)} · {courseText(byId.get(a.courseId))}
              </button>
            ))}
          </div>
        )}

        {r.s.categoryState !== 'sure' && ov[r.m.id]?.category === undefined && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '0 10px 8px 36px' }}>
            <span style={{ fontSize: '0.64rem', color: '#60a5fa' }}>◆ Type unclear: {r.s.categoryWhy}. Pick one:</span>
            {(r.s.categoryOptions.length ? r.s.categoryOptions : CATEGORY_OPTIONS.map(o => o.key)).map(k => (
              <button key={k} onClick={() => setRow(r.m.id, { category: k })}
                style={{ padding: '4px 9px', borderRadius: 99, border: '1px solid rgba(96,165,250,0.5)', background: 'transparent', color: '#60a5fa', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                {CATEGORY_LABEL[k] ?? k}
              </button>
            ))}
          </div>
        )}

        {isOpen && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p><b>Uploaded as:</b> {r.m.fileName}</p>
            <p><b>Match:</b> {r.s.why} — {r.s.confidence === 'high' ? 'sure' : r.s.confidence === 'medium' ? 'unsure' : r.s.confidence === 'either' ? 'could be more than one course' : 'no clear match'}</p>
            <p><b>Type:</b> {r.s.category ? (CATEGORY_LABEL[normalizeCategory(r.s.category)] ?? r.s.category) : 'not sure'} — {r.s.categoryWhy}{r.s.contributorCategory ? ` · the contributor chose ${CATEGORY_LABEL[normalizeCategory(r.s.contributorCategory)] ?? r.s.contributorCategory}` : ''}</p>
            {(r.m.suggestedCourseName || (r.m as any).uploaderEmail) && (
              <p><b>Contributor:</b> {[r.m.suggestedCourseName ? 'picked class "' + r.m.suggestedCourseName + '"' : '', (r.m as any).uploaderEmail].filter(Boolean).join(' · ')}</p>
            )}
            <p><b>File:</b> {[fmtBytes((r.m as any).fileSize), fmtDate(r.m)].filter(Boolean).join(' · ') || '—'}{r.m.fileUrl && <> · <a href={r.m.fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Open the file ↗</a></>}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
              <select value={r.courseId} onChange={e => setRow(r.m.id, { courseId: e.target.value, tick: e.target.value ? true : false })} style={{ ...selStyle, flex: '1 1 170px' }}>
                <option value="">— pick a course —</option>
                {courseOptions(r.courseId)}
              </select>
              <select value={r.category ? normalizeCategory(r.category) : ''} onChange={e => setRow(r.m.id, { category: e.target.value })} style={{ ...selStyle, flex: '0 1 150px' }}>
                <option value="">— pick a type —</option>
                {CATEGORY_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => sortRows([r])} disabled={busy || !r.courseId || !r.category} style={btn('gold', !!r.courseId && !!r.category)}>Sort this file</button>
              {changed && <button onClick={() => resetRow(r.m.id)} style={btn('ghost', true)}>Reset to suggestion</button>}
            </div>
          </div>
        )}
      </div>
    );
  }

  let lastGroup = '';
  return (
    <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid rgba(196,160,80,0.35)', background: 'rgba(196,160,80,0.05)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--gold)' }}>✨ Smart sort from file names</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <span style={{ color: COLOR.high }}>● {nHigh} sure</span> · <span style={{ color: COLOR.medium }}>● {nMed} unsure</span> · <span style={{ color: COLOR.either }}>● {nEither} could be either</span> · <span style={{ color: COLOR.none }}>● {nNone} no match</span> · <span style={{ color: '#60a5fa' }}>◆ {nType} need a type</span>{flagged.length > 0 && <> · <span style={{ color: '#f87171' }}>⚠ {flagged.length} in the wrong year</span></>}
        </span>
      </div>
      <InfoTip
        todo="Files are listed under the course they most likely belong to. Green ones are ticked. Orange ones could belong to more than one course (such as the same course in both semesters): tap the right one. A blue ◆ means the title does not clearly say the type (Handout, Past Questions…): pick it before sorting. Check the amber and grey ones, tap a file to change its course or type, then sort the ticked files."
        means="The app only compares the file name with the course names and codes of this year (plus words like 'past questions' or 'syllabus' for the type). It never reads the file itself. Nothing moves until you tap a Sort button, and sorted files can be inspected, edited or undone from the green box lower down." />
      <WrongYearBlock rows={flagged} courses={courses} from={{ dept, year }} firebaseUser={firebaseUser} onChanged={onChanged} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 12px' }}>
        <button disabled={busy || ticked.length === 0} onClick={() => sortRows(ticked)} style={btn('gold', ticked.length > 0)}>
          {busy ? 'Working…' : `Sort all ticked (${ticked.length})`}
        </button>
        <button onClick={() => setClosed(closed.size ? new Set() : new Set(blocks.map(b => b.id)))} style={btn('ghost', true)}>
          {closed.size ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {blocks.map(b => {
          const group = b.id === NONE ? 'none' : b.id === EITHER ? 'either' : inScope(b.id) ? `s${b.course?.semester}` : 'other';
          const heading = group !== lastGroup
            ? (group === 'none' || group === 'either' ? '' : group === 'other' ? 'Courses from other years' : `Semester ${b.course?.semester}`)
            : '';
          lastGroup = group;
          const isClosed = closed.has(b.id);
          const blockTicked = b.list.filter(r => r.tick && r.courseId);
          const sure = b.list.filter(r => r.s.confidence === 'high').length;
          return (
            <div key={b.id}>
              {heading && <p style={{ fontSize: '0.66rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '4px 0 6px' }}>{heading}</p>}
              <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--navy-card)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                  <button onClick={() => toggleSet(setClosed, b.id)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{isClosed ? '▶' : '▼'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'Playfair Display, serif', fontSize: '0.84rem', fontWeight: 700, color: b.id === EITHER ? '#f59e0b' : b.id === NONE ? 'var(--text-secondary)' : 'var(--gold)' }}>
                        {b.id === NONE ? 'Needs a course' : b.id === EITHER ? '⚠ Could be more than one course' : courseText(b.course)}{b.course && !inScope(b.id) ? ` (Year ${b.course.year})` : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        {b.list.length} file{b.list.length !== 1 ? 's' : ''}{b.id !== NONE && b.id !== EITHER ? ` · ${sure} sure` : ''}
                      </span>
                    </span>
                  </button>
                  {b.id !== NONE && b.id !== EITHER && (
                    <button onClick={() => sortRows(blockTicked)} disabled={busy || blockTicked.length === 0} style={btn('ghost', blockTicked.length > 0)}>
                      Sort {blockTicked.length}
                    </button>
                  )}
                </div>
                {!isClosed && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px 10px' }}>{b.list.map(renderRow)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
