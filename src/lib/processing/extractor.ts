// src/lib/processing/extractor.ts
// Extracts text from uploaded files.
// Text PDFs → pdf-parse
// DOCX → mammoth
// Scanned PDFs, images, DOCX failures → Mistral OCR (mistral-ocr-latest)

import mammoth from "mammoth";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ExtractionResult = {
    text: string;
    method: "pdf-parse" | "mammoth" | "plain-text" | "mistral-ocr" | "ocr_pending";
    pageCount?: number;
    wordCount: number;
    isScanned: boolean;
};

// ─── Mistral OCR ──────────────────────────────────────────────────────────────
async function runMistralOCR(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY not set");

    // Step 1: Upload buffer to Mistral files API
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, fileName);
    formData.append("purpose", "ocr");

    const uploadRes = await fetch("https://api.mistral.ai/v1/files", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
    });
    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Mistral file upload HTTP ${uploadRes.status}: ${err}`);
    }
    const uploadData = await uploadRes.json() as { id: string };
    const fileId = uploadData.id;

    try {
        // Step 2: Get signed URL
        const urlRes = await fetch(`https://api.mistral.ai/v1/files/${fileId}/url`, {
            headers: { "Authorization": `Bearer ${apiKey}` },
        });
        if (!urlRes.ok) {
            const err = await urlRes.text();
            throw new Error(`Mistral signed URL HTTP ${urlRes.status}: ${err}`);
        }
        const urlData = await urlRes.json() as { url: string };
        const signedUrl = urlData.url;

        // Step 3: Run OCR
        const ocrRes = await fetch("https://api.mistral.ai/v1/ocr", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "mistral-ocr-latest",
                document: {
                    type: "document_url",
                    document_url: signedUrl,
                },
            }),
        });
        if (!ocrRes.ok) {
            const err = await ocrRes.text();
            throw new Error(`Mistral OCR HTTP ${ocrRes.status}: ${err}`);
        }
        const ocrData = await ocrRes.json() as { pages?: { markdown?: string }[] };
        return ocrData.pages?.map((p) => p.markdown ?? "").join("\n\n").trim() ?? "";

    } finally {
        // Cleanup: delete file from Mistral (fire and forget)
        fetch(`https://api.mistral.ai/v1/files/${fileId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${apiKey}` },
        }).catch(() => {});
    }
}

// ─── Main Extractor ───────────────────────────────────────────────────────────
export async function extractText(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    cloudinaryUrl?: string
): Promise<ExtractionResult> {

    // ── PDF ───────────────────────────────────────────────────────────────────
    if (mimeType === "application/pdf") {
        try {
            const ocrText = await runMistralOCR(buffer, mimeType, fileName);
            const wordCount = countWords(ocrText);
            return {
                text: ocrText,
                method: "mistral-ocr",
                wordCount,
                pageCount: 1,
                isScanned: wordCount < 50,
            };
        } catch (err) {
            console.error("[extractor] Mistral OCR failed for PDF:", err);
        }
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    // ── DOCX ──────────────────────────────────────────────────────────────────
    if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.endsWith(".docx")
    ) {
        try {
            const { value: text } = await mammoth.extractRawText({ buffer });
            const cleaned = text?.trim() ?? "";
            if (countWords(cleaned) >= 10) {
                return { text: cleaned, method: "mammoth", wordCount: countWords(cleaned), isScanned: false };
            }
        } catch (err) {
            console.error("[extractor] DOCX mammoth failed:", err);
        }
        try {
            const ocrText = await runMistralOCR(buffer, mimeType, fileName);
            return { text: ocrText, method: "mistral-ocr", wordCount: countWords(ocrText), isScanned: true };
        } catch (err) {
            console.error("[extractor] Mistral OCR failed for DOCX:", err);
        }
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    // ── Plain Text ────────────────────────────────────────────────────────────
    if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
        const text = buffer.toString("utf-8").trim();
        return { text, method: "plain-text", wordCount: countWords(text), isScanned: false };
    }

    // ── Images ────────────────────────────────────────────────────────────────
    if (
        mimeType === "image/jpeg" ||
        mimeType === "image/png" ||
        mimeType === "image/jpg" ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg") ||
        fileName.endsWith(".png")
    ) {
        try {
            const ocrText = await runMistralOCR(buffer, mimeType, fileName);
            return { text: ocrText, method: "mistral-ocr", wordCount: countWords(ocrText), isScanned: true };
        } catch (err) {
            console.error("[extractor] Mistral OCR failed for image:", err);
        }
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    // ── Unknown / Unsupported ─────────────────────────────────────────────────
    return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countWords(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}
