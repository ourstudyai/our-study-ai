'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, writeBatch, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { buildNames } from '@/lib/materialNaming';
import { CATEGORY_OPTIONS, CATEGORY_LABEL, normalizeCategory } from '@/lib/categories';
import { courseLabel } from '@/lib/courseLabel';
import type { SuggestCourse } from '@/lib/keywordSuggest';
import InfoTip from '@/components/admin/InfoTip';

type Row = {
  id: string; fileName: string; indexDisplayName?: string; fileUrl?: string;
  confirmedCourseId?: string; category?: string; autoSorted?: any; sortUndo?: any;
};
type Props = { courses: SuggestCourse[]; firebaseUser: any; refreshKey: number; onChanged: () => void };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const COLOR: Record<string, string> = { high: '#22c55e', medium: '#eab308', none: '#6b7280' };
const LIMIT = 30;
const selStyle: CSSProperties = {
  background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 7px', color: 'var(--text-primary)', fontSize: '0.72rem', minWidth: 0,
};
const btn = (kind: 'gold' | 'ghost' | 'red', enabled = true): CSSProperties => ({
  padding: '7px 12px', borderRadius: 9, fontWeight: 700, fontSize: '0.74rem',
  cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.45,
  border: kind === 'gold' ? 'none' : kind === 'red' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(196,160,80,0.4)',
  background: kind === 'gold' ? 'var(--gold)' : 'transparent',
  color: kind === 'gold' ? '#0a1020' : kind === 'red' ? '#ef4444' : 'var(--gold)',
});

