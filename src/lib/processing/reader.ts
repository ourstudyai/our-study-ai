// src/lib/processing/reader.ts
// The AI reading pass. After OCR, the AI reads the text (and, for photos, the picture itself) and works out:
// what the file is (handout, student notes, past questions, textbook...), whether it is handwritten, which
// course it belongs to, a summary and key points, and a clean copy of the opening page.
// Core logic takes its tools as arguments so it can be tested without Firebase or Mistral.

export type ReadDeps = {
  getMaterial: (id: string) => Promise<any | null>;
  getText: (id: string) => Promise<string>;
  getCourses: () => Promise<any[]>;
  chat: (messages: any[]) => Promise<string>;
  fetchImage: (url: string, mime: string) => Promise<string | null>;
  save: (id: string, update: any, firstPage: string) => Promise<void>;
  now: () => string;
};

export type ReadOutcome = { ok: boolean; reason?: string; retry?: boolean; reading?: any };

const KINDS = ['handout', 'student_notes', 'past_questions', 'aoc', 'syllabus', 'textbook', 'other'];
const KIND_TO_CATEGORY: Record<string, string> = {
  handout: 'lecture_notes', student_notes: 'student_notes', past_questions: 'past_questions',
  aoc: 'aoc', syllabus: 'syllabus', textbook: 'other', other: 'other',
};
const OVERWRITE_OK = ['upload_review', 'sorted', 'processing', 'pending_review', 'ocr_pending'];

const str = (v: any, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v: any, max = 300): string | null => { const s = str(v, max); return s ? s : null; };
const strList = (v: any, n: number, max = 200): string[] =>
  Array.isArray(v) ? v.map(x => str(x, max)).filter(Boolean).slice(0, n) : [];

function sampleText(text: string): string {
  if (text.length <= 9000) return text;
  const mid = Math.floor(text.length / 2);
  return text.slice(0, 6000) + '\n[...]\n' + text.slice(mid - 750, mid + 750) + '\n[...]\n' + text.slice(-1500);
}

