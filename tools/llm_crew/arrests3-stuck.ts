// An officer that has put its prisoner in a cell, let go and taken the cuffs off, and then cannot
// get back out past them to the timer (PLAY-01 step 3): beatAfterActing and serveStep in
// CrewBrain/jobs/arrests.ts. The server says "stuck_inside". That is not a cell refusing them: no
// cell try is counted, nobody is arrested again, and the same jail is sent so that the server only
// walks out and starts that cell's timer. No model is called and no station is simulated.
//
//   bun run arrests3-stuck.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const SUN = { handle: 'p3', name: 'Sunshine Langston', job: 'Head of Personnel', place: 'Brig', distance: 1 };
const cells = [1, 2, 3].map((n) => ({ name: `Cell ${n}`, running: null, left: null, occupants: null, room: 'Brig', dist: 2 }));
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');
const STUCK = { reason: 'stuck_inside', prisoner: 'Sunshine Langston', cell: 'Cell 1' };

/** An officer in the Brig with Sunshine Langston in cuffs and by the arm, about to jail her. */
const officer = () => {
  const o: any = makeBrain('Casey Cooper', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: 'Sunshine Langston', health: 90, baton_seen: null, cells };
  A.giveWarrant(o, { name: 'Sunshine Langston', reason: 'theft', minutes: 5, byCaptain: true });
  at(o, 5000, 'Brig', [{ ...SUN, cuffed: 1, pulled_by: 'Casey Cooper' }]);
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = 4990;
  w.cuffedByMe = true;
  return { o, w, task: open(o, 'serve_warrant') };
};
/** The jail came back stuck inside: let go, cuffs off, she stands in the cell. */
const stuckAt = (f: any, now: number, details: any = STUCK) => {
  const act = A.planBeat(f.o, f.task)?.act;
  A.beatAfterActing(f.o, act, f.task, false, details);
  f.o.security.holding = null;
  at(f.o, now, 'Brig', [{ ...SUN }]);
  A.syncBeat(f.o);
};

{
  const f = officer();
  add('held in cuffs: it jails her', A.planBeat(f.o, f.task)?.act?.tool, 'jail');
  stuckAt(f, 5050);
  add('stuck_inside: no cell try is counted', f.w.cellTries ?? 0, 0);
  add('stuck_inside: no cell is waited on', f.w.cellFailedAt, undefined);
  const plan = A.planBeat(f.o, f.task);
  add('stuck_inside: not arrested again: the same jail is sent', [plan?.ready, plan?.act?.tool, plan?.act?.minutes], [true, 'jail', 5]);
  add('stuck_inside: the step says it is stepping out to the timer of Cell 1', /Cell 1.*timer/.test(plan?.step ?? ''), true);
  add('stuck_inside: the try is numbered afresh, so the driver does not hold it back', plan?.act?.attempt, 2);
  add('stuck_inside: nothing is told', A.takeOutcomes(f.o), []);
  // The second go works.
  A.beatAfterActing(f.o, plan?.act, f.task, true, { cell: 'Cell 1', minutes: 5, prisoner: 'Sunshine Langston' });
  add('then the timer is started: she is jailed and the warrant is gone', [A.beatOf(f.o).warrants.length, A.beatOf(f.o).jailed['Sunshine Langston']?.cell], [0, 'Cell 1']);
}
{
  // Stuck every time: it gives the walk out two more goes, then goes back to serving the warrant.
  const f = officer();
  stuckAt(f, 5050);
  stuckAt(f, 5080);
  add('stuck twice: the jail is sent again', A.planBeat(f.o, f.task)?.act?.tool, 'jail');
  stuckAt(f, 5110);
  add('stuck three times: no more jail without a hold; it goes at her as for any arrest', A.planBeat(f.o, f.task)?.act?.tool, 'arrest');
  add('and still no cell was counted as refusing her', f.w.cellTries ?? 0, 0);
}
{
  // Too long since it was stuck: a crew prisoner is free to go by then.
  const f = officer();
  stuckAt(f, 5050);
  at(f.o, 5300, 'Brig', [{ ...SUN }]);
  add('stuck, and 25 seconds have gone by: it arrests her again', A.planBeat(f.o, f.task)?.act?.tool, 'arrest');
}
{
  // The finish jail comes back with nobody held: she left the cell. That is losing her, as before.
  const f = officer();
  stuckAt(f, 5050);
  const act = A.planBeat(f.o, f.task)?.act;
  A.beatAfterActing(f.o, act, f.task, false, { reason: 'got_away', prisoner: 'Sunshine Langston', cell: 'Cell 1', place: 'Brig' });
  add('she walked out before the timer: lost, and the stuck mark is gone', [A.takeOutcomes(f.o).map((it: any) => it.what), A.planBeat(f.o, f.task)?.act?.tool === 'jail'], [['lost'], false]);
}
{
  // The walk in still works as before: refused on the way in, by the arm, the next cell at once.
  const f = officer();
  const act = A.planBeat(f.o, f.task)?.act;
  A.beatAfterActing(f.o, act, f.task, false, { reason: 'no_way', prisoner: 'Sunshine Langston', cell: 'Cell 1' });
  add('no_way on the walk in: one cell try, and the next jail at once', [f.w.cellTries, A.planBeat(f.o, f.task)?.act?.tool], [1, 'jail']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
