// src/lib/processing/extractor.ts
// Extracts text from uploaded files — returns markdown where possible.
// PDF → Mistral OCR (markdown output, headings preserved)
// DOCX → mammoth convertToHtml + heading conversion to markdown
// Images → Mistral OCR (markdown output)
// Plain text → raw text

import mammoth from "mammoth";
import JSZip from "jszip";

export type ExtractionResult = {
    text: string;
    method: "pdf-parse" | "mammoth" | "plain-text" | "mistral-ocr" | "pptx" | "ocr_pending";
    pageCount?: number;
    wordCount: number;
    isScanned: boolean;
    error?: string;
};

const errMsg = (e: unknown) => String((e as any)?.message ?? e).slice(0, 400);

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

// ── PowerPoint (.pptx) ───────────────────────────────────────────────────────
// A .pptx is a zip of XML files. We read the text of every slide in presentation order, plus speaker notes.
// Text inside pictures is not read (an image-only deck is reported, so the contributor can send a PDF).
function codePoint(n: number): string {
    try { return String.fromCodePoint(n); } catch { return ""; }
}
function xmlText(s: string): string {
    return s
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => codePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_m, n: string) => codePoint(Number(n)))
        .replace(/&amp;/g, "&");
}

type PptxLine = { text: string; lvl: number };
function pptxParagraphs(xml: string): PptxLine[] {
    const out: PptxLine[] = [];
    const paraRe = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g;
    let pm: RegExpExecArray | null;
    while ((pm = paraRe.exec(xml)) !== null) {
        const inner = pm[1];
        let text = "";
        const tokRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/?>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tokRe.exec(inner)) !== null) text += tm[1] !== undefined ? xmlText(tm[1]) : "\n";
        text = text.replace(/[ \t]+/g, " ").trim();
        if (!text) continue;
        const lvl = Number((inner.match(/<a:pPr[^>]*\blvl="(\d)"/) ?? [])[1] ?? 0);
        out.push({ text, lvl });
    }
    return out;
}

type PptxShape = { title: boolean; body: boolean; skip: boolean; xml: string };
function pptxShapes(xml: string): PptxShape[] {
    const out: PptxShape[] = [];
    const re = /<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>|<p:graphicFrame(?:\s[^>]*)?>[\s\S]*?<\/p:graphicFrame>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const block = m[0];
        out.push({
            title: /<p:ph[^>]*\btype="(?:title|ctrTitle)"/.test(block),
            body: /<p:ph[^>]*\btype="body"/.test(block),
            skip: /<p:ph[^>]*\btype="(?:sldNum|ftr|dt|hdr)"/.test(block),
            xml: block,
        });
    }
    return out;
}

