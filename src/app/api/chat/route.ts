// src/app/api/chat/route.ts
// Streaming chat API using Groq llama-3.3-70b-versatile
// Includes RAG — fetches relevant material chunks from Firestore before responding

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getSystemPrompt } from "@/lib/gemini/system-prompts";
import { getChunksByCourse } from "@/lib/firestore/materials";
import { StudyMode } from "@/lib/types";

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
    }: {
      messages: Message[];
      studyMode: StudyMode;
      courseId?: string;
      courseName?: string;
      courseDescription?: string;
    } = body;

    if (!messages || !studyMode) {
      return NextResponse.json(
        { error: "Missing required fields: messages, studyMode" },
        { status: 400 }
      );
    }

    // ── 2. Fetch RAG context from Firestore ─────────────────────────────────
    let ragContext = "";
    let ragStatus: "loaded" | "empty" | "error" = "empty";

    if (courseId) {
      try {
        const chunks = await getChunksByCourse(courseId, 6);

        if (chunks.length > 0) {
          ragStatus = "loaded";
          ragContext =
            "\n\n---\n" +
            "STUDY MATERIALS FOR THIS COURSE (use these to enrich your answers. " +
            "When you use information from these materials, naturally mention that " +
            "it comes from the course materials uploaded by your institution):\n\n" +
            chunks.map((c, i) => `[Material ${i + 1}]:\n${c.text}`).join("\n\n") +
            "\n---\n";
        } else {
          ragStatus = "empty";
        }

      } catch (err) {
        console.error("[chat] RAG fetch failed:", err);
        ragStatus = "error";
      }
    }

    // ── 3. Build RAG notice for AI ──────────────────────────────────────────
    let ragNotice = "";

    if (ragStatus === "empty") {
      ragNotice =
        "\n\nIMPORTANT: No study materials have been uploaded yet for this course. " +
        "Let the student know naturally and early in your response that you are " +
        "answering from general knowledge and training data only, not from any " +
        "institution-specific materials. Encourage them to ask their admin to " +
        "upload course materials to improve your responses.";
    } else if (ragStatus === "error") {
      ragNotice =
        "\n\nIMPORTANT: You were unable to load the study materials for this course " +
        "due to a technical issue. Let the student know naturally that you are " +
        "answering from general knowledge only right now, and that they should " +
        "try again shortly or inform their admin if the issue persists.";
    }

    // ── 4. Build system prompt ──────────────────────────────────────────────
    // getSystemPrompt expects: (mode, courseName, courseDescription, semesterSummary?)
    const baseSystemPrompt = getSystemPrompt(
      studyMode,
      courseName ?? "Unknown Course",
      courseDescription ?? "",
    );

    const systemPrompt = baseSystemPrompt + ragNotice + ragContext;

    // ── 5. Stream response from Groq ────────────────────────────────────────
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
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