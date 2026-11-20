// An arrest the driver sent another step over (ARR-08 step 3): drive (CrewBrain/driver.ts) keeps
// it in brain.droppedArrest, and syncBeat (jobs/arrests.ts, ownArrestOf) takes someone seen in
// cuffs nobody else holds, within ten seconds of it, as cuffed by its own hand. No model is called.
//
//   bun run arrests3-dropped.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { drive } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
const DANA = { handle: 'p5', name: 'Dana Reyes', job: 'Assistant', place: 'Bar', distance: 1 };
/** An officer in the Bar with no baton, a warrant on Dana Reyes in sight, its arrest of her under way, and struck by Brick Lane. */
const officer = () => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.id = `dropped${++ids}`;
  o.post = 'Security Office';
  o.pdaPeople = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
  o.pendingSpeakers = new Set();
  know(o, ['Security Office', 'Bar', 'Brig']);
  o.security = { has_baton: 0, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [DANA]);
  A.beatOf(o).warrants[0].toldAt = 4990;
  A.syncBeat(o);
  const dana = o.tasks.find((it: any) => it.kind === 'serve_warrant' && it.state !== 'done');
  o.lastAct = { key: 'x', tool: 'arrest', at: Date.now(), act: { tool: 'arrest', person: 'p5', how: 'quiet' }, task: dana.id };
  A.securityFeels(o, { details: { struck_name: 'Brick Lane', struck_by: 'p3' } });
  A.syncBeat(o);
  return { o, dana };
};
const sent = (o: any) => {
  const issued: any[] = [];
  o.driveAfter = 0;
  drive(o, (act: any) => { issued.push(act); return act.tool; }, () => {});
  return issued.map((act) => act.tool);
};
const cuffedSeen = (o: any, now: number, pulledBy: string | null | undefined) => {
  const dana: any = { ...DANA, cuffed: 1 };
  if (pulledBy !== undefined) dana.pulled_by = pulledBy;
  o.now = now;
  o.peopleInView = [dana];
};

{
  const { o, dana } = officer();
  add('struck mid-arrest with no baton: the get-away step goes over the arrest', sent(o), ['get_kit']);
  add('the driver keeps the arrest it sent over: its task, whom, and when', o.droppedArrest, { task: dana.id, person: 'p5', at: 5000 });
  A.takeOutcomes(o);
  cuffedSeen(o, 5040, null);
  A.syncBeat(o);
  add('four seconds on, she is seen in cuffs nobody holds: they are its own cuffs', A.beatOf(o).warrants[0].cuffedByMe, true);
  add('and the list hears she is cuffed, once', [A.takeOutcomes(o), (A.syncBeat(o), A.takeOutcomes(o))], [[{ what: 'cuffed', name: 'Dana Reyes' }], []]);
}
{
  const { o } = officer();
  sent(o);
  cuffedSeen(o, 5040, 'Hale Stone');
  A.syncBeat(o);
  add('seen in cuffs in its own hold: its own', A.beatOf(o).warrants[0].cuffedByMe, true);
}
{
  const { o } = officer();
  sent(o);
  cuffedSeen(o, 5200, null);
  A.syncBeat(o);
  add('twenty seconds on: not taken as its own', !!A.beatOf(o).warrants[0].cuffedByMe, false);
}
{
  const { o } = officer();
  sent(o);
  cuffedSeen(o, 5040, 'Joan Hale');
  A.syncBeat(o);
  add('in someone else\'s hold: not its own', !!A.beatOf(o).warrants[0].cuffedByMe, false);
}
{
  const { o } = officer();
  sent(o);
  cuffedSeen(o, 5040, undefined);
  A.syncBeat(o);
  add('the server not saying who holds her: not its own (as before)', !!A.beatOf(o).warrants[0].cuffedByMe, false);
}
{
  // No arrest was sent over: someone seen in cuffs is someone else's arrest, as before.
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  know(o, ['Security Office', 'Bar']);
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [{ ...DANA, cuffed: 1, pulled_by: null }]);
  A.syncBeat(o);
  add('no arrest of its own: cuffs seen are not its own', [!!A.beatOf(o).warrants[0].cuffedByMe, A.takeOutcomes(o)], [false, []]);
  // Its own arrest still under way (no answer yet) counts.
  const task = o.tasks.find((it: any) => it.kind === 'serve_warrant' && it.state !== 'done');
  o.lastAct = { key: 'y', tool: 'arrest', at: Date.now(), act: { tool: 'arrest', person: 'p5', how: 'quiet' }, task: task.id };
  A.syncBeat(o);
  add('its own arrest under way and the cuffs seen on: its own', A.beatOf(o).warrants[0].cuffedByMe, true);
}
{
  // A stop sent over is not an arrest on a warrant.
  const { o } = officer();
  o.lastAct.act.how = 'stop';
  add('a stop sent over is not kept', [sent(o), o.droppedArrest ?? null], [['get_kit'], null]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
