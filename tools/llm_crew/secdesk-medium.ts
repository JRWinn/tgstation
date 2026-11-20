// Security's word and list, the medium fixes of the night round (ARR-05, MULTI-01, SECT-10,
// TRB-06, TRB-11), case by case (CrewBrain/jobs/officer.ts, jobs/desk.ts, jobs/security.ts). No
// model is called and no station is simulated.
//
//   bun run secdesk-medium.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const D = await import(ROOT + 'jobs/desk');
const S = await import(ROOT + 'jobs/security');
const { jobFor } = await import(ROOT + 'jobs/index');
const OFFICER = jobFor('Security Officer');
const HOS_JOB = jobFor('Head of Security');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HOS = { name: 'Joan Marsh', job: 'Head of Security' };
const CAPTAIN = { name: 'Zim Fire', job: 'Captain' };
const HOP = { name: 'Walker Wolfe', job: 'Head of Personnel' };
const HALE = { name: 'Hale Stone', job: 'Security Officer' };
const SAM = { name: 'Sam Reed', job: 'Security Officer' };
const seeing = (who: any, distance = 1, place = 'Security Office') => ({ handle: `h-${who.name}`, name: who.name, job: who.job, place, distance });
const officer = (pda: any[] = [HOS, CAPTAIN, HOP]) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = pda;
  know(o, ['Security Office', 'Bar', 'Brig', 'Central Primary Hallway']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  return o;
};
const head = (pda: any[] = [CAPTAIN, HOP, HALE]) => {
  const h: any = makeBrain('Joan Marsh', 'Head of Security');
  h.pdaPeople = pda;
  h.staffPost = 'Security Office';
  h.office = 'Security Office';
  know(h, ['Security Office', 'Bar', 'Brig', 'Central Primary Hallway']);
  h.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(h, 3000, 'Security Office');
  return h;
};
const open = (b: any, kind: string, item?: string) => b.tasks.find((task: any) => task.kind === kind && task.state !== 'done' && (item === undefined || task.item === item));
const said = (b: any) => b.toTell.map((tell: any) => `${tell.byPda ? 'PDA' : 'says'} to ${tell.to}: ${tell.line}`);
const wordPlan = (o: any) => {
  const word = A.beatOf(o).words[0];
  return OFFICER.plan(o, open(o, 'word_for_security_head', word?.line));
};
const shown = (plan: any) => plan && (plan.act ? plan.act : plan.say ? { say: plan.say } : { ready: plan.ready, wait: !!plan.wait });

