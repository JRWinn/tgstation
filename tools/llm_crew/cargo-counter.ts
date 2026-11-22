// What a technician says to a head at the counter about its order (TRA-04, TRA-02): having placed
// it, "<first>, I have put your order in: ..."; asked again for a kind it is holding for them,
// "<first>, your order has come in: crate #N (...)" and no second order. No model is called
// (CrewBrain/jobs/cargo.ts, afterActing, overhears, offers, hears).
//
//   bun run cargo-counter.ts
const { ROOT, makeBrain, says } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const S = await import(ROOT + 'jobs/supply');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HOP = {
  handle: 'p1',
  name: 'Hal Pott',
  job: 'Head of Personnel',
  command: 1,
};
let at = 20_000;
const tech = () => {
  const b: any = makeBrain('Cora Tech', 'Cargo Technician');
  b.id = `counter-${at}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Lobby';
  b.orderable = ['Janitorial Supplies Crate', 'Replacement Lights'];
  at += 5000;
  b.now = at;
  b.peopleInView = [{ ...HOP, place: 'Cargo Lobby', distance: 1 }];
  b.heldCrates = [];
  return b;
};
const lines = (b: any) => b.toTell.map((tell: any) => tell.line);

// TRA-04: the order placed for a head at the counter is told to them in so many words.
{
  const b = tech();
  CARGO.afterActing(
    b,
    {
      tool: 'order',
      crate: 'Janitorial Supplies Crate',
      count: 2,
      items: [{ crate: 'Janitorial Supplies Crate', count: 2 }],
      for: 'p1',
    },
    undefined,
    true,
    false,
    { ok: true },
    'You order 2 Janitorial Supplies Crate for Hal Pott at the supply console and call the shuttle. It will be a few minutes. You will know when it docks.',
  );
  add('placed for Hal: Hal is told', lines(b), [
    'Hal, I have put your order in: 2 crates of janitorial supplies. I will send you the manifest number when it comes in.',
  ]);
  add(
    'in the words the head reads',
    S.PLACED_WORDS.test(lines(b)[0] ?? ''),
    true,
  );
  add('said word for word', b.toTell[0]?.exact, true);
}
{
  const b = tech();
  b.peopleInView = [];
  CARGO.afterActing(
    b,
    { tool: 'order', crate: 'Replacement Lights', count: 1 },
    undefined,
    true,
    false,
    { ok: true },
    'You order 1 Replacement Lights for Hal Pott at the supply console and call the shuttle.',
  );
  add(
    'the asker out of sight: named from the result',
    b.toTell.map((tell: any) => tell.to),
    ['Hal Pott'],
  );
}
{
  const b = tech();
  CARGO.afterActing(
    b,
    { tool: 'order', crate: 'Replacement Lights', count: 1, for: 'p1' },
    undefined,
    false,
    false,
    { ok: false },
    'The console will not take it.',
  );
  add('not placed: nothing said of it', lines(b), []);
  CARGO.afterActing(
    b,
    { tool: 'order', crate: 'Replacement Lights', count: 1, for: 'p1' },
    undefined,
    true,
    false,
    { ok: true, numbers: [12] },
    'The supply shuttle has docked with what you ordered for Hal Pott (1 Replacement Lights): crate #12.',
  );
  add('the shuttle docking is not the order placed', lines(b), []);
}
{
  const b = tech();
  CARGO.afterActing(
    b,
    {
      tool: 'order',
      crate: 'Replacement Lights',
      count: 1,
      for_name: 'Hal Pott',
      via: 'Quin Master',
      ref: 3,
    },
    { id: 1, kind: 'given_order', state: 'open' },
    true,
    false,
    { ok: true },
    'You order 1 Replacement Lights for Hal Pott at the supply console and call the shuttle.',
  );
  add(
    'an order the Quartermaster gave: the head is not told by the technician',
    lines(b),
    [],
  );
}

// TRA-02: asked again for what it is holding for them.
const held = (b: any) => {
  b.heldCrates = [
    {
      number: 12,
      for: 'Hal Pott',
      what: 'Janitorial Supplies Crate',
      place: 'Cargo Bay',
      out: false,
      takenBy: null,
      waited: 3000,
    },
  ];
};
const ask = (b: any, text: string) =>
  CARGO.overhears(b, {
    kind: 'speech',
    details: { speaker: 'Hal Pott', message: text, said_to: 'me' },
  });
{
  const b = tech();
  held(b);
  ask(
    b,
    'Cora, I need to order a crate of janitorial supplies for my staff, please.',
  );
  add('the same kind asked for again: told it has come in', lines(b), [
    'Hal, your order has come in: crate #12 (Janitorial Supplies Crate). Send someone to the Cargo Lobby counter with the number to collect it.',
  ]);
  add(
    'no order offered',
    CARGO.offers(b, b.peopleInView).map((it: any) => it.tool),
    [],
  );
  add(
    'and the plain fallback orders nothing',
    CARGO.hears(
      b,
      says(
        HOP,
        'Cora, I need to order a crate of janitorial supplies for my staff, please.',
      ).replace(/\)$/, ', speaking to you)'),
    ),
    null,
  );
}
{
  const b = tech();
  held(b);
  ask(b, 'Cora, I need to order a crate of replacement lights, please.');
  add('another kind: nothing said of the held crate', lines(b), []);
  add(
    'and the order is offered',
    CARGO.offers(b, b.peopleInView).map((it: any) => it.tool),
    ['order'],
  );
}
{
  const b = tech();
  held(b);
  b.heldCrates[0].out = true;
  ask(b, 'Cora, I need to order a crate of janitorial supplies, please.');
  add(
    'the crate already out for them: ordered as usual',
    CARGO.offers(b, b.peopleInView).map((it: any) => it.tool),
    ['order'],
  );
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`,
  );
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
