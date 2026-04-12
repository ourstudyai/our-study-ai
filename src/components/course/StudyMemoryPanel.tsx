'use client';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/components/auth/AuthProvider';

interface Note {
    id: string;
    text: string;
    createdAt: string;
}

interface Props {
    courseId: string;
    chatHistory: { role: string; content: string; timestamp: string }[];
}

export default function StudyMemoryPanel({ courseId, chatHistory }: Props) {
    const { firebaseUser } = useAuth();
    const [notes, setNotes] = useState<Note[]>([]);
    const [newNote, setNewNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [activeSection, setActiveSection] = useState<'notes' | 'history'>('notes');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!firebaseUser) return;
        const fetchNotes = async () => {
            try {
                const q = query(
                    collection(db, 'notes'),
                    where('courseId', '==', courseId),
                    where('userId', '==', firebaseUser.uid),
                    orderBy('createdAt', 'desc')
                );
                const snap = await getDocs(q);
                setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Note[]);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchNotes();
    }, [courseId, firebaseUser]);

    const saveNote = async () => {
        if (!newNote.trim() || !firebaseUser) return;
        setSaving(true);
        try {
            const docRef = await addDoc(collection(db, 'notes'), {
                courseId,
                userId: firebaseUser.uid,
                text: newNote.trim(),
                createdAt: new Date().toISOString(),
            });
            setNotes(prev => [{ id: docRef.id, text: newNote.trim(), createdAt: new Date().toISOString() }, ...prev]);
            setNewNote('');
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const deleteNote = async (noteId: string) => {
        try {
            await deleteDoc(doc(db, 'notes', noteId));
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div>
            {/* Section toggle */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => setActiveSection('notes')}
                    className="flex-1 text-xs py-1.5 rounded-lg transition-all"
                    style={{
                        background: activeSection === 'notes' ? 'var(--gold)' : 'transparent',
                        color: activeSection === 'notes' ? 'var(--navy)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                    }}
                >
                    📌 My Notes
                </button>
                <button
                    onClick={() => setActiveSection('history')}
                    className="flex-1 text-xs py-1.5 rounded-lg transition-all"
                    style={{
                        background: activeSection === 'history' ? 'var(--gold)' : 'transparent',
                        color: activeSection === 'history' ? 'var(--navy)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                    }}
                >
                    💬 Chat History
                </button>
            </div>

            {activeSection === 'notes' && (
                <div>
                    {/* Add note */}
                    <div className="mb-3">
                        <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Write a note to remember..."
                            rows={3}
                            className="w-full rounded-lg p-2.5 text-xs resize-none mb-2"
                            style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        />
                        <button
                            onClick={saveNote}
                            disabled={saving || !newNote.trim()}
                            className="w-full py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{ background: 'var(--gold)', color: 'var(--navy)', opacity: saving ? 0.7 : 1 }}
                        >
                            {saving ? 'Saving...' : '+ Save Note'}
                        </button>
                    </div>

                    {/* Notes list */}
                    {loading ? (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading notes...</p>
                    ) : notes.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No notes yet. Add your first note above.</p>
                    ) : (
                        <div className="space-y-2">
                            {notes.map(note => (
                                <div key={note.id} className="p-2.5 rounded-lg text-xs"
                                    style={{ background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="flex-1 leading-relaxed">{note.text}</p>
                                        <button
                                            onClick={() => deleteNote(note.id)}
                                            className="flex-shrink-0 text-xs hover:text-red-400 transition-colors"
                                            style={{ color: 'var(--text-muted)' }}
                                            title="Delete note"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                                        {new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeSection === 'history' && (
                <div className="space-y-2">
                    {chatHistory.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No chat history yet in this course.</p>
                    ) : (
                        [...chatHistory].reverse().map((msg, i) => (
                            <div key={i} className="p-2.5 rounded-lg text-xs"
                                style={{
                                    background: msg.role === 'user' ? 'var(--navy)' : 'var(--navy-card)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-primary)',
                                    borderLeft: msg.role === 'assistant' ? '2px solid var(--gold)' : '2px solid transparent',
                                }}>
                                <p className="text-xs font-semibold mb-1" style={{ color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--gold)' }}>
                                    {msg.role === 'user' ? '👤 You' : '🤖 AI'}
                                </p>
                                <p className="leading-relaxed line-clamp-3">{msg.content}</p>
                                {msg.timestamp && (
                                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                        {new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}