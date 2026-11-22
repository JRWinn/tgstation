// A note that someone let into a locked room is still inside (CARGO-09): it lapses after half an
// hour, it is struck when a let-out is refused because they are not in there, the long stop for it
// does not stop orders being taken, and a janitor let in long ago does not keep the room from being
// called about. No model is called (CrewBrain/expected.ts; jobs/cargo.ts doorSought, offers,
// afterActing, tidyStep).
//
//   bun run cargo-lapse.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const E = await import(ROOT + 'expected');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HOP = { handle: 'p1', name: 'Hop Kins', job: 'Head of Personnel', distance: 1 };
let id = 0;
const tech = (now: number) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `lapse-${id++}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Lobby';
  b.closedRooms = ['Warehouse'];
  b.now = now;
  b.orderable = ['Janitorial Supplies Crate'];
  b.peopleInView = [HOP];
  b.areaMesses = {};
  b.janitorCalls = {};
  b.hasPda = true;
  b.janitorsOnPda = ['Jan Mopp'];
  return b;
};
const tools = (b: any) => CARGO.offers(b, [HOP]).map((option: any) => option.tool);

// The note lapses.
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 100);
add('let in: inside', E.stillInside('Cargo Bay', 'Warehouse', 100).map((it: any) => it.name), ['Jan Mopp']);
add('29 minutes on: still inside', E.stillInside('Cargo Bay', 'Warehouse', 100 + 17400).map((it: any) => it.name), ['Jan Mopp']);
add('31 minutes on: the note has lapsed', E.stillInside('Cargo Bay', 'Warehouse', 100 + 18600), []);

// The long stop wants the door, and does not stop an order.
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 1000);
{
  const b = tech(1000 + 2400);
  add('four minutes on, the long stop: the order is still offered', tools(b), ['order']);
  CARGO.syncTasks(b);
  const door = b.tasks.find((task: any) => task.kind === 'door' && task.state !== 'done');
  add('and the door is wanted, to let them out', door ? `${door.item} ${door.place} ${door.out}` : null, 'Jan Mopp Warehouse true');
  // The server says they are not in there.
  CARGO.afterActing(b, { tool: 'open_door', person: 'p9' }, door, false, false, { ok: false }, 'You cannot see that person, and they are not at the door of Warehouse.');
  add('refused, not in there: the note is struck', E.stillInside('Cargo Bay', 'Warehouse', b.now), []);
  b.tasks = [];
  CARGO.syncTasks(b);
  add('and the door is not wanted again', b.tasks.filter((task: any) => task.kind === 'door' && task.state !== 'done').length, 0);
}
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 1000);
{
  const b = tech(1000 + 2400);
  CARGO.syncTasks(b);
  const door = b.tasks.find((task: any) => task.kind === 'door' && task.state !== 'done');
  CARGO.afterActing(b, { tool: 'open_door', person: 'p9' }, door, false, false, { ok: false, not_inside: true }, 'Something else.');
  add('the server marks it not_inside: struck as well', E.stillInside('Cargo Bay', 'Warehouse', b.now), []);
}
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 1000);
{
  const b = tech(1000 + 2400);
  CARGO.syncTasks(b);
  const door = b.tasks.find((task: any) => task.kind === 'door' && task.state !== 'done');
  CARGO.afterActing(b, { tool: 'open_door', person: 'p9' }, door, false, false, { ok: false }, 'You could not get to it.');
  add('a let-out that could not get to the door: they are still inside', E.stillInside('Cargo Bay', 'Warehouse', b.now).map((it: any) => it.name), ['Jan Mopp']);
}

// An ask at the door still stops the order: the LLM would take one for the other.
E.clearExpected();
{
  const b = tech(5000);
  b.doorAsks = [{ name: 'Jan Mopp', room: 'Warehouse', out: false, at: 5000 }];
  b.doorAsked = b.doorAsks[0];
  E.expectSomeone('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 4900);
  b.areaMesses = { Warehouse: ['pool of oil'] };
  b.peopleInView = [HOP, { handle: 'p9', name: 'Jan Mopp', job: 'Janitor', distance: 2 }];
  add('someone asking at the door: no order offered', tools(b), []);
}

// A janitor let in long ago does not keep the room from being called about.
E.clearExpected();
E.noteLetIn('Cargo Bay', 'Jan Mopp', 'Warehouse', 'Sam Tech', 1000);
{
  const step = (now: number) => {
    const b = tech(now);
    b.areaMesses = { Warehouse: ['pool of oil'] };
    const task = { id: 1, kind: 'tidy', place: 'Warehouse', state: 'open', urgency: 'routine', source: 'noticed', createdAt: now - 3000 };
    b.tasks = [task];
    return CARGO.plan(b, task)?.step ?? '';
  };
  add('let in a minute ago: they are there and see it', /Jan Mopp, a janitor, is here/.test(step(1600)), true);
  add('let in eleven minutes ago: no longer taken to be there', /Jan Mopp, a janitor, is here/.test(step(1000 + 6600)), false);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
