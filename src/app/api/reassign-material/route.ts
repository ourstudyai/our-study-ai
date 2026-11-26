import { courseLabel, courseAliases } from "@/lib/courseLabel";
import { getRequestUser, isAdminUser } from "@/lib/auth/requestUser";
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { upsertChunks, deleteChunksByMaterial } from '@/lib/qdrant/upsert';
import { copyChunksToCourse } from '@/lib/qdrant/share';
import { MaterialCategory } from '@/lib/processing/classifier';
import { AUTO_NAME_RE, nameLabel } from '@/lib/categories';

const WORD_CEILING = 1500;

interface SemanticChunk {
  text: string; heading: string; headingLevel: number;
  ancestorHeadings: string[]; fullPath: string; wordCount: number;
}

function stripTOC(markdown: string): string {
  const lines = markdown.split('\n');
  const headingPattern = /^#{1,4}\s+.+/;
  const protectedHeadings = /^#{1,4}\s+(introduction|conclusion|preface|foreword|abstract|bibliography|references|appendix|overview|summary|acknowledgements?)/i;
  const toRemove = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!headingPattern.test(trimmed)) continue;
    if (protectedHeadings.test(trimmed)) continue;
    let hasBody = false;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next === '') continue;
      if (headingPattern.test(next)) break;
      hasBody = true; break;
    }
    if (!hasBody) toRemove.add(i);
  }
  if (toRemove.size === 0) return markdown;
  return lines.filter((_, idx) => !toRemove.has(idx)).join('\n');
}

function semanticChunk(markdown: string): SemanticChunk[] {
  const lines = markdown.split('\n');
  const chunks: SemanticChunk[] = [];
  const headingStack: { level: number; heading: string }[] = [];
  let bodyLines: string[] = [];

  function flushSection() {
    const body = bodyLines.join('\n').trim(); bodyLines = [];
    if (!body && headingStack.length === 0) return;
    const currentHeading = headingStack.length > 0 ? headingStack[headingStack.length - 1].heading : '';
    const currentLevel = headingStack.length > 0 ? headingStack[headingStack.length - 1].level : 0;
    const ancestors = headingStack.slice(0, -1).map(h => h.heading);
    const fullPath = headingStack.map(h => h.heading).join(' > ');
    if (!body && !currentHeading) return;
    const fullText = currentHeading ? `${'#'.repeat(currentLevel)} ${currentHeading}\n\n${body}` : body;
    const words = fullText.split(/\s+/).filter(Boolean);
    if (words.length <= WORD_CEILING) {
      chunks.push({ text: fullText.trim(), heading: currentHeading, headingLevel: currentLevel, ancestorHeadings: ancestors, fullPath, wordCount: words.length });
    } else {
      const paragraphs = fullText.split(/\n\n+/);
      let buffer: string[] = [], bufferWords = 0, splitIndex = 0;
      for (const para of paragraphs) {
        const paraWords = para.split(/\s+/).filter(Boolean).length;
        if (bufferWords + paraWords > WORD_CEILING && buffer.length > 0) {
          chunks.push({ text: buffer.join('\n\n').trim(), heading: currentHeading, headingLevel: currentLevel, ancestorHeadings: ancestors, fullPath: fullPath + (splitIndex > 0 ? ` (part ${splitIndex + 1})` : ''), wordCount: bufferWords });
          buffer = []; bufferWords = 0; splitIndex++;
        }
        buffer.push(para); bufferWords += paraWords;
      }
      if (buffer.length > 0) chunks.push({ text: buffer.join('\n\n').trim(), heading: currentHeading, headingLevel: currentLevel, ancestorHeadings: ancestors, fullPath: fullPath + (splitIndex > 0 ? ` (part ${splitIndex + 1})` : ''), wordCount: bufferWords });
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      const level = headingMatch[1].length, heading = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      headingStack.push({ level, heading });
    } else { bodyLines.push(line); }
  }
  flushSection();
  return chunks.filter(c => c.wordCount > 5);
}

