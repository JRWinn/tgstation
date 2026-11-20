// A janitor called to a room whose clean left only messes it could not get to says so, and does
// not put it down to its tool (HAND-02). No model is called: this is all decided in code
// (CrewBrain/jobs/janitor.ts). The server's `unreached` detail comes from crew_npc_hands.dm.
//
//   bun run janitor-unreached.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { addTask, syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const zim = { handle: 'p1', name: 'Zim Fire', job: 'Head of Personnel' };

function called(unreached: boolean) {
  const b: any = janitor('mop');
  b.stowed = [];
  b.hasPda = true;
  know(b, ['Bar']);
  at(b, 3000, 'Bar', [zim]);
  const task = addTask(b, {
    kind: 'clean',
    place: 'Bar',
    urgency: 'asked',
    source: 'told',
    askedBy: zim.name,
  });
  JANITOR.afterActing(b, { tool: 'clean' }, task, true, false, {
    ok: true,
    place: 'Bar',
    unreached,
  });
  b.messPlaces = ['Bar'];
  b.workablePlaces = [];
  b.beyondKinds = [];
  syncTasks(b);
  return b;
}
{
  const b = called(true);
  add(
    'left only what it could not get to: says so',
    b.toTell.map((tell: any) => tell.line),
    ['I have done what I can in the Bar. I could not get to the rest.'],
  );
}
{
  const b = called(false);
  add(
    'left what the mop will not shift: as before',
    b.toTell.map((tell: any) => tell.line),
    ['I have done what I can in the Bar. The rest would not come off with my mop.'],
  );
}
{
  const b: any = janitor('mop');
  b.stowed = [];
  know(b, ['Bar']);
  at(b, 3000, 'Bar', []);
  const task = addTask(b, { kind: 'clean', place: 'Bar', urgency: 'routine', source: 'noticed' });
  JANITOR.afterActing(b, { tool: 'clean' }, task, true, false, { ok: true, place: 'Bar', unreached: true });
  b.messPlaces = ['Bar'];
  b.workablePlaces = [];
  b.beyondKinds = [];
  syncTasks(b);
  const open = b.tasks.find((t: any) => t.kind === 'clean' && t.place === 'Bar');
  add('its own task: waits to try again, not beyond the mop', [open?.blockedOn ?? null, open?.blockedWith ?? null], ['what is left there you could not get to, and you will try again later', null]);
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
