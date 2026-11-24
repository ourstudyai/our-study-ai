export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { AUTO_NAME_RE, nameLabel } from "@/lib/categories";

const NAT = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const FILE_EXT = /\.(pdf|docx?|pptx?|jpe?g|png|txt|md|markdown)$/i;

// A name is "generic" when nobody curated it: empty, the raw file name, or the old
// auto format "Course — category". Curated names are never touched.
function isGeneric(name: string, m: any): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (n === String(m.fileName ?? "").trim()) return true;
  if (FILE_EXT.test(n)) return true;
  const cn = String(m.confirmedCourseName ?? "").trim().toLowerCase();
  if (cn && n.toLowerCase().startsWith(cn) && /[—–-]\s*(lecture notes|notes|past questions|aoc|syllabus|material|other|textbook)\s*$/i.test(n)) return true;
  return false;
}

function millis(m: any): number {
  const c = m.createdAt ?? m.indexedAt;
  if (typeof c === "string") return Date.parse(c) || 0;
  return c?.toMillis?.() ?? 0;
}

// Preview (apply:false, default) or apply (apply:true) the new naming on approved materials.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { apply } = await req.json().catch(() => ({ apply: false }));

    const [matSnap, courseSnap] = await Promise.all([
      adminDb.collection("materials").where("status", "in", ["approved", "approved_hidden"]).get(),
      adminDb.collection("courses").get(),
    ]);
    const courses = new Map<string, { name: string; code: string }>();
    courseSnap.docs.forEach(d => courses.set(d.id, { name: String(d.data().name ?? ""), code: String(d.data().code ?? "") }));

    const byCourse = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    matSnap.docs.forEach(d => {
      const cid = d.data().confirmedCourseId;
      if (!cid || !courses.has(cid)) return;
      byCourse.set(cid, [...(byCourse.get(cid) ?? []), d]);
    });

    const updates: { id: string; data: Record<string, unknown> }[] = [];
    const examples: { from: string; to: string }[] = [];
    let renamed = 0, keptCurated = 0, categoryFixed = 0;

    for (const [cid, docs] of Array.from(byCourse.entries())) {
      const c = courses.get(cid)!;
      const prefix = (c.code || c.name) + " · ";
      const max: Record<string, number> = {};

      // Numbers already used by names in the new format keep their place.
      docs.forEach(d => {
        const n = String(d.data().indexDisplayName ?? "");
        const mt = n.startsWith(prefix) && AUTO_NAME_RE.test(n) ? n.slice(prefix.length).match(/^(.*\S) (\d+)$/) : null;
        if (mt) max[mt[1]] = Math.max(max[mt[1]] ?? 0, Number(mt[2]));
      });

      const targets = docs
        .filter(d => isGeneric(String(d.data().indexDisplayName ?? ""), d.data()))
        .sort((a, b) => millis(a.data()) - millis(b.data()) || NAT.compare(String(a.data().fileName ?? ""), String(b.data().fileName ?? "")));
      keptCurated += docs.length - targets.length;

      for (const d of targets) {
        const m = d.data();
        const label = nameLabel(m.category);
        max[label] = (max[label] ?? 0) + 1;
        const newName = `${prefix}${label} ${max[label]}`;
        const data: Record<string, unknown> = {
          indexDisplayName: newName,
          previousDisplayName: m.indexDisplayName ?? null,
          updatedAt: new Date().toISOString(),
        };
        if (m.category === "notes" || m.category === "handout") { data.category = "lecture_notes"; categoryFixed++; }
        updates.push({ id: d.id, data });
        renamed++;
        if (examples.length < 10) examples.push({ from: String(m.indexDisplayName || m.fileName || ""), to: newName });
      }
    }

    // Materials that are curated but still carry the old 'notes' category get the category fix only.
    matSnap.docs.forEach(d => {
      const m = d.data();
      if ((m.category === "notes" || m.category === "handout") && !updates.some(u => u.id === d.id)) {
        updates.push({ id: d.id, data: { category: "lecture_notes", updatedAt: new Date().toISOString() } });
        categoryFixed++;
      }
    });

    if (apply === true) {
      for (let i = 0; i < updates.length; i += 400) {
        const batch = adminDb.batch();
        updates.slice(i, i + 400).forEach(u => batch.update(adminDb.collection("materials").doc(u.id), u.data));
        await batch.commit();
      }
    }

    return NextResponse.json({ applied: apply === true, total: matSnap.size, renamed, keptCurated, categoryFixed, examples });
  } catch (err) {
    console.error("[rename-materials]", err);
    return NextResponse.json({ error: "Rename failed." }, { status: 500 });
  }
}
