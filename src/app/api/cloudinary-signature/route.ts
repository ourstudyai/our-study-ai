export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    const { fileName, folder, fileHash, checkOnly, mimeType } = await req.json();

    if (checkOnly) {
      if (!fileName || !folder || !fileHash) {
        return NextResponse.json({ error: "Missing fields." }, { status: 400 });
      }
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
      return NextResponse.json({ duplicate: false });
    }

    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${folder}/${Date.now()}_${sanitized}`;

    const signedUrl = await getSignedUrl(
      r2Client,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: mimeType ?? "application/octet-stream",
      }),
      { expiresIn: 300 } // 5 minutes to complete upload
    );

    const publicUrl = `${R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ signedUrl, key, publicUrl });
  } catch (err) {
    console.error("[r2-upload]", err);
    return NextResponse.json({ error: "Failed to generate upload URL." }, { status: 500 });
  }
}
