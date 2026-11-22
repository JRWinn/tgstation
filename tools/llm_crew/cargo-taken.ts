// A held crate taken out of cargo in someone else's hands (SUP-17, the owner's answers 1A and 2A):
// it is taken, not lost; whoever ordered it is told who has it, once; taken by whoever it was for,
// it is collected and nobody is told; a release or a collect the server refuses because it has
// been taken is not tried again. No model is called (CrewBrain/jobs/cargo.ts tellTaken,
// afterActing; jobs/pickups.ts pickupsAfterActing).
//
//   bun run cargo-taken.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { pickupsAfterActing } = await import(ROOT + 'jobs/pickups');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let id = 0;
const tech = (held: any[]) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `taken-${id}`;
  b.post = `Cargo Bay ${id++}`;
  b.location = b.post;
  b.closedRooms = ['Warehouse'];
  b.now = 5000;
  b.hasPda = true;
  b.peopleInView = [];
  b.pdaPeople = [{ name: 'Hop Kins', job: 'Head of Personnel' }];
  b.heldCrates = held.map((crate) => ({ for: 'Hop Kins', what: 'Replacement Lights', out: false, takenBy: null, waited: 100, ...crate }));
  b.toTell = [];
  return b;
};
const told = (b: any) => b.toTell.map((t: any) => `${t.to}${t.byPda ? ' (PDA)' : ''}: ${t.line}`);

{
  const b = tech([{ number: 12, takenBy: 'Jan Mopp', place: 'Bar', takenAway: true }]);
  CARGO.syncTasks(b);
  add('taken away by someone else: whoever ordered it is told who has it', told(b), ['Hop Kins (PDA): Hop, Jan Mopp has taken crate #12.']);
  CARGO.syncTasks(b);
  add('once only', b.toTell.length, 1);
}
{
  const b = tech([{ number: 13, takenBy: 'someone', place: 'Bar', takenAway: true }]);
  CARGO.syncTasks(b);
  add('taken by someone unseen: "someone"', told(b), ['Hop Kins (PDA): Hop, someone has taken crate #13.']);
}
{
  const b = tech([{ number: 14, takenBy: 'Hop Kins', place: 'Bar', takenAway: true }]);
  CARGO.syncTasks(b);
  add('taken by whoever it was for: collected, nobody told', b.toTell.length, 0);
}
{
  const b = tech([{ number: 15, takenBy: 'Jan Mopp', place: 'Bar', takenAway: false }]);
  CARGO.syncTasks(b);
  add('collected at the counter (taken_away false): nobody told', b.toTell.length, 0);
}
{
  const b = tech([{ number: 16, takenBy: 'Jan Mopp', place: 'Cargo Lobby' }]);
  CARGO.syncTasks(b);
  add('no taken_away from the server, still in the lobby: nobody told', b.toTell.length, 0);
  b.heldCrates[0].place = 'Bar';
  CARGO.syncTasks(b);
  add('no taken_away from the server, gone from cargo with a taker: told', told(b), ['Hop Kins (PDA): Hop, Jan Mopp has taken crate #16.']);
}
{
  const b = tech([{ number: 17, place: 'Warehouse' }]);
  b.peopleInView = [{ handle: 'p3', name: 'Hal Pott', job: 'Captain', distance: 1 }];
  const task = { id: 1, kind: 'handover', item: '17', askedBy: 'Hal Pott', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
  b.tasks = [task];
  CARGO.afterActing(b, { tool: 'release', number: 17 }, task, false, false, { taken_by: 'Jan Mopp' }, 'Jan Mopp has taken crate #17 out of cargo already.');
  add('release refused, taken already: the errand is over, not tried again', task.state, 'done');
  add('and whoever came for it is told', told(b), ['Hal Pott: Hal, Jan Mopp has taken crate 17 out of cargo already.']);
}
{
  const b: any = makeBrain('Jan Mopp', 'Janitor');
  b.now = 5000;
  const task = { id: 2, kind: 'collect', item: '18', place: 'Custodial Closet', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
  b.tasks = [task];
  pickupsAfterActing(b, { tool: 'collect_crate', number: 18 }, task, false, { no_such_crate: true, taken_by: 'Ivy Lane' }, 'Ivy Lane has taken crate #18 away already.');
  add('collect refused, taken away already: the errand is over', task.state, 'done');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
