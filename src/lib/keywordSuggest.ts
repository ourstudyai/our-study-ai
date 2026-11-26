// Keyword matcher: suggests a course and a category for an uploaded file from its title alone.
// Pure functions, no network, no AI. Anything it is not sure about is left for the admin.

export type SuggestCourse = {
  id: string; name: string; code?: string | null; shortName?: string | null;
  department: string; year: number; semester: number;
};
export type Confidence = 'high' | 'medium' | 'none';
export type CategoryFound = 'name' | 'contributor' | 'default';
export type Suggestion = {
  courseId: string | null;
  confidence: Confidence;
  score: number;
  why: string;
  category: string;
  categoryFound: CategoryFound;
};

const STOP = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'for', 'on', 'at', 'de', 'et', 'with', 'by']);
// Words that appear in many course names and say little about which course it is.
const GENERIC = new Set([
  'introduction', 'intro', 'introductory', 'general', 'basic', 'basics', 'foundations', 'foundation',
  'principles', 'fundamentals', 'fundamental', 'survey', 'elements', 'seminar', 'course', 'topics',
  'topic', 'studies', 'study', 'overview', 'advanced', 'special',
]);
// File-name noise that is never part of a course name.
const NOISE = new Set(['docx', 'doc', 'pdf', 'pptx', 'ppt', 'txt', 'copy', 'final', 'new', 'version', 'scan', 'scanned', 'img', 'image', 'file']);
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

