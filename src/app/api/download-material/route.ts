export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { v2 as cloudinary } from 'cloudinary';

export async function POST(req: NextRequest) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  try {
    const { materialId } = await req.json();
    if (!materialId) return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });

    // Verify auth
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await adminAuth.verifySessionCookie(session, true);

    const matSnap = await adminDb.collection('materials').doc(materialId).get();
    if (!matSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const mat = matSnap.data()!;
    const fileUrl: string = mat.fileUrl;

    // Extract public ID from Cloudinary URL
    const urlParts = fileUrl.split('/upload/');
    if (urlParts.length < 2) return NextResponse.json({ error: 'Invalid file URL' }, { status: 400 });
    const publicIdWithExt = urlParts[1];
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');

    // Generate signed URL valid for 15 minutes
    const signedUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      type: 'upload',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 900,
    });

    return NextResponse.json({ signedUrl });
  } catch (err) {
    console.error('download-material error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
