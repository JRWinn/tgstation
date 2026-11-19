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

// ---- ARR-09: told to try again while hurt, it does not break off again the same second
{
  const f = wanted('Bar');
  f.o.security.health = 40;
  A.syncBeat(f.o);
  add('ARR-09: under half its health it breaks off, and says so', [A.beatOf(f.o).hurt, A.takeOutcomes(f.o).map((it: any) => it.what)], [true, ['hurt']]);
  A.arrestAgain(f.o);
  A.syncBeat(f.o);
  add('ARR-09: told to try again at 40, it is not hurt again at 40, and says nothing', [A.beatOf(f.o).hurt, A.takeOutcomes(f.o)], [false, []]);
  f.o.security.health = 30;
  A.syncBeat(f.o);
  add('ARR-09: nor at 30', A.beatOf(f.o).hurt, false);
  f.o.security.health = 25;
  A.syncBeat(f.o);
  add('ARR-09: but fifteen under, it breaks off again and says so once more', [A.beatOf(f.o).hurt, A.takeOutcomes(f.o).map((it: any) => it.what)], [true, ['hurt']]);
  A.arrestAgain(f.o);
  f.o.security.health = 19;
  A.syncBeat(f.o);
  add('ARR-09: and under twenty, whatever it was told', A.beatOf(f.o).hurt, true);
}
{
  const f = wanted('Bar');
  f.o.security.health = 40;
  A.syncBeat(f.o);
  A.arrestAgain(f.o);
  f.o.security.health = 80;
  A.syncBeat(f.o);
  f.o.security.health = 45;
  A.syncBeat(f.o);
  add('ARR-09: back over half and hurt again, it breaks off at half as before', A.beatOf(f.o).hurt, true);
}

// ---- ARR-10 (telling part): short of what the arrest needs, with them in sight, it says so at once.
// Whether it then leaves them for the lockers is the owner's question: it stays with them, as H2 has it.
{
  const f = wanted('Bar');
  f.o.security.has_cuffs = 0;
  A.syncBeat(f.o);
  add('ARR-10: no cuffs and them in sight: it stays with them (H2)', !!open(f.o, 'security_kit'), false);
  add('ARR-10: and says once that it has no cuffs', [A.takeOutcomes(f.o), (A.syncBeat(f.o), A.takeOutcomes(f.o))], [[{ what: 'cannot', name: 'Pun Pun', why: 'no cuffs' }], []]);
  add('ARR-10: the arrest still says why it is not made', A.planBeat(f.o, f.task)?.ready, false);
}
{
  const f = wanted('Bar');
  f.o.security.has_baton = 0;
  A.syncBeat(f.o);
  add('ARR-10: no baton, and they have stood still so far: it does not leave them', [!!open(f.o, 'security_kit'), A.takeOutcomes(f.o)], [false, []]);
  f.warrant.force = true;
  A.syncBeat(f.o);
  add('ARR-10: no baton once they would not stand still: it says so at once, once, and stays', [!!open(f.o, 'security_kit'), A.takeOutcomes(f.o), (A.syncBeat(f.o), A.takeOutcomes(f.o))], [false, [{ what: 'cannot', name: 'Pun Pun', why: 'no baton' }], []]);
}

// ---- ARR-11: one hallway it cannot walk to does not stop the search
const HALLS = ['Aft Primary Hallway', 'Central Primary Hallway', 'Fore Primary Hallway'];
const searching = () => {
  const o = officer();
  know(o, ['Security Office', 'Bar', 'Brig', ...HALLS]);
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Security Office', []);
  A.beatOf(o).round = { next: 0, at: 0 };
  A.syncBeat(o);
  return { o, task: open(o, 'serve_warrant') };
};
{
  const f = searching();
  add('ARR-11: with no word of them it walks the first hallway', A.planBeat(f.o, f.task)?.act, { tool: 'go_to', place: 'Aft Primary Hallway' });
  f.o.blockedPlaces = ['Aft Primary Hallway'];
  add('ARR-11: a hallway it found no way into is passed over', A.planBeat(f.o, f.task)?.act, { tool: 'go_to', place: 'Central Primary Hallway' });
}
{
  const f = searching();
  A.beatAfterActing(f.o, { tool: 'go_to', place: 'Aft Primary Hallway' }, f.task, false, {});
  add('ARR-11: a failed walk to it moves the round on before the server says so', A.planBeat(f.o, f.task)?.act, { tool: 'go_to', place: 'Central Primary Hallway' });
  f.o.blockedPlaces = [...HALLS];
  add('ARR-11: every hallway shut: the round ends, and it does not stand at one', [A.planBeat(f.o, f.task)?.act, A.beatOf(f.o).round.next], [undefined, 0]);
}

// ---- ARR-12: the server refusing an arrest for a Captain's ID is no try and no resisting
{
  const f = wanted('Bar');
  f.o.peopleInView.push({ handle: 'p7', name: 'Pun Pun', job: '', place: 'Bar', distance: 2 });
  A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'captain', handle: 'p9' });
  add('ARR-12: refused for a Captain\'s ID: no try counted, the true reason told once', [f.warrant.tries, A.takeOutcomes(f.o)], [0, [{ what: 'cannot', name: 'Pun Pun', why: 'they carry a Captain\'s ID, and nobody lays a hand on the Captain' }]]);
  add('ARR-12: and it looks past them to anyone else whose name fits, and tells them first', A.planBeat(f.o, f.task)?.say ?? null, 'Pun Pun, you are under arrest, for theft. Stand still.');
  f.warrant.toldAt = f.o.now;
  add('ARR-12: then arrests that one', A.planBeat(f.o, f.task)?.act?.person ?? null, 'p7');
  A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'captain', handle: 'p9' });
  add('ARR-12: refused again: not told again', A.takeOutcomes(f.o), []);
  f.o.peopleInView = f.o.peopleInView.filter((it: any) => it.handle === 'p9');
  add('ARR-12: with only them in view, nobody is arrested', A.planBeat(f.o, f.task)?.act?.tool === 'arrest', false);
  f.o.now += 3100;
  f.warrant.toldAt = f.o.now;
  add('ARR-12: five minutes on, they may have taken the card off: they are tried again', A.planBeat(f.o, f.task)?.act?.person ?? null, 'p9');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
