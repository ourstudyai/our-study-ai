import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { MaterialCategory } from '@/lib/processing/classifier';
import { FieldValue } from 'firebase-admin/firestore';

const CHUNKS_COL = 'material_chunks';
const WORD_CEILING = 1500;

interface SemanticChunk {
  text: string;
  heading: string;
  headingLevel: number;
  ancestorHeadings: string[];
  fullPath: string;
  wordCount: number;
}

function semanticChunk(markdown: string): SemanticChunk[] {
  const lines = markdown.split('\n');
  const chunks: SemanticChunk[] = [];
  const headingStack: { level: number; heading: string }[] = [];
  let bodyLines: string[] = [];

  function flushSection() {
    const body = bodyLines.join('\n').trim();
    bodyLines = [];
    if (!body && headingStack.length === 0) return;

    const currentHeading = headingStack.length > 0
      ? headingStack[headingStack.length - 1].heading
      : '';
    const currentLevel = headingStack.length > 0
      ? headingStack[headingStack.length - 1].level
      : 0;
    const ancestors = headingStack.slice(0, -1).map(h => h.heading);
    const fullPath = headingStack.map(h => h.heading).join(' > ');

    if (!body && !currentHeading) return;

    const fullText = currentHeading
      ? `${'#'.repeat(currentLevel)} ${currentHeading}\n\n${body}`
      : body;

    const words = fullText.split(/\s+/).filter(Boolean);

    if (words.length <= WORD_CEILING) {
      chunks.push({
        text: fullText.trim(),
        heading: currentHeading,
        headingLevel: currentLevel,
        ancestorHeadings: ancestors,
        fullPath,
        wordCount: words.length,
      });
    } else {
      // Split large sections at paragraph boundaries
      const paragraphs = fullText.split(/\n\n+/);
      let buffer: string[] = [];
      let bufferWords = 0;
      let splitIndex = 0;

      for (const para of paragraphs) {
        const paraWords = para.split(/\s+/).filter(Boolean).length;
        if (bufferWords + paraWords > WORD_CEILING && buffer.length > 0) {
          chunks.push({
            text: buffer.join('\n\n').trim(),
            heading: currentHeading,
            headingLevel: currentLevel,
            ancestorHeadings: ancestors,
            fullPath: fullPath + (splitIndex > 0 ? ` (part ${splitIndex + 1})` : ''),
            wordCount: bufferWords,
          });
          buffer = [];
          bufferWords = 0;
          splitIndex++;
        }
        buffer.push(para);
        bufferWords += paraWords;
      }
      if (buffer.length > 0) {
        chunks.push({
          text: buffer.join('\n\n').trim(),
          heading: currentHeading,
          headingLevel: currentLevel,
          ancestorHeadings: ancestors,
          fullPath: fullPath + (splitIndex > 0 ? ` (part ${splitIndex + 1})` : ''),
          wordCount: bufferWords,
        });
      }
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      // Pop stack to current level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, heading });
    } else {
      bodyLines.push(line);
    }
  }
  flushSection();

  return chunks.filter(c => c.wordCount > 5);
}

export async function POST(req: NextRequest) {
  try {
    const {
      materialId, courseId, courseName, category,
      extractedText, indexDisplayName, department,
      year, semester, quarantine, shouldIndex = true
    } = await req.json();

    if (quarantine) {
      await adminDb.collection('materials').doc(materialId).update({
        status: 'quarantined', updatedAt: new Date().toISOString()
      });
      return NextResponse.json({ ok: true });
    }

    if (!materialId || !courseId || !extractedText) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const finalStatus = shouldIndex ? 'approved' : 'approved_hidden';

    if (shouldIndex) {
      // Delete old chunks
      const oldChunks = await adminDb.collection(CHUNKS_COL)
        .where('materialId', '==', materialId).get();
      const deleteBatch = adminDb.batch();
      oldChunks.docs.forEach(d => deleteBatch.update(d.ref, { deleted: true }));
      await deleteBatch.commit();

      // Semantic chunking
      const chunks = semanticChunk(extractedText);

      const writeBatch = adminDb.batch();
      chunks.forEach((chunk, i) => {
        const ref = adminDb.collection(CHUNKS_COL).doc();
        writeBatch.set(ref, {
          materialId,
          courseId,
          category: category as MaterialCategory,
          chunkIndex: i,
          text: chunk.text,
          heading: chunk.heading,
          headingLevel: chunk.headingLevel,
          ancestorHeadings: chunk.ancestorHeadings,
          fullPath: chunk.fullPath,
          wordCount: chunk.wordCount,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await writeBatch.commit();
      console.log(`[reindex] ${chunks.length} semantic chunks written for ${materialId}`);
    }

    await adminDb.collection('materials').doc(materialId).update({
      status: finalStatus,
      confirmedCourseId: courseId,
      confirmedCourseName: courseName,
      extractedText,
      indexed: shouldIndex,
      indexedAt: shouldIndex ? new Date().toISOString() : null,
      indexDisplayName: indexDisplayName || null,
      department: department || null,
      year: year || null,
      semester: semester || null,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, status: finalStatus });
  } catch (err) {
    console.error('[reindex-material]', err);
    return NextResponse.json({ error: 'Reindex failed' }, { status: 500 });
  }
}
