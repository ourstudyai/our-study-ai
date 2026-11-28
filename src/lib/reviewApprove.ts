// src/lib/reviewApprove.ts
// One-tap approval used by the Review screen. Same steps and same server route as the Edit window.
import { normalizeCategory, AUTO_NAME_RE } from '@/lib/categories';
import { buildNames } from '@/lib/materialNaming';

export type CourseLite = { id: string; name: string; code?: string; department: string; year: number; semester: number };

// Why this file cannot be accepted with one tap (null = it can).
export function acceptBlockReason(m: any, courses: CourseLite[]): string | null {
  if (!m.suggestedCourseId || !courses.some(c => c.id === m.suggestedCourseId)) return 'No course chosen yet. Use Edit.';
  if (normalizeCategory(m.category) === 'aoc') return 'Areas of Concentration need the exam year. Use Edit.';
  const cat = normalizeCategory(m.category);
  const started = Date.parse(m.arrangeStartedAt || '');
  const stale = !!started && Date.now() - started > 15 * 60 * 1000;   // a stuck job must not block Accept forever
  if (m.arrangeStatus === 'running' && !stale && cat !== 'past_questions' && cat !== 'aoc') {
    const c = m.arrangeChunks || {};
    return 'Still cleaning the text (' + (c.done ?? 0) + ' of ' + (c.total ?? '?') + ' parts). Wait a minute.';
  }
  return null;
}

export async function acceptMaterial(m: any, courses: CourseLite[]): Promise<{ ok: boolean; error?: string }> {
  const block = acceptBlockReason(m, courses);
  if (block) return { ok: false, error: block };
  const course = courses.find(c => c.id === m.suggestedCourseId) as CourseLite;
  try {
    const body = await fetch('/api/material-body?materialId=' + encodeURIComponent(m.id)).then(r => r.json()).catch(() => ({}));
    const text = String((body as any).extractedText ?? '');
    if (!text.trim()) return { ok: false, error: 'No extracted text to approve.' };

    const category = normalizeCategory(m.category) || 'other';
    let name: string = m.indexDisplayName || m.fileName || '';
    // Files that skipped manual sorting have no library name yet: give them the usual "PHL 201 · Handout 3".
    if (!m.indexDisplayName || AUTO_NAME_RE.test(name)) {
      const names = await buildNames(course, [{ id: m.id, fileName: m.fileName, category }]);
      name = names.get(m.id) ?? name;
    }

    const res = await fetch('/api/admin/reindex-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialId: m.id,
        courseId: course.id,
        courseName: course.name || '',
        category,
        extractedText: text,
        indexDisplayName: name,
        department: course.department || '',
        year: course.year || null,
        semester: course.semester || null,
        shouldIndex: true,
      }),
    });
    if (!res.ok) return { ok: false, error: 'Approval failed. Try Edit.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error. Try again.' };
  }
}
