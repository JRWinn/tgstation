// The officer's own work, case by case: whom it stops, what it gives up and what it tells
// (CrewBrain/jobs/arrests.ts, jobs/officer.ts). No model is called and no station is simulated.
//
//   bun run arrests-officer.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const officer = () => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Bar', 'Brig', 'Cargo Bay', 'Quartermaster\'s Office']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  return o;
};
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

// ---- ARR-03: a head of staff who attacks it is not batoned with no warrant
{
  const o = officer();
  at(o, 5000, 'Bar', [{ handle: 'p4', name: 'Quin Mark', job: 'Quartermaster', place: 'Bar', distance: 1, command: 1 }]);
  A.securityFeels(o, { details: { struck_name: 'Quin Mark', struck_by: 'p4', how: 'shove' } });
  A.syncBeat(o);
  add('ARR-03: a head who shoved it is not stopped with the baton', !!open(o, 'stop_attacker'), false);
  add('ARR-03: and whoever keeps the list is told at once, once', [A.takeOutcomes(o), (A.syncBeat(o), A.takeOutcomes(o))], [[{ what: 'attacked', name: 'Quin Mark' }], []]);
  const plan = A.planBeat(o, { kind: 'stop_attacker', state: 'active' } as any);
  add('ARR-03: a stop task however it came to be open sends no baton', [plan?.ready, plan?.act], [false, undefined]);
}
{
  const o = officer();
  at(o, 5000, 'Bar', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 1 }]);
  A.securityFeels(o, { details: { struck_name: 'Pun Pun', struck_by: 'p9' } });
  A.syncBeat(o);
  const task = open(o, 'stop_attacker');
  add('ARR-03: anyone else is still stopped', A.planBeat(o, task)?.act, { tool: 'arrest', person: 'p9', how: 'stop' });
  A.beatAfterActing(o, { tool: 'arrest', person: 'p9', how: 'stop' }, task, false, { reason: 'command' });
  add('ARR-03: a stop the server refused for rank is still told', A.takeOutcomes(o), [{ what: 'attacked', name: 'Pun Pun' }]);
}

// ---- ARR-07: someone in sight in its own room it cannot walk to
const wanted = (place = 'Bar', where = 'Bar') => {
  const o = officer();
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, where, [{ handle: 'p9', name: 'Pun Pun', job: '', place, distance: 4 }]);
  A.syncBeat(o);
  const task = open(o, 'serve_warrant');
  const warrant = A.beatOf(o).warrants[0];
  warrant.toldAt = 4990;
  return { o, task, warrant };
};
{
  const f = wanted();
  for (let i = 0; i < 2; i++) {
    A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'no_way', place: 'Bar' });
  }
  add('ARR-07: in its own room, two tries with no way: counted, nothing told, the line not said again', [f.warrant.tries, f.warrant.toldAt, A.takeOutcomes(f.o)], [2, 4990, []]);
  A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'no_way', place: 'Bar' });
  add('ARR-07: the third rests it thirty seconds and says why, once', [f.warrant.restUntil, A.takeOutcomes(f.o)], [5300, [{ what: 'cannot', name: 'Pun Pun', why: 'they are in sight, but there is no way through to them' }]]);
  for (let i = 0; i < 3; i++) {
    A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'no_way', place: 'Bar' });
  }
  add('ARR-07: and not again after three more', A.takeOutcomes(f.o), []);
}
{
  const f = wanted('Cargo Bay');
  f.o.pdaPeople = PDA;
  A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'no_way', place: 'Cargo Bay' });
  add('ARR-07: in another room with someone to ask, it still asks to be let in, and is no try', [f.warrant.shutOut?.place, f.warrant.tries, f.warrant.toldAt], ['Cargo Bay', 0, null]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
