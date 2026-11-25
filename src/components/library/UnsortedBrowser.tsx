'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chevron } from '@/components/library/shelfUi';

type Item = { id: string; name: string; dept: string | null; year: number | null; klass: string | null; size: number; mime: string; at: number; state: 'waiting' | 'processing' };

const GROUP_LIMIT = 40;
const cap = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : '');

export function LibraryTabs({ value, onChange }: { value: 'library' | 'unsorted'; onChange: (v: 'library' | 'unsorted') => void }) {
  const tab = (v: 'library' | 'unsorted', label: string) => (
    <button key={v} onClick={() => onChange(v)}
      style={{
        flex: 1, padding: '10px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
        fontFamily: 'Playfair Display, serif', letterSpacing: '0.06em',
        borderRadius: '10px', border: `1px solid ${value === v ? 'rgba(196,160,80,0.55)' : 'var(--border)'}`,
        background: value === v ? 'rgba(196,160,80,0.16)' : 'transparent',
        color: value === v ? 'var(--gold)' : 'var(--text-muted)',
      }}>
      {label}
    </button>
  );
  return <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>{tab('library', 'Library')}{tab('unsorted', 'Unsorted')}</div>;
}

export default function UnsortedBrowser({ firebaseUser }: { firebaseUser: any }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState('');
  const [dept, setDept] = useState('');
  const [year, setYear] = useState('');
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
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/unsorted', { headers: await authHeader(), credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setErr(`Could not load (HTTP ${r.status}): ${d.error ?? 'no details'}`); return; }
        setItems(d.items ?? []);
      } catch (e: any) { if (alive) setErr('Could not load: ' + (e?.message ?? e)); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  async function view(it: Item) {
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
      if (needle && !(i.name + ' ' + (i.klass ?? '')).toLowerCase().includes(needle)) return;
      const key = `${i.dept ?? 'unspecified'}|${i.year ?? 0}`;
      map.set(key, [...(map.get(key) ?? []), i]);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      const [da, ya] = a.split('|'); const [db, yb] = b.split('|');
      return da.localeCompare(db) || Number(ya) - Number(yb);
    });
  }, [items, dept, year, q]);

  const toggle = (k: string) => setShut(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const sel: React.CSSProperties = { background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '99px', padding: '5px 12px', color: 'var(--text-secondary)', fontSize: '0.75rem' };
  const pill = (strong: boolean): React.CSSProperties => ({ padding: '5px 12px', borderRadius: '99px', border: `1px solid ${strong ? 'rgba(196,160,80,0.4)' : 'var(--border)'}`, background: 'transparent', color: strong ? 'var(--gold)' : 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' });

  return (
    <div>
      <div style={{ padding: '12px 14px', marginBottom: '14px', borderRadius: '10px', border: '1px solid rgba(196,160,80,0.25)', background: 'rgba(196,160,80,0.06)', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--gold)' }}>Unverified.</b> These files were uploaded by students and have not been checked or sorted by admins yet.
        They may be mislabelled, and the AI does not use them until they are approved.
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
      </div>

      {groups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: 'auto' }}>Tap a heading to open or close it</span>
          <button onClick={() => setShut(new Set())} style={pill(true)}>Expand all</button>
          <button onClick={() => setShut(new Set(groups.map(([k]) => k)))} style={pill(false)}>Collapse all</button>
        </div>
      )}

      {err && <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.8rem' }}>{err}</p>}
      {!items && !err && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading unsorted files…</p>}
      {items && groups.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nothing here{(dept || year || q) ? ' matches your filters' : ' right now'}.</p>}

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
                {list.slice(0, shown).map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
                    <button onClick={() => view(it)} disabled={busyId === it.id}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--navy-card)', cursor: 'pointer' }}>
                      <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, wordBreak: 'break-word' }}>{it.name}</span>
                      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '3px' }}>
                        {[it.klass ? `Class: ${it.klass}` : '', it.state === 'processing' ? 'Sorted, being processed' : 'Awaiting sorting', fmtSize(it.size), it.at ? new Date(it.at).toLocaleDateString() : ''].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    <button onClick={() => download(it)} disabled={busyId === it.id} title="Download" aria-label={`Download ${it.name}`}
                      style={{ width: '46px', flexShrink: 0, borderRadius: '10px', border: '1px solid rgba(196,160,80,0.35)', background: 'rgba(196,160,80,0.08)', color: 'var(--gold)', cursor: 'pointer', fontSize: '1rem', opacity: busyId === it.id ? 0.5 : 1 }}>
                      {busyId === it.id ? '…' : '⬇'}
                    </button>
                  </div>
                ))}
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
