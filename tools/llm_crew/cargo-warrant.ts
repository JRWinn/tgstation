// Security let into a locked room on a warrant are left to serve it (ARR-02, step 2). The keeper
// notes at the door that they came on a warrant, and on whom; the welcome then lasts five minutes,
// or until the one the warrant is on is seen in cuffs or gone, in place of the minute a janitor
// with no mess left is given. No model is called and no station is simulated (CrewBrain/jobs/cargo.ts,
// jobs/guarding.ts).
//
//   bun run cargo-warrant.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { syncGuarding } = await import(ROOT + 'jobs/guarding');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
const tech = () => {
  const b: any = makeBrain('Jaden Prechtl', 'Cargo Technician');
  b.id = `tech${++ids}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.closedRooms = ['Quartermaster\'s Office'];
  b.now = 10_000;
  return b;
};
const NOVA = { handle: 'p5', name: 'Nova Hale', job: 'Security Officer' };
const PUN = { handle: 'p6', name: 'Pun Pun', job: '' };
const TOLLY = { handle: 'p3', name: 'Tolly Field', job: 'Janitor' };
const ASK = 'Jaden, I am at the Cargo Lobby door of the Cargo Bay with a warrant for Pun Pun. Could you let me in, please?';

/** Asks by PDA, is let in, and is then seen standing in the post with whoever else is given. */
function letIn(b: any, who: any, text: string) {
  b.pdaPeople = [{ name: who.name, job: who.job }];
  CARGO.readsMessage(b, who.name, text, b.now, who.job);
  CARGO.syncTasks(b);
  const task = b.tasks.find((it: any) => it.kind === 'door' && it.item === who.name && it.state !== 'done');
  if (!task) {
    return false;
  }
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false);
  return true;
}
/** Where things stand with them after so many deciseconds in the post. */
function after(b: any, who: any, ds: number, others: any[] = []) {
  const start = b.now;
  for (let t = 0; t <= ds; t += 50) {
    b.now = start + t;
    b.peopleInView = [{ ...who, place: 'Cargo Bay', distance: 3, in_post: 1 }, ...others];
    syncGuarding(b);
  }
  return b.strangers[who.name]?.verdict ?? null;
}

{
  const b = tech();
  add('an officer asking with a warrant is let in', letIn(b, NOVA, ASK), true);
  add('and is welcome after a minute and more', after(b, NOVA, 900), 'stay');
  add('and still after four minutes', after(b, NOVA, 1500), 'stay');
  add('but five minutes on, and a minute to go, it is seen out', after(b, NOVA, 1300), 'go');
}
{
  const b = tech();
  letIn(b, NOVA, ASK);
  after(b, NOVA, 300, [{ ...PUN, place: 'Cargo Bay', distance: 2, in_post: 1 }]);
  add('the one the warrant is on seen in cuffs: the welcome is over, a minute to go', after(b, NOVA, 700, [{ ...PUN, place: 'Cargo Bay', distance: 2, in_post: 1, cuffed: 1 }]), 'go');
}
{
  const b = tech();
  letIn(b, NOVA, ASK);
  add('the one the warrant is on seen in the Quartermaster\'s Office is still there to serve', after(b, NOVA, 900, [{ ...PUN, place: 'Quartermaster\'s Office', distance: 4 }]), 'stay');
  add('seen gone out to the hallway, the welcome is over', after(b, NOVA, 700, [{ ...PUN, place: 'Central Primary Hallway', distance: 8 }]), 'go');
}
{
  // The workmate who did not open the door goes by the department's word, as for a janitor let in.
  const b = tech();
  letIn(b, NOVA, ASK);
  const mate: any = tech();
  mate.name = 'Osbert Mortland';
  add('a workmate who did not open the door leaves the officer to it too', after(mate, NOVA, 900), 'stay');
}
{
  const b = tech();
  letIn(b, NOVA, 'Jaden, could you let me into the Cargo Bay, please?');
  add('security let in naming no warrant are still taken to have come on one', after(b, NOVA, 900), 'stay');
}
{
  // A janitor let in with nothing to clean is seen out after a minute, as before.
  const b = tech();
  b.areaMesses = { 'Cargo Bay': 1 };
  b.janitorCalls = { 'Cargo Bay': { to: TOLLY.name, at: b.now, count: 1 } };
  CARGO.afterActing(b, { tool: 'message', person: TOLLY.name }, { kind: 'tidy', place: 'Cargo Bay', state: 'active' }, true, false);
  b.areaMesses = {};
  after(b, TOLLY, 0);
  add('a janitor whose mess is gone is still seen out after a minute', after(b, TOLLY, 700), 'go');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
