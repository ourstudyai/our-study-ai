'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { authFetch } from '@/lib/auth/authFetch';
import { CATEGORY_OPTIONS, CATEGORY_LABEL, normalizeCategory } from '@/lib/categories';
import { suggestOne, type SuggestCourse } from '@/lib/keywordSuggest';
import InfoTip from '@/components/admin/InfoTip';

type Hit = {
  uid: string; email: string; dept: string | null; year: number | null; courseId: string | null; courseName: string | null;
  at: string; fileName?: string | null; status?: string; sharedWith?: string[]; resolvedAt?: string;
};
type Item = {
  id: string; name: string; fileName: string; fileUrl?: string; status: string; indexed: boolean; category: string;
  confirmedCourseId?: string; shared: string[]; hits: Hit[];
};
type Sug = { ids: string[]; note: string; alts: string[] };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const courseText = (c?: SuggestCourse) => (c ? `${c.code ? c.code + ' · ' : ''}${c.name}` : 'unknown course');
const selStyle: CSSProperties = {
  background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 7px', color: 'var(--text-primary)', fontSize: '0.72rem', minWidth: 0,
};
const chip = (color: string): CSSProperties => ({
  padding: '4px 9px', borderRadius: 99, border: `1px solid ${color}`, background: 'transparent', color,
  fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
});