async function extractPptx(buffer: Buffer): Promise<{ text: string; words: number; slides: number }> {
    const zip = await JSZip.loadAsync(buffer);
    const read = async (p: string): Promise<string> => {
        const f = zip.file(p);
        return f ? await f.async("string") : "";
    };
    const slideNum = (p: string) => Number((p.match(/slide(\d+)\.xml$/) ?? [])[1] ?? 0);
    let slides = Object.keys(zip.files)
        .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => slideNum(a) - slideNum(b));

    // Real presentation order (slides can be reordered without being renamed).
    try {
        const pres = await read("ppt/presentation.xml");
        const rels = await read("ppt/_rels/presentation.xml.rels");
        const target = new Map<string, string>();
        const relRe = /<Relationship\b[^>]*>/g;
        let rm: RegExpExecArray | null;
        while ((rm = relRe.exec(rels)) !== null) {
            const id = rm[0].match(/\bId="([^"]+)"/);
            const t = rm[0].match(/\bTarget="([^"]+)"/);
            if (id && t) target.set(id[1], t[1]);
        }
        const ordered: string[] = [];
        const idRe = /<p:sldId\b[^>]*>/g;
        let im: RegExpExecArray | null;
        while ((im = idRe.exec(pres)) !== null) {
            const rid = im[0].match(/\br:id="([^"]+)"/);
            const t = rid ? target.get(rid[1]) : undefined;
            if (!t) continue;
            const path = t.startsWith("/") ? t.slice(1) : "ppt/" + t.replace(/^\.\//, "");
            if (zip.file(path)) ordered.push(path);
        }
        if (ordered.length) slides = ordered;
    } catch { /* keep numeric order */ }

    const parts: string[] = [];
    const plain: string[] = [];
    for (let i = 0; i < slides.length; i++) {
        const xml = await read(slides[i]);
        let title = "";
        const lines: string[] = [];
        for (const s of pptxShapes(xml)) {
            if (s.skip) continue;
            const paras = pptxParagraphs(s.xml);
            if (s.title && !title) { title = paras.map(p => p.text).join(" "); continue; }
            paras.forEach(p => { lines.push("  ".repeat(Math.min(p.lvl, 3)) + "- " + p.text); plain.push(p.text); });
        }
        if (title) plain.push(title);

        const notes: string[] = [];
        const rel = await read(slides[i].replace("ppt/slides/", "ppt/slides/_rels/") + ".rels");
        const nm = rel.match(/Target="[^"]*notesSlides\/(notesSlide\d+\.xml)"/);
        if (nm) {
            const nx = await read("ppt/notesSlides/" + nm[1]);
            pptxShapes(nx).filter(s => s.body).forEach(s => pptxParagraphs(s.xml).forEach(p => notes.push(p.text)));
        }
        if (notes.length) plain.push(notes.join(" "));

        parts.push("## Slide " + (i + 1) + (title ? ": " + title : ""));
        lines.forEach(l => parts.push(l));
        if (notes.length) parts.push("", "Notes: " + notes.join(" "));
        parts.push("");
    }
    return { text: parts.join("\n").trim(), words: countWords(plain.join(" ")), slides: slides.length };
}

export async function extractText(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    cloudinaryUrl?: string
): Promise<ExtractionResult> {

    if (!buffer || buffer.length === 0) {
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: "The file is empty (0 bytes)." };
    }

    // PDF
    if (mimeType === "application/pdf") {
        try {
            const ocrText = await runMistralOCR(buffer, mimeType, fileName);
            const patched = patchBoldCapsHeadings(ocrText);
            const wordCount = countWords(patched);
            return { text: patched, method: "mistral-ocr", wordCount, pageCount: 1, isScanned: wordCount < 50 };
        } catch (err) {
            console.error("[extractor] Mistral OCR failed for PDF:", err);
            return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: errMsg(err) };
        }
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
            return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: errMsg(err) };
        }
    }

    // Plain text
    if (mimeType === "text/plain" || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
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
            return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: errMsg(err) };
        }
    }

    // PowerPoint (.pptx)
    if (
        fileName.toLowerCase().endsWith(".pptx") ||
        mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
        try {
            const r = await extractPptx(buffer);
            if (r.words >= 10) {
                return { text: r.text, method: "pptx", wordCount: r.words, pageCount: r.slides, isScanned: false };
            }
            return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: "This presentation has almost no readable text (the slides are probably pictures). Export it as PDF and upload that instead." };
        } catch (err) {
            console.error("[extractor] PPTX read failed:", err);
            return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: "Could not read this presentation: " + errMsg(err) };
        }
    }

    // Old binary Word / PowerPoint formats cannot be read.
    if (/\.(doc|ppt)$/i.test(fileName) || mimeType === "application/msword" || mimeType === "application/vnd.ms-powerpoint") {
        return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: "Old-format files (.doc / .ppt) cannot be read. Open the file, choose Save As .docx / .pptx (or PDF), and upload that instead." };
    }

    return { text: "", method: "ocr_pending", wordCount: 0, isScanned: true, error: "Unsupported file type: " + (mimeType || fileName) };
}
