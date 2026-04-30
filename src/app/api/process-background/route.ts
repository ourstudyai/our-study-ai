export const dynamic = "force-dynamic";
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
      fileUrl,
      mimeType,
      fileName,
      category,
      suggestedCourseId,
      suggestedCourseName,
    } = await req.json();

    if (!materialId || !fileUrl) {
      return NextResponse.json({ error: "Missing materialId or fileUrl." }, { status: 400 });
    }

    console.log(`[process-background] Starting for material ${materialId}`);

    let buffer = Buffer.alloc(0);
    try {
      const base64 = await redis.get<string>(`file:${materialId}`);
      if (base64) {
        buffer = Buffer.from(base64, "base64");
        console.log("[process-background] Buffer from Redis, size:", buffer.length);
        await redis.del(`file:${materialId}`);
      } else {
        console.warn("[process-background] No buffer in Redis, fetching from R2");
        const fileRes = await fetch(fileUrl);
        if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
        buffer = Buffer.from(await fileRes.arrayBuffer());
        console.log("[process-background] Buffer from R2, size:", buffer.length);
      }
    } catch (err) {
      console.error("[process-background] Failed to get buffer:", err);
    }

    const extraction = await extractText(buffer, mimeType, fileName, fileUrl);
    console.log(`[process-background] Extraction method: ${extraction.method}, words: ${extraction.wordCount}`);

    let finalStatus = "pending_review";
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

    if (extraction.method === "ocr_pending") finalStatus = "ocr_pending";

    await adminDb.collection("materials").doc(materialId).update({
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

    try {
      await fetch(`https://our-study-ai.vercel.app/api/notify-admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_upload",
          title: "📄 New Upload",
          body: `${fileName} is ${finalStatus}`,
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
