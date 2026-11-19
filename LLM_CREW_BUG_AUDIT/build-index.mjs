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
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings));
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
function table(rows) {
  const out = ['| Id | What is wrong | Proposed change | Effort | Status | Where |', '| --- | --- | --- | --- | --- | --- |'];
  for (const row of rows) {
    out.push(
      `| [${row.id}](findings/${row.file}) | ${cell(row.title)} | ${cell(row.fix)} | ${row.effort} | ${row.status}${row.status === 'found' && row.confidence ? ` (${row.confidence})` : ''} | \`${firstPlace(row.files)}\` |`,
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
  const lines = ['| Id | What is missing | Proposed change | Matters | Effort | Status | Where |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push(`| [${row.id}](findings/${row.file}) | ${cell(row.title)} | ${cell(row.fix)} | ${row.severity} | ${row.effort} | ${row.status} | \`${firstPlace(row.files)}\` |`);
  }
  out.push(lines.join('\n'));
} else {
  out.push('None.');
}
out.push('');
out.push(`## Closed: fixed, refuted or duplicate (${closed.length})`);
out.push('');
if (closed.length) {
  out.push('| Id | Title | Status |');
  out.push('| --- | --- | --- |');
  for (const row of closed.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
    out.push(`| [${row.id}](findings/${row.file}) | ${cell(row.title)} | ${row.status} |`);
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
