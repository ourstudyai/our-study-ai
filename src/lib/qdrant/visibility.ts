import { qdrant, COLLECTION_NAME } from './client';

// Marks every AI-search chunk of a material as visible or hidden. Nothing is deleted, so it is fully reversible.
// Returns null on success, or a short message if the vector store could not be updated.
export async function setMaterialVisible(materialId: string, visible: boolean): Promise<string | null> {
  try {
    await (qdrant as any).setPayload(COLLECTION_NAME, {
      wait: true,
      payload: { indexed: visible },
      filter: { must: [{ key: 'materialId', match: { value: materialId } }] },
    });
    return null;
  } catch (e: any) {
    console.error('[qdrant visibility]', e?.message || e);
    return e?.message || 'Could not update AI search';
  }
}

// Updates the type stored on every AI-search chunk of a material. Returns null on success, or a short message.
export async function setMaterialCategory(materialId: string, category: string): Promise<string | null> {
  try {
    await (qdrant as any).setPayload(COLLECTION_NAME, {
      wait: true,
      payload: { category },
      filter: { must: [{ key: 'materialId', match: { value: materialId } }] },
    });
    return null;
  } catch (e: any) {
    console.error('[qdrant category]', e?.message || e);
    return e?.message || 'Could not update AI search';
  }
}
