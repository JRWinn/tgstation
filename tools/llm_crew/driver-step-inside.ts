// Stepping clear of a doorway to wait (DRV-01), case by case. No model is called: this is all
// decided in code (CrewBrain/driver.ts), so it can be checked in a second.
//
//   bun run driver-step-inside.ts
const { ROOT, at, janitor, zim } = await import('./fixtures');
const { drive } = await import(ROOT + 'driver');
const { syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

/** A janitor at Zim's staff meeting in the Bar, report given, standing in the doorway. */
function waiting(id: string) {
  const b: any = janitor();
  // The count of tries is kept by id, outside the brain: each case is a body of its own.
  b.id = id;
  at(b, 3000, 'Bar', [zim]);
  b.summons = {
    by: zim.name, room: 'Bar', at: 2000, answered: true, arrivedAt: 2500, toldArrivedAt: 2500,
    wentIn: true, walkUps: 1, walkedUpAt: 2600, headSeenAt: 3000, askedAt: 2800, said: true, tries: 0, wording: 0,
  };
  b.inDoorway = true;
  syncTasks(b);
  return b;
}
const speak = () => {};

// ---- DRV-01: the tries are counted when the step is sent, not each time it is asked about
{
  const b = waiting('first');
  const issued: string[] = [];
  const issue = (act: any) => { issued.push(act.tool); return act.tool; };
  b.driveAfter = Date.now() + 60000;
  for (let i = 0; i < 5; i++) drive(b, issue, speak);
  add('five updates during the breath after arriving: nothing sent yet', issued, []);
  b.driveAfter = 0;
  const step = drive(b, issue, speak);
  add('the breath over: it steps clear', step?.key, 'step-inside');
  add('one step_aside sent', issued, ['step_aside']);
  // Still in a doorway after stepping: a second try, and no third.
  for (let i = 0; i < 2; i++) {
    b.lastAct = null;
    b.walking = false;
    b.driveAfter = 0;
    b.failures.clear();
    drive(b, issue, speak);
  }
  add('still in a doorway: two tries in all in that room', issued, ['step_aside', 'step_aside']);
}
{
  const b = waiting('second');
  const issue = () => null;
  b.driveAfter = 0;
  for (let i = 0; i < 4; i++) { b.failures.clear(); drive(b, issue, speak); }
  const issued: string[] = [];
  b.failures.clear();
  drive(b, (act: any) => { issued.push(act.tool); return act.tool; }, speak);
  add('steps the server would not take are not counted as tries', issued, ['step_aside']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
