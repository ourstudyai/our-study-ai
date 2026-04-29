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

    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await adminAuth.verifySessionCookie(session, true);

    const snap = await adminDb.collection('materials').doc(materialId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const mat = snap.data()!;
    const pageCount = mat.pageCount || 1;
    const fileUrl: string = mat.fileUrl;

    // Extract public ID from Cloudinary URL
    const urlParts = fileUrl.split('/upload/');
    if (urlParts.length < 2) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });

    // Strip version and extension to get clean public ID
    let publicIdRaw = urlParts[1];
    // Remove version prefix if present (v1234567890/)
    publicIdRaw = publicIdRaw.replace(/^v\d+\//, '');
    // Remove extension
    const publicId = publicIdRaw.replace(/\.[^/.]+$/, '');

    // Generate page image URLs for each page
    const pages = Array.from({ length: pageCount }, (_, i) => {
      const pageUrl = cloudinary.url(publicId, {
        resource_type: 'image',
        format: 'jpg',
        page: i + 1,
        quality: 85,
        width: 1200,
        crop: 'limit',
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      return { page: i + 1, url: pageUrl };
    });

    return NextResponse.json({ pages, pageCount });
  } catch (err) {
    console.error('[material-pages] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
