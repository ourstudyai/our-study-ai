// src/app/api/process-upload/route.ts
// 1. Receives file from contribute page
// 2. Uploads to Cloudinary (replaces Firebase Storage)
// 3. Extracts text (pdf-parse / mammoth / Mistral OCR via Cloudinary URL)
// 4. Classifies material
// 5. Saves to Firestore

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { extractText } from "@/lib/processing/extractor";
import { classifyMaterial, MaterialCategory } from "@/lib/processing/classifier";
import { saveMaterial } from "@/lib/firestore/materials";
import type { MaterialStatus } from "@/lib/firestore/materials";

// ─── Configure Cloudinary ─────────────────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
});

// ─── Upload buffer to Cloudinary ──────────────────────────────────────────────
async function uploadToCloudinary(
    buffer: Buffer,
    fileName: string,
    folder: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const publicId = `${folder}/${Date.now()}_${sanitized}`;

        const stream = cloudinary.uploader.upload_stream(
            {
                public_id: publicId,
                resource_type: "raw",   // PDFs, DOCX, etc.
                overwrite: false,
            },
            (error, result) => {
                if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
                resolve(result.secure_url);
            }
        );

        stream.end(buffer);
    });
}

export async function POST(req: NextRequest) {
    try {
        // ── 1. Parse request ────────────────────────────────────────────────
        const formData = await req.formData();

        const file = formData.get("file") as File | null;
        const uploadedBy = formData.get("uploadedBy") as string | null;
        const uploadedByRole = formData.get("uploadedByRole") as string | null;
        const uploaderEmail = formData.get("uploaderEmail") as string | null;

        // Optional fields from careful-upload flow
        const suggestedCourseName = formData.get("suggestedCourseName") as string | null;
        const suggestedCourseId = formData.get("suggestedCourseId") as string | null;
        const category = formData.get("category") as string | null;

        if (!file || !uploadedBy || !uploadedByRole || !uploaderEmail) {
            return NextResponse.json(
                { error: "Missing required fields: file, uploadedBy, uploadedByRole, uploaderEmail" },
                { status: 400 }
            );
        }

        const fileName = file.name;
        const mimeType = file.type;

        // ── 2. Convert to buffer ─────────────────────────────────────────────
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // ── 3. Upload to Cloudinary ──────────────────────────────────────────
        // Build a folder path similar to the old Firebase Storage path
        const folder = suggestedCourseId
            ? `contributions/${suggestedCourseId}`
            : "contributions/auto-detect";

        let cloudinaryUrl: string;
        try {
            cloudinaryUrl = await uploadToCloudinary(buffer, fileName, folder);
        } catch (err) {
            console.error("[process-upload] Cloudinary upload failed:", err);
            return NextResponse.json(
                { error: "File storage failed. Please try again." },
                { status: 500 }
            );
        }

        // ── 4. Extract text (passes Cloudinary URL for OCR fallback) ─────────
        const extraction = await extractText(buffer, mimeType, fileName, cloudinaryUrl);

        // ── 5. Classify material ─────────────────────────────────────────────
        let classification = {
            category: (category ?? "other") as MaterialCategory,
            suggestedCourseId: suggestedCourseId ?? null,
            suggestedCourseName: suggestedCourseName ?? null,
            detectedCourseName: null as string | null,
            confidence: "low" as "high" | "medium" | "low",
            reason: "Scanned file — OCR pending.",
        };

        if (extraction.method !== "ocr_pending" && extraction.text) {
            const autoClass = await classifyMaterial(extraction.text, fileName);
            // If a course was manually specified, keep it — override only category and confidence
            classification = {
                ...autoClass,
                suggestedCourseId: suggestedCourseId ?? autoClass.suggestedCourseId,
                suggestedCourseName: suggestedCourseName ?? autoClass.suggestedCourseName,
                category: (category as MaterialCategory) ?? autoClass.category,
            };
        }

        // ── 6. Determine status ──────────────────────────────────────────────
        let status: MaterialStatus = "pending_review";

        if (extraction.method === "ocr_pending") {
            status = "ocr_pending";
        } else if (!classification.suggestedCourseId) {
            if (classification.detectedCourseName) {
                status = "awaiting_course";
            } else {
                status = "quarantined";
            }
        }

        // ── 7. Save to Firestore ─────────────────────────────────────────────
        const materialId = await saveMaterial({
            fileName,
            fileUrl: cloudinaryUrl,   // Cloudinary URL stored here
            mimeType,
            uploadedBy,
            uploadedByRole,
            uploaderEmail,
            extractedText: extraction.text,
            wordCount: extraction.wordCount,
            pageCount: extraction.pageCount,
            isScanned: extraction.isScanned,
            extractionMethod: extraction.method,
            category: classification.category,
            suggestedCourseId: classification.suggestedCourseId,
            suggestedCourseName: classification.suggestedCourseName,
            detectedCourseName: classification.detectedCourseName,
            confirmedCourseId: null,
            confirmedCourseName: null,
            confidence: classification.confidence,
            classifierReason: classification.reason,
            status,
        });

        // ── 8. Return result ─────────────────────────────────────────────────
        return NextResponse.json({
            success: true,
            materialId,
            status,
            category: classification.category,
            suggestedCourseId: classification.suggestedCourseId,
            suggestedCourseName: classification.suggestedCourseName,
            detectedCourseName: classification.detectedCourseName,
            confidence: classification.confidence,
            wordCount: extraction.wordCount,
            extractionMethod: extraction.method,
            fileUrl: cloudinaryUrl,
        });

    } catch (err) {
        console.error("[process-upload] Unexpected error:", err);
        return NextResponse.json(
            { error: "Internal server error during file processing." },
            { status: 500 }
        );
    }
}