export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getMistralClient } from "@/lib/mistral/client";
import { queueArrangeChunks } from "@/lib/arrangeQueue";
import { arrangeStartCore, arrangeChunkCore } from "@/lib/processing/arranger";
import type { ArrangeDeps } from "@/lib/processing/arranger";

// Runs the AI arrangement pass. Called by QStash only. Two kinds of job:
//   { materialId }          start job: split the raw text, make the plan, queue one job per chunk
//   { materialId, index }   chunk job: clean one chunk and save it in materials/{id}/arranged/{index}
// The raw text in materials/{id}/body/extracted is only read, never changed.

const RETRIES = 3; // must match arrangeQueue.ts

function matRef(id: string) {
  return adminDb.collection("materials").doc(id);
}

function makeDeps(): ArrangeDeps {
  const model = process.env.MISTRAL_ARRANGE_MODEL || process.env.MISTRAL_READ_MODEL || "mistral-small-latest";
  return {
    getMaterial: async (id) => {
      const s = await matRef(id).get();
      return s.exists ? s.data() : null;
    },
    getText: async (id) => {
      const s = await matRef(id).collection("body").doc("extracted").get();
      return String((s.data() as any)?.extractedText ?? "");
    },
    hasChunk: async (id, index) => (await matRef(id).collection("arranged").doc(String(index)).get()).exists,
    saveChunk: async (id, index, data) => {
      await matRef(id).collection("arranged").doc(String(index)).set(data);
    },
    tally: async (id) => {
      const s = await matRef(id).collection("arranged").select("status").get();
      let kept = 0;
      s.docs.forEach((d) => { if ((d.data() as any).status === "kept_raw") kept++; });
      return { count: s.size, kept };
    },
    clearChunks: async (id) => {
      const s = await matRef(id).collection("arranged").select().get();
      for (let i = 0; i < s.docs.length; i += 400) {
        const batch = adminDb.batch();
        s.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    },
    setMaterial: async (id, update) => {
      await matRef(id).update(update);
    },
    enqueueChunks: queueArrangeChunks,
    chat: async (messages) => {
      const mistral: any = getMistralClient();
      const r = await mistral.chat.complete({ model, temperature: 0.1, maxTokens: 8000, messages });
      const choice = r.choices?.[0];
      const c = choice?.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : "";
      return { text, truncated: choice?.finishReason === "length" };
    },
    now: () => new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("upstash-signature");
    if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    const { Receiver } = await import("@upstash/qstash");
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
    const rawBody = await req.text();
    const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
    if (!isValid) return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });

    const body = JSON.parse(rawBody);
    const materialId = String(body?.materialId ?? "");
    if (!materialId) return NextResponse.json({ error: "Missing materialId." }, { status: 400 });

    // QStash tells us how many times it already tried. On the last try a failure keeps the raw chunk.
    const retried = Number(req.headers.get("upstash-retried") ?? 0) || 0;
    const lastAttempt = retried >= RETRIES;
    const deps = makeDeps();

    let out;
    if (body.index !== undefined && body.index !== null) {
      const index = Number(body.index);
      if (!Number.isInteger(index)) return NextResponse.json({ error: "Bad chunk index." }, { status: 400 });
      out = await arrangeChunkCore(deps, materialId, index, { lastAttempt });
    } else {
      out = await arrangeStartCore(deps, materialId);
    }

    // Temporary problem: let QStash try again. Anything else is final (answer 200 so it stops).
    if (!out.ok && out.retry) return NextResponse.json({ error: out.reason }, { status: 500 });
    return NextResponse.json({ success: out.ok, skipped: out.skipped ?? false, reason: out.reason ?? null });
  } catch (err) {
    console.error("[arrange-material]", err);
    return NextResponse.json({ error: "Arrangement failed." }, { status: 500 });
  }
}
