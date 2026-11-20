// A call the janitor's code turned down (it needs soap or a rag, and the janitor has neither)
// stays turned down when the model, or the words of the line, take it on again (LOGA-07). No
// model is called: this is all decided in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-declined.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { syncTasks, takeToldWork } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const tamika = { handle: 'p9', name: 'Tamika Barrett', job: 'Cargo Technician' };
const zim = { handle: 'p1', name: 'Zim Fire', job: 'Head of Personnel' };
const CALL =
  'There is a mess in the Bitrunning Den: cobweb. Reuben could not shift it: it needs scrubbing with soap or a rag. Could you come and clean it up if you have one, please? Come to its door and knock, and I will let you in.';
const denTasks = (b: any) =>
  b.tasks.filter(
    (task: any) =>
      task.kind === 'clean' &&
      task.place === 'Bitrunning Den' &&
      task.state !== 'done',
  );

function declined() {
  const b: any = janitor('space cleaner');
  b.stowed = [];
  know(b, ['Bitrunning Den']);
  at(b, 3000, 'Central Primary Hallway', [zim]);
  JANITOR.readsMessage(b, tamika.name, CALL, 3000, tamika.job);
  syncTasks(b);
  return b;
}

{
  const b = declined();
  add('the call is turned down: no task', denTasks(b).length, 0);
  add(
    'and the caller is told',
    b.toTell.map((tell: any) => tell.line),
    ['I have no soap or rag, so I cannot shift the mess in the Bitrunning Den.'],
  );
}
{
  const b = declined();
  // The model answers "work" for the same message.
  const task = takeToldWork(
    b,
    'a mess that needs cleaning',
    'Bitrunning Den',
    tamika.name,
  );
  const plan: any = task ? JANITOR.plan(b, task) : null;
  add('the model takes it on: not gone to', plan?.ready ?? null, false);
  syncTasks(b);
  add('and dropped at the next look at the list', denTasks(b).length, 0);
}
{
  const b = declined();
  // Its head tells it of the same room: that is not the call it turned down.
  takeToldWork(b, 'a mess that needs cleaning', 'Bitrunning Den', zim.name, true);
  syncTasks(b);
  add('someone else sends it there: taken', denTasks(b).length, 1);
}
{
  const b = declined();
  b.holding = ['space cleaner', 'damp rag'];
  takeToldWork(b, 'a mess that needs cleaning', 'Bitrunning Den', tamika.name);
  syncTasks(b);
  add('it has a rag now: taken', denTasks(b).length, 1);
}
{
  const b = declined();
  at(b, 3000 + 3100, 'Central Primary Hallway', [zim]);
  takeToldWork(b, 'a mess that needs cleaning', 'Bitrunning Den', tamika.name);
  syncTasks(b);
  add('five minutes on: a call to the room is taken again', denTasks(b).length, 1);
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
