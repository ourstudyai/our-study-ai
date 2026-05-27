import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { adminDb } from '@/lib/firebase/admin';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.redirect(new URL('/contribute?share_error=no_files', req.url), 303);
    }

    const token = randomUUID();
    const keys: string[] = [];
    const names: string[] = [];

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `temp/share/${token}/${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'application/octet-stream',
      }));

      keys.push(key);
      names.push(file.name);
    }

    await adminDb.collection('share_temp').doc(token).set({
      keys,
      names,
      createdAt: new Date().toISOString(),
    });

    const redirectUrl = new URL('/contribute', req.url);
    redirectUrl.searchParams.set('share_token', token);
    return NextResponse.redirect(redirectUrl, 303);

  } catch (err) {
    console.error('[share-handler]', err);
    return NextResponse.redirect(new URL('/contribute?share_error=1', req.url), 303);
  }
}
