import { qdrant, COLLECTION_NAME, ensureCollection } from './client';
import { embedText } from './embed';

export interface SearchResult {
  text: string;
  heading: string;
  fullPath: string;
  ancestorHeadings: string[];
  materialId: string;
  courseId: string;
  chunkIndex: number;
  score: number;
}

async function vectorSearch(query: string, courseId: string, topK = 12): Promise<SearchResult[]> {
  await ensureCollection();
  const vector = await embedText(query);
  const results = await qdrant.search(COLLECTION_NAME, {
    vector,
    limit: topK,
    filter: {
      must: [{ key: 'courseId', match: { value: courseId } }],
    },
    with_payload: true,
  });
  return results.map((r) => ({
    ...(r.payload as Omit<SearchResult, 'score'>),
    score: r.score,
  }));
}

function keywordScore(text: string, heading: string, ancestorHeadings: string[], fullPath: string, queryTerms: string[]): number {
  let score = 0;
  const headingLower = heading.toLowerCase();
  const ancestorsLower = ancestorHeadings.join(' ').toLowerCase();
  const bodyLower = text.toLowerCase();
  const fullPhrase = queryTerms.join(' ');
  for (const term of queryTerms) {
    if (headingLower.includes(term)) score += 10;
    if (ancestorsLower.includes(term)) score += 5;
    const regex = new RegExp(term, 'g');
    const bodyMatches = bodyLower.match(regex);
    if (bodyMatches) score += bodyMatches.length;
  }
  if (bodyLower.includes(fullPhrase)) score += 15;
  if (headingLower.includes(fullPhrase)) score += 20;
  return score;
}

const STOP_WORDS = new Set(['that','this','with','from','they','have','what','will','your','been','were','when','there','their','about','which','would','could','should','does','into','more','also','than','then','them','these','those','some','such','only','very','just','like','well','even','each','much','most','over','after','before','other','same','both','here','where','while','through','between','because','however','therefore','although','without']);

export async function hybridSearch(query: string, courseId: string, topK = 12): Promise<SearchResult[]> {
  const queryTerms = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const vectorResults = await vectorSearch(query, courseId, 20);
  const hybrid = vectorResults.map((r, vectorRank) => {
    const kScore = keywordScore(r.text, r.heading, r.ancestorHeadings, r.fullPath, queryTerms);
    const vectorRRF = 1 / (60 + vectorRank + 1);
    const keywordRRF = kScore > 0 ? 1 / (60 + (1 / kScore)) : 0;
    return { ...r, score: vectorRRF + keywordRRF };
  });
  return hybrid.sort((a, b) => b.score - a.score).slice(0, topK);
}
