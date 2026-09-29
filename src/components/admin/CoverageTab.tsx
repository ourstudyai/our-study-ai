'use client';
// src/components/admin/CoverageTab.tsx
// Admin "Coverage" tab: upload needs per course, per semester, per year.

import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { fetchCoverage, CoverageMap, summarize } from '@/lib/coverage';
import { SemesterCoveragePanel } from '@/components/CoveragePanel';

type AdminCourse = {
  id: string;
  name: string;
  code?: string;
  department: string;
  year: number;
  semester: number;
};

const DEPTS = [
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'theology', label: 'Theology' },
];

function chip(active: boolean): CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: '99px',
    fontSize: '0.78rem',
    fontWeight: active ? 700 : 500,
    border: '1px solid ' + (active ? 'var(--border-strong)' : 'var(--border)'),
    background: active ? 'var(--gold-dim)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-muted)',
    cursor: 'pointer',
  };
}

export default function CoverageTab({ courses }: { courses: AdminCourse[] }) {
  const [coverage, setCoverage] = useState<CoverageMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [dept, setDept] = useState('philosophy');
  const [year, setYear] = useState(1);

  useEffect(() => {
    fetchCoverage().then((c) => {
      if (c) setCoverage(c);
      else setFailed(true);
    });
  }, []);

  const deptCourses = useMemo(() => courses.filter((c) => c.department === dept), [courses, dept]);
  const yearCourses = useMemo(() => deptCourses.filter((c) => c.year === year), [deptCourses, year]);

  const overall = useMemo(
    () => (coverage ? summarize(deptCourses.map((c) => c.id), coverage) : null),
    [coverage, deptCourses]
  );
  const yearSummary = useMemo(
    () => (coverage ? summarize(yearCourses.map((c) => c.id), coverage) : null),
    [coverage, yearCourses]
  );

  if (failed) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Could not load coverage. Switch to another tab and back to retry.
      </div>
    );
  }
  if (!coverage || !overall || !yearSummary) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Loading coverage...
      </div>
    );
  }

  const deptLabel = DEPTS.find((d) => d.id === dept)?.label ?? dept;

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {DEPTS.map((d) => (
          <button key={d.id} onClick={() => setDept(d.id)} style={chip(dept === d.id)}>
            {d.label}
          </button>
        ))}
      </div>

      <div style={{
        background: 'var(--navy-card)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '14px', marginBottom: '16px',
      }}>
        <p style={{
          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: '8px',
        }}>
          {deptLabel} overall
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
          {overall.completeCourses}/{overall.totalCourses} courses fully covered
        </p>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          Handouts: {overall.handoutCourses}/{overall.totalCourses} courses · {overall.handoutsAvailable} {overall.handoutsAvailable === 1 ? 'handout' : 'handouts'} available
        </p>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          Past questions: {overall.pastQuestionCourses}/{overall.totalCourses} courses · {overall.pastQuestionsAvailable} {overall.pastQuestionsAvailable === 1 ? 'past question' : 'past questions'} available
        </p>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map((y) => (
          <button key={y} onClick={() => setYear(y)} style={chip(year === y)}>
            Y{y}
          </button>
        ))}
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Year {year}: {yearSummary.completeCourses}/{yearSummary.totalCourses} courses fully covered
      </p>

      {[1, 2].map((sem) => {
        const semCourses = yearCourses.filter((c) => c.semester === sem);
        if (semCourses.length === 0) {
          return (
            <p key={sem} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              No courses in Year {year} · Semester {sem}.
            </p>
          );
        }
        return (
          <SemesterCoveragePanel
            key={sem}
            courses={semCourses}
            coverage={coverage}
            title={'Year ' + year + ' · Semester ' + sem}
          />
        );
      })}
    </div>
  );
}
