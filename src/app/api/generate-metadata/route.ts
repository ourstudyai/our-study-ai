export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Heading skeleton extractor ────────────────────────────────────────────────
// Identical logic to index-material/route.ts.
// Pulls heading lines + first 1,500 words of body for summary context.
// Keeps Gemini input tiny regardless of document size.
// Gemini resolves OCR-garbled headings through language understanding.

function buildSkeletonInput(extractedText: string, category: string): string {
  if (category === 'past_questions' || category === 'aoc') {
    return extractedText.slice(0, 8000);
  }

  const lines = extractedText.split('\n');
  const headingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isMarkdownHeading = /^#{1,4}\s+.+/.test(trimmed);
    const isBoldCaps = /^\*\*[A-Z][A-Z0-9\s\-:,./]{3,}\*\*\s*$/.test(trimmed);
    const isAllCapsLine = /^[A-Z][A-Z0-9\s\-:,./]{4,}$/.test(trimmed) && trimmed.length < 100;
    if (isMarkdownHeading || isBoldCaps || isAllCapsLine) {
      headingLines.push(trimmed);
    }
  }

  const firstWords = extractedText.split(/\s+/).slice(0, 1500).join(' ');

  return [
    '=== DOCUMENT HEADINGS ===',
    headingLines.join('\n'),
    '\n=== DOCUMENT OPENING (for summary context) ===',
    firstWords,
  ].join('\n');
}

// ── Category-aware Gemini prompt ──────────────────────────────────────────────

function buildPrompt(skeletonInput: string, category: string): string {
  const base = `You are indexing a study material for a Catholic seminary library.
Some headings may be poorly formatted due to OCR scanning — infer the correct clean heading from context, normalise capitalisation to title case, and fix obvious OCR errors.
Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No explanation.`;

  if (category === 'past_questions') {
    return `${base}

From the following past examination questions, extract:
- "summary": one sentence describing what years and subject areas the questions cover.
- "topics": an array of distinct subject areas/topics that appear across the questions. Each topic: { "title": string, "level": 1, "subtopics": [] }

Material:
${skeletonInput}

Return JSON: { "summary": "...", "topics": [...] }`;
  }

  if (category === 'aoc') {
    return `${base}

From the following Areas of Concentration document, extract:
- "summary": one sentence describing the exam year and subject covered.
- "topics": each area of concentration as a topic. Each topic: { "title": string, "level": 1, "subtopics": [] }

Material:
${skeletonInput}

Return JSON: { "summary": "...", "topics": [...] }`;
  }

  return `${base}

From the following document headings and opening, extract:
- "summary": 2-3 sentences describing what this study material covers and why it matters for seminary students.
- "topics": the full topic tree as it appears in the document. Preserve the heading hierarchy using "level" (1 = major topic, 2 = subtopic, 3 = sub-subtopic). For each level-1 topic, list its direct children in "subtopics" as plain strings. Do not invent topics not present in the headings.

Material:
${skeletonInput}

Return JSON: { "summary": "...", "topics": [{ "title": "...", "level": 1, "subtopics": ["...", "..."] }, ...] }`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Verify this request came from QStash — reject anything else
  const signature = req.headers.get('upstash-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const { Receiver } = await import('@upstash/qstash');
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });

  const rawBody = await req.text();
  const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
  }

  const { materialId, category, extractedText } = JSON.parse(rawBody);

  if (!materialId || !extractedText) {
    return NextResponse.json({ error: 'Missing materialId or extractedText' }, { status: 400 });
  }

  const matRef = adminDb.collection('materials').doc(materialId);

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash-lite',
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    });

    const skeletonInput = buildSkeletonInput(extractedText, category || 'other');
    const prompt = buildPrompt(skeletonInput, category || 'other');

    const result = await model.generateContent(prompt);
    const raw = result.response.text() || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed: {
      summary?: string;
      topics?: { title: string; level: number; subtopics: string[] }[];
    } = {};

    try { parsed = JSON.parse(clean); } catch {
      console.error('[generate-metadata] JSON parse failed, raw output:', clean.slice(0, 300));
      parsed = {};
    }

    const aiSummary: string = parsed.summary?.trim() || '';
    const topicTree: { title: string; level: number; subtopics: string[] }[] =
      Array.isArray(parsed.topics)
        ? parsed.topics.filter(t => t && typeof t.title === 'string' && t.title.trim().length > 0)
        : [];

    // Flat contentList for backward compatibility with library and topics panel
    const contentList: string[] = topicTree.map(t => t.title);

    await matRef.update({
      aiSummary,
      contentList,
      topicTree,
      metaStatus: 'done',
      metaGeneratedAt: new Date().toISOString(),
    });

    console.log(`[generate-metadata] Done for ${materialId} — ${topicTree.length} topics, summary: ${aiSummary.slice(0, 60)}...`);
    return NextResponse.json({ ok: true, materialId, topicCount: topicTree.length });

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[generate-metadata] Failed for ${materialId}:`, message);

    // Write failed status so admin can see it and retry
    try {
      await matRef.update({ metaStatus: 'failed' });
    } catch (_) {}

    return NextResponse.json({ error: 'Metadata generation failed', detail: message }, { status: 500 });
  }
}
