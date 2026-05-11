export const dynamic = "force-dynamic";

// src/app/api/chat/route.ts
// Streaming chat — Gemini 2.5 Flash-Lite with optimised RAG for 1M context

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { cookies } from "next/headers";
import { getSystemPrompt, buildCourseMap, CourseMaterialMeta } from "@/lib/gemini/system-prompts";
import { searchTavily } from "@/lib/search/tavily";
import { hybridSearch } from "@/lib/qdrant/search";

interface ChunkDoc {
  text: string;
  heading?: string;
  headingLevel?: number;
  ancestorHeadings?: string[];
  fullPath?: string;
  deleted?: boolean;
}

function scoreChunk(chunk: ChunkDoc, queryTerms: string[]): number {
  let score = 0;
  const headingLower = (chunk.heading ?? "").toLowerCase();
  const ancestorsLower = (chunk.ancestorHeadings ?? []).join(" ").toLowerCase();
  const bodyLower = (chunk.text ?? "").toLowerCase();
  const fullPhrase = queryTerms.join(" ");

  for (const term of queryTerms) {
    if (headingLower.includes(term)) score += 10;
    if (ancestorsLower.includes(term)) score += 5;
    const regex = new RegExp(term, "g");
    const bodyMatches = bodyLower.match(regex);
    if (bodyMatches) score += bodyMatches.length;
  }

  if (bodyLower.includes(fullPhrase)) score += 15;
  if (headingLower.includes(fullPhrase)) score += 20;

  return score;
}

const RAG_TOP_K = 12;
const CHUNK_CHAR_LIMIT = 4000;
const HISTORY_MESSAGES = 10;
const MAX_OUTPUT_TOKENS = 2048;

// ── Fetch course material metadata for Course Map ─────────────────────────────
// Reads only the lightweight metadata fields — never extractedText.
// Used to build the Course Map injected into every system prompt.

