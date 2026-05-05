import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { cookies } from "next/headers";

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { flagId, adminNote, goldenCorrection } = body;
    if (!flagId || !adminNote) return NextResponse.json({ error: "Missing flagId or adminNote" }, { status: 400 });

    const resolvedAt = new Date().toISOString();
    await adminDb.collection("flags").doc(flagId).update({
      status: "resolved", adminNote,
      ...(goldenCorrection ? { goldenCorrection } : {}),
      resolvedAt,
    });
    return NextResponse.json({ success: true, flagId, status: "resolved", resolvedAt });
  } catch (error: any) {
    console.error("Admin flags error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
