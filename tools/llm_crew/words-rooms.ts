// Which room a line names, and which order a superior's words make, case by case. No model is
// called: placeNamedIn and workInWords (CrewBrain/tasks.ts) decide, so it can be checked in a
// second.
//
//   bun run words-rooms.ts
const { ROOT, janitor, says, at } = await import('./fixtures');
const { placeNamedIn, workInWords } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const captain = { handle: 'p9', name: 'Ada Crane', job: 'Captain', superior: true };
/** What a janitor in the Central Primary Hallway takes on when the Captain says these lines, as "kind Room urgency". */
function ordered(...lines: string[]): string | null {
  const b = janitor();
  at(b, 3000, 'Central Primary Hallway', [captain]);
  const task = workInWords(b, lines.map((line) => says(captain, line)), captain.name, true);
  return task ? `${task.kind} ${task.place} ${task.urgency}` : null;
}
const named = (line: string) => placeNamedIn(janitor(), line.toLowerCase()) ?? null;

// ---- MEM-04: of two rooms named, the one meant, not the longest name
add('"Forget the Kitchen, there is blood all over the Bar."', ordered('Forget the Kitchen, there is blood all over the Bar.'), 'clean Bar emergency');
add('"Leave the Kitchen and go check the Bar."', ordered('Leave the Kitchen and go check the Bar.'), 'look Bar emergency');
add('"Check the Bar, then come back to the Library."', ordered('Check the Bar, then come back to the Library.'), 'look Bar emergency');
add('"Go look at the Bar, not the Chapel."', ordered('Go look at the Bar, not the Chapel.'), 'look Bar emergency');
add('"There is blood in the Bar." (one room, as before)', ordered('There is blood in the Bar.'), 'clean Bar emergency');
add('a remark before the order: "The Kitchen looks great." then "Now go check the Bar."', ordered('The Kitchen looks great.', 'Now go check the Bar.'), 'look Bar emergency');
{
  // A room whose name is inside another's: a brain that knows a "Medbay" as well.
  const b = janitor();
  b.places.set('Medbay', { name: 'Medbay', things: [] });
  add('placeNamedIn: "Medbay Central is a mess" is Medbay Central, not Medbay', placeNamedIn(b, 'medbay central is a mess'), 'Medbay Central');
  add('placeNamedIn: "the Medbay, not Medbay Central" is Medbay', placeNamedIn(b, 'the medbay, not medbay central'), 'Medbay');
}
add('placeNamedIn: "Pun Pun ran from the Kitchen into the Bar"', named('Pun Pun ran from the Kitchen into the Bar'), 'Bar');
add('placeNamedIn: "Pun Pun ran from the Bar into the Kitchen"', named('Pun Pun ran from the Bar into the Kitchen'), 'Kitchen');
add('placeNamedIn: "I came from the Bar, there is blood there": all set aside, the first', named('I came from the Bar, there is blood there'), 'Bar');
add('placeNamedIn: "no room here" names none', named('no room here'), null);
add('placeNamedIn: "the Bar, the Bar again" is the Bar', named('the Bar, the Bar again'), 'Bar');

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(86)} ${got}${ok ? '' : `   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
