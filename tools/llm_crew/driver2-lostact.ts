// A body still working out its way is not taken to have lost its step (LIFE-03, window case): the
// server now sends walking true, and doing "working out the way", while a tool tests routes. drive
// (CrewBrain/driver.ts) then sends nothing and does not count the step as failed after
// LOST_ACT_MS. No model is called; the server side is fake state here.
//
//   bun run driver2-lostact.ts
const { ROOT, janitor } = await import('./fixtures');
const { drive } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
const sentOff = (more: any) => {
  const b: any = janitor();
  b.id = `lostact${++ids}`;
  b.pendingSpeakers = new Set();
  b.driveAfter = 0;
  // Sent to explore twenty seconds ago, and nothing heard of it since.
  b.lastAct = { key: 'explore', tool: 'explore', at: Date.now() - 20_000, act: { tool: 'explore' } };
  Object.assign(b, more);
  const issued: string[] = [];
  const step = drive(b, (act: any) => { issued.push(act.tool); return act.tool; }, () => {});
  return { step, issued, lastAct: b.lastAct?.tool ?? null, failed: b.failures.has('explore') };
};

{
  const got = sentOff({ walking: true, doing: 'working out the way' });
  add('working out the way, walking: nothing sent', [got.step, got.issued], [null, []]);
  add('and the step is not counted as lost', [got.lastAct, got.failed], ['explore', false]);
}
{
  const got = sentOff({ walking: false, doing: null });
  add('(with nothing to say it is busy, the step is counted as lost, as before)', got.failed, true);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
