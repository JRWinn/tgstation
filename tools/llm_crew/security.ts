// The words of a warrant, case by case. No model is called: a warrant is read in code, the notice
// to the heads and what a head reads out at its meeting are written and read back in code
// (CrewBrain/jobs/security.ts), and who may declare, pardon or take back a warrant is decided in
// code (jobs/desk.ts). So all of it can be checked in a second.
//
//   bun run security.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const S = await import(ROOT + 'jobs/security');
const { deskTakes, deskOf, syncDesk } = await import(ROOT + 'jobs/desk');
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
add('a warrant given reads back', S.readGiven(S.giveLine('Hale Stone', 'Pun Pun', 'trespass in the Cargo Bay', 5)), { name: 'Pun Pun', reason: 'trespass in the Cargo Bay', minutes: 5 });
add('with no reason', S.readGiven(S.giveLine('Hale Stone', 'Pun Pun', '', 15)), { name: 'Pun Pun', reason: '', minutes: 15 });
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
b = head();
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Warrant for Pun Pun, for trespass in the Bar.', false);
b.toTell = [];
deskTakes(b, 'Walker Wolfe', 'Head of Personnel', 'Cancel the warrant on Pun Pun.', false);
add('a head takes back its own', [deskOf(b).warrants.length, said(b)], [0, ['PDA to Walker Wolfe: Walker, the warrant on Pun Pun is withdrawn.']]);
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

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
