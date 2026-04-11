'use client';

import { useState } from 'react';

export default function TopicsPanel({ courseId }: { courseId: string }) {
    const [question, setQuestion] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);

    const ask = async () => {
        if (!question.trim()) return;
        setLoading(true);
        setResponse('');
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: question, courseId, mode: 'topics' }),
        });
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            setResponse((prev) => prev + decoder.decode(value));
        }
        setLoading(false);
    };

    return (
        <div className="rounded-xl p-6" style={{ background: 'var(--navy-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>Topics</h2>
            <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about any topic in this course..."
                rows={3}
                className="w-full rounded p-3 text-sm mb-3 resize-none"
                style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <button
                onClick={ask}
                disabled={loading}
                className="px-6 py-2 rounded font-medium text-sm"
                style={{ background: 'var(--gold)', color: 'var(--navy)' }}
            >
                {loading ? 'Thinking...' : 'Ask AI'}
            </button>
            {response && (
                <div className="mt-4 p-4 rounded text-sm whitespace-pre-wrap"
                    style={{ background: 'var(--navy)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                    {response}
                </div>
            )}
        </div>
    );
}