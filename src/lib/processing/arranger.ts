// src/lib/processing/arranger.ts
// The AI arrangement pass. The reading pass only sorts a file from a sample. This pass cleans the WHOLE text:
// fixes OCR noise, headings, lists and tables, marks unreadable words as [illegible]. It adds or changes no content.
// Large files are cut into chunks (about 2,000 words each), each chunk is cleaned by its own job, and the chunks
// are joined in order. The raw extracted text is never touched.
// Core logic takes its tools as arguments so it can be tested without Firebase, QStash or Mistral.

export const TARGET_WORDS = 2000;     // a chunk is closed once it reaches this size
export const HARD_MAX_WORDS = 2600;   // no chunk is ever bigger than this
const RATIO_MIN = 0.7;                // cleaned text must be 70% to 130% of the raw chunk, by word count
const RATIO_MAX = 1.3;

export type ChunkResult = {
  index: number;
  text: string;                       // cleaned text, or the raw chunk when it was kept
  status: 'ok' | 'kept_raw';
  reason: string | null;              // why the raw chunk was kept
  inWords: number;
  outWords: number;
  updatedAt: string;
};

export type ArrangeDeps = {
  getMaterial: (id: string) => Promise<any | null>;
  getText: (id: string) => Promise<string>;                                   // RAW extracted text
  hasChunk: (id: string, index: number) => Promise<boolean>;
  saveChunk: (id: string, index: number, data: ChunkResult) => Promise<void>;
  tally: (id: string) => Promise<{ count: number; kept: number }>;            // how many chunk docs exist, how many kept raw
  clearChunks: (id: string) => Promise<void>;
  setMaterial: (id: string, update: any) => Promise<void>;
  enqueueChunks: (id: string, indexes: number[]) => Promise<boolean>;
  chat: (messages: any[]) => Promise<{ text: string; truncated: boolean }>;
  now: () => string;
};

export type ArrangeOutcome = { ok: boolean; reason?: string; retry?: boolean; skipped?: boolean };

export function wordCount(s: string): number {
  return (s || '').split(/\s+/).filter(Boolean).length;
}

export function ratioOk(inWords: number, outWords: number): boolean {
  if (outWords === 0) return false;
  if (inWords < 30) return outWords >= inWords * 0.4 && outWords <= inWords * 2 + 5; // tiny chunks: ratio is noisy
  const r = outWords / inWords;
  return r >= RATIO_MIN && r <= RATIO_MAX;
}

const isHeading = (block: string) => /^#{1,6}\s/.test(block);

// A block bigger than the hard maximum is cut by lines, and a single huge line is cut by words.
function splitOversize(block: string, hardMax: number): string[] {
  if (wordCount(block) <= hardMax) return [block];
  const out: string[] = [];
  let cur: string[] = [];
  let w = 0;
  const flush = () => { if (cur.length) { out.push(cur.join('\n')); cur = []; w = 0; } };
  block.split('\n').forEach((line) => {
    const lw = wordCount(line);
    if (lw > hardMax) {
      flush();
      const words = line.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += hardMax) out.push(words.slice(i, i + hardMax).join(' '));
      return;
    }
    if (w > 0 && w + lw > hardMax) flush();
    cur.push(line); w += lw;
  });
  flush();
  return out;
}

// Cuts the raw text into ordered chunks at paragraph and heading boundaries. Same text in = same chunks out
// (every job recomputes the split, so nothing needs to be stored for the plan).
export function splitIntoChunks(text: string, target = TARGET_WORDS, hardMax = HARD_MAX_WORDS): string[] {
  const clean = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const blocks: string[] = [];
  clean.split(/\n{2,}/).forEach((b) => {
    const t = b.trim();
    if (!t) return;
    splitOversize(t, hardMax).forEach((x) => blocks.push(x));
  });

  const chunks: string[] = [];
  let cur: string[] = [];
  let w = 0;
  const flush = () => { if (cur.length) { chunks.push(cur.join('\n\n')); cur = []; w = 0; } };
  blocks.forEach((b) => {
    const bw = wordCount(b);
    if (w > 0 && (w + bw > hardMax || w >= target || (w >= target * 0.6 && isHeading(b)))) flush();
    cur.push(b); w += bw;
  });
  flush();

  // A tiny last chunk joins the one before it when it fits.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    if (wordCount(last) < target * 0.25 && wordCount(prev) + wordCount(last) <= hardMax) {
      chunks.splice(chunks.length - 2, 2, prev + '\n\n' + last);
    }
  }
  return chunks;
}

