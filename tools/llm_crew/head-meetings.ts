// Heads, their staff and their meetings, case by case: who a staff member asks for what it needs,
// and which PDA messages are a call to a meeting. No model is called.
//
//   bun run head-meetings.ts
const { ROOT, makeBrain, know } = await import('./fixtures');
const { meetingsOverhear, needStep, readSummons } = await import(ROOT + 'jobs/meetings');
const { workWords } = await import(ROOT + 'jobs/reports');
const { HEAD_OF_PERSONNEL, hearReport, meetingSaid } = await import(ROOT + 'jobs/head');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// TRA-06: a janitor short of something asks its own head, not the Captain in view.
const CAPTAIN = { handle: 'c1', name: 'Cap Tain', job: 'Captain', superior: true };
const HOP = { handle: 'h1', name: 'Hop Kins', job: 'Head of Personnel', superior: true };
const janitor = (inView: any[], onPda: any[]) => {
  const jan: any = makeBrain('Jan Itor', 'Janitor');
  jan.peopleInView = inView;
  jan.pdaPeople = onPda.map((person) => ({ name: person.name, job: person.job }));
  jan.hasPda = true;
  return jan;
};
let step = needStep(janitor([CAPTAIN], [CAPTAIN, HOP]), 'something to clean with');
add('the Captain in view, its head elsewhere: it sends its head a PDA', [step.say ?? null, step.act?.tool, step.act?.person], [null, 'message', 'Hop Kins']);
step = needStep(janitor([CAPTAIN, HOP], [CAPTAIN, HOP]), 'something to clean with');
add('the Captain and its head in view, the Captain first: it asks its head to their face', [step.say?.startsWith('Hop,'), step.act ?? null], [true, null]);
step = needStep(janitor([CAPTAIN], [CAPTAIN]), 'something to clean with');
add('no head of its own aboard: it asks the Captain', step.say?.startsWith('Cap,'), true);

// TRC-03: which PDA messages from someone it answers to are a call to a meeting, or say one is over.
for (const [line, want] of [
  ['Staff meeting in the Bar Lounge now, please. Send word that you are coming, and bring your report.', true],
  ['Jan, the staff meeting is over. Send me your report by PDA, please.', true],
  ['Did you get to the meeting in the Bar Lounge?', false],
  ['Good work at the meeting in the Bar Lounge.', false],
  ['Tell me when the meeting is over.', false],
] as [string, boolean][]) {
  const jan: any = makeBrain('Jan Itor', 'Janitor');
  know(jan, ['Bar Lounge']);
  const took = readSummons(jan, 'Zim Fire', line, 100, 'Captain');
  add(`from the Captain, "${line}" is ${want ? '' : 'not '}taken for a meeting`, [took, !!jan.summons], [want, want]);
}
{
  // Called by its head, then told by them the meeting is over in other words: that is still taken.
  const jan: any = makeBrain('Jan Itor', 'Janitor');
  know(jan, ['Bar Lounge']);
  readSummons(jan, 'Hop Kins', 'Staff meeting in the Bar Lounge now, please.', 100, 'Head of Personnel');
  add('a "meeting is over" from whoever called it is taken', [readSummons(jan, 'Hop Kins', 'The meeting is over, thank you.', 200, 'Head of Personnel'), jan.summons?.missed], [true, true]);
}

// TRA-01: one crate of janitorial supplies is good for two janitors.
for (const [short, crates] of [[1, 1], [2, 1], [3, 2], [8, 4]] as [number, number][]) {
  const hop: any = makeBrain('Hop Kins', 'Head of Personnel');
  hop.metOnce = true;
  hop.nextMeetingAt = 1e9;
  hop.pdaPeople = Array.from({ length: short }, (_, n) => ({ name: `Jan Itor${n}`, job: 'Janitor' }));
  hop.asks = hop.pdaPeople.map((person: any) => ({ who: person.name, what: 'something to clean with', at: 0, ordered: false, told: false }));
  hop.now = 5000;
  HEAD_OF_PERSONNEL.syncTasks(hop);
  add(`${short} janitor(s) short: ${crates} crate(s) ordered`, hop.requisition?.lines?.[0]?.count, crates);
}

