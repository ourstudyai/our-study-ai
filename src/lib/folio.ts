// src/lib/folio.ts
// Builds the printable "folio" page for the Library HTML and PDF downloads: A4, running head, folio numbers,
// gold rules, drop initial, book-style tables. Pure function, no imports. The PDF button opens this page and the
// browser's Save as PDF does the rest, so Greek, Hebrew and page breaks come out right.

export type FolioInput = {
  title: string;
  course: string;
  text: string;
  asPdf: boolean;      // true: the page opens the print dialog by itself
  dateLabel: string;   // e.g. "28 November 2026"
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(raw: string): string {
  let s = esc(raw);
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = s.replace(/\[illegible\]/gi, '<span class="ill">[illegible]</span>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])_(?!\s)(.+?)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => '<code>' + codes[Number(i)] + '</code>');
  return s;
}

const indentOf = (l: string) => (l.match(/^[ \t]*/) as RegExpMatchArray)[0].replace(/\t/g, '    ').length;
const isUl = (l: string) => /^\s*[-*+•]\s+/.test(l);
const isOl = (l: string) => /^\s*\d{1,3}[.)]\s+/.test(l);
const isRow = (l: string) => l.trim().startsWith('|') && l.trim().length > 1;

function renderList(lines: string[], start: number): { html: string; next: number } {
  const base = indentOf(lines[start]);
  const ordered = isOl(lines[start]);
  const tag = ordered ? 'ol' : 'ul';
  let html = '<' + tag + '>';
  let i = start;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      // a blank line ends the list unless the next line continues it
      if (i + 1 < lines.length && (isUl(lines[i + 1]) || isOl(lines[i + 1])) && indentOf(lines[i + 1]) >= base) { i++; continue; }
      break;
    }
    const ind = indentOf(l);
    if (ind < base || !(isUl(l) || isOl(l))) break;
    if (ind > base) {
      // nested list: attach inside the previous item
      const sub = renderList(lines, i);
      html = html.replace(/<\/li>$/, sub.html + '</li>');
      i = sub.next; continue;
    }
    if (isOl(l) !== ordered) break;
    const body = l.replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/, '');
    html += '<li>' + inline(body) + '</li>';
    i++;
  }
  return { html: html + '</' + tag + '>', next: i };
}

export function markdownToFolioBody(text: string): { html: string; firstIsPlainParagraph: boolean } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let firstIsPlainParagraph = false;
  let blocks = 0;
  while (i < lines.length) {
    const l = lines[i];
    const t = l.trim();
    if (!t) { i++; continue; }

    const fence = t.match(/^(```|~~~)/);
    if (fence) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre>' + esc(buf.join('\n')) + '</pre>'); blocks++; continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { const n = Math.min(h[1].length, 4); out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); i++; blocks++; continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) { out.push('<div class="orn" role="separator"></div>'); i++; blocks++; continue; }
    if (t.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + buf.map(x => inline(x)).join('<br/>') + '</blockquote>'); blocks++; continue;
    }
    if (isRow(l)) {
      const rows: string[] = [];
      while (i < lines.length && isRow(lines[i])) { rows.push(lines[i].trim()); i++; }
      const cells = (r: string) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const sepAt = rows.findIndex(r => /^\|?[\s:|-]+\|?$/.test(r) && r.indexOf('-') >= 0);
      let head: string[] | null = null;
      let body = rows;
      let aligns: string[] = [];
      if (sepAt === 1) {
        head = cells(rows[0]);
        aligns = cells(rows[1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
        body = rows.slice(2);
      } else if (sepAt > 1) { body = rows.filter((_r, k) => k !== sepAt); }
      const al = (k: number) => (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : '');
      let tb = '<table>';
      if (head) tb += '<thead><tr>' + head.map((c, k) => '<th' + al(k) + '>' + inline(c) + '</th>').join('') + '</tr></thead>';
      tb += '<tbody>' + body.map(r => '<tr>' + cells(r).map((c, k) => '<td' + al(k) + '>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      out.push(tb); blocks++; continue;
    }
    if (isUl(l) || isOl(l)) { const r = renderList(lines, i); out.push(r.html); i = r.next; blocks++; continue; }

    // paragraph: consecutive plain lines join into one; two trailing spaces or a backslash keep a line break
    const buf: string[] = [];
    while (i < lines.length) {
      const x = lines[i]; const xt = x.trim();
      if (!xt || /^(#{1,6}\s|```|~~~|>)/.test(xt) || isRow(x) || isUl(x) || isOl(x) || /^([-*_])(\s*\1){2,}$/.test(xt)) break;
      buf.push(x); i++;
    }
    const html = buf.map((x, k) => {
      const hard = /( {2,}|\\)$/.test(x);
      return inline(x.trim().replace(/\\$/, '')) + (hard && k < buf.length - 1 ? '<br/>' : k < buf.length - 1 ? ' ' : '');
    }).join('');
    if (blocks === 0 && /^[A-Za-z]/.test(buf[0].trim())) firstIsPlainParagraph = true;
    out.push('<p>' + html + '</p>'); blocks++;
  }
  return { html: out.join('\n'), firstIsPlainParagraph };
}

