import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

const SUPREME = "ourstudyai@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { targetUid, role, idToken } = await req.json();
    if (!targetUid || !role) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(session);
    const callerEmail = decoded.email || "";
    const callerSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const callerRole = callerSnap.data()?.role || "student";
    const callerIsSupreme = callerEmail === SUPREME;
    const callerIsChief = callerRole === "chief_admin" || callerIsSupreme;
    const callerIsAdmin = callerRole === "admin" || callerIsChief;

    if (!callerIsAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const targetSnap = await adminDb.collection("users").doc(targetUid).get();
    const targetEmail = targetSnap.data()?.email || "";
    const targetRole = targetSnap.data()?.role || "student";

    if (targetEmail === SUPREME) return NextResponse.json({ error: "Cannot modify supreme admin" }, { status: 403 });
    if (role === "chief_admin" && !callerIsSupreme) return NextResponse.json({ error: "Only supreme can promote to chief_admin" }, { status: 403 });
    if (role === "admin" && !callerIsChief) return NextResponse.json({ error: "Only chief_admin can promote to admin" }, { status: 403 });
    if (role === "student" && targetRole === "chief_admin" && !callerIsSupreme) return NextResponse.json({ error: "Only supreme can demote chief_admin" }, { status: 403 });

    await adminDb.collection("users").doc(targetUid).update({ role });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("set-role error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
