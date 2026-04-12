'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function AOCPanel({ courseId }: { courseId: string }) {
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = async () => {
        setLoading(true);
        setResponse('');

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'List all the Areas of Concentration for this course. Show them clearly with any relevant details from the uploaded AOC materials.',
                courseId,
                mode: 'plain_explainer',
            }),
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
        setLoaded(true);
    };

    return (
        <div>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
                🎯 Areas of Concentration
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Topics likely to appear in the exam based on uploaded AOC materials.
            </p>

            {!loaded && (
                <button
                    onClick={load}
                    disabled={loading}
                    className="w-full py-2 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'var(--gold)', color: 'var(--navy)' }}
                >
                    {loading ? 'Loading AOC...' : 'Load Areas of Concentration'}
                </button>
            )}

            {response && (
                <div className="text-xs" style={{ color: 'var(--text-primary)', lineHeight: '1.7' }}>
                    <ReactMarkdown
                        components={{
                            h1: ({ children }) => <h1 style={{ color: 'var(--gold)', fontWeight: 'bold', marginBottom: '0.4rem' }}>{children}</h1>,
                            h2: ({ children }) => <h2 style={{ color: 'var(--gold)', fontWeight: 'bold', marginBottom: '0.3rem', marginTop: '0.8rem' }}>{children}</h2>,
                            h3: ({ children }) => <h3 style={{ color: 'var(--gold)', fontWeight: 'bold', marginBottom: '0.2rem', marginTop: '0.6rem' }}>{children}</h3>,
                            p: ({ children }) => <p style={{ marginBottom: '0.6rem' }}>{children}</p>,
                            strong: ({ children }) => <strong style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{children}</strong>,
                            em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                            ul: ({ children }) => <ul style={{ paddingLeft: '1rem', marginBottom: '0.6rem', listStyleType: 'disc' }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ paddingLeft: '1rem', marginBottom: '0.6rem', listStyleType: 'decimal' }}>{children}</ol>,
                            li: ({ children }) => <li style={{ marginBottom: '0.2rem' }}>{children}</li>,
                        }}
                    >
                        {response}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}