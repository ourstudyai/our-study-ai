import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '@/lib/r2';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const docSnap = await adminDb.collection('share_temp').doc(token).get();
    if (!docSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { keys, names } = docSnap.data() as { keys: string[]; names: string[] };
    const urls = keys.map(key => `${R2_PUBLIC_URL}/${key}`);

    return NextResponse.json({ keys, names, urls });
  } catch (err) {
    console.error('[share-temp GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const docSnap = await adminDb.collection('share_temp').doc(token).get();
    if (!docSnap.exists) return NextResponse.json({ ok: true });

    const { keys } = docSnap.data() as { keys: string[] };

    for (const key of keys) {
      try {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (err) {
        console.warn('[share-temp DELETE] R2 delete failed for key:', key, err);
      }
    }

    await adminDb.collection('share_temp').doc(token).delete();
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error('[share-temp DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
