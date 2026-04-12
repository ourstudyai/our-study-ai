// src/lib/firestore/materials.ts
// Firestore read/write operations for the materials and material_chunks collections

import { db } from "@/lib/firebase/config";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    query,
    where,
    getDocs,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { MaterialCategory } from "@/lib/processing/classifier";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialStatus =
    | "pending_review"   // auto-classified + course matched, awaiting admin confirmation
    | "quarantined"      // classifier found nothing useful — no course signal, no name hint
    | "awaiting_course"  // classifier detected a course name but it doesn't exist in Firestore yet
    | "ocr_pending"      // scanned file, waiting for Google Cloud OCR
    | "approved"         // admin confirmed, live in RAG
    | "rejected";        // admin rejected

export type Material = {
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    uploadedBy: string;
    uploadedByRole: string;
    extractedText: string;
    wordCount: number;
    pageCount?: number;
    isScanned: boolean;
    extractionMethod: string;
    category: MaterialCategory;
    suggestedCourseId: string | null;
    suggestedCourseName: string | null;
    detectedCourseName: string | null;   // ghost name — may not exist in Firestore yet
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

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIALS_COL = "materials";
const CHUNKS_COL = "material_chunks";
const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;

// ─── Save Material ────────────────────────────────────────────────────────────

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

// ─── Update Material Status ───────────────────────────────────────────────────

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

// ─── Get Materials by Status ──────────────────────────────────────────────────

export async function getMaterialsByStatus(
    status: MaterialStatus
): Promise<Material[]> {
    const q = query(
        collection(db, MATERIALS_COL),
        where("status", "==", status),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Material));
}

// ─── Get Single Material ──────────────────────────────────────────────────────

export async function getMaterial(materialId: string): Promise<Material | null> {
    const ref = doc(db, MATERIALS_COL, materialId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Material;
}

// ─── Save Chunks (RAG) ────────────────────────────────────────────────────────

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

// ─── Resurrect Materials for a Course ────────────────────────────────────────
// Called when a new course is created (Phase 3 course creation flow).
// Finds all awaiting_course materials whose detectedCourseName fuzzy-matches
// the new course name, then chunks and approves them automatically.
//
// GOOGLE_CLOUD_OCR_SLOT: When OCR is enabled, also call this after OCR completes
// on a material that was ocr_pending — re-classify first, then resurrect if needed.

export async function resurrectMaterialsForCourse(
    courseId: string,
    courseName: string
): Promise<{ resurrected: number; failed: number }> {
    const lowerCourseName = courseName.toLowerCase();

    // Fetch all awaiting_course materials
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

        // Fuzzy match: check if detected/suggested name shares significant words with new course
        const courseWords = lowerCourseName.split(/\s+/).filter((w) => w.length > 3);
        const detectedWords = detected.split(/\s+/).filter((w) => w.length > 3);
        const suggestedWords = suggested.split(/\s+/).filter((w) => w.length > 3);

        const allCandidateWords = [...new Set([...detectedWords, ...suggestedWords])];
        const matchCount = courseWords.filter((w) => allCandidateWords.includes(w)).length;
        const matchRatio = courseWords.length > 0 ? matchCount / courseWords.length : 0;

        // Resurrect if at least 50% of course name words match
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

// ─── Query Chunks for RAG ─────────────────────────────────────────────────────

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
    const chunks = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as MaterialChunk)
    );
    return chunks.slice(0, limitCount);
}

// ─── Delete Chunks for a Material ────────────────────────────────────────────

export async function deleteChunksByMaterial(
    materialId: string
): Promise<void> {
    const q = query(
        collection(db, CHUNKS_COL),
        where("materialId", "==", materialId)
    );
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
        await updateDoc(doc(db, CHUNKS_COL, d.id), { deleted: true });
    }
}