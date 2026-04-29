import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function GET(req: NextRequest) {
  let publicId = req.nextUrl.searchParams.get('publicId');
  const fileUrl = req.nextUrl.searchParams.get('fileUrl');

  // Extract publicId from fileUrl if not provided directly
  if (!publicId && fileUrl) {
    const urlParts = fileUrl.split('/upload/');
    if (urlParts.length >= 2) {
      let raw = urlParts[1]
        .replace(/^s--[^-]+--.\//, '')
        .replace(/^v\d+\//, '');
      publicId = raw.replace(/\.[^/.]+$/, '');
    }
  }

  if (!publicId) return NextResponse.json({ error: 'Missing publicId or fileUrl' }, { status: 400 });

  try {
    const url = cloudinary.url(publicId, {
      resource_type: 'auto',
      type: 'upload',
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 31536000, // 1 year
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[material-url]', err);
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 });
  }
}
