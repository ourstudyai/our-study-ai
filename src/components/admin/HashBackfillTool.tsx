'use client';

import { useState } from 'react';

interface DupGroup { count: number; items: { id: string; fileName: string; status: string }[]; }

// One-off tool: give older materials a file hash so duplicate detection also covers them.
export default function HashBackfillTool({ firebaseUser }: { firebaseUser: any }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ id: string; fileName: string; error: string }[]>([]);
  const [dups, setDups] = useState<DupGroup[]>([]);
  const [finished, setFinished] = useState(false);

  async function run() {
    setBusy(true); setFinished(false); setFailed([]); setProcessed(0);
    const skip: string[] = [];
    const failedAll: { id: string; fileName: string; error: string }[] = [];
    let total = 0, left = 1, guard = 0;
    try {
      await firebaseUser?.getIdToken(true);
      while (left > 0 && guard++ < 300) {
        const r = await fetch('/api/admin/backfill-hashes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ limit: 25, skipIds: skip }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { alert('Failed: ' + ((d as any).error || r.status)); break; }
        total += d.processed ?? 0;
        (d.failed ?? []).forEach((f: any) => { skip.push(f.id); failedAll.push(f); });
        left = d.remaining ?? 0;
        setProcessed(total); setRemaining(left); setFailed([...failedAll]); setDups(d.duplicates ?? []);
        if ((d.processed ?? 0) === 0 && !(d.failed ?? []).length) break;
      }
      setFinished(left === 0);
    } catch (e: any) { alert('Error: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
        🧬 Hash older files {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <p style={{ marginBottom: 10 }}>
            Computes a fingerprint for older materials that don't have one, so re-uploads of those files are recognised too. Nothing is deleted; identical files are only listed.
          </p>
          <button onClick={run} disabled={busy}
            style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--gold)', color: '#0a1020', fontWeight: 700, fontSize: '0.76rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? `Working… ${processed} done${remaining !== null ? `, ${remaining} left` : ''}` : 'Start'}
          </button>
          {(processed > 0 || finished) && !busy && (
            <p style={{ marginTop: 10, color: finished ? '#22c55e' : 'var(--gold)', fontWeight: 700 }}>
              {finished ? 'Finished.' : 'Stopped.'} {processed} file{processed !== 1 ? 's' : ''} hashed{failed.length ? `, ${failed.length} could not be read` : ''}.
            </p>
          )}
          {failed.length > 0 && failed.slice(0, 5).map(f => (
            <p key={f.id} style={{ color: '#eab308', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚠ {f.fileName}: {f.error}</p>
          ))}
          {dups.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{dups.length}{dups.length === 15 ? '+' : ''} group{dups.length !== 1 ? 's' : ''} of identical files</p>
              {dups.map((g, i) => (
                <p key={i} style={{ color: 'var(--text-muted)' }}>
                  {g.count}× {g.items.map(x => `${x.fileName} (${x.status})`).join(' · ')}
                </p>
              ))}
              <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>If one file belongs to two courses, keep one copy and share it to the other course.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
