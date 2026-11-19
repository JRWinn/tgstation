// One emergency under way is not dropped for another (ARR-08, rest): drive's orderToDrop
// (CrewBrain/driver.ts) holds on while the step the body was last sent was for an emergency task,
// unless the other's step may break in (Plan.breaksIn: getting out of an attacker's reach, in
// jobs/arrests.ts planBeat). No model is called.
//
//   bun run driver2-emergency.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { drive } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
const PUN = { handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 4 };
const DANA = { handle: 'p5', name: 'Dana Reyes', job: 'Assistant', place: 'Bar', distance: 3 };
/** An officer in the Bar with warrants on Pun Pun (given first) and Dana Reyes, both in sight. */
const officer = (baton = true) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.id = `emergency${++ids}`;
  o.post = 'Security Office';
  o.pdaPeople = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
  o.pendingSpeakers = new Set();
  know(o, ['Security Office', 'Bar', 'Brig']);
  o.security = { has_baton: baton ? 1 : 0, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [PUN, DANA]);
  for (const warrant of A.beatOf(o).warrants) warrant.toldAt = 4990;
  A.syncBeat(o);
  return o;
};
const serveOf = (o: any, name: string) => o.tasks.find((it: any) => it.kind === 'serve_warrant' && it.item === name && it.state !== 'done');
const sent = (o: any) => {
  const issued: any[] = [];
  o.driveAfter = 0;
  drive(o, (act: any) => { issued.push(act); return act.tool; }, () => {});
  return issued.map((act) => `${act.tool}${act.person ? ` ${act.person}` : ''}${act.place ? ` ${act.place}` : ''}`);
};

{
  const o = officer();
  const pun = serveOf(o, 'Pun Pun');
  const dana = serveOf(o, 'Dana Reyes');
  add('(both warrants are emergencies, Pun Pun\'s first)', [pun?.urgency, dana?.urgency, o.tasks.indexOf(pun) < o.tasks.indexOf(dana)], ['emergency', 'emergency', true]);
  o.lastAct = { key: 'x', tool: 'approach', at: Date.now(), act: { tool: 'approach', person: 'p5' }, task: dana.id };
  add('walking up to Dana: Pun Pun, the older warrant, in sight does not break it off', sent(o), []);
}
{
  const o = officer();
  const dana = serveOf(o, 'Dana Reyes');
  o.lastAct = { key: 'x', tool: 'approach', at: Date.now(), act: { tool: 'approach', person: 'p5' }, task: dana.id };
  // Struck, with no baton to stop them: getting away has to break in.
  o.security.has_baton = 0;
  A.securityFeels(o, { details: { struck_name: 'Brick Lane', struck_by: 'p3' } });
  A.syncBeat(o);
  const away = o.tasks.find((it: any) => it.kind === 'get_away' && it.state !== 'done');
  add('(struck with no baton: a get-away task, an emergency)', away?.urgency, 'emergency');
  add('(its step may break in)', A.planBeat(o, away)?.breaksIn, true);
  // Before, it dropped Dana for Pun Pun, whose warrant ranks first; now getting away goes first.
  add('struck walking up to Dana: it breaks off to get its baton, not to go after Pun Pun', sent(o), ['get_kit']);
}
{
  // With nothing ranked above it, getting away breaks off the arrest under way.
  const o = officer();
  o.tasks = o.tasks.filter((it: any) => it.item !== 'Pun Pun');
  A.beatOf(o).warrants = A.beatOf(o).warrants.filter((it: any) => it.name !== 'Pun Pun');
  o.security.has_baton = 0;
  A.securityFeels(o, { details: { struck_name: 'Brick Lane', struck_by: 'p3' } });
  A.syncBeat(o);
  const dana = serveOf(o, 'Dana Reyes');
  o.lastAct = { key: 'x', tool: 'arrest', at: Date.now(), act: { tool: 'arrest', person: 'p5', how: 'quiet' }, task: dana.id };
  add('struck in the middle of arresting Dana with no baton: it breaks off to get away', sent(o), ['get_kit']);
}
{
  // Struck with its baton in hand, it stops them: no getting away, and the arrest goes on.
  const o = officer();
  const dana = serveOf(o, 'Dana Reyes');
  o.lastAct = { key: 'x', tool: 'arrest', at: Date.now(), act: { tool: 'arrest', person: 'p5', how: 'quiet' }, task: dana.id };
  A.securityFeels(o, { details: { struck_name: 'Brick Lane', struck_by: 'p3' } });
  A.syncBeat(o);
  add('struck with a baton, mid-arrest: no get-away task', o.tasks.some((it: any) => it.kind === 'get_away' && it.state !== 'done'), false);
}
{
  const o = officer();
  o.lastAct = null;
  o.walking = false;
  add('nothing under way: the older warrant is gone after', sent(o)[0]?.endsWith('p9'), true);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
