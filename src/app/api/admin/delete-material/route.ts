import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const session = cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let decoded: any;
    try { decoded = await adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role;
    const isAdmin = role === "admin" || role === "chief_admin" || decoded.email === "ourstudyai@gmail.com";
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { materialId, publicId } = await req.json();
    if (!materialId) return NextResponse.json({ error: "Missing materialId" }, { status: 400 });

    // 1. Delete Qdrant chunks
    const { deleteChunksByMaterial } = await import('@/lib/qdrant/upsert');
    await deleteChunksByMaterial(materialId);

    // 2. Delete R2 file
    if (publicId) {
      try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: publicId })); }
      catch (err) { console.warn("[delete-material] R2 delete failed:", err); }
    }

    // 3. Delete body sub-document (may not exist for older materials — ignore error)
    try {
      await adminDb.collection("materials").doc(materialId).collection("body").doc("extracted").delete();
    } catch {}

    // 4. Delete parent Firestore doc
    await adminDb.collection("materials").doc(materialId).delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-material]", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
