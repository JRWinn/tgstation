// No cell will do (ARR-04): every cell is in use, or the brig has no power. serveStep, syncBeat and
// beatAfterActing in CrewBrain/jobs/arrests.ts. The officer waits with its prisoner in the brig,
// not where it made the arrest, says which it is, and after the second answer whoever keeps the
// list is told once. No model is called and no station is simulated.
//
//   bun run arrests3-nocell.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const PUN = { handle: 'p2', name: 'Pun Pun', job: '', place: 'Bar Lounge', distance: 1, cuffed: 1, pulled_by: 'Nova Aultman' };
const cells = [1, 2, 3].map((n) => ({ name: `Cell ${n}`, running: null, left: null, occupants: null, room: 'Brig', dist: 30 }));
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer in the Bar Lounge with Pun Pun in cuffs and by the arm. */
const officer = () => {
  const o: any = makeBrain('Nova Aultman', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Bar Lounge', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: 'Pun Pun', health: 90, baton_seen: null, cells };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar Lounge', [PUN]);
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = 4990;
  w.cuffedByMe = true;
  A.takeOutcomes(o);
  return { o, w, task: open(o, 'serve_warrant') };
};
const answer = (f: any, reason: string) => {
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, { reason, prisoner: 'Pun Pun' });
  A.syncBeat(f.o);
};
const cannots = (o: any) => A.takeOutcomes(o).filter((it: any) => it.what === 'cannot').map((it: any) => it.why);

{
  const f = officer();
  add('held: it jails them', A.planBeat(f.o, f.task)?.act?.tool, 'jail');
  answer(f, 'no_cell');
  const plan = A.planBeat(f.o, f.task);
  add('no cell, away from the brig: it takes them to the brig', plan?.act, { tool: 'go_to', place: 'Brig' });
  add('and says every cell is in use', /every cell is in use/.test(plan?.step ?? ''), true);
  add('one answer: nobody is told yet', cannots(f.o), []);
  at(f.o, 5050, 'Brig', [{ ...PUN, place: 'Brig' }]);
  const there = A.planBeat(f.o, f.task);
  add('in the brig: it waits there', [there?.ready, there?.wait, there?.act], [false, true, undefined]);
  at(f.o, 5400, 'Brig', [{ ...PUN, place: 'Brig' }]);
  add('30 seconds on: it tries the cells again', A.planBeat(f.o, f.task)?.act?.tool, 'jail');
  answer(f, 'no_cell');
  add('the second answer: whoever keeps the list is told, once', [cannots(f.o), (A.syncBeat(f.o), cannots(f.o))], [['every cell is in use'], []]);
  add('no cell try is counted for a full brig', f.w.cellTries ?? 0, 0);
}
{
  const f = officer();
  answer(f, 'no_power');
  add('no power, away from the brig: to the brig, saying no timer has power', [A.planBeat(f.o, f.task)?.act, /no cell's timer has power/.test(A.planBeat(f.o, f.task)?.step ?? '')], [{ tool: 'go_to', place: 'Brig' }, true]);
  at(f.o, 5050, 'Brig', [{ ...PUN, place: 'Brig' }]);
  add('in the brig, waiting: the step says the displays are blank', /blank/.test(A.planBeat(f.o, f.task)?.step ?? ''), true);
  at(f.o, 5400, 'Brig', [{ ...PUN, place: 'Brig' }]);
  answer(f, 'no_power');
  add('the second answer: "the cells have no power", once', cannots(f.o), ['the cells have no power']);
}
{
  // A cell that refuses them in between starts the count again.
  const f = officer();
  answer(f, 'no_cell');
  at(f.o, 5400, 'Brig', [{ ...PUN, place: 'Brig' }]);
  answer(f, 'no_way');
  at(f.o, 5410, 'Brig', [{ ...PUN, place: 'Brig' }]);
  answer(f, 'no_cell');
  add('no_cell, a refusal, no_cell: not told yet', cannots(f.o), []);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
