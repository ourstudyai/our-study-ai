// src/lib/processing/extractor.ts
// Extracts raw text from uploaded files (PDF, DOCX, TXT)
// 
// ⭐ GOOGLE CLOUD OCR SLOT (20%) — DO NOT BUILD YET
// When Google Cloud billing is activated and Blaze plan is enabled:
// - Replace the "ocr_pending" return block below with Google Cloud Vision API call
// - Or use Document AI for higher accuracy on scanned theology texts
// - Search for "GOOGLE_CLOUD_OCR_SLOT" in this file to find exact insertion point

import mammoth from "mammoth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExtractionResult = {
    text: string;
    method: "pdf-parse" | "mammoth" | "plain-text" | "ocr_pending";
    pageCount?: number;
    wordCount: number;
    isScanned: boolean;
};

// ─── Main Extractor ───────────────────────────────────────────────────────────

export async function extractText(
    buffer: Buffer,
    mimeType: string,
    fileName: string
): Promise<ExtractionResult> {

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (mimeType === "application/pdf") {
        try {
            const pdfParse = require("pdf-parse");
            const result = await pdfParse(buffer);

            const text = result.text?.trim() ?? "";
            const wordCount = countWords(text);
            const pageCount = result.numpages ?? 1;

            // If very little text extracted, likely a scanned PDF
            // ── GOOGLE_CLOUD_OCR_SLOT ─────────────────────────────────────────────
            // Replace this block when Google Cloud Vision is ready:
            // if (wordCount < 50) {
            //   const ocrText = await callGoogleCloudVision(buffer);
            //   return { text: ocrText, method: "ocr_pending", pageCount, wordCount: countWords(ocrText), isScanned: true };
            // }
            // ─────────────────────────────────────────────────────────────────────
            if (wordCount < 50) {
                return {
                    text: "",
                    method: "ocr_pending",
                    pageCount,
                    wordCount: 0,
                    isScanned: true,
                };
            }

            return {
                text,
                method: "pdf-parse",
                pageCount,
                wordCount,
                isScanned: false,
            };

        } catch (err) {
            console.error("[extractor] PDF parse failed:", err);
            return {
                text: "",
                method: "ocr_pending",
                pageCount: 1,
                wordCount: 0,
                isScanned: true,
            };
        }
    }

    // ── DOCX ─────────────────────────────────────────────────────────────────
    if (
        mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.endsWith(".docx")
    ) {
        try {
            const { value: text } = await mammoth.extractRawText({ buffer });
            const cleaned = text?.trim() ?? "";
            return {
                text: cleaned,
                method: "mammoth",
                wordCount: countWords(cleaned),
                isScanned: false,
            };
        } catch (err) {
            console.error("[extractor] DOCX parse failed:", err);
            return {
                text: "",
                method: "ocr_pending",
                wordCount: 0,
                isScanned: true,
            };
        }
    }

    // ── Plain Text ────────────────────────────────────────────────────────────
    if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
        const text = buffer.toString("utf-8").trim();
        return {
            text,
            method: "plain-text",
            wordCount: countWords(text),
            isScanned: false,
        };
    }

    // ── Unsupported / Image-only files ────────────────────────────────────────
    // ── GOOGLE_CLOUD_OCR_SLOT ─────────────────────────────────────────────────
    // Images (.jpg, .png, .jpeg) will land here.
    // When Google Cloud Vision is ready, add a handler above this return.
    // ─────────────────────────────────────────────────────────────────────────
    return {
        text: "",
        method: "ocr_pending",
        wordCount: 0,
        isScanned: true,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

