'use client';

import { useEffect, useState } from 'react';
import { normalizeCategory } from '@/lib/categories';

// Round chevron: hollow and pointing right when closed, filled and pointing down when open.
export function Chevron({ open, size = 22 }: { open: boolean; size?: number }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '50%', border: '1px solid rgba(196,160,80,0.5)', color: 'var(--gold)', fontSize: size * 0.5, lineHeight: 1,
      transition: 'transform 0.18s ease, background 0.18s ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      background: open ? 'rgba(196,160,80,0.16)' : 'transparent',
    }}>▸</span>
  );
}

const ORDER = ['lecture_notes', 'student_notes', 'past_questions', 'aoc', 'syllabus', 'other'];
const PLURAL: Record<string, string> = {
  lecture_notes: 'Handouts', student_notes: "Student's Notes", past_questions: 'Past Questions',
  aoc: 'Areas of Concentration', syllabus: 'Syllabus', other: 'Other Materials',
};

// Handouts first, then Student's Notes, then the rest.
export function groupByCategory<T extends { category?: string | null }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const m of items) {
    const k = normalizeCategory(m.category) || 'other';
    const key = ORDER.includes(k) ? k : 'other';
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  return ORDER.filter(k => map.has(k)).map(k => ({ key: k, label: PLURAL[k], items: map.get(k)! }));
}

export type RailTarget = { id: string; key: string; label: string };

const num = (s: string, word: string) => {
  const v = s.replace(new RegExp(`^${word}\\s+`, 'i'), '');
  return /^\d+$/.test(v) ? v : '?';
};

// Slim vertical bar that stays on screen while you scroll: one chip per semester ("Y2" over "S1"),
// the shelf you are looking at is highlighted, tap a chip to jump there.
export function ShelfRail({ targets, onJump }: { targets: RailTarget[]; onJump: (t: RailTarget) => void }) {
  const [active, setActive] = useState('');

  useEffect(() => {
    if (!targets.length) return;
    const vis = new Map<string, boolean>();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => vis.set((e.target as HTMLElement).id, e.isIntersecting));
      const first = targets.find(t => vis.get(t.id));
      if (first) setActive(first.id);
    }, { rootMargin: '-12% 0px -70% 0px' });
    targets.forEach(t => { const el = document.getElementById(t.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [targets]);

  if (targets.length < 2) return null;

  const depts = Array.from(new Set(targets.map(t => t.key.split('|')[0])));
  const multi = depts.length > 1;

  return (
    <nav aria-label="Jump to a year and semester" style={{
      position: 'fixed', right: 4, top: '50%', transform: 'translateY(-50%)', zIndex: 40, width: 40,
      maxHeight: '72vh', overflowY: 'auto', padding: '6px 3px', borderRadius: 12,
      background: 'rgba(10,16,32,0.9)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
    }}>
      {depts.map(d => (
        <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {multi && (
            <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.12em', textAlign: 'center', color: 'var(--text-muted)', marginTop: 4 }}>
              {d.slice(0, 3).toUpperCase()}
            </span>
          )}
          {targets.filter(t => t.key.split('|')[0] === d).map(t => {
            const [, yr, sem] = t.key.split('|');
            const on = active === t.id;
            return (
              <button key={t.id} onClick={() => onJump(t)} title={t.label}
                style={{
                  padding: '4px 0', borderRadius: 8, cursor: 'pointer', lineHeight: 1.15,
                  border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`,
                  background: on ? 'rgba(196,160,80,0.22)' : 'transparent',
                  color: on ? 'var(--gold)' : 'var(--text-secondary)',
                }}>
                <span style={{ display: 'block', fontSize: '0.62rem', fontWeight: 800 }}>Y{num(yr, 'Year')}</span>
                <span style={{ display: 'block', fontSize: '0.54rem', fontWeight: 600, opacity: 0.85 }}>S{num(sem, 'Semester')}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
