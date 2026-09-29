// src/lib/coverage.ts
// Upload-coverage rules and helpers. Change the minimums here only.

export const MIN_HANDOUTS = 1;
export const MIN_PAST_QUESTIONS = 3;

export type CourseCounts = { handouts: number; pastQuestions: number };
export type CoverageMap = Record<string, CourseCounts>;
export type Level = 'done' | 'partial' | 'missing';

export type CourseCoverage = {
  handouts: number;
  pastQuestions: number;
  handoutsLevel: Level;
  pastQuestionsLevel: Level;
  handoutsNeed: string | null;
  pastQuestionsNeed: string | null;
  complete: boolean;
};

function plural(n: number, word: string): string {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

export function courseCoverage(counts?: CourseCounts): CourseCoverage {
  const handouts = counts?.handouts ?? 0;
  const pastQuestions = counts?.pastQuestions ?? 0;

  const handoutsLevel: Level = handouts >= MIN_HANDOUTS ? 'done' : 'missing';
  const pastQuestionsLevel: Level =
    pastQuestions >= MIN_PAST_QUESTIONS ? 'done' : pastQuestions > 0 ? 'partial' : 'missing';

  const handoutsNeed =
    handoutsLevel === 'done' ? null : 'Needs at least ' + plural(MIN_HANDOUTS, 'handout');

  let pastQuestionsNeed: string | null = null;
  if (pastQuestionsLevel === 'missing') {
    pastQuestionsNeed = 'Needs at least ' + plural(MIN_PAST_QUESTIONS, 'past question');
  } else if (pastQuestionsLevel === 'partial') {
    pastQuestionsNeed =
      'Needs at least ' + plural(MIN_PAST_QUESTIONS, 'past question') + ' (' + pastQuestions + ' so far)';
  }

  return {
    handouts,
    pastQuestions,
    handoutsLevel,
    pastQuestionsLevel,
    handoutsNeed,
    pastQuestionsNeed,
    complete: handoutsLevel === 'done' && pastQuestionsLevel === 'done',
  };
}

export type SemesterSummary = {
  totalCourses: number;
  handoutCourses: number;
  pastQuestionCourses: number;
  completeCourses: number;
  handoutsAvailable: number;
  pastQuestionsAvailable: number;
  needy: { id: string; coverage: CourseCoverage }[];
};

export function summarize(courseIds: string[], map: CoverageMap): SemesterSummary {
  const s: SemesterSummary = {
    totalCourses: courseIds.length,
    handoutCourses: 0,
    pastQuestionCourses: 0,
    completeCourses: 0,
    handoutsAvailable: 0,
    pastQuestionsAvailable: 0,
    needy: [],
  };
  for (const id of courseIds) {
    const c = courseCoverage(map[id]);
    s.handoutsAvailable += c.handouts;
    s.pastQuestionsAvailable += c.pastQuestions;
    if (c.handoutsLevel === 'done') s.handoutCourses += 1;
    if (c.pastQuestionsLevel === 'done') s.pastQuestionCourses += 1;
    if (c.complete) s.completeCourses += 1;
    else s.needy.push({ id, coverage: c });
  }
  return s;
}

// Returns null when the request fails, so pages can hide the coverage UI
// instead of wrongly showing every course as "needs uploads".
export async function fetchCoverage(): Promise<CoverageMap | null> {
  try {
    const res = await fetch('/api/coverage', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.counts ?? {}) as CoverageMap;
  } catch {
    return null;
  }
}
