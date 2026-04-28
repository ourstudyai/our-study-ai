// src/components/course/NotesPanel.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface Props {
  courseId: string;
  userId: string;
}

export default function NotesPanel({ courseId, userId }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = doc(db, 'users', userId, 'notes', courseId);

  useEffect(() => {
    if (!userId || !courseId) return;
    getDoc(docRef).then(snap => {
      if (snap.exists()) setText(snap.data().text ?? '');
    }).catch(console.error).finally(() => setLoading(false));
  }, [userId, courseId]);

  const handleChange = (val: string) => {
    setText(val);
    setStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await setDoc(docRef, { text: val, updatedAt: serverTimestamp() });
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch { setStatus('idle'); }
    }, 1500);
  };

  const handleClearAll = async () => {
    setText('');
    setShowClearConfirm(false);
    try { await deleteDoc(docRef); } catch { }
  };

  if (loading) return (
    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading notes...</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: status === 'saved' ? 'var(--gold)' : 'var(--text-muted)' }}>
          {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Your private notes'}
        </span>
        {text.length > 0 && (
          <button onClick={() => setShowClearConfirm(true)} style={{
            fontSize: '0.68rem', color: '#ef4444', background: 'transparent',
            border: '1px solid #ef444440', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer',
          }}>Clear all</button>
        )}
      </div>
      {showClearConfirm && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid #ef444440', borderRadius: '8px', padding: '10px 12px' }}>
          <p style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '8px' }}>Delete all notes for this course?</p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={handleClearAll} style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '6px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
            <button onClick={() => setShowClearConfirm(false)} style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '6px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={'Write your notes here...\n\nThey are saved automatically and never affected by mode switching or new chats.'}
        style={{
          flex: 1, width: '100%', minHeight: '280px',
          background: 'var(--navy)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '12px', resize: 'none',
          color: 'var(--text-primary)', fontSize: '0.82rem',
          lineHeight: '1.7', fontFamily: 'Lora, serif',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
