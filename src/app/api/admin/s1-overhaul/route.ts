export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { buildPlan, renderPlan, Ex } from '@/lib/overhaul/s1';

const text = (s: string, status = 200) => new NextResponse(s, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

async function guard(needChief: boolean): Promise<string | null> {
  const session = cookies().get('session')?.value;
  if (!session) return 'Unauthorized';
  let decoded: any;
  try { decoded = await adminAuth.verifyIdToken(session); } catch { return 'Unauthorized'; }
  const role = (await adminDb.collection('users').doc(decoded.uid).get()).data()?.role;
  const chief = role === 'chief_admin' || decoded.email === 'ourstudyai@gmail.com';
  const admin = chief || role === 'admin';
  if (needChief ? !chief : !admin) return 'Forbidden';
  return null;
}

async function loadCourses(): Promise<Ex[]> {
  const snap = await adminDb.collection('courses').get();
  return snap.docs.map(d => {
    const x = d.data() as any;
    return { id: d.id, code: String(x.code ?? ''), name: String(x.name ?? ''), department: String(x.department ?? ''), year: Number(x.year), semester: Number(x.semester), published: x.published, s1OverhaulAt: x.s1OverhaulAt };
  });
}

async function fileCounts(ids: string[]) {
  const out: Record<string, { p: number; s: number }> = {};
  for (let i = 0; i < ids.length; i += 15) {
    await Promise.all(ids.slice(i, i + 15).map(async id => {
      const [a, b] = await Promise.all([
        adminDb.collection('materials').where('confirmedCourseId', '==', id).get(),
        adminDb.collection('materials').where('sharedCourseIds', 'array-contains', id).get(),
      ]);
      out[id] = { p: a.size, s: b.size };
    }));
  }
  return out;
}

export async function GET() {
  const bad = await guard(false);
  if (bad) return text(bad, bad === 'Forbidden' ? 403 : 401);
  const plan = buildPlan(await loadCourses());
  const ids = plan.groups.flatMap(g => g.ops.filter(o => 'id' in o).map(o => (o as any).id as string));
  return text(renderPlan(plan, await fileCounts(ids)));
}

export async function POST(req: NextRequest) {
  const bad = await guard(true);
  if (bad) return text(bad, bad === 'Forbidden' ? 403 : 401);
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== 'APPLY S1 OVERHAUL') return text('Missing confirmation.', 400);
  const plan = buildPlan(await loadCourses());
  if (plan.problems.length) return text('BLOCKED. Nothing was changed.\n\n' + renderPlan(plan, {}), 409);

  const stamp = new Date().toISOString();
  const batch = adminDb.batch();
  let n = 0;
  for (const g of plan.groups) for (const o of g.ops) {
    if (o.kind === 'RECODE') {
      batch.update(adminDb.collection('courses').doc(o.id), { code: o.toCode, name: o.toName, s1OverhaulAt: stamp, s1OverhaulPrev: { code: o.fromCode, name: o.fromName } });
      n++;
    } else if (o.kind === 'ARCHIVE') {
      batch.update(adminDb.collection('courses').doc(o.id), { published: false, ...(o.newCode ? { code: o.newCode } : {}), s1OverhaulAt: stamp, s1OverhaulPrev: { code: o.code, name: o.name }, archivedReason: 'S1 overhaul 2026/27' });
      n++;
    } else if (o.kind === 'NEW') {
      batch.set(adminDb.collection('courses').doc(), { name: o.name, code: o.code, department: o.department, year: o.year, semester: 1, description: '', published: true, createdAt: stamp, s1OverhaulAt: stamp });
      n++;
    }
  }
  await batch.commit();
  return text('APPLIED ' + n + ' changes.\n\n' + renderPlan(plan, {}));
}