// The model sometimes wraps its answer in a code fence or opens with "Here is the cleaned text:". Remove only that.
export function cleanModelOutput(s: string): string {
  let t = (s || '').trim();
  t = t.replace(/^```(?:markdown|md|text)?\s*\n/i, '').replace(/\n```\s*$/, '').trim();
  t = t.replace(/^(here is|here's|sure|certainly|below is)[^\n]*:\s*\n+/i, '').trim();
  return t;
}

export function buildMessages(raw: string, o: { handwritten: boolean; index: number; total: number; strict: boolean }): any[] {
  const rules = [
    'You restore text from study material uploaded to a Catholic seminary library (philosophy and theology, Nigeria).',
    'The text came from OCR or file extraction and may contain errors. Your ONLY job is to return the SAME text, cleaned and formatted.',
    '',
    'RULES',
    '1. Keep every idea, sentence and fact. Never summarise, shorten, explain, add, translate or modernise.',
    '2. Fix plain scanning errors: broken or split words, stray characters, wrong letters, hyphenation at line ends, repeated page headers, footers and page numbers.',
    '3. Do not correct content. Names, quotations, citations, Latin, Greek and Hebrew stay exactly as written unless the error is plainly a scanning mistake.',
    '4. Use markdown: #, ##, ### for headings where the text has headings; lists for lists; tables for tables. Keep footnotes as they are.',
    '5. Write [illegible] for any word or phrase that cannot be read. Never guess.',
    '6. Output ONLY the cleaned text. No introduction, no comments, no code fences.',
    `7. This is part ${o.index + 1} of ${o.total}. Start and end exactly where the input starts and ends; it may begin or end in the middle of a sentence.`,
  ];
  if (o.handwritten) {
    rules.push('8. This text comes from HANDWRITTEN notes. Stay faithful to the writer: keep their wording, order and structure. Fix a spelling slip only when the intended word is certain.');
  }
  if (o.strict) {
    rules.push('', 'YOUR LAST ANSWER WAS REJECTED because its length was far from the input. Return ALL of the text, with nothing added and nothing left out.');
  }
  return [
    { role: 'system', content: rules.join('\n') },
    { role: 'user', content: raw },
  ];
}

// Puts the cleaned chunks back in order.
export function assembleArranged(chunks: { index: number; text: string }[]): string {
  return chunks.slice().sort((a, b) => a.index - b.index).map((c) => c.text).join('\n\n');
}

// START JOB: splits the raw text, makes the plan, queues one job per chunk.
export async function arrangeStartCore(d: ArrangeDeps, id: string, opts: { force?: boolean } = {}): Promise<ArrangeOutcome> {
  const m = await d.getMaterial(id);
  if (!m) return { ok: false, reason: 'Material not found.' };
  if (!opts.force && (m.arrangeStatus === 'running' || m.arrangeStatus === 'done')) return { ok: true, skipped: true };

  const chunks = splitIntoChunks(await d.getText(id));
  const now = d.now();
  if (chunks.length === 0) {
    await d.setMaterial(id, { arrangeStatus: 'failed', arrangeError: 'No extracted text to arrange.', updatedAt: now });
    return { ok: false, reason: 'No extracted text.' };
  }

  await d.clearChunks(id);
  await d.setMaterial(id, {
    arrangeStatus: 'running', arrangeError: null, arrangeStartedAt: now, updatedAt: now,
    arrangeChunks: { total: chunks.length, done: 0, kept: 0 },
  });
  const queued = await d.enqueueChunks(id, chunks.map((_, i) => i));
  if (!queued) {
    await d.setMaterial(id, { arrangeStatus: 'failed', arrangeError: 'Could not queue the cleaning jobs.', updatedAt: d.now() });
    return { ok: false, retry: true, reason: 'Could not queue the chunks.' };
  }
  return { ok: true };
}

// CHUNK JOB: cleans one chunk. lastAttempt = QStash will not try again, so a failure keeps the raw chunk.
export async function arrangeChunkCore(d: ArrangeDeps, id: string, index: number, opts: { lastAttempt?: boolean } = {}): Promise<ArrangeOutcome> {
  const m = await d.getMaterial(id);
  if (!m) return { ok: false, reason: 'Material not found.' };
  if (m.arrangeStatus !== 'running') return { ok: true, skipped: true };   // removed, reset or already finished

  const chunks = splitIntoChunks(await d.getText(id));
  if (index < 0 || index >= chunks.length) return { ok: false, reason: 'Chunk number out of range.' };
  const raw = chunks[index];

  if (!(await d.hasChunk(id, index))) {
    const handwritten = !!(m.reading && m.reading.handwritten === true);
    const inWords = wordCount(raw);
    let out: string | null = null;
    let reason: string | null = null;

    for (let attempt = 0; attempt < 2 && out === null; attempt++) {
      let r: { text: string; truncated: boolean };
      try {
        r = await d.chat(buildMessages(raw, { handwritten, index, total: chunks.length, strict: attempt > 0 }));
      } catch (e) {
        const msg = String((e as any)?.message ?? e).slice(0, 200);
        if (!opts.lastAttempt) return { ok: false, retry: true, reason: 'AI error: ' + msg };
        reason = 'AI error: ' + msg;
        break;
      }
      const t = cleanModelOutput(r.text);
      const outWords = wordCount(t);
      if (r.truncated) reason = 'The AI answer was cut off.';
      else if (!t) reason = 'The AI returned nothing.';
      else if (!ratioOk(inWords, outWords)) reason = `Length changed too much (${inWords} words became ${outWords}).`;
      else { out = t; reason = null; }
    }

    const text = out !== null ? out : raw;
    await d.saveChunk(id, index, {
      index, text, status: out !== null ? 'ok' : 'kept_raw', reason: out !== null ? null : reason,
      inWords, outWords: wordCount(text), updatedAt: d.now(),
    });
  }

  const tl = await d.tally(id);
  const now = d.now();
  const finished = tl.count >= chunks.length;
  await d.setMaterial(id, {
    arrangeChunks: { total: chunks.length, done: Math.min(tl.count, chunks.length), kept: tl.kept },
    ...(finished ? { arrangeStatus: 'done', arrangedAt: now } : {}),
    updatedAt: now,
  });
  return { ok: true };
}
