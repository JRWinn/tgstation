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

// ---- KNB-04 step 7: a technician that has opened a door stands by it until whoever it is for is through
{
  const { CARGO } = await import(ROOT + 'jobs/cargo');
  const { makeBrain } = await import('./fixtures');
  const tech = () => {
    const b: any = makeBrain('Jaden Prechtl', 'Cargo Technician');
    b.id = `door-tech-${Math.random()}`;
    b.post = 'Cargo Bay';
    b.location = 'Cargo Bay';
    b.closedRooms = ['Mining Office', 'Delivery Office'];
    b.now = 10_000;
    return b;
  };
  const MARINA = 'I am done in the Mining Office and am at the Mining Dock Maintenance door. Could you let me out of the Mining Office, please?';
  const COLLIN = 'I am done in the Delivery Office and am at the Delivery Office door. Could you let me out of the Delivery Office, please?';
  /** Two janitors asking out; the first door opened. Returns the brain, standing by that door. */
  const opened = () => {
    const b = tech();
    CARGO.readsMessage(b, 'Marina Shaffer', MARINA, b.now, 'Janitor');
    CARGO.readsMessage(b, 'Collin Archibald', COLLIN, b.now, 'Janitor');
    CARGO.syncTasks(b);
    const task = b.tasks.find((it: any) => it.kind === 'door' && it.item === 'Marina Shaffer');
    CARGO.afterActing(b, { tool: 'open_door' }, task, true, false);
    return b;
  };
  const watching = (b: any) => b.tasks.some((it: any) => it.kind === 'door_watch' && it.state !== 'done');
  const marinaOut = { handle: 'p4', name: 'Marina Shaffer', job: 'Janitor', place: 'Cargo Bay', distance: 3, in_post: 1 };
  const marinaIn = { ...marinaOut, place: 'Mining Office', in_post: 0 };
  {
    const b = opened();
    b.now += 50;
    CARGO.syncTasks(b);
    add('door opened: it stands by it', watching(b), true);
    // A PDA message may go (the next asker is told it is coming); nothing that walks.
    b.toTell = [];
    add('and the next asker\'s door waits', what(nextStep(b)), null);
  }
  {
    const b = opened();
    b.now += 50;
    b.peopleInView = [marinaIn];
    CARGO.syncTasks(b);
    add('she is still in the room: it stands by the door', watching(b), true);
    b.peopleInView = [marinaOut];
    b.now += 10;
    CARGO.syncTasks(b);
    b.now += 25;
    CARGO.syncTasks(b);
    add('seen through, and a moment after: the watch is over', watching(b), false);
    b.toTell = [];
    const step = nextStep(b);
    add('and it goes to the next door', [step?.act?.tool, step?.act?.name], ['open_door', 'Collin Archibald']);
  }
  {
    // She is never seen: the door watch does not hold it for good.
    const b = opened();
    b.now += 300;
    CARGO.syncTasks(b);
    add('not seen through after 30 s: still by the door', watching(b), true);
    b.now += 60;
    CARGO.syncTasks(b);
    add('after 36 s: it gives up standing there', watching(b), false);
  }
  {
    // KNB-04 step 7: the server says the hold is over, out of sight of her: the watch ends then.
    const { doorHoldOver } = await import(ROOT + 'jobs/cargo');
    const b = opened();
    b.now += 50;
    CARGO.syncTasks(b);
    doorHoldOver(b, 'Mining Office', 'Collin Archibald');
    add('hold over for someone else: still by the door', watching(b), true);
    doorHoldOver(b, 'Mining Office', 'Marina Shaffer');
    add('hold over for her: the watch is over at once', watching(b), false);
    b.toTell = [];
    const step = nextStep(b);
    add('and it goes to the next door', [step?.act?.tool, step?.act?.name], ['open_door', 'Collin Archibald']);
  }
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
