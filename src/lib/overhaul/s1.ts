// One-off S1 course overhaul (2026/27). Pure planner: no Firebase imports.
export type Dept = 'philosophy' | 'theology';
export interface Ex { id: string; code: string; name: string; department: string; year: number; semester: number; published?: boolean; s1OverhaulAt?: string }
interface T { code: string; name?: string; from?: string; was?: string; isNew?: boolean }
interface A { code: string; was?: string }
interface G { department: Dept; year: number; targets: T[]; archive: A[] }

const keep = (code: string, was?: string): T => ({ code, from: code, was });
const recode = (from: string, code: string, name: string, was?: string): T => ({ code, from, name, was });
const fresh = (code: string, name: string): T => ({ code, name, isNew: true });
const arch = (code: string, was?: string): A => ({ code, was });

export const GROUPS: G[] = [
  { department: 'philosophy', year: 1, targets: [
    keep('PHI101', 'Introduction to Philosophy'),
    recode('PHI107', 'PHI106', 'Aristotelian Logic', 'Aristotelian Logic'),
    recode('PHI106', 'PHI107', 'Plato: Symposium', 'Plato: Symposium'),
    keep('BCG101', 'Introduction to NT Greek'), keep('BCS101', 'Introduction to Scripture'),
    keep('BSTH107', 'Spiritual Theology'), keep('BLH101', 'Latin'), keep('BAF101', 'African Thought & Culture'),
    recode('BHI213', 'BPHI213', 'Philosophy of Education', 'Philosophy of Education'),
    keep('BLI101', 'Igbo Grammar'), keep('BMI201', 'Italian I'), keep('GES101', 'Use of English 1'),
    keep('GES106', 'Logic and Critical Thinking'), fresh('GES108', 'French'),
  ], archive: [arch('PHI101B', 'Knowing Philosophy')] },
  { department: 'philosophy', year: 2, targets: [
    keep('BSTH211', 'Spiritual Theology (Yr 2)'), keep('BSOC201', 'Sociology'), keep('BPHI210', 'Christianity and Philosophy'),
    keep('PHI208', 'Philosophy of Nature (Cosmology)'), keep('PHI110', 'Aristotle: Nicomachean Ethics'), keep('PHI203', 'Ethics'),
    fresh('BPHI208', 'Philosophy, Language & Communication'), keep('PHI204', 'Medieval Philosophy'),
    keep('PHI206', 'Introduction to Metaphysics'), keep('GES105', 'Agricultural Science'),
    keep('PHI202', 'Introduction to Logic'), keep('ECO201', 'Introduction to Accounting'),
  ], archive: [arch('PHI103-P2S1', 'Philosophy of Value')] },
  { department: 'philosophy', year: 3, targets: [
    keep('BPSY302', 'Psychology of Religion'), keep('PHI319', 'Descartes: Discourse on Method'), keep('PHI301', 'Metaphysics'),
    keep('PHI309', 'Philosophy of Literature'), keep('PHI306', 'Early Modern Philosophy'), keep('BSTH315', 'Apostolic Vocation'),
    keep('PHI310', 'Methodology of Research & Writing'), keep('GES301', 'Introduction to Entrepreneurial Skills'),
    keep('PHI307', 'African Philosophy'), keep('PHI305', 'Social & Political Philosophy'),
    keep('BSOC301', 'Sociology of Religion'), keep('PHI304', 'Philosophy of Science'),
  ], archive: [] },
  { department: 'philosophy', year: 4, targets: [
    keep('PHI405', 'Comparative Philosophy'), keep('PHI420', 'Heidegger: Being and Time'),
    keep('PHI408', 'Phenomenology: Existentialism and Hermeneutics'), keep('PHI406', 'Recent Modern Philosophy'),
    keep('BPHI407', 'Analytic Philosophy'), keep('PHI401', 'Epistemology'), keep('PHI402', 'Topics in Logic'),
    keep('PHI413', 'Philosophy of Mind'), fresh('PHI322', 'Augustine: On Free Will'),
  ], archive: [] },
  { department: 'theology', year: 1, targets: [
    recode('THEO132-T1S1', 'THEO101-T1S1', 'Sacred Scripture OT: Historical and Legal Books', 'Pentateuch & Historical Books'),
    recode('THEO113-T1S1', 'THEO111-T1S1', 'Sacred Scripture NT: Synoptic Gospels and Acts of the Apostles', 'Synoptic Gospels'),
    recode('THEO101', 'THEO121-T1S1', 'Introduction to Sacred Scripture', 'Fundamentals of Scripture'),
    fresh('THEO132-T1S1', 'NT: Basileia of God in the Life and Ministry of Jesus'),
    recode('THEO108-T1S1', 'THEO104-T1S1', 'Fundamental Moral Theology', 'Fundamental Moral Theology'),
    keep('BLG101', 'Greek'), keep('BHE101', 'Hebrew'), keep('THEO131', 'Environment & Times of NT'),
    keep('CL101-T1S1', 'Canon Law'), keep('CCH101-T1S1', 'Church History'), keep('PAT101-T1S1', 'Patrology'),
    keep('SPTH101-T1S1', 'Spiritual Theology'), keep('ENG101-T1S1', 'Use of English'), keep('THEO107-T1S1', 'Sacramental Theology'),
    fresh('THEO109-T1S1', 'Fundamental Liturgy'), fresh('NAU-RHR171-T1S1', 'Introduction to Human Relations'), fresh('PSY101-T1S1', 'Psychology'),
  ], archive: [arch('THEO102', 'Apologetics'), arch('THEO103', 'Mariology'), arch('THEO111-T1S1', 'De Deo Uno et Trino'), arch('THEO104-T1S1', 'Moral Theology')] },
  { department: 'theology', year: 2, targets: [
    keep('CL201-T2S1', 'Canon Law'), keep('SPTH201-T2S1', 'Spiritual Theology'),
    recode('THEO204-T2S1', 'THEO209-T2S1', 'Sacred Scripture OT: Prophetic Books', 'Prophets of the OT'),
    recode('BLG201-T2S1', 'CLG201-T2S1', 'Introduction to Greek', 'Greek II'),
    recode('BLH201-T2S1', 'NAU-RHR211-T2S1', 'Hebrew Grammar and Syntax', 'Hebrew II'),
    fresh('REL105-T2S1', 'Religion and Human Values'), fresh('NAU-RHR223-T2S1', 'Literature of the New Testament: Epistles in English'),
    fresh('THEO205-T2S1', 'Sacraments of Christian Initiation'), fresh('ISS141-T2S1', 'Islamic Studies'),
    fresh('THEO217-T2S1', 'Sacred Writings: Corpus Johanneum'), fresh('NAU-RHR261-T2S1', 'Religious Ethics'),
    fresh('FAC201-T2S1', 'Digital Humanities: Application of Computer to Arts'),
    fresh('ATR201-T2S1', 'General Introduction to the Study of Religion'), fresh('NAU-RHR251-T2S1', 'African Traditional Belief and Philosophy'),
    fresh('NAU-RHR231-T2S1', 'Early Christian History and Doctrine to 451 AD I'),
    fresh('NAU-RHR271-T2S1', 'Psycho-social Elements of Human Relations'), fresh('THEO202-T2S1', 'Christology'),
  ], archive: [arch('CCH201-T2S1', 'Church History'), arch('THEO213', 'De Deo Creante et Elevante'), arch('THEO201-T2S1', 'Fundamental Moral Theology'),
    arch('THEO205-T2S1', 'Grace'), arch('MIS201-T2S1', 'Missiology'), arch('THEO214-T2S1', 'NT Exegesis (Yr 2)'),
    arch('THEO211-T2S1', 'OT Historical Books'), arch('PSTH204-T2S1', 'Pastoral Theology'), arch('PAT201-T2S1', 'Patrology II')] },
  { department: 'theology', year: 3, targets: [
    keep('CL301-T3S1', 'Canon Law'), keep('THEO302-T3S1', 'Christology'), keep('THEO317-T3S1', 'Liturgy'),
    keep('THEO407-T3S1', 'Moral Theology'), keep('THEO314-T3S1', 'NT Exegesis: John and Revelation'),
    keep('THEO415-T3S1', 'NT Exegesis: Pauline Corpus'), keep('THEO408-T3S1', 'OT Exegesis: Wisdom Literature and Psalms'),
    keep('PSTH401-T3S1', 'Pastoral Theology'), keep('THEO403-T3S1', 'Sacramental Theology'),
    recode('THEO401-T3S1', 'THEO401-T3S1', 'De Novissimi', 'De Resurrectio'),
    recode('THEO305-T3S1', 'THEO404-T3S1', 'Ecclesiology', 'Ecclesiology'),
    recode('THEO204-T3S1', 'THEO409-T3S1', 'OT Exegesis: Theology of the OT Prophets', 'Prophets of the OT'),
    fresh('THEO313-T3S1', 'NT: Synoptic Gospels and Acts of the Apostles'), fresh('CLP-T3S1', 'Canon Law Praxis'),
  ], archive: [arch('HOM-T3S1', 'Homiletics'), arch('PSY302-T3S1', 'Pastoral Psychology'), arch('THEO308-T3S1', 'Virtue of Religion')] },
  { department: 'theology', year: 4, targets: [
    keep('CLP-T4S1', 'Canon Law Praxis'), keep('THEO404-T4S1', 'Christology'), keep('HOM-T4S1', 'Homiletics'),
    keep('THEO417-T4S1', 'Liturgy Praxis'), keep('THEO415-T4S1', 'NT Exegesis: Pauline Corpus'),
    keep('PSTH401-T4S1', 'Pastoral Theology'), keep('PSY401-T4S1', 'Psychology'), keep('THEO403-T4S1', 'Sacramental Theology'),
    fresh('CL401-T4S1', 'Canon Law'), fresh('THEO401-T4S1', 'De Novissimi'), fresh('THEO314-T4S1', 'NT Exegesis: John and Revelation'),
  ], archive: [arch('THEO407-T4S1', 'Moral Theology'), arch('THEO313-T4S1', 'NT: Synoptic Gospels and Acts of the Apostles'),
    arch('THEO409-T4S1', 'OT Exegesis: Theology of the OT Prophets'), arch('THEO408-T4S1', 'OT Exegesis: Wisdom Literature and Psalms'),
    arch('PENTE-T4S1', 'Pentecostalism'), arch('THEO132-T4S1', 'Pentateuch & Historical Books')] },
];

