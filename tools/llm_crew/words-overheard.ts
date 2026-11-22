// Who "someone threw up in the bar" is said to, and whose work it is, case by case. No model is
// called: saidTo (CrewBrain/addressing.ts) and workOverheard (CrewBrain/tasks.ts) decide, so it
// can be checked in a second.
//
//   bun run words-overheard.ts
const { ROOT, makeBrain, janitor, at } = await import('./fixtures');
const { saidTo } = await import(ROOT + 'addressing');
const { workOverheard } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const captain = { handle: 'p9', name: 'Ada Crane', job: 'Captain', superior: true };
const tech = { handle: 'p8', name: 'Donna Sholl', job: 'Cargo Technician' };
const event = (text: string, tiles: number, facing: boolean, said_to?: string) => ({ seq: 1, time: '', at: 100, kind: 'speech_heard', text: '', details: { speaker: captain.name, handle: captain.handle, source: 'person', message: text, distance: tiles, facing, ...(said_to ? { said_to } : {}) } });
/** Who a janitor with the Captain and a technician in view takes this line as said to. */
function heard(text: string, tiles: number, facing: boolean, nearest: boolean): string {
  const b = makeBrain('Tolly Field', 'Janitor');
  b.peopleInView = [captain, tech];
  return saidTo(b, event(text, tiles, facing) as any, [], nearest).to;
}

// ---- PARSE-17, steps 1 to 3: "someone" that did something is not everyone asked
add('"someone threw up in the bar", the janitor beside the Captain', heard('someone threw up in the bar', 1, true, false), 'me');
add('"somebody spilled oil in the kitchen", beside', heard('somebody spilled oil in the kitchen', 1, true, true), 'me');
add('"someone threw up in the bar", faced from 2 tiles, nearest', heard('someone threw up in the bar', 2, true, true), 'me');
add('"everyone is so lazy today, the bar is filthy", faced from 3 tiles, nearest', heard('everyone is so lazy today, the bar is filthy', 3, true, true), 'me');
add('"someone stole my id, arrest them", across the room, turned away', heard('someone stole my id, arrest them', 5, false, false), 'nobody');
add('"Can either of you help me?" beside: still put to both', heard('Can either of you help me?', 1, true, true), 'group');
add('"anyone know where the bar is", 3 tiles off', heard('anyone know where the bar is', 3, false, false), 'group');
add('"Can anyone help me?"', heard('Can anyone help me?', 4, false, false), 'group');
add('"Everyone, listen up"', heard('Everyone, listen up', 4, false, false), 'group');

// ---- PARSE-17, step 4: the one whose work it is takes it, whoever answers
const told = (text: string, saidTo: string) => {
  const b = janitor();
  at(b, 3000, 'Cargo Lobby', [captain, tech]);
  const task = workOverheard(b, event(text, 2, false, saidTo) as any);
  return task ? `${task.kind} ${task.place} ${task.askedBy} ${task.urgency}` : null;
};
add('"someone threw up in the bar", put to nobody: the janitor takes it', told('someone threw up in the bar', 'nobody'), 'clean Bar Ada Crane asked');
add('"someone threw up in the bar", put to the group: the janitor takes it', told('someone threw up in the bar', 'group'), 'clean Bar Ada Crane asked');
add('"someone threw up in the bar", said to someone else by name: not its', told('Donna, someone threw up in the bar', 'other'), null);
add('"someone threw up in the bar", said to it: left to its answer', told('someone threw up in the bar', 'me'), null);
add('"someone threw up" with no room: nothing', told('someone threw up', 'nobody'), null);
add('"the bar was a mess but its fine now": nothing', told('the bar was a mess but its fine now', 'nobody'), null);
{
  const b = makeBrain('Donna Sholl', 'Cargo Technician');
  at(b, 3000, 'Cargo Lobby', [captain]);
  add('a technician (no mess words in its job) takes nothing', workOverheard(b, event('someone threw up in the bar', 2, false, 'nobody') as any), null);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(86)} ${got}${ok ? '' : `   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
