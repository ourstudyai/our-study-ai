export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getRequestUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { r2Client, R2_BUCKET } from "@/lib/r2";

// Lets a contributor take back a file they just uploaded (wrong file, or something private).
// Only the person who uploaded it, and only until an admin has acted on it (not sorted, approved or quarantined).
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const { materialId } = await req.json();
    if (!materialId || typeof materialId !== "string") {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    const ref = adminDb.collection("materials").doc(materialId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "This file is already gone." }, { status: 404 });
    const mat = snap.data()!;

    if (mat.uploadedBy !== decoded.uid) {
      return NextResponse.json({ error: "Only the person who uploaded this file can remove it." }, { status: 403 });
    }
    const REMOVABLE = ["upload_review", "processing", "pending_review", "ocr_pending"];
    if (!REMOVABLE.includes(String(mat.status))) {
      return NextResponse.json({ error: "An admin has already started handling this file. Please ask an admin to remove it." }, { status: 409 });
    }
    if (mat.hasDuplicateHits) {
      return NextResponse.json({ error: "Someone else also uploaded this exact file, so it cannot be removed here. Please ask an admin." }, { status: 409 });
    }

    const key = typeof mat.publicId === "string" ? mat.publicId : "";
    if (key.startsWith("contributions/")) {
      try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })); }
      catch (err) { console.warn("[retract-upload] R2 delete failed:", err); }
    }
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[retract-upload]", err);
    return NextResponse.json({ error: "Could not remove the file. Please try again." }, { status: 500 });
  }
}
