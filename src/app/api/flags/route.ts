export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail, courseId, courseName, mode, question, aiResponse, studentDescription } = body;
    if (!userId || !courseId || !studentDescription) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const flag = {
      userId, userEmail: userEmail || '', courseId,
      courseName: courseName || '', mode: mode || 'plain_explainer',
      question: (question || '').substring(0, 500),
      aiResponse: (aiResponse || '').substring(0, 500),
      studentDescription, status: 'open',
      createdAt: new Date().toISOString(),
    };
    const ref = await adminDb.collection('flags').add(flag);
    return NextResponse.json({ success: true, flag: { id: ref.id, ...flag } });
  } catch (error: any) {
    console.error('Flags API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ flags: [] });
}
