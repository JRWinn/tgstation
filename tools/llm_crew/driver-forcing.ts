// The Chief Engineer waiting on an engineer it sent to force a door (ENG-04), case by case. No
// model is called: this is all decided in code (CrewBrain/jobs/forcing.ts).
//
//   bun run driver-forcing.ts
const { ROOT, makeBrain, at } = await import('./fixtures');
const F = await import(ROOT + 'jobs/forcing');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [
  { name: 'Derek Albright', job: 'Station Engineer' },
  { name: 'Joan Marsh', job: 'Head of Security' },
  { name: 'Hale Stone', job: 'Security Officer' },
  { name: 'Zim Fire', job: 'Captain' },
];
const sentBy = (brain: any) => { const lines = brain.toTell.map((tell: any) => `PDA to ${tell.to}: ${tell.line}`); brain.toTell = []; return lines; };

function chief() {
  const b: any = makeBrain('Ada Voss', 'Chief Engineer');
  b.pdaPeople = PDA;
  at(b, 6000, 'Engineering');
  F.forcingReads(b, 'Joan Marsh', 'Head of Security', F.forceAskLine('Ada', 'Bar', 'Pun Pun'));
  sentBy(b);
  return b;
}

// ---- the engineer never answers
{
  const b = chief();
  b.now = 6000 + 2999;
  F.syncForcing(b);
  add('under five minutes: security is told nothing more', sentBy(b), []);
  b.now = 6000 + 3000;
  F.syncForcing(b);
  add('five minutes and no word back: security is told the door is not open', sentBy(b), [
    'PDA to Joan Marsh: Joan, I could not open the door of the Bar: nobody from engineering has said it is open.',
  ]);
  b.now = 6000 + 4000;
  F.syncForcing(b);
  add('and told once', sentBy(b), []);
  // The engineer was only slow.
  F.forcingReads(b, 'Derek Albright', 'Station Engineer', 'Ada, the door of the Bar is open.');
  add('a late word that it is open is still passed on', sentBy(b), ['PDA to Joan Marsh: Joan, the door of the Bar is open.']);
}
{
  const b = chief();
  b.now = 6000 + 3000;
  F.syncForcing(b);
  sentBy(b);
  F.forcingReads(b, 'Derek Albright', 'Station Engineer', 'Ada, I could not open the door of the Bar: it is bolted.');
  add('a late word that it would not open is not passed on twice', sentBy(b), []);
}
{
  const b = chief();
  b.now = 6000 + 9000;
  F.syncForcing(b);
  sentBy(b);
  F.syncForcing(b);
  add('fifteen minutes on, the entry is dropped', b.forcing.sent.length, 0);
}

// ---- two asks for one room
{
  const b = chief();
  b.now = 6100;
  F.forcingReads(b, 'Joan Marsh', 'Head of Security', F.forceAskLine('Ada', 'Bar', 'Pun Pun'));
  add('a second ask while the engineer is on it: nothing sent', sentBy(b), []);
  add('and one entry kept', b.forcing.sent.length, 1);
  b.now = 6000 + 3000;
  F.syncForcing(b);
  sentBy(b);
  b.now = 6000 + 6100;
  F.forcingReads(b, 'Joan Marsh', 'Head of Security', F.forceAskLine('Ada', 'Bar', 'Pun Pun'));
  add('asked again after it was given up on: sent again', sentBy(b), [
    'PDA to Derek Albright: Derek, security needs the door of the Bar opened. Go and open it, please.',
    'PDA to Joan Marsh: Joan, I am sending Derek to open the Bar.',
  ]);
  add('still one entry, waited on afresh', [b.forcing.sent.length, b.forcing.sent[0].at, b.forcing.sentGivenUp?.Bar], [1, 12100, undefined]);
}

// ---- the engineer at the door: reasons that are not tried twice (DOOR-12)
function engineer() {
  const b: any = makeBrain('Derek Albright', 'Station Engineer');
  b.pdaPeople = [{ name: 'Ada Voss', job: 'Chief Engineer' }, ...PDA];
  at(b, 6000, 'Engineering');
  F.forcingReads(b, 'Ada Voss', 'Chief Engineer', F.forceOrderLine('Derek', 'Cargo Bay'));
  sentBy(b);
  return b;
}
{
  const b = engineer();
  add('the engineer has the job', b.forcing.jobs.map((job: any) => job.room), ['Cargo Bay']);
  F.forcingAfterActing(b, { tool: 'force_door', place: 'Cargo Bay' }, false, { reason: 'fire_doors', fire_doors: 'Cargo Bay' });
  add('a shut fire door: told at once, with where the alarm is', sentBy(b), [
    'PDA to Ada Voss: Ada, I could not open the door of the Cargo Bay: the fire doors are shut in the Cargo Bay.',
  ]);
  add('and the job is over', b.forcing.jobs.length, 0);
}
{
  const b = engineer();
  F.forcingAfterActing(b, { tool: 'force_door', place: 'Cargo Bay' }, false, { reason: 'wire' });
  add('a wire that would not pulse: tried once more, nothing sent', sentBy(b), []);
  add('the job is kept for the second go', b.forcing.jobs.length, 1);
}
add('the fire-door reason says no "I"', /\bI\b/.test(F.whyNot('fire_doors', undefined, 'Bar')), false);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
