export const dynamic = "force-dynamic";

// src/app/api/process-upload/route.ts
// Phase 1: Receives publicId + metadata after direct Cloudinary upload.
// Saves Firestore stub + queues background job via QStash + notifies admins.

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: NextRequest) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  });

  try {
    const {
      publicId,
      fileHash,
      fileName,
      mimeType,
      uploadedBy,
      uploadedByRole,
      uploaderEmail,
      suggestedCourseName,
      suggestedCourseId,
      category,
    } = await req.json();

    if (!publicId || !uploadedBy || !uploaderEmail || !fileName) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Generate 1-year signed URL
    const cloudinaryUrl = cloudinary.url(publicId, {
      resource_type: "auto",
      type: "upload",
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 31536000,
    });

    // Save Firestore stub
    const matRef = adminDb.collection("materials").doc();
    const materialId = matRef.id;

    await matRef.set({
      fileName,
      mimeType: mimeType ?? "application/octet-stream",
      fileUrl: cloudinaryUrl,
      publicId,
      fileHash: fileHash ?? "",
      uploadedBy,
      uploadedByRole: uploadedByRole ?? "student",
      uploaderEmail,
      suggestedCourseName: suggestedCourseName ?? null,
      suggestedCourseId: suggestedCourseId ?? null,
      category: category ?? "other",
      status: "processing",
      indexed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Queue background processing
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://our-study-ai.vercel.app";

    try {
      await qstash.publishJSON({
        url: `${appUrl}/api/process-background`,
        body: {
          materialId,
          cloudinaryUrl,
          mimeType: mimeType ?? "application/octet-stream",
          fileName,
          category: category ?? "other",
          suggestedCourseId: suggestedCourseId ?? null,
          suggestedCourseName: suggestedCourseName ?? null,
        },
        retries: 3,
      });
    } catch (err) {
      console.error("[process-upload] QStash publish failed:", err);
    }

    // Notify admins immediately
    try {
      console.log("[process-upload] Notifying admins...");
      await fetch(`${appUrl}/api/notify-admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_upload",
          title: "📤 New Upload",
          body: `${fileName} was just uploaded and is being processed.`,
          data: { materialId, status: "processing", fileName },
        }),
      });
    } catch (notifyErr) {
      console.error("[process-upload] Notify failed:", notifyErr);
    }

    return NextResponse.json({ success: true, materialId, status: "processing" });

  } catch (err) {
    console.error("[process-upload] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
