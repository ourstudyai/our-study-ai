export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

async function uploadToCloudinary(buffer: Buffer, fileName: string): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const publicId = `timetables/${Date.now()}_${sanitized}`;
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'auto', overwrite: false },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        const signedUrl = cloudinary.url(result.public_id, {
          resource_type: 'auto',
          type: 'upload',
          sign_url: true,
          expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
        });
        resolve({ url: signedUrl, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

async function extractDatesFromText(text: string, department: string): Promise<any[]> {
  // Simple extraction — look for date patterns and course names
  const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4})/gi;
  const timePattern = /(\d{1,2}:\d{2}\s*(?:am|pm)?)/gi;
  const lines = text.split('\n').filter(l => l.trim());
  const examDates: any[] = [];

  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    const timeMatch = line.match(timePattern);
    if (dateMatch) {
      examDates.push({
        courseName: line.replace(datePattern, '').replace(timePattern, '').trim().substring(0, 80),
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
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  });

  try {
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await adminAuth.verifySessionCookie(session, true);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const department = formData.get('department') as string;
    const type = (formData.get('type') as string) || 'regular';

    if (!file || !department) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, publicId } = await uploadToCloudinary(buffer, file.name);

    // OCR via Mistral
    let extractedText = '';
    let examDates: any[] = [];
    try {
      const { extractText } = await import('@/lib/processing/extractor');
      const result = await extractText(buffer, file.type, file.name);
      extractedText = result.text;
      examDates = await extractDatesFromText(extractedText, department);
    } catch (err) {
      console.warn('[upload-timetable] OCR failed:', err);
    }

    // Save to Firestore — upsert by dept+type
    const existing = await adminDb.collection('timetables')
      .where('department', '==', department)
      .where('type', '==', type)
      .limit(1)
      .get();

    const data = {
      department,
      type,
      fileUrl: url,
      publicId,
      extractedText,
      examDates,
      uploadedBy: decoded.uid,
      uploadedAt: new Date().toISOString(),
    };

    if (!existing.empty) {
      await adminDb.collection('timetables').doc(existing.docs[0].id).update(data);
    } else {
      await adminDb.collection('timetables').add(data);
    }

    return NextResponse.json({ success: true, examDates });
  } catch (err) {
    console.error('[upload-timetable] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
