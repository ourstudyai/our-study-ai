// Admin Flags API — Resolve flags with golden corrections
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { flagId, adminNote, goldenCorrection, adminPassword } = body;

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

      return NextResponse.json({ error: "Missing flagId or adminNote" }, { status: 400 });
    }

    const resolvedAt = new Date().toISOString();

    await adminDb.collection("flags").doc(flagId).update({
      status: "resolved",
      adminNote,
      ...(goldenCorrection ? { goldenCorrection } : {}),
      resolvedAt,
    });

    return NextResponse.json({ success: true, flagId, status: "resolved", resolvedAt });
  } catch (error: any) {
    console.error("Admin flags error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
