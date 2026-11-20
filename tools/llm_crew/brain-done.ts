// When word that a piece of work is done counts as given, case by case. No model is called:
// afterSaying (CrewBrain/tasks.ts) decides, so it can be checked in a second.
//
//   bun run brain-done.ts
const { ROOT, janitor, at } = await import('./fixtures');
const { afterSaying, wordOwed } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const captain = { handle: 'p9', name: 'Cap Tain', job: 'Captain', superior: 1 };
const ann = { handle: 'p8', name: 'Ann Moss', job: 'Bartender' };
/** A janitor that has cleaned the Bar for the Captain and the Kitchen for Ann, both in view. */
const twoDone = () => {
  const b: any = janitor();
  at(b, 3000, 'Bar', [captain, ann]);
  b.tasks = [
    { id: 1, kind: 'clean', place: 'Bar', state: 'done', askedBy: 'Cap Tain', source: 'told', reported: false },
    { id: 2, kind: 'clean', place: 'Kitchen', state: 'done', askedBy: 'Ann Moss', source: 'asked', reported: false },
  ];
  return b;
};
const owed = (b: any) => wordOwed(b).map((task: any) => task.askedBy);

// ---- BRAIN-12: a done line to one asker does not tell the other
{
  const b = twoDone();
  afterSaying(b, ['Ann, the mess in the Kitchen is cleaned up.']);
  add('the done line to Ann: the Captain still owed', owed(b), ['Cap Tain']);
  afterSaying(b, ['Cap, the mess in the Bar is cleaned up.']);
  add('then the done line to the Captain: nobody owed', owed(b), []);
}
{
  const b = twoDone();
  afterSaying(b, ['Hello there, nice to meet you.']);
  add('a greeting: both still owed', owed(b), ['Cap Tain', 'Ann Moss']);
  afterSaying(b, ['Sam, could you open the door?']);
  add('a line to someone else: both still owed', owed(b), ['Cap Tain', 'Ann Moss']);
}
{
  const b = twoDone();
  afterSaying(b, ['Captain, the Bar is all clean now.']);
  add('"Captain, the Bar is all clean now.": the Captain told', owed(b), ['Ann Moss']);
  afterSaying(b, ["All finished, Ann! Anything else?"]);
  add('"All finished, Ann!": Ann told', owed(b), []);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
