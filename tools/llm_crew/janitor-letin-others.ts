// A janitor at a locked door whose caller's word brings nobody writes in turn to the caller's
// workmates and then their head, once each, and never twice to one person for that door
// (LOGB-06). No model is called: this is all decided in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-letin-others.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const marisol = { name: 'Marisol Burris', job: 'Cargo Technician' };
const jayden = { name: 'Jayden Phillips', job: 'Cargo Technician' };
const qm = { name: 'Quinn Marsh', job: 'Quartermaster' };
const CALL =
  'There is a mess in the Mining Office: pool of oil. Could you come and clean it up, please? Come to the Cargo Lobby and I will let you in.';

function atTheDoor() {
  const b: any = janitor('mop');
  b.stowed = [];
  b.hasPda = true;
  b.pdaPeople = [marisol, jayden, qm];
  know(b, ['Mining Office', 'Cargo Bay']);
  at(b, 3000, 'Central Primary Hallway', []);
  JANITOR.readsMessage(b, marisol.name, CALL, 3000, marisol.job);
  syncTasks(b);
  const task = b.tasks.find((t: any) => t.kind === 'clean' && t.place === 'Mining Office');
  at(b, 3010, 'Cargo Lobby', []);
  b.atDoorOf = 'Mining Office';
  return { b, task };
}
const step = (b: any, task: any) => JANITOR.plan(b, task) as any;
const act = (b: any, task: any, plan: any) =>
  JANITOR.afterActing(b, plan.act, task, true);

{
  const { b, task } = atTheDoor();
  let plan = step(b, task);
  add('first it knocks', plan?.act?.tool, 'knock');
  act(b, task, plan);
  plan = step(b, task);
  add('then writes to the caller', [plan?.act?.tool, plan?.act?.person], ['message', marisol.name]);
  act(b, task, plan);
  plan = step(b, task);
  add('then waits', [plan?.ready, plan?.wait], [false, true]);
  at(b, 3010 + 700, 'Cargo Lobby', []);
  syncTasks(b);
  add('nobody came: not given up while there is someone left to ask', task.state, 'open');
  plan = step(b, task);
  add('writes to the other technician', [plan?.act?.tool, plan?.act?.person], ['message', jayden.name]);
  act(b, task, plan);
  at(b, 3010 + 1400, 'Cargo Lobby', []);
  syncTasks(b);
  plan = step(b, task);
  add('then to the head of their department', [plan?.act?.tool, plan?.act?.person], ['message', qm.name]);
  act(b, task, plan);
  at(b, 3010 + 2100, 'Cargo Lobby', []);
  syncTasks(b);
  add('everyone written to and nobody came: given up', task.state, 'blocked');
  // A cargo worker turns up: the asking starts again, with a knock and nobody written to twice.
  at(b, 3010 + 2800, 'Cargo Lobby', []);
  JANITOR.meets(b, jayden.name, jayden.job);
  plan = step(b, task);
  add('asking again: it knocks', plan?.act?.tool, 'knock');
  act(b, task, plan);
  plan = step(b, task);
  add('and writes to nobody again', plan?.act?.tool ?? null, null);
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
