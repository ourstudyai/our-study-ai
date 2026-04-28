// src/lib/firestore/materials.ts
import { db } from "@/lib/firebase/config";
import {
    collection, doc, setDoc, getDoc, updateDoc,
    query, where, getDocs, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { MaterialCategory } from "@/lib/processing/classifier";

export type MaterialStatus =
    | "processing"
    | "pending_review"
    | "quarantined"
    | "awaiting_course"
    | "ocr_pending"
    | "approved"
    | "rejected"
    | "approved_hidden";

export type Material = {
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    uploadedBy: string;
    uploadedByRole: string;
    uploaderEmail: string;
    extractedText: string;
    wordCount: number;
    pageCount?: number;
    isScanned: boolean;
    extractionMethod: string;
    category: MaterialCategory;
    suggestedCourseId: string | null;
    suggestedCourseName: string | null;
    detectedCourseName: string | null;
    confirmedCourseId: string | null;
    confirmedCourseName: string | null;
    confidence: "high" | "medium" | "low";
    classifierReason: string;
    status: MaterialStatus;
    createdAt: Timestamp | null;
    updatedAt: Timestamp | null;
};

export type MaterialChunk = {
    id: string;
    materialId: string;
    courseId: string;
    category: MaterialCategory;
    chunkIndex: number;
    text: string;
    wordCount: number;
    createdAt: Timestamp | null;
};

export type UploadReport = {
    id: string;
    uploaderEmail: string;
    uploadedBy: string;
    fileName: string;
    errorType: "upload_failed" | "processing_failed" | "partial_batch";
    description: string;
    timestamp: Timestamp | null;
    read: boolean;
};

export type MaterialStats = {
    total: number;
    byYear: Record<string, { total: number; contributors: number; admins: number; byMonth: Record<string, { total: number; contributors: number; admins: number }> }>;
};

const MATERIALS_COL = "materials";
const CHUNKS_COL = "material_chunks";
const REPORTS_COL = "upload_reports";
const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;

export async function saveMaterial(
    data: Omit<Material, "id" | "createdAt" | "updatedAt">
): Promise<string> {
    const ref = doc(collection(db, MATERIALS_COL));
    await setDoc(ref, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

export async function updateMaterialStatus(
    materialId: string,
    status: MaterialStatus,
    confirmedCourseId?: string,
    confirmedCourseName?: string
): Promise<void> {
    const ref = doc(db, MATERIALS_COL, materialId);
    await updateDoc(ref, {
        status,
        ...(confirmedCourseId ? { confirmedCourseId } : {}),
        ...(confirmedCourseName ? { confirmedCourseName } : {}),
        updatedAt: serverTimestamp(),
    });
}

export async function getMaterialsByStatus(
    status: MaterialStatus
): Promise<Material[]> {
    const q = query(
        collection(db, MATERIALS_COL),
        where("status", "==", status)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Material))
        .sort((a, b) => {
            const aTime = a.createdAt?.toMillis() ?? 0;
            const bTime = b.createdAt?.toMillis() ?? 0;
            return bTime - aTime;
        });
}

export async function getMaterial(materialId: string): Promise<Material | null> {
    const ref = doc(db, MATERIALS_COL, materialId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Material;
}

export async function updateMaterial(
    materialId: string,
    data: Partial<Omit<Material, "id" | "createdAt">>
): Promise<void> {
    const ref = doc(db, MATERIALS_COL, materialId);
    await updateDoc(ref, {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

export async function saveChunks(
    materialId: string,
    courseId: string,
    category: MaterialCategory,
    text: string
): Promise<number> {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + CHUNK_SIZE, words.length);
        chunks.push(words.slice(start, end).join(" "));
        start += CHUNK_SIZE - CHUNK_OVERLAP;
        if (start >= words.length) break;
    }
    for (let i = 0; i < chunks.length; i++) {
        const ref = doc(collection(db, CHUNKS_COL));
        await setDoc(ref, {
            materialId,
            courseId,
            category,
            chunkIndex: i,
            text: chunks[i],
            wordCount: chunks[i].split(/\s+/).filter(Boolean).length,
            createdAt: serverTimestamp(),
        });
    }
    return chunks.length;
}

export async function resurrectMaterialsForCourse(
    courseId: string,
    courseName: string
): Promise<{ resurrected: number; failed: number }> {
    const lowerCourseName = courseName.toLowerCase();
    const q = query(
        collection(db, MATERIALS_COL),
        where("status", "==", "awaiting_course")
    );
    const snapshot = await getDocs(q);
    const candidates = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Material));

    let resurrected = 0;
    let failed = 0;

    for (const material of candidates) {
        const detected = (material.detectedCourseName ?? "").toLowerCase();
        const suggested = (material.suggestedCourseName ?? "").toLowerCase();
        const courseWords = lowerCourseName.split(/\s+/).filter((w) => w.length > 3);
        const detectedWords = detected.split(/\s+/).filter((w) => w.length > 3);
        const suggestedWords = suggested.split(/\s+/).filter((w) => w.length > 3);
        const allCandidateWords = Array.from(new Set([...detectedWords, ...suggestedWords]));
        const matchCount = courseWords.filter((w) => allCandidateWords.includes(w)).length;
        const matchRatio = courseWords.length > 0 ? matchCount / courseWords.length : 0;

        if (matchRatio >= 0.5) {
            try {
                await saveChunks(material.id, courseId, material.category, material.extractedText);
                await updateMaterialStatus(material.id, "approved", courseId, courseName);
                resurrected++;
            } catch (err) {
                console.error(`[resurrect] Failed for material ${material.id}:`, err);
                failed++;
            }
        }
    }
    return { resurrected, failed };
}

export async function getChunksByCourse(
    courseId: string,
    limitCount: number = 6
): Promise<MaterialChunk[]> {
    const q = query(
        collection(db, CHUNKS_COL),
        where("courseId", "==", courseId),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as MaterialChunk))
        .slice(0, limitCount);
}

export async function deleteChunksByMaterial(materialId: string): Promise<void> {
    const q = query(
        collection(db, CHUNKS_COL),
        where("materialId", "==", materialId)
    );
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
        await updateDoc(doc(db, CHUNKS_COL, d.id), { deleted: true });
    }
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function saveReport(
    data: Omit<UploadReport, "id" | "timestamp" | "read">
): Promise<string> {
    const ref = doc(collection(db, REPORTS_COL));
    await setDoc(ref, {
        ...data,
        read: false,
        timestamp: serverTimestamp(),
    });
    return ref.id;
}

export async function getReports(): Promise<UploadReport[]> {
    const q = query(
        collection(db, REPORTS_COL),
        orderBy("timestamp", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UploadReport));
}

export async function markReportRead(reportId: string): Promise<void> {
    await updateDoc(doc(db, REPORTS_COL, reportId), { read: true });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getMaterialStats(): Promise<MaterialStats> {
    const q = query(
        collection(db, MATERIALS_COL),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    const materials = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Material));

    const stats: MaterialStats = { total: materials.length, byYear: {} };

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (const m of materials) {
        if (!m.createdAt) continue;
        const date = m.createdAt.toDate();
        const year = date.getFullYear().toString();
        const month = MONTHS[date.getMonth()];
        const isAdmin = m.uploadedByRole === "admin" || m.uploadedByRole === "chief_admin";

        if (!stats.byYear[year]) {
            stats.byYear[year] = { total: 0, contributors: 0, admins: 0, byMonth: {} };
        }
        stats.byYear[year].total++;
        if (isAdmin) stats.byYear[year].admins++;
        else stats.byYear[year].contributors++;

        if (!stats.byYear[year].byMonth[month]) {
            stats.byYear[year].byMonth[month] = { total: 0, contributors: 0, admins: 0 };
        }
        stats.byYear[year].byMonth[month].total++;
        if (isAdmin) stats.byYear[year].byMonth[month].admins++;
        else stats.byYear[year].byMonth[month].contributors++;
    }

    return stats;
}