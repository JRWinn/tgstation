// Who a line was said to, case by case. No model is called: this is decided in code
// (CrewBrain/addressing.ts), so it can be checked in a second.
//
//   bun run addressing.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { saidTo, callsOn } = await import(ROOT + 'addressing');

const zim = { handle: 'p1', name: 'Zim Fire', job: 'Captain' };
const josh = { handle: 'p2', name: 'Josh Reed', job: 'Assistant' };
const billy = { handle: 'p3', name: 'Billy Marsh', job: 'Janitor' };
/** Amber, a janitor, in a room with these people, hearing this from that speaker. */
function hears(text: string, opts: { from?: any; with?: any[]; tiles?: number; facing?: boolean; nearest?: boolean; post?: boolean; talking?: boolean } = {}) {
  const b = makeBrain('Amber Holt', opts.post ? 'Cargo Technician' : 'Janitor');
  if (opts.post) b.post = 'Cargo Bay';
  const from = opts.from ?? zim;
  b.peopleInView = [from, ...(opts.with ?? [])];
  b.inTalkWith = opts.talking ? { name: from.name, at: Date.now() } : null;
  const event = { seq: 1, time: '', at: 100, kind: 'speech_heard', text: '', details: { speaker: from.name, handle: from.handle, source: 'person', message: text, distance: opts.tiles ?? 3, ...(opts.facing === undefined ? {} : { facing: opts.facing }) } };
  const said = saidTo(b, event as any, ['Billy Marsh', 'Cora Tech'], opts.nearest ?? true);
  return said.to + (said.name ? `:${said.name}` : '');
}

const cases: [string, string, string][] = [
  // Your examples.
  ['"Josh, do something" with Josh in the room', hears('Josh, do something', { with: [josh] }), 'other:Josh Reed'],
  ['"josh do something", typed without a capital or a comma', hears('josh do something', { with: [josh] }), 'other:Josh Reed'],
  ['a bot asks "Zim, could you open the door for me, please?"', hears('Zim, could you open the door for me, please?', { from: billy, with: [zim], post: true }), 'other:Zim Fire'],
  ['"Can either of you help me?", and this one is nearest', hears('Can either of you help me?', { with: [josh], nearest: true }), 'group'],
  ['only one person around, no name used', hears('What are you up to?'), 'me'],
  // Its own name, however it is put.
  ['"Amber, do something" with Josh in the room', hears('Amber, do something', { with: [josh] }), 'me'],
  ['"Hey Amber what are you doing"', hears('Hey Amber what are you doing', { with: [josh] }), 'me'],
  ['a post-holder called by their job: "Hey, cargo technician"', hears('Hey, cargo technician, any mail?', { with: [josh], post: true }), 'me'],
  // Someone else by name, in other shapes.
  ['"Open the door, Josh"', hears('Open the door, Josh', { with: [josh] }), 'other:Josh Reed'],
  ['"Hey Josh, come here"', hears('Hey Josh, come here', { with: [josh] }), 'other:Josh Reed'],
  ['someone it knows of who is not in the room: "Billy, where are you?"', hears('Billy, where are you?', { with: [josh] }), 'other:Billy Marsh'],
  // Speaking of someone is not speaking to them.
  ['"Have you seen Billy?", alone with the speaker', hears('Have you seen Billy?'), 'me'],
  ['"There is a fire in the bar!" does not call on Zim Fire', hears('There is a fire in the bar!', { from: josh }), 'me'],
  // No name, several people.
  ['no name, three in the room, speaker across the room and turned away', hears('What a day.', { with: [josh], tiles: 5, facing: false }), 'nobody'],
  ['no name, three in the room, speaker right beside it', hears('What a day.', { with: [josh], tiles: 1 }), 'me'],
  ['no name, speaker beside it but turned to someone nearer', hears('What a day.', { with: [josh], tiles: 1, facing: false, nearest: false }), 'nobody'],
  ['no name, speaker turned towards it from three tiles off', hears('What a day.', { with: [josh], tiles: 3, facing: true }), 'me'],
  ['no name, but the two of them were just talking', hears('And then what?', { with: [josh], tiles: 5, facing: false, talking: true }), 'me'],
  // BRAIN-06: who an NPC's own line calls on, which is who it is then talking with.
  ['callsOn: "I hope the Kitchen is open." does not call on Hope Reyes', String(callsOn('Right away, Captain. I hope the Kitchen is open.', 'Hope Reyes')), 'false'],
  ['callsOn: "I\'ll ask Ann to let me in." does not call on Ann Moss', String(callsOn("I'll ask Ann to let me in.", 'Ann Moss')), 'false'],
  ['callsOn: "Ann, I\'ll get my mop." calls on Ann Moss', String(callsOn("Ann, I'll get my mop.", 'Ann Moss')), 'true'],
  ['callsOn: "Oh hey Arielle! Can you open the door?" calls on Arielle', String(callsOn('Oh hey Arielle! Can you open the door?', 'Arielle Durstine')), 'true'],
  ['callsOn: "Oh hello Arielle!" calls on Arielle', String(callsOn('Oh hello Arielle!', 'Arielle Durstine')), 'true'],
  ['callsOn: "I saw Billy!" does not call on Billy', String(callsOn('I saw Billy!', 'Billy Marsh')), 'false'],
  ['"Oh hey Josh, come here" with Josh in the room', hears('Oh hey Josh, come here', { with: [josh] }), 'other:Josh Reed'],
];
let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(72)} ${got}${ok ? '' : `   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
