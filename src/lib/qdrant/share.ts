import { qdrant, COLLECTION_NAME, ensureCollection } from './client';

// Same id scheme as upsert.ts and index-chunks: the shared copy of chunk i is `${materialId}-shared-${courseId}-${i}`.
function stringToUint(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

// Gives a course AI-search access to a file that is already indexed, by copying its chunks (vectors included, so nothing
// is re-embedded) with the new courseId. Safe to repeat. Returns how many chunks were copied.
export async function copyChunksToCourse(materialId: string, fromCourseId: string, toCourseId: string): Promise<number> {
  await ensureCollection();
  const q: any = qdrant;
  let offset: any = undefined;
  let copied = 0;
  for (let guard = 0; guard < 400; guard++) {
    const page: any = await q.scroll(COLLECTION_NAME, {
      filter: { must: [{ key: 'materialId', match: { value: materialId } }, { key: 'courseId', match: { value: fromCourseId } }] },
      limit: 128, offset, with_payload: true, with_vector: true,
    });
    const pts: any[] = page?.points ?? [];
    if (pts.length) {
      await q.upsert(COLLECTION_NAME, {
        wait: true,
        points: pts.map((p: any) => ({
          id: stringToUint(`${materialId}-shared-${toCourseId}-${p.payload?.chunkIndex ?? 0}`),
          vector: p.vector,
          payload: { ...p.payload, courseId: toCourseId },
        })),
      });
      copied += pts.length;
    }
    offset = page?.next_page_offset;
    if (!offset) break;
  }
  return copied;
}

// Undoes a share: removes that course's copy of the file's chunks.
export async function removeChunksFromCourse(materialId: string, courseId: string): Promise<void> {
  await ensureCollection();
  await (qdrant as any).delete(COLLECTION_NAME, {
    wait: true,
    filter: { must: [{ key: 'materialId', match: { value: materialId } }, { key: 'courseId', match: { value: courseId } }] },
  });
}
