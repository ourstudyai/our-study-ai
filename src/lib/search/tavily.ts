// src/lib/search/tavily.ts
// Tavily web search for Research mode — Firestore cache (7-day TTL) + analytics

import { adminDb } from '@/lib/firebase/admin';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

const CACHE_COL = 'search_cache';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalize(q: string) {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function logAnalytics(field: string) {
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
    await adminDb.collection('analytics').doc('tavily').set({
      [`${field}_${today}`]: FieldValue.increment(1),
      [`total_${field}`]: FieldValue.increment(1),
      ...(field === 'searches' ? { last_search: new Date().toISOString() } : {}),
    }, { merge: true });
  } catch (_) {}
}

async function getCached(key: string): Promise<TavilyResult[] | null> {
  try {
    const snap = await adminDb.collection(CACHE_COL).doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (Date.now() - data.cachedAt > TTL_MS) {
      snap.ref.delete().catch(() => {});
      return null;
    }
    logAnalytics('cache_hits');
    return data.results as TavilyResult[];
  } catch {
    return null;
  }
}

async function setCached(key: string, results: TavilyResult[]) {
  try {
    await adminDb.collection(CACHE_COL).doc(key).set({ results, cachedAt: Date.now() });
  } catch (_) {}
}

export async function searchTavily(query: string, maxResults = 5): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const key = normalize(query).slice(0, 500);
  const cached = await getCached(key);
  if (cached) return cached;

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
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.results ?? []) as TavilyResult[];
    if (results.length > 0) {
      setCached(key, results).catch(() => {});
      logAnalytics('searches');
    }
    return results;
  } catch {
    return [];
  }
}
