'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface PastQuestion {
    id: string;
    questionText: string;
    examYear: number;
    topic: string;
    reoccurrenceCount: number;
}

interface Props {
    courseId: string;
    onStudy: (text: string) => void;
}

export default function PastQuestionsPanel({ courseId, onStudy }: Props) {
    const [questions, setQuestions] = useState<PastQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
    const [showFrequent, setShowFrequent] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetch = async () => {
            try {
                const q = query(
                    collection(db, 'past_questions'),
                    where('courseId', '==', courseId)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as PastQuestion[];
                setQuestions(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [courseId]);

    const toggleYear = (year: number) => {
        setExpandedYears(prev => {
            const next = new Set(prev);
            next.has(year) ? next.delete(year) : next.add(year);
            return next;
        });
    };

    const filtered = questions.filter(q =>
        q.questionText.toLowerCase().includes(search.toLowerCase()) ||
        (q.topic || '').toLowerCase().includes(search.toLowerCase())
    );

    const byFrequency = [...filtered].sort((a, b) => b.reoccurrenceCount - a.reoccurrenceCount);

    const byYear: Record<number, PastQuestion[]> = {};
    filtered.forEach(q => {
        if (!byYear[q.examYear]) byYear[q.examYear] = [];
        byYear[q.examYear].push(q);
    });
    const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    const inputStyle = {
        width: '100%', borderRadius: '8px', padding: '6px 10px',
        fontSize: '0.75rem', background: 'var(--navy)',
        border: '1px solid var(--border)', color: 'var(--text-primary)',
        outline: 'none', marginBottom: '10px',
    };

    const qCardStyle = {
        width: '100%', textAlign: 'left' as const,
        padding: '10px', borderRadius: '10px', fontSize: '0.75rem',
        background: 'var(--navy)', border: '1px solid var(--border)',
        color: 'var(--text-primary)', cursor: 'pointer',
        transition: 'border-color 0.15s',
    };

    if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Loading past questions...</p>;

    if (questions.length === 0) return (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            No past questions uploaded yet for this course.
        </p>
    );

    return (
        <div>
            {/* Toggle */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <button
                    onClick={() => setShowFrequent(true)}
                    style={{
                        flex: 1, fontSize: '0.72rem', padding: '5px', borderRadius: '8px',
                        background: showFrequent ? 'var(--gold)' : 'transparent',
                        color: showFrequent ? 'var(--ink)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                >
                    🔥 Most Frequent
                </button>
                <button
                    onClick={() => setShowFrequent(false)}
                    style={{
                        flex: 1, fontSize: '0.72rem', padding: '5px', borderRadius: '8px',
                        background: !showFrequent ? 'var(--gold)' : 'transparent',
                        color: !showFrequent ? 'var(--ink)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                >
                    📅 By Year
                </button>
            </div>

            {/* Search */}
            <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search questions or topics..."
                style={inputStyle}
            />

            {filtered.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No questions match your search.</p>
            ) : showFrequent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {byFrequency.map(q => (
                        <button
                            key={q.id}
                            onClick={() => onStudy(`Study this past question from ${q.examYear}: "${q.questionText}"`)}
                            style={qCardStyle}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ flex: 1, lineHeight: '1.6' }}>{q.questionText}</span>
                                {q.reoccurrenceCount > 1 && (
                                    <span style={{ flexShrink: 0, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '20px', fontWeight: 700, background: 'rgba(255,193,7,0.15)', color: 'var(--gold)' }}>
                                        ×{q.reoccurrenceCount}
                                    </span>
                                )}
                            </div>
                            <p style={{ marginTop: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{q.examYear}</p>
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sortedYears.map(year => (
                        <div key={year}>
                            <button
                                onClick={() => toggleYear(year)}
                                style={{
                                    width: '100%', display: 'flex', justifyContent: 'space-between',
                                    padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
                                    background: 'var(--navy)', border: '1px solid var(--border)',
                                    color: 'var(--gold)', cursor: 'pointer',
                                }}
                            >
                                <span>📅 {year}</span>
                                <span>{expandedYears.has(year) ? '▲' : '▼'}</span>
                            </button>
                            {expandedYears.has(year) && (
                                <div style={{ marginTop: '4px', paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {byYear[year]
                                        .sort((a, b) => b.reoccurrenceCount - a.reoccurrenceCount)
                                        .map(q => (
                                            <button
                                                key={q.id}
                                                onClick={() => onStudy(`Study this past question from ${year}: "${q.questionText}"`)}
                                                style={{ ...qCardStyle, background: 'var(--navy-card)' }}
                                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                    <span style={{ flex: 1, lineHeight: '1.6' }}>{q.questionText}</span>
                                                    {q.reoccurrenceCount > 1 && (
                                                        <span style={{ flexShrink: 0, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '20px', fontWeight: 700, background: 'rgba(255,193,7,0.15)', color: 'var(--gold)' }}>
                                                            ×{q.reoccurrenceCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}