// src/lib/processing/extractor.ts
// Extracts text from uploaded files.
// Text PDFs → pdf-parse
// DOCX → mammoth
// Scanned PDFs, images, DOCX failures → Mistral OCR 3 (mistral-ocr-latest)

import mammoth from "mammoth";
import { Mistral } from "@mistralai/mistralai";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExtractionResult = {
    text: string;
    method: "pdf-parse" | "mammoth" | "plain-text" | "mistral-ocr" | "ocr_pending";
    pageCount?: number;
    wordCount: number;
    isScanned: boolean;
};

// ─── Mistral OCR ──────────────────────────────────────────────────────────────

async function runMistralOCR(cloudinaryUrl: string): Promise<string> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY not set");

    const client = new Mistral({ apiKey });

    const response = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
            type: "document_url",
            documentUrl: cloudinaryUrl,
        },
    });

    // Concatenate all page texts
    const text = response.pages
        ?.map((p: { markdown?: string }) => p.markdown ?? "")
        .join("\n\n")
        .trim() ?? "";

    return text;
}

// ─── Main Extractor ───────────────────────────────────────────────────────────

export async function extractText(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    cloudinaryUrl?: string   // passed in for OCR fallback
): Promise<ExtractionResult> {

    // ── PDF — use Mistral OCR for all PDFs (pdf-parse incompatible with Vercel) ──
    if (mimeType === "application/pdf") {
        if (cloudinaryUrl) {
            try {
                const ocrText = await runMistralOCR(cloudinaryUrl);
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
        }
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    // ── DOCX ─────────────────────────────────────────────────────────────────
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

        // DOCX with no extractable text — try Mistral OCR
        if (cloudinaryUrl) {
            try {
                const ocrText = await runMistralOCR(cloudinaryUrl);
                return { text: ocrText, method: "mistral-ocr", wordCount: countWords(ocrText), isScanned: true };
            } catch (err) {
                console.error("[extractor] Mistral OCR failed for DOCX:", err);
            }
        }

        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    // ── Plain Text ────────────────────────────────────────────────────────────
    if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
        const text = buffer.toString("utf-8").trim();
        return { text, method: "plain-text", wordCount: countWords(text), isScanned: false };
    }

    // ── Images (JPG, PNG, JPEG) ───────────────────────────────────────────────
    if (
        mimeType === "image/jpeg" ||
        mimeType === "image/png" ||
        mimeType === "image/jpg" ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg") ||
        fileName.endsWith(".png")
    ) {
        if (cloudinaryUrl) {
            try {
                const ocrText = await runMistralOCR(cloudinaryUrl);
                return { text: ocrText, method: "mistral-ocr", wordCount: countWords(ocrText), isScanned: true };
            } catch (err) {
                console.error("[extractor] Mistral OCR failed for image:", err);
            }
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