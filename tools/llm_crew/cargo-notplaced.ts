// Word that an order did not go through (CARGO-03). The technician takes it to the Quartermaster
// face to face, says why the console would not take it, waits for "I have that", and goes to it
// again later when it was not found. The Quartermaster answers it like the other words. No model
// is called (CrewBrain/jobs/cargo.ts, jobs/quartermaster.ts).
//
//   bun run cargo-notplaced.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { QUARTERMASTER } = await import(ROOT + 'jobs/quartermaster');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const QM = { handle: 'p9', name: 'Quin Master', job: 'Quartermaster', command: 1 };
const SAM = { handle: 'p4', name: 'Sam Tech', job: 'Cargo Technician' };

const tech = (seen: boolean) => {
  const b: any = makeBrain(SAM.name, SAM.job);
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.now = 10_000;
  b.pdaPeople = [{ name: QM.name, job: QM.job }];
  b.peopleInView = seen ? [{ ...QM, place: 'Cargo Bay', distance: 1 }] : [];
  b.givenOrder = { n: 4, items: [{ crate: 'Janitorial Supplies Crate', count: 1 }], for: 'Zim Fire', by: QM.name, at: 9000, placed: false };
  CARGO.syncTasks(b);
  const given = b.tasks.find((t: any) => t.kind === 'given_order');
  return { b, given };
};
const notPlaced = (b: any) => b.tasks.find((t: any) => t.kind === 'not_placed' && t.state !== 'done');

{
  const { b, given } = tech(true);
  CARGO.afterActing(b, { tool: 'order' }, given, false, false, {}, 'There is not enough money left in the cargo budget to order a Janitorial Supplies Crate.');
  CARGO.syncTasks(b);
  const task = notPlaced(b);
  add('the console refuses: the order is let go, and word is owed to the Quartermaster', [b.givenOrder, task?.item, task?.from, b.toTell.length], [null, '4', QM.name, 0]);
  const plan = CARGO.plan(b, task);
  add('the Quartermaster in sight: it is told why, word for word', [plan?.say, plan?.exact], ['Quin, order 4 did not go through. There is not enough money in the cargo budget for it.', true]);
  CARGO.afterSaying(b, plan?.say);
  b.now += 50;
  add('said, it waits to hear that it was heard', CARGO.plan(b, task)?.wait, true);
  CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: QM.name, message: 'Sam, I have that.', said_to: 'me' } });
  CARGO.syncTasks(b);
  add('"Sam, I have that.": the word is passed on and done with', [task.passedOn, task.state], [true, 'done']);
}
{
  const { b, given } = tech(true);
  CARGO.afterActing(b, { tool: 'order' }, given, false, false, {}, 'You could not get to it.');
  CARGO.syncTasks(b);
  add('could not get to the console: it says so', CARGO.plan(b, notPlaced(b))?.say, 'Quin, order 4 did not go through. I could not get to the console.');
}
{
  const { b, given } = tech(true);
  CARGO.afterActing(b, { tool: 'order' }, given, false, false, {}, 'Something else.');
  CARGO.syncTasks(b);
  const task = notPlaced(b);
  const plan = CARGO.plan(b, task);
  add('any other refusal: the words it always used', plan?.say, 'Quin, order 4 did not go through. The console would not take it.');
  // Not heard: said again, and the third time it does not call across the bay.
  CARGO.afterSaying(b, plan?.say);
  b.now += 300;
  add('not heard: said again', CARGO.plan(b, task)?.say, plan?.say);
  CARGO.afterSaying(b, plan?.say);
  b.now += 300;
  const third = CARGO.plan(b, task);
  add('twice not heard: no PDA, left a while', [third?.ready, third?.act ?? null, b.toTell.length, task.retryAt - b.now], [false, null, 0, 1200]);
  CARGO.syncTasks(b);
  add('and blocked while it waits', task.state, 'blocked');
  b.now += 1300;
  CARGO.syncTasks(b);
  add('the wait over, it is told again', [task.state, CARGO.plan(b, task)?.say], ['open', plan?.say]);
}
{
  const { b, given } = tech(false);
  b.headOffice = 'Quartermaster\'s Office';
  CARGO.afterActing(b, { tool: 'order' }, given, false, false, {}, 'Something else.');
  CARGO.syncTasks(b);
  add('the Quartermaster out of sight: it goes to its office door', CARGO.plan(b, notPlaced(b))?.act, { tool: 'go_to_door', place: 'Quartermaster\'s Office' });
}
{
  const { b, given } = tech(false);
  b.pdaPeople = [];
  CARGO.afterActing(b, { tool: 'order' }, given, false, false, {}, 'Something else.');
  CARGO.syncTasks(b);
  add('no Quartermaster aboard: nobody to tell, and the word is let go', notPlaced(b) ?? null, null);
}
{
  const { b, given } = tech(true);
  CARGO.afterActing(b, { tool: 'order' }, given, true, false, {}, 'You place the order.');
  CARGO.syncTasks(b);
  add('placed: no word owed', notPlaced(b) ?? null, null);
}

// The Quartermaster's side.
const qm = () => {
  const b: any = makeBrain(QM.name, QM.job);
  b.location = 'Quartermaster\'s Office';
  b.now = 10_000;
  b.toTell = [];
  b.peopleInView = [{ ...SAM, place: 'Quartermaster\'s Office', distance: 1 }];
  b.ledger = { orders: [{ n: 4, state: 'given', givenTo: SAM.name, taken: true, pick: null, shortTold: false, retryAt: 0, cost: 1000, from: 'Zim Fire' }], next: 5, toWrite: [], cameOutAt: 0 };
  return b;
};
const tellQm = (b: any, message: string) =>
  QUARTERMASTER.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: SAM.name, message, said_to: 'me' } });
{
  const b = qm();
  tellQm(b, 'Quin, order 4 did not go through. The console would not take it.');
  const order = b.ledger.orders[0];
  add('the Quartermaster answers it by name', b.toTell.map((t: any) => t.line), ['Sam, I have that.']);
  add('and gives it again in two minutes', [order.state, order.givenTo, order.retryAt - b.now], ['new', null, 1200]);
}
{
  const b = qm();
  tellQm(b, 'Quin, order 4 did not go through. There is not enough money in the cargo budget for it.');
  add('for want of money it waits longer', b.ledger.orders[0].retryAt - b.now, 6000);
}
{
  const b = qm();
  b.ledger.orders[0].givenTo = 'Someone Else';
  tellQm(b, 'Quin, order 4 did not go through. The console would not take it.');
  add('from one it was not given to: answered, the order left as it is', [b.toTell.length, b.ledger.orders[0].state], [1, 'given']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