export async function POST(req: NextRequest) {
  try {
    const { materialId, courseId, courseName, mode, idToken } = await req.json();
    let decoded: any = await getRequestUser(req);
    if (!decoded && idToken) {
      try { decoded = await adminAuth.verifyIdToken(idToken); } catch { decoded = null; }
    }
    if (!decoded) return NextResponse.json({ error: 'Unauthorized - please refresh page' }, { status: 401 });
    if (!(await isAdminUser(decoded))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const matRef = adminDb.collection('materials').doc(materialId);

    if (mode === 'extra') {
      await matRef.update({ sharedCourseIds: FieldValue.arrayUnion(courseId), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }

    const mat = (await matRef.get()).data();
    if (!mat) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    // Update course assignment
    // An auto-generated name follows the course: "OLD 101 · Handout 2" -> "NEW 202 · Handout N".
    let newDisplayName: string | null = null;
    if (mat.confirmedCourseId !== courseId && AUTO_NAME_RE.test(String(mat.indexDisplayName ?? ''))) {
      const cSnap = await adminDb.collection('courses').doc(courseId).get();
      const cData: any = cSnap.data() ?? {};
      const label = courseLabel({ name: cData.name ?? courseName, code: cData.code, shortName: cData.shortName }, String(courseName ?? ''));
      const stems = Array.from(new Set([label, ...courseAliases({ name: cData.name ?? courseName, code: cData.code, shortName: cData.shortName })].filter(Boolean).map((b: string) => `${b} · ${nameLabel(mat.category)} `)));
      const stem = stems[0];
      const others = await adminDb.collection('materials').where('confirmedCourseId', '==', courseId).get();
      let max = 0;
      others.docs.forEach(d => {
        const n = String(d.data().indexDisplayName ?? '');
        const hit = stems.find(sx => n.startsWith(sx));
        if (hit) {
          const num = Number(n.slice(hit.length));
          if (!isNaN(num)) max = Math.max(max, num);
        }
      });
      newDisplayName = `${stem}${max + 1}`;
    }

    const cf: any = (await adminDb.collection('courses').doc(courseId).get()).data() ?? {};
    await matRef.update({
      confirmedCourseId: courseId,
      confirmedCourseName: courseName,
      ...(cf.department ? { department: cf.department } : {}),
      ...(cf.year ? { year: cf.year } : {}),
      ...(cf.semester ? { semester: cf.semester } : {}),
      ...(newDisplayName ? { indexDisplayName: newDisplayName } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Re-chunk into Qdrant — read from sub-document, fallback to parent doc
    await deleteChunksByMaterial(materialId);

    const bodySnap = await matRef.collection('body').doc('extracted').get();
    const extractedText: string = bodySnap.exists
      ? bodySnap.data()!.extractedText ?? ''
      : mat.extractedText ?? '';

    if (extractedText) {
      const chunks = semanticChunk(stripTOC(extractedText));
      await upsertChunks(
        chunks.map((chunk, i) => ({
          id: `${materialId}-${i}`,
          payload: {
            materialId, courseId, chunkIndex: i,
            heading: chunk.heading, fullPath: chunk.fullPath,
            ancestorHeadings: chunk.ancestorHeadings,
            text: chunk.text, category: mat.category ?? 'general',
          },
        }))
      );
      await matRef.update({ indexed: true, status: 'approved' });
      console.log(`[reassign] ${chunks.length} chunks upserted for ${materialId}`);
      // Shared courses keep their own copy of the chunks; deleting above removed them, so put them back.
      for (const sid of ((mat.sharedCourseIds ?? []) as string[])) {
        if (sid && sid !== courseId) {
          try { await copyChunksToCourse(materialId, courseId, sid); }
          catch (e) { console.error('[reassign] shared copy failed', sid, e); }
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('reassign error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
