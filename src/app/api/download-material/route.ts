export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { materialId } = await req.json();
    if (!materialId) return NextResponse.json({ error: "Missing materialId" }, { status: 400 });

    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await adminAuth.verifySessionCookie(session, true);

    const matSnap = await adminDb.collection("materials").doc(materialId).get();
    if (!matSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // R2 public URL — no signing needed since bucket is open
    return NextResponse.json({ signedUrl: matSnap.data()!.fileUrl });
  } catch (err) {
    console.error("download-material error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
