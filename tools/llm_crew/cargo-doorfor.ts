// A door the server opened for someone other than the one the brain named (LOGB-03): the
// open_door result's details say who it was opened for, and which way, and the let-in or let-out
// is booked to them. The one named, who was not at the door, is not booked inside, and the call
// that has them coming is left alone. With no details (an older server, the simulator) it books
// the name asked for, as before. No model is called (CrewBrain/jobs/cargo.ts afterActing,
// expected.ts).
//
//   bun run cargo-doorfor.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { addTask } = await import(ROOT + 'tasks');
const E = await import(ROOT + 'expected');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const ARLEEN = 'Arleen Fleming';
const VINCENT = 'Vincent Briner';
const ROOM = 'Delivery Office';
let id = 0;
const tech = () => {
  const b: any = makeBrain('Monte Mcmullen', 'Cargo Technician');
  b.id = `doorfor-${id++}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.now = 1000 + id * 10;
  b.closedRooms = ['Cargo Bay', ROOM];
  b.areaMesses = { [ROOM]: 1 };
  b.peopleInView = [];
  b.toTell = [];
  b.doorAsks = [];
  return b;
};
const names = (entries: any[]) => entries.map((it: any) => it.name).sort();
const doorTask = (b: any, item: string, out?: boolean) => {
  const task = addTask(b, { kind: 'door', item, place: ROOM, urgency: 'asked', source: 'own' });
  if (out !== undefined) task.out = out;
  return task;
};
const watch = (b: any) => b.tasks.filter((t: any) => t.kind === 'door_watch' && t.state !== 'done').map((t: any) => [t.item, !!t.out]);

// The round-17.48.05 case: Arleen named, the door opened for Vincent, a janitor knocking outside.
{
  E.clearExpected();
  const b = tech();
  E.expectSomeone(b.post, ARLEEN, ROOM, b.name, b.now);
  E.expectSomeone(b.post, VINCENT, ROOM, b.name, b.now);
  b.janitorCalls[b.post] = { to: ARLEEN, at: b.now, count: 1 };
  b.doorAsks = [{ name: ARLEEN, at: b.now, room: ROOM }, { name: VINCENT, at: b.now, room: ROOM }];
  const task = doorTask(b, ARLEEN, false);
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false, { for: VINCENT, out: 0 }, `You open the door for ${VINCENT} and hold it, to let them into ${ROOM}.`);
  add('opened for another: the one let in is booked inside', names(E.stillInside(b.post, ROOM, b.now)), [VINCENT]);
  add('opened for another: the one named is still expected, not inside', names(E.expectedAt(b.post, ROOM, b.now)), [ARLEEN]);
  add('opened for another: the named one\'s call is left as it stands', b.janitorCalls[b.post].letIn, undefined);
  add('opened for another: it stands by the door for the one let in', watch(b), [[VINCENT, false]]);
  add('opened for another: the one let in is noted as sent for', typeof b.sentFor[VINCENT], 'number');
  add('opened for another: both asks at that door are answered', b.doorAsks.length, 0);
  // Three minutes on, with the mess gone, nobody is down as shut in under Arleen's name.
  b.areaMesses = {};
  add('opened for another: no let-out is ever owed to the one named', E.stillInside(b.post, ROOM, b.now + 1800).some((it: any) => it.name === ARLEEN), false);
}

// A plain let-in: the server opened it for the one named.
{
  E.clearExpected();
  const b = tech();
  E.expectSomeone(b.post, ARLEEN, ROOM, b.name, b.now);
  b.janitorCalls[b.post] = { to: ARLEEN, at: b.now, count: 1 };
  const task = doorTask(b, ARLEEN, false);
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false, { for: ARLEEN, out: 0 }, `You open the door for ${ARLEEN} and hold it, to let them into ${ROOM}.`);
  add('same name: booked inside as before', names(E.stillInside(b.post, ROOM, b.now)), [ARLEEN]);
  add('same name: the call is marked let in, as before', b.janitorCalls[b.post].letIn, true);
  add('same name: it stands by the door', watch(b), [[ARLEEN, false]]);
}

// No details (an older server or the simulator): the name asked for, as before.
{
  E.clearExpected();
  const b = tech();
  E.expectSomeone(b.post, ARLEEN, ROOM, b.name, b.now);
  const task = doorTask(b, ARLEEN, false);
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false, {}, `You open the door for ${ARLEEN} and hold it.`);
  add('no details: booked to the name asked for', names(E.stillInside(b.post, ROOM, b.now)), [ARLEEN]);
}

// A knock from inside, nobody known in there: the server says who it let out.
{
  E.clearExpected();
  const b = tech();
  E.noteLetIn(b.post, VINCENT, ROOM, b.name, b.now - 100);
  const task = doorTask(b, 'whoever is knocking', true);
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false, { for: VINCENT, out: 1 }, `You open the door for ${VINCENT} and hold it, to let them out of ${ROOM}.`);
  add('knock from inside: the one let out is struck as inside', names(E.stillInside(b.post, ROOM, b.now)), []);
  add('knock from inside: it stands by the door for them, letting out', watch(b), [[VINCENT, true]]);
}

// Which way: the server's word goes before the task's guess.
{
  E.clearExpected();
  const b = tech();
  E.noteLetIn(b.post, VINCENT, ROOM, b.name, b.now - 100);
  const task = doorTask(b, VINCENT);
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false, { for: VINCENT, out: 1 }, `You open the door for ${VINCENT} and hold it, to let them out of ${ROOM}.`);
  add('which way from the server: let out', [names(E.stillInside(b.post, ROOM, b.now)), watch(b)], [[], [[VINCENT, true]]]);
  E.clearExpected();
  const c = tech();
  const into = doorTask(c, VINCENT, true);
  CARGO.afterActing(c, { tool: 'open_door' }, into, true, false, { for: VINCENT, out: 0 }, `You open the door for ${VINCENT} and hold it, to let them into ${ROOM}.`);
  add('which way from the server: let in, though the task had it out', [names(E.stillInside(c.post, ROOM, c.now)), watch(c)], [[VINCENT], [[VINCENT, false]]]);
}

// CARGO-09 kept: a let-out refused because nobody of that name is there strikes the named one.
{
  E.clearExpected();
  const b = tech();
  E.noteLetIn(b.post, ARLEEN, ROOM, b.name, b.now - 100);
  const task = doorTask(b, ARLEEN, true);
  CARGO.afterActing(b, { tool: 'open_door' }, task, false, false, { not_inside: 1 }, `You do not know who that is, and there is nobody of that name at the door of ${ROOM}.`);
  add('CARGO-09: a refused let-out still strikes the one named', names(E.stillInside(b.post, ROOM, b.now)), []);
  add('CARGO-09: and nothing is watched', watch(b), []);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
