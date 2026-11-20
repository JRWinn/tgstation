// When a crew member who keeps no post is offered to lead someone to a room, case by case. No model
// is called: availableOptions (CrewBrain/options.ts) and saidToMe (CrewBrain/talk.ts) decide, so it
// can be checked in a second.
//
//   bun run brain-lead.ts
const { ROOT, janitor, says, at } = await import('./fixtures');
const { availableOptions } = await import(ROOT + 'options');
const { saidToMe } = await import(ROOT + 'talk');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const bob = { handle: 'p6', name: 'Bob Hale', job: 'Assistant' };
const toMe = (text: string) => `${says(bob, text).slice(0, -1)}, speaking to you)`;
const toOther = (text: string) => `${says(bob, text).slice(0, -1)}, speaking to Ann Moss)`;
/** The rooms offered to lead to, or null when no walk is on offer. */
const offered = (lines: string[]) => {
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', [bob]);
  const options = availableOptions(b, true, saidToMe(lines).join(' '), [bob]);
  return options.find((option: any) => option.tool === 'go_to')?.parameter?.choices ?? null;
};

// ---- BRAIN-05: ordinary words are no asking the way
for (const line of [
  "Charlton Stone, I'm Caden Campbell; look at that dirt, it's practically begging to be wiped away once I grab my space cleaner.",
  "Hi, I'm Macie Lauffer. Seems you two got here first; I'll just grab my space cleaner and get to work on that dirt.",
  'Crate #7741 is ready for you at the counter. Please take it.',
  'Allegria blocks my way.',
  "I'm already on my way.",
  'Get lost.',
  'Take that order to Cargo Bay.',
  'I will walk over to the Bar later.',
  'How are you today?',
  'Where are the mops kept?',
]) {
  add(`"${line}": no walk on offer`, offered([toMe(line)]), null);
}
// ---- asking the way to a named room: that room, and only that room
for (const [line, room] of [
  ['Can you show me the way to the Bar?', 'Bar'],
  ['Take me to the Bar please.', 'Bar'],
  ['Where is the Kitchen?', 'Kitchen'],
  ['How do I get to Cargo Bay?', 'Cargo Bay'],
  ["I'm lost, which way is the Library?", 'Library'],
]) {
  add(`"${line}": a walk to ${room} only`, offered([toMe(line)]), [room]);
}
// ---- a line said to someone else asks nothing of it
add('"Show me the way to the Bar" said to someone else: no walk', offered([toOther('Show me the way to the Bar.')]), null);
add('asked the way, with a line to someone else before it: the room asked for', offered([toOther('Get to work.'), toMe('Where is the Chapel?')]), ['Chapel']);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
