import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const { materialId, courseId, courseName, mode, idToken } = await req.json();
    const session = req.cookies.get('session')?.value || idToken;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(session).catch(() => null);
    if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'admin' && role !== 'chief_admin' && decoded.email !== 'ourstudyai@gmail.com') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const matRef = adminDb.collection('materials').doc(materialId);
    if (mode === 'extra') {
      await matRef.update({ extraCourseIds: FieldValue.arrayUnion(courseId), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }
    const oldChunks = await adminDb.collection('material_chunks').where('materialId', '==', materialId).where('deleted', '!=', true).get();
    const batch = adminDb.batch();
    oldChunks.docs.forEach(d => batch.update(d.ref, { deleted: true }));
    batch.update(matRef, { confirmedCourseId: courseId, confirmedCourseName: courseName, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    const mat = (await matRef.get()).data();
    if (mat?.extractedText) {
      const words = mat.extractedText.split(/\s+/);
      const chunks = [];
      for (let i = 0; i < words.length; i += 800) chunks.push(words.slice(i, i + 800).join(' '));
      const cb = adminDb.batch();
      chunks.forEach((t, idx) => { const r = adminDb.collection('material_chunks').doc(); cb.set(r, { materialId, courseId, category: mat.category ?? 'general', chunkIndex: idx, text: t, wordCount: t.split(/\s+/).length, deleted: false, createdAt: FieldValue.serverTimestamp() }); });
      await cb.commit();
      await matRef.update({ indexed: true });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
