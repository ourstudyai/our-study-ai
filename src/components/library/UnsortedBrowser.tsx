'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chevron } from '@/components/library/shelfUi';

type State = 'waiting' | 'processing' | 'library' | 'removed';
type Item = { id: string; name: string; dept: string | null; year: number | null; klass: string | null; size: number; mime: string; at: number; state: State };
type View = 'library' | 'unsorted' | 'all';

const GROUP_LIMIT = 40;
const cap = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : 'size unknown');

const STATE_INFO: Record<State, { label: string; color: string }> = {
  waiting: { label: 'Unsorted', color: '#eab308' },
  processing: { label: 'Sorted, being processed', color: '#60a5fa' },
  library: { label: 'In the Library', color: '#22c55e' },
  removed: { label: 'Removed from Library (admins only)', color: '#ef4444' },
};

export function LibraryTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const tab = (v: View, label: string) => (
    <button key={v} onClick={() => onChange(v)}
      style={{
        flex: 1, padding: '10px 8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
        fontFamily: 'Playfair Display, serif', letterSpacing: '0.05em',
        borderRadius: '10px', border: `1px solid ${value === v ? 'rgba(196,160,80,0.55)' : 'var(--border)'}`,
        background: value === v ? 'rgba(196,160,80,0.16)' : 'transparent',
        color: value === v ? 'var(--gold)' : 'var(--text-muted)',
      }}>
      {label}
    </button>
  );
  return <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>{tab('library', 'Library')}{tab('unsorted', 'Unsorted')}{tab('all', 'All files')}</div>;
}

