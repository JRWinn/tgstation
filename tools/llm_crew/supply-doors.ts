// A cargo technician's asks for its doors, case by case (KNA-01). No model is called and no
// station is simulated: the asks are read, served and struck out in code (CrewBrain/jobs/cargo.ts).
//
//   bun run supply-doors.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const tech = () => {
  const b: any = makeBrain('Jaden Prechtl', 'Cargo Technician');
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.closedRooms = ['Mining Office', 'Delivery Office'];
  b.now = 10_000;
  return b;
};
const doorTasks = (b: any) => b.tasks.filter((task: any) => task.kind === 'door' && task.state !== 'done').map((task: any) => `${task.item} ${task.place}`);
const promised = (b: any) => b.toTell.filter((tell: any) => /I am coming to the/.test(tell.line)).map((tell: any) => tell.to);
const MARINA = 'I am done in the Mining Office and am at the Mining Dock Maintenance door. Could you let me out of the Mining Office, please?';
const COLLIN = 'I am done in the Delivery Office and am at the Delivery Office door. Could you let me out of the Delivery Office, please?';

// Two janitors shut in two of its rooms ask a few seconds apart. Both are let out, the first first.
{
  const b = tech();
  CARGO.readsMessage(b, 'Marina Shaffer', MARINA, 10_000, 'Janitor');
  b.now = 10_050;
  CARGO.readsMessage(b, 'Collin Archibald', COLLIN, 10_050, 'Janitor');
  CARGO.syncTasks(b);
  add('two asks a few seconds apart: the first is served first', doorTasks(b), ['Marina Shaffer Mining Office']);
  add('and is told it is coming', promised(b), ['Marina Shaffer']);
  add('the second ask is still in', b.doorAsks.map((ask: any) => ask.name), ['Marina Shaffer', 'Collin Archibald']);
  const task = b.tasks.find((it: any) => it.kind === 'door' && it.item === 'Marina Shaffer');
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false);
  b.now = 10_100;
  CARGO.syncTasks(b);
  add('her door opened, the second is served next', doorTasks(b), ['Collin Archibald Delivery Office']);
  add('and he is told it is coming too', promised(b), ['Marina Shaffer', 'Collin Archibald']);
  add('her ask is struck out', b.doorAsks.map((ask: any) => ask.name), ['Collin Archibald']);
}

// A second ask from the same person takes the place of their first.
{
  const b = tech();
  CARGO.readsMessage(b, 'Marina Shaffer', MARINA, 10_000, 'Janitor');
  CARGO.readsMessage(b, 'Collin Archibald', COLLIN, 10_010, 'Janitor');
  CARGO.syncTasks(b);
  b.now = 10_200;
  CARGO.readsMessage(b, 'Marina Shaffer', MARINA, 10_200, 'Janitor');
  CARGO.syncTasks(b);
  add('the same person asking again is one ask, not two, and keeps its turn', [b.doorAsks.map((ask: any) => ask.name), b.doorAsks[0].at], [['Marina Shaffer', 'Collin Archibald'], 10_200]);
  add('and is not promised the door a second time', [promised(b), doorTasks(b)], [['Marina Shaffer'], ['Marina Shaffer Mining Office']]);
}

// A workmate talking of the door is not asking for it.
{
  const b = tech();
  b.peopleInView = [{ name: 'Sam Rees', job: 'Cargo Technician', handle: 'p2', distance: 2 }];
  CARGO.readsMessage(b, 'Marina Shaffer', MARINA, 10_000, 'Janitor');
  CARGO.overhears(b, { kind: 'speech', details: { speaker: 'Sam Rees', message: 'Maria is seeing to the door, Jan.', said_to: 'me' } });
  CARGO.readsMessage(b, 'Sam Rees', 'Mind the door on your way through.', 10_020, 'Cargo Technician');
  CARGO.syncTasks(b);
  add('a workmate saying "door" leaves the janitor\'s ask standing', [b.doorAsks.map((ask: any) => ask.name), doorTasks(b)], [['Marina Shaffer'], ['Marina Shaffer Mining Office']]);
}

// An ask that has run out is dropped when the next comes in.
{
  const b = tech();
  CARGO.readsMessage(b, 'Marina Shaffer', 'Could you let me into the Mining Office door, please?', 10_000, 'Janitor');
  b.now = 100_000;
  CARGO.readsMessage(b, 'Collin Archibald', COLLIN, 100_000, 'Janitor');
  add('an ask long run out is dropped', b.doorAsks.map((ask: any) => ask.name), ['Collin Archibald']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(80)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
