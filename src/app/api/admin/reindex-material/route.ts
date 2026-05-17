export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { MaterialCategory } from '@/lib/processing/classifier';
import { FieldValue } from 'firebase-admin/firestore';
import { deleteChunksByMaterial } from '@/lib/qdrant/upsert';
import {
  upsertPQVectorWithMaterial,
  deletePQVectorsByMaterial,
  searchPQVectors,
  PQ_COLLECTION,
  AOC_COLLECTION,
} from '@/lib/qdrant/pq-vectors';

const CHUNKS_COL = 'material_chunks';
const QSTASH_URL = 'https://qstash.upstash.io/v2/publish';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://our-study-ai.vercel.app';
const WORD_CEILING = 1500;
const SAME_THRESHOLD = 0.92;
const RELATED_THRESHOLD = 0.78;

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
    const body = bodyLines.join('\n').trim();
    bodyLines = [];
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
      let buffer: string[] = []; let bufferWords = 0; let splitIndex = 0;
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
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      headingStack.push({ level, heading });
    } else { bodyLines.push(line); }
  }
  flushSection();
  return chunks.filter(c => c.wordCount > 5);
}

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

interface ParsedItem { text: string; topic: string; examYear: number | null; }

function extractYear(text: string): number | null {
  const m = text.match(/\b(20\d{2})(?:\/(?:20)?\d{2})?\b/);
  return m ? parseInt(m[1]) : null;
}

function isExamHeader(line: string): boolean {
  return /^(bigard|memorial|seminary|examination|time\s+allow|answer\s+\w+\s+question|\d+\s+question|date\s*:|lecturer\s*:|course\s*:|subject\s*:|instruction|use\s+the\s+follow|duration|total\s+mark|all\s+question)/i.test(line)
    && line.length < 150;
}

