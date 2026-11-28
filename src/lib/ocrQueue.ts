// src/lib/ocrQueue.ts
// Queues one uploaded material for background OCR (QStash -> /api/process-background).
// Shares the "ocr-batch" limit with the admin bulk route: at most 3 files are read at the same time.
// If anything fails the file goes back to "upload_review", so the manual admin route still works.
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

export async function queueMaterialForOcr(materialId: string): Promise<boolean> {
  try {
    const ref = adminDb.collection("materials").doc(materialId);
    const snap = await ref.get();
    if (!snap.exists) return false;
    const m = snap.data()!;
    if (m.status !== "upload_review" || !m.fileUrl) return false;

    // Flip first so nothing can queue the same file twice.
    const now = new Date().toISOString();
    await ref.update({ status: "processing", ocrQueuedAt: now, autoQueued: true, updatedAt: now });

    try {
      const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
      await qstash.batchJSON([
        {
          url: `${APP_URL}/api/process-background`,
          body: {
            materialId,
            fileUrl: m.fileUrl,
            mimeType: m.mimeType,
            fileName: m.fileName,
            // What the file is, and which course, is decided from its content, not from the uploader's guess.
            category: null,
            suggestedCourseId: null,
            suggestedCourseName: null,
          },
          retries: 3,
          flowControl: { key: "ocr-batch", parallelism: 3 },
        },
      ] as any);
      return true;
    } catch (e) {
      console.error("[ocrQueue] publish failed", e);
      await ref.update({ status: "upload_review", updatedAt: new Date().toISOString() }).catch(() => {});
      return false;
    }
  } catch (e) {
    console.error("[ocrQueue]", e);
    return false;
  }
}
