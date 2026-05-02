// src/app/api/preview-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const session = cookies().get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await adminAuth.verifyIdToken(session);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const materialId = req.nextUrl.searchParams.get('materialId');
    if (!materialId) return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });

    // Fetch material doc from Firestore
    const materialDoc = await adminDb.collection('materials').doc(materialId).get();
    if (!materialDoc.exists) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    const fileUrl: string = materialDoc.data()?.fileUrl;
    if (!fileUrl) return NextResponse.json({ error: 'No fileUrl on material' }, { status: 404 });

    // Fetch the R2 file server-side
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 });

    const contentType = fileRes.headers.get('content-type') ?? 'application/octet-stream';
    const body = await fileRes.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('preview-proxy error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
