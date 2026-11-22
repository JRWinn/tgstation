// Tries at an arrest are paced by the plan, not by the driver's hold-back (ARR-01): serveStep and
// beatAfterActing in CrewBrain/jobs/arrests.ts. Each try at the arrest is numbered, so a try that
// came to nothing is a new step to the driver and is not held back longer each time. The line
// "you are under arrest" is said once, and again only after a rest or a fresh start. No model is
// called and no station is simulated.
//
//   bun run arrests3-paced.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const PUN = { handle: 'p2', name: 'Pun Pun', job: '', place: 'Bar Lounge', distance: 1 };
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer beside Pun Pun with a warrant on it, the line not yet said. */
const officer = () => {
  const o: any = makeBrain('Nova Aultman', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Bar Lounge', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar Lounge', [PUN]);
  A.syncBeat(o);
  return { o, w: A.beatOf(o).warrants[0], task: open(o, 'serve_warrant') };
};
const said = (f: any, now: number) => {
  A.beatAfterSaying(f.o, null);
  f.w.toldAt = now;
};

{
  const f = officer();
  const first = A.planBeat(f.o, f.task);
  add('first: the line is said', [first?.say !== undefined, first?.act], [true, undefined]);
  said(f, 5000);
  const try1 = A.planBeat(f.o, f.task)?.act;
  add('then the arrest, numbered 1', try1, { tool: 'arrest', person: 'p2', how: 'quiet', attempt: 1 });
  A.beatAfterActing(f.o, try1, f.task, false, { reason: 'moved' });
  at(f.o, 5100, 'Bar Lounge', [PUN]);
  const try2 = A.planBeat(f.o, f.task)?.act;
  add('it would not stand still: the next try is the baton, numbered 2', try2, { tool: 'arrest', person: 'p2', how: 'force', attempt: 2 });
  add('two tries for the same warrant are different steps to the driver', JSON.stringify(try1) !== JSON.stringify(try2), true);
  A.beatAfterActing(f.o, try2, f.task, false, { reason: 'moved' });
  // 50 seconds after the line: once it was said again every 45 seconds, ahead of the arrest.
  at(f.o, 5500, 'Bar Lounge', [PUN]);
  const try3 = A.planBeat(f.o, f.task);
  add('50 seconds on, no second telling: the third try, numbered 3', [try3?.say, try3?.act], [undefined, { tool: 'arrest', person: 'p2', how: 'force', attempt: 3 }]);
  A.beatAfterActing(f.o, try3?.act, f.task, false, { reason: 'moved' });
  add('three tries: a rest, and the line is due again after it', [f.w.restUntil > 5500, f.w.toldAt], [true, null]);
  at(f.o, f.w.restUntil + 1, 'Bar Lounge', [PUN]);
  const after = A.planBeat(f.o, f.task);
  add('after the rest: the line once more', after?.say !== undefined, true);
  said(f, f.w.restUntil + 1);
  add('then the fourth try, numbered 4', A.planBeat(f.o, f.task)?.act, { tool: 'arrest', person: 'p2', how: 'force', attempt: 4 });
}
{
  // Short of kit, or the door between them: still a new number, so the next is not held back.
  const f = officer();
  said(f, 5000);
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, { reason: 'no_cuffs' });
  add('a try short of cuffs is numbered too', A.planBeat(f.o, f.task)?.act?.attempt, 2);
}
{
  // Cuffed on the first try: nothing changes for someone who stands still.
  const f = officer();
  said(f, 5000);
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, true, { handle: 'p2', cuffed: 1 });
  add('stood still: cuffed on the first try, and no try is counted against it', [f.w.cuffedByMe, f.w.tries], [true, 0]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
