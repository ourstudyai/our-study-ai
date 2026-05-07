export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { upsertChunks } from '@/lib/qdrant/upsert';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  const { Receiver } = await import('@upstash/qstash');
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  const rawBody = await req.text();
  const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

  const { chunks } = JSON.parse(rawBody);
  if (!chunks?.length) return NextResponse.json({ ok: true, skipped: true });

  await upsertChunks(chunks);
  console.log(`[index-chunks] upserted ${chunks.length} chunks`);
  return NextResponse.json({ ok: true });
}
