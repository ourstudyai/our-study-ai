'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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

    // Most recurrent first
    const byFrequency = [...questions].sort((a, b) => b.reoccurrenceCount - a.reoccurrenceCount);

    // Grouped by year, most recent first
    const byYear: Record<number, PastQuestion[]> = {};
    questions.forEach(q => {
        if (!byYear[q.examYear]) byYear[q.examYear] = [];
        byYear[q.examYear].push(q);
    });
    const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    if (loading) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading past questions...</p>;

    if (questions.length === 0) return (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No past questions uploaded yet for this course.
        </p>
    );

    return (
        <div>
            {/* Toggle view */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => setShowFrequent(true)}
                    className="text-xs px-2 py-1 rounded-lg transition-all"
                    style={{
                        background: showFrequent ? 'var(--gold)' : 'transparent',
                        color: showFrequent ? 'var(--navy)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                    }}
                >
                    🔥 Most Frequent
                </button>
                <button
                    onClick={() => setShowFrequent(false)}
                    className="text-xs px-2 py-1 rounded-lg transition-all"
                    style={{
                        background: !showFrequent ? 'var(--gold)' : 'transparent',
                        color: !showFrequent ? 'var(--navy)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                    }}
                >
                    📅 By Year
                </button>
            </div>

            {showFrequent ? (
                <div className="space-y-2">
                    {byFrequency.map(q => (
                        <button
                            key={q.id}
                            onClick={() => onStudy(`Study this past question from ${q.examYear}: "${q.questionText}"`)}
                            className="w-full text-left p-2.5 rounded-lg text-xs transition-all hover:border-yellow-400"
                            style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <span className="flex-1">{q.questionText}</span>
                                {q.reoccurrenceCount > 1 && (
                                    <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-bold"
                                        style={{ background: 'rgba(255,193,7,0.15)', color: 'var(--gold)' }}>
                                        ×{q.reoccurrenceCount}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{q.examYear}</p>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {sortedYears.map(year => (
                        <div key={year}>
                            <button
                                onClick={() => toggleYear(year)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--gold)' }}
                            >
                                <span>📅 {year}</span>
                                <span>{expandedYears.has(year) ? '▲' : '▼'}</span>
                            </button>
                            {expandedYears.has(year) && (
                                <div className="mt-1 space-y-1 pl-2">
                                    {byYear[year]
                                        .sort((a, b) => b.reoccurrenceCount - a.reoccurrenceCount)
                                        .map(q => (
                                            <button
                                                key={q.id}
                                                onClick={() => onStudy(`Study this past question from ${year}: "${q.questionText}"`)}
                                                className="w-full text-left p-2 rounded-lg text-xs transition-all"
                                                style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="flex-1">{q.questionText}</span>
                                                    {q.reoccurrenceCount > 1 && (
                                                        <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-bold"
                                                            style={{ background: 'rgba(255,193,7,0.15)', color: 'var(--gold)' }}>
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