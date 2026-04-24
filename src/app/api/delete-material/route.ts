export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
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

    const matRef = adminDb.collection('materials').doc(materialId);
    const matSnap = await matRef.get();
    if (!matSnap.exists) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    const mat = matSnap.data()!;

    // Delete from Cloudinary
    if (mat.fileUrl) {
      const publicId = mat.fileUrl.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    }

    // Delete chunks
    const chunksSnap = await adminDb.collection('material_chunks').where('materialId', '==', materialId).get();
    const batch = adminDb.batch();
    chunksSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    // Delete material doc
    await matRef.delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('delete-material error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
