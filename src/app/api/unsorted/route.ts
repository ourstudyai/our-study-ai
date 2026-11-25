export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

// Files that are uploaded but not yet approved into the library. Signed-in users may browse and download
// them. Uploader identity and every other field stay on the server.
const OPEN = ["upload_review", "sorted", "awaiting_course", "ocr_pending", "processing", "pending_review"];
const WAITING = ["upload_review", "awaiting_course"];

async function caller(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cookie = req.cookies.get("session")?.value ?? "";
  for (const token of [bearer, cookie]) {
    if (!token) continue;
    try { return await adminAuth.verifyIdToken(token); } catch { /* try next */ }
  }
  return null;
}

function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; }
  if (typeof v.toMillis === "function") return v.toMillis();
  return 0;
}

export async function GET(req: NextRequest) {
  try {
    const user = await caller(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const snap = await adminDb.collection("materials").doc(id).get();
      const m = snap.data();
      if (!snap.exists || !m || !OPEN.includes(String(m.status)) || !m.fileUrl) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Download: the file is passed through with a proper file name.
      if (req.nextUrl.searchParams.get("download") === "1") {
        const up = await fetch(String(m.fileUrl));
        if (!up.ok || !up.body) return NextResponse.json({ error: "File unavailable." }, { status: 502 });
        const original = String(m.fileName || "file");
        const ext = (original.match(/\.[A-Za-z0-9]{1,6}$/) || [""])[0];
        let base = String(m.indexDisplayName || original).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
        if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) base += ext;
        return new Response(up.body, {
          headers: {
            "Content-Type": String(m.mimeType || up.headers.get("content-type") || "application/octet-stream"),
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base)}`,
            "Cache-Control": "private, no-store",
          },
        });
      }

      return NextResponse.json({ url: m.fileUrl, name: m.indexDisplayName || m.fileName || "file" });
    }

    const snap = await adminDb.collection("materials")
      .where("status", "in", OPEN)
      .select("fileName", "indexDisplayName", "uploadDepartment", "uploadYear", "department", "year",
        "suggestedCourseName", "confirmedCourseName", "fileSize", "mimeType", "createdAt", "status", "fileHash")
      .get();

    // Identical files (same hash) appear once: the earliest upload.
    const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    rows.sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
    const seen = new Set<string>();
    const unique = rows.filter(r => {
      const h = String(r.fileHash ?? "");
      if (!h) return true;
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    });

    const items = unique.reverse().slice(0, 3000).map(r => ({
      id: r.id,
      name: String(r.indexDisplayName || r.fileName || "Untitled"),
      dept: String(r.uploadDepartment || r.department || "").toLowerCase() || null,
      year: Number(r.uploadYear || r.year) || null,
      klass: String(r.confirmedCourseName || r.suggestedCourseName || "") || null,
      size: Number(r.fileSize) || 0,
      mime: String(r.mimeType || ""),
      at: millis(r.createdAt),
      state: WAITING.includes(String(r.status)) ? "waiting" : "processing",
    }));
    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[unsorted]", err);
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}
