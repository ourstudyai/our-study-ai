'use client';
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
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
    const [noteSearch, setNoteSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

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

    const startEdit = (note: Note) => {
        setEditingId(note.id);
        setEditText(note.text);
    };

    const saveEdit = async (noteId: string) => {
        if (!editText.trim()) return;
        try {
            await updateDoc(doc(db, 'notes', noteId), { text: editText.trim() });
            setNotes(prev => prev.map(n => n.id === noteId ? { ...n, text: editText.trim() } : n));
            setEditingId(null);
        } catch (err) {
            console.error(err);
        }
    };

    const filteredNotes = notes.filter(n =>
        n.text.toLowerCase().includes(noteSearch.toLowerCase())
    );

    const filteredHistory = chatHistory.filter(m =>
        m.content.toLowerCase().includes(historySearch.toLowerCase())
    );

    const inputStyle = {
        width: '100%', borderRadius: '8px', padding: '6px 10px',
        fontSize: '0.75rem', background: 'var(--navy)',
        border: '1px solid var(--border)', color: 'var(--text-primary)',
        outline: 'none', marginBottom: '10px',
    };

    return (
        <div>
            {/* Section toggle */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <button
                    onClick={() => setActiveSection('notes')}
                    style={{
                        flex: 1, fontSize: '0.72rem', padding: '6px', borderRadius: '8px',
                        background: activeSection === 'notes' ? 'var(--gold)' : 'transparent',
                        color: activeSection === 'notes' ? 'var(--ink)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                >
                    📌 My Notes
                </button>
                <button
                    onClick={() => setActiveSection('history')}
                    style={{
                        flex: 1, fontSize: '0.72rem', padding: '6px', borderRadius: '8px',
                        background: activeSection === 'history' ? 'var(--gold)' : 'transparent',
                        color: activeSection === 'history' ? 'var(--ink)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                >
                    💬 Chat History
                </button>
            </div>

            {activeSection === 'notes' && (
                <div>
                    {/* Add note */}
                    <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Write a note to remember..."
                        rows={3}
                        style={{ ...inputStyle, resize: 'none', marginBottom: '6px' }}
                    />
                    <button
                        onClick={saveNote}
                        disabled={saving || !newNote.trim()}
                        style={{
                            width: '100%', padding: '6px', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 600, marginBottom: '12px',
                            background: 'var(--gold)', color: 'var(--ink)',
                            border: 'none', cursor: saving || !newNote.trim() ? 'not-allowed' : 'pointer',
                            opacity: saving || !newNote.trim() ? 0.6 : 1,
                        }}
                    >
                        {saving ? 'Saving...' : '+ Save Note'}
                    </button>

                    {/* Search notes */}
                    {notes.length > 0 && (
                        <input
                            type="text"
                            value={noteSearch}
                            onChange={e => setNoteSearch(e.target.value)}
                            placeholder="🔍 Search notes..."
                            style={inputStyle}
                        />
                    )}

                    {/* Notes list */}
                    {loading ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Loading notes...</p>
                    ) : filteredNotes.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {notes.length === 0 ? 'No notes yet. Add your first note above.' : 'No notes match your search.'}
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredNotes.map(note => (
                                <div key={note.id} style={{
                                    padding: '10px', borderRadius: '10px', fontSize: '0.75rem',
                                    background: 'var(--navy)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)',
                                }}>
                                    {editingId === note.id ? (
                                        <>
                                            <textarea
                                                value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                rows={3}
                                                style={{ ...inputStyle, marginBottom: '6px', resize: 'none' }}
                                                autoFocus
                                            />
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button
                                                    onClick={() => saveEdit(note.id)}
                                                    style={{
                                                        flex: 1, padding: '4px', borderRadius: '6px', fontSize: '0.72rem',
                                                        background: 'var(--gold)', color: 'var(--ink)',
                                                        border: 'none', cursor: 'pointer', fontWeight: 600,
                                                    }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    style={{
                                                        flex: 1, padding: '4px', borderRadius: '6px', fontSize: '0.72rem',
                                                        background: 'transparent', color: 'var(--text-muted)',
                                                        border: '1px solid var(--border)', cursor: 'pointer',
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ lineHeight: '1.6', marginBottom: '8px' }}>{note.text}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                    {new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        onClick={() => startEdit(note)}
                                                        style={{ fontSize: '0.68rem', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}
                                                        title="Edit note"
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                    <button
                                                        onClick={() => deleteNote(note.id)}
                                                        style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                                                        title="Delete note"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeSection === 'history' && (
                <div>
                    {/* Search history */}
                    {chatHistory.length > 0 && (
                        <input
                            type="text"
                            value={historySearch}
                            onChange={e => setHistorySearch(e.target.value)}
                            placeholder="🔍 Search chat history..."
                            style={inputStyle}
                        />
                    )}

                    {chatHistory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            No chat history yet in this session. History across sessions comes in Phase 7.
                        </p>
                    ) : filteredHistory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No messages match your search.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {[...filteredHistory].reverse().map((msg, i) => (
                                <div key={i} style={{
                                    padding: '10px', borderRadius: '10px', fontSize: '0.75rem',
                                    background: msg.role === 'user' ? 'var(--navy)' : 'var(--navy-card)',
                                    border: '1px solid var(--border)', color: 'var(--text-primary)',
                                    borderLeft: msg.role === 'assistant' ? '2px solid var(--gold)' : '2px solid transparent',
                                }}>
                                    <p style={{ fontSize: '0.68rem', fontWeight: 600, marginBottom: '4px', color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--gold)' }}>
                                        {msg.role === 'user' ? '👤 You' : '🤖 AI'}
                                    </p>
                                    <p style={{ lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {msg.content}
                                    </p>
                                    {msg.timestamp && (
                                        <p style={{ marginTop: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                            {new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}