export type Op =
  | { kind: 'KEEP'; id: string; code: string; name: string }
  | { kind: 'RECODE'; id: string; fromCode: string; toCode: string; fromName: string; toName: string }
  | { kind: 'NEW'; department: Dept; year: number; code: string; name: string }
  | { kind: 'ARCHIVE'; id: string; code: string; name: string; newCode?: string }
  | { kind: 'UNLISTED'; id: string; code: string; name: string };
export interface Plan { groups: { department: Dept; year: number; ops: Op[] }[]; problems: string[]; warnings: string[] }

const nc = (s: string) => (s || '').replace(/\s+/g, '').toUpperCase();
const nn = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildPlan(all: Ex[]): Plan {
  const plan: Plan = { groups: [], problems: [], warnings: [] };
  if (all.some(c => c.s1OverhaulAt)) {
    plan.problems.push('Overhaul already applied (courses stamped s1OverhaulAt). Nothing to do.');
    return plan;
  }
  const claimedAll = new Set<string>();
  const finalSeen = new Map<string, string>();
  for (const g of GROUPS) {
    const label = g.department + ' Y' + g.year;
    const docs = all.filter(c => c.department === g.department && Number(c.year) === g.year && Number(c.semester) === 1);
    const claimed = new Set<string>();
    const ops: Op[] = [];
    const find = (code: string, was?: string): Ex | null => {
      const byCode = docs.filter(d => !claimed.has(d.id) && nc(d.code) === nc(code));
      if (byCode.length === 1) {
        if (was && nn(byCode[0].name) !== nn(was)) plan.warnings.push(label + ': ' + code + ' is named "' + byCode[0].name + '" (expected "' + was + '")');
        return byCode[0];
      }
      if (byCode.length > 1) { plan.problems.push(label + ': code ' + code + ' matches ' + byCode.length + ' courses (ambiguous)'); return null; }
      if (was) {
        const byName = docs.filter(d => !claimed.has(d.id) && nn(d.name) === nn(was));
        if (byName.length === 1) { plan.warnings.push(label + ': ' + code + ' not found; matched by name "' + was + '" (its code is ' + byName[0].code + ')'); return byName[0]; }
      }
      plan.problems.push(label + ': no S1 course found for ' + code + (was ? ' / "' + was + '"' : ''));
      return null;
    };
    for (const t of g.targets.filter(x => x.from)) {
      const d = find(t.from!, t.was);
      if (!d) continue;
      claimed.add(d.id); claimedAll.add(d.id);
      const toName = t.name ?? d.name;
      if (nc(d.code) === nc(t.code) && toName === d.name) ops.push({ kind: 'KEEP', id: d.id, code: d.code, name: d.name });
      else ops.push({ kind: 'RECODE', id: d.id, fromCode: d.code, toCode: t.code, fromName: d.name, toName });
    }
    const archOps: Op[] = [];
    for (const a of g.archive) {
      const d = find(a.code, a.was);
      if (!d) continue;
      claimed.add(d.id); claimedAll.add(d.id);
      archOps.push({ kind: 'ARCHIVE', id: d.id, code: d.code, name: d.name });
    }
    for (const t of g.targets.filter(x => x.isNew)) ops.push({ kind: 'NEW', department: g.department, year: g.year, code: t.code, name: t.name! });
    const finals = new Set(g.targets.map(t => nc(t.code)));
    for (const o of archOps) if (o.kind === 'ARCHIVE' && finals.has(nc(o.code))) o.newCode = o.code + '-ARCHIVED';
    ops.push(...archOps);
    for (const d of docs) if (!claimed.has(d.id)) {
      ops.push({ kind: 'UNLISTED', id: d.id, code: d.code, name: d.name });
      plan.warnings.push(label + ': "' + d.name + '" (' + d.code + ') is not in the spec; left untouched');
    }
    for (const t of g.targets) {
      const k = nc(t.code);
      if (finalSeen.has(k)) plan.problems.push('Duplicate final code ' + t.code + ' (' + finalSeen.get(k) + ' and ' + label + ')');
      finalSeen.set(k, label);
    }
    plan.groups.push({ department: g.department, year: g.year, ops });
  }
  for (const g of GROUPS) for (const t of g.targets) {
    if (!t.isNew && nc(t.from!) === nc(t.code)) continue;
    const clash = all.filter(c => !claimedAll.has(c.id) && nc(c.code) === nc(t.code));
    for (const c of clash) plan.warnings.push('Target code ' + t.code + ' is already used by "' + c.name + '" (' + c.department + ' Y' + c.year + ' S' + c.semester + ')');
  }
  return plan;
}

