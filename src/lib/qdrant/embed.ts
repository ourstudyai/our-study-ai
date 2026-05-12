// src/lib/qdrant/embed.ts

const EMBED_CHAR_LIMIT = 6000;

function splitAtParagraph(text: string): [string, string] {
  const cutZone = text.slice(0, EMBED_CHAR_LIMIT);
  const lastBreak = cutZone.lastIndexOf('\n\n');
  const cutAt = lastBreak > EMBED_CHAR_LIMIT / 2 ? lastBreak : EMBED_CHAR_LIMIT;
  return [text.slice(0, cutAt).trim(), text.slice(cutAt).trim()];
}

function splitForEmbed(text: string): string[] {
  if (text.length <= EMBED_CHAR_LIMIT) return [text];
  const [first, rest] = splitAtParagraph(text);
  return [first, ...splitForEmbed(rest)];
}

export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedBatch([text]);
  return vectors[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  // Expand any oversized texts into safe pieces
  const expanded: { original: number; piece: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    const pieces = splitForEmbed(texts[i]);
    for (const piece of pieces) {
      expanded.push({ original: i, piece });
    }
  }

  const BATCH_SIZE = 20;
  const pieceVectors: number[][] = [];

  for (let i = 0; i < expanded.length; i += BATCH_SIZE) {
    const slice = expanded.slice(i, i + BATCH_SIZE).map(e => e.piece);
    const res = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({ model: 'mistral-embed', input: slice }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Mistral embed failed: ${err}`);
    }
    const data = await res.json();
    pieceVectors.push(...data.data.map((d: { embedding: number[] }) => d.embedding));
  }

  // For each original text, average the vectors of all its pieces
  const results: number[][] = new Array(texts.length);
  const pieceCounts: number[] = new Array(texts.length).fill(0);
  const pieceSums: number[][] = texts.map(() => []);

  for (let i = 0; i < expanded.length; i++) {
    const orig = expanded[i].original;
    const vec = pieceVectors[i];
    if (pieceSums[orig].length === 0) {
      pieceSums[orig] = vec.slice();
    } else {
      for (let j = 0; j < vec.length; j++) {
        pieceSums[orig][j] += vec[j];
      }
    }
    pieceCounts[orig]++;
  }

  for (let i = 0; i < texts.length; i++) {
    const count = pieceCounts[i];
    results[i] = pieceSums[i].map(v => v / count);
  }

  return results;
}
