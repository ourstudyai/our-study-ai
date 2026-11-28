// src/lib/processing/arrangedText.ts
// Joins the cleaned chunks of a material (materials/{id}/arranged/*) into one text.
// Returns null unless the cleaning pass is finished and every chunk is there; callers then use the raw text.
import { adminDb } from "@/lib/firebase/admin";
import { assembleArranged } from "@/lib/processing/arranger";

export async function getArrangedText(materialId: string): Promise<string | null> {
  const ref = adminDb.collection("materials").doc(materialId);
  const m = (await ref.get()).data() as any;
  if (!m || m.arrangeStatus !== "done") return null;
  const total = Number(m.arrangeChunks?.total ?? 0);
  if (!total) return null;
  const snap = await ref.collection("arranged").get();
  if (snap.size < total) return null;
  const chunks = snap.docs.map((d) => {
    const x = d.data() as any;
    return { index: Number(x.index), text: String(x.text ?? "") };
  });
  const text = assembleArranged(chunks);
  return text.trim() ? text : null;
}
