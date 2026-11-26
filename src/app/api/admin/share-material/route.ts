export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeCategory, nameLabel } from "@/lib/categories";
import { setMaterialCategory } from "@/lib/qdrant/visibility";
import { copyChunksToCourse, removeChunksFromCourse } from "@/lib/qdrant/share";

// Shares an existing file with more courses (any year) instead of storing it again, or undoes that.
// Body: { materialId, courseIds, action: "share" | "undo", hit?: {uid, at}, category? }
// The file is not re-processed: no OCR, no new upload. It appears in each course (Library, course pages, chat, AI search).
const AUTO = /^(.+ · )(Handout|Past Questions|Areas of Concentration|Syllabus|Student's Notes|Material) (\d+)$/;

export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { materialId, courseIds, action, hit, category } = await req.json();
    if (!materialId || !Array.isArray(courseIds)) return NextResponse.json({ error: "Missing materialId or courseIds." }, { status: 400 });

    const ref = adminDb.collection("materials").doc(String(materialId));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "File not found." }, { status: 404 });
    const m: any = snap.data();
    const now = new Date().toISOString();
    const warnings: string[] = [];
    const ids: string[] = Array.from(new Set(courseIds.map((x: any) => String(x))));
    const hits: any[] = Array.isArray(m.duplicateHits) ? m.duplicateHits : [];
    const isHit = (h: any) => !!hit && h.uid === hit.uid && h.at === hit.at;

    if (action === "undo") {
      const update: Record<string, any> = { updatedAt: now };
      if (ids.length) update.sharedCourseIds = FieldValue.arrayRemove(...ids);
      for (const cid of ids) {
        try { await removeChunksFromCourse(String(materialId), cid); }
        catch (e: any) { warnings.push(`Could not remove AI-search pieces for one course: ${e?.message ?? e}`); }
      }
      if (hit) {
        update.duplicateHits = hits.map(h => {
          if (!isHit(h)) return h;
          const { status, sharedWith, resolvedAt, ...rest } = h;
          return rest;
        });
      }
      await ref.update(update);
      return NextResponse.json({ success: true, warnings });
    }

    // ---- share ----
    const target = ids.filter(id => id !== m.confirmedCourseId);
    const checks = await Promise.all(target.map(id => adminDb.collection("courses").doc(id).get()));
    const valid = target.filter((_, i) => checks[i].exists);
    const newCat = category ? normalizeCategory(String(category)) : "";
    const changeCat = !!newCat && newCat !== normalizeCategory(m.category);
    if (!valid.length && !changeCat) return NextResponse.json({ error: "Pick at least one course (other than the one it is already in)." }, { status: 400 });

    const update: Record<string, any> = { updatedAt: now };
    if (valid.length) update.sharedCourseIds = FieldValue.arrayUnion(...valid);

    // AI search: give each new course its own copy of the file's chunks (only possible once the file is indexed).
    let copied = 0;
    if (valid.length && m.confirmedCourseId) {
      for (const cid of valid) {
        try { copied += await copyChunksToCourse(String(materialId), String(m.confirmedCourseId), cid); }
        catch (e: any) { warnings.push(`AI search was not updated for one course: ${e?.message ?? e}`); }
      }
      if (copied === 0 && m.status === "approved" && m.indexed === true && !warnings.length) {
        warnings.push("Shared, but no AI-search pieces were found to copy. Re-index the file if the AI should use it in the new course.");
      }
    }

    // Type edit applies to the file everywhere; the auto-generated name follows it.
    if (changeCat) {
      update.category = newCat;
      const am = AUTO.exec(String(m.indexDisplayName ?? ""));
      if (am) {
        const label = nameLabel(newCat);
        const all = await adminDb.collection("materials").select("indexDisplayName").get();
        let max = 0;
        all.docs.forEach(d => {
          const x = AUTO.exec(String(d.data().indexDisplayName ?? ""));
          if (x && x[1] === am[1] && x[2] === label) max = Math.max(max, Number(x[3]));
        });
        update.indexDisplayName = `${am[1]}${label} ${max + 1}`;
        update.previousDisplayName = m.indexDisplayName;
      }
      const w = await setMaterialCategory(String(materialId), newCat);
      if (w) warnings.push("The new type was saved, but AI search could not be updated for it.");
    }

    if (hit) {
      update.duplicateHits = hits.map(h => (isHit(h) ? { ...h, status: "shared", sharedWith: valid, resolvedAt: now } : h));
    }
    await ref.update(update);
    return NextResponse.json({ success: true, copied, warnings });
  } catch (err: any) {
    console.error("[share-material]", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
