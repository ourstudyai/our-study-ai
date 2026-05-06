export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedBatch([text]);
  return vectors[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral embed failed: ${err}`);
  }

  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}
