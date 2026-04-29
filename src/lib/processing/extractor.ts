// src/lib/processing/extractor.ts
// Extracts text from uploaded files — returns markdown where possible.
// PDF → Mistral OCR (markdown output, headings preserved)
// DOCX → mammoth convertToHtml + heading conversion to markdown
// Images → Mistral OCR (markdown output)
// Plain text → raw text

import mammoth from "mammoth";

export type ExtractionResult = {
    text: string;
    method: "pdf-parse" | "mammoth" | "plain-text" | "mistral-ocr" | "ocr_pending";
    pageCount?: number;
    wordCount: number;
    isScanned: boolean;
};

function countWords(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

function patchBoldCapsHeadings(markdown: string): string {
    return markdown.replace(
        /^\*\*([A-Z][A-Z0-9\s\-:,]{3,})\*\*\s*$/gm,
        "## $1"
    );
}

function htmlToMarkdown(html: string): string {
    return html
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, m) => "# " + m.trim() + "\n")
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, m) => "## " + m.trim() + "\n")
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, m) => "### " + m.trim() + "\n")
        .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, m) => "#### " + m.trim() + "\n")
        .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, m) => "**" + m.trim() + "**")
        .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, m) => "*" + m.trim() + "*")
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, m) => m.trim() + "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();
}

async function runMistralOCR(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY not set");

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, fileName);
    formData.append("purpose", "ocr");

    const uploadRes = await fetch("https://api.mistral.ai/v1/files", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey },
        body: formData,
    });
    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error("Mistral file upload HTTP " + uploadRes.status + ": " + err);
    }
    const uploadData = await uploadRes.json() as { id: string };
    const fileId = uploadData.id;

    try {
        const urlRes = await fetch("https://api.mistral.ai/v1/files/" + fileId + "/url", {
            headers: { "Authorization": "Bearer " + apiKey },
        });
        if (!urlRes.ok) {
            const err = await urlRes.text();
            throw new Error("Mistral signed URL HTTP " + urlRes.status + ": " + err);
        }
        const urlData = await urlRes.json() as { url: string };
        const signedUrl = urlData.url;

        const ocrRes = await fetch("https://api.mistral.ai/v1/ocr", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey,
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
            throw new Error("Mistral OCR HTTP " + ocrRes.status + ": " + err);
        }
        const ocrData = await ocrRes.json() as { pages?: { markdown?: string }[] };
        return (ocrData.pages ?? []).map((p) => p.markdown ?? "").join("\n\n").trim();

    } finally {
        fetch("https://api.mistral.ai/v1/files/" + fileId, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + apiKey },
        }).catch(() => {});
    }
}

export async function extractText(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    cloudinaryUrl?: string
): Promise<ExtractionResult> {

    // PDF
    if (mimeType === "application/pdf") {
        try {
            const ocrText = await runMistralOCR(buffer, mimeType, fileName);
            const patched = patchBoldCapsHeadings(ocrText);
            const wordCount = countWords(patched);
            return { text: patched, method: "mistral-ocr", wordCount, pageCount: 1, isScanned: wordCount < 50 };
        } catch (err) {
            console.error("[extractor] Mistral OCR failed for PDF:", err);
        }
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    // DOCX
    if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.endsWith(".docx")
    ) {
        try {
            const { value: html } = await mammoth.convertToHtml(
                { buffer },
                {
                    styleMap: [
                        "p[style-name='Heading 1'] => h1:fresh",
                        "p[style-name='Heading 2'] => h2:fresh",
                        "p[style-name='Heading 3'] => h3:fresh",
                        "p[style-name='Heading 4'] => h4:fresh",
                        "p[style-name='Title'] => h1:fresh",
                        "p[style-name='Subtitle'] => h2:fresh",
                    ]
                }
            );
            const markdown = patchBoldCapsHeadings(htmlToMarkdown(html ?? ""));
            if (countWords(markdown) >= 10) {
                return { text: markdown, method: "mammoth", wordCount: countWords(markdown), isScanned: false };
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

    // Plain text
    if (mimeType === "text/plain" || fileName.endsWith(".txt")) {
        const text = buffer.toString("utf-8").trim();
        return { text, method: "plain-text", wordCount: countWords(text), isScanned: false };
    }

    // Images
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
            const patched = patchBoldCapsHeadings(ocrText);
            return { text: patched, method: "mistral-ocr", wordCount: countWords(patched), isScanned: true };
        } catch (err) {
            console.error("[extractor] Mistral OCR failed for image:", err);
        }
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
    }

    return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true };
}
