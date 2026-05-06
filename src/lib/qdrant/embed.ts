export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedBatch([text]);
  return vectors[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
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
    results.push(...data.data.map((d: { embedding: number[] }) => d.embedding));
  }
  return results;
}