function cleanQuestionText(raw: string): string {
  let q = raw.replace(/#+/g, '').replace(/[*_]{1,2}/g, '').replace(/\s+/g, ' ').trim();
  q = q.replace(/\s*(bigard|seminary|time\s+allow|answer\s+\w+\s+question|\d+\s+question|date\s*:|lecturer\s*:|course\s*:).*/gi, '').trim();
  const markMatch = q.match(/[\[(](\d+\s*(?:marks?|%|pts?))[\])]/i);
  const marks = markMatch ? ' (' + markMatch[1] + ')' : '';
  q = q.replace(/[\[(]\d+\s*(?:marks?|%|pts?)[\])]/gi, '').trim();
  return q + marks;
}

function parsePastQuestions(extractedText: string): ParsedItem[] {
  const results: ParsedItem[] = [];
  const yearHeaderPattern = /^#{0,4}\s*(20\d{2}(?:\/(?:20)?\d{2})?)\s*$/;
  const sectionPattern = /^#{0,4}\s*(section\s+[a-z0-9]+|part\s+[a-z0-9]+|essay\s+questions?|short\s+answer|objectives?|theory|practical)/i;
  const questionPattern = /^(?:q(?:uestion)?\s*)?(\d{1,2})[.)\s]\s*(.{5,})/i;
  const lines = extractedText.split('\n');
  let sectionYear: number | null = null;
  let currentTopic = '';
  let currentQuestion = '';
  let currentYear: number | null = null;
  let currentNumber = -1;
  const flush = () => {
    const q = cleanQuestionText(currentQuestion);
    if (q.length > 10) {
      results.push({ text: q, topic: currentTopic, examYear: currentYear ?? sectionYear });
    }
    currentQuestion = ''; currentNumber = -1; currentYear = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const yhMatch = line.match(yearHeaderPattern);
    if (yhMatch) {
      if (currentQuestion) flush();
      sectionYear = extractYear(yhMatch[1]);
      currentTopic = '';
      continue;
    }
    if (sectionPattern.test(line) && line.length < 100) {
      if (currentQuestion) flush();
      currentTopic = line.replace(/[*#_]/g, '').trim();
      continue;
    }
    if (isExamHeader(line)) continue;
    const qMatch = line.match(questionPattern);
    if (qMatch) {
      if (currentQuestion) flush();
      currentNumber = parseInt(qMatch[1]);
      currentQuestion = qMatch[2];
      const inlineYear = extractYear(line);
      currentYear = inlineYear;
      continue;
    }
    if (currentNumber >= 0) {
      currentQuestion += ' ' + line;
    }
  }
  if (currentQuestion) flush();
  return results;
}

function parseAOCTopics(extractedText: string): string[] {
  const topics: string[] = [];
  const lines = extractedText.split('\n');
  const bulletPattern = /^[-•*]\s+(.+)/;
  const numberedPattern = /^\d{1,2}[.)\s]\s*(.{5,})/;
  const yearHeaderPattern = /^#{0,4}\s*(20\d{2}(?:\/(?:20)?\d{2})?)\s*$/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (yearHeaderPattern.test(line)) continue;
    if (isExamHeader(line)) continue;
    if (/^#{1,4}\s/.test(line)) continue;
    const bulletMatch = line.match(bulletPattern);
    const numberedMatch = line.match(numberedPattern);
    let topic = '';
    if (bulletMatch) topic = bulletMatch[1].trim();
    else if (numberedMatch) topic = numberedMatch[1].trim();
    else if (line.length > 8 && line.length < 250) topic = line;
    topic = topic.replace(/#+/g, '').replace(/[*_]{1,2}/g, '').trim();
    if (topic.length > 5) topics.push(topic);
  }
  return topics.filter((t, i, arr) => t.length > 3 && arr.indexOf(t) === i);
}

async function processPastQuestions(items: ParsedItem[], courseId: string, materialId: string): Promise<{ written: number }> {
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
        const alreadyHasWording = existingVariations.some(v => normaliseText(v.text) === normKey);
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

async function processAOCTopics(topics: string[], courseId: string, materialId: string, aocYear: number): Promise<{ written: number }> {
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
        const alreadyHasWording = existingVariations.some(v => normaliseText(v.text) === normKey);
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
  try {
    const session = (await import('next/headers')).cookies().get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let _decoded: any;
    try { _decoded = await (await import('@/lib/firebase/admin')).adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const _uDoc = await adminDb.collection('users').doc(_decoded.uid).get();
    const _role = _uDoc.data()?.role;
    if (!(_role === 'admin' || _role === 'chief_admin' || _decoded.email === 'ourstudyai@gmail.com'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const {
      materialId, courseId, courseName, category, extractedText,
      indexDisplayName, department, year, semester,
      quarantine, shouldIndex = true, aocYear,
    } = await req.json();

    if (quarantine) {
      await adminDb.collection('materials').doc(materialId).update({ status: 'quarantined', updatedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    if (!materialId || !courseId || !extractedText)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const finalStatus = shouldIndex ? 'approved' : 'approved_hidden';
    let parsePreview = '';

    if (shouldIndex) {
      if (category === 'past_questions') {
        const parsed = parsePastQuestions(extractedText);
        parsePreview = `${parsed.length} question${parsed.length !== 1 ? 's' : ''} queued for indexing`;
        await fetch(`${QSTASH_URL}/${APP_URL}/api/index-pq-aoc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.QSTASH_TOKEN}` },
          body: JSON.stringify({ type: 'past_questions', courseId, materialId, items: parsed }),
        });
        console.log(`[reindex] past_questions: ${parsed.length} items enqueued for ${materialId}`);
      } else if (category === 'aoc') {
        if (!aocYear) return NextResponse.json({ error: 'aocYear required for AOC' }, { status: 400 });
        const topics = parseAOCTopics(extractedText);
        parsePreview = `${topics.length} topic${topics.length !== 1 ? 's' : ''} queued for indexing`;
        await fetch(`${QSTASH_URL}/${APP_URL}/api/index-pq-aoc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.QSTASH_TOKEN}` },
          body: JSON.stringify({ type: 'aoc', courseId, materialId, aocYear: Number(aocYear), topics }),
        });
        console.log(`[reindex] aoc: ${topics.length} topics enqueued for ${materialId}`);
      } else {
        await deleteChunksByMaterial(materialId);
        await fetch(`${QSTASH_URL}/${APP_URL}/api/index-chunks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.QSTASH_TOKEN}` },
          body: JSON.stringify({ materialId, courseId, category, extractedText }),
        });
        console.log(`[reindex] chunks enqueued for ${materialId}`);
      }
    }

    // ── Update material document ───────────────────────────────────────────
    // Write metaStatus: pending before firing the metadata QStash job.
    // Admin panel can show a pending indicator immediately.
    await adminDb.collection('materials').doc(materialId).update({
      status: finalStatus,
      confirmedCourseId: courseId,
      confirmedCourseName: courseName,
      category,
      extractedText,
      indexed: shouldIndex,
      indexedAt: shouldIndex ? new Date().toISOString() : null,
      indexDisplayName: indexDisplayName || null,
      department: department || null,
      year: year || null,
      semester: semester || null,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      updatedAt: new Date().toISOString(),
      metaStatus: shouldIndex ? 'pending' : null,
    });

    // ── Fire metadata generation via QStash ───────────────────────────────
    // Replaces the broken cookieless fetch to index-material that always
    // returned 401. QStash delivers this to generate-metadata independently,
    // with its own execution window — no timeout risk on this route.
    if (shouldIndex && extractedText) {
      await fetch(`${QSTASH_URL}/${APP_URL}/api/generate-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
        },
        body: JSON.stringify({ materialId, category, extractedText }),
      });
      console.log(`[reindex] metadata generation enqueued for ${materialId}`);
    }

    return NextResponse.json({ ok: true, status: finalStatus, parsePreview });
  } catch (err) {
    console.error('[reindex-material]', err);
    return NextResponse.json({ error: 'Reindex failed' }, { status: 500 });
  }
}
