'use client';

import { useState } from 'react';

export default function HelpModal() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-10 h-10 rounded-full text-sm font-bold shadow-lg z-50"
                style={{ background: 'var(--gold)', color: 'var(--navy)' }}
            >
                ?
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="rounded-xl p-8 max-w-md w-full mx-4"
                        style={{ background: 'var(--navy-card)', border: '1px solid var(--border)' }}>
                        <h2 className="text-2xl font-bold mb-4"
                            style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
                            Help
                        </h2>
                        <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <li>📚 <strong style={{ color: 'var(--text-primary)' }}>Topics</strong> — Browse and study course topics with AI assistance.</li>
                            <li>📝 <strong style={{ color: 'var(--text-primary)' }}>Past Questions</strong> — Practice with past exam questions.</li>
                            <li>🎯 <strong style={{ color: 'var(--text-primary)' }}>AOC</strong> — Areas of concern to focus your revision.</li>
                            <li>🧠 <strong style={{ color: 'var(--text-primary)' }}>Study Memory</strong> — Your personal study notes and memory bank.</li>
                        </ul>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="mt-6 w-full py-2 rounded font-medium"
                            style={{ background: 'var(--gold)', color: 'var(--navy)' }}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}