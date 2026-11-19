// A remark the NPC may make of its own accord does not hold its body still (ASYNC-07, driver part):
// drive's test of whether it is talking leaves out a queue that is only for a remark, and the
// model being asked for one (CrewBrain/driver.ts, drive). No model is called.
//
//   bun run driver2-remark.ts
const { ROOT, janitor } = await import('./fixtures');
const { drive, isWalk } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
/** A janitor in a hallway with somewhere to go, nobody having spoken to it. */
const ready = (more: any) => {
  const b: any = janitor();
  b.id = `remark${++ids}`;
  b.pendingSpeakers = new Set();
  b.lastSpokenToAt = 0;
  b.lastSayAt = 0;
  b.driveAfter = 0;
  Object.assign(b, more);
  return b;
};
const sent = (b: any) => {
  const issued: string[] = [];
  drive(b, (act: any) => { issued.push(act.tool); return act.tool; }, () => {});
  return issued;
};

const free = sent(ready({}));
add('nothing to say: it sets off', free.length > 0, true);
const leaving = free[0];
add('queued only for a remark of its own: it sets off all the same', sent(ready({ wake: true, remarkDue: true })), free);
add('the model asked for a remark only: it sets off all the same', sent(ready({ status: 'thinking', remarking: true })), free);
add('someone waiting on an answer: it holds still', sent(ready({ wake: true, remarkDue: true, pendingSpeakers: new Set(['p1']) })), []);
add('a line it has to say: it holds still', sent(ready({ wake: true, remarkDue: true, mustSay: 'The bar is clean.' })), []);
add('the model asked for an answer: it holds still', sent(ready({ status: 'thinking', remarking: false })), []);
add('(the step it takes is one that leaves)', isWalk(leaving), true);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
