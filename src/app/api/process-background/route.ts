// src/app/api/process-background/route.ts
// Phase 2: Called by QStash after upload completes.
// Fetches file from Cloudinary, extracts text, classifies, updates Firestore.

import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/processing/extractor";
import { classifyMaterial, MaterialCategory } from "@/lib/processing/classifier";
import { updateMaterial } from "@/lib/firestore/materials";

export async function POST(req: NextRequest) {
    try {
        const {
            materialId,
            cloudinaryUrl,
            mimeType,
            fileName,
            category,
            suggestedCourseId,
            suggestedCourseName,
        } = await req.json();

        if (!materialId || !cloudinaryUrl) {
            return NextResponse.json({ error: "Missing materialId or cloudinaryUrl." }, { status: 400 });
        }

        console.log(`[process-background] Starting for material ${materialId}`);

        // ── Fetch file from Cloudinary ────────────────────────────────────────
        let buffer = Buffer.alloc(0);
        try {
            const fileRes = await fetch(cloudinaryUrl);
            const arrayBuffer = await fileRes.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } catch (err) {
            console.error("[process-background] Failed to fetch file from Cloudinary:", err);
        }

        // ── Extract text ──────────────────────────────────────────────────────
        const extraction = await extractText(buffer, mimeType, fileName, cloudinaryUrl);
        console.log(`[process-background] Extraction method: ${extraction.method}, words: ${extraction.wordCount}`);

        // ── Classify ──────────────────────────────────────────────────────────
        let finalStatus: string = "pending_review";
        let classification = {
            category: (category ?? "other") as MaterialCategory,
            suggestedCourseId: suggestedCourseId ?? null,
            suggestedCourseName: suggestedCourseName ?? null,
            detectedCourseName: null as string | null,
            confidence: "low" as "high" | "medium" | "low",
            reason: "Awaiting extraction.",
        };

        if (extraction.method !== "ocr_pending" && extraction.text) {
            const autoClass = await classifyMaterial(extraction.text, fileName);
            classification = {
                ...autoClass,
                suggestedCourseId: suggestedCourseId ?? autoClass.suggestedCourseId,
                suggestedCourseName: suggestedCourseName ?? autoClass.suggestedCourseName,
                category: (category as MaterialCategory) ?? autoClass.category,
            };
        }

        if (extraction.method === "ocr_pending") {
            finalStatus = "ocr_pending";
        } else if (!classification.suggestedCourseId) {
            finalStatus = classification.detectedCourseName ? "awaiting_course" : "quarantined";
        }

        // ── Update Firestore ──────────────────────────────────────────────────
        await updateMaterial(materialId, {
            extractedText: extraction.text,
            wordCount: extraction.wordCount,
            pageCount: extraction.pageCount ?? 0,
            isScanned: extraction.isScanned,
            extractionMethod: extraction.method,
            category: classification.category,
            suggestedCourseId: classification.suggestedCourseId,
            suggestedCourseName: classification.suggestedCourseName,
            detectedCourseName: classification.detectedCourseName,
            confidence: classification.confidence,
            classifierReason: classification.reason,
            status: finalStatus as any,
        });

        console.log(`[process-background] Done for material ${materialId}, status: ${finalStatus}`);
        return NextResponse.json({ success: true, materialId, status: finalStatus });

    } catch (err) {
        console.error("[process-background] Fatal error:", err);
        return NextResponse.json({ error: "Background processing failed." }, { status: 500 });
    }
}