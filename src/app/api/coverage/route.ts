// src/app/api/coverage/route.ts
// Upload coverage counts per course (approved materials only).
// Reads only small fields (never extractedText), so it stays fast.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

type Counts = { handouts: number; pastQuestions: number };

export async function GET() {
  try {
    const session = cookies().get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try { await adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

    const snap = await adminDb
      .collection('materials')
      .where('status', '==', 'approved')
      .select('category', 'confirmedCourseId', 'sharedCourseIds')
      .get();

    const counts: Record<string, Counts> = {};
    snap.docs.forEach((d) => {
      const m = d.data() as {
        category?: string;
        confirmedCourseId?: string | null;
        sharedCourseIds?: string[];
      };
      const isHandout = m.category === 'lecture_notes';
      const isPQ = m.category === 'past_questions';
      if (!isHandout && !isPQ) return;

      const ids = new Set<string>();
      if (m.confirmedCourseId) ids.add(m.confirmedCourseId);
      (m.sharedCourseIds ?? []).forEach((id) => { if (id) ids.add(id); });

      ids.forEach((id) => {
        if (!counts[id]) counts[id] = { handouts: 0, pastQuestions: 0 };
        if (isHandout) counts[id].handouts += 1;
        if (isPQ) counts[id].pastQuestions += 1;
      });
    });

    return NextResponse.json(
      { counts },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
