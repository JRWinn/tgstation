// The owner's answers of 2026-11-22 for security's window code, case by case (CrewBrain/jobs/arrests.ts,
// jobs/officer.ts, jobs/desk.ts). No model is called and no station is simulated.
//
//   bun run secwin-answers.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const officer = (pda: any[] = PDA) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = pda;
  know(o, ['Security Office', 'Bar', 'Brig', 'Cargo Bay', "Quartermaster's Office"]);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  return o;
};
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

// ---- ARR-02 step 3: a wanted keeper who walks the officer out of its room is fighting back
{
  const o = officer();
  A.giveWarrant(o, { name: 'Quin Mark', reason: 'theft', minutes: 5 });
  at(o, 5000, "Quartermaster's Office", [{ handle: 'p4', name: 'Quin Mark', job: 'Quartermaster', place: "Quartermaster's Office", distance: 1, command: 1 }]);
  A.securityFeels(o, { kind: 'walked_out', at: 5000, text: 'Quin Mark walks you out of the Quartermaster\'s Office.', details: { by: 'Quin Mark' } });
  const warrant = A.beatOf(o).warrants[0];
  add('ARR-02: walked out by the one the warrant is on: resisting (five minutes more), and served at once', [warrant.resisted, warrant.force], [true, true]);
  add('ARR-02: and no stranger to stop', A.beatOf(o).attacker ?? null, null);
}
{
  const o = officer();
  A.giveWarrant(o, { name: 'Quin Mark', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Cargo Bay');
  A.securityFeels(o, { kind: 'knowledge', at: 5000, text: '', details: { reason: 'walked_out_by_wanted', by: 'Quin Mark' } });
  add('ARR-02: the reason walked_out_by_wanted reads the same', A.beatOf(o).warrants[0].resisted, true);
}
{
  const o = officer();
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Cargo Bay');
  A.securityFeels(o, { kind: 'walked_out', at: 5000, text: '', details: { by: 'Cora Tech' } });
  add('ARR-02: walked out by a keeper with no warrant on them: no resisting, nobody to stop', [A.beatOf(o).warrants[0].resisted, A.beatOf(o).attacker ?? null], [false, null]);
}

// ---- DESK-05 A: with no Head of Security, each officer serves the warrants declared to it
{
  const D = await import(ROOT + 'jobs/desk');
  const OFFICER = (await import(ROOT + 'jobs/index')).jobFor('Security Officer');
  const o = officer([{ name: 'Dana Reyes', job: 'Security Officer' }, { name: 'Zim Fire', job: 'Captain' }]);
  at(o, 5000, 'Security Office');
  D.deskTakes(o, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for wrecking the Custodial Closet.', false);
  OFFICER.syncTasks(o);
  D.syncDesk(o);
  add('DESK-05: the officer that was told keeps the warrant in its own hands', A.beatOf(o).warrants.map((w: any) => w.name), ['Pun Pun']);
  add('DESK-05: and gives it to no other officer', o.toTell.filter((t: any) => t.to === 'Dana Reyes').map((t: any) => t.line), []);
  OFFICER.syncTasks(o);
  add('DESK-05: it has a warrant to serve', !!o.tasks.find((t: any) => t.kind === 'serve_warrant' && t.state !== 'done'), true);
}

// ---- ARR-08 A: stopping an attacker with no warrant breaks in on an arrest under way
{
  const { drive } = await import(ROOT + 'driver');
  const o = officer();
  o.id = 'arr08stop';
  o.pendingSpeakers = new Set();
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  const BRICK = { handle: 'p3', name: 'Brick Lane', job: 'Assistant', place: 'Bar', distance: 1 };
  at(o, 5000, 'Bar', [{ handle: 'p5', name: 'Dana Reyes', job: 'Assistant', place: 'Bar', distance: 3 }, BRICK]);
  A.beatOf(o).warrants[0].toldAt = 4990;
  A.syncBeat(o);
  const dana = o.tasks.find((it: any) => it.kind === 'serve_warrant' && it.state !== 'done');
  o.lastAct = { key: 'x', tool: 'arrest', at: Date.now(), act: { tool: 'arrest', person: 'p5', how: 'quiet' }, task: dana.id };
  A.securityFeels(o, { details: { struck_name: 'Brick Lane', struck_by: 'p3' } });
  A.syncBeat(o);
  const stop = open(o, 'stop_attacker');
  add('ARR-08: the stop step may break in', A.planBeat(o, stop)?.breaksIn, true);
  const issued: any[] = [];
  o.driveAfter = 0;
  drive(o, (act: any) => { issued.push(act); return act.tool; }, () => {});
  add('ARR-08: struck mid-arrest with a baton: it stops the attacker', issued.map((act) => `${act.tool} ${act.person} ${act.how}`), ['arrest p3 stop']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
