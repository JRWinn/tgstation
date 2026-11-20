// Security faults seen in the played round of 15:44 on 2026-11-19 (PLAY-02, PLAY-03, PLAY-08,
// PLAY-09), case by case (CrewBrain/jobs/officer.ts, jobs/desk.ts, jobs/arrests.ts). No model is
// called and no station is simulated.
//
//   bun run secwin-play.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const D = await import(ROOT + 'jobs/desk');
const S = await import(ROOT + 'jobs/security');
const OFFICER = (await import(ROOT + 'jobs/index')).jobFor('Security Officer');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HOS = { name: 'Joan Marsh', job: 'Head of Security' };
const CAPTAIN = { name: 'Zim Fire', job: 'Captain' };
const HOP = { name: 'Walker Wolfe', job: 'Head of Personnel' };
const CE = { name: 'Ada Voss', job: 'Chief Engineer' };
const officer = (pda: any[] = [HOS, CAPTAIN, HOP]) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = pda;
  know(o, ['Security Office', 'Bar', 'Brig', "Head of Personnel's Office", 'Central Primary Hallway']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: ['Cell 1', 'Cell 2'] };
  return o;
};
const open = (o: any, kind: string, item?: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done' && (item === undefined || task.item === item));
const words = (o: any) => A.beatOf(o).words.map((word: any) => word.outcome.what);
const said = (b: any) => b.toTell.map((tell: any) => `${tell.byPda ? 'PDA' : 'says'} to ${tell.to}: ${tell.line}`);

// ---- PLAY-02: a word made untrue by a later one is not sent
{
  const o = officer();
  at(o, 5000, 'Brig');
  A.beatOf(o).outcomes.push({ what: 'cuffed', name: 'Walker Wolfe' });
  OFFICER.syncTasks(o);
  A.beatOf(o).outcomes.push({ what: 'cannot', name: 'Walker Wolfe', why: 'no cell would take them' });
  OFFICER.syncTasks(o);
  add('PLAY-02: "in cuffs", then "cannot": both wait', words(o), ['cuffed', 'cannot']);
  A.beatOf(o).outcomes.push({ what: 'jailed', name: 'Walker Wolfe', cell: 'Cell 2', minutes: 5, resisted: false });
  OFFICER.syncTasks(o);
  add('PLAY-02: then "in Cell 2": "cannot" is dropped, "in cuffs" stays true', words(o), ['cuffed', 'jailed']);
  add('PLAY-02: and the dropped one\'s task is closed', o.tasks.filter((task: any) => task.kind === 'word_for_security_head' && task.state !== 'done').length, 2);
}
{
  const o = officer();
  at(o, 5000, 'Brig');
  A.beatOf(o).outcomes.push({ what: 'cuffed', name: 'Walker Wolfe' }, { what: 'attacked', name: 'Pun Pun' }, { what: 'cuffed', name: 'Ada Voss' });
  OFFICER.syncTasks(o);
  A.beatOf(o).outcomes.push({ what: 'lost', name: 'Walker Wolfe', place: 'Bar' });
  OFFICER.syncTasks(o);
  add('PLAY-02: "lost" drops "in cuffs" of that one only, and never "attacked"', A.beatOf(o).words.map((w: any) => `${w.outcome.what} ${w.outcome.name}`), ['attacked Pun Pun', 'cuffed Ada Voss', 'lost Walker Wolfe']);
}
{
  const o = officer();
  at(o, 5000, 'Brig');
  A.beatOf(o).outcomes.push({ what: 'cuffed', name: 'Walker Wolfe' });
  OFFICER.syncTasks(o);
  o.security.holding = 'Walker Wolfe';
  A.beatOf(o).outcomes.push({ what: 'cannot', name: 'Walker Wolfe', why: 'no cell would take them' });
  OFFICER.syncTasks(o);
  const cannot = A.beatOf(o).words.find((w: any) => w.outcome.what === 'cannot');
  add('PLAY-02: "cannot" on the one it has by the arm goes at once, by PDA', [open(o, 'word_for_security_head', cannot?.line)?.urgency, cannot?.byPda], ['emergency', true]);
  add('PLAY-02: "in cuffs" can wait', open(o, 'word_for_security_head', A.beatOf(o).words[0].line)?.urgency, 'asked');
  o.security.holding = null;
  OFFICER.syncTasks(o);
  add('PLAY-02: a "cannot" on someone it does not hold is only asked', open(o, 'word_for_security_head', cannot?.line)?.urgency, 'asked');
}
{
  // The words the Head of Security passes on, and a late "cannot" of someone in a cell already.
  const hos: any = makeBrain('Joan Marsh', 'Head of Security');
  hos.pdaPeople = [CAPTAIN, HOP, { name: 'Hale Stone', job: 'Security Officer' }];
  hos.staffPost = 'Security Office';
  know(hos, ['Security Office', 'Bar']);
  at(hos, 3000, 'Security Office');
  D.deskTakes(hos, 'Zim Fire', 'Captain', 'Warrant for Walker Wolfe, for theft.', false);
  hos.toTell = [];
  const line = S.outcomeLine('Joan', { what: 'cannot', name: 'Walker Wolfe', why: 'no cell would take them' });
  D.deskTakes(hos, 'Hale Stone', 'Security Officer', line, false);
  add('PLAY-02: "no cell would take them" is passed on as it reads', said(hos), ['PDA to Zim Fire: Captain, Hale cannot bring in Walker Wolfe: no cell would take them.']);
  hos.toTell = [];
  D.deskTakes(hos, 'Hale Stone', 'Security Officer', 'Joan, Walker Wolfe is in Cell 2 for 5 minutes.', false);
  hos.toTell = [];
  D.deskTakes(hos, 'Hale Stone', 'Security Officer', line, false);
  add('PLAY-02: a "cannot" come after the jailing is not passed on', said(hos), []);
}

// ---- PLAY-03: word to the officer's face of where someone wanted is, a Head of Security aboard
const wantedOfficer = (names: string[] = ['Pun Pun']) => {
  const o = officer();
  for (const name of names) {
    A.giveWarrant(o, { name, reason: 'theft', minutes: 5 });
  }
  at(o, 5000, 'Central Primary Hallway');
  o.toTell = [];
  return o;
};
const sayTo = (o: any, text: string, speaker = 'Zim Fire', to = 'me') =>
  OFFICER.overhears(o, { details: { message: text, speaker, said_to: to } } as any);
{
  const o = wantedOfficer();
  o.peopleInView = [{ handle: 'p1', name: 'Zim Fire', job: 'Captain', place: 'Central Primary Hallway', distance: 1 }];
  sayTo(o, 'Pun Pun is in the bar');
  add('PLAY-03: the Captain says where: the warrant has the sighting', A.beatOf(o).warrants[0].lastSeen?.place, 'Bar');
  add('PLAY-03: read back aloud, and the Head of Security sent it by PDA', said(o), ['says to Zim Fire: Captain, I have that: Pun Pun, the Bar.', 'PDA to Joan Marsh: Security: Pun Pun is in the Bar.']);
  const plan = A.planBeat(o, open(o, 'serve_warrant'));
  add('PLAY-03: and it goes there', plan?.act, { tool: 'go_to', place: 'Bar' });
  o.toTell = [];
  sayTo(o, 'Pun Pun is in the Bar, go!');
  add('PLAY-03: said again: not read back again, nor sent on again', said(o), []);
}
{
  const o = wantedOfficer();
  sayTo(o, 'He is in the Bar');
  add('PLAY-03: "he", one warrant in hand: taken', [A.beatOf(o).warrants[0].lastSeen?.place, said(o)[0]], ['Bar', 'says to Zim Fire: Captain, I have that: Pun Pun, the Bar.']);
}
{
  const o = wantedOfficer(['Pun Pun', 'Dana Reyes']);
  sayTo(o, 'He is in the Bar');
  add('PLAY-03: "he", two warrants in hand: not taken, nothing said', [A.beatOf(o).warrants.map((w: any) => w.lastSeen ?? null), said(o)], [[null, null], []]);
}
{
  const o = wantedOfficer();
  OFFICER.readsMessage(o, 'Zim Fire', 'Pun Pun is in the bar', 0, 'Captain');
  add('PLAY-03: by PDA from the Captain: taken, and answered by PDA', [A.beatOf(o).warrants[0].lastSeen?.place, said(o)[0]], ['Bar', 'PDA to Zim Fire: Captain, I have that: Pun Pun, the Bar.']);
  o.toTell = [];
  OFFICER.readsMessage(o, 'Zim Fire', 'He is in the bar', 0, 'Captain');
  add('PLAY-03: "he" by PDA is not taken', said(o), []);
}
{
  const o = wantedOfficer();
  for (const text of ['Is Pun Pun in the bar?', 'Pun Pun is not in the bar', 'Any warrants right now?']) {
    sayTo(o, text);
  }
  add('PLAY-03: a question, a "not" and talk are no sighting', [A.beatOf(o).warrants[0].lastSeen ?? null, said(o)], [null, []]);
  sayTo(o, 'Warrant for Dana Reyes, for theft.');
  add('PLAY-03: a warrant said to it is still sent on', said(o), ['says to Zim Fire: ' + S.REFUSALS.toDesk('Captain', 'Joan Marsh')]);
}
{
  const o = wantedOfficer();
  sayTo(o, 'Pun Pun is in the bar', 'Ada Voss', 'someone else');
  add('PLAY-03: said to someone else, it is not taken', A.beatOf(o).warrants[0].lastSeen ?? null, null);
}
{
  // The Head of Security takes its officer's sighting, and does not pass it back.
  const hos: any = makeBrain('Joan Marsh', 'Head of Security');
  hos.pdaPeople = [CAPTAIN, { name: 'Hale Stone', job: 'Security Officer' }];
  hos.staffPost = 'Security Office';
  know(hos, ['Security Office', 'Bar']);
  at(hos, 3000, 'Security Office');
  D.deskTakes(hos, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for theft.', false);
  D.deskOf(hos).warrants[0].given = 'taken';
  hos.toTell = [];
  const took = D.deskTakes(hos, 'Hale Stone', 'Security Officer', S.sightLine('Pun Pun', 'Bar'), false);
  D.syncDesk(hos);
  add('PLAY-03: the officer\'s sighting is on the list', [took, D.deskOf(hos).warrants[0].lastSeen?.place], [true, 'Bar']);
  add('PLAY-03: and is not sent back to the officer', said(hos).filter((line: string) => line.includes('was seen')), []);
}

// ---- PLAY-08: a head in a cell is sent no security notice
{
  const hos: any = makeBrain('Joan Marsh', 'Head of Security');
  hos.pdaPeople = [CAPTAIN, HOP, CE, { name: 'Hale Stone', job: 'Security Officer' }];
  hos.staffPost = 'Security Office';
  know(hos, ['Security Office', 'Bar']);
  at(hos, 3000, 'Security Office');
  D.deskTakes(hos, 'Zim Fire', 'Captain', 'Warrant for Walker Wolfe, for theft.', false);
  D.deskTakes(hos, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for theft.', false);
  add('PLAY-08: a wanted head is not on the notice list', D.headsToTell(hos), ['Ada Voss']);
  D.deskTakes(hos, 'Hale Stone', 'Security Officer', 'Joan, Walker Wolfe is in Cell 2 for 5 minutes.', false);
  add('PLAY-08: nor once jailed, while in the cell', D.headsToTell(hos), ['Ada Voss']);
  // Five minutes on, a minute at a time: the notice goes out to whoever it is owed to.
  const sentTo: string[] = [];
  for (let now = 3100; now <= 3000 + 3600 + 1300; now += 100) {
    hos.now = now;
    D.syncDesk(hos);
    const task = open(hos, 'security_notice');
    const plan = task ? D.planDesk(hos, task) : null;
    if (plan?.act?.tool === 'message') {
      sentTo.push(`${now} ${plan.act.person}`);
      D.deskAfterActing(hos, plan.act, task, true);
      // Out of the cell, a head answers as Ada does.
      D.deskTakes(hos, plan.act.person, 'Head', 'Security notice received.', false);
    }
  }
  add('PLAY-08: no "did not reach" while the head was in the cell', said(hos).filter((line: string) => line.includes('did not reach Walker')), []);
  const walker = sentTo.filter((it) => it.endsWith('Walker Wolfe')).map((it) => Number(it.split(' ')[0]));
  add('PLAY-08: and the head is sent it once its cell time is up', [walker.length > 0, walker.every((t) => t > 3000 + 3000)], [true, true]);
}

// ---- PLAY-09: a head wanted in their own office: the Captain is asked to open it
{
  const o = officer([HOS, CAPTAIN]);
  A.giveWarrant(o, { name: 'Walker Wolfe', reason: 'theft', minutes: 5, byCaptain: true });
  at(o, 5000, 'Central Primary Hallway');
  add('PLAY-09: only the wanted head is listed: the Captain is asked', A.keepersOf(o, "Head of Personnel's Office", ['Walker Wolfe']), ['Zim Fire']);
  add('PLAY-09: someone else listed is asked, not the Captain', A.keepersOf(o, "Head of Personnel's Office", ['Walker Wolfe', 'Ada Voss']), ['Ada Voss']);
  add('PLAY-09: nobody listed: the Captain, as before', A.keepersOf(o, "Head of Personnel's Office", []), ['Zim Fire']);
}
{
  const o = officer([HOS, CAPTAIN]);
  A.giveWarrant(o, { name: 'Zim Fire', reason: 'theft', minutes: 5, byCaptain: true });
  at(o, 5000, 'Central Primary Hallway');
  add('PLAY-09: the Captain wanted and the only one listed: nobody', A.keepersOf(o, 'Bridge', ['Zim Fire']), []);
}
{
  const o = officer([HOS]);
  o.name = 'Zim Fire';
  add('PLAY-09: it is never asked itself', A.keepersOf(o, 'Bridge', ['Zim Fire']), []);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
