// What a body does when a door is held open for it, case by case. No model is called: this is all
// decided in code (CrewBrain/driver.ts), so it can be checked in a second.
//
//   bun run brain-door.ts
const { ROOT, janitor, at, know } = await import('./fixtures');
const { nextStep } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

/**
 * A janitor in the Cargo Lobby, called to a mess there and to one in the Library, a room (for this
 * table) reached through the locked Cargo Bay. The clean in the lobby has just come to nothing.
 */
function calledTwice(heldFor: string | null) {
  const b: any = janitor('mop');
  b.stowed = [];
  know(b, ['Cargo Lobby', 'Cargo Bay', 'Library']);
  at(b, 3000, 'Cargo Lobby', []);
  b.cleanableMesses = ['oil'];
  b.reachedThrough = { Library: 'Cargo Bay' };
  b.tasks = [
    { id: 1, kind: 'clean', place: 'Cargo Lobby', urgency: 'asked', source: 'asked', askedBy: 'Zim Fire', state: 'open', createdAt: 100 },
    { id: 2, kind: 'clean', place: 'Library', via: 'Cargo Lobby', urgency: 'asked', source: 'asked', askedBy: 'Zim Fire', state: 'open', createdAt: 100 },
  ];
  b.nextTaskId = 3;
  b.failures.set('job:1', { count: 1, until: Date.now() + 20000 });
  b.doorHeld = heldFor !== null;
  b.doorHeldOut = false;
  b.doorHeldFor = heldFor;
  b.atDoorOf = 'Cargo Bay';
  return b;
}
const what = (step: any) => (step ? [step.act?.tool ?? 'say', step.act?.place ?? null, step.task ?? null] : null);

// ---- KNB-08: the door of the outer room is held: it goes through, and the failed clean underfoot waits
{
  const b = calledTwice('Cargo Bay');
  add('outer door held: it walks into the Cargo Bay for the Library', what(nextStep(b)), ['go_to', 'Cargo Bay', 2]);
}
{
  // The clean underfoot has not failed: the held door still comes first.
  const b = calledTwice('Cargo Bay');
  b.failures.clear();
  add('outer door held, clean underfoot ready: the held door still first', what(nextStep(b)), ['go_to', 'Cargo Bay', 2]);
}
{
  // No door held: the failed clean is left alone, and it goes to stand at the bay door for the Library.
  const b = calledTwice(null);
  b.atDoorOf = null;
  const step = nextStep(b);
  add('no door held: the failed clean is left alone', step?.task, 2);
}
{
  // A held door that is some other room's is not gone through for the Library.
  const b = calledTwice('Bar');
  const step = nextStep(b);
  add('some other door held: not walked through', step?.act?.place === 'Bar', false);
  add('some other door held: the failed clean underfoot still waits', step?.task === 1 && step?.act?.tool === 'clean', false);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
