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

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
