'use client';
import { useState, useEffect } from 'react';
import MiniLoader from '@/components/MiniLoader';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface AOCItem {
    id: string;
    topic: string;
    year: number;
    semester: number;
}

interface Props {
    courseId: string;
    onStudy: (text: string) => void;
}

export default function AOCPanel({ courseId, onStudy }: Props) {
    const [items, setItems] = useState<AOCItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetch = async () => {
            try {
                const q = query(
                    collection(db, 'aoc'),
                    where('courseId', '==', courseId)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AOCItem[];
                setItems(data);
                if (data.length > 0) {
                    const maxYear = Math.max(...data.map(i => i.year));
                    setExpandedYears(new Set([maxYear]));
                }
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

    const filtered = items.filter(i =>
        i.topic.toLowerCase().includes(search.toLowerCase())
    );

    const byYear: Record<number, AOCItem[]> = {};
    filtered.forEach(item => {
        if (!byYear[item.year]) byYear[item.year] = [];
        byYear[item.year].push(item);
    });
    const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    const inputStyle = {
        width: '100%', borderRadius: '8px', padding: '6px 10px',
        fontSize: '0.75rem', background: 'var(--navy)',
        border: '1px solid var(--border)', color: 'var(--text-primary)',
        outline: 'none', marginBottom: '10px',
    };

    if (loading) return <MiniLoader label="Loading AOC..." />;

    if (items.length === 0) return (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            No Areas of Concentration uploaded yet for this course.
        </p>
    );

    return (
        <div>
            {/* Search */}
            <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search areas of concentration..."
                style={inputStyle}
            />

            {filtered.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No topics match your search.</p>
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
                                <span>📅 AOC {year}</span>
                                <span>{expandedYears.has(year) ? '▲' : '▼'}</span>
                            </button>
                            {expandedYears.has(year) && (
                                <div style={{ marginTop: '4px', paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {byYear[year].map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => onStudy(`Explain this Area of Concentration from ${year}: "${item.topic}"`)}
                                            style={{
                                                width: '100%', textAlign: 'left', padding: '8px 10px',
                                                borderRadius: '8px', fontSize: '0.75rem',
                                                background: 'var(--navy-card)', border: '1px solid var(--border)',
                                                color: 'var(--text-primary)', cursor: 'pointer',
                                                transition: 'border-color 0.15s',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                        >
                                            🎯 {item.topic}
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