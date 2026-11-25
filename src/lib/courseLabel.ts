export type LabelCourse = { name?: string | null; code?: string | null; shortName?: string | null };

const STOP = new Set(['of', 'the', 'and', 'in', 'to', 'a', 'an', 'for', 'on', 'at', 'de', 'et']);
const MAX_LEN = 28;

// What auto-generated names and downloads call a course: the admin's short name if one is set,
// else the course name, else an acronym when the name is long. The course code is only a last resort.
export function courseLabel(c?: LabelCourse | null, fallback = ''): string {
  if (!c) return fallback;
  const short = String(c.shortName ?? '').trim();
  if (short) return short;
  const name = String(c.name ?? '').trim();
  if (!name) return String(c.code ?? '').trim() || fallback;
  if (name.length <= MAX_LEN) return name;
  const acr = name.split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase())).map(w => w[0].toUpperCase()).join('');
  return acr.length >= 2 ? acr : name.slice(0, MAX_LEN).trim();
}

// The one place that decides what name a material shows. Display only: storage keys never change.
export function displayName(m?: { indexDisplayName?: string | null; fileName?: string | null } | null): string {
  const a = String(m?.indexDisplayName ?? '').trim();
  return a || String(m?.fileName ?? '').trim();
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'material';
}

// File name (without extension) for a download: "Patristics · Handout 3".
export function downloadBase(
  m: { indexDisplayName?: string | null; fileName?: string | null; confirmedCourseName?: string | null },
  course?: LabelCourse | null,
): string {
  const full = displayName(m).replace(/\.(pdf|docx?|pptx?|jpe?g|png|txt|md|markdown|html)$/i, '');
  const label = courseLabel(course, String(m?.confirmedCourseName ?? '').trim());
  if (!label) return safeFileName(full);
  const heads = [course?.code, course?.name, course?.shortName, m?.confirmedCourseName, label]
    .map(x => String(x ?? '').trim()).filter(Boolean);
  let rest = full;
  for (const h of heads) {
    const re = new RegExp('^' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[·—–:-]\\s*', 'i');
    if (re.test(rest)) { rest = rest.replace(re, ''); break; }
  }
  rest = rest.trim();
  return safeFileName(rest && rest.toLowerCase() !== label.toLowerCase() ? `${label} · ${rest}` : label);
}
