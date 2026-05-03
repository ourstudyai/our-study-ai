'use client';
import { useState, useEffect } from 'react';
import MiniLoader from '@/components/MiniLoader';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/components/auth/AuthProvider';

interface Note {
    id: string;
    text: string;
    createdAt: string;
}

interface ArchivedSession {
    id: string;
    messages: { role: string; content: string; timestamp: string }[];
    archivedAt: string;
    mode: string;
    messageCount: number;
}

interface Props {
    courseId: string;
    chatHistory: { role: string; content: string; timestamp: string }[];
    defaultSection: 'notes' | 'history';
}

const MODE_LABELS: Record<string, string> = {
    plain_explainer: 'Plain Explainer',
    practice_questions: 'Practice Q',
    exam_preparation: 'Exam Prep',
    research: 'Research',
};

export default function StudyMemoryPanel({ courseId, chatHistory, defaultSection }: Props) {
    const { firebaseUser } = useAuth();

    // ── Notes state ──────────────────────────────────────────────────────────
    const [notes, setNotes] = useState<Note[]>([]);
    const [newNote, setNewNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [notesLoading, setNotesLoading] = useState(true);
    const [noteSearch, setNoteSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    // ── History state ────────────────────────────────────────────────────────
    const [archives, setArchives] = useState<ArchivedSession[]>([]);
    const [archivesLoading, setArchivesLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // ── Load notes ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!firebaseUser || defaultSection !== 'notes') return;
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
                setNotesLoading(false);
            }
        };
        fetchNotes();
    }, [courseId, firebaseUser, defaultSection]);

    // ── Load archives ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!firebaseUser || defaultSection !== 'history') return;
        const fetchArchives = async () => {
            try {
                const snap = await getDocs(
                    query(
                        collection(db, 'users', firebaseUser.uid, 'chatArchive'),
                        orderBy('archivedAt', 'desc')
                    )
                );
                const all = snap.docs
                    .filter(d => d.id.startsWith(courseId + '__'))
                    .map(d => ({ id: d.id, ...d.data() } as ArchivedSession));
                setArchives(all);
            } catch (err) {
                console.error(err);
            } finally {
                setArchivesLoading(false);
            }
        };
        fetchArchives();
    }, [courseId, firebaseUser, defaultSection]);

    // ── Notes helpers ────────────────────────────────────────────────────────
    const saveNote = async () => {
        if (!newNote.trim() || !firebaseUser) return;
        setSaving(true);
        try {
            const docRef = await addDoc(collection(db, 'notes'), {
                courseId, userId: firebaseUser.uid,
                text: newNote.trim(), createdAt: new Date().toISOString(),
            });
            setNotes(prev => [{ id: docRef.id, text: newNote.trim(), createdAt: new Date().toISOString() }, ...prev]);
            setNewNote('');
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const deleteNote = async (noteId: string) => {
        try {
            await deleteDoc(doc(db, 'notes', noteId));
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) { console.error(err); }
    };

    const saveEdit = async (noteId: string) => {
        if (!editText.trim()) return;
        try {
            await updateDoc(doc(db, 'notes', noteId), { text: editText.trim() });
            setNotes(prev => prev.map(n => n.id === noteId ? { ...n, text: editText.trim() } : n));
            setEditingId(null);
        } catch (err) { console.error(err); }
    };

    // ── Archive naming ───────────────────────────────────────────────────────
    const getSessionLabel = (session: ArchivedSession) => {
        const firstUser = session.messages?.find(m => m.role === 'user');
        const topic = firstUser
            ? firstUser.content.slice(0, 45) + (firstUser.content.length > 45 ? '…' : '')
            : 'Session';
        const mode = MODE_LABELS[session.mode] ?? session.mode ?? '';
        const date = session.archivedAt
            ? new Date(session.archivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
        return { topic, mode, date };
    };

    const filteredNotes = notes.filter(n =>
        n.text.toLowerCase().includes(noteSearch.toLowerCase())
    );

    const inputStyle: React.CSSProperties = {
        width: '100%', borderRadius: '8px', padding: '6px 10px',
        fontSize: '0.75rem', background: 'var(--navy)',
        border: '1px solid var(--border)', color: 'var(--text-primary)',
        outline: 'none', marginBottom: '10px', boxSizing: 'border-box',
    };

    // ── NOTES VIEW ───────────────────────────────────────────────────────────
    if (defaultSection === 'notes') {
        return (
            <div>
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

                {notes.length > 0 && (
                    <input
                        type="text"
                        value={noteSearch}
                        onChange={e => setNoteSearch(e.target.value)}
                        placeholder="🔍 Search notes..."
                        style={inputStyle}
                    />
                )}

                {notesLoading ? (
                    <MiniLoader label="Loading notes..." />
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
                                            <button onClick={() => saveEdit(note.id)}
                                                style={{ flex: 1, padding: '4px', borderRadius: '6px', fontSize: '0.72rem', background: 'var(--gold)', color: 'var(--ink)', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                                Save
                                            </button>
                                            <button onClick={() => setEditingId(null)}
                                                style={{ flex: 1, padding: '4px', borderRadius: '6px', fontSize: '0.72rem', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
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
                                                <button onClick={() => { setEditingId(note.id); setEditText(note.text); }}
                                                    style={{ fontSize: '0.68rem', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                    ✏️ Edit
                                                </button>
                                                <button onClick={() => deleteNote(note.id)}
                                                    style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
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
        );
    }

    // ── HISTORY VIEW ─────────────────────────────────────────────────────────
    return (
        <div>
            {archivesLoading ? (
                <MiniLoader label="Loading history..." />
            ) : archives.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <p style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🕐</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No archived sessions yet.</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px' }}>
                        Start a new chat from the top bar to archive the current one.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {archives.map(session => {
                        const { topic, mode, date } = getSessionLabel(session);
                        const isOpen = expandedId === session.id;
                        return (
                            <div key={session.id} style={{
                                borderRadius: '12px', border: '1px solid var(--border)',
                                background: 'var(--navy)', overflow: 'hidden',
                            }}>
                                {/* Session header — tap to expand/collapse */}
                                <button
                                    onClick={() => setExpandedId(isOpen ? null : session.id)}
                                    style={{
                                        width: '100%', padding: '10px 12px', background: 'transparent',
                                        border: 'none', cursor: 'pointer', textAlign: 'left',
                                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{
                                            fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)',
                                            marginBottom: '3px', lineHeight: '1.4',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {topic}
                                        </p>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px',
                                                background: 'var(--gold-dim)', color: 'var(--gold)',
                                                border: '1px solid var(--border-hover)', fontWeight: 600,
                                            }}>{mode}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{date}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                {session.messageCount ?? session.messages?.length ?? 0} msgs
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px', flexShrink: 0 }}>
                                        {isOpen ? '▲' : '▼'}
                                    </span>
                                </button>

                                {/* Expanded conversation */}
                                {isOpen && (
                                    <div style={{
                                        borderTop: '1px solid var(--border)',
                                        padding: '10px', maxHeight: '380px', overflowY: 'auto',
                                        display: 'flex', flexDirection: 'column', gap: '8px',
                                    }}>
                                        {session.messages?.map((msg, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                                <div style={{
                                                    maxWidth: '88%', borderRadius: '10px', padding: '7px 11px',
                                                    fontSize: '0.75rem', lineHeight: '1.6',
                                                    background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy-card)',
                                                    color: msg.role === 'user' ? 'var(--navy)' : 'var(--text-primary)',
                                                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                                                }}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
