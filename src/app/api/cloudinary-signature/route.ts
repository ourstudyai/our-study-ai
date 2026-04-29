export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { adminDb } from "@/lib/firebase/admin";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const { fileName, folder, fileHash } = await req.json();

    if (!fileName || !folder || !fileHash) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }

    // Duplicate check
    const existingSnap = await adminDb.collection("materials")
      .where("fileHash", "==", fileHash)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0].data();
      return NextResponse.json({
        duplicate: true,
        existingId: existingSnap.docs[0].id,
        existingFileName: existing.fileName,
        existingStatus: existing.status,
      }, { status: 409 });
    }

    // Generate Cloudinary signature
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const publicId = `${folder}/${Date.now()}_${sanitized}`;
    const timestamp = Math.round(Date.now() / 1000);

    const signature = cloudinary.utils.api_sign_request(
      { public_id: publicId, timestamp, overwrite: "false", resource_type: "auto" },
      process.env.CLOUDINARY_API_SECRET!
    );

    return NextResponse.json({
      signature,
      timestamp,
      publicId,
      apiKey: process.env.CLOUDINARY_API_KEY!,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    });
  } catch (err) {
    console.error("[cloudinary-signature]", err);
    return NextResponse.json({ error: "Failed to generate signature." }, { status: 500 });
  }
}
