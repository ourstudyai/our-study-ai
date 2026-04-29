export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await adminAuth.verifySessionCookie(session, true);

    const { action, ...data } = await req.json();

    if (action === 'create') {
      const ref = await adminDb.collection('assignments').add({
        ...data,
        createdAt: new Date().toISOString(),
        status: 'active',
      });
      return NextResponse.json({ success: true, id: ref.id });
    }

    if (action === 'extend') {
      await adminDb.collection('assignments').doc(data.id).update({
        dueDate: data.newDueDate,
        extended: true,
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await adminDb.collection('assignments').doc(data.id).update({
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[assignments]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await adminAuth.verifySessionCookie(session, true);

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');
    const department = searchParams.get('department');
    const year = searchParams.get('year');

    let q = adminDb.collection('assignments').where('status', '==', 'active');
    if (courseId) q = q.where('courseId', '==', courseId) as any;
    if (department) q = q.where('department', '==', department) as any;
    if (year) q = q.where('year', '==', Number(year)) as any;

    const snap = await q.get();
    const now = new Date();
    const assignments = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((a: any) => new Date(a.dueDate) >= now);

    return NextResponse.json({ assignments });
  } catch (err) {
    console.error('[assignments GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
