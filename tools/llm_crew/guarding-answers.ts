// What a keeper of a locked post does with what a stranger answers, and what security answers
// itself: an officer on a warrant says so and is left to serve it (PLAY-14, ARR-02); a stranger who
// says the Captain or a head sent them waits for that one's yes (SECT-08 B); one told to leave is
// given a moment to go before being taken by the arm (MULTI-08 B). No model is called
// (CrewBrain/jobs/guarding.ts).
//
//   bun run guarding-answers.ts
const { ROOT, at, makeBrain, tech, zim } = await import('./fixtures');
const { guardAfterSaying, guardOverhears, guardReadsMessage, planGuarding, syncGuarding } = await import(ROOT + 'jobs/guarding');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const hears = (b: any, speaker: string, message: string, said_to = 'me') =>
  guardOverhears(b, { seq: 1, time: '', at: b.now, kind: 'speech_heard', text: '', details: { speaker, message, said_to } } as any);
const strangerTask = (name: string) => ({ id: 77, kind: 'stranger', item: name, state: 'open' }) as any;

// ---- the officer's own answer
const KALEB = { handle: 'p5', name: 'Kaleb Schofield', job: 'Security Officer', in_post: true, belongs: false };
const officerAnswer = (warrants: any[]) => {
  const b: any = makeBrain(KALEB.name, KALEB.job);
  b.reachedThrough = { "Quartermaster's Office": 'Cargo Bay' };
  b.beat = { warrants, kitTries: 0, kitAt: 0, hurt: false, attacker: null, jailed: {}, toFree: [], outcomes: [], words: [], round: { next: 0, at: 0 } };
  at(b, 3000, 'Cargo Bay', [{ handle: 'p2', name: 'Armando Reichard', job: 'Cargo Technician', in_post: true, belongs: true }]);
  b.outOfBounds = true;
  hears(b, 'Armando Reichard', 'Kaleb, why are you in here? This room is locked to the crew.');
  return planGuarding(b, { id: 99, kind: 'explain', item: 'Armando Reichard', state: 'open' } as any)?.say ?? null;
};
const warrant = (place: string) => ({ name: 'Nehemiah Knapp', reason: '', minutes: 5, lastSeen: { place, at: 2900 }, lookedAt: null, toldAt: null, tries: 0, force: false, resisted: false, restUntil: 0 });
add('PLAY-14: an officer whose wanted man is in a room through this one: "I am here on a warrant."', officerAnswer([warrant("Quartermaster's Office")]), 'I am here on a warrant.');
add('PLAY-14: wanted in this room: the same', officerAnswer([warrant('Cargo Bay')]), 'I am here on a warrant.');
add('PLAY-14: a warrant on someone elsewhere: owns up as before', officerAnswer([warrant('Bar')]), 'Nobody sent for me. I should not be in here, I know.');
add('PLAY-14: no warrant: owns up as before', officerAnswer([]), 'Nobody sent for me. I should not be in here, I know.');

// ---- the keeper hearing it
const keeperWith = (person: any) => {
  const b = tech();
  b.post = 'Cargo Bay';
  b.hasPda = true;
  b.pdaPeople = [{ name: 'Cap Tain', job: 'Captain' }, { name: 'Hop Kins', job: 'Head of Personnel' }];
  at(b, 3000, 'Cargo Bay', [zim, person]);
  b.strangers[person.name] = { seenAt: 2900, lastSeenAt: 3000, asks: 1, verifyAsks: 0, askedAt: 2950 };
  return b;
};
{
  const b = keeperWith(KALEB);
  hears(b, KALEB.name, 'I am here on a warrant.');
  add('ARR-02: the keeper takes an officer on a warrant as let in on one: it stays', b.strangers[KALEB.name]?.verdict, 'stay');
  at(b, 3010, 'Cargo Bay', [{ ...zim, superior: true }, KALEB]);
  hears(b, zim.name, 'Donna, get Kaleb out of here.');
  syncGuarding(b);
  add('ARR-02: and is not walked out, though a superior says so', b.strangers[KALEB.name]?.verdict, 'stay');
}
{
  const b = keeperWith(KALEB);
  hears(b, KALEB.name, 'Nobody sent for me. I should not be in here, I know.');
  add('an officer who owns up, with no warrant said, is put out as anyone is', b.strangers[KALEB.name]?.verdict, 'go');
}

