export const dynamic = "force-dynamic";

// src/app/api/chat/route.ts
// Streaming chat — Groq LLM with heading-aware keyword RAG

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { adminDb } from "@/lib/firebase/admin";
import { getSystemPrompt } from "@/lib/gemini/system-prompts";

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
  const fullPathLower = (chunk.fullPath ?? "").toLowerCase();
  const bodyLower = (chunk.text ?? "").toLowerCase();
  const fullPhrase = queryTerms.join(" ");

  for (const term of queryTerms) {
    // Exact heading match — highest value
    if (headingLower.includes(term)) score += 10;
    // Ancestor heading match
    if (ancestorsLower.includes(term)) score += 5;
    // Body frequency — count every occurrence
    const regex = new RegExp(term, "g");
    const bodyMatches = bodyLower.match(regex);
    if (bodyMatches) score += bodyMatches.length;
  }

  // Exact full phrase bonus
  if (bodyLower.includes(fullPhrase)) score += 15;
  if (headingLower.includes(fullPhrase)) score += 20;

  return score;
}

export async function POST(req: NextRequest) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  try {
    const body = await req.json();
    const { message, courseId, courseName, courseDescription, mode, conversationHistory, materialContext } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message." }), { status: 400 });
    }

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
              .slice(0, 6);
            ragContext = allChunks.map((c: any) => {
              const pathLabel = c.fullPath ? `[${c.fullPath}]` : `[${c.heading ?? 'Section'}]`;
              return `${pathLabel}\n${c.text}`;
            }).join("\n\n");
            lowConfidence = false;
          } else {
            lowConfidence = true;
            suggestedPaths = Array.from(new Set(docs.slice(0, 5).map(d => d.data().fullPath ?? d.data().heading ?? '').filter(Boolean)));
          }
        } else {
          const snap = await adminDb.collection('material_chunks')
            .where('courseId', '==', courseId)
            .limit(80)
            .get();
          if (!snap.empty) {
            const stopWords = new Set(['that','this','with','from','they','have','what','will','your','been','were','when','there','their','about','which','would','could','should','does','into','more','also','than','then','them','these','those','some','such','only','very','just','like','well','even','each','much','most','over','after','before','other','same','both','here','where','while','through','between','because','however','therefore','although','without']);
            const queryTerms = message.toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter((w: string) => w.length > 2 && !stopWords.has(w));
            const docs = snap.docs.filter(d => !d.data().deleted);
            const scored = docs
              .map(d => ({
                chunk: d.data() as ChunkDoc,
                score: scoreChunk(d.data() as ChunkDoc, queryTerms),
              }))
              .filter(s => s.score > 0)
              .sort((a, b) => b.score - a.score);
            const topScore = scored[0]?.score ?? 0;
            const secondScore = scored[1]?.score ?? 0;
            const top3Total = scored.slice(0, 3).reduce((sum, s) => sum + s.score, 0);
            const absolutelyLow = topScore < 5;
            const noStandout = topScore > 0 && (topScore - secondScore) < 3;
            lowConfidence = absolutelyLow && noStandout && top3Total < 10;

          if (scored.length > 0) {
            const top = scored.slice(0, 12);

            // Collect suggested headings for fallback message
            suggestedPaths = Array.from(
              new Set(scored.slice(0, 5).map(s => s.chunk.fullPath ?? s.chunk.heading ?? "").filter(Boolean))
            );

            ragContext = top.map((s, i) => {
              const pathLabel = s.chunk.fullPath ? `[${s.chunk.fullPath}]` : `[Chunk ${i + 1}]`;
              return `${pathLabel}\n${s.chunk.text}`;
            }).join("\n\n");
            }
          }
        }
      } catch (err) {
        console.error("[chat] RAG fetch failed:", err);
        ragFailed = true;
      }
    }

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

    const systemPrompt = getSystemPrompt(
      mode ?? "general",
      courseName ?? "this course",
      courseDescription ?? "",
      semesterSummary
    );

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...(Array.isArray(conversationHistory) ? conversationHistory : []),
        { role: "user", content: message },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: delta })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
