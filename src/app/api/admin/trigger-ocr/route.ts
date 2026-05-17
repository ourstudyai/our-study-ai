export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: NextRequest) {
  try {
    const session = (await import("next/headers")).cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { await (await import("@/lib/firebase/admin")).adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

    const { materialId } = await req.json();
    if (!materialId) return NextResponse.json({ error: "Missing materialId." }, { status: 400 });

    const matRef = adminDb.collection("materials").doc(materialId);
    const snap = await matRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Material not found." }, { status: 404 });

    const data = snap.data()!;

    await matRef.update({
      status: "pending_review",
      updatedAt: new Date().toISOString(),
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

    await qstash.publishJSON({
      url: `${appUrl}/api/process-background`,
      body: {
        materialId,
        fileUrl: data.fileUrl,
        mimeType: data.mimeType ?? "application/octet-stream",
        fileName: data.fileName,
        category: data.category ?? "other",
        suggestedCourseId: data.suggestedCourseId ?? null,
        suggestedCourseName: data.suggestedCourseName ?? null,
      },
      retries: 3,
    });

    console.log("[trigger-ocr] Queued OCR for", materialId);
    return NextResponse.json({ success: true, materialId, status: "pending_review" });
  } catch (err) {
    console.error("[trigger-ocr] Error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
