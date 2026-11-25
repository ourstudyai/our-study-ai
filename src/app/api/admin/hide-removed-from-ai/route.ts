export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { adminDb } from "@/lib/firebase/admin";
import { setMaterialVisible } from "@/lib/qdrant/visibility";

// One-time: hides the AI-search pieces of every approved file that is removed from the Library. Reversible (Put back in Library).
export async function POST(req: NextRequest) {
  try {
    const decoded = await getRequestUser(req);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const snap = await adminDb.collection("materials").where("status", "==", "approved").where("indexed", "==", false).select().get();
    let hidden = 0, failed = 0;
    const started = Date.now();
    for (const d of snap.docs) {
      if (Date.now() - started > 45000) { failed += snap.size - hidden - failed; break; }
      (await setMaterialVisible(d.id, false)) ? failed++ : hidden++;
    }
    return NextResponse.json({ hidden, failed });
  } catch (err: any) {
    console.error("[hide-removed-from-ai]", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
