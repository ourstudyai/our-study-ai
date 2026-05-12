export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { getMistralClient } from '@/lib/mistral/client';

// ── Heading skeleton extractor ────────────────────────────────────────────────

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
  1. level 1 = major section, level 2 = subsection, level 3 = sub-subsection, and so on.
  2. Every node has: { "title": string, "level": number, "subtopics": [ ...same shape recursively... ] }
  3. Leaf nodes have "subtopics": []
  4. Do NOT flatten — nested headings must appear as children, not siblings.
  5. Do not invent topics not present in the headings.

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
        temperature: 0.2,
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
