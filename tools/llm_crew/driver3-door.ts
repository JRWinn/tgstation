// A body shut in and waiting for the door stays at it (KNA-02, CrewBrain/driver.ts): no look
// through the lockers, no walk to work elsewhere, while there is still someone to knock for or
// write to. With nobody left, it tries another way out now and then, as before. No model is called.
//
//   bun run driver3-door.ts
const { ROOT, at, janitor } = await import('./fixtures');
const { nextStep } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const DOOR_KEY = 'none:{"tool":"go_to_door"}';

/** A janitor shut in the Warehouse, at its door, having knocked and sent word to whoever let it in `ago` ms ago. */
function atTheDoor(ago: number, more: any = {}) {
  const b: any = janitor();
  b.messPlaces = ['Bar'];
  b.workablePlaces = ['Bar'];
  at(b, 3000, 'Warehouse', []);
  b.shutIn = true;
  b.doorOpen = false;
  b.atDoorOf = 'Warehouse';
  b.letInBy = 'Donna Sholl';
  b.hasPda = true;
  b.storageHere = 2;
  b.pdaPeople = [{ name: 'Zim Fire', job: 'Head of Personnel' }];
  b.doorKeepers = [];
  b.outAsks = { room: 'Warehouse', asked: [], knocked: true, messaged: true, wrote: [], wroteAt: Date.now() - ago };
  Object.assign(b, more);
  return b;
}
const what = (step: any) => (step ? `${step.act?.tool ?? 'say'}${step.act?.place ? ` ${step.act.place}` : ''}` : null);

{
  const b = atTheDoor(5000);
  add('has work in the Bar', b.tasks.some((task: any) => task.place === 'Bar'), true);
  add('waiting for word back, storage in the room and work in the Bar: it waits at the door', what(nextStep(b)), null);
}
{
  const step = nextStep(atTheDoor(70000));
  add('a minute on with nobody come: it writes to its head, as before', [step?.act?.tool, step?.act?.person], ['message', 'Zim Fire']);
}
{
  const b = atTheDoor(5000, { messPlaces: [], workablePlaces: [] });
  b.outAsks.wrote = ['Zim Fire'];
  b.storageHere = 2;
  const step: any = nextStep(b);
  add('nobody left to write to: it tries another way out (explore), not the lockers', what(step), 'explore');
}
{
  const b = atTheDoor(5000);
  b.atDoorOf = null;
  b.failures.set(DOOR_KEY, { count: 1, until: Date.now() + 20000 });
  add('not at the door, the walk there held back a moment: it waits for that, and goes nowhere else', what(nextStep(b)), null);
}
{
  const b = atTheDoor(5000);
  b.doorOpen = true;
  b.openDoorTries = 0;
  const step: any = nextStep(b);
  add('a door standing open: its work elsewhere is tried, as before', step?.act?.tool, 'go_to');
}

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
