// Session History — Side panel showing past chat sessions
'use client';

import { ChatSession, STUDY_MODE_LABELS, STUDY_MODE_ICONS } from '@/lib/types';

interface SessionHistoryProps {
  sessions: ChatSession[];
  onSelectSession: (session: ChatSession) => void;
  onClose: () => void;
}

export default function SessionHistory({ sessions, onSelectSession, onClose }: SessionHistoryProps) {
  // Group sessions by date
  const grouped = groupByDate(sessions);

  return (
    <div className="absolute inset-0 z-20 flex justify-end animate-slide-right">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-sm h-full overflow-y-auto"
        style={{ background: 'var(--navy-mid)', borderLeft: '1px solid var(--border)' }}>

        <div className="p-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold text-sm">Session History</h3>
          <button onClick={onClose} className="btn-ghost text-sm">✕</button>
        </div>

        <div className="p-3">
          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📚</div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No sessions yet. Start a conversation!
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, dateSessions]) => (
              <div key={dateLabel} className="mb-4">
                <p className="text-xs font-medium mb-2 px-2"
                  style={{ color: 'var(--text-muted)' }}>
                  📅 {dateLabel}
                </p>
                {dateSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    className="w-full text-left p-3 rounded-xl mb-1 transition-all duration-200 hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{STUDY_MODE_ICONS[session.mode]}</span>
                      <span className="text-xs font-medium truncate flex-1">
                        {session.title || 'Untitled Session'}
                      </span>
                    </div>
                    <p className="text-xs truncate pl-6"
                      style={{ color: 'var(--text-muted)' }}>
                      {STUDY_MODE_LABELS[session.mode]} · {session.messageCount || 0} messages
                    </p>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function groupByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const groups: Record<string, ChatSession[]> = {};
  const now = new Date();

  for (const session of sessions) {
    const date = new Date(session.lastMessageAt);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Yesterday';
    else if (diffDays < 7) label = `${diffDays} days ago`;
    else label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(session);
  }

  return groups;
}
