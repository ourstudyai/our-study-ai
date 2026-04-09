// Admin Flags API — Resolve flags with golden corrections
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { flagId, adminNote, goldenCorrection, adminPassword } = body;

    // Verify admin access
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!flagId || !adminNote) {
      return NextResponse.json({ error: 'Missing flagId or adminNote' }, { status: 400 });
    }

    // In production, update Firestore
    return NextResponse.json({
      success: true,
      flagId,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Admin flags error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
