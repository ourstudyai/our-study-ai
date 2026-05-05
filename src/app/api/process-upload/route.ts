export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";
import { R2_PUBLIC_URL } from "@/lib/r2";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: NextRequest) {
  try {
    const session = (await import("next/headers")).cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { await (await import("@/lib/firebase/admin")).adminAuth.verifySessionCookie(session, true); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

    const {
      key,
      fileHash,
      fileName,
      mimeType,
      uploadedBy,
      uploadedByRole,
      uploaderEmail,
      suggestedCourseName,
      suggestedCourseId,
      category,
    } = await req.json();
    console.log("[process-upload] body:", JSON.stringify({ key, uploadedBy, uploaderEmail, fileName }));

    if (!key || !uploadedBy || !uploaderEmail || !fileName) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const fileUrl = `${R2_PUBLIC_URL}/${key}`;

    const matRef = adminDb.collection("materials").doc();
    const materialId = matRef.id;

    console.log("[process-upload] attempting set for", materialId);
    try {
    await matRef.set({
      fileName,
      mimeType: mimeType ?? "application/octet-stream",
      fileUrl,
      publicId: key,
      fileHash: fileHash ?? "",
      uploadedBy,
      uploadedByRole: uploadedByRole ?? "student",
      uploaderEmail,
      suggestedCourseName: suggestedCourseName ?? null,
      suggestedCourseId: suggestedCourseId ?? null,
      category: category ?? "other",
      status: "pending_review",
      indexed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log("[process-upload] set succeeded for", materialId);
    } catch (setErr) {
      console.error("[process-upload] set FAILED:", setErr);
      throw setErr;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

    try {
      await qstash.publishJSON({
        url: `${appUrl}/api/process-background`,
        body: {
          materialId,
          fileUrl,
          mimeType: mimeType ?? "application/octet-stream",
          fileName,
          category: category ?? "other",
          suggestedCourseId: suggestedCourseId ?? null,
          suggestedCourseName: suggestedCourseName ?? null,
        },
        retries: 3,
      });
    } catch (err) {
      console.error("[process-upload] QStash publish failed:", err);
    }

    try {
      await fetch(`${appUrl}/api/notify-admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_upload",
          title: "📤 New Upload",
          body: `${fileName} was just uploaded and is being processed.`,
          data: { materialId, status: "pending_review", fileName },
        }),
      });
    } catch (notifyErr) {
      console.error("[process-upload] Notify failed:", notifyErr);
    }

    return NextResponse.json({ success: true, materialId, status: "pending_review" });
  } catch (err) {
    console.error("[process-upload] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
