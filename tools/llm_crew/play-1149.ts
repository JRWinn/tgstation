// The faults of round-11.49.16, case by case (PLAY-16 to PLAY-25). No model is called.
//
//   bun run play-1149.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { OFFICER } = await import(ROOT + 'jobs/officer');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { withRemark } = await import(ROOT + 'jobs/reports');
const { deskOutcome } = await import(ROOT + 'jobs/desk');
const E = await import(ROOT + 'expected');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const pun = (place = 'Security Office', extra: any = {}) => ({ handle: 'p9', name: 'Pun Pun', job: '', place, distance: 1, ...extra });
const captain = { handle: 'p1', name: 'Zim Fire', job: 'Captain', place: 'Security Office', distance: 3, command: 1, superior: 1 };
const guard = (health = 90, job = 'Security Officer') => {
  const o: any = makeBrain('Hale Stone', job);
  o.id = `g${Math.random()}`;
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Bar', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health, baton_seen: null, cells: [] };
  return o;
};
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

// ---- PLAY-18: hurt and being hit at its own post
{
  const o = guard(30);
  at(o, 5000, 'Security Office', [pun()]);
  A.securityFeels(o, { details: { struck_name: 'Pun Pun', struck_by: 'p9' } });
  A.syncBeat(o);
  A.takeOutcomes(o);
  A.syncBeat(o);
  const plan = A.planBeat(o, open(o, 'get_away'));
  add('PLAY-18: hit at its post it gets away, to Medbay', [plan?.ready, plan?.act], [true, { tool: 'go_to', place: 'Medbay Central' }]);
  o.now += 150;
  add('PLAY-18: not hit lately, it waits where it is', A.planBeat(o, open(o, 'get_away'))?.ready, false);
  o.security.health = 60;
  A.syncBeat(o);
  add('PLAY-18: at 60 it is hurt still', A.beatOf(o).hurt, true);
  o.security.health = 87;
  A.syncBeat(o);
  add('PLAY-18: healed to 87 it is not', A.beatOf(o).hurt, false);
  A.securityFeels(o, { details: { struck_name: 'Pun Pun', struck_by: 'p9' } });
  A.syncBeat(o);
  add('PLAY-18: and it stops whoever hits it then', A.planBeat(o, open(o, 'stop_attacker'))?.act, { tool: 'arrest', person: 'p9', how: 'stop' });
}
for (const [health, want] of [[1, false], [40, true]] as const) {
  const o = guard(health);
  A.giveWarrant(o, { name: 'Pun Pun', reason: '', minutes: 5 });
  at(o, 5000, 'Security Office', []);
  A.noteSeen(o, 'Pun Pun', 'Bar', 4990);
  A.syncBeat(o);
  add(`PLAY-18: at ${health} in 100 it goes looking`, A.planBeat(o, open(o, 'serve_warrant'))?.ready, want);
}

// ---- PLAY-19: told that its officer is being attacked
for (const [label, seen, want] of [
  ['in sight', [pun()], 'Pun Pun'],
  ['in sight and down already', [pun('Security Office', { down: 1 })], undefined],
  ['a head of staff', [pun('Security Office', { command: 1 })], undefined],
  ['out of sight', [], undefined],
] as const) {
  const h = guard(100, 'Head of Security');
  at(h, 5000, 'Security Office', seen as any);
  deskOutcome(h, { what: 'attacked', name: 'Pun Pun' }, 'Annie Mills', true);
  add(`PLAY-19: the attacker ${label}`, A.beatOf(h).attacker?.name, want);
  if (want) {
    A.syncBeat(h, false);
    const plan = A.planBeat(h, open(h, 'stop_attacker'));
    add('PLAY-19: is stopped with the baton', [plan?.act, /attacked Annie\./.test(plan?.step)], [{ tool: 'arrest', person: 'p9', how: 'stop' }, true]);
    add('PLAY-19: and the Captain is told once', h.toTell.filter((tell: any) => /attacked Annie/.test(tell.line)).length, 1);
  }
}

