// Mode Selector — Horizontal tab bar for 6 study modes
'use client';

import { StudyMode, STUDY_MODE_LABELS, STUDY_MODE_ICONS } from '@/lib/types';

interface ModeSelectorProps {
  activeMode: StudyMode;
  onModeChange: (mode: StudyMode) => void;
}

const modes: StudyMode[] = [
  'plain_explainer',
  'practice_questions',
  'exam_preparation',
  'progress_check',
  'research',
  'readiness_assessment',
];

export default function ModeSelector({ activeMode, onModeChange }: ModeSelectorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--navy-card)',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {modes.map((mode) => {
        const active = activeMode === mode;
        return (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            id={`mode-${mode}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '99px',
              fontSize: '0.75rem',
              fontWeight: active ? 700 : 500,
              fontFamily: active ? 'Playfair Display, Georgia, serif' : 'inherit',
              letterSpacing: active ? '0.02em' : '0',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: active ? 'var(--gold-dim)' : 'transparent',
              color: active ? 'var(--gold)' : 'var(--text-muted)',
              border: active
                ? '1px solid var(--border-strong)'
                : '1px solid transparent',
              boxShadow: active ? 'var(--shadow-gold)' : 'none',
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>{STUDY_MODE_ICONS[mode]}</span>
            <span className="hidden sm:inline">{STUDY_MODE_LABELS[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}
