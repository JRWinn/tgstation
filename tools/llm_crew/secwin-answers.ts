// The owner's answers of 2026-11-22 for security's window code, case by case (CrewBrain/jobs/arrests.ts,
// jobs/officer.ts, jobs/desk.ts). No model is called and no station is simulated.
//
//   bun run secwin-answers.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const officer = (pda: any[] = PDA) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = pda;
  know(o, ['Security Office', 'Bar', 'Brig', 'Cargo Bay', "Quartermaster's Office"]);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  return o;
};
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

// ---- ARR-02 step 3: a wanted keeper who walks the officer out of its room is fighting back
{
  const o = officer();
  A.giveWarrant(o, { name: 'Quin Mark', reason: 'theft', minutes: 5 });
  at(o, 5000, "Quartermaster's Office", [{ handle: 'p4', name: 'Quin Mark', job: 'Quartermaster', place: "Quartermaster's Office", distance: 1, command: 1 }]);
  A.securityFeels(o, { kind: 'walked_out', at: 5000, text: 'Quin Mark walks you out of the Quartermaster\'s Office.', details: { by: 'Quin Mark' } });
  const warrant = A.beatOf(o).warrants[0];
  add('ARR-02: walked out by the one the warrant is on: resisting (five minutes more), and served at once', [warrant.resisted, warrant.force], [true, true]);
  add('ARR-02: and no stranger to stop', A.beatOf(o).attacker ?? null, null);
}
{
  const o = officer();
  A.giveWarrant(o, { name: 'Quin Mark', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Cargo Bay');
  A.securityFeels(o, { kind: 'knowledge', at: 5000, text: '', details: { reason: 'walked_out_by_wanted', by: 'Quin Mark' } });
  add('ARR-02: the reason walked_out_by_wanted reads the same', A.beatOf(o).warrants[0].resisted, true);
}
{
  const o = officer();
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Cargo Bay');
  A.securityFeels(o, { kind: 'walked_out', at: 5000, text: '', details: { by: 'Cora Tech' } });
  add('ARR-02: walked out by a keeper with no warrant on them: no resisting, nobody to stop', [A.beatOf(o).warrants[0].resisted, A.beatOf(o).attacker ?? null], [false, null]);
}

// ---- DESK-05 A: with no Head of Security, each officer serves the warrants declared to it
{
  const D = await import(ROOT + 'jobs/desk');
  const OFFICER = (await import(ROOT + 'jobs/index')).jobFor('Security Officer');
  const o = officer([{ name: 'Dana Reyes', job: 'Security Officer' }, { name: 'Zim Fire', job: 'Captain' }]);
  at(o, 5000, 'Security Office');
  D.deskTakes(o, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for wrecking the Custodial Closet.', false);
  OFFICER.syncTasks(o);
  D.syncDesk(o);
  add('DESK-05: the officer that was told keeps the warrant in its own hands', A.beatOf(o).warrants.map((w: any) => w.name), ['Pun Pun']);
  add('DESK-05: and gives it to no other officer', o.toTell.filter((t: any) => t.to === 'Dana Reyes').map((t: any) => t.line), []);
  OFFICER.syncTasks(o);
  add('DESK-05: it has a warrant to serve', !!o.tasks.find((t: any) => t.kind === 'serve_warrant' && t.state !== 'done'), true);
}

// ---- ARR-08 A: stopping an attacker with no warrant breaks in on an arrest under way
{
  const { drive } = await import(ROOT + 'driver');
  const o = officer();
  o.id = 'arr08stop';
  o.pendingSpeakers = new Set();
  A.giveWarrant(o, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  const BRICK = { handle: 'p3', name: 'Brick Lane', job: 'Assistant', place: 'Bar', distance: 1 };
  at(o, 5000, 'Bar', [{ handle: 'p5', name: 'Dana Reyes', job: 'Assistant', place: 'Bar', distance: 3 }, BRICK]);
  A.beatOf(o).warrants[0].toldAt = 4990;
  A.syncBeat(o);
  const dana = o.tasks.find((it: any) => it.kind === 'serve_warrant' && it.state !== 'done');
  o.lastAct = { key: 'x', tool: 'arrest', at: Date.now(), act: { tool: 'arrest', person: 'p5', how: 'quiet' }, task: dana.id };
  A.securityFeels(o, { details: { struck_name: 'Brick Lane', struck_by: 'p3' } });
  A.syncBeat(o);
  const stop = open(o, 'stop_attacker');
  add('ARR-08: the stop step may break in', A.planBeat(o, stop)?.breaksIn, true);
  const issued: any[] = [];
  o.driveAfter = 0;
  drive(o, (act: any) => { issued.push(act); return act.tool; }, () => {});
  add('ARR-08: struck mid-arrest with a baton: it stops the attacker', issued.map((act) => `${act.tool} ${act.person} ${act.how}`), ['arrest p3 stop']);
}

// ---- ARR-03 B: an officer gets away from a head of staff who keeps hitting it, baton or not
{
  const o = officer();
  const QUIN = { handle: 'p4', name: 'Quin Mark', job: 'Quartermaster', place: 'Bar', distance: 1, command: 1 };
  at(o, 5000, 'Bar', [QUIN]);
  A.securityFeels(o, { details: { struck_name: 'Quin Mark', struck_by: 'p4', how: 'punch' } });
  A.syncBeat(o);
  add('ARR-03: hit by a head, baton in hand: no baton on them', !!open(o, 'stop_attacker'), false);
  const away = open(o, 'get_away');
  add('ARR-03: it gets out of their reach, back to its post', A.planBeat(o, away)?.act, { tool: 'go_to', place: 'Security Office' });
  add('ARR-03: and whoever keeps the list is told, once', [A.takeOutcomes(o), (A.syncBeat(o), A.takeOutcomes(o))], [[{ what: 'attacked', name: 'Quin Mark' }], []]);
  at(o, 5000 + 400, 'Security Office', []);
  A.syncBeat(o);
  add('ARR-03: once they have stopped, it stops keeping away', !!open(o, 'get_away'), false);
}
{
  const o = officer();
  at(o, 5000, 'Bar', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 1 }]);
  A.securityFeels(o, { details: { struck_name: 'Pun Pun', struck_by: 'p9' } });
  A.syncBeat(o);
  add('ARR-03: anyone else, baton in hand, is stopped, not run from', [!!open(o, 'stop_attacker'), !!open(o, 'get_away')], [true, false]);
}

// ---- ARR-04 A: a prisoner held in the brig with no cell is let go once the warrant's minutes are up there
{
  const o = officer();
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  const PUN = { handle: 'p9', name: 'Pun Pun', job: '', place: 'Brig', distance: 1, cuffed: 1, pulled_by: 'Hale Stone' };
  o.security.holding = 'Pun Pun';
  at(o, 5000, 'Brig', [PUN]);
  const warrant = A.beatOf(o).warrants[0];
  warrant.cuffedByMe = true;
  warrant.noCellAt = 5000;
  warrant.noCellWhy = 'no_cell';
  A.syncBeat(o);
  at(o, 5000 + 2999, 'Brig', [PUN]);
  warrant.noCellAt = 5000 + 2990;
  A.syncBeat(o);
  add('ARR-04: held in the brig short of the warrant\'s five minutes: still held, nobody let go', [A.beatOf(o).warrants.length, A.beatOf(o).toFree.length], [1, 0]);
  at(o, 5000 + 3001, 'Brig', [PUN]);
  A.syncBeat(o);
  add('ARR-04: five minutes on: the warrant is served, and they are to be let go', [A.beatOf(o).warrants.length, A.beatOf(o).toFree.map((it: any) => it.name)], [0, ['Pun Pun']]);
  const free = open(o, 'let_go');
  const plan = A.planBeat(o, free);
  add('ARR-04: with the usual let-go step', [plan?.act, /served their time/.test(plan?.step ?? '')], [{ tool: 'free', person: 'Pun Pun' }, true]);
  A.beatAfterActing(o, plan.act, free, true, {});
  add('ARR-04: and "Pun Pun is free" goes to whoever keeps the list', A.takeOutcomes(o), [{ what: 'freed', name: 'Pun Pun' }]);
}
{
  // Resisting adds its five minutes here too.
  const o = officer();
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  const PUN = { handle: 'p9', name: 'Pun Pun', job: '', place: 'Brig', distance: 1, cuffed: 1, pulled_by: 'Hale Stone' };
  o.security.holding = 'Pun Pun';
  at(o, 5000, 'Brig', [PUN]);
  const warrant = A.beatOf(o).warrants[0];
  Object.assign(warrant, { cuffedByMe: true, noCellAt: 5000, noCellWhy: 'no_cell', resisted: true });
  A.syncBeat(o);
  at(o, 5000 + 3001, 'Brig', [PUN]);
  A.syncBeat(o);
  add('ARR-04: one who resisted is held ten minutes, not five', A.beatOf(o).toFree.length, 0);
}
{
  // The Head of Security, told "Hale, Pun Pun is free." of one still on its list, strikes the warrant off.
  const D = await import(ROOT + 'jobs/desk');
  const h: any = makeBrain('Joan Hale', 'Head of Security');
  h.pdaPeople = [{ name: 'Zim Fire', job: 'Captain' }, { name: 'Hale Stone', job: 'Security Officer' }];
  h.staffPost = 'Security Office';
  h.office = 'Security Office';
  know(h, ['Security Office', 'Bar', 'Brig']);
  h.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(h, 3000, 'Security Office');
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for theft.', false);
  add('(the warrant is on the list)', D.deskOf(h).warrants.map((w: any) => w.name), ['Pun Pun']);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, Pun Pun is free.', false);
  add('ARR-04: told they are free, the Head of Security strikes the warrant off', D.deskOf(h).warrants.map((w: any) => w.name), []);
}

// ---- SENSE-08 / CHEAT-15 A: the server refusing an arrest of a Captain known by face
{
  const S = await import(ROOT + 'jobs/security');
  const o = officer();
  A.giveWarrant(o, { name: 'Zim Fire', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [{ handle: 'p9', name: 'Zim Fire', job: '', place: 'Bar', distance: 2 }]);
  A.syncBeat(o);
  const task = open(o, 'serve_warrant');
  const warrant = A.beatOf(o).warrants[0];
  warrant.toldAt = 4990;
  A.beatAfterActing(o, { tool: 'arrest', person: 'p9', how: 'quiet' }, task, false, { reason: 'captain_known', handle: 'p9' });
  const why = 'they are the Captain: I know their face, and nobody lays a hand on the Captain';
  add('SENSE-08: refused as the Captain known by face: no try, its own words told once', [warrant.tries, A.takeOutcomes(o)], [0, [{ what: 'cannot', name: 'Zim Fire', why }]]);
  add('SENSE-08: and they are passed over', A.planBeat(o, task)?.act?.tool === 'arrest', false);
  A.beatAfterActing(o, { tool: 'arrest', person: 'p9', how: 'quiet' }, task, false, { reason: 'captain_known', handle: 'p9' });
  add('SENSE-08: refused again: not told again', A.takeOutcomes(o), []);
  const line = S.outcomeLine('Joan', { what: 'cannot', name: 'Zim Fire', why });
  add('SENSE-08: the line to the Head of Security', line, 'Joan, I cannot bring in Zim Fire: they are the Captain: I know their face, and nobody lays a hand on the Captain.');
  add('SENSE-08: which it reads back whole', S.readOutcome(line), { what: 'cannot', name: 'Zim Fire', why });
}

// ---- SEC-07 B: a crew member stuck in cuffs says so; only security takes them off
{
  const { jobFor } = await import(ROOT + 'jobs/index');
  const OFFICER = jobFor('Security Officer');
  const HOS = jobFor('Head of Security');
  const ASK = 'I am in handcuffs and cannot get them off. Can someone take them off?';
  const DANA = { handle: 'p5', name: 'Dana Reyes', job: 'Assistant', place: 'Bar', distance: 2, cuffed: 1 };
  const o = officer();
  at(o, 5000, 'Bar', [DANA]);
  OFFICER.overhears(o, { seq: 1, time: '', at: 5000, kind: 'speech_heard', text: '', details: { speaker: 'Dana Reyes', message: ASK, source: 'person', said_to: 'group' } });
  OFFICER.syncTasks(o);
  const free = open(o, 'let_go');
  const plan = free && A.planBeat(o, free);
  add('SEC-07: an officer that hears it lets them go: the free step on that name', [plan?.act, /stuck in handcuffs/.test(plan?.step ?? '')], [{ tool: 'free', person: 'Dana Reyes' }, true]);
  const w = officer();
  A.giveWarrant(w, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  at(w, 5000, 'Bar', [DANA]);
  OFFICER.readsMessage(w, 'Dana Reyes', ASK, 5000, 'Assistant');
  add('SEC-07: not someone it has a warrant on', A.beatOf(w).toFree.length, 0);
  const far = officer();
  at(far, 5000, 'Security Office', []);
  OFFICER.readsMessage(far, 'Dana Reyes', ASK, 5000, 'Assistant');
  add('SEC-07: sent by PDA from out of sight: nothing yet', A.beatOf(far).toFree.length, 0);
  at(far, 5600, 'Bar', [DANA]);
  A.syncBeat(far);
  add('SEC-07: and once they are seen, still in cuffs, it lets them go', A.beatOf(far).toFree.map((it: any) => it.name), ['Dana Reyes']);
  const h: any = makeBrain('Joan Hale', 'Head of Security');
  h.pdaPeople = [{ name: 'Zim Fire', job: 'Captain' }];
  h.staffPost = 'Security Office';
  h.office = 'Security Office';
  know(h, ['Security Office', 'Bar', 'Brig']);
  h.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(h, 5000, 'Bar', [DANA]);
  HOS.readsMessage(h, 'Dana Reyes', ASK, 5000, 'Assistant');
  HOS.syncTasks(h);
  const hfree = h.tasks.find((t: any) => t.kind === 'let_go' && t.state !== 'done');
  add('SEC-07: the Head of Security does the same', hfree ? HOS.plan(h, hfree)?.act : null, { tool: 'free', person: 'Dana Reyes' });
  add('SEC-07: "the cuffs are in the locker" is no ask', A.stuckInCuffsAsk(officer(), 'Dana Reyes', 'The cuffs are in the locker.'), false);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
