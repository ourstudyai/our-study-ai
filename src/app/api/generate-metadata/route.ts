export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getMistralClient } from '@/lib/mistral/client';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TopicNode {
  title: string;
  level: number;
  subtopics: TopicNode[];
}

interface HeadingLine {
  raw: string;
  level: number;
}

// ── Heading extractor ─────────────────────────────────────────────────────────

function extractHeadings(extractedText: string): HeadingLine[] {
  const lines = extractedText.split('\n');
  const result: HeadingLine[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const mdMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (mdMatch) {
      result.push({ raw: trimmed, level: mdMatch[1].length });
      continue;
    }
    const isBoldCaps = /^\*\*[A-Z][A-Z0-9\s\-:,./]{3,}\*\*\s*$/.test(trimmed);
    if (isBoldCaps) { result.push({ raw: trimmed, level: 1 }); continue; }
    const isAllCaps = /^[A-Z][A-Z0-9\s\-:,./]{4,}$/.test(trimmed) && trimmed.length < 100;
    if (isAllCaps) { result.push({ raw: trimmed, level: 1 }); continue; }
  }
  return result;
}

// ── Split headings into major sections ───────────────────────────────────────
// Each section = one level-1 heading + all its descendants.
// Oversized sections (> MAX_SECTION_HEADINGS) are split at the nearest
// level-2 boundary to stay within token limits.

const MAX_SECTION_HEADINGS = 60;

function splitIntoSections(headings: HeadingLine[]): HeadingLine[][] {
  const sections: HeadingLine[][] = [];
  let current: HeadingLine[] = [];

  for (const h of headings) {
    if (h.level === 1 && current.length > 0) {
      // Flush current section — split if oversized
      sections.push(...splitOversized(current));
      current = [];
    }
    current.push(h);
  }
  if (current.length > 0) sections.push(...splitOversized(current));

  return sections;
}

function splitOversized(section: HeadingLine[]): HeadingLine[][] {
  if (section.length <= MAX_SECTION_HEADINGS) return [section];

  // Split at level-2 boundaries
  const parts: HeadingLine[][] = [];
  let part: HeadingLine[] = [];
  const header = section[0]; // level-1 heading — prepend to each part

  for (let i = 0; i < section.length; i++) {
    const h = section[i];
    if (h.level === 2 && part.length > 0 && part.length >= MAX_SECTION_HEADINGS) {
      parts.push(part);
      part = [header]; // carry level-1 parent into next part for context
    }
    part.push(h);
  }
  if (part.length > 0) parts.push(part);
  return parts.length > 0 ? parts : [section];
}

// ── Flatten tree ──────────────────────────────────────────────────────────────

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

// ── Mistral: summary ──────────────────────────────────────────────────────────

async function generateSummary(
  mistral: any,
  extractedText: string,
  category: string
): Promise<string> {
  const opening = extractedText.split(/\s+/).slice(0, 800).join(' ');

  let prompt = '';
  if (category === 'past_questions') {
    prompt = `You are indexing a study material for a Catholic seminary library.
From the following past examination questions, write ONE sentence describing what years and subject areas the questions cover.
Return ONLY the sentence. No JSON. No preamble.\n\nMaterial:\n${opening}`;
  } else if (category === 'aoc') {
    prompt = `You are indexing a study material for a Catholic seminary library.
From the following Areas of Concentration document, write ONE sentence describing the exam year and subject covered.
Return ONLY the sentence. No JSON. No preamble.\n\nMaterial:\n${opening}`;
  } else {
    prompt = `You are indexing a study material for a Catholic seminary library.
Write 2-3 sentences describing what this study material covers and why it matters for seminary students.
Return ONLY the sentences. No JSON. No preamble.\n\nMaterial opening:\n${opening}`;
  }

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    temperature: 0.2,
    maxTokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return ((response.choices?.[0]?.message?.content as string) || '').trim();
}

// ── Mistral: one section → nested TopicNode ───────────────────────────────────

async function processSection(
  mistral: any,
  section: HeadingLine[]
): Promise<TopicNode[]> {
  const headingText = section.map(h => h.raw).join('\n');

  const prompt = `You are indexing a study material for a Catholic seminary library.
Some headings may be poorly formatted due to OCR scanning — infer the correct clean heading from context, normalise capitalisation to title case, and fix obvious OCR errors.
For subsections with generic names (e.g. "Example", "Exercise", "Definition", "Vocabulary", "Translation"), append a bracketed qualifier showing what they are about, derived from their parent heading context. E.g. "Example [Genitive Case]", "Exercise [The Imperative]".
Where two nodes share an ambiguous title at the same level, append a bracketed qualifier to distinguish them.
Return ONLY a valid JSON array. No markdown. No code fences. No preamble. No explanation.

From the following document headings (indented to show hierarchy), build a nested topic tree.
Rules:
1. level 1 = major section, level 2 = subsection, level 3 = sub-subsection.
2. Every node: { "title": string, "level": number, "subtopics": [ ...same shape... ] }
3. Leaf nodes have "subtopics": []
4. Nest correctly — do NOT flatten.
5. Do not invent topics not present in the headings.

Headings:
${headingText}

Return JSON array: [ { "title": "...", "level": 1, "subtopics": [...] } ]`;

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    temperature: 0.2,
    maxTokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (response.choices?.[0]?.message?.content as string) || '[]';
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      return parsed.filter((t: any) => t && typeof t.title === 'string' && t.title.trim().length > 0);
    }
    return [];
  } catch {
    console.error('[generate-metadata] section parse failed:', clean.slice(0, 200));
    return [];
  }
}

// ── Mistral: simple topics for past_questions / aoc ───────────────────────────

async function generateSimpleTopics(
  mistral: any,
  extractedText: string,
  category: string
): Promise<TopicNode[]> {
  const prompt = `You are indexing a study material for a Catholic seminary library.
Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No explanation.

From the following ${category === 'past_questions' ? 'past examination questions' : 'Areas of Concentration document'}, extract:
- "topics": an array of distinct subject areas. Each: { "title": string, "level": 1, "subtopics": [] }

Material:
${extractedText.slice(0, 8000)}

Return JSON: { "topics": [...] }`;

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    temperature: 0.2,
    maxTokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (response.choices?.[0]?.message?.content as string) || '{}';
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.topics)) {
      return parsed.topics.filter((t: any) => t && typeof t.title === 'string' && t.title.trim().length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
    const mistral = getMistralClient();
    const cat = category || 'other';

    // Call 1: summary
    const aiSummary = await generateSummary(mistral, extractedText, cat);

    // Call 2+: topics
    let topicTree: TopicNode[] = [];

    if (cat === 'past_questions' || cat === 'aoc') {
      topicTree = await generateSimpleTopics(mistral, extractedText, cat);
    } else {
      const headings = extractHeadings(extractedText);
      const sections = splitIntoSections(headings);

      for (const section of sections) {
        const nodes = await processSection(mistral, section);
        topicTree.push(...nodes);
      }
    }

    const contentList = flattenTree(topicTree);

    await matRef.update({
      aiSummary,
      contentList,
      topicTree,
      metaStatus: 'done',
      metaGeneratedAt: new Date().toISOString(),
    });

    console.log(`[generate-metadata] Done for ${materialId} — ${topicTree.length} top-level topics`);
    return NextResponse.json({ ok: true, materialId, topicCount: topicTree.length });

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[generate-metadata] Failed for ${materialId}:`, message);
    try { await matRef.update({ metaStatus: 'failed' }); } catch (_) {}
    return NextResponse.json({ error: 'Metadata generation failed', detail: message }, { status: 500 });
  }
}
