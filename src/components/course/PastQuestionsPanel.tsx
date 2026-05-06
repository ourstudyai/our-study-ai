'use client';
import { useState, useEffect } from 'react';
import MiniLoader from '@/components/MiniLoader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface PastQuestion {
  id: string;
  questionText: string;
  years: number[];
  examYear: number;
  topic: string;
  reoccurrenceCount: number;
  variations: string[];
  relatedTo: string[];
}

interface Props {
  courseId: string;
  onOpenViewer: (mode: 'past-questions', data: any, relatedDocs?: any[]) => void;
}

export default function PastQuestionsPanel({ courseId, onOpenViewer }: Props) {
  const [questions, setQuestions] = useState<PastQuestion[]>([]);
  const [allQuestions, setAllQuestions] = useState<PastQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [showFrequent, setShowFrequent] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'past_questions'), where('courseId', '==', courseId)));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as PastQuestion[];
        setQuestions(data);
        setAllQuestions(data);
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

  const getRelated = (q: PastQuestion) =>
    (q.relatedTo ?? []).map(id => allQuestions.find(x => x.id === id)).filter(Boolean);

  const filtered = questions.filter(q =>
    q.questionText.toLowerCase().includes(search.toLowerCase()) ||
    (q.topic || '').toLowerCase().includes(search.toLowerCase())
  );

  const byFrequency = [...filtered].sort((a, b) => b.reoccurrenceCount - a.reoccurrenceCount);

  const byYear: Record<number, PastQuestion[]> = {};
  filtered.forEach(q => {
    const years = q.years ?? (q.examYear ? [q.examYear] : [0]);
    const yr = Math.max(...years);
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(q);
  });
  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  const inp: React.CSSProperties = {
    width: '100%', borderRadius: '8px', padding: '6px 10px',
    fontSize: '0.75rem', background: 'var(--navy)',
    border: '1px solid var(--border)', color: 'var(--text-primary)',
    outline: 'none', marginBottom: '10px', boxSizing: 'border-box',
  };

  const QCard = ({ q }: { q: PastQuestion }) => {
    const years = q.years ?? (q.examYear ? [q.examYear] : []);
    const hasRelated = (q.relatedTo ?? []).length > 0;
    return (
      <button
        onClick={() => onOpenViewer('past-questions', q, getRelated(q) as any[])}
        style={{
          width: '100%', textAlign: 'left', padding: '10px', borderRadius: '10px',
          fontSize: '0.75rem', background: 'var(--navy)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', cursor: 'pointer', transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
          <span style={{ flex: 1, lineHeight: '1.6' }}>{q.questionText}</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
            {q.reoccurrenceCount > 1 && (
              <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '20px', fontWeight: 700, background: 'rgba(255,193,7,0.15)', color: 'var(--gold)' }}>
                ×{q.reoccurrenceCount}
              </span>
            )}
            {hasRelated && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🔗</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {years.map(y => (
            <span key={y} style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: '20px', background: 'rgba(196,160,80,0.1)', color: 'var(--gold)', border: '1px solid rgba(196,160,80,0.2)' }}>
              {y}
            </span>
          ))}
        </div>
      </button>
    );
  };

  if (loading) return <MiniLoader label="Loading past questions..." />;
  if (questions.length === 0) return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🗒</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No past questions uploaded yet for this course.</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button onClick={() => setShowFrequent(true)} style={{ flex: 1, fontSize: '0.72rem', padding: '5px', borderRadius: '8px', background: showFrequent ? 'var(--gold)' : 'transparent', color: showFrequent ? 'var(--navy)' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          🔥 Most Frequent
        </button>
        <button onClick={() => setShowFrequent(false)} style={{ flex: 1, fontSize: '0.72rem', padding: '5px', borderRadius: '8px', background: !showFrequent ? 'var(--gold)' : 'transparent', color: !showFrequent ? 'var(--navy)' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          📅 By Year
        </button>
      </div>
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search questions..." style={inp} />
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No questions match your search.</p>
      ) : showFrequent ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {byFrequency.map(q => <QCard key={q.id} q={q} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sortedYears.map(year => (
            <div key={year}>
              <button onClick={() => toggleYear(year)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--gold)', cursor: 'pointer', marginBottom: '4px' }}>
                <span>📅 {year}</span><span>{expandedYears.has(year) ? '▲' : '▼'}</span>
              </button>
              {expandedYears.has(year) && (
                <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {byYear[year].sort((a, b) => b.reoccurrenceCount - a.reoccurrenceCount).map(q => <QCard key={q.id} q={q} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
