// TRB-06 on the officer: someone it put in a cell and then sees out of one before their time (let
// out by someone, or broken out) is no longer taken to be in a cell. The jailed entry goes, the
// head is told in fixed words, and a new warrant on them is served (inCells, seenOutEarly,
// syncBeat in CrewBrain/jobs/arrests.ts). No model is called and no station is simulated.
//
//   bun run arrests-trb06.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const S = await import(ROOT + 'jobs/security');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const DANA = { handle: 'p9', name: 'Dana Reyes', job: 'Assistant', place: 'Brig', distance: 2 };
const cellView = (running: number | null, occupants: string[] | null) => [{ name: 'Cell 1', running, left: running ? 200 : null, occupants, room: 'Brig', dist: 3 }];
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer that has just put Dana Reyes in Cell 1 for 15 minutes, at 5000, through the jail's own result. */
const officer = () => {
  const o: any = makeBrain('Casey Cooper', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Brig', 'Central Primary Hallway']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: 'Dana Reyes', health: 90, baton_seen: null, cells: cellView(null, null) };
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 15, byCaptain: true });
  at(o, 5000, 'Brig', [{ ...DANA, cuffed: 1, pulled_by: 'Casey Cooper' }]);
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = 4990;
  w.cuffedByMe = true;
  const task = open(o, 'serve_warrant');
  const act = A.planBeat(o, task)?.act;
  A.beatAfterActing(o, act, task, true, { cell: 'Cell 1', minutes: 15, prisoner: 'Dana Reyes' });
  A.takeOutcomes(o);
  o.security.holding = null;
  return o;
};
const look = (o: any, now: number, place: string, people: any[], cells: any[]) => {
  at(o, now, place, people);
  o.security.cells = cells;
  A.syncBeat(o);
};

{
  const o = officer();
  add('jailed: the entry carries when', A.beatOf(o).jailed['Dana Reyes']?.at, 5000);
  look(o, 5100, 'Brig', [DANA], cellView(1, ['Dana Reyes']));
  add('seen inside a running cell: still jailed, nothing told', [!!A.beatOf(o).jailed['Dana Reyes'], A.takeOutcomes(o)], [true, []]);
  look(o, 6000, 'Central Primary Hallway', [{ ...DANA, place: 'Central Primary Hallway' }], cellView(null, null));
  add('seen out for a moment only, it is not yet taken as out', !!A.beatOf(o).jailed['Dana Reyes'], true);
  look(o, 6030, 'Central Primary Hallway', [{ ...DANA, place: 'Central Primary Hallway' }], cellView(null, null));
  add('seen in a hallway before their time: no longer jailed', A.beatOf(o).jailed['Dana Reyes'], undefined);
  const outcomes = A.takeOutcomes(o);
  add('and the head is told she is out of Cell 1 early', outcomes.map((it: any) => S.outcomeLine('Joan', it)), ['Joan, Dana Reyes is out of Cell 1 before their time.']);
  add('told once only', (look(o, 6050, 'Central Primary Hallway', [{ ...DANA, place: 'Central Primary Hallway' }], cellView(null, null)), A.takeOutcomes(o)), []);
  // A new warrant on her: she is served.
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'breaking out', minutes: 10, byCaptain: true });
  look(o, 6100, 'Central Primary Hallway', [{ ...DANA, place: 'Central Primary Hallway' }], cellView(null, null));
  const task = open(o, 'serve_warrant');
  add('a new warrant on her: the serve is urgent', task?.urgency, 'emergency');
  add('and it goes at her: the arrest line, not "is not in the"', /under arrest/.test(A.planBeat(o, task)?.step ?? ''), true);
}
{
  // Seen out of a cell a moment after the jailing: what it sees of the cells may lag.
  const o = officer();
  look(o, 5080, 'Brig', [DANA], cellView(null, null));
  add('8 s after the jailing, a cell not yet seen running: still jailed', [!!A.beatOf(o).jailed['Dana Reyes'], A.takeOutcomes(o)], [true, []]);
}
{
  // Out of sight: nothing is known, the term stands.
  const o = officer();
  look(o, 7000, 'Security Office', [], cellView(null, null));
  add('out of sight: still jailed', !!A.beatOf(o).jailed['Dana Reyes'], true);
}
{
  // In view inside a cell whose timer was stopped: out before her time all the same.
  const o = officer();
  look(o, 7000, 'Brig', [DANA], cellView(0, ['Dana Reyes']));
  look(o, 7030, 'Brig', [DANA], cellView(0, ['Dana Reyes']));
  add('in a cell whose timer is stopped: no longer jailed', [A.beatOf(o).jailed['Dana Reyes'], A.takeOutcomes(o).map((it: any) => it.why)], [undefined, [S.EARLY]]);
}
{
  // Her term is up by the clock: the entry goes quietly, as before.
  const o = officer();
  look(o, 5000 + 15 * 600 + 10, 'Central Primary Hallway', [{ ...DANA, place: 'Central Primary Hallway' }], cellView(null, null));
  add('time up: gone, nothing told', [A.beatOf(o).jailed['Dana Reyes'], A.takeOutcomes(o)], [undefined, []]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
