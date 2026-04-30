export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

async function uploadToR2(buffer: Buffer, fileName: string, mimeType: string): Promise<{ url: string; key: string }> {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `timetables/${Date.now()}_${sanitized}`;
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));
  return { url: `${R2_PUBLIC_URL}/${key}`, key };
}

async function extractDatesFromText(text: string): Promise<any[]> {
  const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4})/gi;
  const timePattern = /(\d{1,2}:\d{2}\s*(?:am|pm)?)/gi;
  const lines = text.split("\n").filter((l) => l.trim());
  const examDates: any[] = [];
  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    const timeMatch = line.match(timePattern);
    if (dateMatch) {
      examDates.push({
        courseName: line.replace(datePattern, "").replace(timePattern, "").trim().substring(0, 80),
        date: dateMatch[0],
        startTime: timeMatch?.[0] ?? null,
        endTime: timeMatch?.[1] ?? null,
        venue: null,
      });
    }
  }
  return examDates;
}

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifySessionCookie(session, true);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const department = formData.get("department") as string;
    const type = (formData.get("type") as string) || "regular";

    if (!file || !department) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, key } = await uploadToR2(buffer, file.name, file.type);

    let extractedText = "";
    let examDates: any[] = [];
    try {
      const { extractText } = await import("@/lib/processing/extractor");
      const result = await extractText(buffer, file.type, file.name);
      extractedText = result.text;
      examDates = await extractDatesFromText(extractedText);
    } catch (err) {
      console.warn("[upload-timetable] OCR failed:", err);
    }

    const existing = await adminDb.collection("timetables")
      .where("department", "==", department)
      .where("type", "==", type)
      .limit(1)
      .get();

    const data = {
      department,
      type,
      fileUrl: url,
      publicId: key,
      extractedText,
      examDates,
      uploadedBy: decoded.uid,
      uploadedAt: new Date().toISOString(),
    };

    if (!existing.empty) {
      await adminDb.collection("timetables").doc(existing.docs[0].id).update(data);
    } else {
      await adminDb.collection("timetables").add(data);
    }

    return NextResponse.json({ success: true, examDates });
  } catch (err) {
    console.error("[upload-timetable] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