// A file someone uploaded again was not stored twice. It shows here, under the year it was uploaded for, as a suggestion
// to share the existing file with that year's course(s). Sharing needs no OCR or any other step: the file is already done.
export default function DuplicateHits({ courses, firebaseUser }: { courses: SuggestCourse[]; firebaseUser: any }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState('');
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [cat, setCat] = useState<Record<string, string>>({});

  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'materials'), where('hasDuplicateHits', '==', true)));
    setItems(snap.docs.map(d => {
      const m: any = d.data();
      return {
        id: d.id, name: m.indexDisplayName || m.fileName || d.id, fileName: m.fileName || '', fileUrl: m.fileUrl,
        status: String(m.status ?? ''), indexed: m.indexed === true, category: String(m.category ?? ''),
        confirmedCourseId: m.confirmedCourseId || undefined,
        shared: [...(m.sharedCourseIds ?? []), ...(m.extraCourseIds ?? [])],
        hits: Array.isArray(m.duplicateHits) ? m.duplicateHits : [],
      } as Item;
    }).filter(i => i.hits.length > 0));
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const pending = items.flatMap(item => item.hits.filter(h => h.status !== 'shared').map(hit => ({ item, hit })));
  const done = items.flatMap(item => item.hits.filter(h => h.status === 'shared').map(hit => ({ item, hit })));
  useEffect(() => { if (!autoOpened && pending.length > 0) { setOpen(true); setAutoOpened(true); } }, [autoOpened, pending.length]);

  const keyOf = (item: Item, hit: Hit) => `${item.id}|${hit.uid}|${hit.at}`;

  function placeText(item: Item): string {
    const c = byId.get(item.confirmedCourseId ?? '');
    if (c) return `${cap(String(c.department))} Year ${c.year}, Sem ${c.semester} · ${courseText(c)}`;
    return item.status === 'upload_review' || item.status === 'awaiting_course' ? 'still waiting to be sorted' : item.status.replace(/_/g, ' ');
  }

  // Which course(s) of the year it was uploaded for does this file belong in?
  function suggest(item: Item, hit: Hit): Sug {
    const skip = new Set<string>([item.confirmedCourseId ?? '', ...item.shared]);
    if (hit.courseId && byId.has(hit.courseId) && !skip.has(hit.courseId)) {
      return { ids: [hit.courseId], note: 'The student picked this class when uploading.', alts: [] };
    }
    const d = String(hit.dept ?? '').toLowerCase();
    const scope = courses.filter(c => (!d || String(c.department).toLowerCase() === d) && (!hit.year || Number(c.year) === hit.year));
    const pool = scope.length ? scope : courses;
    const tries: { text: string; from: string }[] = [
      { text: hit.fileName || item.fileName, from: 'the file name' },
      { text: byId.get(item.confirmedCourseId ?? '')?.name ?? '', from: 'the course it is in now' },
    ];
    for (const t of tries) {
      if (!t.text) continue;
      const s = suggestOne({ fileName: t.text }, pool, courses);
      if (s.confidence === 'either') {
        return { ids: [], note: `Could be more than one course (${s.why}).`, alts: s.alternatives.map(a => a.courseId).filter(id => !skip.has(id)) };
      }
      if (s.courseId && !skip.has(s.courseId)) {
        return {
          ids: [s.courseId],
          note: `Looks like ${courseText(byId.get(s.courseId))} from ${t.from} (${s.why}).${s.confidence === 'medium' ? ' Please check.' : ''}`,
          alts: s.alternatives.map(a => a.courseId).filter(id => !skip.has(id)),
        };
      }
    }
    return { ids: [], note: 'No course of that year matches the name. Pick one.', alts: [] };
  }

  async function dismiss(item: Item, hit: Hit) {
    const left = item.hits.filter(h => !(h.uid === hit.uid && h.at === hit.at));
    await updateDoc(doc(db, 'materials', item.id), { duplicateHits: left, hasDuplicateHits: left.length > 0 });
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, hits: left } : i)).filter(i => i.hits.length > 0));
  }

  async function call(item: Item, hit: Hit, action: 'share' | 'undo', ids: string[], category?: string) {
    const key = keyOf(item, hit);
    setBusy(key);
    try {
      await firebaseUser?.getIdToken(true);
      const r = await authFetch('/api/admin/share-material', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: item.id, courseIds: ids, action, hit: { uid: hit.uid, at: hit.at }, ...(category ? { category } : {}) }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) { alert('Failed: ' + (d.error || 'HTTP ' + r.status)); return; }
      if (d.warnings?.length) alert(d.warnings.join('\n'));
      setSel(p => { const n = { ...p }; delete n[key]; return n; });
      setCat(p => { const n = { ...p }; delete n[item.id]; return n; });
      await load();
    } catch (e: any) { alert('Error: ' + (e?.message ?? e)); }
    finally { setBusy(''); }
  }

  const courseOptions = (hit: Hit, exclude: Set<string>) => {
    const d = String(hit.dept ?? '').toLowerCase();
    const groups = new Map<string, SuggestCourse[]>();
    courses.filter(c => !exclude.has(c.id)).forEach(c => {
      const k = `${cap(String(c.department))} · Year ${c.year} · Semester ${c.semester}`;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    });
    const here = (k: string) => (String(d) && k.toLowerCase().startsWith(d) && hit.year && k.includes(`Year ${hit.year} `)) ? 0 : 1;
    return Array.from(groups.entries()).sort((a, b) => here(a[0]) - here(b[0]) || a[0].localeCompare(b[0])).map(([label, list]) => (
      <optgroup key={label} label={label}>
        {list.sort((x, y) => (x.code ?? x.name).localeCompare(y.code ?? y.name)).map(c => <option key={c.id} value={c.id}>{courseText(c)}</option>)}
      </optgroup>
    ));
  };

  if (items.length === 0) return null;

  const byYear = new Map<string, typeof pending>();
  pending.forEach(p => {
    const k = p.hit.dept || p.hit.year ? `${cap(String(p.hit.dept ?? ''))} · Year ${p.hit.year ?? '?'}` : 'Year not stated';
    byYear.set(k, [...(byYear.get(k) ?? []), p]);
  });

  return (
    <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.05)', padding: '10px 12px' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.88rem', fontWeight: 700, color: '#60a5fa' }}>
          🔗 Already on the platform: suggested for sharing ({pending.length})
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <InfoTip
            todo="For each file, check the suggested course(s) of that year, add more if needed, then tap Share. Dismiss it if it should not be shared."
            means="Someone uploaded a file we already hold for another year or class, so it was not stored again. Sharing makes the one existing file appear under the course(s) you choose (Library, course page, chat, AI search). It does not go to OCR or any other tab because it is already processed. Changing the type here changes it for the file everywhere." />
          {pending.length === 0 && <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nothing waiting to be shared.</p>}

          {Array.from(byYear.entries()).map(([heading, list]) => (
            <div key={heading} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: '0.66rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '6px 0' }}>{heading} ({list.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map(({ item, hit }) => {
                  const key = keyOf(item, hit);
                  const sug = suggest(item, hit);
                  const chosen = sel[key] ?? sug.ids;
                  const curCat = cat[item.id] ?? normalizeCategory(item.category);
                  const catChanged = !!curCat && curCat !== normalizeCategory(item.category);
                  const exclude = new Set<string>([item.confirmedCourseId ?? '', ...item.shared, ...chosen]);
                  const working = busy === key;
                  return (
                    <div key={key} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.fileName || item.fileName}</p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Same file as “{item.name}”, now in {placeText(item)}.
                        {item.fileUrl && <> <a href={item.fileUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Open ↗</a></>}
                      </p>
                      {item.shared.length > 0 && (
                        <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Already shared with: {item.shared.map(id => courseText(byId.get(id))).join(', ')}</p>
                      )}
                      <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                        Asked by {hit.email}{hit.dept ? ` for ${cap(hit.dept)}` : ''}{hit.year ? ` Year ${hit.year}` : ''}{hit.courseName ? ` · picked class: ${hit.courseName}` : ''}
                      </p>
                      <p style={{ fontSize: '0.68rem', color: '#60a5fa', margin: '6px 0' }}>{sug.note}</p>

                      {sug.alts.length > 0 && chosen.length === 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          {sug.alts.map(id => (
                            <button key={id} onClick={() => setSel(p => ({ ...p, [key]: [...chosen, id] }))} style={chip('rgba(245,158,11,0.6)')}>
                              {courseText(byId.get(id))}{byId.get(id) ? ` (Y${byId.get(id)!.year} S${byId.get(id)!.semester})` : ''}
                            </button>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                        {chosen.map(id => (
                          <button key={id} onClick={() => setSel(p => ({ ...p, [key]: chosen.filter(x => x !== id) }))} style={chip('var(--gold)')}>
                            {courseText(byId.get(id))}{byId.get(id) ? ` (Y${byId.get(id)!.year} S${byId.get(id)!.semester})` : ''} ✕
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <select value="" onChange={e => { if (e.target.value) setSel(p => ({ ...p, [key]: [...chosen, e.target.value] })); }} style={{ ...selStyle, flex: '1 1 180px' }}>
                          <option value="">＋ add a course (any year)…</option>
                          {courseOptions(hit, exclude)}
                        </select>
                        <select value={curCat} onChange={e => setCat(p => ({ ...p, [item.id]: e.target.value }))} style={{ ...selStyle, flex: '0 1 150px' }} title="Changes the type of the file everywhere">
                          {!curCat && <option value="">— type —</option>}
                          {CATEGORY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </div>
                      {catChanged && <p style={{ fontSize: '0.64rem', color: '#eab308', marginBottom: 6 }}>Type will change to {CATEGORY_LABEL[curCat] ?? curCat} for the file everywhere.</p>}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => call(item, hit, 'share', chosen, catChanged ? curCat : undefined)} disabled={working || (chosen.length === 0 && !catChanged)}
                          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: '0.74rem', background: chosen.length || catChanged ? 'var(--gold)' : 'var(--border)', color: chosen.length || catChanged ? '#0a1020' : 'var(--text-muted)', cursor: working ? 'wait' : 'pointer' }}>
                          {working ? 'Working…' : chosen.length ? `Share with ${chosen.length} course${chosen.length !== 1 ? 's' : ''}` : 'Save type'}
                        </button>
                        <button onClick={() => dismiss(item, hit)} disabled={working}
                          style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.74rem', cursor: 'pointer' }}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {done.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <button onClick={() => setShowDone(s => !s)} style={{ background: 'none', border: 'none', color: '#22c55e', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                ✓ Shared ({done.length}) {showDone ? '▴' : '▾'}
              </button>
              {showDone && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {done.map(({ item, hit }) => {
                    const key = keyOf(item, hit);
                    return (
                      <div key={key} style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                        <p style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                        <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)', margin: '2px 0 6px' }}>
                          Shared with: {(hit.sharedWith ?? []).map(id => courseText(byId.get(id))).join(', ') || '—'}
                        </p>
                        <button onClick={() => call(item, hit, 'undo', hit.sharedWith ?? [])} disabled={busy === key}
                          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.45)', background: 'transparent', color: '#ef4444', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                          {busy === key ? 'Working…' : '↩ Undo share'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
