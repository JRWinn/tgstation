// Builds LLM_CREW_BUG_AUDIT/INDEX.md from the top block of every file in findings/.
//
// Run it from anywhere, with bun or node:
//   tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe LLM_CREW_BUG_AUDIT/build-index.mjs
//   node LLM_CREW_BUG_AUDIT/build-index.mjs
//
// Add --json to print the list as JSON on standard output instead of writing INDEX.md.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FINDINGS = join(HERE, 'findings');
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const EFFORTS = ['small', 'medium', 'large'];
const OPEN = ['found', 'confirmed', 'unsure'];

/** Reads the key: value lines between the first two --- lines. */
function readTop(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;
  const top = {};
  for (let at = 1; at < lines.length; at++) {
    const line = lines[at];
    if (line.trim() === '---') return top;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    top[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return null;
}

const files = existsSync(FINDINGS)
  ? readdirSync(FINDINGS).filter((name) => name.endsWith('.md')).sort()
  : [];
const findings = [];
const unreadable = [];
for (const name of files) {
  const top = readTop(readFileSync(join(FINDINGS, name), 'utf8'));
  if (!top || !top.id) {
    unreadable.push(name);
    continue;
  }
  findings.push({
    id: top.id,
    file: name,
    title: top.title ?? '(no title)',
    kind: (top.kind ?? 'bug').toLowerCase(),
    severity: SEVERITIES.includes((top.severity ?? '').toLowerCase()) ? top.severity.toLowerCase() : 'medium',
    effort: EFFORTS.includes((top.effort ?? '').toLowerCase()) ? top.effort.toLowerCase() : 'medium',
    confidence: (top.confidence ?? '').toLowerCase(),
    status: (top.status ?? 'found').toLowerCase(),
    area: (top.area ?? '').toLowerCase(),
    files: top.files ?? '',
    fix: top.fix ?? '',
    foundBy: top.found_by ?? '',
    checkedBy: top.checked_by ?? '',
    duplicateOf: top.duplicate_of ?? '',
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings));
  process.exit(0);
}

// One line a finding, for reading the whole list at once: id | kind/severity | status | area | where | title
// (add --with-fix for the proposed change after ||).
if (process.argv.includes('--brief')) {
  const withFix = process.argv.includes('--with-fix');
  for (const row of [...findings].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
    const where = row.files.split(',').map((place) => place.trim().replace(/^.*\//, '')).filter(Boolean).slice(0, 3).join(', ');
    console.log(`${row.id} | ${row.kind}/${row.severity} | ${row.status}${row.duplicateOf ? ` of ${row.duplicateOf}` : ''} | ${row.area} | ${where} | ${row.title}${withFix ? ` || ${row.fix}` : ''}`);
  }
  process.exit(0);
}

/** Easiest first, then the ones a second reviewer has confirmed, then by id. */
function inOrder(a, b) {
  return (
    EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort) ||
    (a.status === 'confirmed' ? 0 : 1) - (b.status === 'confirmed' ? 0 : 1) ||
    a.id.localeCompare(b.id, 'en', { numeric: true })
  );
}
const cell = (text) => String(text).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const firstPlace = (text) => cell(text.split(',')[0] ?? '').replace(/^.*\/(?=[^/]+$)/, '');
const statusCell = (row) => `${row.status}${row.status === 'found' && row.confidence ? ` (${row.confidence})` : ''}`;
const byCell = (row) => cell(`${row.foundBy || '?'}${row.checkedBy ? `, checked ${row.checkedBy}` : ''}`);
function table(rows) {
  const out = ['| Id | What is wrong | Proposed change | Effort | Status | Found by | Where |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of rows) {
    out.push(
      `| [${row.id}](findings/${row.file}) | ${cell(row.title)} | ${cell(row.fix)} | ${row.effort} | ${statusCell(row)} | ${byCell(row)} | \`${firstPlace(row.files)}\` |`,
    );
  }
  return out.join('\n');
}

const open = findings.filter((row) => OPEN.includes(row.status));
const bugs = open.filter((row) => row.kind !== 'gap');
const gaps = open.filter((row) => row.kind === 'gap');
const closed = findings.filter((row) => !OPEN.includes(row.status));
const count = (rows, status) => rows.filter((row) => row.status === status).length;

const out = [];
out.push('# Crew NPC bug audit: the list');
out.push('');
out.push('**This file is built by `build-index.mjs` from the files in `findings/`. Do not edit it by hand: change the finding and build it again.** Read `README.md` in this folder first.');
out.push('');
out.push(`${findings.length} findings in all: ${bugs.length} bugs and ${gaps.length} gaps still open, ${count(findings, 'fixed')} fixed, ${count(findings, 'refuted')} refuted, ${count(findings, 'duplicate')} duplicates.`);
out.push(`Of the open ones, ${count(open, 'confirmed')} were confirmed by a second reviewer, ${count(open, 'unsure')} could not be settled, and ${count(open, 'found')} have not been checked by anyone but their finder.`);
const models = [...new Set(findings.map((row) => row.foundBy || '?'))].sort();
out.push(`Found by: ${models.map((model) => `${model} ${findings.filter((row) => (row.foundBy || '?') === model).length}`).join(', ')}. The audit began on Claude Fable 5.2 and went on, after Fable's usage ran out, on Claude Opus 5.5.`);
out.push('');
out.push('Within each group the easiest fix comes first. "found (sure)" means the finder was sure and nobody has checked it since.');
out.push('');
out.push('| Severity | Open bugs | Confirmed | Not yet checked |');
out.push('| --- | --- | --- | --- |');
for (const severity of SEVERITIES) {
  const rows = bugs.filter((row) => row.severity === severity);
  out.push(`| ${severity} | ${rows.length} | ${count(rows, 'confirmed')} | ${count(rows, 'found')} |`);
}
out.push('');
for (const severity of SEVERITIES) {
  const rows = bugs.filter((row) => row.severity === severity).sort(inOrder);
  out.push(`## Bugs: ${severity} (${rows.length})`);
  out.push('');
  out.push(rows.length ? table(rows) : 'None.');
  out.push('');
}
out.push(`## Gaps: missing, half built, or never thought of (${gaps.length})`);
out.push('');
const gapOrder = (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || inOrder(a, b);
if (gaps.length) {
  const rows = gaps.sort(gapOrder);
  const lines = ['| Id | What is missing | Proposed change | Matters | Effort | Status | Found by | Where |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push(`| [${row.id}](findings/${row.file}) | ${cell(row.title)} | ${cell(row.fix)} | ${row.severity} | ${row.effort} | ${statusCell(row)} | ${byCell(row)} | \`${firstPlace(row.files)}\` |`);
  }
  out.push(lines.join('\n'));
} else {
  out.push('None.');
}
out.push('');
out.push(`## Closed: fixed, refuted or duplicate (${closed.length})`);
out.push('');
if (closed.length) {
  out.push('| Id | Title | Status | Found by |');
  out.push('| --- | --- | --- | --- |');
  for (const row of closed.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
    out.push(`| [${row.id}](findings/${row.file}) | ${cell(row.title)} | ${row.status}${row.duplicateOf ? ` of ${cell(row.duplicateOf)}` : ''} | ${byCell(row)} |`);
  }
} else {
  out.push('None.');
}
out.push('');
if (unreadable.length) {
  out.push('## Files this script could not read');
  out.push('');
  out.push('These have no top block, or no `id:` in it. Open each and mend it.');
  out.push('');
  for (const name of unreadable) out.push(`- \`findings/${name}\``);
  out.push('');
}
writeFileSync(join(HERE, 'INDEX.md'), out.join('\n'));
console.log(`INDEX.md written: ${findings.length} findings (${bugs.length} open bugs, ${gaps.length} open gaps, ${closed.length} closed)${unreadable.length ? `, ${unreadable.length} unreadable` : ''}.`);

// SUMMARY.md: the open bugs for the owner to look over. Most severe first; within each severity the
// easiest fix first; within that, confirmed before unsure before not yet checked. Gaps come after, apart.
const STATUS_RANK = { confirmed: 0, unsure: 1, found: 2 };
const CONFIDENCE_RANK = { sure: 0, likely: 1, guess: 2 };
const summaryOrder = (a, b) =>
  SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
  EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort) ||
  (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
  (CONFIDENCE_RANK[a.confidence] ?? 3) - (CONFIDENCE_RANK[b.confidence] ?? 3) ||
  a.id.localeCompare(b.id, 'en', { numeric: true });
const checkWord = (row) => (row.status === 'confirmed' ? 'confirmed' : row.status === 'unsure' ? 'unsure' : `not checked${row.confidence ? `, finder ${row.confidence}` : ''}`);
const plain = (text) => String(text).replace(/\s+/g, ' ').trim();
const effortWords = { small: 'Small fix (a few lines, one file)', medium: 'Medium fix (one part of the code)', large: 'Large fix (a design change, or both halves)' };
let number = 0;
function summaryList(rows, label) {
  const lines = [];
  for (const severity of SEVERITIES) {
    const ofSeverity = rows.filter((row) => row.severity === severity).sort(summaryOrder);
    if (!ofSeverity.length) continue;
    lines.push(`## ${label}: ${severity} (${ofSeverity.length})`, '');
    for (const effort of EFFORTS) {
      const ofEffort = ofSeverity.filter((row) => row.effort === effort);
      if (!ofEffort.length) continue;
      lines.push(`### ${effortWords[effort]}: ${ofEffort.length}`, '');
      for (const row of ofEffort) {
        number++;
        lines.push(`${number}. **[${row.id}](findings/${row.file})** (${checkWord(row)}, ${row.area}): ${plain(row.title)}`);
        lines.push(`   - Fix: ${plain(row.fix) || 'see the finding'}`);
      }
      lines.push('');
    }
  }
  return lines;
}
const sum = [];
const openBugs = bugs;
const openGaps = gaps;
sum.push('# Crew NPC bugs: the summary');
sum.push('');
sum.push('**Built by `build-index.mjs` from `findings/`; do not edit by hand.** Every open bug, most severe first, and within each severity the easiest fix first. Duplicates, refuted findings and fixed ones are left out. Each bug links to its finding, which has the code, a concrete case, the steps to fix it and how to test it.');
sum.push('');
sum.push('Beside each: **confirmed** means a second reviewer tried to prove it wrong and could not. **not checked** means only its finder has looked at it; "finder sure" or "likely" is how sure that finder was. **unsure** means the second reviewer could not settle it.');
sum.push('');
sum.push(`${openBugs.length} open bugs (${count(openBugs, 'confirmed')} confirmed), then ${openGaps.length} gaps. ${closed.length} findings are closed (duplicates, refuted or fixed) and not listed.`);
sum.push('');
sum.push('| Severity | Small fix | Medium fix | Large fix | All | Confirmed |');
sum.push('| --- | --- | --- | --- | --- | --- |');
for (const severity of SEVERITIES) {
  const rows = openBugs.filter((row) => row.severity === severity);
  sum.push(`| ${severity} | ${EFFORTS.map((effort) => rows.filter((row) => row.effort === effort).length).join(' | ')} | ${rows.length} | ${count(rows, 'confirmed')} |`);
}
sum.push('');
sum.push('Severity: **critical** stops a body, the whole crew or the window for the rest of the round; **high** makes a job fail or loop in a case most rounds will meet, breaks the no-cheats rule, or acts on the wrong person; **medium** is wrong in rarer cases, or noticeable while the work still gets done; **low** is wording, log noise, dead code or a misleading test.');
sum.push('');
sum.push(...summaryList(openBugs, 'Bugs'));
sum.push('---');
sum.push('');
sum.push('# Gaps: missing or half built, for you to decide');
sum.push('');
sum.push('Not faults in what is there, but things planned and not built, or never thought of. Most need your decision before anyone builds them. Same order: most important first, then the smallest piece of work.');
sum.push('');
sum.push(...summaryList(openGaps, 'Gaps'));
writeFileSync(join(HERE, 'SUMMARY.md'), sum.join('\n'));
console.log(`SUMMARY.md written: ${openBugs.length} bugs and ${openGaps.length} gaps, numbered 1 to ${number}.`);
