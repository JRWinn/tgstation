// ENG-03 step 5: a door to force goes to the engineer the Chief Engineer gives its orders to (the
// one that has the engine, or that answers), not to whoever is first on its PDA, and an engineer's
// word that the door is open, or could not be opened, counts as an answer (forcingReads in
// CrewBrain/jobs/forcing.ts, engineerToOrder and engineerAnswered in jobs/engineering.ts). No model
// is called and no station is simulated.
//
//   bun run forcing-eng03.ts
const { ROOT, makeBrain, at } = await import('./fixtures');
const F = await import(ROOT + 'jobs/forcing');
const E = await import(ROOT + 'jobs/engineering');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [
  { name: 'Derek Albright', job: 'Station Engineer' },
  { name: 'Mina Holt', job: 'Station Engineer' },
  { name: 'Joan Marsh', job: 'Head of Security' },
  { name: 'Zim Fire', job: 'Captain' },
];
const sentTo = (brain: any) => { const to = brain.toTell.map((tell: any) => tell.to); brain.toTell = []; return to; };
const chief = () => {
  const b: any = makeBrain('Ada Voss', 'Chief Engineer');
  b.pdaPeople = PDA;
  at(b, 6000, 'Engineering');
  return b;
};
const ask = (b: any, room = 'Bar') => F.forcingReads(b, 'Joan Marsh', 'Head of Security', F.forceAskLine('Ada', room, 'Pun Pun'));

{
  const b = chief();
  ask(b);
  add('nobody has answered yet: the first on its PDA is sent, as before', sentTo(b), ['Derek Albright', 'Joan Marsh']);
}
{
  const b = chief();
  E.engineerAnswered(b, 'Mina Holt', 'lit');
  ask(b);
  add('Mina has the engine: the door goes to Mina, not the first on the PDA', sentTo(b), ['Mina Holt', 'Joan Marsh']);
}
{
  const b = chief();
  E.engineerAnswered(b, 'Derek Albright');
  E.engineerUnanswered(b, 'Derek Albright');
  E.engineerUnanswered(b, 'Derek Albright');
  E.engineerUnanswered(b, 'Derek Albright');
  ask(b);
  add('Derek has left orders unanswered: the door goes to Mina', sentTo(b)[0], 'Mina Holt');
}
{
  // Mina sends word back about a door it was not sent to by this chief: an answer all the same.
  const b = chief();
  ask(b);
  sentTo(b);
  add('before any word back, the order goes to Derek', E.engineerToOrder(b), 'Derek Albright');
  F.forcingReads(b, 'Mina Holt', 'Station Engineer', F.forceDoneLine('Ada', 'Bar'));
  add('Mina says the door is open: Mina is now one that answers, and is given the next order', E.engineerToOrder(b), 'Mina Holt');
}
{
  const b = chief();
  F.forcingReads(b, 'Mina Holt', 'Station Engineer', F.forceFailedLine('Ada', 'Bar', 'it is welded shut'));
  add('a word that it could not be opened counts as an answer too', E.engineerToOrder(b), 'Mina Holt');
}
{
  // Security with no Chief Engineer aboard asks the engineer that would be given orders.
  const h: any = makeBrain('Joan Marsh', 'Head of Security');
  h.pdaPeople = PDA.filter((it) => it.name !== 'Joan Marsh');
  at(h, 6000, 'Security Office', [{ handle: 'm1', name: 'Mina Holt', job: 'Station Engineer', place: 'Security Office', distance: 2 }]);
  F.askEngineering(h, 'Bar', 'Pun Pun');
  add('no Chief Engineer: security asks the engineer in sight first', sentTo(h)[0], 'Mina Holt');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
