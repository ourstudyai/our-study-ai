'use client';

import { authFetch } from '@/lib/auth/authFetch';

import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

type Hit = { uid: string; email: string; dept: string | null; year: number | null; courseId: string | null; courseName: string | null; at: string };
type Item = { id: string; name: string; status: string; hits: Hit[] };
type Course = { id: string; name: string; code?: string };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Files someone tried to upload again. The upload was skipped (same file already exists);
// this shows who wanted it and for which course, with one tap to share it there.
export default function DuplicateHits({ courses, firebaseUser }: { courses: Course[]; firebaseUser: any }) {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'materials'), where('hasDuplicateHits', '==', true)));
    setItems(snap.docs.map(d => {
      const m: any = d.data();
      return { id: d.id, name: m.indexDisplayName || m.fileName || d.id, status: String(m.status ?? ''), hits: Array.isArray(m.duplicateHits) ? m.duplicateHits : [] };
    }).filter(i => i.hits.length > 0));
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  async function dismiss(item: Item, hit: Hit) {
    const left = item.hits.filter(h => !(h.uid === hit.uid && h.at === hit.at));
    await updateDoc(doc(db, 'materials', item.id), { duplicateHits: left, hasDuplicateHits: left.length > 0 });
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, hits: left } : i)).filter(i => i.hits.length > 0));
  }

  async function share(item: Item, hit: Hit) {
    if (!hit.courseId) return;
    setBusy(item.id + hit.at);
    try {
      const idToken = await firebaseUser?.getIdToken(true);
      const res = await authFetch('/api/reassign-material', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: item.id, courseId: hit.courseId, courseName: hit.courseName, mode: 'extra', idToken }),
      });
      if (!res.ok) { alert('Could not share: ' + res.status); return; }
      await dismiss(item, hit);
    } catch (e: any) { alert('Error: ' + (e?.message ?? e)); }
    finally { setBusy(''); }
  }

  if (items.length === 0) return null;
  const total = items.reduce((n, i) => n + i.hits.length, 0);

  return (
    <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
        🔁 Re-uploads of existing files ({total}) {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            These files already exist, so the new upload was skipped. If a student asked for a specific course, you can share the existing file there.
          </p>
          {items.map(item => (
            <div key={item.id} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {item.status.replace(/_/g, ' ')}</span>
              </p>
              {item.hits.map(hit => {
                const live = !!hit.courseId && courses.some(c => c.id === hit.courseId);
                return (
                  <div key={hit.uid + hit.at} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 140, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {hit.email} · {hit.dept ? cap(hit.dept) : ''}{hit.year ? ` Year ${hit.year}` : ''}
                      {hit.courseName ? ` · wants: ${hit.courseName}${live ? '' : ' (not live)'}` : ''}
                    </span>
                    {live && (
                      <button onClick={() => share(item, hit)} disabled={busy === item.id + hit.at}
                        style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#0a1020', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>
                        Share to course
                      </button>
                    )}
                    <button onClick={() => dismiss(item, hit)}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}>
                      Dismiss
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
