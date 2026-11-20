import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { nameLabel } from '@/lib/categories';

export const NAT = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

type NameCourse = { id: string; name: string; code?: string };
type NameItem = { id: string; fileName: string; category?: string | null };

// "PHL 201 · Handout 3": numbering continues from the highest existing number for
// that course + type (never recounted, so names don't shift when files are deleted).
export async function buildNames(course: NameCourse, items: NameItem[]): Promise<Map<string, string>> {
  const snap = await getDocs(query(collection(db, 'materials'), where('confirmedCourseId', '==', course.id)));
  const prefix = (course.code || course.name) + ' · ';
  const max: Record<string, number> = {};
  snap.docs.forEach(d => {
    const n = String(d.data().indexDisplayName ?? '');
    const mt = n.startsWith(prefix) ? n.slice(prefix.length).match(/^(.*\S) (\d+)$/) : null;
    if (mt) max[mt[1]] = Math.max(max[mt[1]] ?? 0, Number(mt[2]));
  });
  const out = new Map<string, string>();
  [...items].sort((a, b) => NAT.compare(a.fileName, b.fileName)).forEach(m => {
    const label = nameLabel(m.category);
    max[label] = (max[label] ?? 0) + 1;
    out.set(m.id, `${prefix}${label} ${max[label]}`);
  });
  return out;
}
