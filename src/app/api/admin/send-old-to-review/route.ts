export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";

const BATCH = 100;          // files queued per request
const PUBLISH_CHUNK = 50;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

// One-time backlog tool: files that were uploaded before OCR-first (still "upload_review", or "sorted" but never sent to OCR)
// go through the same pipeline as new uploads: OCR -> AI reading -> cleaning -> Review.
// GET = how many are waiting. POST = queue the next batch (the browser keeps calling until none are left).
async function waiting() {
  const out: { id: string; status: string; m: any }[] = [];
  const statuses = ["upload_review", "sorted"];
  for (let i = 0; i < statuses.length; i++) {
    const snap = await adminDb.collection("materials").where("status", "==", statuses[i]).limit(600).get();
    snap.docs.forEach((d) => out.push({ id: d.id, status: statuses[i], m: d.data() }));
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const list = await waiting();
    const ready = list.filter((x) => x.m.fileUrl);
    return NextResponse.json({
      unsorted: ready.filter((x) => x.status === "upload_review").length,
      sorted: ready.filter((x) => x.status === "sorted").length,
      noFile: list.length - ready.length,
    });
  } catch (err) {
    console.error("[send-old-to-review:get]", err);
    return NextResponse.json({ error: "Could not count." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const list = (await waiting()).filter((x) => x.m.fileUrl);
    const take = list.slice(0, BATCH);
    if (take.length === 0) return NextResponse.json({ queued: 0, remaining: 0 });

    const now = new Date().toISOString();
    // Flip first so a second click cannot queue the same file twice.
    for (let i = 0; i < take.length; i += 400) {
      const batch = adminDb.batch();
      take.slice(i, i + 400).forEach((x) =>
        batch.update(adminDb.collection("materials").doc(x.id), { status: "processing", ocrQueuedAt: now, autoQueued: true, oldBacklog: true, updatedAt: now })
      );
      await batch.commit();
    }

    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    const failed: { id: string; status: string }[] = [];
    for (let i = 0; i < take.length; i += PUBLISH_CHUNK) {
      const slice = take.slice(i, i + PUBLISH_CHUNK);
      try {
        await qstash.batchJSON(
          slice.map((x) => {
            const m = x.m;
            // Files an admin already sorted keep that decision as the hint; unsorted files are decided from their content.
            const sorted = x.status === "sorted";
            return {
              url: `${APP_URL}/api/process-background`,
              body: {
                materialId: x.id,
                fileUrl: m.fileUrl,
                mimeType: m.mimeType,
                fileName: m.fileName,
                category: sorted && m.category && m.category !== "other" ? m.category : null,
                suggestedCourseId: sorted ? m.confirmedCourseId ?? null : null,
                suggestedCourseName: sorted ? m.confirmedCourseName ?? null : null,
              },
              retries: 3,
              flowControl: { key: "ocr-batch", parallelism: 3 },
            };
          }) as any
        );
      } catch (e) {
        console.error("[send-old-to-review] publish failed", e);
        slice.forEach((x) => failed.push({ id: x.id, status: x.status }));
      }
    }
    if (failed.length) {
      const batch = adminDb.batch();
      failed.forEach((f) => batch.update(adminDb.collection("materials").doc(f.id), { status: f.status, updatedAt: new Date().toISOString() }));
      await batch.commit();
    }
    return NextResponse.json({ queued: take.length - failed.length, failed: failed.length, remaining: list.length - take.length + failed.length });
  } catch (err) {
    console.error("[send-old-to-review]", err);
    return NextResponse.json({ error: "Could not queue the files." }, { status: 500 });
  }
}