// ---- PLAY-20: its own cuffs, off again in the cell
for (const [mine, want] of [[true, 0], [false, 1]] as const) {
  const o = guard(100);
  A.giveWarrant(o, { name: 'Pun Pun', reason: '', minutes: 5 });
  o.security.has_cuffs = 0;
  A.beatOf(o).warrants[0].cuffedByMe = mine;
  at(o, 5000, 'Brig', [pun('Brig')]);
  A.beatOf(o).outcomes = [];
  A.beatOf(o).words = [];
  A.beatOf(o).cannotTold = {};
  A.syncBeat(o);
  add(`PLAY-20: "no cuffs" ${mine ? 'just after its own arrest' : 'with none'}`, A.takeOutcomes(o).filter((it: any) => it.why === 'no cuffs').length, want);
}

// ---- PLAY-21: "Arrest Pun Pun", said to nobody by name
for (const [label, extra, saidTo, want] of [
  ['with no Head of Security there', [], 'room', 1],
  ['with the Head of Security there', [{ handle: 'p2', name: 'Joan Hale', job: 'Head of Security', place: 'Security Office', distance: 2 }], 'room', 0],
  ['said to someone else', [], 'other', 0],
] as const) {
  const o = guard();
  at(o, 5000, 'Security Office', [captain, ...extra]);
  o.toTell = [];
  OFFICER.overhears?.(o, { seq: 1, time: '', at: 5000, kind: 'speech', text: '', details: { speaker: 'Zim Fire', message: 'Arrest Pun pun', said_to: saidTo } } as any);
  add(`PLAY-21: ${label}`, o.toTell.filter((tell: any) => /Joan Hale|Head of Security/.test(tell.line)).length, want);
}

// ---- PLAY-17: the arrest is not called through a door it knows is locked to it
for (const [locked, want] of [[true, undefined], [false, 'said']] as const) {
  const o = guard();
  A.giveWarrant(o, { name: 'Pun Pun', reason: '', minutes: 5 });
  at(o, 5000, 'Security Office', [pun('Bar')]);
  o.blockedPlaces = locked ? ['Bar'] : [];
  A.syncBeat(o);
  const plan = A.planBeat(o, open(o, 'serve_warrant'));
  add(`PLAY-17: two squares off in a room ${locked ? 'locked to it' : 'open to it'}`, /under arrest/.test(plan?.say ?? '') ? 'said' : undefined, want);
}

// ---- PLAY-16: at a bay door about the mess in another room of the department
{
  const tech = () => {
    const b: any = makeBrain('Kathy Stahl', 'Cargo Technician');
    b.id = `t${Math.random()}`;
    b.post = 'Cargo Bay';
    b.location = 'Cargo Bay';
    b.now = 5000;
    b.closedRooms = ['Cargo Bay', 'Mining Office'];
    b.areaMesses = { 'Mining Office': 1 };
    b.janitorsOnPda = ['Braden Reade'];
    b.pdaPeople = [{ name: 'Braden Reade', job: 'Janitor' }];
    return b;
  };
  const ask = 'I am at the Deliveries door of the Cargo Bay about the mess in the Mining Office. Could you let me in, please?';
  for (const sent of [true, false]) {
    const b = tech();
    b.post = sent ? 'Cargo Bay' : 'Other Bay';
    if (!sent) b.closedRooms.push('Cargo Bay');
    if (sent) E.expectSomeone(b.post, 'Braden Reade', 'Mining Office', b.name, b.now);
    CARGO.readsMessage?.(b, 'Braden Reade', ask, b.now, 'Janitor');
    add(`PLAY-16: the ask carries the room of the mess (${sent ? 'sent for' : 'not'})`, b.doorAsks?.[0]?.messIn, 'Mining Office');
    CARGO.syncTasks(b);
    const refused = b.toTell.some((tell: any) => /nobody here sent for you/.test(tell.line));
    add(`PLAY-16: ${sent ? 'sent for, it is let in' : 'not sent for, it is not'}`, [refused, b.tasks.some((task: any) => task.kind === 'door' && task.state !== 'done')], [!sent, sent]);
  }
}

// ---- PLAY-25: a remark that says the line's own words again
add('PLAY-25: the line\'s sentence is left off the remark', withRemark('Staff meeting in the Cargo Bay now, please. Gather round and have your reports ready.', 'Gather round and have your reports ready. Let us be quick.'), 'Staff meeting in the Cargo Bay now, please. Gather round and have your reports ready. Let us be quick.');
add('PLAY-25: a remark of its own is kept', withRemark('Order placed for you.', 'Mind how you go'), 'Order placed for you. Mind how you go.');

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
