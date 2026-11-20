// A janitor told of a mess in a room, seeing none from where it stands, walks into the middle of
// the room to look before it says anything, and then says it found none rather than that the
// mess is cleaned up (DESK-08, and MEM-07's closing rule). No model is called: this is all decided
// in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-lookround.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { addTask, syncTasks, wordOwed } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const victor = { handle: 'p9', name: 'Victor Vance', job: 'Cargo Technician' };

function toldOfBay() {
  const b: any = janitor('mop');
  b.stowed = [];
  b.messPlaces = [];
  b.workablePlaces = [];
  b.cleanableMesses = [];
  b.beyondKinds = [];
  know(b, ['Cargo Bay']);
  at(b, 3000, 'Cargo Bay', [victor]);
  const task = addTask(b, {
    kind: 'clean',
    place: 'Cargo Bay',
    urgency: 'asked',
    source: 'told',
    askedBy: victor.name,
  });
  return { b, task };
}

{
  const { b, task } = toldOfBay();
  at(b, 3600, 'Cargo Bay', [victor]);
  b.messPlaces = [];
  syncTasks(b);
  add('a minute in the room, not looked round: still open', task.state, 'open');
  add('and nobody owed word', wordOwed(b).length, 0);
  const plan: any = JANITOR.plan(b, task);
  add('it walks to the middle of the room', plan?.act, { tool: 'go_to', place: 'Cargo Bay', middle: true });
  JANITOR.afterActing(b, plan.act, task, true, false, { ok: true });
  const waiting: any = JANITOR.plan(b, task);
  add('there, it looks: no mess in sight', [waiting?.ready, waiting?.step], [false, 'There is no mess in sight here.']);
  at(b, 3700, 'Cargo Bay', [victor]);
  b.messPlaces = [];
  syncTasks(b);
  add('looked round and none: done', task.state, 'done');
  add('and it says it found none', JANITOR.sayDone(task), 'I found no mess in the Cargo Bay');
}
{
  const { b, task } = toldOfBay();
  task.cleanedSome = true;
  at(b, 3100, 'Cargo Bay', [victor]);
  b.messPlaces = [];
  syncTasks(b);
  add('cleaned some, nothing left in sight: done as before', task.state, 'done');
  add('and says it is cleaned up', JANITOR.sayDone(task), 'the mess in the Cargo Bay is cleaned up');
}
{
  const { b, task } = toldOfBay();
  const plan: any = JANITOR.plan(b, task);
  JANITOR.afterActing(b, plan.act, task, true, false, { ok: true });
  // In the middle it sees the oil, and remembers it: the room is messy and workable.
  b.messPlaces = ['Cargo Bay'];
  b.workablePlaces = ['Cargo Bay'];
  b.cleanableMesses = ['pool of oil'];
  at(b, 3100, 'Cargo Bay', [victor]);
  b.messPlaces = ['Cargo Bay'];
  b.workablePlaces = ['Cargo Bay'];
  b.cleanableMesses = ['pool of oil'];
  syncTasks(b);
  const next: any = JANITOR.plan(b, task);
  add('sees the mess from the middle: cleans it', [task.state, next?.act?.tool], ['open', 'clean']);
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
