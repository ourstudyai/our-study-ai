import { NextRequest, NextResponse } from 'next/server';

// DO NOT call req.formData() here — reading file bytes through Vercel
// hits the 4.5MB serverless payload limit and throws 413.
//
// Chrome queues shared files in launchQueue before this redirect fires.
// ShareReceiver on the contribute page reads them from launchQueue directly.
// Files never pass through Vercel — they go straight into the browser queue.
export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL('/contribute?share_incoming=1', req.url), 303);
}
