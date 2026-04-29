import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userSnap.data()?.role;
    if (!['chief_admin', 'supreme'].includes(role) && decoded.email !== 'ourstudyai@gmail.com') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const snap = await adminDb.collection('materials').where('status', '==', 'approved').get();
    let count = 0;
    for (const d of snap.docs) {
      if (!d.data().indexed) {
        await d.ref.update({ indexed: true, indexedAt: d.data().updatedAt || new Date().toISOString() });
        count++;
      }
    }
    return NextResponse.json({ success: true, updated: count });
  } catch (err) {
    console.error('[backfill-indexed]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
