import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, userEmail, courseId, courseName, mode, messageId, type, note, aiResponse } = body;

    if (!userId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await adminDb.collection("feedback").add({
      userId,
      userEmail: userEmail || "",
      courseId: courseId || "",
      courseName: courseName || "",
      mode: mode || "",
      messageId: messageId || "",
      type,
      note: note || "",
      aiResponse: aiResponse || "",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Feedback API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
