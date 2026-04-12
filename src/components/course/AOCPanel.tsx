'use client';
import { useState, useEffect } from 'react';
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
                // Auto-expand most recent year
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

    const byYear: Record<number, AOCItem[]> = {};
    items.forEach(item => {
        if (!byYear[item.year]) byYear[item.year] = [];
        byYear[item.year].push(item);
    });
    const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    if (loading) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading AOC...</p>;

    if (items.length === 0) return (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No Areas of Concentration uploaded yet for this course.
        </p>
    );

    return (
        <div className="space-y-2">
            {sortedYears.map(year => (
                <div key={year}>
                    <button
                        onClick={() => toggleYear(year)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--gold)' }}
                    >
                        <span>📅 AOC {year}</span>
                        <span>{expandedYears.has(year) ? '▲' : '▼'}</span>
                    </button>
                    {expandedYears.has(year) && (
                        <div className="mt-1 space-y-1 pl-2">
                            {byYear[year].map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => onStudy(`Explain this Area of Concentration from ${year}: "${item.topic}"`)}
                                    className="w-full text-left p-2 rounded-lg text-xs transition-all hover:border-yellow-400"
                                    style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                >
                                    🎯 {item.topic}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}