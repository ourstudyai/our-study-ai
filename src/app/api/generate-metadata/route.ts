export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getMistralClient } from '@/lib/mistral/client';

const QSTASH_URL = 'https://qstash.upstash.io/v2/publish';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://our-study-ai.vercel.app';
const SECTIONS_PER_HOP = 3;

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
    const isTitleCaseSection = /^(Lesson|Chapter|Part|Section|Unit|Volume|Appendix|Introduction|Conclusion)\s+[\dIVXivx]+/i.test(trimmed) && trimmed.length < 80;
    if (isTitleCaseSection) { result.push({ raw: trimmed, level: 1 }); continue; }
  }
  return result;
}

// ── Split headings into major sections ───────────────────────────────────────

const MAX_SECTION_HEADINGS = 60;

function splitIntoSections(headings: HeadingLine[]): HeadingLine[][] {
  const sections: HeadingLine[][] = [];
  let current: HeadingLine[] = [];

  for (const h of headings) {
    if (h.level === 1 && current.length > 0) {
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
  const parts: HeadingLine[][] = [];
  let part: HeadingLine[] = [];
  const header = section[0];
  for (let i = 0; i < section.length; i++) {
    const h = section[i];
    if (h.level === 2 && part.length > 0 && part.length >= MAX_SECTION_HEADINGS) {
      parts.push(part);
      part = [header];
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
    prompt = `You are indexing a study material for a Catholic seminary library.\nFrom the following past examination questions, write ONE sentence describing what years and subject areas the questions cover.\nReturn ONLY the sentence. No JSON. No preamble.\n\nMaterial:\n${opening}`;
  } else if (category === 'aoc') {
    prompt = `You are indexing a study material for a Catholic seminary library.\nFrom the following Areas of Concentration document, write ONE sentence describing the exam year and subject covered.\nReturn ONLY the sentence. No JSON. No preamble.\n\nMaterial:\n${opening}`;
  } else {
    prompt = `You are indexing a study material for a Catholic seminary library.\nWrite 2-3 sentences describing what this study material covers and why it matters for seminary students.\nReturn ONLY the sentences. No JSON. No preamble.\n\nMaterial opening:\n${opening}`;
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
  const prompt = `You are indexing a study material for a Catholic seminary library.\nSome headings may be poorly formatted due to OCR scanning — infer the correct clean heading from context, normalise capitalisation to title case, and fix obvious OCR errors.\nFor subsections with generic names (e.g. "Example", "Exercise", "Definition", "Vocabulary", "Translation"), append a bracketed qualifier showing what they are about, derived from their parent heading context. E.g. "Example [Genitive Case]", "Exercise [The Imperative]".\nWhere two nodes share an ambiguous title at the same level, append a bracketed qualifier to distinguish them.\nReturn ONLY a valid JSON array. No markdown. No code fences. No preamble. No explanation.\n\nFrom the following document headings (indented to show hierarchy), build a nested topic tree.\nRules:\n1. level 1 = major section, level 2 = subsection, level 3 = sub-subsection.\n2. Every node: { "title": string, "level": number, "subtopics": [ ...same shape... ] }\n3. Leaf nodes have "subtopics": []\n4. Nest correctly — do NOT flatten.\n5. Do not invent topics not present in the headings.\n\nHeadings:\n${headingText}\n\nReturn JSON array: [ { "title": "...", "level": 1, "subtopics": [...] } ]`;

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
  const prompt = `You are indexing a study material for a Catholic seminary library.\nReturn ONLY a valid JSON object. No markdown. No code fences. No preamble. No explanation.\n\nFrom the following ${category === 'past_questions' ? 'past examination questions' : 'Areas of Concentration document'}, extract:\n- "topics": an array of distinct subject areas. Each: { "title": string, "level": 1, "subtopics": [] }\n\nMaterial:\n${extractedText.slice(0, 8000)}\n\nReturn JSON: { "topics": [...] }`;

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

// ── Chain next hop via QStash ─────────────────────────────────────────────────

async function chainNextHop(payload: object) {
  await fetch(`${QSTASH_URL}/${APP_URL}/api/generate-metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
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

  const {
    materialId,
    category,
    extractedText,
    sections: incomingSections,
    startSectionIndex = 0,
    partialTopicTree = [],
    aiSummary: incomingSummary,
  } = JSON.parse(rawBody);

  if (!materialId || !extractedText) {
    return NextResponse.json({ error: 'Missing materialId or extractedText' }, { status: 400 });
  }

  const matRef = adminDb.collection('materials').doc(materialId);
  const mistral = getMistralClient();
  const cat = category || 'other';

  try {
    // ── First hop only: generate summary + compute sections ───────────────────
    let aiSummary: string = incomingSummary || '';
    let sections: HeadingLine[][] = incomingSections || [];

    if (startSectionIndex === 0) {
      // Generate summary
      aiSummary = await generateSummary(mistral, extractedText, cat);

      // Save summary immediately so library shows it even before topics complete
      await matRef.update({
        aiSummary,
        metaStatus: 'processing',
        metaGeneratedAt: new Date().toISOString(),
      });

      // For past_questions / aoc — single call, no chaining needed
      if (cat === 'past_questions' || cat === 'aoc') {
        const topicTree = await generateSimpleTopics(mistral, extractedText, cat);
        const contentList = flattenTree(topicTree);
        await matRef.update({
          topicTree,
          contentList,
          metaStatus: 'done',
        });
        console.log(`[generate-metadata] Done for ${materialId} — ${topicTree.length} topics`);
        return NextResponse.json({ ok: true, materialId, topicCount: topicTree.length });
      }

      // Compute sections once — passed to all subsequent hops
      const headings = extractHeadings(extractedText);
      sections = splitIntoSections(headings);
      console.log(`[generate-metadata] ${materialId} — ${sections.length} sections, processing in hops of ${SECTIONS_PER_HOP}`);
    }

    const totalSections = sections.length;

    // ── Process this hop's sections ───────────────────────────────────────────
    const hopSections = sections.slice(startSectionIndex, startSectionIndex + SECTIONS_PER_HOP);
    const hopNodes: TopicNode[] = [];

    for (const section of hopSections) {
      const nodes = await processSection(mistral, section);
      hopNodes.push(...nodes);
    }

    const accumulatedTree: TopicNode[] = [...partialTopicTree, ...hopNodes];
    const nextIndex = startSectionIndex + SECTIONS_PER_HOP;

    if (nextIndex < totalSections) {
      // ── More sections remain — chain next hop ─────────────────────────────
      await chainNextHop({
        materialId,
        category: cat,
        extractedText,
        sections,
        startSectionIndex: nextIndex,
        partialTopicTree: accumulatedTree,
        aiSummary,
      });
      console.log(`[generate-metadata] ${materialId} — hop ${startSectionIndex}–${startSectionIndex + hopSections.length - 1} done, chaining from ${nextIndex} of ${totalSections}`);
    } else {
      // ── All sections done — save final tree ───────────────────────────────
      const contentList = flattenTree(accumulatedTree);
      await matRef.update({
        topicTree: accumulatedTree,
        contentList,
        metaStatus: 'done',
      });
      console.log(`[generate-metadata] Done for ${materialId} — ${accumulatedTree.length} top-level topics`);
    }

    return NextResponse.json({
      ok: true,
      materialId,
      hopDone: `${startSectionIndex}–${startSectionIndex + hopSections.length - 1}`,
      totalSections,
    });

  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[generate-metadata] Failed for ${materialId}:`, message);
    try { await matRef.update({ metaStatus: 'failed' }); } catch (_) {}
    return NextResponse.json({ error: 'Metadata generation failed', detail: message }, { status: 500 });
  }
}
