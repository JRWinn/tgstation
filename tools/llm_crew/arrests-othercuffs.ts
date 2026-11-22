// MULTI-01 step 5 on the officer: an arrest that answers `other_cuffs` (someone else from security
// put their cuffs on first) is no try at them and not its own cuffs; the next step leaves them to
// whoever holds them, or takes them by the arm if nobody does (beatAfterActing and serveStep in
// CrewBrain/jobs/arrests.ts). No model is called and no station is simulated.
//
//   bun run arrests-othercuffs.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [
  { name: 'Joan Hale', job: 'Head of Security' },
  { name: 'Sam Reed', job: 'Security Officer' },
  { name: 'Zim Fire', job: 'Captain' },
];
const DANA = { handle: 'p9', name: 'Dana Reyes', job: 'Assistant', place: 'Bar', distance: 1 };
const SAM = { handle: 's1', name: 'Sam Reed', job: 'Security Officer', place: 'Bar', distance: 1 };
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');
const OTHER = { reason: 'other_cuffs', handle: 'p9' };

/** An officer in the Bar with Dana Reyes in front of it, told she is under arrest. */
const officer = () => {
  const o: any = makeBrain('Casey Cooper', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Brig', 'Bar']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 5, byCaptain: true });
  at(o, 5000, 'Bar', [DANA]);
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = 4990;
  return { o, w, task: open(o, 'serve_warrant') };
};

{
  const f = officer();
  const act = A.planBeat(f.o, f.task)?.act;
  add('with her told: it goes to arrest her', act?.tool, 'arrest');
  A.beatAfterActing(f.o, act, f.task, false, OTHER);
  add('other_cuffs: no try is counted', f.w.tries, 0);
  add('other_cuffs: not its own cuffs, and nothing is told', [!!f.w.cuffedByMe, A.takeOutcomes(f.o)], [false, []]);
  add('other_cuffs: no baton next time', !!f.w.force, false);
  // Sam has her by the arm: it leaves her to Sam.
  at(f.o, 5030, 'Bar', [{ ...DANA, cuffed: 1, pulled_by: 'Sam Reed' }, SAM]);
  A.syncBeat(f.o);
  const plan = A.planBeat(f.o, f.task);
  add('in Sam\'s cuffs and by Sam\'s arm: it leaves her to Sam', [plan?.ready, /Someone else from security/.test(plan?.step ?? '')], [false, true]);
}
{
  // Nobody holds her: it takes her by the arm, quietly.
  const f = officer();
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, { ...OTHER, cuffed: 1 });
  add('other_cuffs with cuffed set: still not its own cuffs', !!f.w.cuffedByMe, false);
  at(f.o, 5030, 'Bar', [{ ...DANA, cuffed: 1, pulled_by: null }]);
  A.syncBeat(f.o);
  const plan = A.planBeat(f.o, f.task);
  add('cuffed and nobody holds her: it takes her by the arm', [plan?.act?.tool, plan?.act?.how, /nobody has them by the arm/.test(plan?.step ?? '')], ['arrest', 'quiet', true]);
}
{
  // Three of them in a row bring no "will not stand still".
  const f = officer();
  for (let i = 0; i < 3; i++) {
    A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, OTHER);
  }
  add('three other_cuffs: still no try, nothing told', [f.w.tries, A.takeOutcomes(f.o)], [0, []]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
