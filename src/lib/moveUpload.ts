// Moving an unsorted upload to another department / year compartment, and undoing it.
// Nothing is deleted. The file stays unsorted and simply shows up in the other year's list.
import { writeBatch, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export type DeptYear = { dept: string; year: number };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const deptYearLabel = (dept?: string | null, year?: number | null): string =>
  dept ? `${cap(String(dept))} Year ${year || '?'}` : 'Year not specified';

// "Philosophy Year 1" for a file that was moved, or null.
export function movedFromLabel(m: any): string | null {
  const f = m?.movedFrom;
  return f ? deptYearLabel(f.dept, f.year) : null;
}

export async function moveUploads(ids: string[], from: DeptYear, to: DeptYear, by: string): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach(id =>
      batch.update(doc(db, 'materials', id), {
        uploadDepartment: to.dept,
        uploadYear: to.year,
        movedFrom: { dept: from.dept || '', year: from.year || 0, by, at: now },
        keepInYear: deleteField(),
        updatedAt: now,
      })
    );
    await batch.commit();
  }
}

export async function undoMoves(items: { id: string }[]): Promise<void> {
  const list = items.filter(m => (m as any).movedFrom);
  const now = new Date().toISOString();
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    list.slice(i, i + 400).forEach(m => {
      const f = (m as any).movedFrom;
      batch.update(doc(db, 'materials', m.id), {
        uploadDepartment: f.dept || null,
        uploadYear: f.year || null,
        movedFrom: deleteField(),
        updatedAt: now,
      });
    });
    await batch.commit();
  }
}

// "Keep it in this year": stops the wrong-year flag for these files. They go back to the normal sort list.
export async function keepInYear(ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const id of ids) await updateDoc(doc(db, 'materials', id), { keepInYear: true, updatedAt: now });
}
