import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { deleteChunksByMaterial } from "@/lib/firestore/materials";
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
    await deleteChunksByMaterial(materialId);
    if (publicId) {
      try { await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: publicId })); }
      catch (err) { console.warn("[delete-material] R2 delete failed:", err); }
    }
    await adminDb.collection("materials").doc(materialId).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-material]", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
