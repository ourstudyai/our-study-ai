import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { adminDb } from '@/lib/firebase/admin';
import { deleteChunksByMaterial } from '@/lib/firestore/materials';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const { materialId, publicId } = await req.json();
    if (!materialId) return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });
    // Delete chunks
    await deleteChunksByMaterial(materialId);
    // Delete Cloudinary file
    if (publicId) {
      try { await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }); } catch {}
      try { await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }); } catch {}
    }
    // Delete Firestore document
    await adminDb.collection('materials').doc(materialId).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delete-material]', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
