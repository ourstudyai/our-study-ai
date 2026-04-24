export const dynamic = "force-dynamic";

// Flags API Route
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail, courseId, courseName, mode, question, aiResponse, studentDescription } = body;

    if (!userId || !courseId || !studentDescription) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // In production, this writes to Firestore via admin SDK
    // For now, return success with the flag data
    const flag = {
      id: `flag_${Date.now()}`,
      userId,
      userEmail: userEmail || '',
      courseId,
      courseName: courseName || '',
      mode: mode || 'plain_explainer',
      question: (question || '').substring(0, 500),
      aiResponse: (aiResponse || '').substring(0, 500),
      studentDescription,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, flag });
  } catch (error: any) {
    console.error('Flags API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    // In production, fetch from Firestore
    return NextResponse.json({ flags: [] });
  } catch (error: any) {
    console.error('Flags GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
