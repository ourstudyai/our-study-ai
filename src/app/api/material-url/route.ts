import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(req: NextRequest) {
  const materialId = req.nextUrl.searchParams.get("materialId");
  const fileUrl = req.nextUrl.searchParams.get("fileUrl");

  // If fileUrl passed directly just return it
  if (fileUrl) return NextResponse.json({ url: fileUrl });

  if (!materialId) return NextResponse.json({ error: "Missing materialId or fileUrl" }, { status: 400 });

  try {
    const snap = await adminDb.collection("materials").doc(materialId).get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ url: snap.data()!.fileUrl });
  } catch (err) {
    console.error("[material-url]", err);
    return NextResponse.json({ error: "Failed to get URL" }, { status: 500 });
  }
}
