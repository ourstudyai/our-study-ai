export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";

const BUDGET_MS = 40_000;
const MAX_BYTES = 100 * 1024 * 1024;

// Computes SHA-256 for older materials that have no fileHash, a few at a time.
// Never deletes anything: it only writes fileHash and reports groups of identical files.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { limit, skipIds } = await req.json().catch(() => ({} as any));
    const skip = new Set<string>(Array.isArray(skipIds) ? skipIds : []);

    const snap = await adminDb.collection("materials")
      .select("fileUrl", "fileHash", "fileName", "status")
      .get();

    const todo = snap.docs.filter(d => {
      const m = d.data();
      return !m.fileHash && m.fileUrl && !skip.has(d.id);
    });

    const started = Date.now();
    const done = new Map<string, string>();
    const failed: { id: string; fileName: string; error: string }[] = [];

    for (const d of todo.slice(0, Math.min(Number(limit) || 20, 40))) {
      if (Date.now() - started > BUDGET_MS) break;
      const m = d.data();
      try {
        const res = await fetch(m.fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("file too large");
        const buf = Buffer.from(await res.arrayBuffer());
        done.set(d.id, createHash("sha256").update(buf).digest("hex"));
      } catch (e: any) {
        failed.push({ id: d.id, fileName: String(m.fileName ?? ""), error: String(e?.message ?? e) });
      }
    }

    const entries = Array.from(done.entries());
    for (let i = 0; i < entries.length; i += 400) {
      const batch = adminDb.batch();
      entries.slice(i, i + 400).forEach(([id, hash]) => batch.update(adminDb.collection("materials").doc(id), { fileHash: hash }));
      await batch.commit();
    }

    // Groups of identical files (reported only; an admin decides what to do).
    const byHash = new Map<string, { id: string; fileName: string; status: string }[]>();
    snap.docs.forEach(d => {
      const m = d.data();
      const h = (m.fileHash as string) || done.get(d.id);
      if (!h) return;
      byHash.set(h, [...(byHash.get(h) ?? []), { id: d.id, fileName: String(m.fileName ?? ""), status: String(m.status ?? "") }]);
    });
    const dupGroups = Array.from(byHash.values()).filter(g => g.length > 1);
    const duplicates = dupGroups.slice(0, 100).map(g => ({ count: g.length, items: g.slice(0, 6) }));

    return NextResponse.json({
      processed: done.size,
      failed,
      remaining: todo.length - done.size - failed.length,
      duplicates,
      duplicateTotal: dupGroups.length,
    });
  } catch (err) {
    console.error("[backfill-hashes]", err);
    return NextResponse.json({ error: "Backfill failed." }, { status: 500 });
  }
}
