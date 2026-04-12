'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
            body: JSON.stringify({ message: question, courseId, mode: 'plain_explainer' }),
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.slice(6));
                        if (json.type === 'text' && json.content) {
                            setResponse((prev) => prev + json.content);
                        }
                    } catch { }
                }
            }
        }
        setLoading(false);
    };

    return (
        <div className="rounded-xl p-6" style={{ background: 'var(--navy-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>Topics</h2>
            <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
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
                <div className="mt-6 p-4 rounded text-sm"
                    style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: '1.8' }}>
                    <ReactMarkdown
                        components={{
                            h1: ({ children }) => <h1 style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{children}</h1>,
                            h2: ({ children }) => <h2 style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.4rem', marginTop: '1rem' }}>{children}</h2>,
                            h3: ({ children }) => <h3 style={{ color: 'var(--gold)', fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.3rem', marginTop: '0.8rem' }}>{children}</h3>,
                            p: ({ children }) => <p style={{ marginBottom: '0.8rem' }}>{children}</p>,
                            strong: ({ children }) => <strong style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{children}</strong>,
                            em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{children}</em>,
                            ul: ({ children }) => <ul style={{ paddingLeft: '1.5rem', marginBottom: '0.8rem', listStyleType: 'disc' }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ paddingLeft: '1.5rem', marginBottom: '0.8rem', listStyleType: 'decimal' }}>{children}</ol>,
                            li: ({ children }) => <li style={{ marginBottom: '0.3rem' }}>{children}</li>,
                            blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--gold)', paddingLeft: '1rem', margin: '0.8rem 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{children}</blockquote>,
                            code: ({ children }) => <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.85em' }}>{children}</code>,
                        }}
                    >
                        {response}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}