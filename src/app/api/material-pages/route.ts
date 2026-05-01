export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { materialId } = await req.json();
    if (!materialId) return NextResponse.json({ error: "Missing materialId" }, { status: 400 });

    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await adminAuth.verifyIdToken(session, true);

    const snap = await adminDb.collection("materials").doc(materialId).get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mat = snap.data()!;
    return NextResponse.json({
      pages: [{ page: 1, url: mat.fileUrl }],
      pageCount: mat.pageCount || 1,
      fileUrl: mat.fileUrl,
      mimeType: mat.mimeType,
    });
  } catch (err) {
    console.error("[material-pages] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
