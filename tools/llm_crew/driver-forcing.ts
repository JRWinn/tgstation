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

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
