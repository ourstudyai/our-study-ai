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
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none"
      style={{ WebkitOverflowScrolling: 'touch' }}>
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onModeChange(mode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 ${activeMode === mode ? '' : ''
            }`}
          style={{
            background: activeMode === mode
              ? 'rgba(124, 108, 240, 0.15)'
              : 'transparent',
            color: activeMode === mode
              ? 'var(--gold)'
              : 'var(--text-muted)',
            border: activeMode === mode
              ? '1px solid rgba(124, 108, 240, 0.3)'
              : '1px solid transparent',
          }}
          id={`mode-${mode}`}
        >
          <span>{STUDY_MODE_ICONS[mode]}</span>
          <span className="hidden sm:inline">{STUDY_MODE_LABELS[mode]}</span>
        </button>
      ))}
    </div>
  );
}
