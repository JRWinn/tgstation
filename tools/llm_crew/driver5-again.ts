// The owner's answers DRV-07 A and DRV-12 A (CrewBrain/driver.ts, situation.ts), case by case.
// DRV-07: a shut-in body asks each helper again, and knocks again, once two minutes have gone by
// with nobody come. DRV-12: while its work is only held back it stands still, with no idle walk.
// No model is called.
//
//   bun run driver5-again.ts
const { ROOT, at, janitor, zim } = await import('./fixtures');
const { drive, nextStep, lineSaid } = await import(ROOT + 'driver');
const { ASK_AGAIN_MS, whoToAskForTheDoor } = await import(ROOT + 'situation');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

/** A janitor shut in the Warehouse, standing at its door, with these people in view. */
function shutIn(people: any[] = []) {
  const b: any = janitor();
  at(b, 3000, 'Warehouse', people);
  b.shutIn = true;
  b.doorOpen = false;
  b.atDoorOf = 'Warehouse';
  b.letInBy = null;
  b.hasPda = false;
  return b;
}

// ---- DRV-07: asked again after two minutes
{
  const b = shutIn([zim]);
  add('Zim in view, not yet asked: Zim is asked', whoToAskForTheDoor(b), 'Zim Fire');
  lineSaid(b, { key: 'shut-in', to: 'Zim Fire', asks: 'Zim Fire' });
  add('the ask said: Zim is down as asked, with a time', [b.outAsks.asked, typeof b.outAsks.askedAt?.['Zim Fire']], [['Zim Fire'], 'number']);
  add('a minute later: Zim is not asked again yet', whoToAskForTheDoor(b), null);
  b.outAsks.askedAt['Zim Fire'] = Date.now() - ASK_AGAIN_MS - 1000;
  add('two minutes on with nobody come: Zim is asked again', whoToAskForTheDoor(b), 'Zim Fire');
  b.failures.clear();
  const step: any = nextStep(b);
  add('and the step is the ask', [step?.key, step?.asks], ['shut-in', 'Zim Fire']);
}
{
  // An old record with no time on it counts as just asked: nothing asks twice at once.
  const b = shutIn([zim]);
  b.outAsks = { room: 'Warehouse', asked: ['Zim Fire'], knocked: false, messaged: false, wrote: [], wroteAt: 0 };
  add('asked with no time noted: not asked again', whoToAskForTheDoor(b), null);
}

// ---- DRV-07: knocks again after two minutes
{
  const b = shutIn();
  const first: any = nextStep(b);
  add('at the door, nobody in view: it knocks', first?.act?.tool, 'knock');
  b.outAsks = { room: 'Warehouse', asked: [], knocked: true, messaged: false, wrote: [], wroteAt: Date.now(), knockedAt: Date.now() - 30000 };
  const soon: any = nextStep(b);
  add('knocked 30 seconds ago: no second knock yet', soon?.act?.tool === 'knock', false);
  b.outAsks.knockedAt = Date.now() - ASK_AGAIN_MS - 10000;
  const again: any = nextStep(b);
  add('knocked 130 seconds ago, nobody come: it knocks again', again?.act?.tool, 'knock');
}
{
  // A knock made with no time noted (an older record) is not made again at once.
  const b = shutIn();
  b.outAsks = { room: 'Warehouse', asked: [], knocked: true, messaged: false, wrote: [], wroteAt: Date.now() };
  const step: any = nextStep(b);
  add('knocked, no time noted: no knock again at once', step?.act?.tool === 'knock', false);
}
{
  // The wait before word goes further runs from the first knock, not from a knock made again.
  const b = shutIn();
  b.hasPda = true;
  b.letInBy = 'Donna Sholl';
  b.outAsks = { room: 'Warehouse', asked: [], knocked: true, messaged: true, wrote: [], wroteAt: Date.now() - 90000, knockedAt: Date.now() - ASK_AGAIN_MS - 1000 };
  b.doorKeepers = ['Zim Fire'];
  const knock: any = nextStep(b);
  add('both due: the knock comes first', knock?.act?.tool, 'knock');
  Object.assign(b, { awake: true, driveAfter: 0, lastAct: null, walking: false, doing: null, mustSay: null, sayingNow: false, inHand: false });
  const taken: any = drive(b, (act: any) => act.tool, () => {});
  add('the knock is taken', taken?.act?.tool, 'knock');
  add('a second knock does not put off the word', b.outAsks.wroteAt < Date.now() - 60000, true);
  add('and its time is noted', Date.now() - b.outAsks.knockedAt < 5000, true);
}

// ---- DRV-12: held back, it stands still
{
  const b: any = janitor('soap');
  b.messPlaces = ['Bar'];
  b.workablePlaces = ['Bar'];
  b.cleanableMesses = ['pool of oil'];
  b.pendingSpeakers = new Set();
  at(b, 3100, 'Bar', [], [{ name: 'pool of oil', count: 1, kind: 'mess' }]);
  const clean: any = nextStep(b);
  add('the step in the Bar is the clean', clean?.act?.tool, 'clean');
  b.failures.set(clean.key, { count: 1, until: Date.now() + 20000 });
  const held: any = nextStep(b);
  add('the clean held back: no step at all (no explore, no search)', held, null);
  b.storageHere = 2;
  add('storage in view changes nothing: it stands still', nextStep(b), null);
  b.failures.get(clean.key).until = 0;
  const after: any = nextStep(b);
  add('the hold up: the clean again', after?.act?.tool, 'clean');
}
{
  // No work at all: it still walks the station, as before.
  const b: any = janitor('soap');
  at(b, 3100, 'Bar', []);
  b.tasks = [];
  const step: any = nextStep(b);
  add('no work: it explores as before', step?.act?.tool, 'explore');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