function parseJson(raw: string): any | null {
  let s = (raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

function courseView(c: any) {
  return {
    id: String(c.id), name: str(c.name, 200), code: strOrNull(c.code, 40),
    department: strOrNull(c.department, 40), year: Number(c.year) || null, semester: Number(c.semester) || null,
  };
}

function buildPrompt(m: any, text: string, courses: any[]): string {
  const lines = courses.slice(0, 300).map(c => `${c.id}|${c.code || ''}|${c.name}|${c.department || ''}|Y${c.year || '?'}|S${c.semester || '?'}`).join('\n');
  return [
    'You read study material uploaded to a Catholic seminary library (philosophy and theology departments, Nigeria).',
    'Work out what the file is and which course it belongs to. Use ONLY what the file shows. Never invent.',
    '',
    'FACTS ABOUT THE UPLOAD',
    `File name: ${str(m.fileName, 200)}`,
    `Uploaded to: department ${m.uploadDepartment || 'unknown'}, year ${m.uploadYear || 'unknown'} (the uploader may be wrong)`,
    `Uploader hint (may be wrong): ${m.uploaderHintCourseName || 'none'}`,
    `Extraction: ${m.extractionMethod || 'unknown'}, scanned or photographed: ${m.isScanned ? 'yes' : 'no'}, pages: ${m.pageCount || 'unknown'}, words: ${m.wordCount || 'unknown'}`,
    '',
    'COURSES (id|code|name|department|year|semester):',
    lines || '(none)',
    '',
    'TEXT OF THE FILE (may contain OCR mistakes; [...] marks skipped parts):',
    sampleText(text),
    '',
    'Reply with ONE JSON object and nothing else, with exactly these keys:',
    '{',
    '"kind": one of "handout" (lecturer notes or handout), "student_notes" (a student\'s own notes), "past_questions", "aoc" (areas of concentration), "syllabus", "textbook" (a published book or long chapter), "other",',
    '"handwritten": true if the original is handwritten (look at the picture if one is given; for scans judge from the text and the facts), otherwise false,',
    '"title": a short clean title,',
    '"courseId": the id of the ONE best matching course from the list, or null if none clearly fits,',
    '"alsoFits": up to 3 other course ids from the list the content could also belong to (other year, other semester or related course), or [],',
    '"lecturer": name if shown, else null,',
    '"session": for past questions the exam year or session if shown, else null,',
    '"topics": up to 6 main topics,',
    '"summary": 3 to 4 plain sentences on what the file covers,',
    '"keyPoints": up to 6 short key points,',
    '"confidence": "high", "medium" or "low" for the course match,',
    '"reason": one short sentence saying what in the file led you to this course and kind,',
    '"firstPage": the opening of the file, about 300 words, copied faithfully but cleaned: fix broken spacing and line breaks, use simple markdown headings and lists, write [illegible] where a word cannot be read, never add or change content',
    '}',
  ].join('\n');
}

export async function readMaterialCore(d: ReadDeps, id: string): Promise<ReadOutcome> {
  const m = await d.getMaterial(id);
  if (!m) return { ok: false, reason: 'material not found' };
  const text = await d.getText(id);
  if (!text || text.trim().length < 20) return { ok: false, reason: 'no readable text' };

  const courses = (await d.getCourses()).filter(c => c && c.published !== false);
  const prompt = buildPrompt(m, text, courses);

  const mime = String(m.mimeType || '');
  let image: string | null = null;
  if (mime.indexOf('image/') === 0 && m.fileUrl) {
    try { image = await d.fetchImage(String(m.fileUrl), mime); } catch { image = null; }
  }

  let raw = '';
  let usedImage = false;
  try {
    if (image) {
      try {
        raw = await d.chat([{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', imageUrl: image }] }]);
        usedImage = true;
      } catch {
        raw = await d.chat([{ role: 'user', content: prompt }]);
      }
    } else {
      raw = await d.chat([{ role: 'user', content: prompt }]);
    }
  } catch (e: any) {
    return { ok: false, reason: 'AI call failed: ' + String(e?.message ?? e).slice(0, 200), retry: true };
  }

  const j = parseJson(raw);
  if (!j) return { ok: false, reason: 'AI answer was not readable JSON', retry: true };

  const byId: Record<string, any> = {};
  courses.forEach(c => { byId[String(c.id)] = c; });

  let kind = KINDS.indexOf(str(j.kind, 40)) >= 0 ? str(j.kind, 40) : 'other';
  const handwritten = j.handwritten === true;
  if (handwritten && ['past_questions', 'aoc', 'syllabus'].indexOf(kind) < 0) kind = 'student_notes';

  const matched = j.courseId && byId[String(j.courseId)] ? courseView(byId[String(j.courseId)]) : null;
  const also: any[] = [];
  (Array.isArray(j.alsoFits) ? j.alsoFits : []).forEach((x: any) => {
    const key = String(x);
    if (byId[key] && (!matched || matched.id !== key) && also.length < 3 && !also.some(a => a.id === key)) also.push(courseView(byId[key]));
  });

  const conf = ['high', 'medium', 'low'].indexOf(str(j.confidence, 10)) >= 0 ? str(j.confidence, 10) : 'low';
  const upYear = Number(m.uploadYear) || null;
  const upDept = m.uploadDepartment ? String(m.uploadDepartment) : null;
  const flags = {
    yearMismatch: !!(matched && upYear && matched.year && matched.year !== upYear),
    departmentMismatch: !!(matched && upDept && matched.department && matched.department !== upDept),
  };

  const now = d.now();
  const reading = {
    kind, category: KIND_TO_CATEGORY[kind], handwritten,
    title: strOrNull(j.title, 160), lecturer: strOrNull(j.lecturer, 120), session: strOrNull(j.session, 80),
    topics: strList(j.topics, 6, 120), summary: str(j.summary, 1200), keyPoints: strList(j.keyPoints, 6, 240),
    confidence: conf, reason: strOrNull(j.reason, 300),
    course: matched, alsoFits: also, flags,
    uploadedTo: { department: upDept, year: upYear },
    usedImage, readAt: now,
  };

  const update: any = { reading, readStatus: 'done', readAt: now, updatedAt: now };
  // Only before an admin has decided anything, and only when the AI is fairly sure, refresh the suggestion fields
  // that the current Pending screen already shows.
  if (OVERWRITE_OK.indexOf(String(m.status)) >= 0 && conf !== 'low') {
    update.category = reading.category;
    update.confidence = conf;
    update.classifierReason = 'AI reading: ' + (reading.reason || 'matched from the file content');
    if (matched) {
      update.suggestedCourseId = matched.id;
      update.suggestedCourseName = matched.name;
      update.detectedCourseName = matched.name;
    }
  }

  await d.save(id, update, str(j.firstPage, 4000));
  return { ok: true, reading };
}

// Real tools: Firestore (admin), Mistral chat, and the image fetch. Imported only when used.
export async function readMaterial(id: string): Promise<ReadOutcome> {
  const { adminDb } = await import('@/lib/firebase/admin');
  const { getMistralClient } = await import('@/lib/mistral/client');
  const mistral: any = getMistralClient();
  const model = process.env.MISTRAL_READ_MODEL || 'mistral-small-latest';

  return readMaterialCore({
    getMaterial: async (mid) => { const s = await adminDb.collection('materials').doc(mid).get(); return s.exists ? s.data() : null; },
    getText: async (mid) => {
      const s = await adminDb.collection('materials').doc(mid).collection('body').doc('extracted').get();
      return String((s.data() as any)?.extractedText ?? '');
    },
    getCourses: async () => {
      const s = await adminDb.collection('courses').get();
      return s.docs.map(x => ({ id: x.id, ...(x.data() as any) }));
    },
    chat: async (messages) => {
      const r = await mistral.chat.complete({ model, temperature: 0.1, maxTokens: 2200, responseFormat: { type: 'json_object' }, messages });
      const c = r.choices?.[0]?.message?.content;
      return typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? '').join('') : '';
    },
    fetchImage: async (url, mime) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 4_500_000) return null;
      return `data:${mime};base64,${buf.toString('base64')}`;
    },
    save: async (mid, update, firstPage) => {
      const ref = adminDb.collection('materials').doc(mid);
      await ref.update(update);
      if (firstPage) await ref.collection('body').doc('reading').set({ firstPage, updatedAt: update.updatedAt });
    },
    now: () => new Date().toISOString(),
  }, id);
}
