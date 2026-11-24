export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { R2_PUBLIC_URL } from "@/lib/r2";

const CATEGORIES = ["lecture_notes", "past_questions", "aoc", "syllabus", "student_notes", "other"];

// Registers an uploaded file as an unsorted material. No OCR, no extraction:
// admins sort first, then send to OCR.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

    // One summary notification per batch, sent by the client after the last file.
    if (body.notifyOnly) {
      const count = Number(body.count) || 0;
      if (count > 0) {
        try {
          await fetch(`${appUrl}/api/notify-admins`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
            },
            body: JSON.stringify({
              type: "new_upload",
              title: "📤 New Uploads",
              body: `${count} file${count !== 1 ? "s" : ""} uploaded for ${String(body.label ?? "review")}, awaiting sorting.`,
              data: { status: "upload_review" },
            }),
          });
        } catch (e) { console.error("[process-upload] Notify failed:", e); }
      }
      return NextResponse.json({ success: true });
    }

    const { key, fileHash, fileName, mimeType, fileSize, uploadDepartment, uploadYear, suggestedCourseId, suggestedCourseName, category } = body;
    if (!key || !fileName || !String(key).startsWith("contributions/")) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userSnap.data()?.role ?? "student";
    const now = new Date().toISOString();
    const matRef = adminDb.collection("materials").doc();

    await matRef.set({
      fileName,
      mimeType: mimeType ?? "application/octet-stream",
      fileUrl: `${R2_PUBLIC_URL}/${key}`,
      publicId: key,
      fileHash: fileHash ?? "",
      fileSize: Number(fileSize) || 0,
      uploadedBy: decoded.uid,
      uploadedByRole: role,
      uploaderEmail: decoded.email ?? "unknown",
      uploadDepartment: uploadDepartment ?? null,
      uploadYear: Number(uploadYear) || null,
      suggestedCourseId: suggestedCourseId || null,
      suggestedCourseName: suggestedCourseName ? String(suggestedCourseName).slice(0, 200) : null,
      category: CATEGORIES.includes(category) ? category : null,
      status: "upload_review",
      indexed: false,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true, materialId: matRef.id, status: "upload_review" });
  } catch (err) {
    console.error("[process-upload]", err);
    return NextResponse.json({ error: "Failed to register upload." }, { status: 500 });
  }
}
