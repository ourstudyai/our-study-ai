export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";

// Fills department / year / semester on files that have a confirmed course but are missing them.
// Body {apply:false} (default) only counts and lists examples. {apply:true} writes. Never overwrites a value that is already set.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { apply } = await req.json().catch(() => ({} as any));
    const [mSnap, cSnap] = await Promise.all([
      adminDb.collection("materials").select("confirmedCourseId", "department", "year", "semester", "fileName", "indexDisplayName").get(),
      adminDb.collection("courses").select("department", "year", "semester").get(),
    ]);
    const courses = new Map<string, any>();
    cSnap.docs.forEach(d => courses.set(d.id, d.data()));

    const fixes: { id: string; name: string; patch: Record<string, any> }[] = [];
    let courseMissing = 0;
    for (const d of mSnap.docs) {
      const m: any = d.data();
      const cid = m.confirmedCourseId;
      if (!cid) continue;
      const c = courses.get(String(cid));
      if (!c) { courseMissing++; continue; }
      const patch: Record<string, any> = {};
      if (!m.department && c.department) patch.department = c.department;
      if (!m.year && c.year) patch.year = c.year;
      if (!m.semester && c.semester) patch.semester = c.semester;
      if (Object.keys(patch).length) fixes.push({ id: d.id, name: String(m.indexDisplayName || m.fileName || d.id), patch });
    }

    if (!apply) {
      return NextResponse.json({
        total: fixes.length, courseMissing,
        samples: fixes.slice(0, 15).map(f => ({ name: f.name, fills: Object.keys(f.patch) })),
      });
    }

    for (let i = 0; i < fixes.length; i += 400) {
      const batch = adminDb.batch();
      fixes.slice(i, i + 400).forEach(f => batch.update(adminDb.collection("materials").doc(f.id), f.patch));
      await batch.commit();
    }
    return NextResponse.json({ applied: fixes.length, courseMissing });
  } catch (err: any) {
    console.error("[backfill-course-fields]", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
