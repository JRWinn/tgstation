// Whose line an order is agreed to from (CARGO-06). With a head and someone who is no head both
// just speaking to a technician, an order is matched only to a line the head said to it, never to
// the janitor's ask, a line said to someone else, or a line whose speaker's name has a supply word
// in it. No model is called (CrewBrain/jobs/cargo.ts, agrees and offers).
//
//   bun run cargo-orders.ts
const { ROOT, makeBrain, says } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HOP = { handle: 'p1', name: 'Zim Fire', job: 'Head of Personnel', command: 1 };
const JAN = { handle: 'p3', name: 'Jan Mopp', job: 'Janitor' };
const GEAR = { handle: 'p7', name: 'Bob Gearhart', job: 'Botanist' };
const QM = { handle: 'p9', name: 'Quin Master', job: 'Quartermaster', command: 1 };

let at = 10_000;
const tech = (people: any[]) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `orders-${at}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.orderable = ['Janitorial Supplies Crate'];
  at += 5000; // each brain its own asking, so takeOrder's claim from one case does not carry over
  b.now = at;
  b.peopleInView = people.map((person) => ({ ...person, place: 'Cargo Bay', distance: 1 }));
  return b;
};
const toMe = (who: any, text: string) => `${says(who, text)}`.replace(/\)$/, ', speaking to you)');
const agrees = (b: any, line: string) => CARGO.agrees(b, { tool: 'order' }, line);
/** The line brain.ts would take the order from: the newest heard line that agrees. */
const calledFor = (b: any, lines: string[]) => [...lines].reverse().find((line) => agrees(b, line)) ?? null;

{
  const b = tech([HOP, JAN]);
  const lines = [toMe(JAN, 'Sam, could you order me a crate of soap?'), toMe(HOP, 'Morning, Sam.')];
  add('a janitor asks, the head says good morning: no line calls for an order', calledFor(b, lines), null);
  add('and the order is offered (a head spoke)', CARGO.offers(b, b.peopleInView).map((it: any) => it.tool), ['order']);
}
{
  const b = tech([HOP, JAN]);
  const ask = toMe(HOP, 'Sam, could you order a crate of janitorial supplies for my staff?');
  const lines = [ask, toMe(JAN, 'Thanks, Sam.')];
  add('the head asks, the janitor thanks: the head\'s line calls for it', calledFor(b, lines), ask);
}
{
  const b = tech([HOP]);
  add('the head\'s line said to someone else calls for nothing', agrees(b, `${says(HOP, 'Maria, bring the crate over.')}`.replace(/\)$/, ', speaking to Maria Lee)')), false);
}
{
  const b = tech([GEAR, HOP]);
  add('"Morning, Sam." from a Gearhart is no ask, and he is no head', agrees(b, toMe(GEAR, 'Morning, Sam.')), false);
  add('"Morning, Sam." from the head is no ask either', agrees(b, toMe(HOP, 'Morning, Sam.')), false);
}
{
  // The head said it and walked on out of sight before the technician's turn: known from the PDA list.
  const b = tech([]);
  b.pdaPeople = [{ name: HOP.name, job: HOP.job }];
  add('a head out of sight now, known by the PDA list, still called for it', agrees(b, toMe(HOP, 'Sam, could you order a crate of soap?')), true);
  const c = tech([]);
  c.pdaPeople = [{ name: JAN.name, job: JAN.job }];
  add('a janitor out of sight, known by the PDA list, did not', agrees(c, toMe(JAN, 'Sam, could you order a crate of soap?')), false);
}
{
  // With a Quartermaster aboard, only the head who said the Quartermaster did not answer.
  const b = tech([HOP, JAN, { ...QM, place: 'Quartermaster\'s Office' }]);
  b.pdaPeople = [{ name: QM.name, job: QM.job }];
  const ask = toMe(HOP, 'Sam, could you order a crate of soap?');
  const quiet = CARGO.agrees(b, { tool: 'order' }, ask);
  b.qmSilent = { by: HOP.name, at: b.now };
  const c = tech([HOP, { ...QM, place: 'Quartermaster\'s Office' }]);
  c.pdaPeople = [{ name: QM.name, job: QM.job }];
  c.qmSilent = { by: 'Ada Stone', at: c.now };
  add('Quartermaster aboard and not said to be silent: no order is agreed to', quiet, false);
  add('the head who said it did not answer: agreed to', agrees(b, ask), true);
  add('the Quartermaster said silent by someone else: not this head', agrees(c, toMe(HOP, 'Sam, could you order a crate of soap?')), false);
}
{
  const b = tech([HOP]);
  add('anything but an order is not looked at', CARGO.agrees(b, { tool: 'say' }, toMe(JAN, 'hello')), true);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
