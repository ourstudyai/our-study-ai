export const dynamic = "force-dynamic";

// src/app/api/material-status/[materialId]/route.ts
// Polling endpoint — client calls this every 3s to check if processing is done

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { getMaterial } from "@/lib/firestore/materials";

export async function GET(
    _req: NextRequest,
    { params }: { params: { materialId: string } }
) {
    const session = cookies().get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { await adminAuth.verifySessionCookie(session, true); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

    try {
        const material = await getMaterial(params.materialId);
        if (!material) {
            return NextResponse.json({ error: "Material not found." }, { status: 404 });
        }
        return NextResponse.json({
            materialId: params.materialId,
            status: material.status,
            wordCount: material.wordCount,
            extractionMethod: material.extractionMethod,
            category: material.category,
            suggestedCourseName: material.suggestedCourseName,
            detectedCourseName: material.detectedCourseName,
            confidence: material.confidence,
        });
    } catch {
        return NextResponse.json({ error: "Failed to fetch status." }, { status: 500 });
    }
}