// A crate that would not come out to the lobby (CARGO-18). The technician the Quartermaster sends
// to see to it takes a hand-over for that number and brings it out; the one who failed stands
// down once the Quartermaster has its word, and takes it up again only if told to try again. No
// model is called (CrewBrain/jobs/cargo.ts: overhears, syncHeld, syncWontCome, planHeld).
//
//   bun run cargo-seeto.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const ADA = { handle: 'p1', name: 'Ada Quarter', job: 'Quartermaster', command: 1 };
const JAN = { handle: 'p3', name: 'Jan Mopp', job: 'Janitor' };
let ids = 0;
const tech = (name: string) => {
  const b: any = makeBrain(name, 'Cargo Technician');
  b.id = `seeto${++ids}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  b.now = 10_000;
  b.peopleInView = [{ ...ADA, place: 'Cargo Bay', distance: 2 }];
  b.pdaPeople = [{ name: ADA.name, job: ADA.job }];
  b.heldCrates = [{ number: 12, for: 'Hop Kins', out: false, takenBy: null }];
  return b;
};
const qmSays = (b: any, message: string) =>
  CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: ADA.name, message, said_to: 'me' } });
const handovers = (b: any) => b.tasks.filter((t: any) => t.kind === 'handover' && t.state !== 'done').map((t: any) => t.item);

{
  const sam = tech('Sam Bell');
  CARGO.syncTasks(sam);
  add('no ask and no word: no hand-over', handovers(sam), []);
  qmSays(sam, 'Sam, crate #12 is in the Cargo Bay and Cora could not get it out to the lobby. See to it, please.');
  CARGO.syncTasks(sam);
  add('sent to see to a crate that would not come out: a hand-over for it', handovers(sam), ['12']);
  const task = sam.tasks.find((t: any) => t.kind === "handover" && t.state !== "done");
  add('and it brings it out', CARGO.plan(sam, task)?.act, { tool: 'release', number: 12 });
  sam.now += 2500; // past the collector's two-minute ask
  CARGO.syncTasks(sam);
  add('still its to bring out after two minutes', handovers(sam), ['12']);
  sam.heldCrates[0].out = true;
  CARGO.syncTasks(sam);
  add('out in the lobby: done', handovers(sam), []);
  sam.heldCrates[0].out = false;
  CARGO.syncTasks(sam);
  add('and the word is spent', handovers(sam), []);
}
{
  const sam = tech('Sam Bell');
  qmSays(sam, 'Sam, crate #12 is in the Supply Shuttle and Cora could not get it off the shuttle. See to it, please.');
  CARGO.syncTasks(sam);
  add('a crate that would not come off the shuttle is no hand-over', [handovers(sam), sam.seeToUntil > sam.now], [[], true]);
}
{
  const sam = tech('Sam Bell');
  qmSays(sam, 'Cora, crate #12 is in the Cargo Bay and Sam could not get it out to the lobby. See to it, please.');
  CARGO.syncTasks(sam);
  add('said to a workmate: nothing', handovers(sam), []);
}
{
  // The one who failed.
  const cora = tech('Cora Tech');
  cora.pickupAsked = { name: JAN.name, number: 12, at: cora.now };
  CARGO.syncTasks(cora);
  add('asked at the counter: a hand-over', handovers(cora), ['12']);
  cora.gaveUp = { tool: 'release', what: 'crate #12', leftIn: 'Cargo Bay', at: cora.now };
  CARGO.syncTasks(cora);
  const telling = cora.tasks.find((t: any) => t.kind === 'wont_come' && t.state !== 'done');
  telling.passedOn = true;
  CARGO.syncTasks(cora);
  add('the Quartermaster has its word: it stands down from the crate', [cora.pickupAsked, handovers(cora)], [null, []]);
  qmSays(cora, 'Cora, try crate #12 again in a little while, please.');
  CARGO.syncTasks(cora);
  add('told to try again: the hand-over is back', handovers(cora), ['12']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
