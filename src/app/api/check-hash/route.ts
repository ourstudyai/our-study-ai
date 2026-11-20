export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

// Exact-bytes duplicate check. Name is irrelevant: same name + different
// content = different file; different name + same content = duplicate.
export async function POST(req: NextRequest) {
  try {
    const session = cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { await adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

    const { fileHash } = await req.json();
    if (!fileHash || typeof fileHash !== "string") {
      return NextResponse.json({ error: "Missing fileHash." }, { status: 400 });
    }
    const snap = await adminDb.collection("materials")
      .where("fileHash", "==", fileHash)
      .limit(1)
      .get();
    return NextResponse.json({ exists: !snap.empty });
  } catch (err) {
    console.error("[check-hash]", err);
    return NextResponse.json({ error: "Check failed." }, { status: 500 });
  }
}
