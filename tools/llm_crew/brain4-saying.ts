// A line its work called for, once said word for word, is no step that failed (ARR-01, the
// driver half: sayingCounted in CrewBrain/brain.ts). The driver's count for it starts afresh, so
// an arrest line said again after each rest is held back no longer each time. The hold already
// set stands. No model is called.
//
//   bun run brain4-saying.ts
const { ROOT, makeBrain } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const LINE = 'Pun Pun, you are under arrest, for theft. Stand still.';
{
  const b: any = makeBrain('Hale Stone', 'Security Officer');
  const until = Date.now() + 60000;
  b.failures.set(`3:say:${LINE}`, { count: 3, until });
  b.failures.set('3:say:Pun Pun, stop.', { count: 2, until });
  b.failures.set('3:{"tool":"arrest","person":"p9"}', { count: 2, until });
  B.sayingCounted(b, LINE);
  add('ARR-01: the line said: its count starts afresh', b.failures.get(`3:say:${LINE}`)?.count, 0);
  add('ARR-01: the hold already set stands (not said twice in a breath)', b.failures.get(`3:say:${LINE}`)?.until, until);
  add('ARR-01: another line is left as it was', b.failures.get('3:say:Pun Pun, stop.')?.count, 2);
  add('ARR-01: a step that is not a line is left as it was', b.failures.get('3:{"tool":"arrest","person":"p9"}')?.count, 2);
  B.sayingCounted(b, 'A line never held back.');
  add('ARR-01: a line with no record makes none', b.failures.size, 3);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
B.stopSession();
process.exit(failed ? 1 : 0);