const CSS = `
:root{--ink:#1c1a17;--soft:#5d574d;--gold:#8a6a1f;--gold-line:#b8923a;--paper:#fffdf8;--desk:#efe9da}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--desk);color:var(--ink);font-family:'Cardo','EB Garamond','Noto Serif','Noto Serif Hebrew','Times New Roman',Georgia,serif;font-size:11pt;line-height:1.55}
.tools{position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;justify-content:center;padding:8px;background:#2b2417;color:#f3e7c9;font:13px/1.3 system-ui,sans-serif}
.tools button{background:#c9963a;color:#2b2417;border:0;border-radius:7px;padding:7px 14px;font-weight:700;font-size:13px;cursor:pointer}
.sheet{width:210mm;max-width:100%;margin:14px auto;padding:22mm 20mm 24mm;background:var(--paper);box-shadow:0 2px 18px rgba(60,45,10,.18)}
.mast{text-align:center;margin:0 0 9mm;break-inside:avoid}
.brand{font-family:'Cormorant Garamond','Cardo',serif;font-size:8.5pt;letter-spacing:.42em;text-transform:uppercase;color:var(--gold);margin:0 0 3mm}
.rule{height:3px;border-top:1.2pt solid var(--gold-line);border-bottom:.5pt solid var(--gold-line);margin:0 auto 5mm;width:100%}
.mast h1{font-family:'Cormorant Garamond','Cardo',serif;font-weight:700;font-size:25pt;line-height:1.15;margin:0 0 2.5mm;letter-spacing:.01em;border:0;padding:0;text-align:center;text-transform:none}
.course{font-size:10.5pt;font-style:italic;color:var(--soft);margin:0}
.dia{display:flex;align-items:center;gap:3mm;justify-content:center;margin:5mm 0 0;color:var(--gold-line)}
.dia:before,.dia:after{content:"";height:0;border-top:.6pt solid var(--gold-line);flex:1}
.dia i{display:block;width:2.2mm;height:2.2mm;background:var(--gold-line);transform:rotate(45deg)}
main{text-align:justify;hyphens:auto;-webkit-hyphens:auto;orphans:3;widows:3}
main p{margin:0 0 2.6mm;text-indent:0}
main p.drop::first-letter{font-family:'Cormorant Garamond','Cardo',serif;font-weight:700;float:left;font-size:34pt;line-height:.82;padding:1.2mm 1.6mm 0 0;color:var(--gold)}
h1,h2,h3,h4{font-family:'Cormorant Garamond','Cardo',serif;color:var(--ink);break-after:avoid;page-break-after:avoid;text-align:left;hyphens:none}
main h1{font-size:17pt;text-align:center;font-variant:small-caps;letter-spacing:.06em;margin:9mm 0 4mm;padding:2.2mm 0;border-top:.6pt solid var(--gold-line);border-bottom:.6pt solid var(--gold-line)}
main h2{font-size:14pt;margin:7mm 0 2.5mm;padding-left:3mm;border-left:2.4pt solid var(--gold-line)}
main h3{font-size:12pt;font-style:italic;margin:5mm 0 1.8mm;color:#3b362d}
main h4{font-size:10.5pt;font-variant:small-caps;letter-spacing:.08em;margin:4mm 0 1.5mm;color:var(--soft)}
ul,ol{margin:0 0 3mm;padding-left:6.5mm}
li{margin:0 0 1.1mm;padding-left:1mm}
ul>li::marker{color:var(--gold-line);content:"\\25C6  ";font-size:.7em}
ol>li::marker{color:var(--gold);font-weight:700}
li>ul,li>ol{margin:1mm 0 1mm}
blockquote{margin:3mm 3mm 3.5mm 4mm;padding:1mm 0 1mm 4mm;border-left:1.6pt solid var(--gold-line);font-style:italic;color:#3b362d;break-inside:avoid}
.orn{height:6mm;margin:3mm 0;text-align:center;position:relative;break-inside:avoid}
.orn:after{content:"\\25C6  \\25C6  \\25C6";color:var(--gold-line);font-size:7pt;letter-spacing:.3em}
table{width:100%;border-collapse:collapse;margin:3mm 0 4.5mm;font-size:10pt;line-height:1.4;border-top:1.2pt solid var(--ink);border-bottom:1.2pt solid var(--ink);text-align:left;hyphens:none}
thead{display:table-header-group}
th{font-family:'Cormorant Garamond','Cardo',serif;font-variant:small-caps;letter-spacing:.06em;font-size:10.5pt;padding:1.6mm 2.2mm;border-bottom:.6pt solid var(--ink);background:#f6efdc;color:#4a3a10}
td{padding:1.4mm 2.2mm;border-bottom:.3pt solid #cdbf9c;vertical-align:top}
tr{break-inside:avoid;page-break-inside:avoid}
tbody tr:last-child td{border-bottom:0}
pre,code{font-family:'DejaVu Sans Mono',Consolas,monospace;font-size:8.8pt}
pre{background:#f5f0e3;border:.4pt solid #d9ccaa;padding:2.5mm;white-space:pre-wrap;break-inside:avoid;text-align:left}
code{background:#f5f0e3;padding:0 .8mm}
a{color:var(--gold);text-decoration:underline;text-decoration-thickness:.4pt}
del{color:var(--soft)}
.ill{font-variant:small-caps;color:var(--soft);border-bottom:.6pt dotted var(--soft);letter-spacing:.03em}
.colophon{margin-top:12mm;text-align:center;break-inside:avoid;color:var(--soft);font-size:8.5pt}
.colophon .brand{margin:3mm 0 1mm;font-size:8pt}
@page{size:A4;margin:26mm 20mm 24mm;
  @top-left{content:"Lux Studiorum";font-family:'Cormorant Garamond',serif;font-size:8pt;letter-spacing:.3em;text-transform:uppercase;color:#8a6a1f;border-bottom:.5pt solid #b8923a;padding-bottom:2mm;vertical-align:bottom}
  @top-right{content:"__RUN__";font-family:'Cormorant Garamond',serif;font-size:8.5pt;font-style:italic;color:#5d574d;border-bottom:.5pt solid #b8923a;padding-bottom:2mm;vertical-align:bottom}
  @bottom-center{content:"\\2014  " counter(page) " / " counter(pages) "  \\2014";font-family:'Cormorant Garamond',serif;font-size:9pt;color:#5d574d;letter-spacing:.12em}
}
@page:first{@top-left{content:none;border:0}@top-right{content:none;border:0}}
@media print{
  body{background:#fff}
  .tools{display:none}
  .sheet{width:auto;margin:0;padding:0;box-shadow:none;background:#fff}
}
`;

