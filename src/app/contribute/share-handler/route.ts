import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    
    // We cannot pass files through a redirect.
    // launchQueue handles this natively on Chrome Android.
    // For fallback: redirect to contribute with count hint only.
    const url = new URL('/contribute', req.url);
    url.searchParams.set('shared', '1');
    url.searchParams.set('count', String(files.length));
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.redirect(new URL('/contribute?shared=1&count=1', req.url), 303);
  }
}
