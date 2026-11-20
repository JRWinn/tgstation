// A door the body stands at, opened by hand by someone who holds none for it (ARR-06, the
// window's part: inBackoff and nextStep in CrewBrain/driver.ts). The walk through is not held
// back by a walk there that failed a moment before: the door will not stay open. The officer is
// the one from arrests3-opendoor.ts, at the Bar's door, having asked the Captain.
// No model is called and no station is simulated.
//
//   bun run driver4-dooropen.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { nextStep } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];

/** An officer at the Bar's door, shut out of the Bar where Pun Pun was seen, having asked the Captain. */
function officer() {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  o.hasPda = true;
  know(o, ['Security Office', 'Bar', 'Central Primary Hallway', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Central Primary Hallway', []);
  o.blockedPlaces = ['Bar'];
  o.atDoorOf = 'Bar';
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = o.now - 10;
  w.lastSeen = { place: 'Bar', at: o.now - 10 };
  w.shutOut = { place: 'Bar', at: o.now - 5, keepers: ['Zim Fire'], asked: ['Zim Fire'], askedAt: o.now - 5, door: 'Bar', doorTries: 0 };
  return o;
}
const what = (step: any) => (step ? `${step.act?.tool ?? 'say'}${step.act?.place ? ` ${step.act.place}` : ''}` : null);

{
  const o = officer();
  o.atDoorOpen = true;
  const step: any = nextStep(o);
  add('the door it asked at is opened by hand: it walks in', what(step), 'go_to Bar');
  // The walk failed a moment ago (the door shut on it), and the door is opened again.
  o.failures.set(step.key, { count: 1, until: Date.now() + 20000 });
  add('a walk there that failed a moment ago does not hold it back while the door stands open', what(nextStep(o)), 'go_to Bar');
}

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
