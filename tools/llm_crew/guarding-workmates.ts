// Who in a post is taken for a stranger, and what one answers when asked why it is in a room,
// case by case (MULTI-03). No model is called: both are decided in code (CrewBrain/jobs/guarding.ts).
//
//   bun run guarding-workmates.ts
const { ROOT, at, tech, zim } = await import('./fixtures');
const { planGuarding, guardOverhears } = await import(ROOT + 'jobs/guarding');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const hears = (b: any, speaker: string, message: string, said_to = 'me') =>
  guardOverhears(b, { seq: 1, time: '', at: b.now, kind: 'speech_heard', text: '', details: { speaker, message, said_to } } as any);

const sam = { handle: 'p6', name: 'Sam Lowe', job: 'Cargo Technician' };
const stranger = { handle: 'p7', name: 'Ann Other', job: 'Assistant', in_post: true, belongs: false };

// ---- a workmate seen to belong, whose card then stops opening the door, is no stranger
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, { ...sam, in_post: true, belongs: true }]);
  at(b, 3100, 'Cargo Bay', [zim, { ...sam, in_post: true, belongs: false }]);
  add('a workmate who lost its card gets no stranger record', Object.keys(b.strangers), []);
}
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, { ...sam, in_post: true, belongs: false }]);
  b.workmates.add(sam.name);
  at(b, 3100, 'Cargo Bay', [zim, { ...sam, in_post: true, belongs: false }]);
  add('a stranger record on someone later known as a workmate is dropped', Object.keys(b.strangers), []);
}
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, stranger]);
  add('someone never seen to belong is still a stranger', Object.keys(b.strangers), [stranger.name]);
}
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, { ...sam, in_post: true, belongs: true }]);
  b.strangers[sam.name] = { seenAt: 3000, lastSeenAt: 3000, asks: 0, verifyAsks: 0, verdict: 'go', orderedBy: zim.name };
  at(b, 3100, 'Cargo Bay', [zim, { ...sam, in_post: true, belongs: false }]);
  add('a workmate a superior ordered out is still to be put out', b.strangers[sam.name]?.verdict ?? null, 'go');
}

// ---- asked why it is in its own post, with nothing that sent it: it works here
const answer = (location: string, post: string | null) => {
  const b = tech();
  b.post = post;
  at(b, 3000, location, [{ ...sam, in_post: false, belongs: true }]);
  b.outOfBounds = true;
  hears(b, sam.name, `Donna, what are you doing in here? This room is locked to the crew.`);
  const plan = planGuarding(b, { id: 99, kind: 'explain', item: sam.name, state: 'open' } as any);
  return plan?.say ?? null;
};
add('asked in its own post: "I work here."', answer('Cargo Bay', 'Cargo Bay'), 'I work here.');
add('asked in a room not its post: owns up', answer('Bar', 'Cargo Bay'), 'Nobody sent for me. I should not be in here, I know.');

// ---- PARSE-07: a stranger's answer, read for who sent them
const ivy = { handle: 'p8', name: 'Ivy Lane', job: 'Assistant', in_post: true, belongs: false };
const answers = (line: string, samJob = 'Cargo Technician', annJob: string | null = 'Quartermaster') => {
  const b = tech();
  b.post = 'Cargo Bay';
  b.pdaPeople = [{ name: 'Sam Tech', job: samJob }, ...(annJob ? [{ name: 'Ann Moss', job: annJob }] : [])];
  at(b, 3000, 'Cargo Bay', [ivy]);
  b.workmates = new Set(['Donna Sholl', 'Sam Tech', 'Ann Moss']);
  b.strangers[ivy.name] = { seenAt: 2900, lastSeenAt: 3000, asks: 1, verifyAsks: 0, askedAt: 2950 };
  hears(b, ivy.name, line);
  const s = b.strangers[ivy.name];
  return { verdict: s?.verdict ?? null, voucher: s?.voucher ?? null };
};
const none = { verdict: null, voucher: null };
const go = { verdict: 'go', voucher: null };
const by = (voucher: string) => ({ verdict: null, voucher });
add('"Donna, the quartermaster asked me to come in": Ann', answers('Donna, the quartermaster asked me to come in'), by('Ann Moss'));
add('"Donna, the quartermaster asked me to come in", no QM known: asked again', answers('Donna, the quartermaster asked me to come in', 'Cargo Technician', null), none);
add('"sorry donna, im here for my crate": asked again', answers('sorry donna, im here for my crate'), none);
add('"hi donna! just here to pick up my order": asked again', answers('hi donna! just here to pick up my order'), none);
add('"Donna let me in": go', answers('Donna let me in'), go);
add('"Donna, you let me in": go', answers('Donna, you let me in'), go);
add('"the QM sent me": Ann', answers('the QM sent me'), by('Ann Moss'));
add('"cargo tech let me in, donna": Sam, the one other technician', answers('cargo tech let me in, donna'), by('Sam Tech'));
add('"cargo tech let me in, donna", Sam no technician: no surname match', answers('cargo tech let me in, donna', 'Shaft Miner'), none);
add('"Sam let me in": Sam', answers('Sam let me in'), by('Sam Tech'));
add('"Ann sent me, Donna": Ann', answers('Ann sent me, Donna'), by('Ann Moss'));
add('"nobody, just looking": go', answers('nobody, just looking'), go);

// ---- SECT-09: a workmate's yes or no, read from how it begins
const { yesOrNo } = await import(ROOT + 'jobs/guarding');
for (const [line, want] of [
  ['Yes, Donna, I asked Tolly in. No need to worry.', true],
  ["Yes, he's not done yet", true],
  ['No, I did not ask him', false],
  ['Not me, ask Quin', false],
  ['Hmm?', null],
  ['I did not ask him in.', false],
  ['Donna, yes, I did.', true],
  ['Yeah, no worries', true],
  ['No problem, I asked him in.', null],
  ['Nope.', false],
  ['I never did.', false],
] as [string, boolean | null][]) {
  add(`"${line}" is ${want === null ? 'neither' : want ? 'a yes' : 'a no'}`, yesOrNo(line.toLowerCase()), want);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
