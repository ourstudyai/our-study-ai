// Admin Page — Password-protected flag review panel
'use client';

import { useState, useEffect } from 'react';
import { Flag, FlagStatus } from '@/lib/types';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(false);

  // Demo flags for testing
  const DEMO_FLAGS: Flag[] = [
    {
      id: 'flag_1',
      userId: 'user1',
      userEmail: 'student@seminary.edu',
      courseId: 'theo-101',
      courseName: 'Introduction to Sacred Scripture',
      mode: 'plain_explainer',
      question: 'What is the difference between exegesis and eisegesis?',
      aiResponse: 'Exegesis is the process of reading into the text...',
      studentDescription: 'The AI mixed up exegesis and eisegesis. Exegesis draws meaning OUT of the text, eisegesis reads INTO the text.',
      status: 'open',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'flag_2',
      userId: 'user2',
      userEmail: 'student2@seminary.edu',
      courseId: 'phil-103',
      courseName: 'Ancient Greek Philosophy',
      mode: 'exam_preparation',
      question: 'Explain Aristotle\'s four causes',
      aiResponse: 'The four causes are: material, formal, efficient, and final...',
      studentDescription: 'The formal cause explanation was confused with the efficient cause.',
      status: 'open',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const handleLogin = () => {
    // In production, verify against ADMIN_PASSWORD env var via API
    if (password === 'admin123' || password) {
      setAuthenticated(true);
      setFlags(DEMO_FLAGS);
    }
  };

  const handleResolve = async (flagId: string, adminNote: string, goldenCorrection: string) => {
    try {
      await fetch('/api/admin/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagId, adminNote, goldenCorrection, adminPassword: password }),
      });

      setFlags((prev) =>
        prev.map((f) =>
          f.id === flagId
            ? { ...f, status: 'resolved' as FlagStatus, adminNote, goldenCorrection, resolvedAt: new Date().toISOString() }
            : f
        )
      );
    } catch (err) {
      console.error('Resolve error:', err);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="glass-card p-8 w-full max-w-md animate-fade-in">
          <h1 className="text-2xl font-bold font-display mb-2">Admin Access</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            Enter the admin password to review flagged responses.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Admin password"
            className="input-field mb-4"
            id="admin-password"
          />
          <button onClick={handleLogin} className="btn-primary w-full" id="admin-login-button">
            Access Admin Panel
          </button>
        </div>
      </div>
    );
  }

  const openFlags = flags.filter((f) => f.status === 'open');
  const resolvedFlags = flags.filter((f) => f.status === 'resolved');

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold font-display">Flag Review Panel</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {openFlags.length} open · {resolvedFlags.length} resolved
            </p>
          </div>
          <button onClick={() => setAuthenticated(false)} className="btn-secondary text-sm">
            Lock Panel
          </button>
        </div>

        {/* Open Flags */}
        {openFlags.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4" style={{ color: '#ef476f' }}>
              🚩 Open Flags
            </h2>
            {openFlags.map((flag) => (
              <FlagCard key={flag.id} flag={flag} onResolve={handleResolve} />
            ))}
          </div>
        )}

        {/* Resolved Flags */}
        {resolvedFlags.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-muted)' }}>
              ✅ Resolved
            </h2>
            {resolvedFlags.map((flag) => (
              <FlagCard key={flag.id} flag={flag} onResolve={handleResolve} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlagCard({
  flag,
  onResolve,
}: {
  flag: Flag;
  onResolve: (id: string, note: string, correction: string) => void;
}) {
  const [adminNote, setAdminNote] = useState(flag.adminNote || '');
  const [goldenCorrection, setGoldenCorrection] = useState(flag.goldenCorrection || '');
  const isOpen = flag.status === 'open';

  return (
    <div
      className="glass-card p-5 mb-4"
      style={{
        borderLeft: `4px solid ${isOpen ? '#ef476f' : 'rgba(96, 211, 148, 0.4)'}`,
        opacity: isOpen ? 1 : 0.7,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${isOpen ? 'badge-red' : 'badge-blue'}`}>
            {isOpen ? 'OPEN' : 'RESOLVED'}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            #{flag.id} · {new Date(flag.createdAt).toLocaleString()}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {flag.courseName} · {flag.mode}
        </span>
      </div>

      {/* Content */}
      <div className="grid gap-3 mb-4">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Question</p>
          <p className="text-sm">{flag.question}</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>AI Response (excerpt)</p>
          <p className="text-sm italic" style={{ color: 'var(--color-text-secondary)' }}>{flag.aiResponse}</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: '#ef476f' }}>Student&apos;s Issue</p>
          <p className="text-sm">{flag.studentDescription}</p>
        </div>
      </div>

      {/* Resolution form */}
      {isOpen ? (
        <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mb-3">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
              Admin Note (what was corrected)
            </label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="input-field resize-none text-sm"
              rows={2}
              placeholder="Explain what document was corrected and how..."
            />
          </div>
          <div className="mb-3">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--color-gold)' }}>
              ✨ Golden Correction (AI will prioritize this in future responses)
            </label>
            <textarea
              value={goldenCorrection}
              onChange={(e) => setGoldenCorrection(e.target.value)}
              className="input-field resize-none text-sm"
              rows={3}
              placeholder="Write the correct information that the AI should use going forward..."
            />
          </div>
          <button
            onClick={() => onResolve(flag.id, adminNote, goldenCorrection)}
            disabled={!adminNote.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Mark as Resolved
          </button>
        </div>
      ) : (
        flag.adminNote && (
          <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Admin Resolution</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{flag.adminNote}</p>
            {flag.goldenCorrection && (
              <div className="mt-2 p-3 rounded-lg" style={{ background: 'var(--color-gold-dim)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-gold)' }}>✨ Golden Correction</p>
                <p className="text-sm">{flag.goldenCorrection}</p>
              </div>
            )}
            {flag.resolvedAt && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                Resolved: {new Date(flag.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}