// ---- ARR-05: word the PDA would not send is said to the face, or taken to the post
{
  const o = officer();
  at(o, 5000, 'Central Primary Hallway');
  A.beatOf(o).outcomes.push({ what: 'cuffed', name: 'Dana Reyes' });
  OFFICER.syncTasks(o);
  add('ARR-05: out on the station with the head away, word goes by PDA', shown(wordPlan(o))?.tool, 'message');
  const task = open(o, 'word_for_security_head');
  OFFICER.afterActing(o, { tool: 'message', person: 'Joan Marsh', text: A.beatOf(o).words[0].line }, task, false, false, {});
  add('ARR-05: the PDA would not send it: kept', A.beatOf(o).words.length, 1);
  add('ARR-05: and it goes to its post to tell them there, not the PDA again at once', shown(wordPlan(o)), { tool: 'go_to', place: 'Security Office' });
  at(o, 5100, 'Security Office');
  OFFICER.syncTasks(o);
  add('ARR-05: at its post with nobody there, it waits a moment for them', shown(wordPlan(o)), { ready: false, wait: true });
  at(o, 5400, 'Security Office');
  OFFICER.syncTasks(o);
  add('ARR-05: and then waits without holding up other work', shown(wordPlan(o)), { ready: false, wait: false });
  at(o, 5500, 'Security Office', [seeing(HOS)]);
  OFFICER.syncTasks(o);
  add('ARR-05: the head comes in: it is said to their face', shown(wordPlan(o)), { say: 'Joan, I have Dana Reyes in cuffs.' });
  at(o, 5000 + 1900, 'Central Primary Hallway');
  OFFICER.syncTasks(o);
  A.beatOf(o).words[0].toldAt = undefined;
  add('ARR-05: some minutes on, out of sight again, the PDA is tried again', shown(wordPlan(o))?.tool, 'message');
}
{
  const o = officer();
  at(o, 5000, 'Central Primary Hallway');
  A.beatOf(o).outcomes.push({ what: 'hurt', name: '' });
  OFFICER.syncTasks(o);
  add('ARR-05: "I am hurt" goes at once by PDA when the head is not in sight', [shown(wordPlan(o))?.tool, A.beatOf(o).words[0].byPda], ['message', true]);
  at(o, 5050, 'Central Primary Hallway', [seeing(HOS, 1, 'Central Primary Hallway')]);
  OFFICER.syncTasks(o);
  add('ARR-05: marked for the PDA, the head walks up: said to their face', shown(wordPlan(o)), { say: 'Joan, I am hurt and can make no arrests.' });
}
{
  const o = officer();
  o.hasPda = false;
  at(o, 5000, 'Central Primary Hallway');
  A.beatOf(o).outcomes.push({ what: 'cuffed', name: 'Dana Reyes' });
  OFFICER.syncTasks(o);
  add('ARR-05: with no PDA on it, it takes the word to its post', shown(wordPlan(o)), { tool: 'go_to', place: 'Security Office' });
  o.security.holding = 'Dana Reyes';
  add('ARR-05: but not with someone by the arm', shown(wordPlan(o)), { ready: false, wait: false });
}
{
  const o = officer();
  at(o, 5000, 'Security Office', [seeing(HOS)]);
  A.beatOf(o).outcomes.push({ what: 'cuffed', name: 'Dana Reyes' });
  OFFICER.syncTasks(o);
  const word = A.beatOf(o).words[0];
  word.unheard = 2;
  word.byPda = true;
  add('ARR-05: said twice and not heard, with a PDA that works: the PDA', shown(wordPlan(o))?.tool, 'message');
}
{
  // The desk takes one word once.
  const h = head();
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  h.toTell = [];
  const jailed = 'Joan, Dana Reyes is in Cell 1 for 5 minutes.';
  D.deskTakes(h, 'Hale Stone', 'Security Officer', jailed, true);
  const first = [D.deskOf(h).arrests, said(h)];
  h.toTell = [];
  D.deskTakes(h, 'Hale Stone', 'Security Officer', jailed, false);
  add('ARR-05: "in Cell 1" said and then come again by PDA: one arrest, the Captain told once', [first, D.deskOf(h).arrests, said(h)], [[1, ['says to Hale Stone: Hale, I have that.', 'PDA to Zim Fire: Captain, Dana Reyes is in Cell 1 for 5 minutes.']], 1, []]);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I have Dana Reyes in cuffs.', false);
  add('ARR-05: "in cuffs" come late, after the cell: not passed on', said(h), []);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', jailed, true);
  add('ARR-05: said to its face again, it still says it has it', said(h), ['says to Hale Stone: Hale, I have that.']);
}
{
  const h = head();
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  h.toTell = [];
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I have Dana Reyes in cuffs.', false);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I lost Dana Reyes in the Bar.', false);
  h.toTell = [];
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I have Dana Reyes in cuffs.', false);
  add('ARR-05: cuffed, lost, and cuffed again: the second cuffs are news', said(h), ['PDA to Zim Fire: Captain, Hale has Dana Reyes in cuffs.']);
}
{
  const h = head();
  h.toTell = [];
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Try again', false);
  h.toTell = [];
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  add('ARR-05: hurt again after "try again" is news', [D.deskOf(h).officerOut, said(h).length], ['hurt', 1]);
}

