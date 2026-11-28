export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { queueMaterialRead } from "@/lib/readQueue";

const MAX_IDS = 50;

// Admin: queue the AI reading pass for files that have extracted text but were not read yet.
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
      if (snap.data()!.status !== "pending_review") continue;
      if (await queueMaterialRead(ids[i])) {
        await ref.update({ readStatus: "queued", updatedAt: new Date().toISOString() }).catch(() => {});
        queued++;
      }
    }
    return NextResponse.json({ success: true, queued });
  } catch (err) {
    console.error("[read-now]", err);
    return NextResponse.json({ error: "Could not queue reading." }, { status: 500 });
  }
}
