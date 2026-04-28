import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { MaterialCategory } from '@/lib/processing/classifier';
import { FieldValue } from 'firebase-admin/firestore';

const CHUNKS_COL = 'material_chunks';
const CHUNK_SIZE = 750;
const CHUNK_OVERLAP = 100;

function makeChunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
    if (start >= words.length) break;
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const {
      materialId, courseId, courseName, category,
      extractedText, indexDisplayName, department,
      year, semester, quarantine, shouldIndex = true
    } = await req.json();

    // ── Quarantine path ─────────────────────────────────────
    if (quarantine) {
      await adminDb.collection('materials').doc(materialId).update({
        status: 'quarantined', updatedAt: new Date().toISOString()
      });
      return NextResponse.json({ ok: true });
    }

    // ── Approve path ────────────────────────────────────────
    if (!materialId || !courseId || !extractedText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const finalStatus = shouldIndex ? 'approved' : 'approved_hidden';

    // Delete old chunks (server-side)
    if (shouldIndex) {
      const oldChunks = await adminDb.collection(CHUNKS_COL)
        .where('materialId', '==', materialId).get();
      const batch = adminDb.batch();
      oldChunks.docs.forEach(d => batch.update(d.ref, { deleted: true }));
      await batch.commit();

      // Save new chunks
      const chunks = makeChunks(extractedText);
      const writeBatch = adminDb.batch();
      chunks.forEach((text, i) => {
        const ref = adminDb.collection(CHUNKS_COL).doc();
        writeBatch.set(ref, {
          materialId, courseId,
          category: category as MaterialCategory,
          chunkIndex: i, text,
          wordCount: text.split(/\s+/).filter(Boolean).length,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await writeBatch.commit();
    }

    // Update material doc
    await adminDb.collection('materials').doc(materialId).update({
      status: finalStatus,
      confirmedCourseId: courseId,
      confirmedCourseName: courseName,
      extractedText,
      indexDisplayName: indexDisplayName || null,
      department: department || null,
      year: year || null,
      semester: semester || null,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, status: finalStatus });
  } catch (err) {
    console.error('[reindex-material]', err);
    return NextResponse.json({ error: 'Reindex failed' }, { status: 500 });
  }
}
