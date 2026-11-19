// Heads, their staff and their meetings, case by case: who a staff member asks for what it needs,
// and which PDA messages are a call to a meeting. No model is called.
//
//   bun run head-meetings.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { needStep } = await import(ROOT + 'jobs/meetings');

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

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
