export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite-preview-06-17' });

  try {
    const session = cookies().get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let _d: any;
    try { _d = await adminAuth.verifyIdToken(session); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const _u = await adminDb.collection('users').doc(_d.uid).get();
    const _r = _u.data()?.role;
    if (!(_r === 'admin' || _r === 'chief_admin' || _d.email === 'ourstudyai@gmail.com')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { materialId, action = 'add' } = await req.json();
    if (!materialId) return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });

    const matRef = adminDb.collection('materials').doc(materialId);
    const matSnap = await matRef.get();
    if (!matSnap.exists) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    const mat = matSnap.data()!;

    if (action === 'remove') {
      await matRef.update({ indexed: false });
      return NextResponse.json({ success: true });
    }

    const extractedText: string = mat.extractedText || '';
    if (!extractedText) return NextResponse.json({ error: 'No extracted text' }, { status: 400 });

    // Get content list
    const contentRes = await model.generateContent(
      `You are indexing a study material for a seminary library. Given the following extracted text, return a JSON object with one field: 'contentList' — an array of all major topics, chapters, or sections that appear in this material. Do not set a minimum or maximum number. Include every significant topic. If the material has 3 major topics return 3, if it has 20 return 20. Return only the JSON object, no markdown, no preamble.\n\n${extractedText.slice(0, 6000)}`
    );

    const contentRaw = contentRes.response.text() || '{}';
    let contentList: string[] = [];
    try {
      const parsed = JSON.parse(contentRaw.replace(/```json|```/g, '').trim());
      contentList = parsed.contentList || [];
    } catch { contentList = []; }

    // Get AI summary
    const summaryRes = await model.generateContent(
      `Summarise this study material in 2-3 sentences for a seminary library index. Return only the summary, no preamble.\n\n${extractedText.slice(0, 3000)}`
    );

    const aiSummary = summaryRes.response.text()?.trim() || '';
    const indexDisplayName = mat.suggestedCourseName
      ? `${mat.suggestedCourseName} — ${mat.category?.replace('_', ' ')}`
      : mat.fileName;

    await matRef.update({
      indexed: true,
      contentList,
      aiSummary,
      indexDisplayName,
      indexedAt: new Date().toISOString(),
      indexedBy: 'admin',
    });

    return NextResponse.json({ success: true, contentList, aiSummary });
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error('index-material error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}