async function fetchCourseMetadata(courseId: string): Promise<CourseMaterialMeta[]> {
  try {
    const [ownSnap, sharedSnap] = await Promise.all([
      adminDb.collection('materials')
        .where('confirmedCourseId', '==', courseId)
        .where('status', '==', 'approved')
        .where('indexed', '==', true)
        .get(),
      adminDb.collection('materials')
        .where('sharedCourseIds', 'array-contains', courseId)
        .where('status', '==', 'approved')
        .where('indexed', '==', true)
        .get(),
    ]);

    const seen = new Set<string>();
    const allDocs = [...ownSnap.docs, ...sharedSnap.docs].filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    return allDocs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        fileName: data.fileName ?? '',
        indexDisplayName: data.indexDisplayName,
        category: data.category ?? 'other',
        aiSummary: data.aiSummary,
        contentList: data.contentList,
        topicTree: data.topicTree,
        wordCount: data.wordCount,
        pageCount: data.pageCount,
      } as CourseMaterialMeta;
    });
  } catch (err) {
    console.error('[chat] fetchCourseMetadata failed:', err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

  try {
    const session = cookies().get("session")?.value;
    if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    try { await adminAuth.verifyIdToken(session); } catch { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }); }

    const body = await req.json();
    const { message, courseId, courseName, courseDescription, mode, conversationHistory, materialContext } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message." }), { status: 400 });
    }

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const emit = (payload: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

        try {
          // ── Stage 1: fetch course map + search materials ───────────────
          emit({ type: "status", stage: "searching", label: "Searching materials…" });

          // Fetch course metadata for Course Map (runs in parallel with RAG)
          const courseMetaPromise = courseId ? fetchCourseMetadata(courseId) : Promise.resolve([]);

          let ragContext = "";
          let ragFailed = false;
          let lowConfidence = false;
          let suggestedPaths: string[] = [];

          const topicMatch = message.match(/^\[TOPIC:(.+?)\]/);
          const topicHeading = topicMatch ? topicMatch[1].trim() : null;

          if (courseId) {
            try {
              if (topicHeading) {
                const snap = await adminDb.collection('material_chunks')
                  .where('courseId', '==', courseId)
                  .limit(300)
                  .get();
                const docs = snap.docs.filter(d => !d.data().deleted);
                const headingLower = topicHeading.toLowerCase();
                const matched = docs.filter(d => {
                  const h = (d.data().heading ?? '').toLowerCase();
                  const fp = (d.data().fullPath ?? '').toLowerCase();
                  return h.includes(headingLower) || headingLower.includes(h) || fp.includes(headingLower);
                });
                if (matched.length > 0) {
                  const matchedData = matched.map(d => ({ id: d.id, ...(d.data() as ChunkDoc & { chunkIndex?: number; materialId?: string }) }));
                  matchedData.sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
                  const firstMatch = matchedData[0];
                  const siblings = docs
                    .filter(d => {
                      const data = d.data() as ChunkDoc & { chunkIndex?: number; materialId?: string };
                      return data.materialId === firstMatch.materialId &&
                        Math.abs((data.chunkIndex ?? 0) - (firstMatch.chunkIndex ?? 0)) <= 2 &&
                        !matchedData.find(m => m.id === d.id);
                    })
                    .map(d => ({ id: d.id, ...(d.data() as ChunkDoc & { chunkIndex?: number; materialId?: string }) }));
                  const allChunks = [...matchedData, ...siblings]
                    .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))
                    .slice(0, RAG_TOP_K);
                  ragContext = allChunks.map((c: any) => {
                    const pathLabel = c.fullPath ? `[${c.fullPath}]` : `[${c.heading ?? 'Section'}]`;
                    return `${pathLabel}\n${c.text.slice(0, CHUNK_CHAR_LIMIT)}`;
                  }).join("\n\n");
                  lowConfidence = false;
                } else {
                  lowConfidence = true;
                  suggestedPaths = Array.from(new Set(docs.slice(0, 5).map(d => d.data().fullPath ?? d.data().heading ?? '').filter(Boolean)));
                }
              } else {
                const qdrantResults = await hybridSearch(message, courseId, RAG_TOP_K);
                if (qdrantResults.length > 0) {
                  ragContext = qdrantResults.map(r => {
                    const pathLabel = r.fullPath ? `[${r.fullPath}]` : `[${r.heading ?? 'Section'}]`;
                    return `${pathLabel}\n${r.text.slice(0, CHUNK_CHAR_LIMIT)}`;
                  }).join("\n\n");
                  suggestedPaths = Array.from(new Set(qdrantResults.slice(0, 5).map(r => r.fullPath ?? r.heading ?? '').filter(Boolean)));
                  lowConfidence = qdrantResults[0]?.score < 0.005;
                }
              }
            } catch (err) {
              console.error("[chat] RAG fetch failed:", err);
              ragFailed = true;
            }
          }

          // ── Stage 2: build system prompt with course map ───────────────
          emit({ type: "status", stage: "generating", label: "Generating response…" });

          // Await the course metadata fetched in parallel with RAG
          const courseMaterials = await courseMetaPromise;
          const courseMap = courseMaterials.length > 0 ? buildCourseMap(courseMaterials) : '';

          let semesterSummary: string | undefined;

          if (ragFailed) {
            semesterSummary = "Note: Course materials could not be loaded right now. Let the student know naturally and answer from general knowledge where possible.";
          } else if (!ragContext) {
            semesterSummary = `Note: No matching material found for this query in the course materials. Warmly let the student know. If you can suggest what heading or topic in ${courseName ?? "this course"} might cover this, do so. Then ask if they'd like you to answer from general theological/philosophical knowledge instead.`;
          } else if (lowConfidence) {
            const pathHint = suggestedPaths.length > 0
              ? ` The closest material sections found are: ${suggestedPaths.join(", ")}.`
              : "";
            semesterSummary = `Note: The match between the student's query and course materials is weak.${pathHint} Gently let the student know the exact terms used in their materials, suggest the relevant section heading if available, and ask if they'd like you to answer from that section or from general knowledge. Do not fabricate material content.\n\nAvailable material excerpts (low relevance):\n\n${ragContext}`;
          } else {
            semesterSummary = `Relevant course material excerpts (answer primarily from these, use the exact headings and terminology as they appear):\n\n${ragContext}`;
          }

          if (materialContext) {
            semesterSummary = (semesterSummary ? semesterSummary + '\n\n' : '') +
              `ACTIVE STUDY MATERIAL (student has loaded this for focused study — answer questions with this as primary reference):\n\n${materialContext}`;
          }

          let webSearchContext = '';
          if (mode === 'research') {
            const webResults = await searchTavily(message, 5);
            if (webResults.length > 0) {
              webSearchContext = '\n\nWEB SEARCH RESULTS (external — cite URL, label as external source):\n' +
                webResults.map((r, i) =>
                  `[WEB ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 600)}`
                ).join('\n\n');
            }
          }

          if (webSearchContext) {
            semesterSummary = (semesterSummary ?? '') + webSearchContext;
          }

          const systemPrompt = getSystemPrompt(
            mode ?? "general",
            courseName ?? "this course",
            courseDescription ?? "",
            semesterSummary,
            courseMap,
          );

          const geminiHistory = Array.isArray(conversationHistory)
            ? conversationHistory.slice(-HISTORY_MESSAGES).map((m: { role: string; content: string }) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
              }))
            : [];

          const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash-lite",
            systemInstruction: systemPrompt,
            generationConfig: {
              temperature: 0.7,
              topP: 0.9,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            },
          });

          const chat = model.startChat({ history: geminiHistory });
          const result = await chat.sendMessageStream(message);

          // ── Stage 3: stream response ───────────────────────────────────
          emit({ type: "status", stage: "streaming", label: "Responding…" });

          for await (const chunk of result.stream) {
            const delta = chunk.text();
            if (delta) {
              emit({ type: "text", content: delta });
            }
          }

          // Analytics — fire and forget
          try {
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
            const hour = new Date().getHours();
            const analyticsRef = adminDb.collection('analytics').doc('daily');
            const { FieldValue } = await import('firebase-admin/firestore');
            await analyticsRef.set({
              [`prompts_${today}`]: FieldValue.increment(1),
              [`responses_${today}`]: FieldValue.increment(1),
              [`sessions_${today}`]: FieldValue.increment(1),
              [`hourly_${hour}`]: FieldValue.increment(1),
              total_sessions: FieldValue.increment(1),
            }, { merge: true });
          } catch (_) {}

          emit({ type: "done" });

        } catch (err) {
          console.error("[chat] Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

  } catch (err) {
    console.error("[chat] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
