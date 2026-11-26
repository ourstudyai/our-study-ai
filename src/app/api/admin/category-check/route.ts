export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { detectCategory } from "@/lib/keywordSuggest";
import { normalizeCategory, nameLabel } from "@/lib/categories";
import { setMaterialCategory } from "@/lib/qdrant/visibility";

// Finds sorted/approved files whose title clearly says one type but that are tagged as another, e.g. "...past questions 2019.pdf"
// tagged Handout. Only explicit title phrases count (never "notes" or "exam" alone). Body {apply:false} lists; {apply:true, ids} fixes.
const STATUSES = new Set(["sorted", "ocr_pending", "processing", "pending_review", "approved"]);
const AUTO = /^(.+ · )(Handout|Past Questions|Areas of Concentration|Syllabus|Student's Notes|Material) (\d+)$/;

export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { apply, ids } = await req.json().catch(() => ({} as any));

    const snap = await adminDb.collection("materials").select("fileName", "indexDisplayName", "category", "status", "indexed").get();
    const maxN = new Map<string, number>();
    snap.docs.forEach(d => {
      const m = AUTO.exec(String(d.data().indexDisplayName ?? ""));
      if (m) { const k = m[1] + m[2]; maxN.set(k, Math.max(maxN.get(k) ?? 0, Number(m[3]))); }
    });

    const found: { id: string; name: string; display: string; from: string; to: string; status: string; indexed: boolean }[] = [];
    snap.docs.forEach(d => {
      const m: any = d.data();
      if (!STATUSES.has(String(m.status))) return;
      const det = detectCategory(String(m.fileName ?? ""));
      if (det.state !== "sure" || !det.category) return;
      const cur = normalizeCategory(m.category);
      if (cur === det.category) return;
      found.push({ id: d.id, name: String(m.fileName ?? d.id), display: String(m.indexDisplayName ?? ""), from: cur || "none", to: det.category, status: String(m.status), indexed: m.indexed === true });
    });

    if (!apply) {
      return NextResponse.json({ total: found.length, items: found.slice(0, 100).map(f => ({ id: f.id, name: f.display || f.name, from: f.from, to: f.to, status: f.status })), more: Math.max(0, found.length - 100) });
    }

    const wanted = Array.isArray(ids) ? new Set(ids.map(String)) : null;
    const todo = found.filter(f => !wanted || wanted.has(f.id));
    const now = new Date().toISOString();
    for (let i = 0; i < todo.length; i += 400) {
      const batch = adminDb.batch();
      todo.slice(i, i + 400).forEach(f => {
        const data: Record<string, any> = { category: f.to, updatedAt: now };
        const am = AUTO.exec(f.display);
        if (am) {
          const label = nameLabel(f.to);
          const k = am[1] + label;
          const n = (maxN.get(k) ?? 0) + 1;
          maxN.set(k, n);
          data.indexDisplayName = `${am[1]}${label} ${n}`;
          data.previousDisplayName = f.display;
        }
        batch.update(adminDb.collection("materials").doc(f.id), data);
      });
      await batch.commit();
    }

    let qdrantFailed = 0;
    const started = Date.now();
    for (const f of todo.filter(x => x.indexed)) {
      if (Date.now() - started > 40000) { qdrantFailed++; continue; }
      if (await setMaterialCategory(f.id, f.to)) qdrantFailed++;
    }
    return NextResponse.json({ applied: todo.length, qdrantFailed });
  } catch (err: any) {
    console.error("[category-check]", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
