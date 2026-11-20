// An arrest that comes back with the cuffs on after its warrant has left the officer's hands
// (TRB-02, ARR-13 step 2): beatAfterActing and cuffedOnNoWarrant in CrewBrain/jobs/arrests.ts.
// The serve task may be gone by then, so the person is found by the arrest's handle, or by whom
// it holds. Someone pardoned is let go; someone still on the list it keeps is taken to a cell.
// No model is called and no station is simulated.
//
//   bun run arrests3-cuffed.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const PUN = { handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 1 };
const ARREST = { tool: 'arrest', person: 'p9', how: 'quiet' };
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer in the Bar with a warrant on Pun Pun, in sight. Its serve task is open. */
const officer = (name = 'Hale Stone', job = 'Security Officer') => {
  const o: any = makeBrain(name, job);
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Bar', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [PUN]);
  A.syncBeat(o);
  A.beatOf(o).warrants[0].toldAt = 4990;
  return o;
};
/** Runs a sync as the brain does each update: the serve task of a warrant gone is finished, and pruned. */
const prune = (o: any) => {
  A.syncBeat(o);
  o.tasks = o.tasks.filter((task: any) => task.state !== 'done');
};

// ---- TRB-02: the pardon comes while the arrest runs, and the serve task is gone by the answer
{
  const o = officer();
  const task = open(o, 'serve_warrant');
  A.dropWarrant(o, 'Pun Pun', true);
  prune(o);
  add('TRB-02: pardoned mid-arrest: the serve task is gone', [!!o.tasks.find((it: any) => it.id === task.id), A.beatOf(o).toFree], [false, []]);
  // The driver looks the task up by id, and finds none.
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p9', cuffed: 1, hits: 0 });
  add('TRB-02: the cuffs went on with the task gone: it lets them go, by the handle', A.beatOf(o).toFree, [{ name: 'Pun Pun', pardoned: true, tries: 0 }]);
  add('TRB-02: and nothing is told as cuffed, and no warrant comes back', [A.takeOutcomes(o), A.beatOf(o).warrants], [[], []]);
  A.syncBeat(o);
  add('TRB-02: a let-go task is open', open(o, 'let_go')?.item, 'Pun Pun');
}
{
  // Out of sight by the answer (walked off with them), but in its hold.
  const o = officer();
  A.dropWarrant(o, 'Pun Pun', false);
  prune(o);
  o.peopleInView = [];
  o.security.holding = 'Pun Pun';
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p9', cuffed: 1 });
  add('TRB-02: taken back mid-arrest, not in view but held: let go, not pardoned', A.beatOf(o).toFree, [{ name: 'Pun Pun', pardoned: false, tries: 0 }]);
}
{
  const o = officer();
  A.dropWarrant(o, 'Pun Pun', true);
  prune(o);
  A.beatAfterActing(o, ARREST, undefined, false, { handle: 'p9', reason: 'moved' });
  add('TRB-02: the task gone and the arrest failed: nobody to let go', A.beatOf(o).toFree, []);
}
{
  const o = officer();
  A.dropWarrant(o, 'Pun Pun', true);
  prune(o);
  o.now += 700;
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p9', cuffed: 1 });
  add('TRB-02: a pardon more than a minute old is not taken for this arrest', A.beatOf(o).toFree, []);
}
{
  const o = officer();
  A.dropWarrant(o, 'Pun Pun', true);
  prune(o);
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p4', cuffed: 1 });
  add('TRB-02: someone else cuffed (another handle, nobody held): nobody let go', A.beatOf(o).toFree, []);
}
{
  // The task still there (the round-one case) still works.
  const o = officer();
  const task = open(o, 'serve_warrant');
  A.dropWarrant(o, 'Pun Pun', true);
  A.beatAfterActing(o, ARREST, task, true, { handle: 'p9', cuffed: 1 });
  add('TRB-02: with the task still found, it lets them go too', A.beatOf(o).toFree, [{ name: 'Pun Pun', pardoned: true, tries: 0 }]);
}

// ---- ARR-13 step 2: a warrant handed back mid-arrest, still on the list it keeps
const head = () => {
  const o = officer('Joan Hale', 'Head of Security');
  o.desk = { warrants: [{ name: 'Pun Pun', reason: 'theft', minutes: 5, by: 'Zim Fire', byJob: 'Captain', at: 4000, given: 'taken', givenAt: 4100, gives: 0, lastSeen: null, passed: null }], serial: 1, noticed: {}, held: {}, officerOut: null, arrests: 0, servedBy: 'Hale Stone' };
  return o;
};
{
  const o = head();
  // Handed back with no arrest on record (the step was lost, or the act was overwritten).
  A.handBack(o);
  prune(o);
  add('ARR-13: handed back: no warrant in its hands, no serve task', [A.beatOf(o).warrants.length, !!open(o, 'serve_warrant')], [0, false]);
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p9', cuffed: 1 });
  const warrant = A.beatOf(o).warrants[0];
  add('ARR-13: the cuffs went on: the warrant is back in its hands, as its own arrest', [warrant?.name, warrant?.cuffedByMe, warrant?.byCaptain, warrant?.minutes], ['Pun Pun', true, true, 5]);
  add('ARR-13: nobody is let go, and the list hears they are cuffed', [A.beatOf(o).toFree, A.takeOutcomes(o)], [[], [{ what: 'cuffed', name: 'Pun Pun' }]]);
  add('ARR-13: the officer is not given it as well while it holds them', o.desk.keptBack, ['Pun Pun']);
  o.security.holding = 'Pun Pun';
  A.syncBeat(o);
  add('ARR-13: a serve task is open again, to take them to a cell', open(o, 'serve_warrant')?.item, 'Pun Pun');
}
{
  // Pardoned too: the list no longer has it, so it is let go, even for whoever keeps the list.
  const o = head();
  o.desk.warrants = [];
  A.dropWarrant(o, 'Pun Pun', true);
  prune(o);
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p9', cuffed: 1 });
  add('ARR-13 with TRB-02: struck off the list and pardoned: let go', [A.beatOf(o).toFree, A.beatOf(o).warrants], [[{ name: 'Pun Pun', pardoned: true, tries: 0 }], []]);
}
{
  // Handed back, but the list still has it: the "let go of anyone held on no warrant" rule does not free them.
  const o = head();
  A.handBack(o);
  A.beatOf(o).dropped = [{ name: 'Pun Pun', pardoned: true, at: o.now - 100 }];
  prune(o);
  A.beatAfterActing(o, ARREST, undefined, true, { handle: 'p9', cuffed: 1 });
  add('ARR-13: still on the list it keeps, an old pardon note does not free them', [A.beatOf(o).toFree, A.beatOf(o).warrants[0]?.cuffedByMe], [[], true]);
}
{
  // A stop is not an arrest on a warrant: nothing is taken back.
  const o = head();
  A.handBack(o);
  prune(o);
  A.beatAfterActing(o, { tool: 'arrest', person: 'p9', how: 'stop' }, undefined, true, { handle: 'p9', cuffed: 0 });
  add('ARR-13: a stop with the baton takes no warrant back', A.beatOf(o).warrants.length, 0);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
