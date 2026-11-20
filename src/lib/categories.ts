// One category vocabulary for the whole app: upload page, sorting, OCR/approval,
// library, coverage and chat. Keys never change (coverage etc. depend on them);
// only the labels students and admins see live here.
export const CATEGORY_OPTIONS: { key: string; label: string }[] = [
  { key: 'lecture_notes', label: 'Handout' },
  { key: 'past_questions', label: 'Past Questions' },
  { key: 'aoc', label: 'Areas of Concentration' },
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'other', label: 'Other' },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(c => [c.key, c.label])
);

// Maps the classifier's older vocabulary (notes / textbook) onto the shared one.
export function normalizeCategory(c?: string | null): string {
  const k = String(c ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!k) return '';
  if (k === 'notes' || k === 'handout' || k === 'handouts' || k === 'lecture_note') return 'lecture_notes';
  if (k === 'textbook') return 'other';
  return k;
}

// Word used inside an auto-generated name: "PHL 201 · Handout 3".
// Not classified yet = Handout (most uploads are handouts); 'other' = Material.
export function nameLabel(category?: string | null): string {
  const c = normalizeCategory(category);
  if (!c) return 'Handout';
  if (c === 'other') return 'Material';
  return CATEGORY_LABEL[c] ?? 'Handout';
}

export const AUTO_NAME_RE = /^.+ · (Handout|Past Questions|Areas of Concentration|Syllabus|Material) \d+$/;
