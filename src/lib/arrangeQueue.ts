// src/lib/arrangeQueue.ts
// Queues the AI arrangement pass (QStash -> /api/arrange-material).
// Two kinds of job, both sent to the same route:
//   start job  = { materialId }          -> splits the raw text into chunks and makes the plan
//   chunk job  = { materialId, index }   -> cleans one chunk (at most 3 chunks at the same time)
import { Client } from "@upstash/qstash";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";
const ROUTE = `${APP_URL}/api/arrange-material`;

function client(): Client {
  return new Client({ token: process.env.QSTASH_TOKEN! });
}

export async function queueArrangeStart(materialId: string): Promise<boolean> {
  try {
    await client().batchJSON([
      {
        url: ROUTE,
        body: { materialId },
        retries: 3,
        flowControl: { key: "ai-arrange-start", parallelism: 3 },
      },
    ] as any);
    return true;
  } catch (e) {
    console.error("[arrangeQueue:start]", e);
    return false;
  }
}

export async function queueArrangeChunks(materialId: string, indexes: number[]): Promise<boolean> {
  if (indexes.length === 0) return true;
  try {
    await client().batchJSON(
      indexes.map((index) => ({
        url: ROUTE,
        body: { materialId, index },
        retries: 3,
        flowControl: { key: "ai-arrange", parallelism: 3 },
      })) as any
    );
    return true;
  } catch (e) {
    console.error("[arrangeQueue:chunks]", e);
    return false;
  }
}