// Files that Smart sort sorted and that have not been sent to OCR yet: inspect why, edit, or undo.
export default function AutoSortedReview({ courses, firebaseUser, refreshKey, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ courseId: string; category: string }>({ courseId: '', category: '' });
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(LIMIT);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'materials'), where('status', '==', 'sorted')));
      setRows(snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as Row))
        .filter(r => r.autoSorted && r.autoSorted.method === 'keywords'));
    } catch (e: any) { setErr('Could not load: ' + (e?.message ?? e)); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const groups = useMemo(() => {
    const m = new Map<string, SuggestCourse[]>();
    courses.forEach(c => {
      const k = `${cap(String(c.department))} · Year ${c.year} · Semester ${c.semester}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [courses]);

  if (rows.length === 0 && !err) return null;

  function undoPatch(r: Row): Record<string, any> {
    const u = r.sortUndo ?? {};
    const back = (k: string) => (u[k] === null || u[k] === undefined ? deleteField() : u[k]);
    return {
      status: u.status || 'upload_review',
      category: back('category'), indexDisplayName: back('indexDisplayName'),
      department: back('department'), year: back('year'), semester: back('semester'),
      confirmedCourseId: deleteField(), confirmedCourseName: deleteField(),
      autoSorted: deleteField(), sortUndo: deleteField(), sortedBy: deleteField(), sortedAt: deleteField(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function undoOne(r: Row) {
    if (!r.sortUndo) { alert('No undo information was saved for this file.'); return; }
    setBusy(true);
    try { await updateDoc(doc(db, 'materials', r.id), undoPatch(r)); setOpenId(null); await load(); onChanged(); }
    catch (e: any) { alert('Undo failed: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function undoAll() {
    const list = rows.filter(r => r.sortUndo);
    if (!list.length) return;
    if (!window.confirm(`Send ${list.length} auto-sorted file${list.length !== 1 ? 's' : ''} back to unsorted?`)) return;
    setBusy(true);
    try {
      for (let i = 0; i < list.length; i += 400) {
        const batch = writeBatch(db);
        list.slice(i, i + 400).forEach(r => batch.update(doc(db, 'materials', r.id), undoPatch(r)));
        await batch.commit();
      }
      setOpenId(null); await load(); onChanged();
    } catch (e: any) { alert('Undo failed: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  async function saveEdit(r: Row) {
    const c = byId.get(draft.courseId);
    if (!c) { alert('Pick a course first.'); return; }
    setBusy(true);
    try {
      const names = await buildNames(c, [{ id: r.id, fileName: r.fileName, category: draft.category }]);
      await updateDoc(doc(db, 'materials', r.id), {
        confirmedCourseId: c.id, confirmedCourseName: c.name,
        department: c.department, year: c.year, semester: c.semester,
        category: draft.category,
        ...(names.get(r.id) ? { indexDisplayName: names.get(r.id) } : {}),
        'autoSorted.edited': true,
        updatedAt: new Date().toISOString(),
      });
      setOpenId(null); await load(); onChanged();
    } catch (e: any) { alert('Save failed: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  function toggleRow(r: Row) {
    if (openId === r.id) { setOpenId(null); return; }
    setOpenId(r.id);
    setDraft({ courseId: r.confirmedCourseId ?? '', category: normalizeCategory(r.category) || 'lecture_notes' });
  }

  const sorted = [...rows].sort((a, b) =>
    String(a.confirmedCourseId).localeCompare(String(b.confirmedCourseId)) || a.fileName.localeCompare(b.fileName));

  return (
    <div style={{ marginTop: 14, borderRadius: 12, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.04)', padding: '10px 12px' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.88rem', fontWeight: 700, color: '#22c55e' }}>✨ Auto-sorted, not yet in OCR ({rows.length})</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <InfoTip
            todo="Tap a file to see why it was sorted there. Change its course or type and tap Save, or tap Undo to send it back to unsorted."
            means="These files were sorted by Smart sort and are waiting in the OCR Queue. Once you send a file to OCR it leaves this list and can only be changed from the OCR Queue or the Approved tab." />
          {err && <p style={{ color: '#ef4444', fontSize: '0.74rem', marginBottom: 8 }}>{err}</p>}
          <div style={{ marginBottom: 10 }}>
            <button onClick={undoAll} disabled={busy} style={btn('red', !busy)}>Undo all ({rows.filter(r => r.sortUndo).length})</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.slice(0, shown).map(r => {
              const c = byId.get(r.confirmedCourseId ?? '');
              const a = r.autoSorted ?? {};
              const isOpen = openId === r.id;
              return (
                <div key={r.id} style={{ borderRadius: 10, background: 'var(--navy)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <button onClick={() => toggleRow(r)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: COLOR[a.confidence] ?? COLOR.none }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.indexDisplayName || r.fileName}</span>
                      <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c ? courseLabel(c) : 'Course not found'} · {CATEGORY_LABEL[normalizeCategory(r.category)] ?? 'Handout'}{a.edited ? ' · edited' : ''}
                      </span>
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <p><b>Uploaded as:</b> {r.fileName}</p>
                      <p><b>Now named:</b> {r.indexDisplayName || '—'}</p>
                      <p><b>Course:</b> {c ? `${c.code ? c.code + ' · ' : ''}${c.name} (${cap(String(c.department))}, Year ${c.year}, Sem ${c.semester})` : 'not found'}</p>
                      <p><b>Why:</b> {a.why || 'n/a'} — {a.confidence === 'high' ? 'sure' : a.confidence === 'medium' ? 'unsure' : 'chosen by you'}{a.changedByAdmin ? ' · you changed the suggestion' : ''}</p>
                      <p><b>Sorted:</b> {a.at ? new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}{a.by ? ' by ' + a.by : ''}</p>
                      {r.fileUrl && <p><a href={r.fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Open the file ↗</a></p>}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
                        <select value={draft.courseId} onChange={e => setDraft(d => ({ ...d, courseId: e.target.value }))} style={{ ...selStyle, flex: '1 1 170px' }}>
                          <option value="">— pick a course —</option>
                          {groups.map(([label, list]) => (
                            <optgroup key={label} label={label}>
                              {list.sort((x, y) => (x.code ?? x.name).localeCompare(y.code ?? y.name))
                                .map(x => <option key={x.id} value={x.id}>{x.code ? x.code + ' · ' : ''}{x.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} style={{ ...selStyle, flex: '0 1 150px' }}>
                          {CATEGORY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => saveEdit(r)} disabled={busy || !draft.courseId} style={btn('gold', !busy && !!draft.courseId)}>{busy ? 'Working…' : 'Save changes'}</button>
                        <button onClick={() => undoOne(r)} disabled={busy || !r.sortUndo} style={btn('red', !busy && !!r.sortUndo)}>↩ Undo (back to unsorted)</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {sorted.length > shown && (
            <button onClick={() => setShown(s => s + LIMIT)}
              style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
              Show {Math.min(LIMIT, sorted.length - shown)} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
