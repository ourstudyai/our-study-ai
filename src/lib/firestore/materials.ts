// src/lib/firestore/materials.ts
// Firestore read/write operations for the materials and material_chunks collections
// materials — one doc per uploaded file (extracted text + metadata)
// material_chunks — one doc per RAG chunk (queried by courseId during chat)

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
    | "pending_review"   // auto-classified, waiting admin confirmation
    | "quarantined"      // classifier couldn't determine course, needs manual assign
    | "ocr_pending"      // scanned file, waiting for Google Cloud OCR
    | "approved"         // admin confirmed, live in RAG
    | "rejected";        // admin rejected

export type Material = {
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    uploadedBy: string;        // user uid
    uploadedByRole: string;    // "admin" | "class_rep" etc
    extractedText: string;
    wordCount: number;
    pageCount?: number;
    isScanned: boolean;
    extractionMethod: string;
    category: MaterialCategory;
    suggestedCourseId: string | null;
    suggestedCourseName: string | null;
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
const CHUNK_SIZE = 400;        // words per chunk
const CHUNK_OVERLAP = 50;      // words of overlap between chunks

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
// Called after admin approves a material
// Splits extracted text into overlapping chunks and saves to material_chunks

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

    // Write all chunks to Firestore
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

// ─── Query Chunks for RAG ─────────────────────────────────────────────────────
// Called by /api/chat to fetch relevant chunks for a courseId

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

    // Return most recent chunks up to limit
    return chunks.slice(0, limitCount);
}

// ─── Delete Chunks for a Material ────────────────────────────────────────────
// Called when admin rejects an already-approved material

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