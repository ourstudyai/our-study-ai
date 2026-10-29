export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { extractText, ExtractionResult } from "@/lib/processing/extractor";
import { classifyMaterial, MaterialCategory } from "@/lib/processing/classifier";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  try {
    // Verify this came from QStash
    const signature = req.headers.get('upstash-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
    const rawBody = await req.text();
    const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
    }
    const {
      materialId,
      fileUrl,
      mimeType,
      fileName,
      category,
      suggestedCourseId,
      suggestedCourseName,
    } = JSON.parse(rawBody);

    if (!materialId || !fileUrl) {
      return NextResponse.json({ error: "Missing materialId or fileUrl." }, { status: 400 });
    }

    console.log(`[process-background] Starting for material ${materialId}`);

    // Always read the file from R2 (Redis is no longer used).
    let buffer = Buffer.alloc(0);
    let bufferError = "";
    try {
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
      buffer = Buffer.from(await fileRes.arrayBuffer());
      console.log("[process-background] Buffer from R2, size:", buffer.length);
    } catch (err: any) {
      bufferError = "Could not download the file from storage: " + String(err?.message ?? err).slice(0, 200);
      console.error("[process-background] Failed to get buffer:", err);
    }
    if (!bufferError && buffer.length === 0) bufferError = "The stored file is empty (0 bytes).";

    const extraction: ExtractionResult = bufferError
      ? { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: bufferError }
      : await extractText(buffer, mimeType, fileName, fileUrl);
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

    // Lean parent doc — no extractedText
    await adminDb.collection("materials").doc(materialId).update({
      wordCount: extraction.wordCount,
      pageCount: extraction.pageCount ?? 0,
      isScanned: extraction.isScanned,
      extractionMethod: extraction.method,
      ocrError: extraction.error ?? "",
      category: classification.category,
      suggestedCourseId: classification.suggestedCourseId,
      suggestedCourseName: classification.suggestedCourseName,
      detectedCourseName: classification.detectedCourseName,
      confidence: classification.confidence,
      classifierReason: classification.reason,
      status: finalStatus as any,
    });

    // Heavy text → sub-document
    if (extraction.text) {
      await adminDb
        .collection("materials").doc(materialId)
        .collection("body").doc("extracted")
        .set({ extractedText: extraction.text, updatedAt: new Date().toISOString() });
    }

    try {
      await fetch(`https://our-study-ai.vercel.app/api/notify-admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET! },
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
