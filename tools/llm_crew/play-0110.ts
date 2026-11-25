// The faults of round-01.10.24, case by case. No model is called.
//
//   bun run play-0110.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const D = await import(ROOT + 'jobs/desk');
const { asideOverhears, asideStep } = await import(ROOT + 'jobs/aside');
const { placeOfSighting } = await import(ROOT + 'tasks');
const { whoToAskForTheDoor } = await import(ROOT + 'situation');
const { OFFICER } = await import(ROOT + 'jobs/officer');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got) ?? 'undefined', JSON.stringify(want) ?? 'undefined']);
const PDA = [
  { name: 'Joan Hale', job: 'Head of Security' },
  { name: 'Zim Fire', job: 'Captain' },
  { name: 'Hazel Pritchard', job: 'Quartermaster' },
  { name: 'Sam Cole', job: 'Cargo Technician' },
];
const body = (name: string, job: string) => {
  const o: any = makeBrain(name, job);
  o.id = `b${Math.random()}`;
  o.hasPda = true;
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Cargo Bay', 'Cargo Lobby', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  return o;
};
const hazel = { handle: 'p2', name: 'Hazel Pritchard', job: 'Quartermaster', place: 'Cargo Bay', distance: 1, command: 1 };
const sam = { handle: 'p3', name: 'Sam Cole', job: 'Cargo Technician', place: 'Cargo Bay', distance: 2 };
const ask = { details: { speaker: 'Sam Cole', handle: 'p3', said_to: 'me', message: 'Hale, please step aside.' } };
const officer = () => {
  const o = body('Hale Stone', 'Security Officer');
  A.giveWarrant(o, { name: 'Hazel Pritchard', reason: '', minutes: 10, byCaptain: true });
  return o;
};

{
  const o = officer();
  at(o, 5000, 'Cargo Bay', [hazel, sam]);
  asideOverhears(o, ask);
  add('1: with no arrest under way it steps aside', !!asideStep(o), true);
  A.beatOf(o).warrants[0].toldAt = 5000;
  add('1: not once the arrest line is said', asideStep(o), null);
  const w = A.beatOf(o).warrants[0];
  at(o, 5200, 'Cargo Bay', [hazel]);
  A.beatAfterActing(o, { tool: 'arrest', person: 'p2', how: 'quiet' }, { kind: 'serve_warrant', item: w.name }, false, { reason: 'moved' });
  add('1: come late with the cuffs: no baton, and told afresh', [w.force, w.toldAt], [false, null]);
}
{
  const o = officer();
  const w = A.beatOf(o).warrants[0];
  know(o, ["Quartermaster's Office"]);
  at(o, 5000, "Quartermaster's Office", [hazel]);
  A.beatAfterActing(o, { tool: 'jail' }, { kind: 'serve_warrant', item: w.name }, false, { reason: 'no_way' });
  add('15: the room with no way out is noted', w.noWayFrom, "Quartermaster's Office");
}
{
  const h = body('Joan Hale', 'Head of Security');
  at(h, 3000, 'Security Office', []);
  add('4: nobody wanted', D.listAsked(h, 'Who is wanted?'), 'nobody is wanted.');
  add('4: not a question', D.listAsked(h, 'Thanks, good work'), '');
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Arrest Hazel Pritchard for 10 minutes. He is in Cargo', false);
  add('5: the place in the order is taken', D.deskOf ? D.deskOf(h).warrants[0]?.lastSeen?.place : h.desk?.warrants?.[0]?.lastSeen?.place, 'Cargo Bay');
  add('4: who is wanted', D.listAsked(h, 'Who is wanted?'), 'wanted: Hazel Pritchard.');
  add('11: the wanted head\'s staff are told', h.toTell.some((it: any) => it.to === 'Sam Cole' && /Hazel Pritchard/.test(it.line)), true);
  h.toTell = [];
  D.deskOutcome(h, { what: 'attacked', name: 'Zim Fire' }, 'Hale Stone', false);
  add('17: the Captain is not told of the Captain', h.toTell.filter((it: any) => it.to === 'Zim Fire').length, 0);
}
{
  const o = officer();
  at(o, 5000, 'Security Office', []);
  add('5: Cargo is the Cargo Bay', placeOfSighting(o, 'hazel is in cargo'), 'Cargo Bay');
  OFFICER.readsMessage(o, 'Zim Fire', 'Hazel is in Cargo', 5000, 'Captain');
  add('5: the officer takes it', A.beatOf(o).warrants[0].lastSeen?.place, 'Cargo Bay');
}
{
  const o = body('Nev Os', 'Janitor');
  o.doorKeepers = ['Sam Cole'];
  at(o, 5000, 'Cargo Bay', [{ ...hazel, cuffed: 1 }, { handle: 'p4', name: 'Porter Dennis', job: 'Janitor', distance: 1 }, sam]);
  add('18: asks who can open it, not the cuffed', whoToAskForTheDoor(o), 'Sam Cole');
}
let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
