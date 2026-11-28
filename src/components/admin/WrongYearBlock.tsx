'use client';
// "Matches another year": unsorted files whose name matches no course of their own year but clearly matches a
// course elsewhere. One tap moves the file to that year's uploads list. Nothing is sorted or deleted here.

import { useMemo, useState, type CSSProperties } from 'react';
import type { SuggestCourse, Suggestion } from '@/lib/keywordSuggest';
import { Material } from '@/lib/firestore/materials';
import { moveUploads, keepInYear, deptYearLabel, type DeptYear } from '@/lib/moveUpload';
import InfoTip from '@/components/admin/InfoTip';

type Row = { m: Material; s: Suggestion };
type Props = { rows: Row[]; courses: SuggestCourse[]; from: DeptYear; firebaseUser: any; onChanged: () => void };
type Target = { key: string; to: DeptYear; hits: { course: SuggestCourse; why: string }[] };

const RED = '#f87171';
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const courseText = (c: SuggestCourse) => `${c.code ? c.code + ' · ' : ''}${c.name}`;
const selStyle: CSSProperties = {
  background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 7px', color: 'var(--text-primary)', fontSize: '0.72rem', minWidth: 0,
};

export default function WrongYearBlock({ rows, courses, from, firebaseUser, onChanged }: Props) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [otherOpen, setOtherOpen] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<Record<string, { dept: string; year: number | '' }>>({});

  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const depts = useMemo(() => Array.from(new Set(courses.map(c => String(c.department)))), [courses]);
  const by = firebaseUser?.email ?? '';

  // The other years a file matches, grouped by department + year.
  const targetsOf = (r: Row): Target[] => {
    const map = new Map<string, Target>();
    r.s.elsewhere.forEach(h => {
      const c = byId.get(h.courseId);
      if (!c) return;
      const key = `${c.department}|${c.year}`;
      const t = map.get(key) ?? { key, to: { dept: String(c.department), year: Number(c.year) }, hits: [] };
      t.hits.push({ course: c, why: h.why });
      map.set(key, t);
    });
    return Array.from(map.values());
  };

  const items = rows.map(r => ({ r, targets: targetsOf(r) })).filter(x => x.targets.length > 0);
  if (!items.length) return null;
  const singles = items.filter(x => x.targets.length === 1);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onChanged(); }
    catch (e: any) { alert('Failed: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  const moveOne = (id: string, to: DeptYear) => run(() => moveUploads([id], from, to, by));

  function moveAll() {
    if (!singles.length) return;
    if (!window.confirm(`Move ${singles.length} file${singles.length !== 1 ? 's' : ''} to the year each one matches? You can undo each move.`)) return;
    run(async () => {
      const groups = new Map<string, { to: DeptYear; ids: string[] }>();
      singles.forEach(x => {
        const t = x.targets[0];
        const g = groups.get(t.key) ?? { to: t.to, ids: [] };
        g.ids.push(x.r.m.id);
        groups.set(t.key, g);
      });
      for (const g of Array.from(groups.values())) await moveUploads(g.ids, from, g.to, by);
    });
  }

  const btn = (kind: 'gold' | 'ghost', enabled = true): CSSProperties => ({
    padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: '0.74rem',
    border: kind === 'gold' ? 'none' : '1px solid rgba(196,160,80,0.4)',
    background: kind === 'gold' ? (enabled ? 'var(--gold)' : 'var(--border)') : 'transparent',
    color: kind === 'gold' ? (enabled ? '#0a1020' : 'var(--text-muted)') : 'var(--gold)',
    cursor: enabled && !busy ? 'pointer' : 'not-allowed', textAlign: 'left',
  });

  return (
    <div style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${RED}55`, background: 'rgba(248,113,113,0.05)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <button onClick={() => setOpen(o => !o)}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{open ? '▼' : '▶'}</span>
          <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.86rem', fontWeight: 700, color: RED }}>
            ⚠ Matches another year ({items.length})
          </span>
        </button>
        {singles.length > 0 && (
          <button onClick={moveAll} disabled={busy} style={btn('ghost')}>Move all {singles.length}</button>
        )}
      </div>

      {open && (
        <div style={{ padding: '0 10px 10px' }}>
          <InfoTip
            todo="These files were uploaded to this year, but their names match a course in a different year. Tap the blue-gold Move button to send a file to that year's uploads list. Tap Keep here if it really belongs to this year."
            means="Moving only changes which year's list the file waits in. It stays unsorted, nothing is deleted, and you can undo it from the file afterwards. Smart sort then suggests a course for it in its new year." />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(({ r, targets }) => {
              const id = r.m.id;
              const isOther = otherOpen.has(id);
              const p = pick[id] ?? { dept: from.dept, year: '' as number | '' };
              const canMoveOther = !!p.dept && !!p.year && !(p.dept === from.dept && Number(p.year) === from.year);
              return (
                <div key={id} style={{ borderRadius: 10, background: 'var(--navy)', border: '1px solid var(--border)', padding: '9px 11px' }}>
                  <p style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', margin: 0 }}>{r.m.fileName}</p>
                  {targets.map(t => t.hits.map(h => (
                    <p key={h.course.id} style={{ fontSize: '0.68rem', color: RED, margin: '3px 0 0', lineHeight: 1.5 }}>
                      Matches {courseText(h.course)} ({deptYearLabel(h.course.department, h.course.year)}, Sem {h.course.semester})
                    </p>
                  )))}
                  {r.m.suggestedCourseName && (
                    <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
                      Contributor's class: {r.m.suggestedCourseName} (kept as a note)
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
                    {targets.map(t => (
                      <button key={t.key} disabled={busy} onClick={() => moveOne(id, t.to)} style={btn('gold')}>
                        Move to {deptYearLabel(t.to.dept, t.to.year)} uploads
                      </button>
                    ))}
                    <button disabled={busy} onClick={() => setOtherOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} style={btn('ghost')}>
                      {isOther ? 'Hide other years ▲' : 'Other year ▼'}
                    </button>
                    <button disabled={busy} onClick={() => run(() => keepInYear([id]))} style={btn('ghost')}>Keep here</button>
                    {r.m.fileUrl && (
                      <a href={r.m.fileUrl} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>Open ↗</a>
                    )}
                  </div>
                  {isOther && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                      <select value={p.dept} onChange={e => setPick(prev => ({ ...prev, [id]: { ...p, dept: e.target.value } }))} style={selStyle}>
                        <option value="">Dept</option>
                        {depts.map(d => <option key={d} value={d}>{cap(d)}</option>)}
                      </select>
                      <select value={p.year} onChange={e => setPick(prev => ({ ...prev, [id]: { ...p, year: e.target.value ? Number(e.target.value) : '' } }))} style={selStyle}>
                        <option value="">Year</option>
                        {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                      </select>
                      <button disabled={busy || !canMoveOther} onClick={() => moveOne(id, { dept: p.dept, year: Number(p.year) })} style={btn('gold', canMoveOther)}>
                        Move there
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {singles.length < items.length && (
            <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
              “Move all” skips files that match courses in more than one year. Choose those yourself.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
