export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Heading skeleton extractor ────────────────────────────────────────────────
// Pulls only heading lines from the full extracted text plus the first
// 1,500 words of body for summary context. Keeps input tokens tiny regardless
// of document size. Gemini handles OCR-garbled headings through its own
// language understanding — no regex filtering needed.

function buildSkeletonInput(extractedText: string, category: string): string {
  const lines = extractedText.split('\n');

  // For past questions and AOC, headings matter less — send first 8,000 chars
  // which contains enough question/topic structure for Gemini to work with.
  if (category === 'past_questions' || category === 'aoc') {
    return extractedText.slice(0, 8000);
  }

  // For lecture notes / handouts / syllabus: extract heading lines only
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

  // First 1,500 words of body for summary context
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

  // Default: lecture notes, handout, syllabus, other
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
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash-lite',
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });

  try {
    const session = cookies().get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let decoded: any;
    try { decoded = await adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const uDoc = await adminDb.collection('users').doc(decoded.uid).get();
    const role = uDoc.data()?.role;
    if (!(role === 'admin' || role === 'chief_admin' || decoded.email === 'ourstudyai@gmail.com')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { materialId, action = 'add' } = await req.json();
    if (!materialId) return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });

    const matRef = adminDb.collection('materials').doc(materialId);
    const matSnap = await matRef.get();
    if (!matSnap.exists) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    const mat = matSnap.data()!;

    // ── Remove action ──────────────────────────────────────────────────────
    if (action === 'remove') {
      await matRef.update({ indexed: false });
      return NextResponse.json({ success: true });
    }

    // ── Add / regenerate metadata ──────────────────────────────────────────
    const extractedText: string = mat.extractedText || '';
    if (!extractedText) {
      return NextResponse.json({ error: 'No extracted text' }, { status: 400 });
    }

    const category: string = mat.category || 'other';

    // Mark as pending before starting
    await matRef.update({ metaStatus: 'pending' });

    try {
      const skeletonInput = buildSkeletonInput(extractedText, category);
      const prompt = buildPrompt(skeletonInput, category);

      const result = await model.generateContent(prompt);
      const raw = result.response.text() || '{}';
      const clean = raw.replace(/```json|```/g, '').trim();

      let parsed: { summary?: string; topics?: { title: string; level: number; subtopics: string[] }[] } = {};
      try { parsed = JSON.parse(clean); } catch { parsed = {}; }

      const aiSummary: string = parsed.summary?.trim() || '';
      const topicTree: { title: string; level: number; subtopics: string[] }[] = Array.isArray(parsed.topics)
        ? parsed.topics.filter(t => t && typeof t.title === 'string' && t.title.trim().length > 0)
        : [];

      // Flat contentList for backward compatibility (library, topics panel)
      const contentList: string[] = topicTree.map(t => t.title);

      const indexDisplayName = mat.suggestedCourseName
        ? `${mat.suggestedCourseName} — ${(mat.category ?? 'material').replace('_', ' ')}`
        : mat.fileName;

      await matRef.update({
        indexed: true,
        aiSummary,
        contentList,
        topicTree,
        metaStatus: 'done',
        metaGeneratedAt: new Date().toISOString(),
        indexDisplayName,
        indexedAt: mat.indexedAt || new Date().toISOString(),
        indexedBy: 'admin',
      });

      return NextResponse.json({ success: true, aiSummary, contentList, topicTree });

    } catch (geminiErr: any) {
      // Gemini call failed — mark as failed so admin can see and retry
      console.error('[index-material] Gemini call failed:', geminiErr?.message || geminiErr);
      await matRef.update({ metaStatus: 'failed' });
      return NextResponse.json({ error: 'Metadata generation failed', detail: geminiErr?.message }, { status: 500 });
    }

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[index-material] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
