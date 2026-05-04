export async function embedText(text: string): Promise<number[]> {
  const res = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: [text],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral embed failed: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}
