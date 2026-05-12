export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { deleteChunksByMaterial, upsertChunks } from '@/lib/qdrant/upsert';
import { MaterialCategory } from '@/lib/processing/classifier';

const CHUNKS_COL = 'material_chunks';
const BATCH_SIZE = 20;
const QSTASH_URL = 'https://qstash.upstash.io/v2/publish';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://our-study-ai.vercel.app';

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

  const { materialId, courseId, category, extractedText, startIndex = 0 } = JSON.parse(rawBody);
  if (!materialId || !extractedText) return NextResponse.json({ ok: true, skipped: true });

  const chunks = semanticChunk(stripTOC(extractedText));
  const totalChunks = chunks.length;

  // First batch only — delete old chunks
  if (startIndex === 0) {
    const oldChunks = await adminDb.collection(CHUNKS_COL).where('materialId', '==', materialId).get();
    const deleteBatch = adminDb.batch();
    oldChunks.docs.forEach(d => deleteBatch.update(d.ref, { deleted: true }));
    await deleteBatch.commit();
    await deleteChunksByMaterial(materialId);
  }

  const batch = chunks.slice(startIndex, startIndex + BATCH_SIZE);

  // Write this batch to Firestore
  const writeBatch = adminDb.batch();
  batch.forEach((chunk, i) => {
    const ref = adminDb.collection(CHUNKS_COL).doc();
    writeBatch.set(ref, {
      materialId, courseId,
      category: category as MaterialCategory,
      chunkIndex: startIndex + i,
      text: chunk.text,
      heading: chunk.heading,
      headingLevel: chunk.headingLevel,
      ancestorHeadings: chunk.ancestorHeadings,
      fullPath: chunk.fullPath,
      wordCount: chunk.wordCount,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await writeBatch.commit();

  // Upsert this batch to Qdrant
  const chunkPayloads = batch.map((chunk, i) => ({
    id: `${materialId}-${startIndex + i}`,
    payload: {
      materialId, courseId,
      chunkIndex: startIndex + i,
      heading: chunk.heading,
      fullPath: chunk.fullPath,
      ancestorHeadings: chunk.ancestorHeadings,
      text: chunk.text,
      category: category as string,
    },
  }));
  await upsertChunks(chunkPayloads);

  // Handle shared courses
  const matDoc = await adminDb.collection('materials').doc(materialId).get();
  const sharedCourseIds: string[] = matDoc.data()?.sharedCourseIds ?? [];
  for (const sharedId of sharedCourseIds) {
    if (sharedId === courseId) continue;
    const sharedPayloads = batch.map((chunk, i) => ({
      id: `${materialId}-shared-${sharedId}-${startIndex + i}`,
      payload: {
        materialId, courseId: sharedId,
        chunkIndex: startIndex + i,
        heading: chunk.heading,
        fullPath: chunk.fullPath,
        ancestorHeadings: chunk.ancestorHeadings,
        text: chunk.text,
        category: category as string,
      },
    }));
    await upsertChunks(sharedPayloads);
  }

  console.log(`[index-chunks] batch ${startIndex}–${startIndex + batch.length - 1} of ${totalChunks} for ${materialId}`);

  // Small pause to avoid Firestore quota exhaustion on large documents
  await new Promise(r => setTimeout(r, 2000));

  // If more chunks remain — fire next batch via QStash
  const nextIndex = startIndex + BATCH_SIZE;
  if (nextIndex < totalChunks) {
    await fetch(`${QSTASH_URL}/${APP_URL}/api/index-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
      },
      body: JSON.stringify({ materialId, courseId, category, extractedText, startIndex: nextIndex }),
    });
    console.log(`[index-chunks] chained next batch from ${nextIndex} for ${materialId}`);
  } else {
    console.log(`[index-chunks] all ${totalChunks} chunks complete for ${materialId}`);
  }

  return NextResponse.json({ ok: true, batchDone: `${startIndex}–${startIndex + batch.length - 1}`, totalChunks });
}
