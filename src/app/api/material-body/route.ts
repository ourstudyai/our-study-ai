export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { getArrangedText } from '@/lib/processing/arrangedText';

export async function GET(req: NextRequest) {
  try {
    const session = cookies().get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try { await adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

    const materialId = req.nextUrl.searchParams.get('materialId');
    if (!materialId) return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });

    // ?v=cleaned: the cleaned text when the cleaning pass has finished. Without it (or when not finished) the raw text is returned.
    if (req.nextUrl.searchParams.get('v') === 'cleaned') {
      const cleaned = await getArrangedText(materialId);
      if (cleaned) return NextResponse.json({ extractedText: cleaned, cleaned: true });
    }

    // Try sub-document first (new path)
    const subSnap = await adminDb
      .collection('materials').doc(materialId)
      .collection('body').doc('extracted')
      .get();

    if (subSnap.exists) {
      return NextResponse.json({ extractedText: subSnap.data()!.extractedText ?? '' });
    }

    // Fallback: old materials still have it on the parent doc
    const matSnap = await adminDb.collection('materials').doc(materialId).get();
    if (!matSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ extractedText: matSnap.data()!.extractedText ?? '' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
