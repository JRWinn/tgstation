// KNB-08, the owner's answer A: a janitor's call closes when what is left will not come off with
// what it holds, until it holds a different tool, as a call it turned down for want of soap or a
// rag already is. No model is called: this is all decided in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-closed.ts
const { ROOT, at, janitor, know, zim } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { syncTasks, takeToldWork } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const tamika = { handle: 'p9', name: 'Tamika Barrett', job: 'Cargo Technician' };
const CALL =
  'There is a mess in the Bar: pool of oil. Could you come and clean it up, please?';
const barTasks = (b: any) =>
  b.tasks.filter(
    (task: any) =>
      task.kind === 'clean' && task.place === 'Bar' && task.state !== 'done',
  );

/** A janitor with a mop, called to the Bar, that has cleaned there and left what will not come off. */
function doneWhatItCan() {
  const b: any = janitor('wet mop');
  b.hasPda = true;
  b.stowed = [];
  know(b, ['Bar']);
  JANITOR.readsMessage(b, tamika.name, CALL, 3000, tamika.job);
  syncTasks(b);
  const task = barTasks(b)[0];
  if (task) task.cleanedSome = true;
  // In the Bar, the rest is beyond the mop.
  b.messPlaces = ['Bar'];
  b.workablePlaces = [];
  b.beyondKinds = [];
  at(b, 3100, 'Bar', [zim]);
  return b;
}

{
  const b = doneWhatItCan();
  add('in the room: word sent once', b.toTell.map((t: any) => t.line), [
    'I have done what I can in the Bar. The rest would not come off with my wet mop.',
  ]);
  add('and the call is dropped', barTasks(b).filter((t: any) => t.source === 'told').length, 0);
}
{
  const b = doneWhatItCan();
  b.toTell = [];
  at(b, 3200, 'Central Primary Hallway', [zim]);
  // The same caller calls again: closed, told, not gone to.
  JANITOR.readsMessage(b, tamika.name, CALL, 3200, tamika.job);
  syncTasks(b);
  add('called again at once: not taken', barTasks(b).filter((t: any) => t.source === 'told').length, 0);
  add('and not told twice inside a minute', b.toTell.length, 0);
  at(b, 3900, 'Central Primary Hallway', [zim]);
  JANITOR.readsMessage(b, tamika.name, CALL, 3900, tamika.job);
  syncTasks(b);
  add('called again a minute on: told again', b.toTell.map((t: any) => t.line), [
    'I have done what I can in the Bar. The rest would not come off with my wet mop.',
  ]);
  add('and still not taken', barTasks(b).filter((t: any) => t.source === 'told').length, 0);
}
{
  const b = doneWhatItCan();
  b.toTell = [];
  at(b, 3200, 'Central Primary Hallway', [zim]);
  // Someone else sends it there: the mess is the same, and so is the mop.
  takeToldWork(b, 'a mess that needs cleaning', 'Bar', zim.name, true);
  syncTasks(b);
  add('someone else sends it: told, not taken', [b.toTell.map((t: any) => t.to), barTasks(b).filter((t: any) => t.source === 'told').length], [[zim.name], 0]);
}
{
  const b = doneWhatItCan();
  at(b, 3200, 'Central Primary Hallway', [zim]);
  // It now holds a different tool.
  b.cleaningTool = 'space cleaner';
  b.holding = ['space cleaner'];
  JANITOR.readsMessage(b, tamika.name, CALL, 3200, tamika.job);
  syncTasks(b);
  add('with a different tool: taken', barTasks(b).filter((t: any) => t.source === 'told').length, 1);
}
{
  const b = doneWhatItCan();
  at(b, 3200, 'Central Primary Hallway', [zim]);
  // It has a rag in its bag to take up.
  b.stowed = ['damp rag'];
  JANITOR.readsMessage(b, tamika.name, CALL, 3200, tamika.job);
  syncTasks(b);
  add('with a rag about it: taken', barTasks(b).filter((t: any) => t.source === 'told').length, 1);
}
{
  const b = doneWhatItCan();
  at(b, 3200, 'Central Primary Hallway', [zim]);
  // The mess it left there is gone from what it remembers: a new call is a new mess.
  b.messPlaces = [];
  JANITOR.readsMessage(b, tamika.name, CALL, 3200, tamika.job);
  syncTasks(b);
  add('the mess there forgotten or gone: taken', barTasks(b).filter((t: any) => t.source === 'told').length, 1);
}
{
  const b = doneWhatItCan();
  at(b, 3200, 'Central Primary Hallway', [zim]);
  // It knows of something there now that its mop will shift.
  b.workablePlaces = ['Bar'];
  JANITOR.readsMessage(b, tamika.name, CALL, 3200, tamika.job);
  syncTasks(b);
  add('something there it can shift: taken', barTasks(b).filter((t: any) => t.source === 'told').length, 1);
}
{
  // What it could not get to is not closed: it is tried again later.
  const b: any = janitor('wet mop');
  b.hasPda = true;
  b.stowed = [];
  know(b, ['Bar']);
  JANITOR.readsMessage(b, tamika.name, CALL, 3000, tamika.job);
  syncTasks(b);
  b.messPlaces = ['Bar'];
  b.workablePlaces = ['Bar'];
  at(b, 3100, 'Bar', [zim]);
  at(b, 3200, 'Central Primary Hallway', [zim]);
  JANITOR.readsMessage(b, tamika.name, CALL, 3200, tamika.job);
  syncTasks(b);
  add('a room with work it can do: never closed', barTasks(b).filter((t: any) => t.source === 'told').length, 1);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`,
  );
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
