export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

// Exact-bytes duplicate check. Name is irrelevant: same name + different
// content = different file; different name + same content = duplicate.
// When a duplicate is found, the request (who, which year/course) is remembered on the
// existing material so an admin can share it to the course that asked for it.
export async function POST(req: NextRequest) {
  try {
    const session = cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let decoded: DecodedIdToken;
    try { decoded = await adminAuth.verifyIdToken(session); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

    const { fileHash, dept, year, courseId, courseName } = await req.json();
    if (!fileHash || typeof fileHash !== "string") {
      return NextResponse.json({ error: "Missing fileHash." }, { status: 400 });
    }
    const snap = await adminDb.collection("materials").where("fileHash", "==", fileHash).limit(1).get();
    if (snap.empty) return NextResponse.json({ exists: false });

    const docSnap = snap.docs[0];
    const m = docSnap.data();
    const extra: string[] = Array.isArray(m.extraCourseIds) ? m.extraCourseIds : [];
    const alreadyInCourse = !!courseId && (m.confirmedCourseId === courseId || extra.includes(courseId));

    // Only remember it when it tells the admin something new: a course request, or a different uploader.
    const worthRecording = !alreadyInCourse && (!!courseId || m.uploadedBy !== decoded.uid);
    if (worthRecording) {
      const hits: any[] = Array.isArray(m.duplicateHits) ? m.duplicateHits : [];
      const seen = hits.some(h =>
        h.uid === decoded.uid && (h.courseId ?? null) === (courseId ?? null) &&
        (h.dept ?? null) === (dept ?? null) && (h.year ?? null) === (Number(year) || null)
      );
      if (!seen) {
        await docSnap.ref.update({
          duplicateHits: FieldValue.arrayUnion({
            uid: decoded.uid,
            email: decoded.email ?? "unknown",
            dept: dept ?? null,
            year: Number(year) || null,
            courseId: courseId ?? null,
            courseName: courseName ?? null,
            at: new Date().toISOString(),
          }),
          hasDuplicateHits: true,
        });
      }
    }
    return NextResponse.json({ exists: true, status: m.status ?? null, alreadyInCourse });
  } catch (err) {
    console.error("[check-hash]", err);
    return NextResponse.json({ error: "Check failed." }, { status: 500 });
  }
}
