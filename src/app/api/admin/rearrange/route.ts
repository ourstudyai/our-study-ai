export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { queueArrangeStart } from "@/lib/arrangeQueue";

const MAX_IDS = 20;

// Admin: restart the text cleaning for files where it failed or got stuck. The raw text is never touched;
// the start job clears the old cleaned chunks and makes a fresh plan.
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { materialIds } = await req.json();
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return NextResponse.json({ error: "No materialIds." }, { status: 400 });
    }
    let queued = 0;
    const ids = materialIds.slice(0, MAX_IDS).map((x: unknown) => String(x));
    for (let i = 0; i < ids.length; i++) {
      const ref = adminDb.collection("materials").doc(ids[i]);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const now = new Date().toISOString();
      // Reset first: the start job skips files that are "running" or "done".
      await ref.update({ arrangeStatus: "queued", arrangeError: null, updatedAt: now });
      if (await queueArrangeStart(ids[i])) queued++;
      else await ref.update({ arrangeStatus: "failed", arrangeError: "Could not queue the cleaning.", updatedAt: new Date().toISOString() }).catch(() => {});
    }
    return NextResponse.json({ success: true, queued });
  } catch (err) {
    console.error("[rearrange]", err);
    return NextResponse.json({ error: "Could not restart the cleaning." }, { status: 500 });
  }
}
