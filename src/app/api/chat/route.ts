export const dynamic = "force-dynamic";

// src/app/api/chat/route.ts
// Streaming chat endpoint — Groq LLM with RAG context from material_chunks

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getChunksByCourse } from "@/lib/firestore/materials";
import { getSystemPrompt } from "@/lib/gemini/system-prompts";

export async function POST(req: NextRequest) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  try {
    const body = await req.json();
    const { message, courseId, courseName, courseDescription, mode, conversationHistory, materialContext } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message." }), { status: 400 });
    }

    // ── RAG: fetch relevant chunks for this course ──────────────────────────
    let ragContext = "";
    let ragFailed = false;

    if (courseId) {
      try {
        const chunks = await getChunksByCourse(courseId, 6);
        if (chunks.length > 0) {
          ragContext = chunks.map((c, i) => `[Chunk ${i + 1}]\n${c.text}`).join("\n\n");
        }
      } catch (err) {
        console.error("[chat] RAG fetch failed:", err);
        ragFailed = true;
      }
    }

    // ── System prompt ───────────────────────────────────────────────────────
    let semesterSummary: string | undefined;

    if (ragFailed) {
      semesterSummary = "Note: Course materials could not be loaded right now. Let the student know naturally and answer from general knowledge where possible.";
    } else if (!ragContext) {
      semesterSummary = "Note: No course materials have been uploaded for this course yet. Let the student know naturally.";
    } else {
      semesterSummary = `Relevant course material excerpts:\n\n${ragContext}`;
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

    // ── Groq streaming call ─────────────────────────────────────────────────
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

    // ── Stream response back to client ──────────────────────────────────────
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