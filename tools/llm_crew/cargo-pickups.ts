// Someone at the counter come for a crate (CARGO-08): which number they gave, whether they were
// taken as collecting at all, and which held crate is brought out for them, or what they are told.
// No model is called (CrewBrain/jobs/pickups.ts, crateNumberIn and COLLECT_WORDS; jobs/cargo.ts,
// overhears).
//
//   bun run cargo-pickups.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { COLLECT_WORDS, crateNumberIn } = await import(ROOT + 'jobs/pickups');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// What was said; the number read; taken as collecting.
const table: [string, number | null, boolean][] = [
  ["I'm here for my crate", null, true],
  ['I have come for my crate, number is 12', 12, true],
  ['here to collect crate no. 12', 12, true],
  ['picking up crate twelve', 12, true],
  ['here for #12', 12, true],
  ['can i have crate 12', 12, true],
  ['I am here to get crate 12', 12, true],
  ['come to grab crate 12', 12, true],
  ['I need to pick my crate up', null, true],
  ['Sam, I am here to collect crate 12 for Hop Kins, please.', 12, true],
  // Orders, not collecting.
  ['can I have a crate of soap', null, false],
  ['could I get a crate of lights', null, false],
  ['I need to order a crate of janitorial supplies for my staff, please.', null, false],
  ['no one is here to help', null, false],
];
for (const [said, number, collecting] of table) {
  add(`"${said}": number`, crateNumberIn(said), number);
  add(`"${said}": collecting`, COLLECT_WORDS.test(said), collecting);
}

const CAPTAIN = { handle: 'p1', name: 'Hedley Bowchiew', job: 'Captain', command: 1 };
let at = 10_000;
const tech = (held: any[]) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `pickups-${at}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  at += 5000; // each brain its own asking, so takeOrder's claim from one case does not carry over
  b.now = at;
  b.peopleInView = [{ ...CAPTAIN, place: 'Cargo Lobby', distance: 1 }];
  b.pdaPeople = [{ name: CAPTAIN.name, job: CAPTAIN.job }];
  b.heldCrates = held.map((crate) => ({ for: null, what: 'Replacement Lights', place: 'Cargo Bay', out: false, takenBy: null, waited: 100, ...crate }));
  b.toTell = [];
  return b;
};
const hear = (b: any, message: string) => CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: CAPTAIN.name, message, said_to: 'you' } });
{
  const b = tech([{ number: 37, for: CAPTAIN.name }]);
  hear(b, "I'm here for my crate.");
  add('the Captain, one crate held for him, no number: that crate', b.pickupAsked?.number ?? null, 37);
  add('and nothing to tell him', b.toTell.map((it: any) => it.line), []);
}
{
  const b = tech([{ number: 37, for: CAPTAIN.name }, { number: 41, for: CAPTAIN.name }]);
  hear(b, "I'm here for my crate.");
  add('two held for him, no number: none picked', b.pickupAsked?.number ?? null, null);
  add('and he is asked which', b.toTell.map((it: any) => it.line), ['Hedley, I am holding crates #37 and #41 for you. Which number is it?']);
}
{
  const b = tech([{ number: 37, for: 'Hop Kins' }]);
  hear(b, "I'm here for my crate.");
  add('none held for him, no number: not "by that number"', b.toTell.map((it: any) => it.line), ['Sorry, Hedley, I am holding no crate for you. Which number is it?']);
}
{
  const b = tech([{ number: 37, for: 'Hop Kins' }]);
  hear(b, 'I am here to collect crate 12.');
  add('a number that is no crate: told so by that number', b.toTell.map((it: any) => it.line), ['Sorry, Hedley, I am not holding a crate by that number.']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
