// src/app/api/process-upload/route.ts
// API endpoint called after a file is uploaded to Firebase Storage
// Extracts text, classifies the material, saves to Firestore
// Called by admin upload panel after storage upload completes

import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/processing/extractor";
import { classifyMaterial, ClassificationResult } from "@/lib/processing/classifier";
import { saveMaterial } from "@/lib/firestore/materials";
import type { MaterialStatus } from "@/lib/firestore/materials";

// ─── POST /api/process-upload ─────────────────────────────────────────────────

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
    const defaultClassification: ClassificationResult = {
      category: "other",
      suggestedCourseId: null,
      suggestedCourseName: null,
      confidence: "low",
      reason: "Scanned file — OCR pending.",
    };

    let classification: ClassificationResult = defaultClassification;

    if (extraction.method !== "ocr_pending" && extraction.text) {
      classification = await classifyMaterial(extraction.text, fileName);
    }

    // ── 5. Determine status ─────────────────────────────────────────────────
    // ocr_pending  → scanned file, needs Google Cloud OCR later
    // quarantined  → text extracted but no course match found
    // pending_review → text extracted + course suggested, needs admin confirmation

    let status: MaterialStatus = "pending_review";

    if (extraction.method === "ocr_pending") {
      status = "ocr_pending";
    } else if (!classification.suggestedCourseId) {
      status = "quarantined";
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