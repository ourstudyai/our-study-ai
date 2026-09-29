'use client';
// src/components/CoveragePanel.tsx
// Upload-coverage UI shared by the dashboard and the library.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Only id and name are needed, so any course shape works (dashboard, admin, library).
export type CourseLite = { id: string; name: string };
import { CoverageMap, Level, courseCoverage, summarize } from '@/lib/coverage';

const COLOR: Record<Level, string> = {
  done: '#4ade80',
  partial: '#fbbf24',
  missing: '#f87171',
};

function Row({ label, done, total, extra, color }: {
  label: string; done: number; total: number; extra: string; color: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px', gap: '8px' }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
          {done}/{total} courses covered · {extra}
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

export function SemesterCoveragePanel({ courses, yearCourses, coverage, title }: {
  courses: CourseLite[];
  yearCourses?: CourseLite[];
  coverage: CoverageMap;
  title?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (courses.length === 0) return null;

  const s = summarize(courses.map((c) => c.id), coverage);
  const byId: Record<string, CourseLite> = {};
  courses.forEach((c) => { byId[c.id] = c; });

  const y = yearCourses && yearCourses.length > 0
    ? summarize(yearCourses.map((c) => c.id), coverage)
    : null;

  const hColor = s.handoutCourses === s.totalCourses ? COLOR.done : s.handoutCourses > 0 ? COLOR.partial : COLOR.missing;
  const pColor = s.pastQuestionCourses === s.totalCourses ? COLOR.done : s.pastQuestionCourses > 0 ? COLOR.partial : COLOR.missing;

  return (
    <div style={{
      background: 'var(--navy-card)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '14px', marginBottom: '16px',
    }}>
      <p style={{
        fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: '10px',
      }}>
        {title ?? 'Upload progress'}
      </p>

      <Row label="Handouts" done={s.handoutCourses} total={s.totalCourses}
        extra={s.handoutsAvailable + (s.handoutsAvailable === 1 ? ' handout' : ' handouts') + ' available'} color={hColor} />
      <Row label="Past questions" done={s.pastQuestionCourses} total={s.totalCourses}
        extra={s.pastQuestionsAvailable + (s.pastQuestionsAvailable === 1 ? ' past question' : ' past questions') + ' available'} color={pColor} />

      {y && (
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Whole year: {y.completeCourses}/{y.totalCourses} courses fully covered
        </p>
      )}

      {s.needy.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: COLOR.done }}>
          ✓ Every course here has what it needs. More uploads are still welcome.
        </p>
      ) : (
        <>
          <button
            onClick={() => setOpen(!open)}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: '8px',
              padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600,
              color: 'var(--gold)', cursor: 'pointer',
            }}
          >
            {open ? '▾' : '▸'} {s.needy.length} course{s.needy.length !== 1 ? 's' : ''} need uploads
          </button>

          {open && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {s.needy.map(({ id, coverage: c }) => (
                <div key={id} style={{
                  border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '9px 10px', display: 'flex', gap: '10px',
                  alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {byId[id]?.name ?? id}
                    </div>
                    {c.handoutsNeed && (
                      <div style={{ fontSize: '0.7rem', color: COLOR[c.handoutsLevel] }}>{c.handoutsNeed}</div>
                    )}
                    {c.pastQuestionsNeed && (
                      <div style={{ fontSize: '0.7rem', color: COLOR[c.pastQuestionsLevel] }}>{c.pastQuestionsNeed}</div>
                    )}
                  </div>
                  <button
                    onClick={() => router.push('/contribute?course=' + encodeURIComponent(id))}
                    style={{
                      flexShrink: 0, padding: '6px 12px', borderRadius: '99px',
                      border: '1px solid var(--border-strong)', background: 'var(--gold-dim)',
                      color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Upload
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CourseCoverageBadges({ courseId, coverage }: {
  courseId: string;
  coverage: CoverageMap;
}) {
  const c = courseCoverage(coverage[courseId]);
  const chip = (text: string, level: Level) => (
    <span style={{
      fontSize: '0.62rem', lineHeight: 1.3, padding: '2px 7px', borderRadius: '99px',
      border: '1px solid ' + COLOR[level], color: COLOR[level],
    }}>
      {text}
    </span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '10px' }}>
      {chip(c.handoutsNeed ?? c.handouts + ' handout' + (c.handouts === 1 ? '' : 's') + ' ✓', c.handoutsLevel)}
      {chip(
        c.pastQuestionsNeed ?? c.pastQuestions + ' past question' + (c.pastQuestions === 1 ? '' : 's') + ' ✓',
        c.pastQuestionsLevel
      )}
    </div>
  );
}
