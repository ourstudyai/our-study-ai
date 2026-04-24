// src/app/api/process-upload/route.ts
// Phase 1: Upload to Cloudinary + save stub to Firestore + queue background job via QStash
// Returns materialId immediately (~3s), well within Vercel Hobby 10s limit

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { Client } from "@upstash/qstash";
import { adminDb } from "@/lib/firebase/admin";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

async function uploadToCloudinary(buffer: Buffer, fileName: string, folder: string): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
        const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const publicId = `${folder}/${Date.now()}_${sanitized}`;
        const stream = cloudinary.uploader.upload_stream(
            { public_id: publicId, resource_type: "raw", overwrite: false },
            (error, result) => {
                if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
                // Generate signed URL valid for 6 hours
                const signedUrl = cloudinary.url(result.public_id, {
                    resource_type: 'raw',
                    type: 'upload',
                    sign_url: true,
                    expires_at: Math.floor(Date.now() / 1000) + 21600,
                });
                resolve({ url: signedUrl, publicId: result.public_id });
            }
        );
        stream.end(buffer);
    });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const uploadedBy = formData.get("uploadedBy") as string | null;
        const uploadedByRole = formData.get("uploadedByRole") as string | null;
        const uploaderEmail = formData.get("uploaderEmail") as string | null;
        const suggestedCourseName = formData.get("suggestedCourseName") as string | null;
        const suggestedCourseId = formData.get("suggestedCourseId") as string | null;
        const category = formData.get("category") as string | null;

        if (!file || !uploadedBy || !uploadedByRole || !uploaderEmail) {
            return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
        }

        const fileName = file.name;
        const mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // ── Phase 1a: Upload to Cloudinary ───────────────────────────────────
        const folder = suggestedCourseId
            ? `contributions/${suggestedCourseId}`
            : "contributions/auto-detect";

        let cloudinaryUrl: string;
        try {
            ({ url: cloudinaryUrl } = await uploadToCloudinary(buffer, fileName, folder));
        } catch (err) {
            console.error("[process-upload] Cloudinary upload failed:", err);
            return NextResponse.json({ error: "File storage failed. Please try again." }, { status: 500 });
        }

        // ── Phase 1b: Save stub to Firestore ─────────────────────────────────
        const matRef = adminDb.collection('materials').doc();
        const materialId = matRef.id;
        await matRef.set({
            fileName,
            fileUrl: cloudinaryUrl,
            mimeType,
            uploadedBy,
            uploadedByRole,
            uploaderEmail,
            extractedText: "",
            wordCount: 0,
            pageCount: 0,
            isScanned: false,
            extractionMethod: "none",
            category: (category as any) ?? "other",
            suggestedCourseId: suggestedCourseId ?? null,
            suggestedCourseName: suggestedCourseName ?? null,
            detectedCourseName: null,
            confirmedCourseId: null,
            confirmedCourseName: null,
            confidence: "low",
            classifierReason: "Processing queued.",
            status: "processing",
            createdAt: new Date(),
        });

        // ── Phase 1c: Queue background processing via QStash ─────────────────
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get("host")}`;
        const backgroundUrl = `${appUrl}/api/process-background`;

        try {
            await qstash.publishJSON({
                url: backgroundUrl,
                body: {
                    materialId,
                    cloudinaryUrl,
                    fileBase64: buffer.toString("base64"),
                    mimeType,
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

        return NextResponse.json({
            success: true,
            materialId,
            status: "processing",
        });

    } catch (err) {
        console.error("[process-upload] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}