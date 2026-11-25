'use client';

import InfoTip from '@/components/admin/InfoTip';

import { useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { courseLabel } from '@/lib/courseLabel';

type Row = { id: string; name: string; code?: string; shortName?: string; department?: string; year?: number; semester?: number };

// Short names are used in auto-generated material names and in downloads. Optional per course.
export default function CourseShortNames() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const snap = await getDocs(collection(db, 'courses'));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Row));
      list.sort((a, b) =>
        String(a.department ?? '').localeCompare(String(b.department ?? '')) ||
        (a.year ?? 0) - (b.year ?? 0) || (a.semester ?? 0) - (b.semester ?? 0) ||
        String(a.name).localeCompare(String(b.name)));
      setRows(list);
    } catch (e: any) { setErr('Could not load courses: ' + (e?.message ?? e)); }
  }

  async function save(r: Row) {
    const v = (draft[r.id] ?? '').trim();
    setBusy(r.id); setErr('');
    try {
      await updateDoc(doc(db, 'courses', r.id), { shortName: v });
      setRows(prev => (prev ?? []).map(x => (x.id === r.id ? { ...x, shortName: v } : x)));
      setDraft(d => { const n = { ...d }; delete n[r.id]; return n; });
    } catch (e: any) { setErr('Save failed: ' + (e?.message ?? e)); }
    finally { setBusy(''); }
  }

  const shown = (rows ?? []).filter(r => !q.trim() || (r.name + ' ' + (r.code ?? '') + ' ' + (r.shortName ?? '')).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={() => { setOpen(o => !o); if (!rows) load(); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
        🏷 Course short names {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <InfoTip
            todo="Search for a course, type a short name and tap Save. Leave it empty to use the automatic name."
            means={'The short name appears in file names like "Canon Law · Handout 2" and in downloads. Courses without one use their keywords automatically.'} />
          <p style={{ marginBottom: 8 }}>
            Used in names like "Patristics · Handout 3" and in download file names. Leave blank to use the course name (long names are abbreviated automatically).
          </p>
          {err && <p style={{ color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>{err}</p>}
          {!rows && !err && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
          {rows && (
            <>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginBottom: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.76rem' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {shown.map(r => {
                  const value = draft[r.id] ?? r.shortName ?? '';
                  const dirty = value.trim() !== (r.shortName ?? '').trim();
                  return (
                    <div key={r.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 9 }}>
                      <p style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 2 }}>{r.name}</p>
                      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
                        {[r.department, r.year ? `Year ${r.year}` : '', r.semester ? `Sem ${r.semester}` : '', r.code].filter(Boolean).join(' · ')}
                      </p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={value} maxLength={30} onChange={e => setDraft(d => ({ ...d, [r.id]: e.target.value }))}
                          placeholder={courseLabel({ ...r, shortName: '' })}
                          style={{ flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.76rem' }} />
                        {dirty && (
                          <button onClick={() => save(r)} disabled={busy === r.id}
                            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#0a1020', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>
                            {busy === r.id ? '…' : 'Save'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {shown.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No courses match.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