export default function UnsortedBrowser({ firebaseUser, mode = 'unsorted', onOpenLibrary }: { firebaseUser: any; mode?: 'unsorted' | 'all'; onOpenLibrary?: (id: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
  const [stateF, setStateF] = useState('');
  const [q, setQ] = useState('');
  const [more, setMore] = useState<Record<string, number>>({});
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState('');

  async function authHeader(): Promise<Record<string, string>> {
    try {
      const t = await firebaseUser?.getIdToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    } catch { return {}; }
  }

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get('q');
    if (qp) setQ(qp);
  }, []);

  useEffect(() => {
    let alive = true;
    setItems(null); setErr(''); setStateF('');
    (async () => {
      try {
        const r = await fetch(`/api/unsorted${mode === 'all' ? '?scope=all' : ''}`, { headers: await authHeader(), credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setErr(`Could not load (HTTP ${r.status}): ${d.error ?? 'no details'}`); return; }
        setItems(d.items ?? []);
        setAdmin(!!d.admin);
      } catch (e: any) { if (alive) setErr('Could not load: ' + (e?.message ?? e)); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, mode]);

  async function view(it: Item) {
    if (it.state === 'library') { onOpenLibrary?.(it.id); return; }
    setBusyId(it.id);
    const w = window.open('', '_blank');   // opened first so phone browsers do not block it
    try {
      const r = await fetch(`/api/unsorted?id=${encodeURIComponent(it.id)}`, { headers: await authHeader(), credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { if (w) w.close(); alert(d.error ?? 'Could not open this file.'); return; }
      if (w) w.location.href = d.url; else window.location.href = d.url;
    } catch (e: any) { if (w) w.close(); alert('Could not open: ' + (e?.message ?? e)); }
    finally { setBusyId(''); }
  }

  async function download(it: Item) {
    setBusyId(it.id);
    try {
      const r = await fetch(`/api/unsorted?id=${encodeURIComponent(it.id)}&download=1`, { headers: await authHeader(), credentials: 'include' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? `Download failed (HTTP ${r.status}).`); return; }
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') ?? '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const name = m ? decodeURIComponent(m[1]) : it.name;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e: any) { alert('Download failed: ' + (e?.message ?? e)); }
    finally { setBusyId(''); }
  }

  const depts = useMemo(() => Array.from(new Set((items ?? []).map(i => i.dept).filter(Boolean) as string[])).sort(), [items]);
  const years = useMemo(() => Array.from(new Set((items ?? []).map(i => i.year).filter(Boolean) as number[])).sort((a, b) => a - b), [items]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Item[]>();
    (items ?? []).forEach(i => {
      if (dept && i.dept !== dept) return;
      if (year && String(i.year) !== year) return;
      if (stateF && i.state !== stateF) return;
      if (needle && !(i.name + ' ' + (i.klass ?? '')).toLowerCase().includes(needle)) return;
      const key = `${i.dept ?? 'unspecified'}|${i.year ?? 0}`;
      map.set(key, [...(map.get(key) ?? []), i]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      const [da, ya] = a.split('|'); const [db, yb] = b.split('|');
      return da.localeCompare(db) || Number(ya) - Number(yb);
    });
  }, [items, dept, year, stateF, q]);

  const toggle = (k: string) => setShut(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const sel: React.CSSProperties = { background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '99px', padding: '5px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem' };
  const pill = (strong: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: '99px', border: `1px solid ${strong ? 'rgba(196,160,80,0.4)' : 'var(--border)'}`, background: 'transparent', color: strong ? 'var(--gold)' : 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' });

  return (
    <div>
      <div style={{ padding: '12px 14px', marginBottom: '14px', borderRadius: '10px', border: '1px solid rgba(196,160,80,0.25)', background: 'rgba(196,160,80,0.06)', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {mode === 'all' ? (
          <><b style={{ color: 'var(--gold)' }}>Every file on the platform.</b> Files marked "In the Library" are checked and sorted. The rest are uploaded by students and unverified: they may be mislabelled, and the AI does not use them until they are approved.</>
        ) : (
          <><b style={{ color: 'var(--gold)' }}>Unverified.</b> These files were uploaded by students and have not been checked or sorted by admins yet. They may be mislabelled, and the AI does not use them until they are approved.</>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search file name or class"
          style={{ ...sel, borderRadius: '10px', flex: '1 1 180px', minWidth: 0 }} />
        <select value={dept} onChange={e => setDept(e.target.value)} style={sel}>
          <option value="">All depts</option>
          {depts.map(d => <option key={d} value={d}>{cap(d)}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={sel}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={String(y)}>Year {y}</option>)}
        </select>
        {mode === 'all' && (
          <select value={stateF} onChange={e => setStateF(e.target.value)} style={sel}>
            <option value="">Any status</option>
            <option value="library">In the Library</option>
            <option value="waiting">Unsorted</option>
            <option value="processing">Being processed</option>
            {admin && <option value="removed">Removed from Library</option>}
          </select>
        )}
      </div>

      {groups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: 'auto' }}>Tap a heading to open or close it</span>
          <button onClick={() => setShut(new Set())} style={pill(true)}>Expand all</button>
          <button onClick={() => setShut(new Set(groups.map(([k]) => k)))} style={pill(false)}>Collapse all</button>
        </div>
      )}

      {err && <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.8rem' }}>{err}</p>}
      {!items && !err && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading files…</p>}
      {items && groups.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nothing here{(dept || year || q || stateF) ? ' matches your filters' : ' right now'}.</p>}

      {groups.map(([key, list]) => {
        const [d, y] = key.split('|');
        const closed = shut.has(key);
        const shown = more[key] ?? GROUP_LIMIT;
        return (
          <div key={key} style={{ marginBottom: '18px' }}>
            <button onClick={() => toggle(key)} aria-expanded={!closed}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '10px', padding: '11px 14px', background: 'linear-gradient(90deg, rgba(196,160,80,0.18), rgba(196,160,80,0.03))', border: 'none', borderLeft: '4px solid var(--gold)', borderRadius: '0 10px 10px 0' }}>
              <Chevron open={!closed} size={24} />
              <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--gold)', flex: 1 }}>
                {d === 'unspecified' ? 'Department not specified' : cap(d)}{Number(y) ? ` · Year ${y}` : ''}
              </span>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{list.length} file{list.length !== 1 ? 's' : ''}</span>
            </button>
            {!closed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {list.slice(0, shown).map(it => {
                  const info = STATE_INFO[it.state];
                  const isLib = it.state === 'library';
                  return (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
                      <button onClick={() => view(it)} disabled={busyId === it.id}
                        style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--navy-card)', cursor: 'pointer' }}>
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, wordBreak: 'break-word' }}>{it.name}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: info.color, fontWeight: 700 }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: info.color }} />{info.label}
                          </span>
                          <span>· {fmtSize(it.size)}</span>
                          {it.klass && <span>· {it.klass}</span>}
                          {it.at ? <span>· {new Date(it.at).toLocaleDateString()}</span> : null}
                        </span>
                      </button>
                      {isLib ? (
                        <button onClick={() => onOpenLibrary?.(it.id)} title="Open in the Library"
                          style={{ width: '64px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>
                          Open in Library
                        </button>
                      ) : (
                        <button onClick={() => download(it)} disabled={busyId === it.id} title="Download" aria-label={`Download ${it.name}`}
                          style={{ width: '46px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(196,160,80,0.35)', background: 'rgba(196,160,80,0.08)', color: 'var(--gold)', cursor: 'pointer', fontSize: '1rem', opacity: busyId === it.id ? 0.5 : 1 }}>
                          {busyId === it.id ? '…' : '⬇'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {list.length > shown && (
                  <button onClick={() => setMore(o => ({ ...o, [key]: shown + GROUP_LIMIT }))}
                    style={{ padding: '8px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.74rem', cursor: 'pointer' }}>
                    Show more ({list.length - shown} left)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
