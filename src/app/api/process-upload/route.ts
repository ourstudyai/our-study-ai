// src/app/api/process-upload/route.ts
// API endpoint called after a file is uploaded to Firebase Storage
// Extracts text, classifies the material, saves to Firestore

import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/processing/extractor";
import { classifyMaterial, MaterialCategory } from "@/lib/processing/classifier";
import { saveMaterial } from "@/lib/firestore/materials";
import type { MaterialStatus } from "@/lib/firestore/materials";

export async function POST(req: NextRequest) {
    try {
        // ── 1. Parse request ────────────────────────────────────────────────────
        const formData = await req.formData();

        const file = formData.get("file") as File | null;
        const fileUrl = formData.get("fileUrl") as string | null;
        const uploadedBy = formData.get("uploadedBy") as string | null;
        const uploadedByRole = formData.get("uploadedByRole") as string | null;

        if (!file || !fileUrl || !uploadedBy || !uploadedByRole) {
            return NextResponse.json(
                { error: "Missing required fields: file, fileUrl, uploadedBy, uploadedByRole" },
                { status: 400 }
            );
        }

        const fileName = file.name;
        const mimeType = file.type;

        // ── 2. Convert file to buffer ───────────────────────────────────────────
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // ── 3. Extract text ─────────────────────────────────────────────────────
        const extraction = await extractText(buffer, mimeType, fileName);

        // ── 4. Classify material ────────────────────────────────────────────────
        let classification = {
            category: "other" as MaterialCategory,
            suggestedCourseId: null as string | null,
            suggestedCourseName: null as string | null,
            detectedCourseName: null as string | null,
            confidence: "low" as "high" | "medium" | "low",
            reason: "Scanned file — OCR pending.",
        };

        if (extraction.method !== "ocr_pending" && extraction.text) {
            classification = await classifyMaterial(extraction.text, fileName);
        }

        // ── 5. Determine status ─────────────────────────────────────────────────
        //
        // ocr_pending     → scanned file, needs Google Cloud OCR
        //                   GOOGLE_CLOUD_OCR_SLOT: after OCR, re-run classifyMaterial
        //                   then call resurrectMaterialsForCourse if course still missing
        //
        // awaiting_course → text extracted, classifier detected a course name signal
        //                   (detectedCourseName is set) but no matching Firestore course
        //                   exists yet. Will be resurrected when that course is created.
        //
        // quarantined     → text extracted but classifier found no course signal at all —
        //                   no courseId, no detectedCourseName. Needs full manual assign.
        //
        // pending_review  → text extracted + Firestore course matched. Admin confirms.

        let status: MaterialStatus = "pending_review";

        if (extraction.method === "ocr_pending") {
            status = "ocr_pending";
        } else if (!classification.suggestedCourseId) {
            // No Firestore match — but did classifier detect any course name signal?
            if (classification.detectedCourseName) {
                status = "awaiting_course";
            } else {
                status = "quarantined";
            }
        }

        // ── 6. Save to Firestore ────────────────────────────────────────────────
        const materialId = await saveMaterial({
            fileName,
            fileUrl,
            mimeType,
            uploadedBy,
            uploadedByRole,
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

        // ── 7. Return result ────────────────────────────────────────────────────
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
        });

    } catch (err) {
        console.error("[process-upload] Unexpected error:", err);
        return NextResponse.json(
            { error: "Internal server error during file processing." },
            { status: 500 }
        );
    }
}