// DESK-03, the owner's answer B: a janitor with a dry mop and a rag, no water in sight, and a mess
// in another room walks to a sink it knows of to wet the mop first, then goes to the mess. No
// model is called: this is all decided in code (CrewBrain/jobs/janitor.ts, plan and sinkWalk).
//
//   bun run janitor-drymop.ts
const { ROOT, at, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const act = (b: any, task: any) => JANITOR.plan(b, task)?.act ?? null;

/** In Arrivals with a dry mop and a damp rag, a sink seen once in the Custodial Closet, and a mess known in the Bar. */
function dryAndRag(sinkKnown = true) {
  const b: any = janitor('damp rag');
  b.holding = ['mop', 'damp rag'];
  know(b, ['Arrivals']);
  if (sinkKnown) {
    at(b, 2000, 'Custodial Closet', [], [{ name: 'sink', kind: 'thing' }]);
  }
  at(b, 2200, 'Arrivals');
  b.mopNeedsWater = true;
  b.sinkInView = false;
  b.waterFrom = null;
  b.dryMop = true;
  return b;
}
const bar = { id: 90, kind: 'clean', place: 'Bar', urgency: 'routine', source: 'noticed', state: 'open' } as any;
const here = { id: 91, kind: 'clean', place: 'Arrivals', urgency: 'routine', source: 'noticed', state: 'open' } as any;

{
  const b = dryAndRag();
  add('a mess elsewhere: to the sink first', act(b, bar), { tool: 'go_to', place: 'Custodial Closet' });
  add('and it says so', /wet it before you set off for the mess in Bar/.test(JANITOR.plan(b, bar)?.step ?? ''), true);
}
{
  const b = dryAndRag();
  b.cleanableMesses = ['pool of oil'];
  b.workablePlaces = ['Arrivals'];
  add('a mess right here: cleaned with the rag', act(b, here), { tool: 'clean' });
}
{
  const b = dryAndRag(false);
  add('no sink known: it sets off with the rag', act(b, bar), { tool: 'go_to', place: 'Bar' });
}
{
  const b = dryAndRag();
  // At the sink: water in sight now, and the server no longer says the mop is dry with none to hand.
  at(b, 2400, 'Custodial Closet', [], [{ name: 'sink', kind: 'thing' }]);
  b.mopNeedsWater = true;
  b.sinkInView = true;
  b.waterFrom = 'sink';
  b.dryMop = false;
  add('at the sink: it wets the mop', act(b, bar), { tool: 'clean', wet: true });
  // Wetted: on to the mess.
  b.mopNeedsWater = false;
  b.cleaningTool = 'mop';
  add('wetted: off to the mess', act(b, bar), { tool: 'go_to', place: 'Bar' });
}
{
  const b = dryAndRag();
  // Told it has water with none in sight was the old fault: no "sink right here" without one.
  add('never "a sink right here" with none in sight', /right here/.test(JANITOR.plan(b, bar)?.step ?? ''), false);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`,
  );
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
