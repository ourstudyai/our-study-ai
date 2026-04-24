export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  try {
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
    const contentRes = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{
        role: 'user',
        content: `You are indexing a study material for a seminary library. Given the following extracted text, return a JSON object with one field: 'contentList' — an array of all major topics, chapters, or sections that appear in this material. Do not set a minimum or maximum number. Include every significant topic. If the material has 3 major topics return 3, if it has 20 return 20. Return only the JSON object, no markdown, no preamble.\n\n${extractedText.slice(0, 6000)}`,
      }],
    });

    const contentRaw = contentRes.choices[0].message.content || '{}';
    let contentList: string[] = [];
    try {
      const parsed = JSON.parse(contentRaw.replace(/```json|```/g, '').trim());
      contentList = parsed.contentList || [];
    } catch { contentList = []; }

    // Get AI summary
    const summaryRes = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{
        role: 'user',
        content: `Summarise this study material in 2-3 sentences for a seminary library index. Return only the summary, no preamble.\n\n${extractedText.slice(0, 3000)}`,
      }],
    });

    const aiSummary = summaryRes.choices[0].message.content?.trim() || '';
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
  } catch (err) {
    console.error('index-material error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
