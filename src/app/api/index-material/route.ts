export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { getMistralClient } from '@/lib/mistral/client';

// ── Heading skeleton extractor ────────────────────────────────────────────────
//
// Strategy: send ALL heading lines (every #/##/###/####, bold-caps, all-caps)
// plus the first ~600 words for context. For past_questions / aoc we still
// send a generous raw slice because those docs have no heading structure.
//
// We no longer cap at 1500 words of body text — headings alone can exceed that
// for long notes, and the Mistral Small context window is 32 k tokens so there
// is plenty of room.

function buildSkeletonInput(extractedText: string, category: string): string {
  // ── Past questions / AOC: send raw opening (no heading structure to mine) ──
  if (category === 'past_questions' || category === 'aoc') {
    return extractedText.slice(0, 12_000);
  }

  const lines = extractedText.split('\n');
  const headingLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect markdown table rows — skip them (they pollute heading lists)
    if (trimmed.startsWith('|')) { inTable = true; continue; }
    if (inTable && !trimmed.startsWith('|')) inTable = false;
    if (inTable) continue;

    const isMarkdownHeading = /^#{1,4}\s+.+/.test(trimmed);
    // Bold all-caps / bold title-case lines (OCR artefacts often come out this way)
    const isBoldCaps = /^\*\*[A-Z][A-Z0-9\s\-:,./'']{2,}\*\*\s*$/.test(trimmed);
    const isBoldTitle = /^\*\*[A-Z][a-zA-Z0-9\s\-:,./'']{3,}\*\*\s*$/.test(trimmed);
    // Plain all-caps lines (short enough to be a heading, not a sentence)
    const isAllCapsLine =
      /^[A-Z][A-Z0-9\s\-:,./'']{3,}$/.test(trimmed) && trimmed.length < 120;
    // Numbered section headings like "1. Introduction", "2.3 Background"
    const isNumberedHeading =
      /^\d+(\.\d+)*\.?\s+[A-Z]/.test(trimmed) && trimmed.length < 120;

    if (
      isMarkdownHeading ||
      isBoldCaps ||
      isBoldTitle ||
      isAllCapsLine ||
      isNumberedHeading
    ) {
      headingLines.push(trimmed);
    }
  }

  // Opening text for summary context — first 800 words
  const firstWords = extractedText.split(/\s+/).slice(0, 800).join(' ');

  // If we found very few headings, also include a larger body slice so the
  // model can infer structure from paragraph openings
  const bodySlice =
    headingLines.length < 5
      ? '\n\n=== DOCUMENT BODY (first 4000 chars) ===\n' +
        extractedText.slice(0, 4_000)
      : '';

  return [
    '=== DOCUMENT HEADINGS (all levels) ===',
    headingLines.join('\n') || '(no structured headings detected)',
    '\n=== DOCUMENT OPENING (for summary context) ===',
    firstWords,
    bodySlice,
  ].join('\n');
}

// ── Category-aware Mistral prompt ─────────────────────────────────────────────

function buildPrompt(skeletonInput: string, category: string): string {
  const base = `You are indexing a study material for a Catholic seminary library.
Some headings may be poorly formatted due to OCR scanning — infer the correct clean heading from context, normalise capitalisation to title case, and fix obvious OCR errors.
Where two nodes at any level share an ambiguous title, append a bracketed qualifier, e.g. "Definition and Examples [Object]" vs "Definition and Examples [Conscience]".
Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No explanation.`;

  if (category === 'past_questions') {
    return `${base}

From the following past examination questions, extract:
- "summary": one sentence describing what years and subject areas the questions cover.
- "topics": an array of distinct subject areas/topics. Each topic: { "title": string, "level": 1, "subtopics": [] }

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
- "topics": the FULL nested topic tree to every depth level present in the document.
  Rules:
  1. level 1 = major section (# heading or all-caps line), level 2 = subsection (## or bold-caps), level 3 = sub-subsection, and so on.
  2. Every node has: { "title": string, "level": number, "subtopics": [ ...same shape recursively... ] }
  3. Leaf nodes have "subtopics": []
  4. Do NOT flatten — nested headings MUST appear as children of their parent, not as siblings.
  5. Do not invent topics not present in the headings.
  6. Numbered section headings (e.g. "1. Introduction", "2.3 Background") should be cleaned — strip the leading number and keep the title text.
  7. If a numbered heading (e.g. "2.") contains sub-numbered headings (e.g. "2.1", "2.2"), those are its children.

Material:
${skeletonInput}

Return JSON: { "summary": "...", "topics": [ { "title": "...", "level": 1, "subtopics": [ { "title": "...", "level": 2, "subtopics": [] } ] } ] }`;
}

// ── Flatten tree → string[] for contentList ───────────────────────────────────

interface TopicNode {
  title: string;
  level: number;
  subtopics: TopicNode[];
}

function flattenTree(nodes: TopicNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.title?.trim()) result.push(node.title.trim());
    if (Array.isArray(node.subtopics) && node.subtopics.length > 0) {
      result.push(...flattenTree(node.subtopics));
    }
  }
  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

    await matRef.update({ metaStatus: 'pending' });

    try {
      const mistral = getMistralClient();
      const skeletonInput = buildSkeletonInput(extractedText, category);
      const prompt = buildPrompt(skeletonInput, category);

      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        temperature: 0.1,
        maxTokens: 16384,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = (response.choices?.[0]?.message?.content as string) || '{}';
      const clean = raw.replace(/```json|```/g, '').trim();

      let parsed: { summary?: string; topics?: TopicNode[] } = {};
      try { parsed = JSON.parse(clean); } catch {
        console.error('[index-material] JSON parse failed:', clean.slice(0, 300));
        parsed = {};
      }

      const aiSummary: string = parsed.summary?.trim() || '';
      const topicTree: TopicNode[] = Array.isArray(parsed.topics)
        ? parsed.topics.filter(t => t && typeof t.title === 'string' && t.title.trim().length > 0)
        : [];

      const contentList: string[] = flattenTree(topicTree);

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

    } catch (mistralErr: any) {
      console.error('[index-material] Mistral call failed:', mistralErr?.message || mistralErr);
      await matRef.update({ metaStatus: 'failed' });
      return NextResponse.json({ error: 'Metadata generation failed', detail: mistralErr?.message }, { status: 500 });
    }

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('[index-material] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
