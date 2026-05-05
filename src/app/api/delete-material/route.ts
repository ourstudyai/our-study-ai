export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { cookies } from "next/headers";
import { r2Client, R2_BUCKET } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const session = cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let _d: any;
    try { _d = await adminAuth.verifyIdToken(session); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    const _u = await adminDb.collection("users").doc(_d.uid).get();
    const _r = _u.data()?.role;
    if (!(_r === "admin" || _r === "chief_admin" || _d.email === "ourstudyai@gmail.com")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { materialId } = await req.json();
    if (!materialId) return NextResponse.json({ error: "Missing materialId" }, { status: 400 });

    const matRef = adminDb.collection("materials").doc(materialId);
    const matSnap = await matRef.get();
    if (!matSnap.exists) return NextResponse.json({ error: "Material not found" }, { status: 404 });

    const mat = matSnap.data()!;

    if (mat.publicId) {
      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: mat.publicId }));
      } catch (err) {
        console.warn("[delete-material] R2 delete failed:", err);
      }
    }

    const chunksSnap = await adminDb.collection("material_chunks")
      .where("materialId", "==", materialId)
      .get();
    const batch = adminDb.batch();
    chunksSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    await matRef.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("delete-material error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
