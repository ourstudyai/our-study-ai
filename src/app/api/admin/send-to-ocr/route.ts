export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";

const MAX_IDS = 200;
const PUBLISH_CHUNK = 50;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// Bulk "sorted" -> OCR. Only enqueues; the OCR itself runs in process-background.
// Idempotent: only files still in 'sorted' are queued, so double clicks are harmless.
// force=true also re-queues files stuck in 'processing'.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { materialIds, force } = await req.json();
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return NextResponse.json({ error: "No materialIds." }, { status: 400 });
    }
    if (materialIds.length > MAX_IDS) {
      return NextResponse.json({ error: `Max ${MAX_IDS} files per request.` }, { status: 400 });
    }

    const skipped: { id: string; reason: string }[] = [];
    const jobs: { id: string; body: Record<string, unknown> }[] = [];

    for (const id of materialIds as string[]) {
      const snap = await adminDb.collection("materials").doc(id).get();
      if (!snap.exists) { skipped.push({ id, reason: "not found" }); continue; }
      const m = snap.data()!;
      const okStatus = m.status === "sorted" || (force === true && m.status === "processing");
      if (!okStatus) { skipped.push({ id, reason: `status is ${m.status}` }); continue; }
      if (!m.fileUrl) { skipped.push({ id, reason: "no file url" }); continue; }
      jobs.push({
        id,
        body: {
          materialId: id,
          fileUrl: m.fileUrl,
          mimeType: m.mimeType,
          fileName: m.fileName,
          category: m.category && m.category !== "other" ? m.category : null,
          suggestedCourseId: m.confirmedCourseId ?? null,
          suggestedCourseName: m.confirmedCourseName ?? null,
        },
      });
    }

    if (jobs.length === 0) return NextResponse.json({ queued: 0, skipped });

    // Flip to 'processing' first so a second click can't double-queue.
    const now = new Date().toISOString();
    const db = adminDb;
    for (let i = 0; i < jobs.length; i += 400) {
      const batch = db.batch();
      jobs.slice(i, i + 400).forEach(j =>
        batch.update(db.collection("materials").doc(j.id), { status: "processing", ocrQueuedAt: now, updatedAt: now })
      );
      await batch.commit();
    }

    const failedIds: string[] = [];
    for (let i = 0; i < jobs.length; i += PUBLISH_CHUNK) {
      const slice = jobs.slice(i, i + PUBLISH_CHUNK);
      try {
        await qstash.batchJSON(
          slice.map(j => ({
            url: `${APP_URL}/api/process-background`,
            body: j.body,
            retries: 3,
            // At most 3 files OCR'd at the same time, however many are sent.
            flowControl: { key: "ocr-batch", parallelism: 3 },
          })) as any
        );
      } catch (e) {
        console.error("[send-to-ocr] publish failed", e);
        slice.forEach(j => failedIds.push(j.id));
      }
    }

    if (failedIds.length) {
      const batch = db.batch();
      failedIds.forEach(id =>
        batch.update(db.collection("materials").doc(id), { status: "sorted", updatedAt: new Date().toISOString() })
      );
      await batch.commit();
      failedIds.forEach(id => skipped.push({ id, reason: "queue unavailable, try again" }));
    }

    return NextResponse.json({ queued: jobs.length - failedIds.length, skipped });
  } catch (err) {
    console.error("[send-to-ocr]", err);
    return NextResponse.json({ error: "Failed to queue OCR." }, { status: 500 });
  }
}
