// A body shut in and waiting at the door still does an emergency in the room it is shut in
// (KNA-02 follow-up, nextStep in CrewBrain/driver.ts): an officer shut in the Bar with the
// person it has a warrant on beside it arrests them. Work elsewhere still waits at the door.
// No model is called and no station is simulated.
//
//   bun run driver4-shutin-arrest.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { nextStep } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];

/** An officer shut in the Bar at its door, having knocked, sent word and asked everyone in sight (Pun Pun too, once), with Pun Pun (wanted) seen in `where`. */
function shutIn(where: string) {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  o.hasPda = true;
  know(o, ['Security Office', 'Bar', 'Bar Lounge', 'Central Primary Hallway', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [{ handle: 'p9', name: 'Pun Pun', job: '', place: where, distance: 1 }]);
  o.shutIn = true;
  o.doorOpen = false;
  o.atDoorOf = 'Bar';
  o.letInBy = 'Zim Fire';
  o.doorKeepers = [];
  o.outAsks = { room: 'Bar', asked: ['Zim Fire', 'Pun Pun'], knocked: true, messaged: true, wrote: [], wroteAt: Date.now() };
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = o.now - 10;
  w.lastSeen = { place: where, at: o.now };
  return o;
}

{
  const o = shutIn('Bar');
  const step: any = nextStep(o);
  add('shut in the Bar with Pun Pun beside it: it arrests them, it does not stand at the door', [step?.act?.tool, step?.act?.person], ['arrest', 'p9']);
}
{
  // Seen through a window in the next room: the step would take it out, so it waits at the door.
  const o = shutIn('Bar Lounge');
  const step: any = nextStep(o);
  add('Pun Pun seen in another room: it does not walk off the door after them', step?.act?.tool === 'arrest' || step?.act?.tool === 'go_to', false);
}

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
