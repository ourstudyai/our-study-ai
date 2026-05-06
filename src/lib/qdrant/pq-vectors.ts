// src/lib/qdrant/pq-vectors.ts
import { qdrant } from './client';
import { embedText } from './embed';

export const PQ_COLLECTION = 'pq_vectors';
export const AOC_COLLECTION = 'aoc_vectors';

async function ensurePQCollections() {
  const existing = await qdrant.getCollections();
  const names = existing.collections.map(c => c.name);
  if (!names.includes(PQ_COLLECTION)) {
    await qdrant.createCollection(PQ_COLLECTION, {
      vectors: { size: 1024, distance: 'Cosine' },
    });
  }
  if (!names.includes(AOC_COLLECTION)) {
    await qdrant.createCollection(AOC_COLLECTION, {
      vectors: { size: 1024, distance: 'Cosine' },
    });
  }
}

function stringToUint(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export interface PQVectorPayload {
  canonicalId: string;
  courseId: string;
  materialId: string;
  text: string;
}

export async function upsertPQVectorWithMaterial(
  canonicalId: string,
  text: string,
  courseId: string,
  materialId: string,
  collection: string
) {
  await ensurePQCollections();
  const vector = await embedText(text);
  await qdrant.upsert(collection, {
    wait: true,
    points: [{
      id: stringToUint(canonicalId),
      vector,
      payload: { canonicalId, courseId, materialId, text },
    }],
  });
}

export async function searchPQVectors(
  text: string,
  courseId: string,
  collection: string,
  topK = 5
): Promise<{ canonicalId: string; score: number }[]> {
  await ensurePQCollections();
  const vector = await embedText(text);
  const results = await qdrant.search(collection, {
    vector,
    limit: topK,
    filter: { must: [{ key: 'courseId', match: { value: courseId } }] },
    with_payload: true,
  });
  return results.map(r => ({
    canonicalId: (r.payload as unknown as PQVectorPayload).canonicalId,
    score: r.score,
  }));
}

export async function deletePQVectorsByMaterial(materialId: string, collection: string) {
  await ensurePQCollections();
  await qdrant.delete(collection, {
    wait: true,
    filter: { must: [{ key: 'materialId', match: { value: materialId } }] },
  });
}
