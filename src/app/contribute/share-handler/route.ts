import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files');
    
    // Build redirect URL with file count as hint
    const url = new URL('/contribute', req.url);
    url.searchParams.set('shared', '1');
    url.searchParams.set('count', String(files.length));
    
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.redirect(new URL('/contribute?shared=1', req.url), 303);
  }
}
