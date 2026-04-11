'use client';

import { useState } from 'react';

export default function StudyMemoryPanel({ courseId }: { courseId: string }) {
    const [note, setNote] = useState('');
    const [saved, setSaved] = useState(false);

    const save = () => {
        if (!note.trim()) return;
        const key = `study-memory-${courseId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({ text: note, date: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(existing));
        setNote('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const memories = JSON.parse(localStorage.getItem(`study-memory-${courseId}`) || '[]');

    return (
        <div className="rounded-xl p-6" style={{ background: 'var(--navy-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>Study Memory</h2>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write a note to remember..."
                rows={3}
                className="w-full rounded p-3 text-sm mb-3 resize-none"
                style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <button
                onClick={save}
                className="px-6 py-2 rounded font-medium text-sm"
                style={{ background: 'var(--gold)', color: 'var(--navy)' }}
            >
                {saved ? 'Saved!' : 'Save Note'}
            </button>
            {memories.length > 0 && (
                <div className="mt-6 space-y-3">
                    {memories.reverse().map((m: any, i: number) => (
                        <div key={i} className="p-3 rounded text-sm"
                            style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                            <p>{m.text}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{new Date(m.date).toLocaleDateString()}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}