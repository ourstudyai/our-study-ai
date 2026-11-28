// src/lib/readQueue.ts
// Queues the AI reading pass for one material (QStash -> /api/read-material). At most 3 at the same time.
import { Client } from "@upstash/qstash";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

export async function queueMaterialRead(materialId: string): Promise<boolean> {
  try {
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    await qstash.batchJSON([
      {
        url: `${APP_URL}/api/read-material`,
        body: { materialId },
        retries: 3,
        flowControl: { key: "ai-read", parallelism: 3 },
      },
    ] as any);
    return true;
  } catch (e) {
    console.error("[readQueue]", e);
    return false;
  }
}
