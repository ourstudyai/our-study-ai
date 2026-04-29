export const dynamic = "force-dynamic";

// src/app/api/process-background/route.ts
// Phase 2: Called by QStash after upload completes.
// Fetches file from Cloudinary, extracts text, classifies, updates Firestore.

import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/processing/extractor";
import { classifyMaterial, MaterialCategory } from "@/lib/processing/classifier";
import { adminDb } from "@/lib/firebase/admin";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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

        // ── Fetch file from Redis ─────────────────────────────────────────────
        let buffer = Buffer.alloc(0);
        try {
            const base64 = await redis.get<string>(`file:${materialId}`);
            if (base64) {
                buffer = Buffer.from(base64, "base64");
                console.log("[process-background] Buffer from Redis, size:", buffer.length);
                await redis.del(`file:${materialId}`);
            } else {
                console.warn("[process-background] No buffer in Redis, falling back to Cloudinary");
                const fileRes = await fetch(cloudinaryUrl);
                if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
                buffer = Buffer.from(await fileRes.arrayBuffer());
                console.log("[process-background] Buffer from Cloudinary, size:", buffer.length);
            }
        } catch (err) {
            console.error("[process-background] Failed to get buffer:", err);
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
        }

        // ── Update Firestore ──────────────────────────────────────────────────
        await adminDb.collection('materials').doc(materialId).update({
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

        // ── Notify admins ──────────────────────────────────────────────────────
        const statusLabels: Record<string, string> = {
          pending_review: "ready for review",
          ocr_pending: "awaiting OCR",
          awaiting_course: "needs course assignment",
          quarantined: "quarantined — no course match",
        };
        const label = statusLabels[finalStatus] ?? finalStatus;
        try {
          const appUrl = "https://our-study-ai.vercel.app";
          await fetch(`${appUrl}/api/notify-admins`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "new_upload",
              title: "📄 New Upload",
              body: `${fileName} is ${label}`,
              data: { materialId, status: finalStatus, fileName },
            }),
          });
        } catch (notifyErr) {
          console.error("[process-background] Notify failed:", notifyErr);
        }
        console.log(`[process-background] Done for material ${materialId}, status: ${finalStatus}`);
        return NextResponse.json({ success: true, materialId, status: finalStatus });

    } catch (err) {
        console.error("[process-background] Fatal error:", err);
        return NextResponse.json({ error: "Background processing failed." }, { status: 500 });
    }
}