export function renderPlan(plan: Plan, counts: Record<string, { p: number; s: number }>): string {
  const L: string[] = [];
  const tag = (id: string) => { const c = counts[id]; return c && (c.p || c.s) ? '  [files ' + c.p + '+' + c.s + 'sh]' : ''; };
  let nKeep = 0, nRe = 0, nNew = 0, nArc = 0;
  for (const g of plan.groups) {
    L.push('== ' + g.department + ' Y' + g.year + ' S1 ==');
    for (const o of g.ops) {
      if (o.kind === 'KEEP') { nKeep++; L.push('KEEP    ' + o.code + '  ' + o.name + tag(o.id)); }
      else if (o.kind === 'RECODE') { nRe++; L.push('RECODE  ' + o.fromCode + ' -> ' + o.toCode + (o.fromName !== o.toName ? '\n         "' + o.fromName + '" -> "' + o.toName + '"' : '') + tag(o.id)); }
      else if (o.kind === 'NEW') { nNew++; L.push('NEW     ' + o.code + '  ' + o.name); }
      else if (o.kind === 'ARCHIVE') { nArc++; L.push('HIDE    ' + o.code + (o.newCode ? ' (code -> ' + o.newCode + ')' : '') + '  ' + o.name + tag(o.id)); }
      else L.push('UNLISTED ' + o.code + '  ' + o.name + ' (untouched)');
    }
  }
  L.push('');
  L.push('TOTAL keep ' + nKeep + ' | recode ' + nRe + ' | new ' + nNew + ' | hide ' + nArc);
  if (plan.problems.length) { L.push('', 'PROBLEMS (apply is blocked):'); plan.problems.forEach(p => L.push(' - ' + p)); }
  if (plan.warnings.length) { L.push('', 'WARNINGS:'); plan.warnings.forEach(w => L.push(' - ' + w)); }
  if (!plan.problems.length) L.push('', 'No blocking problems.');
  return L.join('\n');
}
