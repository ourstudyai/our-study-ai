'use client';

import { useState, type CSSProperties } from 'react';
import InfoTip from '@/components/admin/InfoTip';
import { authFetch } from '@/lib/auth/authFetch';
import { CATEGORY_LABEL } from '@/lib/categories';

type Item = { id: string; name: string; from: string; to: string; status: string };
type Preview = { total: number; items: Item[]; more: number };

// Lists sorted/approved files whose title clearly says one type but that are tagged as another, and fixes the ones you tick.
export default function CategoryCheck({ firebaseUser }: { firebaseUser: any }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ applied: number; qdrantFailed: number } | null>(null);
  const [err, setErr] = useState('');

  const label = (k: string) => CATEGORY_LABEL[k] ?? (k === 'none' ? 'no type' : k);

  async function call(apply: boolean) {
    setBusy(true); setErr('');
    try {
      await firebaseUser?.getIdToken(true);
      const r = await authFetch('/api/admin/category-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apply ? { apply: true, ids: Array.from(picked) } : { apply: false }),
      });
      const d: any = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(`Failed (HTTP ${r.status}): ${d.error || 'no details'}`); return; }
      if (apply) { setDone({ applied: d.applied ?? 0, qdrantFailed: d.qdrantFailed ?? 0 }); setPreview(null); }
      else { setPreview(d as Preview); setPicked(new Set((d.items ?? []).map((i: Item) => i.id))); setDone(null); }
    } catch (e: any) { setErr('Error: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  const toggle = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const btn = (primary: boolean, enabled = true): CSSProperties => ({
    padding: '8px 14px', borderRadius: 9, border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--gold)' : 'transparent', color: primary ? '#0a1020' : 'var(--text-secondary)',
    fontWeight: 700, fontSize: '0.76rem', cursor: enabled && !busy ? 'pointer' : 'not-allowed', opacity: enabled && !busy ? 1 : 0.6,
  });

  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
        🔎 Check types (Handout / Past Questions…) {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <InfoTip
            todo="Tap Preview. Untick any you disagree with, then tap Fix ticked."
            means="Lists files already sorted or approved whose own title clearly says a different type, for example 'Ethics past questions 2019.pdf' tagged Handout. Only explicit title phrases count, never 'notes' or 'exam' alone. Fixing also renames the auto-generated name (Handout 3 becomes Past Questions 2) and updates the type the AI search uses. Nothing is deleted." />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => call(false)} disabled={busy} style={btn(false)}>{busy ? 'Working…' : 'Preview'}</button>
            {preview && preview.items.length > 0 && <button onClick={() => call(true)} disabled={busy || picked.size === 0} style={btn(true, picked.size > 0)}>Fix ticked ({picked.size})</button>}
          </div>
          {err && <p style={{ marginTop: 10, color: '#ef4444', fontWeight: 700 }}>{err}</p>}
          {preview && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 700, color: preview.total ? 'var(--gold)' : '#22c55e' }}>
                {preview.total ? `${preview.total} file${preview.total !== 1 ? 's' : ''} look mis-tagged.` : 'No mis-tagged files found.'}
              </p>
              {preview.items.map(i => (
                <label key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} style={{ marginTop: 3 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{label(i.from)} → <b style={{ color: 'var(--gold)' }}>{label(i.to)}</b> · {i.status}</span>
                  </span>
                </label>
              ))}
              {preview.more > 0 && <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>…and {preview.more} more. Fix these, then Preview again.</p>}
            </div>
          )}
          {done && (
            <p style={{ marginTop: 10, color: '#22c55e', fontWeight: 700 }}>
              Done. {done.applied} file{done.applied !== 1 ? 's' : ''} fixed.{done.qdrantFailed ? <span style={{ color: '#eab308' }}> {done.qdrantFailed} could not update AI search; run Preview again later.</span> : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
