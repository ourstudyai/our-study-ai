// src/lib/search/tavily.ts
// Tavily web search for Research mode — with Firestore caching (7-day TTL)

import { adminDb } from '@/lib/firebase/admin';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

const CACHE_COLLECTION = 'search_cache';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function getCached(key: string): Promise<TavilyResult[] | null> {
  try {
    const doc = await adminDb.collection(CACHE_COLLECTION).doc(key).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    const age = Date.now() - data.cachedAt;
    if (age > TTL_MS) {
      doc.ref.delete().catch(() => {});
      return null;
    }
    console.log('[tavily] Cache HIT:', key.slice(0, 60));
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
      await adminDb.collection('analytics').doc('tavily').set({
        [\`cache_hits_\${today}\`]: FieldValue.increment(1),
        total_cache_hits: FieldValue.increment(1),
      }, { merge: true });
    } catch (_) {}
    return data.results as TavilyResult[];
  } catch (err) {
    console.warn('[tavily] Cache read error:', err);
    return null;
  }
}

async function setCached(key: string, results: TavilyResult[]): Promise<void> {
  try {
    await adminDb.collection(CACHE_COLLECTION).doc(key).set({
      results,
      cachedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[tavily] Cache write error:', err);
  }
}

export async function searchTavily(query: string, maxResults = 5): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[tavily] TAVILY_API_KEY not set — skipping web search');
    return [];
  }

  const cacheKey = normalizeQuery(query).slice(0, 500);

  const cached = await getCached(cacheKey);
  if (cached) return cached;

  console.log('[tavily] Cache MISS — fetching:', query.slice(0, 80));
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_answer: false,
        include_domains: [
          'vatican.va', 'newadvent.org', 'jstor.org', 'philpapers.org',
          'iep.utm.edu', 'plato.stanford.edu', 'catholiceducation.org',
          'catholicculture.org', 'ewtn.com',
        ],
      }),
    });

    if (!res.ok) {
      console.error('[tavily] Search failed:', res.status, await res.text());
      return [];
    }

    const data = await res.json();
    const results = (data.results ?? []) as TavilyResult[];

    if (results.length > 0) {
      setCached(cacheKey, results).catch(() => {});
      try {
        const { FieldValue } = await import('firebase-admin/firestore');
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
        await adminDb.collection('analytics').doc('tavily').set({
          [\`searches_\${today}\`]: FieldValue.increment(1),
          total_searches: FieldValue.increment(1),
          last_search: new Date().toISOString(),
        }, { merge: true });
      } catch (_) {}
    }

    return results;
  } catch (err) {
    console.error('[tavily] Error:', err);
    return [];
  }
}
