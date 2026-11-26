export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

// Exact-bytes duplicate check. Name is irrelevant: same name + different
// content = different file; different name + same content = duplicate.
// When a duplicate is found, the request (who, which year/course) is remembered on the
// existing material so an admin can share it to the course that asked for it.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { fileHash, dept, year, courseId, courseName, fileName } = await req.json();
    if (!fileHash || typeof fileHash !== "string") {
      return NextResponse.json({ error: "Missing fileHash." }, { status: 400 });
    }
    const snap = await adminDb.collection("materials").where("fileHash", "==", fileHash).limit(1).get();
    if (snap.empty) return NextResponse.json({ exists: false });

    const docSnap = snap.docs[0];
    const m = docSnap.data();
    const extra: string[] = [
      ...(Array.isArray(m.sharedCourseIds) ? m.sharedCourseIds : []),
      ...(Array.isArray(m.extraCourseIds) ? m.extraCourseIds : []),
    ];
    const alreadyInCourse = !!courseId && (m.confirmedCourseId === courseId || extra.includes(courseId));

    // Which department/year does the existing copy already serve? (its courses; or, if not sorted yet, the year it was uploaded for)
    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const covered = new Set<string>();
    const places: string[] = [];
    const addPlace = (d: any, y: any) => {
      if (!d || !y) return;
      const k = `${String(d).toLowerCase()}|${Number(y)}`;
      if (covered.has(k)) return;
      covered.add(k);
      places.push(`${cap(String(d))} Year ${Number(y)}`);
    };
    const placedIn = [m.confirmedCourseId, ...extra].filter(Boolean);
    for (const cid of placedIn) {
      const cd: any = (await adminDb.collection("courses").doc(String(cid)).get()).data();
      addPlace(cd?.department, cd?.year);
    }
    if (!placedIn.length) addPlace(m.uploadDepartment, m.uploadYear);
    const alreadyInYear = !!dept && !!year && covered.has(`${String(dept).toLowerCase()}|${Number(year)}`);

    // Remember it when it tells the admin something new: a class that does not have it yet, or another year that does not.
    const ownCopySameCourse = m.uploadedBy === decoded.uid && (m.suggestedCourseId ?? null) === (courseId ?? null);
    const worthRecording = !alreadyInCourse && (courseId ? !ownCopySameCourse : !alreadyInYear);
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
            fileName: fileName ?? null,
            at: new Date().toISOString(),
          }),
          hasDuplicateHits: true,
        });
      }
    }
    const status = String(m.status ?? "");
    const where = status === "approved" ? (m.indexed ? "library" : "removed")
      : ["upload_review", "awaiting_course"].includes(status) ? "unsorted" : "processing";
    return NextResponse.json({ exists: true, status: m.status ?? null, alreadyInCourse, alreadyInYear, shareRequested: worthRecording, originalPlace: places.join(" and "), where, name: m.indexDisplayName || m.fileName || null });
  } catch (err) {
    console.error("[check-hash]", err);
    return NextResponse.json({ error: "Check failed." }, { status: 500 });
  }
}
