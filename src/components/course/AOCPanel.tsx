'use client';
import { useState, useEffect } from 'react';
import MiniLoader from '@/components/MiniLoader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface AOCItem {
  id: string;
  topic: string;
  year: number;
  years: number[];
  semester: number;
  reoccurrenceCount: number;
  variations: string[];
  relatedTo: string[];
}

interface Props {
  courseId: string;
  onOpenViewer: (mode: 'aoc', data: any, relatedDocs?: any[]) => void;
}

export default function AOCPanel({ courseId, onOpenViewer }: Props) {
  const [items, setItems] = useState<AOCItem[]>([]);
  const [allItems, setAllItems] = useState<AOCItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [showFrequent, setShowFrequent] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'aoc'), where('courseId', '==', courseId)));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AOCItem[];
        setItems(data);
        setAllItems(data);
        if (data.length > 0) {
          const maxYear = Math.max(...data.map(i => i.year ?? 0));
          setExpandedYears(new Set([maxYear]));
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [courseId]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  };

  const getRelated = (item: AOCItem) =>
    (item.relatedTo ?? []).map(id => allItems.find(x => x.id === id)).filter(Boolean);

  const filtered = items.filter(i =>
    i.topic.toLowerCase().includes(search.toLowerCase())
  );

  const byYear: Record<number, AOCItem[]> = {};
  filtered.forEach(item => {
    const yr = item.year ?? 0;
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(item);
  });
  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const byFrequency = [...filtered].sort((a, b) => (b.reoccurrenceCount ?? 0) - (a.reoccurrenceCount ?? 0));

  const inp: React.CSSProperties = {
    width: '100%', borderRadius: '8px', padding: '6px 10px',
    fontSize: '0.75rem', background: 'var(--navy)',
    border: '1px solid var(--border)', color: 'var(--text-primary)',
    outline: 'none', marginBottom: '10px', boxSizing: 'border-box',
  };

  const ItemCard = ({ item }: { item: AOCItem }) => {
    const isTrending = (item.reoccurrenceCount ?? 0) > 1;
    return (
      <button
        onClick={() => onOpenViewer('aoc', item, getRelated(item) as any[])}
        style={{
          width: '100%', textAlign: 'left', padding: '10px', borderRadius: '10px',
          fontSize: '0.75rem', background: 'var(--navy-card)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', cursor: 'pointer', transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ flex: 1, lineHeight: '1.6' }}>🎯 {item.topic}</span>
          {isTrending && <span style={{ flexShrink: 0, fontSize: '0.68rem', color: '#f97316' }}>🔥</span>}
        </div>
      </button>
    );
  };

  if (loading) return <MiniLoader label="Loading AOC..." />;
  if (items.length === 0) return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🎯</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No Areas of Concentration uploaded yet.</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button onClick={() => setShowFrequent(false)} style={{ flex: 1, fontSize: '0.72rem', padding: '5px', borderRadius: '8px', background: !showFrequent ? 'var(--gold)' : 'transparent', color: !showFrequent ? 'var(--navy)' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          📅 By Year
        </button>
        <button onClick={() => setShowFrequent(true)} style={{ flex: 1, fontSize: '0.72rem', padding: '5px', borderRadius: '8px', background: showFrequent ? 'var(--gold)' : 'transparent', color: showFrequent ? 'var(--navy)' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          🔥 Trending
        </button>
      </div>
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search topics..." style={inp} />
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No topics match your search.</p>
      ) : showFrequent ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {byFrequency.map(item => <ItemCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sortedYears.map(year => (
            <div key={year}>
              <button onClick={() => toggleYear(year)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--gold)', cursor: 'pointer', marginBottom: '4px' }}>
                <span>📅 AOC {year}</span><span>{expandedYears.has(year) ? '▲' : '▼'}</span>
              </button>
              {expandedYears.has(year) && (
                <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {byYear[year].map(item => <ItemCard key={item.id} item={item} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
