// Which notes a crew member keeps when it writes a new one, case by case. No model is called:
// addNote (CrewBrain/memory.ts) decides, so it can be checked in a second.
//
//   bun run brain-notes.ts
const { ROOT, janitor } = await import('./fixtures');
const { addNote } = await import(ROOT + 'memory');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const notesAfter = (...notes: string[]) => {
  const b: any = janitor();
  for (const note of notes) addNote(b, note);
  return b.notes;
};

// ---- MEM-02: a note that corrects an older one takes its place
for (const [first, later] of [
  ['Bob is allowed in the Bar.', 'Bob is not allowed in the Bar.'],
  ['The staff meeting is in the Bar at 14:00.', 'The staff meeting was moved to the Bridge.'],
  ['The Captain wants the Kitchen mopped first.', 'The Captain no longer wants the Kitchen mopped first.'],
  ['Engine is lit and running fine.', 'Engine is not running.'],
  ['Captain says Pun Pun is wanted for theft.', 'Captain says Pun Pun is no longer wanted.'],
]) {
  add(`"${first}" then "${later}": only the later kept`, notesAfter(first, later), [later]);
}
add('the same note twice: kept once', notesAfter('Cargo has no soap left.', 'Cargo has no soap left.'), ['Cargo has no soap left.']);
add('a shorter copy of a note: the full note stays', notesAfter('The Captain wants the Kitchen mopped first, then the Bar.', 'The Captain wants the Kitchen mopped first'), ['The Captain wants the Kitchen mopped first, then the Bar.']);
add('two notes on other things: both kept', notesAfter('The Captain is away.', 'Donna owes me a mop.'), ['The Captain is away.', 'Donna owes me a mop.']);
add('a correction moves to the end, after the others', notesAfter('Bob is allowed in the Bar.', 'Donna owes me a mop.', 'Bob is not allowed in the Bar.'), ['Donna owes me a mop.', 'Bob is not allowed in the Bar.']);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(100)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
