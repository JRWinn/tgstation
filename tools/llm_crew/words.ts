// How loosely worded calls to a janitor are read, case by case. No model is called: this is all
// decided in code (CrewBrain/jobs/janitor.ts and tasks.ts), so it can be checked in a second.
//
//   bun run words.ts
const { ROOT, janitor, know, says, zim } = await import('./fixtures');
const { MESS_WORDS, JANITOR } = await import(ROOT + 'jobs/janitor');
const { workInWords } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// ---- the words alone
const calls = ['clean the bar pls', 'mop the kitchen', 'someone puked in the bar', 'the captain vomited in the library', 'bloodstains all over medbay', 'there are spills in the kitchen', 'wipe down the bar', 'scrub the kitchen', 'broken glass in the bar', 'a puddle in the kitchen', 'the floor is sticky', 'trash everywhere', 'the bar is a mess', 'someone threw up in the bar', 'cleaning needed in the bar'];
for (const line of calls) add(`"${line}" is a mess`, MESS_WORDS.test(line), true);
const notCalls = ['thanks', 'how is it going', 'what you asked for has come. it is in the cargo lobby', 'you have messages', 'ashley wants you', 'stainless steel', 'my glasses are gone', 'toilet', 'bring the cleaner grenade', 'i am coming to the door of the cargo bay to let you in'];
for (const line of notCalls) add(`"${line}" is no mess`, MESS_WORDS.test(line), false);

// ---- a PDA message to a janitor: a mess task in the room named, not a trip for supplies
const cleanTask = (b: any) => b.tasks.filter((task: any) => task.state !== 'done' && task.kind === 'clean').map((task: any) => task.place);
for (const line of ['clean the bar pls', 'someone puked in the Bar', 'mop the bar please']) {
  const b: any = janitor('mop');
  b.stowed = [];
  JANITOR.readsMessage(b, 'Zim Fire', line, 0, 'Captain');
  add(`PDA "${line}": a mess task in the Bar`, cleanTask(b), ['Bar']);
}

// ---- said aloud by its head, read with no model
for (const line of ['clean the bar', 'mop the bar please', 'someone vomited in the bar']) {
  const b: any = janitor('mop');
  b.stowed = [];
  know(b, ['Kitchen', 'Library', 'Engineering']);
  const task = workInWords(b, [says(zim, line)], zim.name, true);
  add(`said "${line}" by its head: clean the Bar`, task ? [task.place] : null, ['Bar']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
