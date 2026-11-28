export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { readMaterial } from "@/lib/processing/reader";

// Runs the AI reading pass for one material. Called by QStash only.
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

    const { materialId } = JSON.parse(rawBody);
    if (!materialId) return NextResponse.json({ error: "Missing materialId." }, { status: 400 });

    const out = await readMaterial(String(materialId));
    if (!out.ok && out.retry) {
      // Temporary problem (AI busy or bad answer): let QStash try again.
      return NextResponse.json({ error: out.reason }, { status: 500 });
    }
    if (!out.ok) {
      await adminDb.collection("materials").doc(String(materialId))
        .update({ readStatus: "failed", readError: out.reason ?? "unknown", updatedAt: new Date().toISOString() })
        .catch(() => {});
    }
    return NextResponse.json({ success: out.ok, reason: out.reason ?? null });
  } catch (err) {
    console.error("[read-material]", err);
    return NextResponse.json({ error: "Reading failed." }, { status: 500 });
  }
}
