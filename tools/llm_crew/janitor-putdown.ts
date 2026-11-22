// A janitor that put its mop down where the gear is kept, to have a hand for a rag, goes back for
// it once the scrubbing is done, and does not ask its head for something better than a rag
// (DESK-09). No model is called: this is all decided in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-putdown.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { addTask, syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

function scrubbedWithRag() {
  const b: any = janitor('mop');
  b.stowed = [];
  b.supplyPlaces = ['Custodial Closet'];
  b.supplyPlacesSearched = new Set(['Custodial Closet']);
  b.locatorUsed = true;
  b.hasLocator = true;
  b.messPlaces = [];
  b.workablePlaces = [];
  b.beyondKinds = [];
  at(b, 3000, 'Custodial Closet', []);
  const task = addTask(b, {
    kind: 'clean',
    place: 'Bitrunning Den',
    urgency: 'asked',
    source: 'told',
    askedBy: 'Tamika Barrett',
  });
  task.wantsScrub = true;
  JANITOR.afterActing(b, { tool: 'put_down', item: 'mop' }, task, true);
  // Takes the rag up, goes and scrubs, and the task is done.
  b.holding = ['damp rag'];
  b.cleaningTool = 'damp rag';
  b.poorTool = true;
  task.state = 'done';
  b.tasks = b.tasks.filter((t: any) => t !== task);
  at(b, 6000, 'Bitrunning Den', []);
  return b;
}
const supplies = (b: any) => b.tasks.find((t: any) => t.kind === 'supplies');

{
  const b = scrubbedWithRag();
  const plan: any = JANITOR.plan(b, supplies(b));
  add('done scrubbing: back for its mop', plan?.act, { tool: 'go_to', place: 'Custodial Closet' });
  add('it is short of nothing to tell its head of', JANITOR.needs(b), null);
  add('getting it is asked, not routine', supplies(b)?.urgency, 'asked');
}
{
  const b = scrubbedWithRag();
  at(b, 6100, 'Custodial Closet', []);
  b.thingsInView = [{ kind: 'item', name: 'mop' }];
  const plan: any = JANITOR.plan(b, supplies(b));
  add('in the closet with the mop in view: picks it up', plan?.act, { tool: 'pick_up', item: 'mop' });
}
{
  const b = scrubbedWithRag();
  b.thingsInView = [];
  at(b, 6100, 'Custodial Closet', []);
  at(b, 6200, 'Custodial Closet', []);
  add('in the closet a while and the mop gone: forgotten, asks its head', JANITOR.needs(b), 'something better than a rag to clean with');
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
