// The orders a head or the Captain gives about leaving a locked room, case by case: to the crew
// member itself to leave (SECT-06), and to whoever keeps the room to put someone out (SECT-07).
// No model is called: both are read in code (CrewBrain/jobs/guarding.ts, guardOverhears).
//
//   bun run guarding-orders.ts
const { ROOT, makeBrain, at, janitor, tech } = await import('./fixtures');
const { guardOverhears, barred } = await import(ROOT + 'jobs/guarding');


const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const hears = (b: any, speaker: string, message: string, said_to = 'me') =>
  guardOverhears(b, { seq: 1, time: '', at: b.now, kind: 'speech_heard', text: '', details: { speaker, message, said_to } } as any);

// ---- told to leave the room it is in (SECT-06)
const walker = { handle: 'p4', name: 'Walker Wolfe', job: 'Head of Personnel', superior: true };
function inTheBar() {
  const b = janitor();
  at(b, 3000, 'Bar', [walker]);
  return b;
}
const leaves = (line: string, speaker = walker.name) => {
  const b = inTheBar();
  hears(b, speaker, line);
  return !!b.toldToLeave && barred(b, 'Bar');
};
for (const line of [
  "Tolly, don't leave the bar until it is clean.",
  'Tolly, leave the mop bucket by the door.',
  'Tolly, please leave the wet floor signs out.',
  'Get that vomit out of here, Tolly.',
  'Tolly, the bar is unauthorized for the clown, keep an eye out',
  'Tolly, I will leave you to it.',
  'Thanks Tolly, I am off, I have to leave now.',
  'Tolly, could you let me out of the Bar, please? I cannot get out of here by myself.',
  'Tolly, never leave a wet floor without a sign.',
  'Tolly, you do not need to leave.',
]) {
  add(`not an order to leave: "${line}"`, leaves(line), false);
}
for (const line of [
  'Tolly, leave.',
  'Leave the bar, Tolly.',
  'Tolly, get out of here.',
  'Off you go, Tolly.',
  'Out, Tolly. Now.',
  'Tolly, you are not authorized in here.',
  "Tolly, you're not allowed in here.",
  'Tolly, you need to leave.',
  'Please leave, Tolly.',
  'Get out of the bar, Tolly!',
]) {
  add(`an order to leave: "${line}"`, leaves(line), true);
}
add('from someone it does not answer to, nothing', leaves('Tolly, leave.', 'Somebody Else'), false);
{
  const b = inTheBar();
  b.post = 'Bar';
  hears(b, walker.name, 'Tolly, leave.');
  add('nobody is told to leave its own post', b.toldToLeave, null);
}


let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
