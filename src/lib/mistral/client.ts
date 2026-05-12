// src/lib/mistral/client.ts
import Mistral from '@mistralai/mistralai';

let mistralClient: Mistral | null = null;

export function getMistralClient(): Mistral {
  if (!mistralClient) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY is not configured');
    }
    mistralClient = new Mistral({ apiKey });
  }
  return mistralClient;
}
