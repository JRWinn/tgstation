// What a janitor called to a locked room has done to be let in, and that a new call starts with a
// knock (DESK-02). No model is called: this is all decided in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-letin.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');
const { syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const victor = { handle: 'p9', name: 'Victor Vance', job: 'Cargo Technician' };
const CALL = 'There is a mess in the Cargo Bay: pool of oil. Could you come and clean it up, please? Come to the Cargo Lobby and I will let you in.';
const bayTask = (b: any) => b.tasks.find((task: any) => task.kind === 'clean' && task.place === 'Cargo Bay' && task.state !== 'done');

// A call, a knock and a message at the door, then let in and the mess cleaned.
function calledOnce() {
  const b: any = janitor('mop');
  b.stowed = [];
  know(b, ['Cargo Bay']);
  at(b, 3000, 'Central Primary Hallway', [victor]);
  JANITOR.readsMessage(b, victor.name, CALL, 3000, victor.job);
  syncTasks(b);
  const task = bayTask(b);
  at(b, 3010, 'Cargo Lobby', [victor]);
  JANITOR.afterActing(b, { tool: 'knock' }, task, true);
  JANITOR.afterActing(b, { tool: 'message' }, task, true);
  return { b, task };
}
{
  const { b } = calledOnce();
  add('a call knocked at keeps what it asked', Object.keys(b.letInAsks), ['Cargo Bay']);
}
{
  const { b, task } = calledOnce();
  at(b, 3100, 'Cargo Bay', [victor]);
  task.state = 'done';
  at(b, 3200, 'Cargo Lobby', []);
  add('let in and done: nothing kept', Object.keys(b.letInAsks), []);
  at(b, 12200, 'Central Primary Hallway', []);
  JANITOR.readsMessage(b, victor.name, CALL, 12200, victor.job);
  syncTasks(b);
  const again = bayTask(b);
  add('the same call later is not given up on', again ? [again.state, again.blockedBy ?? null] : null, ['open', null]);
}
{
  const { b } = calledOnce();
  at(b, 3100, 'Cargo Bay', [victor]);
  add('standing in the room: let through that door', Object.keys(b.letInAsks), []);
}
{
  const { b } = calledOnce();
  at(b, 3010 + 700, 'Cargo Lobby', []);
  const task = bayTask(b);
  add('knocked, messaged and nobody came: still given up', task?.state, 'blocked');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
