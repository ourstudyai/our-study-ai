export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  upsertPQVectorWithMaterial,
  deletePQVectorsByMaterial,
  searchPQVectors,
  PQ_COLLECTION,
  AOC_COLLECTION,
} from '@/lib/qdrant/pq-vectors';

const SAME_THRESHOLD = 0.92;
const RELATED_THRESHOLD = 0.78;

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function acquireLock(courseId: string, jobId: string): Promise<boolean> {
  const lockRef = adminDb.collection('pq_locks').doc(courseId);
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists) {
        const data = snap.data()!;
        const age = Date.now() - (data.acquiredAt?.toMillis?.() ?? 0);
        // Stale lock older than 5 min — override it
        if (age < 5 * 60 * 1000) throw new Error('LOCKED');
      }
      tx.set(lockRef, { jobId, acquiredAt: FieldValue.serverTimestamp() });
    });
    return true;
  } catch (e: any) {
    if (e.message === 'LOCKED') return false;
    throw e;
  }
}

async function releaseLock(courseId: string) {
  await adminDb.collection('pq_locks').doc(courseId).delete();
}

async function processPastQuestions(
  items: { text: string; topic: string; examYear: number | null }[],
  courseId: string,
  materialId: string
): Promise<{ written: number }> {
  let written = 0;
  for (const item of items) {
    const normKey = normaliseText(item.text);
    const matches = await searchPQVectors(item.text, courseId, PQ_COLLECTION, 3);
    const topMatch = matches[0];
    if (topMatch && topMatch.score >= SAME_THRESHOLD) {
      const ref = adminDb.collection('past_questions').doc(topMatch.canonicalId);
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data()!;
        const existingYears: number[] = data.years || [];
        const existingVariations: any[] = data.variations || [];
        const newYears = item.examYear && !existingYears.includes(item.examYear) ? [...existingYears, item.examYear] : existingYears;
        const alreadyHasWording = existingVariations.some((v: any) => normaliseText(v.text) === normKey);
        const newVariations = alreadyHasWording ? existingVariations : [...existingVariations, { text: item.text, year: item.examYear, similarityScore: topMatch.score }];
        await ref.update({ years: newYears, reoccurrenceCount: newYears.length, variations: newVariations, updatedAt: FieldValue.serverTimestamp() });
        written++; continue;
      }
    }
    const relatedId = topMatch && topMatch.score >= RELATED_THRESHOLD && topMatch.score < SAME_THRESHOLD ? topMatch.canonicalId : null;
    const ref = adminDb.collection('past_questions').doc();
    const canonicalId = ref.id;
    const years = item.examYear ? [item.examYear] : [];
    await ref.set({ courseId, materialId, questionText: item.text, years, reoccurrenceCount: years.length, topic: item.topic, variations: [{ text: item.text, year: item.examYear, similarityScore: 1.0 }], relatedTo: relatedId ? [relatedId] : [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await upsertPQVectorWithMaterial(canonicalId, item.text, courseId, materialId, PQ_COLLECTION);
    written++;
  }
  return { written };
}

async function processAOCTopics(
  topics: string[],
  courseId: string,
  materialId: string,
  aocYear: number
): Promise<{ written: number }> {
  let written = 0;
  for (const topic of topics) {
    const normKey = normaliseText(topic);
    const matches = await searchPQVectors(topic, courseId, AOC_COLLECTION, 3);
    const topMatch = matches[0];
    if (topMatch && topMatch.score >= SAME_THRESHOLD) {
      const ref = adminDb.collection('aoc').doc(topMatch.canonicalId);
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data()!;
        const existingYears: number[] = data.years || [];
        const existingVariations: any[] = data.variations || [];
        const newYears = !existingYears.includes(aocYear) ? [...existingYears, aocYear] : existingYears;
        const alreadyHasWording = existingVariations.some((v: any) => normaliseText(v.text) === normKey);
        const newVariations = alreadyHasWording ? existingVariations : [...existingVariations, { text: topic, year: aocYear, similarityScore: topMatch.score }];
        const sortedYears = [...newYears].sort((a, b) => b - a);
        const trending = sortedYears.length >= 2 && sortedYears[0] - sortedYears[1] === 1;
        await ref.update({ years: newYears, reoccurrenceCount: newYears.length, variations: newVariations, trending, updatedAt: FieldValue.serverTimestamp() });
        written++; continue;
      }
    }
    const relatedId = topMatch && topMatch.score >= RELATED_THRESHOLD && topMatch.score < SAME_THRESHOLD ? topMatch.canonicalId : null;
    const ref = adminDb.collection('aoc').doc();
    const canonicalId = ref.id;
    await ref.set({ courseId, materialId, topic, years: [aocYear], reoccurrenceCount: 1, variations: [{ text: topic, year: aocYear, similarityScore: 1.0 }], relatedTo: relatedId ? [relatedId] : [], trending: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await upsertPQVectorWithMaterial(canonicalId, topic, courseId, materialId, AOC_COLLECTION);
    written++;
  }
  return { written };
}

export async function POST(req: NextRequest) {
  // Verify QStash signature
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

  const { type, courseId, materialId, aocYear, items, topics } = JSON.parse(rawBody);
  const jobId = `${materialId}-${Date.now()}`;

  // Acquire per-course lock
  const locked = await acquireLock(courseId, jobId);
  if (!locked) {
    // Return 200 so QStash doesn't retry — job for this course already running
    // QStash will have already enqueued it; the other job will handle it
    console.log(`[index-pq-aoc] Course ${courseId} locked, skipping job ${jobId}`);
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    // Clean slate — idempotent on retry
    if (type === 'past_questions') {
      const oldDocs = await adminDb.collection('past_questions').where('materialId', '==', materialId).get();
      const batch = adminDb.batch();
      oldDocs.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await deletePQVectorsByMaterial(materialId, PQ_COLLECTION);
      const { written } = await processPastQuestions(items, courseId, materialId);
      console.log(`[index-pq-aoc] past_questions: ${written} written for ${materialId}`);
    } else if (type === 'aoc') {
      const oldDocs = await adminDb.collection('aoc').where('materialId', '==', materialId).get();
      const batch = adminDb.batch();
      oldDocs.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await deletePQVectorsByMaterial(materialId, AOC_COLLECTION);
      const { written } = await processAOCTopics(topics, courseId, materialId, Number(aocYear));
      console.log(`[index-pq-aoc] aoc: ${written} written for ${materialId}`);
    }
  } finally {
    await releaseLock(courseId);
  }

  return NextResponse.json({ ok: true });
}
