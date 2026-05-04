import { qdrant, COLLECTION_NAME, ensureCollection } from './client';
import { embedText } from './embed';

export interface ChunkPayload {
  materialId: string;
  courseId: string;
  chunkIndex: number;
  heading: string;
  fullPath: string;
  ancestorHeadings: string[];
  text: string;
  category: string;
}

export async function upsertChunk(id: string, payload: ChunkPayload) {
  await ensureCollection();
  const vector = await embedText(payload.text);
  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points: [{ id: stringToUint(id), vector, payload }],
  });
}

export async function upsertChunks(chunks: { id: string; payload: ChunkPayload }[]) {
  await ensureCollection();
  const points = await Promise.all(
    chunks.map(async (c) => ({
      id: stringToUint(c.id),
      vector: await embedText(c.payload.text),
      payload: c.payload,
    }))
  );
  await qdrant.upsert(COLLECTION_NAME, { wait: true, points });
}

export async function deleteChunksByMaterial(materialId: string) {
  await ensureCollection();
  await qdrant.delete(COLLECTION_NAME, {
    wait: true,
    filter: {
      must: [{ key: 'materialId', match: { value: materialId } }],
    },
  });
}

function stringToUint(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}
