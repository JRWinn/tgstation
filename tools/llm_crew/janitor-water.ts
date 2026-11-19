// Where a janitor with a dry mop goes to wet it, case by case (JAN-04). No model is called: this
// is all decided in code (CrewBrain/jobs/janitor.ts, supplyStep), so it can be checked in a second.
//
//   bun run janitor-water.ts
const { ROOT, at, janitor } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const SUPPLIES = { kind: 'supplies' } as any;
const goesTo = (b: any) => {
  const step = JANITOR.plan(b, SUPPLIES);
  return step?.act?.tool === 'go_to' ? step.act.place : (step?.act?.tool ?? null);
};

// A mop gone dry, two rooms remembered with a sink: Medbay Central (a sink seen through glass it
// cannot get to) and the Custodial Closet. Each is seen once, standing in it.
const dry = () => {
  const b: any = janitor('mop');
  at(b, 2000, 'Medbay Central', [], [{ name: 'sink', kind: 'thing' }]);
  at(b, 2100, 'Custodial Closet', [], [{ name: 'sink', kind: 'thing' }]);
  at(b, 2200, 'Central Primary Hallway');
  b.dryMop = true;
  return b;
};

{
  const b = dry();
  add('away from both, a dry mop goes to the first room it remembers a sink in', goesTo(b), 'Medbay Central');
}
{
  const b = dry();
  // In Medbay Central with the sink in sight, and still told the mop is dry: it cannot get to it.
  at(b, 3100, 'Medbay Central', [], [{ name: 'sink', kind: 'thing' }]);
  b.dryMop = true;
  add('where the only sink cannot be got to: it goes to the closet', goesTo(b), 'Custodial Closet');
  // Out in the hallway again, it is not sent back.
  at(b, 3200, 'Central Primary Hallway');
  b.dryMop = true;
  add('back in the hallway: not sent back to the sink it could not get to', goesTo(b), 'Custodial Closet');
  // Five minutes on, it may be tried again: a door that was shut may be open now.
  at(b, 3100 + 3000, 'Central Primary Hallway');
  b.dryMop = true;
  add('five minutes on, it is tried again', goesTo(b), 'Medbay Central');
}
{
  const b = dry();
  // Medbay Central struck off, then the closet, where the mop was wetted: the closet is not struck off.
  at(b, 3100, 'Medbay Central', [], [{ name: 'sink', kind: 'thing' }]);
  b.dryMop = true;
  goesTo(b);
  at(b, 3200, 'Custodial Closet', [], [{ name: 'sink', kind: 'thing' }]);
  b.dryMop = false;
  goesTo(b);
  at(b, 3300, 'Central Primary Hallway');
  b.dryMop = true;
  add('a room where water was to hand is not struck off', goesTo(b), 'Custodial Closet');
}
{
  const b: any = janitor('mop');
  at(b, 2000, 'Medbay Central', [], [{ name: 'sink', kind: 'thing' }]);
  at(b, 3100, 'Medbay Central', [], [{ name: 'sink', kind: 'thing' }]);
  b.dryMop = true;
  add('the only sink it knows cannot be got to: it looks for another', goesTo(b), 'explore');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
