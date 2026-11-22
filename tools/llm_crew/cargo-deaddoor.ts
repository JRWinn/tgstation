// A door of the department that will not open (DOOR-14), a janitor call that names its room
// (MULTI-06), and the Quartermaster reading a technician's "On my way" by PDA (KNB-09). No model
// is called (CrewBrain/jobs/cargo.ts afterActing, doorWanted, tidyStep; jobs/quartermaster.ts
// readsMessage).
//
//   bun run cargo-deaddoor.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { QUARTERMASTER } = await import(ROOT + 'jobs/quartermaster');
const E = await import(ROOT + 'expected');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const JAN = { handle: 'p9', name: 'Jan Mopp', job: 'Janitor', distance: 2, place: 'Cargo Bay' };
let id = 0;
const tech = (now: number) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `dead-${id++}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.closedRooms = ['Warehouse'];
  b.now = now;
  b.hasPda = true;
  b.janitorsOnPda = ['Jan Mopp'];
  b.pdaPeople = [{ name: 'Ada Finch', job: 'Quartermaster' }];
  b.areaMesses = {};
  b.janitorCalls = {};
  return b;
};

// DOOR-14: the door will not open.
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 1000);
{
  const b = tech(1000 + 2400);
  CARGO.syncTasks(b);
  const door = b.tasks.find((task: any) => task.kind === 'door' && task.state !== 'done');
  add('the long stop wants the Warehouse door', door ? door.place : null, 'Warehouse');
  CARGO.afterActing(b, { tool: 'open_door', person: 'p9' }, door, false, false, { ok: false, reason: 'no_power' }, 'The door has no power: its lights are out.');
  add('no power: Jan is told by PDA, and the Quartermaster', b.toTell.map((tell: any) => `${tell.to}${tell.byPda ? ' (PDA)' : ''}: ${tell.line}`), [
    'Jan Mopp (PDA): Jan, the door of the Warehouse will not open: it has no power. I cannot let you out that way. I have told Ada Finch.',
    'Ada Finch (PDA): The door of the Warehouse will not open: it has no power. Jan Mopp is shut inside, and I cannot let them out.',
  ]);
  b.tasks = [];
  CARGO.syncTasks(b);
  add('and the door is not gone back to for a while', b.tasks.filter((task: any) => task.kind === 'door' && task.state !== 'done').length, 0);
  b.toTell = [];
  CARGO.afterActing(b, { tool: 'open_door', person: 'p9' }, door, false, false, { ok: false, reason: 'no_power' }, 'The door has no power: its lights are out.');
  add('found dead again: nobody is told twice', b.toTell.length, 0);
  b.now += 3100;
  b.tasks = [];
  CARGO.syncTasks(b);
  add('five minutes on it is tried again', b.tasks.filter((task: any) => task.kind === 'door' && task.state !== 'done').length, 1);
}
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 1000);
{
  const b = tech(1000 + 2400);
  CARGO.syncTasks(b);
  const door = b.tasks.find((task: any) => task.kind === 'door' && task.state !== 'done');
  CARGO.afterActing(b, { tool: 'open_door', person: 'p9' }, door, false, false, { ok: false, reason: 'no_access' }, 'Your ID does not open this door.');
  add('not its ID: not a dead door, nobody told of one', b.toTell.length, 0);
}

// MULTI-06: the call names its room, and a workmate's call to another room holds nothing back.
E.clearExpected();
{
  const plan = (rooms: string[] | undefined, called: boolean) => {
    const b = tech(50_000);
    b.peopleInView = [];
    b.areaMesses = { 'Cargo Bay': ['pool of oil'] };
    b.workmateCalled = called;
    if (rooms) b.workmateCalledRooms = rooms;
    const task = { id: 1, kind: 'tidy', place: 'Cargo Bay', state: 'open', urgency: 'routine', source: 'noticed', createdAt: b.now - 3000 };
    b.tasks = [task];
    return CARGO.plan(b, task);
  };
  add('the call carries the room', plan(undefined, false)?.act?.call_for, 'Cargo Bay');
  add('no room list yet: a workmate called, it waits as before', plan(undefined, true)?.act ?? null, null);
  add('a workmate called to the Warehouse only: it calls for the bay', plan(['Warehouse'], true)?.act?.person, 'Jan Mopp');
  add('a workmate called to the bay: it waits', plan(['Cargo Bay'], true)?.act ?? null, null);
  add('a call that named no room: it waits', plan([''], true)?.act ?? null, null);
}

// KNB-09: a technician's word by PDA that it is coming to the meeting.
{
  const qm: any = makeBrain('Ada Finch', 'Quartermaster');
  qm.now = 9000;
  qm.pdaPeople = [{ name: 'Sam Tech', job: 'Cargo Technician' }];
  qm.meeting = { calledAt: 8900, room: 'Cargo Bay', calledIn: true, invited: ['Sam Tech'], copied: false, answers: {}, startedAt: null, turns: [], reports: {}, closedAt: null, orderedBy: null };
  QUARTERMASTER.readsMessage(qm, 'Sam Tech', 'On my way to the Cargo Bay.', 9000, 'Cargo Technician');
  add('the Quartermaster takes "On my way" by PDA', qm.meeting.answers['Sam Tech'], 'coming');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
