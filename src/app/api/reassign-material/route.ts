import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { upsertChunks, deleteChunksByMaterial } from '@/lib/qdrant/upsert';
import { MaterialCategory } from '@/lib/processing/classifier';

const WORD_CEILING = 1500;

interface SemanticChunk {
  text: string; heading: string; headingLevel: number;
  ancestorHeadings: string[]; fullPath: string; wordCount: number;
}

function stripTOC(markdown: string): string {
  const lines = markdown.split('\n');
  const headingPattern = /^#{1,4}\s+.+/;
  const protectedHeadings = /^#{1,4}\s+(introduction|conclusion|preface|foreword|abstract|bibliography|references|appendix|overview|summary|acknowledgements?)/i;
  const toRemove = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!headingPattern.test(trimmed)) continue;
    if (protectedHeadings.test(trimmed)) continue;
    let hasBody = false;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next === '') continue;
      if (headingPattern.test(next)) break;
      hasBody = true; break;
    }
    if (!hasBody) toRemove.add(i);
  }
  if (toRemove.size === 0) return markdown;
  return lines.filter((_, idx) => !toRemove.has(idx)).join('\n');
}

function semanticChunk(markdown: string): SemanticChunk[] {
  const lines = markdown.split('\n');
  const chunks: SemanticChunk[] = [];
  const headingStack: { level: number; heading: string }[] = [];
  let bodyLines: string[] = [];

  function flushSection() {
    const body = bodyLines.join('\n').trim(); bodyLines = [];
    if (!body && headingStack.length === 0) return;
    const currentHeading = headingStack.length > 0 ? headingStack[headingStack.length - 1].heading : '';
    const currentLevel = headingStack.length > 0 ? headingStack[headingStack.length - 1].level : 0;
    const ancestors = headingStack.slice(0, -1).map(h => h.heading);
    const fullPath = headingStack.map(h => h.heading).join(' > ');
    if (!body && !currentHeading) return;
    const fullText = currentHeading ? `${'#'.repeat(currentLevel)} ${currentHeading}\n\n${body}` : body;
    const words = fullText.split(/\s+/).filter(Boolean);
    if (words.length <= WORD_CEILING) {
      chunks.push({ text: fullText.trim(), heading: currentHeading, headingLevel: currentLevel, ancestorHeadings: ancestors, fullPath, wordCount: words.length });
    } else {
      const paragraphs = fullText.split(/\n\n+/);
      let buffer: string[] = [], bufferWords = 0, splitIndex = 0;
      for (const para of paragraphs) {
        const paraWords = para.split(/\s+/).filter(Boolean).length;
        if (bufferWords + paraWords > WORD_CEILING && buffer.length > 0) {
          chunks.push({ text: buffer.join('\n\n').trim(), heading: currentHeading, headingLevel: currentLevel, ancestorHeadings: ancestors, fullPath: fullPath + (splitIndex > 0 ? ` (part ${splitIndex + 1})` : ''), wordCount: bufferWords });
          buffer = []; bufferWords = 0; splitIndex++;
        }
        buffer.push(para); bufferWords += paraWords;
      }
      if (buffer.length > 0) chunks.push({ text: buffer.join('\n\n').trim(), heading: currentHeading, headingLevel: currentLevel, ancestorHeadings: ancestors, fullPath: fullPath + (splitIndex > 0 ? ` (part ${splitIndex + 1})` : ''), wordCount: bufferWords });
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      const level = headingMatch[1].length, heading = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      headingStack.push({ level, heading });
    } else { bodyLines.push(line); }
  }
  flushSection();
  return chunks.filter(c => c.wordCount > 5);
}

export async function POST(req: NextRequest) {
  try {
    const { materialId, courseId, courseName, mode, idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let decoded: any;
    try { decoded = await adminAuth.verifyIdToken(idToken); }
    catch { return NextResponse.json({ error: 'Unauthorized - please refresh page' }, { status: 401 }); }
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const role = userDoc.data()?.role;
    const isAdmin = role === 'admin' || role === 'chief_admin' || decoded.email === 'ourstudyai@gmail.com';
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const matRef = adminDb.collection('materials').doc(materialId);

    if (mode === 'extra') {
      await matRef.update({ extraCourseIds: FieldValue.arrayUnion(courseId), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }

    const mat = (await matRef.get()).data();
    if (!mat) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    const oldChunks = await adminDb.collection('material_chunks').where('materialId', '==', materialId).where('deleted', '!=', true).get();
    const batch = adminDb.batch();
    oldChunks.docs.forEach(d => batch.update(d.ref, { deleted: true }));
    batch.update(matRef, { confirmedCourseId: courseId, confirmedCourseName: courseName, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();

    await deleteChunksByMaterial(materialId);

    if (mat.extractedText) {
      const chunks = semanticChunk(stripTOC(mat.extractedText));
      const cb = adminDb.batch();
      chunks.forEach((chunk, idx) => {
        const r = adminDb.collection('material_chunks').doc();
        cb.set(r, { materialId, courseId, category: (mat.category ?? 'general') as MaterialCategory, chunkIndex: idx, text: chunk.text, heading: chunk.heading, headingLevel: chunk.headingLevel, ancestorHeadings: chunk.ancestorHeadings, fullPath: chunk.fullPath, wordCount: chunk.wordCount, deleted: false, createdAt: FieldValue.serverTimestamp() });
      });
      await cb.commit();
      await upsertChunks(chunks.map((chunk, i) => ({ id: `${materialId}-${i}`, payload: { materialId, courseId, chunkIndex: i, heading: chunk.heading, fullPath: chunk.fullPath, ancestorHeadings: chunk.ancestorHeadings, text: chunk.text, category: mat.category ?? 'general' } })));
      await matRef.update({ indexed: true, status: 'approved' });
      console.log(`[reassign] ${chunks.length} semantic chunks written for ${materialId}`);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('reassign error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
