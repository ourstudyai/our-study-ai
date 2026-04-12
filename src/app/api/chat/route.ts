// src/app/api/chat/route.ts
// Streaming chat API using Groq llama-3.3-70b-versatile
// Includes RAG — fetches relevant material chunks from Firestore before responding

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getSystemPrompt } from "@/lib/gemini/system-prompts";
import { applyPrivacyWrapper } from "@/lib/gemini/privacy-wrapper";
import { getChunksByCourse } from "@/lib/firestore/materials";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  role: "user" | "assistant";
  content: string;
};

// ─── POST /api/chat ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse request body ───────────────────────────────────────────────
    const body = await req.json();

    const {
      messages,
      studyMode,
      courseId,
      courseName,
      courseDescription,
      userId,
    }: {
      messages: Message[];
      studyMode: string;
      courseId?: string;
      courseName?: string;
      courseDescription?: string;
      userId?: string;
    } = body;

    if (!messages || !studyMode) {
      return NextResponse.json(
        { error: "Missing required fields: messages, studyMode" },
        { status: 400 }
      );
    }

    // ── 2. Apply privacy wrapper ────────────────────────────────────────────
    const safeMessages = applyPrivacyWrapper(messages, userId ?? "anonymous");

    // ── 3. Fetch RAG context from Firestore ─────────────────────────────────
    let ragContext = "";

    if (courseId) {
      try {
        const chunks = await getChunksByCourse(courseId, 6);
        if (chunks.length > 0) {
          ragContext =
            "\n\n---\n" +
            "STUDY MATERIALS FOR THIS COURSE (use these to enrich your answers):\n\n" +
            chunks.map((c, i) => `[Material ${i + 1}]:\n${c.text}`).join("\n\n") +
            "\n---\n";
        }
      } catch (err) {
        // RAG failure should never block chat
        console.error("[chat] RAG fetch failed:", err);
      }
    }

    // ── 4. Build system prompt ──────────────────────────────────────────────
    const baseSystemPrompt = getSystemPrompt(studyMode, {
      courseName,
      courseDescription,
    });

    const systemPrompt = ragContext
      ? baseSystemPrompt + ragContext
      : baseSystemPrompt;

    // ── 5. Stream response from Groq ────────────────────────────────────────
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...safeMessages,
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    });

    // ── 6. Return SSE stream ────────────────────────────────────────────────
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[chat] Stream error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

  } catch (err) {
    console.error("[chat] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}