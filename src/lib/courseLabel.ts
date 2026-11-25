export type LabelCourse = { name?: string | null; code?: string | null; shortName?: string | null };

const STOP = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'for', 'on', 'at', 'de', 'et']);
const GENERIC = new Set([
  'introduction', 'intro', 'introductory', 'general', 'basic', 'basics', 'foundations', 'foundation',
  'principles', 'fundamentals', 'fundamental', 'survey', 'elements', 'seminar', 'course', 'topics',
  'topic', 'studies', 'study', 'overview', 'advanced', 'special',
]);
const MAX_LEN = 28;

const clean = (w: string) => w.replace(/^[("']+|[:;,.)"']+$/g, '');

// Long course names are reduced to their keywords ("Introduction to Biblical Exegesis" -> "Biblical Exegesis"),
// keeping a trailing numeral ("... II"). Short names are left exactly as they are.
function keywordLabel(name: string): string {
  const words = name.split(/\s+/).map(clean).filter(Boolean);
  const tail = words.length > 1 && /^(i{1,3}|iv|v|vi{0,3}|\d+)$/i.test(words[words.length - 1]) ? words[words.length - 1] : '';
  const core = tail ? words.slice(0, -1) : words;
  const keep = core.filter(w => !STOP.has(w.toLowerCase()) && !GENERIC.has(w.toLowerCase()));
  const pool = keep.length ? keep : core.filter(w => !STOP.has(w.toLowerCase()));
  let out = pool.slice(0, 2).join(' ');
  if (out.length < 9 && pool.length > 2) out = pool.slice(0, 3).join(' ');
  if (tail) out = `${out} ${tail}`.trim();
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN).replace(/\s+\S*$/, '').trim() || out.slice(0, MAX_LEN);
  return out || name.slice(0, MAX_LEN).trim();
}

// What auto-generated names and downloads call a course: the admin's short name if one is set,
// else the course name, else its keywords when the name is long. The course code is only a last resort.
export function courseLabel(c?: LabelCourse | null, fallback = ''): string {
  if (!c) return fallback;
  const short = String(c.shortName ?? '').trim();
  if (short) return short;
  const name = String(c.name ?? '').trim();
  if (!name) return String(c.code ?? '').trim() || fallback;
  return name.length <= MAX_LEN ? name : keywordLabel(name);
}

// The acronym style used by an earlier version; only needed to recognise names made with it.
export function legacyAcronym(c?: LabelCourse | null): string {
  const name = String(c?.name ?? '').trim();
  if (name.length <= MAX_LEN) return '';
  const acr = name.split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase())).map(w => w[0].toUpperCase()).join('');
  return acr.length >= 2 ? acr : '';
}

// Every way a course may have been written at the start of a material name.
export function courseAliases(c?: LabelCourse | null): string[] {
  if (!c) return [];
  return Array.from(new Set(
    [courseLabel(c), c.code, c.name, c.shortName, legacyAcronym(c)].map(x => String(x ?? '').trim()).filter(Boolean),
  ));
}

// The one place that decides what name a material shows. Display only: storage keys never change.
export function displayName(m?: { indexDisplayName?: string | null; fileName?: string | null } | null): string {
  const a = String(m?.indexDisplayName ?? '').trim();
  return a || String(m?.fileName ?? '').trim();
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'material';
}

// File name (without extension) for a download: "Biblical Exegesis · Handout 3".
export function downloadBase(
  m: { indexDisplayName?: string | null; fileName?: string | null; confirmedCourseName?: string | null },
  course?: LabelCourse | null,
): string {
  const full = displayName(m).replace(/\.(pdf|docx?|pptx?|jpe?g|png|txt|md|markdown|html)$/i, '');
  const label = courseLabel(course, String(m?.confirmedCourseName ?? '').trim());
  if (!label) return safeFileName(full);
  const heads = [...courseAliases(course), String(m?.confirmedCourseName ?? '').trim()].filter(Boolean);
  let rest = full;
  for (const h of heads) {
    const re = new RegExp('^' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[·—–:-]\\s*', 'i');
    if (re.test(rest)) { rest = rest.replace(re, ''); break; }
  }
  rest = rest.trim();
  return safeFileName(rest && rest.toLowerCase() !== label.toLowerCase() ? `${label} · ${rest}` : label);
}
