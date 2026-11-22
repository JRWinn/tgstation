// The Quartermaster giving an order to a technician (QM-02): not to one seen down or in cuffs,
// to another after the same one has twice not answered, and taken as had on a plain "on it" from
// the one it was given to. No model is called (CrewBrain/jobs/quartermaster.ts, giveStep,
// syncTasks, overhears).
//
//   bun run qm-unanswered.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { QUARTERMASTER } = await import(ROOT + 'jobs/quartermaster');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const CORA = { handle: 'p4', name: 'Cora Tech', job: 'Cargo Technician', place: 'Cargo Bay', distance: 1 };
const VIK = { handle: 'p5', name: 'Vik Hale', job: 'Cargo Technician', place: 'Cargo Bay', distance: 1 };
let ids = 0;
const qm = (people: any[]) => {
  const b: any = makeBrain('Ada Quarter', 'Quartermaster');
  b.id = `qmu${++ids}`;
  b.location = 'Cargo Bay';
  b.staffPost = 'Cargo Bay';
  b.office = "Quartermaster's Office";
  b.now = 10_000;
  b.toTell = [];
  b.book = [];
  b.peopleInView = people;
  b.ledger = {
    orders: [{ n: 1, from: 'Hop Kins', fromJob: 'Head of Personnel', items: [{ crate: 'Janitorial Supplies Crate', count: 1 }], cost: 1000, state: 'cleared', approved: 'self', askedAt: null, asks: 0, waitingTold: false, shortTold: false, pick: null, walkedUp: false, givenTo: null, givenAt: null, taken: false, retryAt: 0 }],
    next: 2, toWrite: [], heldUp: {}, duties: {}, read: true, sendFor: null, cameOutAt: 0,
  };
  const task: any = { id: 1, kind: 'qm_give', item: '1', state: 'open', urgency: 'asked', source: 'own', createdAt: 0 };
  b.tasks = [task];
  return { b, task, order: b.ledger.orders[0] };
};
/** Gives the order once, as the body would: the line is said, and the order is given. */
const give = (b: any, task: any) => {
  const plan = QUARTERMASTER.plan(b, task);
  if (plan?.say) QUARTERMASTER.afterSaying(b, plan.say);
  return plan?.say?.split(',')[0] ?? null;
};
const lapse = (b: any) => {
  b.now += 700;
  QUARTERMASTER.syncTasks(b);
};
const hear = (b: any, who: any, message: string) =>
  QUARTERMASTER.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: who.name, message, said_to: 'me' } });

{
  const { b, task } = qm([{ ...CORA, down: 1 }, VIK]);
  add('Cora lying in the bay, Vik standing: it goes to Vik', give(b, task), 'Vik');
}
{
  const { b, task } = qm([{ ...CORA, cuffed: 1 }, VIK]);
  add('Cora in cuffs: it goes to Vik', give(b, task), 'Vik');
}
{
  const { b, task, order } = qm([CORA]);
  add('only Cora: it goes to Cora', give(b, task), 'Cora');
  lapse(b);
  add('no answer: given to Cora again', give(b, task), 'Cora');
  b.peopleInView = [CORA, VIK];
  lapse(b);
  add('twice no answer, Vik here now: given to Vik', give(b, task), 'Vik');
  hear(b, VIK, 'Order 1, right away.');
  add('Vik answers: taken', [order.taken, order.givenTo], [true, 'Vik Hale']);
}
{
  const { b, task } = qm([CORA]);
  give(b, task);
  lapse(b);
  give(b, task);
  lapse(b);
  add('twice no answer and nobody else: Cora again', give(b, task), 'Cora');
}
{
  const { b, task, order } = qm([CORA]);
  give(b, task);
  b.now += 100;
  hear(b, CORA, 'on it');
  add('"on it" from the one it was given to: taken', order.taken, true);
}
{
  const { b, task, order } = qm([CORA, VIK]);
  give(b, task);
  b.now += 100;
  hear(b, order.givenTo === CORA.name ? VIK : CORA, 'sure');
  add('"sure" from someone else: not taken', order.taken, false);
}
{
  const { b, task, order } = qm([CORA]);
  give(b, task);
  b.now += 650;
  hear(b, CORA, 'ok');
  add('"ok" after the minute: not taken', order.taken, false);
}

// QM-02 A: taken, and no word it came in ten minutes on: the technician is asked after it, once.
{
  const { b, order } = qm([CORA]);
  Object.assign(order, { state: 'given', givenTo: CORA.name, givenAt: 10_000, taken: true });
  b.now = 10_000 + 5000;
  QUARTERMASTER.syncTasks(b);
  add('QM-02 A: under ten minutes, nothing asked', b.toTell.length, 0);
  b.now = 10_000 + 6100;
  QUARTERMASTER.syncTasks(b);
  add('QM-02 A: ten minutes on, Cora is asked to her face', b.toTell.map((t: any) => [t.line, !!t.byPda]), [['Cora, has order 1 come in?', false]]);
  b.now += 6000;
  QUARTERMASTER.syncTasks(b);
  add('QM-02 A: asked once only', b.toTell.length, 1);
  const away = qm([]);
  Object.assign(away.order, { state: 'given', givenTo: CORA.name, givenAt: 10_000, taken: true });
  away.b.pdaPeople = [{ name: CORA.name, job: CORA.job }];
  away.b.now = 10_000 + 6100;
  QUARTERMASTER.syncTasks(away.b);
  add('QM-02 A: out of sight, asked by PDA', away.b.toTell.map((t: any) => [t.line, !!t.byPda]), [['Cora, has order 1 come in?', true]]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