function words(s: string): string[] {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\.(pdf|docx?|pptx?|jpe?g|png|txt|md)$/i, ' ')
    .replace(/[_\-.()[\]{}:;,/\\]+/g, ' ')
    .replace(/'/g, '')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

// Year-like numbers (2019, 2025) are exam years, not course numbers.
const isYear = (w: string) => /^(19|20)\d{2}$/.test(w);
const numeralOf = (w: string): number | null => (/^[1-9]$/.test(w) ? Number(w) : ROMAN[w] ?? null);

type Tokens = { text: string[]; nums: number[] };
function tokenize(s: string): Tokens {
  const text: string[] = [];
  const nums: number[] = [];
  for (const w of words(s)) {
    if (isYear(w) || NOISE.has(w)) continue;
    const n = numeralOf(w);
    if (n !== null) { nums.push(n); continue; }
    if (STOP.has(w) || /^\d+$/.test(w)) continue;
    text.push(w);
  }
  return { text, nums };
}

// How well one course word is found among the file's words (0 to 1).
function tokenMatch(courseWord: string, fileWords: string[]): number {
  let best = 0;
  for (const f of fileWords) {
    if (f === courseWord) return 1;
    if (f.length >= 3 && courseWord.startsWith(f)) best = Math.max(best, 0.8);            // "phil" -> "philosophy"
    else if (courseWord.length >= 4 && f.startsWith(courseWord)) best = Math.max(best, 0.8); // "ethic" -> "ethics"
    else if (courseWord.length >= 5 && f.length >= 5 && courseWord.slice(0, 5) === f.slice(0, 5)) best = Math.max(best, 0.6);
  }
  return best;
}

const compact = (s: string) => words(s).join('');

function scoreCourse(file: Tokens, fileCompact: string, fileJoined: string, c: SuggestCourse): { score: number; why: string } {
  // 1. The course code written in the file name ("PHI105", "phi 105") is the strongest signal.
  const code = String(c.code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (code.length >= 4 && fileCompact.includes(code)) return { score: 1.5, why: `course code ${c.code}` };

  // 2. The admin's short name written in full.
  const short = words(String(c.shortName ?? '')).filter(w => !STOP.has(w)).join(' ');
  if (short.length >= 4 && (' ' + fileJoined + ' ').includes(' ' + short + ' ')) return { score: 1.2, why: `short name "${c.shortName}"` };

  // 3. Weighted share of the course name's words found in the file name.
  const course = tokenize(String(c.name ?? ''));
  if (!course.text.length) return { score: 0, why: '' };
  let got = 0, total = 0;
  const hits: string[] = [];
  for (const w of course.text) {
    const weight = GENERIC.has(w) ? 0.4 : 1;
    const m = tokenMatch(w, file.text);
    got += weight * m; total += weight;
    if (m > 0) hits.push(w);
  }
  let score = total ? got / total : 0;
  if (score >= 0.99) score += 0.1; // every word of the name is there

  // 4. "Philosophy of Man II": the numeral tells I from II.
  if (course.nums.length) {
    if (file.nums.length) score += course.nums.some(n => file.nums.includes(n)) ? 0.15 : -0.25;
    else score -= 0.05;
  }
  return { score: Math.max(0, score), why: hits.length ? `matched "${hits.join(' ')}"` : '' };
}

export type CategoryHit = { category: string; found: CategoryFound };

export function detectCategory(fileName: string, contributorCategory?: string | null): CategoryHit {
  const t = ' ' + words(fileName).join(' ') + ' ';
  const has = (re: RegExp) => re.test(t);
  if (has(/ (aoc|areas? concentration|areas? of concentration) /)) return { category: 'aoc', found: 'name' };
  if (has(/ (past questions?|past papers?|pqs?|exam questions?|exam papers?|question papers?|examination|exam|exams|questions) /)) return { category: 'past_questions', found: 'name' };
  if (has(/ (syllabus|syllabi|course outline|course description) /)) return { category: 'syllabus', found: 'name' };
  if (has(/ (students?|my|personal|class) notes? /) || has(/ notes? by /)) return { category: 'student_notes', found: 'name' };
  if (has(/ (handouts?|lectures?|notes?|slides?|module|chapter) /)) return { category: 'lecture_notes', found: 'name' };
  if (has(/ (textbook|book|ebook|reading|readings|article|journal) /)) return { category: 'other', found: 'name' };
  const c = String(contributorCategory ?? '');
  if (c && c !== 'other') return { category: c, found: 'contributor' };
  return { category: 'lecture_notes', found: 'default' };
}

export type SuggestInput = {
  fileName: string;
  contributorCategory?: string | null;   // already normalised by the caller
  contributorCourseId?: string | null;   // the class the contributor picked, used only as a small hint
};

// Suggests for one file. `scope` = courses of the department and year the file was uploaded to;
// `all` = every live course (used only to spot a file uploaded to the wrong year).
export function suggestOne(input: SuggestInput, scope: SuggestCourse[], all: SuggestCourse[]): Suggestion {
  const cat = detectCategory(input.fileName, input.contributorCategory);
  const file = tokenize(input.fileName);
  const fileJoined = words(input.fileName).join(' ');
  const fileCompact = compact(input.fileName);

  const rank = (pool: SuggestCourse[]) => pool
    .map(c => {
      const r = scoreCourse(file, fileCompact, fileJoined, c);
      const hint = input.contributorCourseId && c.id === input.contributorCourseId && r.score > 0 ? 0.25 : 0;
      return { c, score: r.score + hint, why: r.why };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const base = { category: cat.category, categoryFound: cat.found };
  const inScope = rank(scope);
  const top = inScope[0];
  const second = inScope[1];

  if (top) {
    const margin = top.score - (second?.score ?? 0);
    if (top.score >= 0.85 && margin >= 0.2) return { ...base, courseId: top.c.id, confidence: 'high', score: top.score, why: top.why };
    if (top.score >= 0.5 && margin >= 0.1) return { ...base, courseId: top.c.id, confidence: 'medium', score: top.score, why: top.why + (margin < 0.2 ? ' (close call)' : '') };
  }

  // Uploaded to the wrong year? Offer the better match as a suggestion, never as a confident one.
  const wide = rank(all);
  const wTop = wide[0];
  if (wTop && wTop.score >= 0.85 && wTop.score - (wide[1]?.score ?? 0) >= 0.2 && !scope.some(c => c.id === wTop.c.id)) {
    return { ...base, courseId: wTop.c.id, confidence: 'medium', score: wTop.score, why: `${wTop.why}, but it is a Year ${wTop.c.year} course` };
  }
  return { ...base, courseId: null, confidence: 'none', score: top?.score ?? 0, why: 'no clear match' };
}