// HEAD-03: two of its staff share a first name.
{
  const ALEX_R = { handle: 'a1', name: 'Alex Reed', job: 'Janitor', distance: 1, place: 'Bar Lounge' };
  const ALEX_M = { handle: 'a2', name: 'Alex Moor', job: 'Janitor', distance: 1, place: 'Bar Lounge' };
  const BEA = { handle: 'b1', name: 'Bea Hart', job: 'Janitor', distance: 1, place: 'Bar Lounge' };
  const hop: any = makeBrain('Hop Kins', 'Head of Personnel');
  hop.peopleInView = [ALEX_R, ALEX_M, BEA];
  hop.pdaPeople = [ALEX_R, ALEX_M, BEA].map((person) => ({ name: person.name, job: person.job }));
  hop.location = 'Bar Lounge';
  hop.meeting = { calledAt: 0, room: 'Bar Lounge', calledIn: true, invited: [ALEX_R.name, ALEX_M.name, BEA.name], copied: true, answers: {}, startedAt: 10, turns: [], reports: {}, closedAt: null, orderedBy: null, wentIn: true };
  meetingSaid(hop, 'Thank you for coming, everyone. Alex Reed, your report, please.');
  add('called on by full name, the turn is the right one', hop.meeting.turns.map((turn: any) => turn.who), ['Alex Reed']);
  const report = `Hop, ${workWords({ cleaned: 2 }, 0)}. I need nothing.`;
  hearReport(hop, 'Alex Reed', report);
  hearReport(hop, 'Alex Moor', report);
  add('the other Alex, who answered the same call, has had a turn too', hop.meeting.turns.map((turn: any) => [turn.who, turn.heard]), [['Alex Reed', true], ['Alex Moor', true]]);
  // The staff side: a call on the other Alex by full name is not its own.
  for (const [line, want] of [
    ['Alex Moor, your report, please.', false],
    ['Alex Reed, your report, please.', true],
    ['Alex, your report, please.', true],
  ] as [string, boolean][]) {
    const alex: any = makeBrain('Alex Reed', 'Janitor');
    alex.peopleInView = [{ ...HOP, distance: 1 }];
    alex.pdaPeople = [{ name: HOP.name, job: HOP.job }];
    alex.now = 100;
    meetingsOverhear(alex, { details: { message: line, speaker: HOP.name } } as any);
    add(`Alex Reed hears "${line}": ${want ? 'it is called on' : 'not its call'}`, !!alex.summons?.askedAt, want);
  }
}

// HEAD-06: a head that cannot get to its meeting.
{
  const hopWith = () => {
    const hop: any = makeBrain('Hop Kins', 'Head of Personnel');
    know(hop, ['Bar Lounge', 'Bridge']);
    hop.pdaPeople = [{ name: 'Jan Itor', job: 'Janitor' }, { name: 'Cap Tain', job: 'Captain' }];
    hop.location = 'Bridge';
    hop.now = 5000;
    hop.nextMeetingAt = 4000;
    hop.metOnce = true;
    return hop;
  };
  let hop = hopWith();
  hop.shutIn = true;
  HEAD_OF_PERSONNEL.syncTasks(hop);
  add('shut in when a meeting falls due, it calls none', hop.meeting, null);
  hop.shutIn = false;
  HEAD_OF_PERSONNEL.syncTasks(hop);
  add('let out, it calls it', !!hop.meeting, true);
  hop = hopWith();
  HEAD_OF_PERSONNEL.syncTasks(hop);
  const room = hop.meeting?.room;
  hop.meeting.invited = ['Jan Itor'];
  hop.meeting.copied = true;
  hop.toTell = [];
  hop.now += 1801;
  HEAD_OF_PERSONNEL.syncTasks(hop);
  add('never got there in three minutes: the meeting is ended, and its staff told by PDA', [hop.meeting, hop.toTell.filter((tell: any) => tell.to === 'Jan Itor' && /meeting is over/.test(tell.line)).length], [null, 1]);
  add('and the Captain is told it could not get there', hop.toTell.filter((tell: any) => tell.to === 'Cap Tain').map((tell: any) => tell.line.split(';')[0]), [`I could not get to the ${room} for the staff meeting`]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
