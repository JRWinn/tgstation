// A janitor sent for on an order (PLAY-10 3, the owner's answer A): a technician told by a
// superior to call a janitor notes the call (brain.calledOnOrder, jobs/orders.ts), the department's
// list takes it, and any of the department lets that janitor in, mess seen or not. No model is
// called (CrewBrain/jobs/cargo.ts listCallsOnOrder, mayPass; expected.ts).
//
//   bun run cargo-callorder.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const E = await import(ROOT + 'expected');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const JAN = { handle: 'p9', name: 'Jan Mopp', job: 'Janitor', distance: 2, place: 'Cargo Lobby' };
let id = 0;
const tech = (name: string, called: any[] | undefined) => {
  const b: any = makeBrain(name, 'Cargo Technician');
  b.id = `callorder-${id++}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.now = 5000;
  b.hasPda = true;
  b.peopleInView = [JAN];
  b.handles = { 'Jan Mopp': 'p9' };
  b.areaMesses = {};
  b.janitorCalls = {};
  if (called) b.calledOnOrder = called;
  return b;
};
const asks = (b: any) => {
  CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: JAN.name, message: 'Can you let me in, please?', said_to: 'me' } });
  CARGO.syncTasks(b);
  const door = b.tasks.find((task: any) => task.kind === 'door' && task.state !== 'done');
  return door ? CARGO.plan(b, door)?.act ?? null : null;
};

E.clearExpected();
{
  const b = tech('Sam Tech', undefined);
  add('no call, no mess: the janitor is not let in', asks(b), null);
}
E.clearExpected();
{
  const b = tech('Sam Tech', [{ room: 'Cargo Bay', janitor: 'Jan Mopp', at: 4900 }]);
  CARGO.syncTasks(b);
  const act: any = asks(b);
  add('called on an order to the bay, no mess seen: let in', [act?.tool, act?.place, act?.sent_on_order], ['open_door', 'Cargo Bay', true]);
  const vik = tech('Vik Hale', undefined);
  const other: any = asks(vik);
  add('and a workmate lets them in too, off the department list', [other?.tool, other?.place], ['open_door', 'Cargo Bay']);
}
E.clearExpected();
{
  const b = tech('Sam Tech', [{ room: 'Captain\'s Quarters', janitor: 'Jan Mopp', at: 4900 }]);
  add('called on an order to another room: not let into the bay', asks(b), null);
}
E.clearExpected();
{
  const b = tech('Sam Tech', [{ room: 'Cargo Bay', janitor: 'Jan Mopp', at: 4900 }]);
  b.now = 4900 + 12100;
  add('the call lapsed (twenty minutes): not let in', asks(b), null);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
