export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { deleteChunksByMaterial, upsertChunks } from '@/lib/qdrant/upsert';
import { MaterialCategory } from '@/lib/processing/classifier';

const CHUNKS_COL = 'material_chunks';

interface SemanticChunk {
  heading: string;
  headingLevel: number;
  ancestorHeadings: string[];
  fullPath: string;
  text: string;
  wordCount: number;
}

function stripTOC(markdown: string): string {
  const lines = markdown.split('\n');
  let inTOC = false;
  return lines.filter(line => {
    if (/^#+\s*(table of contents|contents|toc)/i.test(line)) { inTOC = true; return false; }
    if (inTOC && /^#+\s/.test(line) && !/^#+\s*(table of contents|contents|toc)/i.test(line)) inTOC = false;
    return !inTOC;
  }).join('\n');
}

function semanticChunk(markdown: string): SemanticChunk[] {
  const lines = markdown.split('\n');
  const chunks: SemanticChunk[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let buffer: string[] = [];

  function flush() {
    const text = buffer.join('\n').trim();
    if (text.length < 30) { buffer = []; return; }
    const ancestors = headingStack.slice(0, -1).map(h => h.text);
    const current = headingStack[headingStack.length - 1];
    chunks.push({
      heading: current?.text ?? '',
      headingLevel: current?.level ?? 0,
      ancestorHeadings: ancestors,
      fullPath: [...ancestors, current?.text ?? ''].filter(Boolean).join(' > '),
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    });
    buffer = [];
  }

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      flush();
      const level = m[1].length;
      const text = m[2].trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      headingStack.push({ level, text });
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  const { Receiver } = await import('@upstash/qstash');
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  const rawBody = await req.text();
  const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  const { materialId, courseId, category, extractedText } = JSON.parse(rawBody);
  if (!materialId || !extractedText) return NextResponse.json({ ok: true, skipped: true });

  const oldChunks = await adminDb.collection(CHUNKS_COL).where('materialId', '==', materialId).get();
  const deleteBatch = adminDb.batch();
  oldChunks.docs.forEach(d => deleteBatch.update(d.ref, { deleted: true }));
  await deleteBatch.commit();
  await deleteChunksByMaterial(materialId);

  const chunks = semanticChunk(stripTOC(extractedText));
  const writeBatch = adminDb.batch();
  chunks.forEach((chunk, i) => {
    const ref = adminDb.collection(CHUNKS_COL).doc();
    writeBatch.set(ref, { materialId, courseId, category: category as MaterialCategory, chunkIndex: i, text: chunk.text, heading: chunk.heading, headingLevel: chunk.headingLevel, ancestorHeadings: chunk.ancestorHeadings, fullPath: chunk.fullPath, wordCount: chunk.wordCount, createdAt: FieldValue.serverTimestamp() });
  });
  await writeBatch.commit();

  const chunkPayloads = chunks.map((chunk, i) => ({
    id: `${materialId}-${i}`,
    payload: { materialId, courseId, chunkIndex: i, heading: chunk.heading, fullPath: chunk.fullPath, ancestorHeadings: chunk.ancestorHeadings, text: chunk.text, category: category as string },
  }));
  await upsertChunks(chunkPayloads);

  // Also index under any sharedCourseIds so RAG works in shared courses
  const matDoc = await adminDb.collection('materials').doc(materialId).get();
  const sharedCourseIds: string[] = matDoc.data()?.sharedCourseIds ?? [];
  for (const sharedId of sharedCourseIds) {
    if (sharedId === courseId) continue;
    const sharedPayloads = chunks.map((chunk, i) => ({
      id: `${materialId}-shared-${sharedId}-${i}`,
      payload: { materialId, courseId: sharedId, chunkIndex: i, heading: chunk.heading, fullPath: chunk.fullPath, ancestorHeadings: chunk.ancestorHeadings, text: chunk.text, category: category as string },
    }));
    await upsertChunks(sharedPayloads);
  }

  console.log(`[index-chunks] ${chunks.length} chunks indexed for ${materialId}` + (sharedCourseIds.length ? ` + shared to [${sharedCourseIds.join(', ')}]` : ''));
  return NextResponse.json({ ok: true });
}
