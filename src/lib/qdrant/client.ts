import { QdrantClient } from '@qdrant/js-client-rest';

export const COLLECTION_NAME = 'lux_chunks';

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY,
});

let collectionReady = false;

export async function ensureCollection() {
  if (collectionReady) return;
  const existing = await qdrant.getCollections();
  const exists = existing.collections.some(c => c.name === COLLECTION_NAME);
  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: 1024, distance: 'Cosine' },
    });
  }
  collectionReady = true;
}