// ---- MULTI-01: two officers: the word on one warrant goes to the one it was given to
const twoOfficers = () => {
  const h = head([CAPTAIN, HOP, HALE, SAM]);
  at(h, 3000, 'Security Office', [seeing(HALE)]);
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  D.syncDesk(h);
  const plan = HOS_JOB.plan(h, open(h, 'give_warrant', 'Dana Reyes'));
  HOS_JOB.afterSaying(h, plan.say);
  h.toTell = [];
  return h;
};
{
  const h = twoOfficers();
  add('MULTI-01: the warrant is given to Hale, in sight', D.deskOf(h).warrants[0].officer, 'Hale Stone');
  at(h, 3100, 'Security Office', [seeing(SAM)]);
  D.deskTakes(h, 'Sam Reed', 'Security Officer', 'The warrant, right away.', true);
  add('MULTI-01: Sam saying "The warrant, right away" does not settle the give to Hale', D.deskOf(h).warrants[0].given, 'said');
  at(h, 3000 + 700, 'Security Office', [seeing(SAM)]);
  D.syncDesk(h);
  const again = HOS_JOB.plan(h, open(h, 'give_warrant', 'Dana Reyes'));
  add('MULTI-01: given again with no word back: to Hale by PDA, though Sam is in sight', again?.act, { tool: 'message', person: 'Hale Stone', text: S.giveLine('Hale Stone', 'Dana Reyes', 'theft', 5, true) });
  HOS_JOB.afterActing(h, again?.act ?? { tool: 'wait' }, open(h, 'give_warrant', 'Dana Reyes'), true, false, {});
  add('MULTI-01: sent to Hale: taken', D.deskOf(h).warrants[0].given, 'taken');
  h.toTell = [];
  D.deskTakes(h, 'Walker Wolfe', 'Head of Personnel', 'Dana Reyes is in the Bar', false);
  D.syncDesk(h);
  add('MULTI-01: a sighting goes to Hale, not Sam in sight', said(h), ['PDA to Hale Stone: Hale, Dana Reyes was seen in the Bar.']);
  h.toTell = [];
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Pardon Dana Reyes', false);
  add('MULTI-01: and the let-go on a pardon', said(h).filter((it: string) => /let go/.test(it)), ['PDA to Hale Stone: Hale, Dana Reyes is to be let go: the Captain has pardoned them.']);
}
{
  const h = twoOfficers();
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'The warrant, right away.', true);
  h.toTell = [];
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, Dana Reyes is in Cell 1 for 5 minutes.', false);
  at(h, 3200, 'Security Office', [seeing(SAM)]);
  h.toTell = [];
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Pardon Dana Reyes', false);
  add('MULTI-01: someone in a cell: the let-go goes to who put them there', said(h).filter((it: string) => /let go/.test(it)), ['PDA to Hale Stone: Hale, Dana Reyes is to be let go: the Captain has pardoned them.']);
}
{
  const h = twoOfficers();
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'The warrant, right away.', true);
  h.pdaPeople = [CAPTAIN, HOP, SAM];
  at(h, 3300, 'Security Office', [seeing(SAM)]);
  D.syncDesk(h);
  add('MULTI-01: Hale gone from sight and PDA: the warrant is given afresh, to Sam', [D.deskOf(h).warrants[0].given, HOS_JOB.plan(h, open(h, 'give_warrant', 'Dana Reyes'))?.say], ['no', S.giveLine('Sam Reed', 'Dana Reyes', 'theft', 5, true)]);
}
{
  // One officer, as the test crew has: nothing changes.
  const h = head();
  at(h, 3000, 'Security Office', [seeing(HALE)]);
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  D.syncDesk(h);
  HOS_JOB.afterSaying(h, HOS_JOB.plan(h, open(h, 'give_warrant', 'Dana Reyes')).say);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'The warrant, right away.', true);
  at(h, 3100, 'Security Office');
  h.toTell = [];
  D.deskTakes(h, 'Walker Wolfe', 'Head of Personnel', 'Dana Reyes is in the Bar', false);
  D.syncDesk(h);
  add('MULTI-01: one officer: given, taken, and the sighting passed by PDA as before', [D.deskOf(h).warrants[0].given, said(h)], ['taken', ['PDA to Hale Stone: Hale, Dana Reyes was seen in the Bar.']]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n     got  ${got}\n     want ${want}`}`);
}
console.log(failed === 0 ? '\nall passed' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