// ---- SECT-08 B: "the Captain sent me"
const IVY = { handle: 'p8', name: 'Ivy Lane', job: 'Assistant', in_post: true, belongs: false };
{
  const b = keeperWith(IVY);
  hears(b, IVY.name, 'The Captain sent me.');
  add('SECT-08: "The Captain sent me." is no verdict yet', b.strangers[IVY.name]?.verdict ?? null, null);
  const plan: any = planGuarding(b, strangerTask(IVY.name));
  add('SECT-08: the Captain out of sight: asked by PDA, in the set words', b.toTell.map((t: any) => [t.to, t.line, !!t.byPda]), [['Cap Tain', 'Did you send Ivy Lane to the Cargo Bay?', true]]);
  add('SECT-08: and it waits', [plan?.ready, plan?.wait], [false, true]);
  guardReadsMessage(b, 'Cap Tain', 'Yes, I sent Ivy Lane.');
  add('SECT-08: a yes by PDA: they stay', b.strangers[IVY.name]?.verdict, 'stay');
}
{
  const b = keeperWith(IVY);
  hears(b, IVY.name, 'The HoP asked me to come in.');
  planGuarding(b, strangerTask(IVY.name));
  guardReadsMessage(b, 'Hop Kins', 'No, I did not send Ivy Lane.');
  add('SECT-08: "the HoP" by title, and a no: they go', [b.toTell[0]?.to, b.strangers[IVY.name]?.verdict], ['Hop Kins', 'go']);
}
{
  const b = keeperWith(IVY);
  hears(b, IVY.name, 'The Captain sent me.');
  planGuarding(b, strangerTask(IVY.name));
  at(b, 3000 + 1100, 'Cargo Bay', [zim, IVY]);
  add('SECT-08: under two minutes with no answer: still waiting', b.strangers[IVY.name]?.verdict ?? null, null);
  at(b, 3000 + 1300, 'Cargo Bay', [zim, IVY]);
  add('SECT-08: two minutes with no answer: they go', b.strangers[IVY.name]?.verdict, 'go');
}
{
  const CAP = { handle: 'p9', name: 'Cap Tain', job: 'Captain', command: 1 };
  const b = keeperWith(IVY);
  at(b, 3000, 'Cargo Bay', [zim, IVY, CAP]);
  hears(b, IVY.name, 'The Captain sent me.');
  const plan: any = planGuarding(b, strangerTask(IVY.name));
  add('SECT-08: the Captain in sight: asked face to face', plan?.say, 'Captain, did you send Ivy Lane to the Cargo Bay?');
  guardAfterSaying(b, plan?.say);
  hears(b, CAP.name, 'Yes, I did.', 'other');
  add('SECT-08: and a yes aloud: they stay', b.strangers[IVY.name]?.verdict, 'stay');
}

// ---- MULTI-08 B: told to leave, a moment to go
{
  const b = keeperWith(IVY);
  b.strangers[IVY.name].verdict = 'go';
  const first: any = planGuarding(b, strangerTask(IVY.name));
  guardAfterSaying(b, first?.say);
  const wait: any = planGuarding(b, strangerTask(IVY.name));
  add('MULTI-08: told to leave: not taken by the arm at once', [wait?.ready, wait?.act ?? null], [false, null]);
  b.now += 110;
  add('MULTI-08: still there ten seconds on: taken by the arm', planGuarding(b, strangerTask(IVY.name))?.act?.tool, 'throw_out');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