// Text for a CSS string: backslashes, quotes and line breaks escaped, and no </style> can sneak in.
const cssString = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n<>]/g, ' ');

export function buildFolioHtml(i: FolioInput): string {
  const body = markdownToFolioBody(i.text || '');
  let html = body.html;
  if (body.firstIsPlainParagraph) html = html.replace('<p>', '<p class="drop">');
  const title = i.title || 'Study material';
  const run = (i.course || title).slice(0, 70);
  const printNow = i.asPdf
    ? '<script>window.addEventListener("load",function(){var go=function(){setTimeout(function(){window.print()},350)};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go)}else{go()}});<\/script>'
    : '';
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<title>' + esc(title) + '</title>\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500&family=Noto+Serif+Hebrew:wght@400;700&display=swap" rel="stylesheet"/>\n'
    + '<style>' + CSS.replace('__RUN__', cssString(run)) + '</style>\n</head>\n<body>\n'
    + '<div class="tools"><span>A4 print layout</span><button onclick="window.print()">Print / Save as PDF</button></div>\n'
    + '<div class="sheet">\n'
    + '<header class="mast"><p class="brand">Lux &#9670; Studiorum</p><div class="rule"></div><h1>' + esc(title) + '</h1>'
    + (i.course ? '<p class="course">' + esc(i.course) + '</p>' : '')
    + '<div class="dia"><i></i></div></header>\n<main>\n' + html + '\n</main>\n'
    + '<footer class="colophon"><div class="dia"><i></i></div><p class="brand">Lux &#9670; Studiorum</p><p>' + esc(i.course ? i.course + ' · ' : '') + esc(i.dateLabel) + '</p></footer>\n</div>\n' + printNow + '\n</body>\n</html>';
}
