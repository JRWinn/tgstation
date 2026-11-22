// Asking to be let in, to the face of someone in sight (KNA-26): letInStep, beatAfterActing and
// beatAfterSaying in CrewBrain/jobs/arrests.ts. At the door it knocks once. Whoever can open it
// and is in sight is asked first, aloud, in the fixed words; that counts as one asked. With no PDA
// it waits at the door for someone who can open it to come by, and does not give up at once.
// No model is called and no station is simulated.
//
//   bun run arrests3-askaloud.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }, { name: 'Sunshine Langston', job: 'Head of Personnel' }];
const CAPTAIN = { handle: 'p1', name: 'Zim Fire', job: 'Captain', place: 'Bar', distance: 4 };
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer at the Bar's door, shut out of the Bar where Pun Pun was seen. The list: the HoP, then the Captain. */
const officer = (people: any[] = [], pda = true) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = pda ? PDA : [];
  o.hasPda = pda;
  know(o, ['Security Office', 'Bar', 'Central Primary Hallway', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [], keepers: { Bar: pda ? ['Sunshine Langston', 'Zim Fire'] : people.map((it) => it.name) } };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Central Primary Hallway', people);
  o.blockedPlaces = ['Bar'];
  o.atDoorOf = 'Bar';
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = 4990;
  w.lastSeen = { place: 'Bar', at: 4990 };
  w.shutOut = { place: 'Bar', at: 4995, keepers: pda ? ['Sunshine Langston', 'Zim Fire'] : [], asked: [], askedAt: 0, door: 'Bar', doorTries: 0 };
  return { o, w, task: open(o, 'serve_warrant') };
};
const knock = (f: any) => {
  const plan = A.planBeat(f.o, f.task);
  A.beatAfterActing(f.o, plan?.act, f.task, true, {});
  return plan;
};

{
  const f = officer([CAPTAIN]);
  add('at the door: it knocks first', knock(f)?.act, { tool: 'knock' });
  const plan = A.planBeat(f.o, f.task);
  add('the Captain is in sight: asked aloud first, before the HoP by PDA', [plan?.act, /Zim|Captain/.test(plan?.say ?? ''), /Could you let me in/.test(plan?.say ?? ''), plan?.exact], [undefined, true, true, true]);
  A.beatAfterSaying(f.o, plan?.say ?? null);
  add('said: that is one asked, the Captain', [f.w.shutOut.asked, f.w.shutOut.askedAt], [['Zim Fire'], 5000]);
  const wait = A.planBeat(f.o, f.task);
  add('then it waits at the door', [wait?.ready, wait?.wait], [false, true]);
  f.o.now = 5000 + 910;
  add('90 seconds on: the HoP, by PDA', A.planBeat(f.o, f.task)?.act?.tool, 'message');
  add('and no second knock', A.planBeat(f.o, f.task)?.act?.person, 'Sunshine Langston');
}
{
  // Nobody in sight: by PDA, in the server's order, after one knock.
  const f = officer([]);
  knock(f);
  const plan = A.planBeat(f.o, f.task)?.act;
  add('nobody in sight: a PDA message to the first on the list', [plan?.tool, plan?.person], ['message', 'Sunshine Langston']);
}
{
  // No PDA, nobody in sight: it waits at the door, it does not give up.
  const f = officer([], false);
  knock(f);
  const plan = A.planBeat(f.o, f.task);
  add('no PDA, nobody in sight: it waits at the door', [plan?.ready, plan?.wait, f.w.shutOut.gaveUp], [false, true, undefined]);
  // A cargo technician comes into sight, and the server lists them.
  const tech = { handle: 'p7', name: 'Donna Sholl', job: 'Bartender', place: 'Bar', distance: 3 };
  at(f.o, 5100, 'Central Primary Hallway', [tech]);
  f.o.security.keepers = { Bar: ['Donna Sholl'] };
  const ask = A.planBeat(f.o, f.task);
  add('no PDA, a keeper comes into sight: asked aloud', [/Donna|Bartender/.test(ask?.say ?? ''), ask?.act], [true, undefined]);
  at(f.o, 5100 + 2700, 'Central Primary Hallway', []);
  f.o.security.keepers = { Bar: [] };
  add('no PDA, nobody for four and a half minutes: it gives up', [A.planBeat(f.o, f.task)?.ready, f.w.shutOut.gaveUp], [false, true]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
