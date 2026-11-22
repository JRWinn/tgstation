// The words of a warrant, case by case. No model is called: a warrant is read in code, the notice
// to the heads and what a head reads out at its meeting are written and read back in code
// (CrewBrain/jobs/security.ts), and who may declare, pardon or take back a warrant is decided in
// code (jobs/desk.ts). So all of it can be checked in a second.
//
//   bun run security.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const S = await import(ROOT + 'jobs/security');
const { deskTakes, deskOf, syncDesk, deskRead, deskOutcome, stillWanted } = await import(ROOT + 'jobs/desk');
const { readWanted, wantedOverhears, syncWanted, wantedMeetingStep } = await import(ROOT + 'jobs/wanted');
const { withRemark } = await import(ROOT + 'jobs/reports');
const { beatOf } = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// ---- a warrant read out of what was said
const KNOWN = ['Dana Reyes', 'Walker Wolfe', 'Ada Voss'];
add('the plain form', S.readWarrant('Warrant for Pun Pun, for wrecking the Custodial Closet.', KNOWN), { name: 'Pun Pun', reason: 'wrecking the Custodial Closet', minutes: null });
add('with a time in words', S.readWarrant('Warrant for Pun Pun, for wrecking the Custodial Closet. Ten minutes.', KNOWN), { name: 'Pun Pun', reason: 'wrecking the Custodial Closet', minutes: 10 });
add('"arrest", a known name, a colon and digits', S.readWarrant('Joan, arrest Dana Reyes: theft, 5 minutes', KNOWN), { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
add('a first name alone finds its owner', S.readWarrant('Arrest Dana for theft', KNOWN), { name: 'Dana Reyes', reason: 'theft', minutes: null });
add('"put a warrant out on"', S.readWarrant('Joan, put a warrant out on Dana Reyes.', KNOWN), { name: 'Dana Reyes', reason: '', minutes: null });
add('"lock up", no reason', S.readWarrant('lock up Pun Pun', KNOWN), { name: 'Pun Pun', reason: '', minutes: null });
add('no comma before the reason', S.readWarrant('Warrant for Pun Pun for trespass in the Cargo Bay.', KNOWN), { name: 'Pun Pun', reason: 'trespass in the Cargo Bay', minutes: null });
add('a time past the most a cell allows is the most', S.readWarrant('Warrant on Pun Pun, 40 minutes', KNOWN)?.minutes, 15);
add('nobody named is no warrant', S.readWarrant('Did you arrest him?', KNOWN), null);
add('talk about warrants is no warrant', S.readWarrant('How many warrants are there?', KNOWN), null);
add('as a head declares one for trespass, read back', S.readWarrant(S.warrantLine('Pun Pun', 'trespass in the Cargo Bay'), KNOWN), { name: 'Pun Pun', reason: 'trespass in the Cargo Bay', minutes: null });

// The wordings the Captain tried in the round of 14:28, which did nothing then.
add('"put out an APB on"', S.readWarrant('I want to put out an APB on Pun Pun', KNOWN), { name: 'Pun Pun', reason: '', minutes: null });
add('"is wanted"', S.readWarrant('Pun Pun is wanted', KNOWN), { name: 'Pun Pun', reason: '', minutes: null });
add('"is wanted for", said to someone by name', S.readWarrant('Joan, Dana Reyes is wanted for theft', KNOWN), { name: 'Dana Reyes', reason: 'theft', minutes: null });
add('"Nobody is wanted" declares nothing', S.readWarrant('Nobody is wanted. The meeting is over, thank you.', KNOWN), null);
add('nor does "Who is wanted?"', S.readWarrant('Who is wanted?', KNOWN), null);

// SECT-01: saying not to arrest someone, or asking about a warrant, declares none.
for (const line of [
  'Do not arrest Pun Pun.',
  "Joan, don't arrest Dana Reyes, she is with me.",
  'Is there a warrant for Dana Reyes?',
  'Why did you arrest Pun Pun?',
  'Did your officer arrest Pun Pun yet?',
  'No warrant for Dana Reyes, she is fine.',
  'Joan, did your officer arrest Pun Pun yet',
  "Don't lock Pun Pun up.",
]) {
  add(`"${line}" declares no warrant`, S.readWarrant(line, KNOWN), null);
}
for (const line of ['Could you arrest Pun Pun, please?', "Don't wait, arrest Pun Pun now.", 'Leave the bar and arrest Pun Pun', 'Warrant for Pun Pun. Did you get that?']) {
  add(`"${line}" is still a warrant`, S.readWarrant(line, KNOWN)?.name, 'Pun Pun');
}

// SECT-03: a name nobody knows stops at the first word that is no part of a name.
const FEW = ['Dana Reyes', 'Hale Stone'];
for (const [line, name] of [
  ['Arrest Pun Pun in the bar', 'Pun Pun'],
  ['Warrant for Pun Pun who wrecked the bar', 'Pun Pun'],
  ['Arrest Pun Pun because he stole my id', 'Pun Pun'],
  ['Warrant on Pun Pun - theft', 'Pun Pun'],
  ['Lock up Pun Pun in the brig', 'Pun Pun'],
  ['Arrest Bob Smith who is in the bar', 'Bob Smith'],
  ['Arrest Pun Pun on site', 'Pun Pun'],
  ['Arrest Mary-Ann Lee in the bar', 'Mary-Ann Lee'],
  ['Warrant for Bob the clown, for theft', 'Bob the clown'],
]) {
  add(`"${line}" is a warrant on ${name}`, S.readWarrant(line, FEW)?.name, name);
}
add('and what follows the name is the reason', S.readWarrant('Arrest Pun Pun because he stole my id', FEW)?.reason, 'because he stole my id');

// SECT-21: "wanted" somewhere, a word a letter off a key word, and "put X up" are no warrant.
const SOME = ['Walker Wolfe', 'Dana Reyes', 'Pun Pun'];
for (const line of ['Joan, Walker is wanted on the bridge.', 'Dana is wanted in the kitchen', 'Pun Pun is wasted again', 'Put Dana up for the night shift', 'Dana is waited on in the bar', 'Walker is wanted by the Captain on the bridge']) {
  add(`"${line}" declares no warrant`, S.readWarrant(line, SOME), null);
}
for (const [line, name, reason, minutes] of [
  ['Pun Pun is wanted', 'Pun Pun', '', null],
  ['Joan, Dana Reyes is wanted for theft', 'Dana Reyes', 'theft', null],
  ['Dana Reyes is wanted, she took the ID', 'Dana Reyes', 'she took the ID', null],
  ['Pun Pun is wanted for theft. 10 minutes', 'Pun Pun', 'theft', 10],
  ['throw Dana in the brig', 'Dana Reyes', '', null],
  ['lock Pun Pun up for 10 minutes', 'Pun Pun', '', 10],
  ['warrent for pun pun', 'Pun Pun', '', null],
  ['Pun Pun is wanted by security', 'Pun Pun', 'by security', null],
] as [string, string, string, number | null][]) {
  add(`"${line}" still reads`, S.readWarrant(line, SOME), { name, reason, minutes });
}
add('"wasted" and "detail" are left as they are', S.mendWords('wasted detail withdrawn'), 'wasted detail withdrawn');
add('"warrent", "arest" and "warrants" are still mended', S.mendWords('warrent arest warrants'), 'warrant arrest warrant');

// PARSE-03: a known first name of three letters is found with more words after it.
const SHORT = ['Bob Hale', 'Dana Reyes', 'Ann Moss', 'Tom Reed', 'Eli Moor', 'Joe Bloggs'];
for (const [line, name, reason] of [
  ['arrest bob pls', 'Bob Hale', ''],
  ['arrest bob in the bar', 'Bob Hale', 'in the bar'],
  ['arrest ann in the bar', 'Ann Moss', 'in the bar'],
  ['arrest tom he stole my id', 'Tom Reed', 'he stole my id'],
  ['arrest eli who is in the bar', 'Eli Moor', 'who is in the bar'],
  ['warrant for ann - theft', 'Ann Moss', '- theft'],
  ['arrest ann stole my id', 'Ann Moss', 'stole my id'],
  ['arrest dana pls', 'Dana Reyes', ''],
  // A first name alone is the one known person who has it, as for longer first names: the owner should know.
  ['arrest joe smith', 'Joe Bloggs', 'smith'],
]) {
  const read = S.readWarrant(line, SHORT);
  add(`"${line}" is a warrant on ${name}`, [read?.name, read?.reason], [name, reason]);
}
add('a three-letter first name two people share is nobody in particular', S.closeName('bob', ['Bob Hale', 'Bob Stone']), undefined);
add('nor is one a letter out', S.closeName('bab', ['Bob Hale']), undefined);

// ---- names
add('a warrant for Pun Pun names Pun Pun III', S.sameName('Pun Pun', 'Pun Pun III'), true);
add('and not Pun Punch', S.sameName('Pun Pun', 'Pun Punch'), false);
add('a name is found in a sentence', S.nameIn('I saw Dana Reyes by the bar', ['Pun Pun', 'Dana Reyes']), 'Dana Reyes');

// ---- the notice to the heads, written and read back
const LIST = [{ name: 'Pun Pun', reason: 'wrecking the Custodial Closet' }, { name: 'Dana Reyes' }];
const notice = S.noticeLines(LIST);
add('one notice for a short list', notice.length, 1);
add('the notice reads back', S.readNotice(notice[0]), { entries: LIST, more: false });
add('nobody wanted reads back as an empty list', S.readNotice(S.noticeLines([])[0]), { entries: [], more: false });
const LONG = Array.from({ length: 6 }, (_, n) => ({ name: `Person Number${n}`, reason: 'being a great deal of trouble to everyone' }));
const long = S.noticeLines(LONG);
add('a long list goes out as several, none past what a PDA sends', long.length > 1 && long.every((line: string) => line.length <= 200), true);
add('and reads back whole', long.flatMap((line: string) => S.readNotice(line)?.entries ?? []), LONG);
add('all but the first say they add to the list', long.map((line: string) => S.readNotice(line)?.more), [false, ...long.slice(1).map(() => true)]);

// ---- what a head reads out at its meeting
add('one name', S.meetingLines(['Pun Pun'])[0], 'Security is looking for Pun Pun. If you see them, send security a PDA message saying where.');
add('three names read back', S.readMeetingLine(S.meetingLines(['Pun Pun', 'Dana Reyes', 'Ada Voss'])[0]), { names: ['Pun Pun', 'Dana Reyes', 'Ada Voss'], more: false });
add('nobody reads back as nobody', S.readMeetingLine(S.meetingLines([])[0]), { names: [], more: false });
add('talk is not that', S.readMeetingLine('Security is in the Bar.'), null);

// ---- the Head of Security to its officer, and back
add('a warrant given reads back', S.readGiven(S.giveLine('Hale Stone', 'Pun Pun', 'trespass in the Cargo Bay', 5)), { name: 'Pun Pun', reason: 'trespass in the Cargo Bay', minutes: 5, byCaptain: false });
add('with no reason', S.readGiven(S.giveLine('Hale Stone', 'Pun Pun', '', 15)), { name: 'Pun Pun', reason: '', minutes: 15, byCaptain: false });
add('TRUST-06: one the Captain declared says so, and reads back so', [S.giveLine('Hale Stone', 'Pun Pun', 'theft', 5, true), S.readGiven(S.giveLine('Hale Stone', 'Pun Pun', 'theft', 5, true))], ['Hale, warrant: Pun Pun, for theft. Bring them in, 5 minutes. The Captain declared it.', { name: 'Pun Pun', reason: 'theft', minutes: 5, byCaptain: true }]);
for (const outcome of [
  { what: 'jailed', name: 'Pun Pun', cell: 'Cell 1', minutes: 10, resisted: true },
  { what: 'jailed', name: 'Dana Reyes', cell: 'Cell 2', minutes: 5, resisted: false },
  { what: 'hurt', name: 'Pun Pun' },
  { what: 'hurt', name: '' },
  { what: 'baton', name: 'Pun Pun' },
  { what: 'attacked', name: 'Dana Reyes', other: 'Pun Pun' },
  { what: 'attacked', name: 'Dana Reyes' },
  { what: 'freed', name: 'Pun Pun' },
  { what: 'cannot', name: 'Pun Pun', why: 'every cell is in use' },
]) {
  const line = S.outcomeLine('Joan', outcome);
  add(`read back: "${line}"`, S.readOutcome(line), outcome);
}
add('"lost" reads back with the room left to the reader', S.readOutcome(S.outcomeLine('Joan', { what: 'lost', name: 'Pun Pun', place: 'Bar' })), { what: 'lost', name: 'Pun Pun' });
add('a sighting is not taken for someone in a cell', S.readOutcome(S.sightLine('Pun Pun', 'Bar')), null);
add('nothing security says takes a remark after it', [S.giveLine('Hale', 'Pun Pun', 'trespass', 5), S.arrestLine('Pun Pun', 'trespass'), S.meetingLines(['Pun Pun'])[0], S.takenLine('Captain', 'Pun Pun', '', 5, false), S.pardonedLine('Captain', 'Pun Pun')].map((line) => withRemark(line, 'Lovely.') === line), [true, true, true, true, true]);

// ---- the desk: who may declare, pardon and take back
const PDA = [
  { name: 'Zim Fire', job: 'Captain' },
  { name: 'Walker Wolfe', job: 'Head of Personnel' },
  { name: 'Ada Voss', job: 'Chief Engineer' },
  { name: 'Hale Stone', job: 'Security Officer' },
  { name: 'Dana Reyes', job: 'Janitor' },
];
function head() {
  const b = makeBrain('Joan Marsh', 'Head of Security');
  b.pdaPeople = PDA; b.staffPost = 'Security Office';
  know(b, ['Security Office', 'Bar', 'Cargo Bay']);
  at(b, 3000, 'Security Office');
  return b;
}
const said = (b: any) => b.toTell.map((tell: any) => `${tell.byPda ? 'PDA' : 'says'} to ${tell.to}: ${tell.line}`);
let b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for wrecking the Custodial Closet.', false);
add('the Captain declares one by PDA: it is on the list', deskOf(b).warrants.map((w: any) => [w.name, w.reason, w.minutes, w.by]), [['Pun Pun', 'wrecking the Custodial Closet', 5, 'Zim Fire']]);
add('and is answered by PDA, word for word', said(b), ['PDA to Zim Fire: Captain, I have that: a warrant for Pun Pun, for wrecking the Custodial Closet. 5 minutes. I do not know that name yet.']);
b = head();
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Joan, arrest Dana Reyes for theft, ten minutes.', true);
add('a head declares one to its face: answered aloud, and the Captain gets a copy', said(b), ['says to Walker Wolfe: Walker, I have that: a warrant for Dana Reyes, for theft. 10 minutes.', 'PDA to Zim Fire: Captain, Walker has declared a warrant for Dana Reyes, for theft.']);
b = head();
deskTakes(b, 'Dana Reyes', 'Janitor', 'Joan, arrest Walker Wolfe.', true);
add('a janitor cannot declare one', [deskOf(b).warrants.length, said(b)], [0, ['says to Dana Reyes: Dana, a warrant is for the Captain or a head of department to declare. Take it to your head.']]);
b = head();
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Zim Fire, for being rude.', false);
add('nobody declares one on the Captain', [deskOf(b).warrants.length, said(b)], [0, ['PDA to Walker Wolfe: Walker, nobody declares a warrant on the Captain.']]);
b = head();
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Ada Voss, for theft.', false);
add('a head cannot declare one on a head', [deskOf(b).warrants.length, said(b)], [0, ['PDA to Walker Wolfe: Walker, only the Captain can declare a warrant on a head of department.']]);
b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Warrant for Ada Voss, for theft.', false);
add('the Captain can', deskOf(b).warrants.map((w: any) => w.name), ['Ada Voss']);
b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Arrest Hale Stone.', false);
add('nobody declares one on security', [deskOf(b).warrants.length, said(b)], [0, ['PDA to Zim Fire: Captain, I take no warrant on my own staff.']]);
b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Warrant for Pun Pun.', false);
b.toTell = [];
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Pun Pun, for trespass in the Bar.', false);
add('a second warrant on the same person is not taken', [deskOf(b).warrants.length, said(b)], [1, ['PDA to Walker Wolfe: Walker, there is already a warrant on Pun Pun.']]);
b.toTell = [];
deskTakes(b, 'Dana Reyes', 'Janitor', 'Security: Pun Pun is in the Bar.', false);
add('a sighting is noted, from anyone', deskOf(b).warrants[0].lastSeen?.place, 'Bar');
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Pardon Pun Pun.', false);
add('a head cannot pardon', [deskOf(b).warrants.length, said(b)], [1, ["PDA to Walker Wolfe: Walker, a pardon is the Captain's to give."]]);
b.toTell = [];
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Cancel the warrant on Pun Pun.', false);
add("nor take back the Captain's warrant", [deskOf(b).warrants.length, said(b)], [1, ['PDA to Walker Wolfe: Walker, that warrant is not yours to take back.']]);
b.toTell = [];
deskTakes(b, 'Zim Fire', 'Captain', 'Pardon Pun Pun.', true);
add('the Captain pardons: off the list, and answered', [deskOf(b).warrants.length, said(b)], [0, ['says to Zim Fire: Captain, Pun Pun is pardoned.']]);
b.toTell = [];
deskTakes(b, 'Zim Fire', 'Captain', 'Pardon Dana Reyes.', true);
add('a pardon for someone with nothing against them', said(b), ['says to Zim Fire: Captain, there is nothing against Dana Reyes.']);
// SECT-02: a pardon is read only with the name by the pardon word, and never when said not to.
function wantedPunPun() {
  const d = head();
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for theft.', false);
  d.toTell = [];
  return d;
}
function heldPunPun() {
  const d = wantedPunPun();
  deskTakes(d, 'Hale Stone', 'Security Officer', 'Joan, Pun Pun is in Cell 1 for 5 minutes.', false);
  d.toTell = [];
  return d;
}
for (const line of ["Don't release Pun Pun until his time is up.", 'Do not let go of Pun Pun', 'Pun Pun broke free of the cuffs, find him', "Keep Pun Pun locked up, don't let him go free", 'Did you release Pun Pun?']) {
  const w = wantedPunPun();
  deskTakes(w, 'Zim Fire', 'Captain', line, false);
  const h = heldPunPun();
  deskTakes(h, 'Zim Fire', 'Captain', line, false);
  add(`"${line}" pardons nobody, wanted or held`, [deskOf(w).warrants.length, Object.keys(deskOf(h).held), said(w).concat(said(h)).filter((it: string) => /pardon|let go/.test(it))], [1, ['Pun Pun'], []]);
}
for (const line of ['Pardon Pun Pun', 'Release Pun Pun', 'Let Pun Pun go', 'Set Pun Pun free', "Don't worry, release Pun Pun", 'Could you set free Pun Pun?']) {
  const w = wantedPunPun();
  deskTakes(w, 'Zim Fire', 'Captain', line, false);
  const h = heldPunPun();
  deskTakes(h, 'Zim Fire', 'Captain', line, false);
  add(`"${line}" pardons, wanted or held`, [deskOf(w).warrants.length, Object.keys(deskOf(h).held), said(w)], [0, [], ['PDA to Zim Fire: Captain, Pun Pun is pardoned.']]);
}
{
  const w = wantedPunPun();
  deskTakes(w, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for setting the slimes free, 10 minutes', false);
  add('a warrant with "free" in its reason changes the time, and pardons nobody', [deskOf(w).warrants.map((it: any) => [it.name, it.minutes]), said(w)], [[['Pun Pun', 10]], ['PDA to Zim Fire: Captain, I have that: Pun Pun, 10 minutes.']]);
  w.toTell = [];
  deskTakes(w, 'Walker Wolfe', 'Head of Personnel', "Don't release Pun Pun until his time is up.", false);
  add('a head saying not to release someone is not told a pardon is the Captain\'s', said(w).filter((it: string) => /pardon/.test(it)), []);
}
{
  // SECT-03: a longer reading of a name already wanted is the same person.
  const w = wantedPunPun();
  deskTakes(w, 'Zim Fire', 'Captain', 'Arrest Pun Pun in the bar, 10 minutes', false);
  add('"Arrest Pun Pun in the bar, 10 minutes" with Pun Pun wanted changes the time', [deskOf(w).warrants.map((it: any) => [it.name, it.minutes]), said(w)], [[['Pun Pun', 10]], ['PDA to Zim Fire: Captain, I have that: Pun Pun, 10 minutes.']]);
  w.toTell = [];
  deskTakes(w, 'Zim Fire', 'Captain', 'Warrant for Pun Pun the monkey.', false);
  add('"Pun Pun the monkey" with Pun Pun wanted is no second warrant', [deskOf(w).warrants.length, said(w)], [1, ['PDA to Zim Fire: Captain, there is already a warrant on Pun Pun.']]);
}
b = head();
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Pun Pun, for trespass in the Bar.', false);
b.toTell = [];
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Cancel the warrant on Pun Pun.', false);
add('a head takes back its own', [deskOf(b).warrants.length, said(b)], [0, ['PDA to Walker Wolfe: Walker, the warrant on Pun Pun is withdrawn.']]);
// SECT-04: other ways of taking a warrant back. SECT-22: and a cancel word not bound to the warrant is none.
function headsPunPun() {
  const d = head();
  deskTakes(d, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Pun Pun, for trespass in the Bar.', false);
  d.toTell = [];
  return d;
}
for (const line of ['The warrant on Pun Pun is withdrawn.', "Pun Pun's warrant is cancelled", 'Forget the warrant on Pun Pun', 'Call off the arrest of Pun Pun', 'Joan, drop the warrant on Pun Pun, my mistake', "Withdraw Pun Pun's warrant", 'The warrant for Pun Pun is lifted now.']) {
  const d = headsPunPun();
  deskTakes(d, 'Walker Wolfe', 'Head of Personnel', line, false);
  add(`"${line}" takes it back`, [deskOf(d).warrants.length, said(d)], [0, ['PDA to Walker Wolfe: Walker, the warrant on Pun Pun is withdrawn.']]);
}
for (const line of ["Don't forget the warrant on Pun Pun", 'Warrant for Pun Pun, he dropped the crate', 'Drop everything, the warrant on Pun Pun comes first', "Don't cancel the warrant on Pun Pun, he did it", 'Do not withdraw the warrant on Pun Pun', 'Has the warrant on Pun Pun been withdrawn?', 'Drop it and arrest Pun Pun']) {
  const d = headsPunPun();
  deskTakes(d, 'Walker Wolfe', 'Head of Personnel', line, false);
  add(`"${line}" takes nothing back`, [deskOf(d).warrants.map((it: any) => it.name), said(d).filter((it: string) => /withdrawn/.test(it))], [['Pun Pun'], []]);
}
for (const line of ['Hale, drop what you are doing, warrant for Dana Reyes, for theft', 'Call off your patrol, I have a warrant for Dana Reyes']) {
  const d = head();
  deskTakes(d, 'Zim Fire', 'Captain', line, false);
  add(`"${line}" is a warrant on Dana Reyes`, [deskOf(d).warrants.map((it: any) => it.name), said(d).filter((it: string) => /I have that: a warrant for Dana Reyes/.test(it)).length], [['Dana Reyes'], 1]);
}
{
  const d = headsPunPun();
  deskOf(d).unread = [{ from: 'Walker Wolfe', fromJob: 'Head of Personnel', text: 'never mind about pun pun', at: Date.now() }];
  add('the LLM reading "withdraw" takes it back through the same code', [deskRead(d, deskOf(d).unread[0], { kind: 'withdraw', name: 'pun pun', minutes: 0 }), deskOf(d).warrants.length, said(d)], ['Read as: "Cancel the warrant on pun pun." The body answers Walker Wolfe in the fixed words.', 0, ['PDA to Walker Wolfe: Walker, the warrant on Pun Pun is withdrawn.']]);
  add('and the reading is let through', S.readReading('{"kind":"withdraw","name":"Pun Pun","minutes":0}', 'never mind about Pun Pun')?.kind, 'withdraw');
}
// SECT-13: no warrant on Unknown, from a head or from the Captain.
for (const [from, job, to] of [['Walker Wolfe', 'Head of Personnel', 'Walker'], ['Zim Fire', 'Captain', 'Captain']]) {
  const d = head();
  deskTakes(d, from, job, 'Warrant for Unknown, for trespass in the Cargo Bay.', false);
  add(`a warrant on Unknown from the ${job} is refused`, [deskOf(d).warrants.length, said(d)], [0, [`PDA to ${from}: ${to}, I cannot take a warrant on Unknown: that is anyone with their face hidden. Tell me who it is.`]]);
}
add('"Unknown (as Pun Pun)" is no name either', S.isNoName('Unknown (as Pun Pun)'), true);
add('and Pun Pun is one', S.isNoName('Pun Pun'), false);
add('the not-followed line fits a PDA message',S.notFollowedLine('Walker').length <= 200, true);
// The officer says someone is in a cell: off the list, into the cells, and the Captain and whoever declared it are told.
b = head();
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Pun Pun, for trespass in the Bar.', false);
b.toTell = [];
deskTakes(b, 'Hale Stone', 'Security Officer', 'Joan, Pun Pun is in Cell 1 for 10 minutes, 5 of them for resisting arrest.', false);
add('put in a cell: off the list and into the cells', [deskOf(b).warrants.length, deskOf(b).held['Pun Pun']?.cell, deskOf(b).arrests], [0, 'Cell 1', 1]);
add('and the Captain and whoever declared it are told', said(b), ['PDA to Zim Fire: Captain, Pun Pun is in Cell 1 for 10 minutes, 5 of them for resisting arrest.', 'PDA to Walker Wolfe: Walker, Pun Pun is in Cell 1 for 10 minutes, 5 of them for resisting arrest.']);
// With no officer aboard it serves the warrant itself.
b = head();
b.pdaPeople = PDA.filter((person) => person.job !== 'Security Officer');
deskTakes(b, 'Zim Fire', 'Captain', 'Warrant for Pun Pun.', false);
syncDesk(b);
add('with no officer aboard the warrant goes into its own hands', beatOf(b).warrants.map((w: any) => w.name), ['Pun Pun']);

// ---- TRB-03: a warrant served by one holder is given up by the other, and nobody is let go by it
{
  const OFFICER = (await import(ROOT + 'jobs/index')).jobFor('Security Officer');
  const outHurt = () => {
    const d = head();
    deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
    deskTakes(d, 'Hale Stone', 'Security Officer', 'Joan, I could not take Pun Pun. I am hurt.', false);
    syncDesk(d);
    d.toTell = [];
    return d;
  };
  let d = outHurt();
  add('the officer out hurt, the Head of Security holds the warrant itself', beatOf(d).warrants.map((w: any) => w.name), ['Dana Reyes']);
  deskOutcome(d, { what: 'jailed', name: 'Dana Reyes', cell: 'Cell 2', minutes: 5, resisted: false }, 'Joan Marsh', false);
  const served = said(d).filter((it: string) => it.startsWith('PDA to Hale Stone'));
  add('served by the Head of Security: the officer is told it is served', served, ['PDA to Hale Stone: Hale, Dana Reyes is in a cell: the warrant is served.']);
  add('and the line is not read as an outcome', S.readOutcome(S.servedLine('Hale Stone', 'Dana Reyes')), null);
  const hale = makeBrain('Hale Stone', 'Security Officer');
  hale.pdaPeople = [...PDA.filter((person) => person.name !== 'Hale Stone'), { name: 'Joan Marsh', job: 'Head of Security' }];
  know(hale, ['Security Office', 'Brig']);
  // In the brig, with the prisoner left in cuffs in the cell before it.
  at(hale, 5000, 'Brig', [{ handle: 'p5', name: 'Dana Reyes', job: 'Janitor', place: 'Brig', distance: 2, cuffed: 1 }]);
  (await import(ROOT + 'jobs/arrests')).giveWarrant(hale, { name: 'Dana Reyes', reason: 'theft', minutes: 5 });
  OFFICER.readsMessage(hale, 'Joan Marsh', S.servedLine('Hale Stone', 'Dana Reyes'), 0, 'Head of Security');
  add('the officer gives its copy up, and lets nobody out of the cell', [beatOf(hale).warrants.length, beatOf(hale).toFree.length], [0, 0]);
  d = outHurt();
  deskTakes(d, 'Hale Stone', 'Security Officer', 'Joan, Dana Reyes is in Cell 1 for 5 minutes.', false);
  add('served by the hurt officer: the Head of Security gives its own copy up', [beatOf(d).warrants.length, beatOf(d).toFree.length, said(d).filter((it: string) => it.startsWith('PDA to Hale Stone'))], [0, 0, []]);
}

// ---- SECT-11: a warrant declared while the officer is out is given to it when it is back
{
  const giving = (d: any) => d.tasks.filter((task: any) => task.kind === 'give_warrant' && task.state !== 'done').map((task: any) => task.item);
  const d = head();
  deskTakes(d, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  syncDesk(d);
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  syncDesk(d);
  add('declared while the officer is out: the Head of Security holds it', [deskOf(d).warrants.map((w: any) => w.given), beatOf(d).warrants.map((w: any) => w.name)], [['taken'], ['Dana Reyes']]);
  deskTakes(d, 'Zim Fire', 'Captain', 'Try again.', false);
  syncDesk(d);
  add('told to try again: it is given to the officer, and handed back', [giving(d), beatOf(d).warrants.length], [['Dana Reyes'], 0]);
  syncDesk(d);
  add('and still is a sync later', giving(d), ['Dana Reyes']);
  const late = head();
  late.pdaPeople = PDA.filter((person) => person.job !== 'Security Officer');
  deskTakes(late, 'Zim Fire', 'Captain', 'Warrant for Pun Pun.', false);
  syncDesk(late);
  late.pdaPeople = PDA;
  syncDesk(late);
  add('no officer aboard, then one: the warrant is given to it', [giving(late), beatOf(late).warrants.length], [['Pun Pun'], 0]);

  // ARR-13: a warrant kept back in its own hands, mid-arrest, is not also given to the officer.
  const { addTask } = await import(ROOT + 'tasks');
  const m = head();
  deskTakes(m, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  syncDesk(m);
  deskTakes(m, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  deskTakes(m, 'Zim Fire', 'Captain', 'Warrant for Pun Pun.', false);
  syncDesk(m);
  const serve = addTask(m, { kind: 'serve_warrant', urgency: 'asked', source: 'told', item: 'Dana Reyes' });
  m.lastAct = { key: 'x', tool: 'arrest', at: 0, act: { tool: 'arrest', person: 'p9', how: 'force' }, task: serve.id };
  deskTakes(m, 'Zim Fire', 'Captain', 'Try again.', false);
  syncDesk(m);
  add('ARR-13: told to try again mid-arrest: the one being arrested is kept, the other given', [giving(m), beatOf(m).warrants.map((w: any) => w.name)], [['Pun Pun'], ['Dana Reyes']]);
  syncDesk(m);
  add('ARR-13: and a sync later, still not given while the arrest is under way', [giving(m), beatOf(m).warrants.map((w: any) => w.name)], [['Pun Pun'], ['Dana Reyes']]);
  m.lastAct = null;
  syncDesk(m);
  add('ARR-13: the arrest failed and nobody is held: it is given to the officer then', [giving(m).sort(), beatOf(m).warrants.length], [['Dana Reyes', 'Pun Pun'], 0]);
  // Kept back, then jailed: off the list, never given.
  const j = head();
  deskTakes(j, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  syncDesk(j);
  deskTakes(j, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  syncDesk(j);
  j.security = { ...(j.security ?? {}), holding: 'Dana Reyes' };
  deskTakes(j, 'Zim Fire', 'Captain', 'Try again.', false);
  syncDesk(j);
  add('ARR-13: holding them when the officer is back: kept, not given', [giving(j), deskOf(j).keptBack], [[], ['Dana Reyes']]);
  deskOutcome(j, { what: 'jailed', name: 'Dana Reyes', cell: 'Cell 1', minutes: 5, resisted: false }, j.name, false);
  j.security = { ...j.security, holding: null };
  beatOf(j).warrants = [];
  syncDesk(j);
  add('ARR-13: then jailed: off the list, and never given', [giving(j), deskOf(j).warrants.length, deskOf(j).keptBack], [[], 0, []]);
}

// ---- TRUST-06: a warrant is settled on one person at once, and a name two share is asked about
{
  const twoJanes = () => {
    const d = head();
    d.pdaPeople = [...PDA, { name: 'Jane Doe', job: 'Assistant' }, { name: 'Jane Marsh', job: 'Research Director' }, { name: 'Dana Smith', job: 'Cook' }];
    return d;
  };
  let d = twoJanes();
  deskTakes(d, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Jane, for theft.', false);
  add('a first name two share is no warrant, and is asked about', [deskOf(d).warrants.length, said(d)], [0, ['PDA to Walker Wolfe: Walker, there are two by that name: Jane Doe and Jane Marsh. Which one?']]);
  d = twoJanes();
  deskTakes(d, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Jane Doe, for theft.', false);
  add('the full name is taken', deskOf(d).warrants.map((w: any) => w.name), ['Jane Doe']);
  d = twoJanes();
  deskTakes(d, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Jane Marsh, for theft.', false);
  add('and the rule on heads holds for the one named', deskOf(d).warrants.length, 0);
  d = twoJanes();
  deskTakes(d, 'Zim Fire', 'Captain', 'Arrest Dana for theft.', false);
  add('"Arrest Dana" with two Danas aboard is asked about', [deskOf(d).warrants.length, said(d)], [0, ['PDA to Zim Fire: Captain, there are two by that name: Dana Reyes and Dana Smith. Which one?']]);
  d = twoJanes();
  deskTakes(d, 'Zim Fire', 'Captain', 'Arrest Dana Smith for theft.', false);
  add('"Arrest Dana Smith" is a warrant on Dana Smith', deskOf(d).warrants.map((w: any) => w.name), ['Dana Smith']);
  d = head();
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Reyes, for theft.', false);
  add('a surname one person has is kept under their full name', deskOf(d).warrants.map((w: any) => w.name), ['Dana Reyes']);
  const { onLead } = await import(ROOT + 'jobs/arrests');
  const off = makeBrain('Hale Stone', 'Security Officer');
  off.pdaPeople = [{ name: 'Joan Marsh', job: 'Head of Security' }, { name: 'Pun Pun', job: 'Assistant' }, { name: 'Pun Pun II', job: 'Assistant' }];
  know(off, ['Security Office', 'Bar']);
  (await import(ROOT + 'jobs/arrests')).giveWarrant(off, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(off, 5000, 'Bar', [{ handle: 'p2', name: 'Pun Pun II', job: 'Assistant', place: 'Bar', distance: 2 }]);
  add('an officer with a warrant on Pun Pun, a name it knows, does not go for Pun Pun II', onLead(off), false);
  at(off, 5010, 'Bar', [{ handle: 'p1', name: 'Pun Pun', job: 'Assistant', place: 'Bar', distance: 2 }]);
  add('and does go for Pun Pun', onLead(off), true);
  // Steps 4 and 5: a head of staff is arrested only on a warrant the Captain declared.
  const A = await import(ROOT + 'jobs/arrests');
  const onHead = (byCaptain: boolean) => {
    const o = makeBrain('Hale Stone', 'Security Officer');
    o.post = 'Security Office';
    o.pdaPeople = [{ name: 'Joan Marsh', job: 'Head of Security' }, { name: 'Jane Marsh', job: 'Research Director' }];
    know(o, ['Security Office', 'Bar', 'Brig']);
    o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
    A.giveWarrant(o, { name: 'Jane Marsh', reason: 'theft', minutes: 5, byCaptain });
    at(o, 5000, 'Bar', [{ handle: 'p4', name: 'Jane Marsh', job: 'Research Director', place: 'Bar', distance: 1, command: 1 }]);
    A.syncBeat(o);
    const task = o.tasks.find((it: any) => it.kind === 'serve_warrant' && it.item === 'Jane Marsh');
    const plan = A.planBeat(o, task);
    return [plan?.act?.tool ?? (plan?.say ? 'says' : null), A.takeOutcomes(o)];
  };
  add('TRUST-06: a head in view, on a warrant the Captain did not declare: no arrest, and the list is told why', onHead(false), [null, [{ what: 'cannot', name: 'Jane Marsh', why: 'they are a head of staff, and the Captain did not declare it' }]]);
  add('TRUST-06: and that word reads back whole', S.readOutcome(S.outcomeLine('Joan', { what: 'cannot', name: 'Jane Marsh', why: 'they are a head of staff, and the Captain did not declare it' })), { what: 'cannot', name: 'Jane Marsh', why: 'they are a head of staff, and the Captain did not declare it' });
  add('TRUST-06: on the Captain\'s warrant the head is told they are under arrest', onHead(true), ['says', []]);
  // The Head of Security serving one itself carries who declared it.
  const self = head();
  self.pdaPeople = PDA.filter((person: any) => person.job !== 'Security Officer');
  deskTakes(self, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  syncDesk(self);
  add('TRUST-06: serving the Captain\'s warrant itself, the desk notes the Captain declared it', beatOf(self).warrants.map((w: any) => [w.name, w.byCaptain]), [['Dana Reyes', true]]);
}

// ---- the desk says so when it cannot use what it is sent
const { jobFor } = await import(ROOT + 'jobs/index');
const HOS = jobFor('Head of Security');
b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Pun Pun is in the bar', false);
add('a sighting of someone with no warrant on them is answered, with the words that would declare one', said(b), ['PDA to Zim Fire: Captain, there is no warrant on Pun Pun. To declare one, say: Warrant for Pun Pun.']);
// SECT-15: a sighting by first name, or run together, of someone wanted is taken.
for (const [line, name] of [['Dana is in the bar', 'Dana Reyes'], ['Punpun is in the bar', 'Pun Pun'], ['I just saw Dana in the bar', 'Dana Reyes']]) {
  const d = head();
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Pun Pun.', false);
  d.toTell = [];
  deskTakes(d, 'Zim Fire', 'Captain', line, false);
  add(`"${line}" is a sighting of ${name}`, [deskOf(d).warrants.find((w: any) => w.name === name)?.lastSeen?.place, said(d).filter((it: string) => /no warrant/.test(it))], ['Bar', []]);
}
{
  const d = head();
  d.pdaPeople = [...PDA, { name: 'Dana Smith', job: 'Cook' }];
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes, for theft.', false);
  deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Dana Smith, for theft.', false);
  deskTakes(d, 'Zim Fire', 'Captain', 'Dana is in the bar', false);
  add('"Dana is in the bar" with two Danas wanted is taken for neither', deskOf(d).warrants.map((w: any) => w.lastSeen), [null, null]);
}
b = head();
HOS.readsMessage(b, 'Zim Fire', 'How are things over there today', 0, 'Captain');
add('a message from the Captain that code can make nothing of waits for the LLM to read it', [said(b), deskOf(b).unread.map((it: any) => it.text)], [[], ['How are things over there today']]);
// SECT-10: talk is not answered "I did not follow that"; an order that could not be read is.
add('and with no answer from the LLM and no order in it, nothing is sent (SECT-10)', [deskRead(b, deskOf(b).unread[0], null), said(b)], ['No answer to go by, and no order in the words. Nothing is sent to Zim Fire.', []]);
b = head();
HOS.readsMessage(b, 'Zim Fire', 'arest the clown pls', 0, 'Captain');
add('an order with no answer from the LLM is answered with how a warrant is worded', [deskRead(b, deskOf(b).unread[0], null), said(b)], ['Not read. Zim Fire is told it was not followed.', ['PDA to Zim Fire: Captain, I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name. To take one back: Cancel the warrant on a name.']]);
HOS.readsMessage(b, 'Zim Fire', 'lock up the clown now', 0, 'Captain');
add('a second one straight after is not put to the LLM, and is not answered twice in a minute', [b.toTell.length, deskOf(b).unread.length], [1, 0]);
b = head();
HOS.readsMessage(b, 'Zim Fire', 'arest the clown pls', 0, 'Captain');
HOS.readsMessage(b, 'Zim Fire', 'Good work, Joan.', 0, 'Captain');
add('SECT-10: thanks sent while an order waits on the reader is not answered "not followed"', said(b), []);
for (const line of ['Good work, Joan.', 'Where is Pun Pun now?', 'How many are in the cells?', 'Thanks', 'I wanted to say well done']) {
  b = head();
  HOS.readsMessage(b, 'Zim Fire', line, 0, 'Captain');
  add(`SECT-10: "${line}" with no answer from the LLM: nothing sent`, [deskRead(b, deskOf(b).unread[0], null), said(b)], ['No answer to go by, and no order in the words. Nothing is sent to Zim Fire.', []]);
}
b = head();
HOS.readsMessage(b, 'Zim Fire', 'arest the clown pls', 0, 'Captain');
add('SECT-10: the LLM saying "neither", even of a message with an order word: nothing sent', [deskRead(b, deskOf(b).unread[0], S.readReading('{"kind":"neither","name":"","minutes":0}', 'arest the clown pls')), said(b)], ['Read as no order. Nothing is sent to Zim Fire.', []]);
b = head();
HOS.readsMessage(b, 'Zim Fire', 'see to Hale Stone for me', 0, 'Captain');
add('SECT-10: a warrant read on one of security\'s own is still refused in so many words', [deskRead(b, deskOf(b).unread[0], { kind: 'warrant', name: 'Hale Stone', minutes: 0 }), said(b).length], ['Read as: "Warrant for Hale Stone." The body answers Zim Fire in the fixed words.', 1]);
{
  // The officer keeping the list itself does the same.
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.pdaPeople = [{ name: 'Zim Fire', job: 'Captain' }];
  at(o, 3000, 'Security Office');
  jobFor('Security Officer').readsMessage(o, 'Zim Fire', 'Thanks for that', 0, 'Captain');
  add('SECT-10: an officer keeping the list: "Thanks for that" with no answer: nothing sent', [deskRead(o, deskOf(o).unread[0], null), said(o)], ['No answer to go by, and no order in the words. Nothing is sent to Zim Fire.', []]);
}
for (const line of ['Joan, do not arrest Dana Reyes, she is with me.', 'Is there a warrant for Dana Reyes?', 'Did your officer arrest Pun Pun yet?']) {
  b = head();
  add(`SECT-01: "${line}" from the Captain is not taken by code`, deskTakes(b, 'Zim Fire', 'Captain', line, false), false);
  HOS.readsMessage(b, 'Zim Fire', line, 0, 'Captain');
  add('and waits for the LLM reader, with no warrant', [deskOf(b).warrants.length, (deskOf(b).unread ?? []).map((it: any) => it.text)], [0, [line]]);
}
b = head();
HOS.readsMessage(b, 'Dana Reyes', 'How are things over there today', 0, 'Janitor');
add('and not to someone who could not declare one anyway', b.toTell.length, 0);
b = head();
HOS.readsMessage(b, 'Zim Fire', 'I want to put out an APB on Pun Pun', 0, 'Captain');
add('the wording that got no answer in the round is now a warrant', [deskOf(b).warrants.map((w: any) => w.name), said(b)], [['Pun Pun'], ['PDA to Zim Fire: Captain, I have that: a warrant for Pun Pun. 5 minutes. I do not know that name yet.']]);
b.toTell = [];
deskTakes(b, 'Hale Stone', 'Security Officer', 'Joan, I cannot bring in Pun Pun: no baton.', false);
add('an officer that cannot serve a warrant says why, and the Captain is told', said(b), ['PDA to Zim Fire: Captain, Hale cannot bring in Pun Pun: no baton.']);
b = head();
b.meeting = { calledAt: 3000, room: 'Security Office', invited: ['Hale Stone'], copied: true, answers: {}, startedAt: null, turns: [], reports: {}, closedAt: null, orderedBy: null };
HOS.readsMessage(b, 'Hale Stone', 'I cannot come to the meeting: I am after someone on a warrant. I have made 1 arrest. I need nothing.', 0, 'Security Officer');
add('an officer kept from the meeting by a warrant has its report taken by PDA', b.meeting.reports['Hale Stone'], { counts: { arrests: 1 }, need: false });

// ---- everyone else: keeping the list, and saying where
const hop = makeBrain('Walker Wolfe', 'Head of Personnel');
hop.pdaPeople = [...PDA.filter((person) => person.name !== 'Walker Wolfe'), { name: 'Joan Marsh', job: 'Head of Security' }];
add('a head takes the notice', readWanted(hop, 'Joan Marsh', notice[0], 'Head of Security'), true);
add('and has the list', hop.wanted.entries, LIST);
add('and sends word back', said(hop), ['PDA to Joan Marsh: Security notice received.']);
add('a notice from anyone but security is not one', readWanted(makeBrain('Walker Wolfe', 'Head of Personnel'), 'Dana Reyes', notice[0], 'Janitor'), false);
add('it reads the list out at its meeting', wantedMeetingStep(hop, 0)?.say, 'Security is looking for Pun Pun and Dana Reyes. If you see either of them, send security a PDA message saying where.');
add('once', wantedMeetingStep(hop, 1), null);
const jan = makeBrain('Tolly Field', 'Janitor');
jan.pdaPeople = [{ name: 'Walker Wolfe', job: 'Head of Personnel' }, { name: 'Joan Marsh', job: 'Head of Security' }];
wantedOverhears(jan, { seq: 1, time: '', at: 3000, kind: 'speech_heard', text: '', details: { speaker: 'Walker Wolfe', message: S.meetingLines(['Pun Pun'])[0], source: 'person' } } as any);
add('a janitor that hears it has the list', jan.wanted.entries, [{ name: 'Pun Pun' }]);
at(jan, 3100, 'Bar', [{ handle: 'p9', name: 'Pun Pun III', job: '', place: 'Bar', distance: 3 }]);
add('and sends security word when it sees them', said(jan), ['PDA to Joan Marsh: Security: Pun Pun is in the Bar.']);
syncWanted(jan);
add('once, not at every look', jan.toTell.length, 1);
jan.toTell = []; jan.wanted.told = {};
at(jan, 3200, 'Bar', [{ handle: 'p9', name: 'Pun Pun III', job: '', place: 'Bar', distance: 3 }, { handle: 'p8', name: 'Hale Stone', job: 'Security Officer', place: 'Bar', distance: 2 }]);
add('not while security is there to see for itself', jan.toTell.length, 0);

// ---- someone who would not be put out of a room: word goes up to the head, who declares a warrant for trespass
const { wantedAfterActing } = await import(ROOT + 'jobs/wanted');
const tech = makeBrain('Cora Tech', 'Cargo Technician');
tech.post = 'Cargo Bay';
tech.pdaPeople = [{ name: 'Quin Master', job: 'Quartermaster' }, { name: 'Joan Marsh', job: 'Head of Security' }];
at(tech, 4000, 'Cargo Bay', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Cargo Bay', distance: 2, in_post: 1 }]);
wantedAfterActing(tech, { tool: 'throw_out', person: 'p9' }, false, 'You could not get Pun Pun out of Cargo Bay: they got away from you.');
syncWanted(tech);
add('a technician that could not put someone out tells its head, by PDA when the head is not there', said(tech), ['PDA to Quin Master: Quin, I could not put Pun Pun out of the Cargo Bay.']);
const outranked = makeBrain('Cora Tech', 'Cargo Technician');
outranked.post = 'Cargo Bay'; outranked.pdaPeople = tech.pdaPeople;
at(outranked, 4000, 'Cargo Bay', [{ handle: 'p9', name: 'Walker Wolfe', job: 'Head of Personnel', place: 'Cargo Bay', distance: 2 }]);
wantedAfterActing(outranked, { tool: 'throw_out', person: 'p9' }, false, 'Walker Wolfe outranks you. You do not lay a hand on them.');
syncWanted(outranked);
add('someone it had no right to put out is no word for anyone', said(outranked), []);
for (const [why, line, word] of [
  ['a stranger the body never reached', 'You could not get to it.', []],
  ['a walk out that took too long', 'You could not get Pun Pun out of Cargo Bay: it was taking too long.', []],
  ['a stranger it could not get a hold of', 'You cannot get a hold of Pun Pun.', ['PDA to Quin Master: Quin, I could not put Pun Pun out of the Cargo Bay.']],
] as const) {
  const t = makeBrain('Cora Tech', 'Cargo Technician');
  t.post = 'Cargo Bay'; t.pdaPeople = tech.pdaPeople;
  at(t, 4000, 'Cargo Bay', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Cargo Bay', distance: 2, in_post: 1 }]);
  wantedAfterActing(t, { tool: 'throw_out', person: 'p9' }, false, line);
  syncWanted(t);
  add(`${why} is ${word.length ? 'word for the head' : 'no word for anyone'}`, said(t), [...word]);
}
const qm = makeBrain('Quin Master', 'Quartermaster');
qm.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Joan Marsh', job: 'Head of Security' }];
at(qm, 4000, 'Cargo Bay');
add('the head takes that word', readWanted(qm, 'Cora Tech', 'Quin, I could not put Pun Pun out of the Cargo Bay.', 'Cargo Technician'), true);
add('and declares a warrant for trespass, to security, in the words the Captain would use', said(qm), ['PDA to Joan Marsh: Warrant for Pun Pun, for trespass in the Cargo Bay.']);
readWanted(qm, 'Cora Tech', 'Quin, I could not put Pun Pun out of the Cargo Bay.', 'Cargo Technician');
add('once, however often it is told', qm.toTell.length, 1);
b = head();
deskTakes(b, 'Quin Master', 'Quartermaster', qm.toTell[0].line, false);
add('which security reads as it was meant', deskOf(b).warrants.map((w: any) => [w.name, w.reason, w.by]), [['Pun Pun', 'trespass in the Cargo Bay', 'Quin Master']]);

// ---- loose wording and bad spelling, from the round of 15:52 and the owner's ask after it
const CREW = ['Marisol Burris', 'Dana Reyes', 'Walker Wolfe', 'Warren Hale'];
add('the name in the middle: "Lock Pun Pun up for 10 minutes"', S.readWarrant('Lock Pun Pun up for 10 minutes', CREW), { name: 'Pun Pun', reason: '', minutes: 10 });
add('what to do with them is not the reason: the Captain\'s words in the round of 17:06', S.readWarrant('Place a warrant on Marisol Burris, lock him up for 15 minutes', CREW), { name: 'Marisol Burris', reason: '', minutes: 15 });
add('a reason and then what to do with them', S.readWarrant('Warrant for Pun Pun for theft, 10 minutes', CREW), { name: 'Pun Pun', reason: 'theft', minutes: 10 });
// The Captain's three messages in the round of 17:48.
add('"on site" is no part of the name', S.readWarrant('Arrest Pun Pun on site', CREW), { name: 'Pun Pun', reason: '', minutes: null });
add('nor is what follows "and"', S.readWarrant('Arrest Pun Pun on site and keep him in jail for 30 minutes', CREW), { name: 'Pun Pun', reason: '', minutes: 15 });
add('a time with no name is a time', S.readTerm('Keep him in jail for 30 minutes'), { minutes: 15, asked: 30 });
add('talk with no time in it is not', S.readTerm('Keep him out of my office'), null);
// SECT-05: times past fifteen, and in hours, are times, not the reason.
for (const [line, minutes, reason] of [
  ['Warrant for Pun Pun, twenty minutes', 15, ''],
  ['Warrant for Pun Pun for half an hour', 15, ''],
  ['Warrant for Pun Pun, for theft, an hour', 15, 'theft'],
  ['Warrant for Pun Pun, 120 minutes', 15, ''],
  ['Warrant for Pun Pun, for theft, twelve minutes', 12, 'theft'],
  ['Warrant for Pun Pun for a quarter of an hour', 15, ''],
  ['Warrant for Pun Pun, for theft. Ten minutes.', 10, 'theft'],
  ['Warrant for Pun Pun, he broke in an hour ago', null, 'he broke in an hour ago'],
] as [string, number | null, string][]) {
  const read = S.readWarrant(line, []);
  add(`"${line}" is ${minutes} minutes`, [read?.name, read?.minutes, read?.reason], ['Pun Pun', minutes, reason]);
}
add('"Warrant for Dana Reyes twenty minutes", nobody known, is on Dana Reyes', S.readWarrant('Warrant for Dana Reyes twenty minutes', [])?.name, 'Dana Reyes');
add('"twenty minutes" said after the warrant is a time', S.readTerm('Keep him in for twenty minutes'), { minutes: 15, asked: 20 });
add('"twenty-five minutes" is 25', S.readTerm('Keep him in for twenty-five minutes'), { minutes: 15, asked: 25 });
add('"half an hour" is 30', S.readTerm('Keep him in for half an hour'), { minutes: 15, asked: 30 });
// SECT-12: a time is a term only when it is said of the person.
const NO_TERM = ["It's been 10 minutes, where is he?", 'Tell them the meeting is in 5 minutes', 'Give it ten minutes and then search the bar', 'I will be at the bridge in 2 minutes, bring him there'];
const TERMS: [string, number][] = [['Keep him in jail for 10 minutes', 10], ['Hold them for ten minutes', 10], ['Make it 10 minutes', 10], ['Joan, make it 10 minutes.', 10], ['Lock him up for 15 minutes', 15], ['Give him 10 minutes', 10], ['10 minutes for him', 10]];
for (const line of NO_TERM) {
  add(`"${line}" is no term`, S.readTerm(line), null);
}
for (const [line, minutes] of TERMS) {
  add(`"${line}" is ${minutes} minutes`, S.readTerm(line)?.minutes, minutes);
}
{
  const termAfter = (line: string) => {
    const d = head();
    deskTakes(d, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for theft.', false);
    d.toTell = [];
    d.now += 600;
    deskTakes(d, 'Zim Fire', 'Captain', line, false);
    return [deskOf(d).warrants[0].minutes, said(d).filter((it: string) => /I have that/.test(it)).length];
  };
  for (const line of NO_TERM) {
    add(`after a warrant, "${line}" leaves its time`, termAfter(line), [5, 0]);
  }
  for (const [line, minutes] of TERMS) {
    add(`after a warrant, "${line}" sets it to ${minutes}`, termAfter(line), [minutes, 1]);
  }
}
b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Arrest Pun Pun on site', false);
b.toTell = [];
deskTakes(b, 'Zim Fire', 'Captain', 'Keep him in jail for 30 minutes', false);
add('said after the warrant, it goes on that warrant, and the Captain is told what a cell allows', [said(b), deskOf(b).warrants.map((w: any) => [w.name, w.minutes])], [["PDA to Zim Fire: Captain, I have that: Pun Pun, 15 minutes. 15 is the most a cell's timer allows."], [['Pun Pun', 15]]]);
b.toTell = [];
deskTakes(b, 'Zim Fire', 'Captain', 'Arrest Pun Pun and hold him 10 minutes', false);
add('declared again with a time, the time is changed', [said(b), deskOf(b).warrants.map((w: any) => [w.name, w.minutes])], [['PDA to Zim Fire: Captain, I have that: Pun Pun, 10 minutes.'], [['Pun Pun', 10]]]);
add('"throw ... in the brig"', S.readWarrant('throw Dana Reyes in the brig for theft', CREW), { name: 'Dana Reyes', reason: 'theft', minutes: null });
add('"jail", and "mins"', S.readWarrant('jail Pun Pun 5 mins', CREW), { name: 'Pun Pun', reason: '', minutes: 5 });
add('"detain", with words that are no part of the name', S.readWarrant('Detain Pun Pun now please', CREW), { name: 'Pun Pun', reason: '', minutes: null });
add('"warrent"', S.readWarrant('put a warrent on Pun Pun', CREW), { name: 'Pun Pun', reason: '', minutes: null });
add('"arest", and a name a letter out', S.readWarrant('arest marisol buris for theft', CREW), { name: 'Marisol Burris', reason: 'theft', minutes: null });
add('a first name a letter out', S.readWarrant('Warrant for Marisoll', CREW), { name: 'Marisol Burris', reason: '', minutes: null });
add('more said after a misspelt name', S.readWarrant('arrest marisol buris she stole my hat', CREW), { name: 'Marisol Burris', reason: 'she stole my hat', minutes: null });
add('a name that looks like a warrant word is left alone', S.readWarrant('Warrant for Warren Hale', CREW), { name: 'Warren Hale', reason: '', minutes: null });
add('"the arrest went fine" declares nothing', S.readWarrant('the arrest went fine', CREW), null);
add('nor "lock up when you leave"', S.readWarrant('lock up when you leave', CREW), null);
add('a warrant for "punpun" names Pun Pun III', S.sameName('punpun', 'Pun Pun III'), true);
add('and not Pun Punch', S.sameName('punpun', 'Pun Punch'), false);
add('one letter swapped with its neighbour is one letter apart', S.lettersApart('warrnat', 'warrant'), 1);
add('a name near nobody is nobody', S.closeName('Bob', CREW) ?? null, null);
b = head();
b.pdaPeople = [...PDA, { name: 'Marisol Burris', job: 'Cargo Technician' }];
deskTakes(b, 'Zim Fire', 'Captain', 'Lock marisol buris up for 10 minutes', false);
add('the desk takes a loose order, and reads back the name as it is spelt aboard', said(b), ['PDA to Zim Fire: Captain, I have that: a warrant for Marisol Burris. 10 minutes.']);
b.toTell = [];
deskTakes(b, 'Zim Fire', 'Captain', 'pardn marisol buris', false);
add('and a loose pardon', [said(b), deskOf(b).warrants.length], [['PDA to Zim Fire: Captain, Marisol Burris is pardoned.'], 0]);

// ---- the reader of last resort: what the LLM made of an order is checked, then taken as an order in the fixed words
add('the question is small: the message and nothing else', S.buildReading('could you see that pun pun spends ten minutes behind bars').user.length < 600, true);
add('a warrant read', S.readReading('{"kind":"warrant","name":"pun pun","minutes":10}', 'could you see that pun pun spends ten minutes behind bars'), { kind: 'warrant', name: 'pun pun', minutes: 10 });
add('a name the message does not have in it is not taken', S.readReading('{"kind":"warrant","name":"Dana Reyes","minutes":0}', 'could you see that pun pun spends ten minutes behind bars'), null);
add('"neither" is kept as the LLM saying it is no order (SECT-10)', S.readReading('{"kind":"neither","name":"","minutes":0}', 'how are you'), { kind: 'neither', name: '', minutes: 0 });
add('nor is anything that is not JSON', S.readReading('Sure! I think that is a warrant.', 'how are you'), null);
// BRAIN-11: the minutes are read from the message by code, never taken from the LLM.
add('the LLM is not asked for minutes', [/minutes/i.test(S.buildReading('bring pun pun to me').user), 'minutes' in (S.buildReading('bring pun pun to me').schema as any).properties], [false, false]);
add('a message with no time: the LLM\'s minutes are not taken', S.readReading('{"kind":"warrant","name":"Pun Pun","minutes":10}', 'Bring that clown Pun Pun to me when you get a chance, he took my hat'), { kind: 'warrant', name: 'Pun Pun', minutes: 0 });
add('a message with a time in digits: that time, whatever the LLM says', S.readReading('{"kind":"warrant","name":"pun pun","minutes":3}', 'see that pun pun gets 7 minutes behind bars'), { kind: 'warrant', name: 'pun pun', minutes: 7 });
add('a time in words, the LLM giving none', S.readReading('{"kind":"warrant","name":"pun pun"}', 'could you see that pun pun spends twelve minutes behind bars'), { kind: 'warrant', name: 'pun pun', minutes: 12 });
add('an hour said: capped at the most a cell allows', S.readReading('{"kind":"warrant","name":"pun pun","minutes":60}', 'pun pun should sit in a cell for an hour'), { kind: 'warrant', name: 'pun pun', minutes: S.MINUTES_MOST });
add('"an hour ago" is no time held', S.readReading('{"kind":"warrant","name":"pun pun","minutes":5}', 'pun pun took my hat an hour ago, sort him out'), { kind: 'warrant', name: 'pun pun', minutes: 0 });
add('a pardon keeps no minutes the LLM made up', S.readReading('{"kind":"pardon","name":"pun pun","minutes":9}', 'pun pun has done enough, let him off'), { kind: 'pardon', name: 'pun pun', minutes: 0 });
add('as an order', S.readingAsOrder({ kind: 'warrant', name: 'pun pun', minutes: 10 }), 'Warrant for pun pun, 10 minutes.');
b = head();
HOS.readsMessage(b, 'Zim Fire', 'could you see that pun pun spends ten minutes behind bars', 0, 'Captain');
add('the desk hands the reading to the same code as any order, and reads it back', [deskRead(b, deskOf(b).unread[0], { kind: 'warrant', name: 'pun pun', minutes: 10 }), said(b), deskOf(b).warrants.map((w: any) => [w.name, w.minutes])], ['Read as: "Warrant for pun pun, 10 minutes." The body answers Zim Fire in the fixed words.', ['PDA to Zim Fire: Captain, I have that: a warrant for pun pun. 10 minutes. I do not know that name yet.'], [['pun pun', 10]]]);
b = head();
HOS.readsMessage(b, 'Dana Reyes', 'could you see that pun pun spends ten minutes behind bars', 0, 'Janitor');
add('a janitor\'s message is not put to the LLM', (deskOf(b).unread ?? []).length, 0);

// ---- in cuffs: the officer says so, and the list shows it
add('"in cuffs" reads back', S.readOutcome(S.outcomeLine('Joan', { what: 'cuffed', name: 'Marisol Burris' })), { what: 'cuffed', name: 'Marisol Burris' });
b = head();
deskTakes(b, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes', false);
b.toTell = [];
deskOutcome(b, { what: 'cuffed', name: 'Dana Reyes' }, 'Hale Stone', false);
add('the Captain is told, and the list reads "in cuffs", not "last seen"', [said(b), stillWanted(b)], [['PDA to Zim Fire: Captain, Hale has Dana Reyes in cuffs.'], 'Still wanted: Dana Reyes, in cuffs and on the way to a cell.']);

// ---- attacked by someone it cannot stop: the round of 17:06, where a monkey with a club beat the officer down as it walked off
const { syncBeat, planBeat, securityFeels, takeOutcomes } = await import(ROOT + 'jobs/arrests');
const hit = makeBrain('Hale Stone', 'Security Officer');
hit.post = 'Security Office'; hit.pdaPeople = PDA;
know(hit, ['Security Office', 'Bar', 'Brig']);
hit.security = { has_baton: 0, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
at(hit, 5000, 'Bar', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 1 }]);
securityFeels(hit, { details: { struck_name: 'Pun Pun', struck_by: 'p9' } });
syncBeat(hit);
const away = hit.tasks.find((task: any) => task.kind === 'get_away' && task.state !== 'done');
add('hit, with no baton: getting away comes before everything', away?.urgency, 'emergency');
add('and it goes for a baton', planBeat(hit, away)?.act, { tool: 'get_kit' });
add('whoever keeps the list is told of the attack, once', [takeOutcomes(hit), (syncBeat(hit), takeOutcomes(hit))], [[{ what: 'attacked', name: 'Pun Pun' }], []]);
beatOf(hit).kitTries = 3;
add('with the lockers no use, it goes back to its post', planBeat(hit, away)?.act, { tool: 'go_to', place: 'Security Office' });
hit.security.has_baton = 1;
syncBeat(hit);
add('with a baton it does not run: it stops them', [hit.tasks.some((task: any) => task.kind === 'get_away' && task.state !== 'done'), hit.tasks.some((task: any) => task.kind === 'stop_attacker' && task.state !== 'done')], [false, true]);
// ARR-02: the server no longer tells of a hold by a keeper walking the body out, or by whoever
// arrested it. A grab it does tell of (a player's pull) is still an attack.
{
  const pulled = makeBrain('Hale Stone', 'Security Officer');
  pulled.post = 'Security Office'; pulled.pdaPeople = PDA;
  know(pulled, ['Security Office', 'Bar', 'Brig']);
  pulled.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(pulled, 5000, 'Bar', [{ handle: 'p8', name: 'Rex Hand', job: 'Assistant', place: 'Bar', distance: 1 }]);
  securityFeels(pulled, { details: { struck_name: 'Rex Hand', struck_by: 'p8', how: 'grab' } });
  syncBeat(pulled);
  add('ARR-02: a grab the server tells of is still an attack: it stops them', [beatOf(pulled).attacker?.name, pulled.tasks.some((task: any) => task.kind === 'stop_attacker' && task.state !== 'done')], ['Rex Hand', true]);
}

// ---- SEC-01: knocked down itself is no try at them, and no getting away
{
  const A = await import(ROOT + 'jobs/arrests');
  const fallen = () => {
    const o = makeBrain('Hale Stone', 'Security Officer');
    o.post = 'Security Office'; o.pdaPeople = PDA;
    know(o, ['Security Office', 'Bar', 'Brig']);
    o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
    A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
    at(o, 5000, 'Bar', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 1 }]);
    A.syncBeat(o);
    const task = o.tasks.find((it: any) => it.kind === 'serve_warrant');
    const warrant = beatOf(o).warrants[0];
    warrant.toldAt = 4990;
    return { o, task, warrant };
  };
  let f = fallen();
  A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'down' });
  add('SEC-01: an arrest cut short by its own fall is no try, and does not bring the baton out', [f.warrant.tries, f.warrant.force, f.warrant.toldAt, A.takeOutcomes(f.o)], [0, false, 4990, []]);
  f = fallen();
  A.beatAfterActing(f.o, { tool: 'arrest', person: 'p9', how: 'quiet' }, f.task, false, { reason: 'moved' });
  add('SEC-01: one they walked off from still is a try', [f.warrant.tries, f.warrant.force], [1, true]);
  f = fallen();
  A.beatAfterActing(f.o, { tool: 'jail', minutes: 5, attempt: 1 }, f.task, false, { reason: 'down', prisoner: 'Pun Pun', cell: 'Cell 1' });
  add('SEC-01: knocked down on the way into a cell: not lost, not the cell refusing, the same try again', [A.takeOutcomes(f.o), f.warrant.toldAt, f.warrant.cellTries ?? 0, f.warrant.cellAttempts ?? 0, f.warrant.lastSeen], [[], 4990, 0, 0, { place: 'Bar', at: 5000 }]);
  f = fallen();
  A.beatAfterActing(f.o, { tool: 'jail', minutes: 5, attempt: 1 }, f.task, false, { reason: 'got_away', prisoner: 'Pun Pun' });
  add('SEC-01: one who got away on the walk is still lost', A.takeOutcomes(f.o).map((it: any) => it.what), ['lost']);
}

// ---- asking to be let in
add('the ask names the door, the room and who the warrant is on', S.letInLine('Quin', 'Cargo Lobby ', 'Cargo Bay', 'Marisol Burris'), 'Quin, I am at the Cargo Lobby door of the Cargo Bay with a warrant for Marisol Burris. Could you let me in, please?');
add('and is known for what it is', S.LET_IN_WORDS.test(S.letInLine('Captain', '', 'Kitchen', 'Pun Pun')), true);

// ---- a door nobody will open: up to the Head of Security, across to the Chief Engineer, down to an engineer, and back
const F = await import(ROOT + 'jobs/forcing');
const { giveWarrant, doorOpened } = await import(ROOT + 'jobs/arrests');
const CREW_PDA = [...PDA, { name: 'Derek Albright', job: 'Station Engineer' }];
const sentBy = (brain: any) => { const lines = said(brain); brain.toTell = []; return lines; };
const hos = head(); hos.pdaPeople = CREW_PDA;
deskTakes(hos, 'Zim Fire', 'Captain', 'Warrant for Dana Reyes', false);
hos.toTell = [];
deskOutcome(hos, { what: 'cannot', name: 'Dana Reyes', why: 'nobody has opened the Cargo Bay for security' }, 'Hale Stone', false);
add('nobody opened the door: the Captain is told, engineering is asked, and the Captain gets a copy', sentBy(hos), [
  'PDA to Zim Fire: Captain, Hale cannot bring in Dana Reyes: nobody has opened the Cargo Bay for security.',
  'PDA to Ada Voss: Ada, security needs the door of the Cargo Bay opened: Dana Reyes is inside on a warrant. Could you send an engineer, please?',
  'PDA to Zim Fire: Captain, I have asked engineering to open the Cargo Bay: Dana Reyes is inside on a warrant.',
]);
deskOutcome(hos, { what: 'cannot', name: 'Dana Reyes', why: 'nobody has opened the Cargo Bay for security' }, 'Hale Stone', false);
add('engineering is not asked twice for one room', sentBy(hos).filter((line: string) => line.includes('security needs')).length, 0);
deskOutcome(hos, { what: 'cannot', name: 'Dana Reyes', why: 'no baton' }, 'Hale Stone', false);
add('nor for any other reason a warrant cannot be served', sentBy(hos).filter((line: string) => line.includes('security needs')).length, 0);
// Three tries at someone in sight that came to nothing: said as it is, and not as losing them.
{
  const why = 'they will not stand still for the baton or the cuffs';
  const line = S.outcomeLine('Joan', { what: 'cannot', name: 'Pun Pun', why });
  add('"will not stand still" reads back whole', S.readOutcome(line), { what: 'cannot', name: 'Pun Pun', why });
  deskOutcome(hos, { what: 'cannot', name: 'Pun Pun', why }, 'Hale Stone', false);
  add('and the Captain is told that, with no word of losing them', sentBy(hos), ['PDA to Zim Fire: Captain, Hale cannot bring in Pun Pun: they will not stand still for the baton or the cuffs.']);
}
const chief = makeBrain('Ada Voss', 'Chief Engineer'); chief.pdaPeople = [...CREW_PDA, { name: 'Joan Marsh', job: 'Head of Security' }];
at(chief, 6000, 'Engineering');
add('the Chief Engineer takes the ask', F.forcingReads(chief, 'Joan Marsh', 'Head of Security', F.forceAskLine('Ada', 'Cargo Bay', 'Dana Reyes')), true);
add('gives it to its engineer, and tells security who is coming', sentBy(chief), [
  'PDA to Derek Albright: Derek, security needs the door of the Cargo Bay opened. Go and open it, please.',
  'PDA to Joan Marsh: Joan, I am sending Derek to open the Cargo Bay.',
]);
const eng = makeBrain('Derek Albright', 'Station Engineer'); eng.pdaPeople = [...PDA, { name: 'Joan Marsh', job: 'Head of Security' }];
at(eng, 6000, 'Engineering');
add('the engineer takes the order', F.forcingReads(eng, 'Ada Voss', 'Chief Engineer', F.forceOrderLine('Derek', 'Cargo Bay')), true);
F.syncForcing(eng);
const forceTask = eng.tasks.find((task: any) => task.kind === 'force_door');
add('and goes to force the door', F.planForcing(eng, forceTask)?.act, { tool: 'force_door', place: 'Cargo Bay', attempt: 1 });
add('a janitor saying the same words sends it nowhere', F.forcingReads(makeBrain('Derek Albright', 'Station Engineer'), 'Dana Reyes', 'Janitor', F.forceOrderLine('Derek', 'Bar')), false);
F.forcingAfterActing(eng, { tool: 'force_door', place: 'Cargo Bay', attempt: 1 }, true, {});
add('the door open, it tells whoever sent it', sentBy(eng), ['PDA to Ada Voss: Ada, the door of the Cargo Bay is open.']);
add('which the Chief Engineer passes to security', [F.forcingReads(chief, 'Derek Albright', 'Station Engineer', 'Ada, the door of the Cargo Bay is open.'), sentBy(chief)], [true, ['PDA to Joan Marsh: Joan, the door of the Cargo Bay is open.']]);
add('and the Head of Security passes to its officer', [F.forcingReads(hos, 'Ada Voss', 'Chief Engineer', 'Joan, the door of the Cargo Bay is open.'), sentBy(hos)], [true, ['PDA to Hale Stone: Hale, engineering has opened the Cargo Bay.']]);
const off2 = makeBrain('Hale Stone', 'Security Officer'); off2.pdaPeople = [...PDA, { name: 'Joan Marsh', job: 'Head of Security' }];
know(off2, ['Security Office', 'Cargo Bay']);
at(off2, 6000, 'Cargo Lobby');
giveWarrant(off2, { name: 'Dana Reyes', reason: '', minutes: 5 });
beatOf(off2).warrants[0].lastSeen = { place: 'Cargo Bay', at: 5000 };
beatOf(off2).warrants[0].shutOut = { place: 'Cargo Bay', at: 5500, keepers: [], asked: ['Zim Fire'], askedAt: 5500, gaveUp: true };
add('the officer takes that word', F.forcingReads(off2, 'Joan Marsh', 'Head of Security', F.forceOpenedLine('Hale', 'Cargo Bay')), true);
add('and is shut out of that room no longer', [beatOf(off2).warrants[0].shutOut ?? null, beatOf(off2).warrants[0].opened?.place], [null, 'Cargo Bay']);
// A door that will not be forced.
F.forcingReads(eng, 'Ada Voss', 'Chief Engineer', F.forceOrderLine('Derek', 'Bridge'));
F.forcingAfterActing(eng, { tool: 'force_door', place: 'Bridge', attempt: 1 }, false, { reason: 'bolted' });
add('a bolted door is not gone at twice, and the engineer says why', sentBy(eng), ['PDA to Ada Voss: Ada, I could not open the door of the Bridge: it is bolted.']);
F.forcingReads(hos, 'Ada Voss', 'Chief Engineer', 'Joan, I could not open the door of the Bridge: it is bolted.');
add('and the Captain is told', sentBy(hos), ['PDA to Zim Fire: Captain, engineering could not open the Bridge: it is bolted.']);
// Round 20.00.21: the engineer had no way to the door, and what came of it.
add('word of who is coming is taken by security, and not answered as an order it could not read', [F.forcingReads(hos, 'Ada Voss', 'Chief Engineer', F.forceSentLine('Joan', 'Derek Albright', 'Bar Backroom')), sentBy(hos)], [true, []]);
add('and those words from anyone else are nothing to it', F.forcingReads(hos, 'Dana Reyes', 'Janitor', F.forceSentLine('Joan', 'Derek Albright', 'Bar Backroom')), false);
F.forcingReads(eng, 'Ada Voss', 'Chief Engineer', F.forceOrderLine('Derek', 'Bar Backroom'));
F.forcingAfterActing(eng, { tool: 'force_door', place: 'Bar Backroom', attempt: 1 }, false, { reason: 'no_way', through: 'Service Hallway' });
add('a door it has no way to is tried once more', sentBy(eng), []);
F.forcingAfterActing(eng, { tool: 'force_door', place: 'Bar Backroom', attempt: 2 }, false, { reason: 'no_way', through: 'Service Hallway' });
add('and then it says which room is in the way, with no "I" in it', sentBy(eng), ['PDA to Ada Voss: Ada, I could not open the door of the Bar Backroom: the way to it is through the Service Hallway, which is locked to engineering as well.']);
F.forcingReads(hos, 'Ada Voss', 'Chief Engineer', 'Joan, I could not open the door of the Bar Backroom: the way to it is through the Service Hallway, which is locked to engineering as well.');
add('which reads rightly when the Captain is told', sentBy(hos), ['PDA to Zim Fire: Captain, engineering could not open the Bar Backroom: the way to it is through the Service Hallway, which is locked to engineering as well.']);
add('no reason for a door not opening says "I"', ['bolted', 'welded', 'no_tools', 'no_knowledge', 'no_way', 'no_door', 'other'].filter((reason) => /\bI\b/.test(F.whyNot(reason))), []);
// With no Chief Engineer aboard, security asks an engineer itself.
const lone = head(); lone.pdaPeople = [...PDA.filter((person) => person.job !== 'Chief Engineer'), { name: 'Derek Albright', job: 'Station Engineer' }];
F.askEngineering(lone, 'Kitchen', 'Pun Pun');
add('with no Chief Engineer, security asks an engineer itself', sentBy(lone)[0], 'PDA to Derek Albright: Derek, security needs the door of the Kitchen opened: Pun Pun is inside on a warrant. Could you send an engineer, please?');
const solo = makeBrain('Derek Albright', 'Station Engineer'); solo.pdaPeople = [{ name: 'Joan Marsh', job: 'Head of Security' }];
F.forcingReads(solo, 'Joan Marsh', 'Head of Security', F.forceAskLine('Derek', 'Kitchen', 'Pun Pun'));
F.syncForcing(solo);
add('and the engineer goes itself', solo.tasks.some((task: any) => task.kind === 'force_door' && task.item === 'Kitchen'), true);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
