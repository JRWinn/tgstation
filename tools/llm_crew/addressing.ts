// Who a line was said to, case by case. No model is called: this is decided in code
// (CrewBrain/addressing.ts), so it can be checked in a second.
//
//   bun run addressing.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { saidTo, callsOn } = await import(ROOT + 'addressing');

const zim = { handle: 'p1', name: 'Zim Fire', job: 'Captain' };
const josh = { handle: 'p2', name: 'Josh Reed', job: 'Assistant' };
const billy = { handle: 'p3', name: 'Billy Marsh', job: 'Janitor' };
const al = { handle: 'p6', name: 'Al Haines', job: 'Cargo Technician' };
const mo = { handle: 'p7', name: 'Mo Tran', job: 'Cargo Technician' };
const ann = { handle: 'p9', name: 'Ann Moss', job: 'Quartermaster' };
const gus = { handle: 'p10', name: 'Gus Lane', job: 'Assistant' };
const chief = { handle: 'p11', name: 'Kay Dorn', job: 'Chief Engineer' };
/** A room with others in it, the speaker four tiles off and turned away. */
const room = { with: [ann, gus], tiles: 4, facing: false, others: [] as string[] };
const ben = { name: 'Ben Fire', job: 'Janitor' };
const cook = { name: 'Tom Cook', job: 'Cargo Technician' };
const reed = { name: 'Tom Reed', job: 'Cargo Technician', post: 'Cargo Bay' };
const eli = { name: 'Eli Moor', job: 'Station Engineer', post: 'Engineering' };
const ivy = { name: 'Ivy Hart', job: 'Security Officer', post: 'Security Office' };
const may = { name: 'May Rees', job: 'Janitor' };
/** Amber, a janitor, in a room with these people, hearing this from that speaker. */
/** `as` hears it in Amber's place: someone else, with that job and post. */
function hears(text: string, opts: { from?: any; with?: any[]; tiles?: number; facing?: boolean; nearest?: boolean; post?: boolean; talking?: boolean; others?: string[]; as?: { name: string; job: string; post?: string } } = {}) {
  const b = makeBrain(opts.as?.name ?? 'Amber Holt', opts.as?.job ?? (opts.post ? 'Cargo Technician' : 'Janitor'));
  if (opts.post) b.post = 'Cargo Bay';
  if (opts.as?.post) b.post = opts.as.post;
  const from = opts.from ?? zim;
  b.peopleInView = [from, ...(opts.with ?? [])];
  b.inTalkWith = opts.talking ? { name: from.name, at: Date.now() } : null;
  const event = { seq: 1, time: '', at: 100, kind: 'speech_heard', text: '', details: { speaker: from.name, handle: from.handle, source: 'person', message: text, distance: opts.tiles ?? 3, ...(opts.facing === undefined ? {} : { facing: opts.facing }) } };
  const said = saidTo(b, event as any, opts.others ?? ['Billy Marsh', 'Cora Tech'], opts.nearest ?? true);
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
  // MEM-06: a first name that is also a word, used as the word, by someone alone with the NPC.
  ['"May I come in, please?", May Rees aboard but not in view', hears('May I come in, please?', { post: true, tiles: 1, facing: true, others: ['May Rees'] }), 'me'],
  ['"Grant me access to the bay.", Grant Cole aboard', hears('Grant me access to the bay.', { post: true, tiles: 1, facing: true, others: ['Grant Cole'] }), 'me'],
  ['"Mark crate 4 for the Bar, please.", Mark Fry aboard', hears('Mark crate 4 for the Bar, please.', { post: true, tiles: 1, facing: true, others: ['Mark Fry'] }), 'me'],
  ['"Hope you are well. Can I order a mop?", Hope Dunn aboard', hears('Hope you are well. Can I order a mop?', { post: true, tiles: 1, facing: true, others: ['Hope Dunn'] }), 'me'],
  ['"May, could you open the door?", May Rees not in view', hears('May, could you open the door?', { tiles: 1, facing: true, others: ['May Rees'] }), 'other:May Rees'],
  ['"May, could you open the door?", May Rees in view', hears('May, could you open the door?', { with: [{ handle: 'p5', name: 'May Rees', job: 'Cook' }], others: [] }), 'other:May Rees'],
  ['"May I come in?" with May Rees in view: the word, not the name', hears('May I come in?', { tiles: 1, with: [{ handle: 'p5', name: 'May Rees', job: 'Cook' }], others: [] }), 'me'],
  // TRA-03, KNB-10: a first name of two letters is a name when it opens the line or is set off by commas.
  ['"Al, take this" with Al Haines in view', hears('Al, take this', { tiles: 1, with: [al] }), 'other:Al Haines'],
  ['"Sorry, Mo, I am not holding a crate by that number." with Mo in view', hears('Sorry, Mo, I am not holding a crate by that number.', { tiles: 1, with: [mo] }), 'other:Mo Tran'],
  ['"Hey Mo: the door" with Mo in view', hears('Hey Mo: the door', { tiles: 1, with: [mo] }), 'other:Mo Tran'],
  ['"Thanks, Al." with Al Haines in view', hears('Thanks, Al.', { tiles: 1, with: [al] }), 'other:Al Haines'],
  ['"Al, take this" with Al Haines aboard but not in view', hears('Al, take this', { tiles: 1, others: ['Al Haines'] }), 'other:Al Haines'],
  ['"Haines, take this": the surname still calls, as before', hears('Haines, take this', { tiles: 1, with: [al] }), 'other:Al Haines'],
  ['"I gave the mop to al earlier" does not call on Al', hears('I gave the mop to al earlier', { tiles: 1, with: [al] }), 'me'],
  ['"Al take this", no comma: too short to be a name unset', hears('Al take this', { tiles: 1, with: [al] }), 'me'],
  ['"So, what now?" does not call on So Park: the word', hears('So, what now?', { tiles: 1, with: [{ handle: 'p8', name: 'So Park', job: 'Cook' }] }), 'me'],
  ['callsOn: "Ed, the crate" calls on Ed Ng (no part over two letters)', String(callsOn('Ed, the crate', 'Ed Ng')), 'true'],
  ['callsOn: "Edit the crate" does not call on Ed Ng', String(callsOn('Edit the crate', 'Ed Ng')), 'false'],
  ['Al hears "Al, take this" with Josh in the room: said to it', (() => {
    const b = makeBrain('Al Haines', 'Janitor');
    b.peopleInView = [zim, josh];
    const event = { seq: 1, time: '', at: 100, kind: 'speech_heard', text: '', details: { speaker: zim.name, handle: zim.handle, source: 'person', message: 'Al, take this', distance: 5, facing: false } };
    return saidTo(b, event as any, [], true).to;
  })(), 'me'],
  // MEM-01: its own name or job merely in the line is not calling on it. The Captain four tiles
  // off and turned away, Ann Moss and Gus Lane in the room as well.
  ['MEM-01: Ben Fire hears "There is a fire in the bar"', hears('There is a fire in the bar', { ...room, as: ben }), 'nobody'],
  ['MEM-01: Tom Cook hears "Ann, have the cook make lunch"', hears('Ann, have the cook make lunch', { ...room, as: cook }), 'other:Ann Moss'],
  ['MEM-01: a technician at its post hears "Ann, order a mop through cargo"', hears('Ann, order a mop through cargo', { ...room, as: reed }), 'other:Ann Moss'],
  ['MEM-01: a station engineer hears "Chief Engineer, come here"', hears('Chief Engineer, come here', { ...room, with: [chief, gus], as: eli }), 'nobody'],
  ['MEM-01: a station engineer hears "Gus, the station is losing power"', hears('Gus, the station is losing power', { ...room, as: eli }), 'other:Gus Lane'],
  ['MEM-01: an officer at its post hears "Ann, tell security nothing"', hears('Ann, tell security nothing', { ...room, as: ivy }), 'other:Ann Moss'],
  ['MEM-01: May Rees hears "Ann, may I ask you something"', hears('Ann, may I ask you something', { ...room, as: may }), 'other:Ann Moss'],
  ['MEM-01: Tom Cook hears "Cook, come here": the surname calls', hears('Cook, come here', { ...room, as: cook }), 'me'],
  ['MEM-01: Tom Cook hears "come here tom": a name at the end calls', hears('come here tom', { ...room, as: cook }), 'me'],
  ['MEM-01: Tom Cook hears "Over here Tom!"', hears('Over here Tom!', { ...room, as: cook }), 'me'],
  ['MEM-01: Gus, beside the speaker, hears "Have you seen Tom?": not to Tom', hears('Have you seen Tom?', { as: { name: 'Gus Lane', job: 'Assistant' }, with: [ann], others: ['Tom Cook'], tiles: 1, facing: true }), 'me'],
  ['MEM-01: an officer alone with the speaker hears "arrest tom": spoken of', hears('arrest tom', { as: ivy, others: ['Tom Cook'] }), 'me'],
  ['MEM-01: an officer at its post hears "Officer, over here"', hears('Officer, over here', { ...room, as: ivy }), 'me'],
  ['MEM-01: a technician at its post hears "is the cargo bay open"', hears('is the cargo bay open', { ...room, as: reed }), 'nobody'],
  ['MEM-01: a technician at its post hears "Cargo, open the door"', hears('Cargo, open the door', { ...room, as: reed }), 'me'],
  ['MEM-01: a technician at its post hears "the door please, technician"', hears('the door please, technician', { ...room, as: reed }), 'me'],
  // PARSE-14: a whole name tells two of one first name apart; a first name they share is put to both.
  ...((): [string, string, string][] => {
    const kimP = { handle: 'p12', name: 'Josh Kim', job: 'Janitor' };
    const kim = { name: 'Josh Kim', job: 'Janitor' };
    const reedJ = { name: 'Josh Reed', job: 'Janitor' };
    const two = { tiles: 4, facing: false, others: [] as string[] };
    return [
      ['PARSE-14: Josh Kim hears "Josh Reed, come here"', hears('Josh Reed, come here', { ...two, with: [josh], as: kim }), 'other:Josh Reed'],
      ['PARSE-14: Josh Reed hears "Josh Reed, come here"', hears('Josh Reed, come here', { ...two, with: [kimP], as: reedJ }), 'me'],
      ['PARSE-14: Josh Kim hears "Josh Kim, mop the bar"', hears('Josh Kim, mop the bar', { ...two, with: [josh], as: kim }), 'me'],
      ['PARSE-14: Josh Reed hears "Josh Kim, mop the bar"', hears('Josh Kim, mop the bar', { ...two, with: [kimP], as: reedJ }), 'other:Josh Kim'],
      ['PARSE-14: Josh Kim hears "Reed, come here"', hears('Reed, come here', { ...two, with: [josh], as: kim }), 'other:Josh Reed'],
      ['PARSE-14: Josh Reed hears "Reed, come here"', hears('Reed, come here', { ...two, with: [kimP], as: reedJ }), 'me'],
      ['PARSE-14: Josh Kim hears "Josh, come here" with Josh Reed there: both asked', hears('Josh, come here', { ...two, with: [josh], as: kim }), 'group'],
      ['PARSE-14: Josh Kim, beside, hears "Have you seen Josh Reed?"', hears('Have you seen Josh Reed?', { tiles: 1, facing: true, with: [josh], as: kim, others: [] }), 'me'],
      ['PARSE-14: Josh Reed, across the room, hears "Have you seen Josh Reed?"', hears('Have you seen Josh Reed?', { ...two, with: [kimP], as: reedJ }), 'nobody'],
      ['PARSE-14: Al Stone hears "Al, open the door"', hears('Al, open the door', { ...two, with: [josh], as: { name: 'Al Stone', job: 'Janitor' } }), 'me'],
      ['PARSE-14: Al Stone hears "Hey Al, come here"', hears('Hey Al, come here', { ...two, with: [josh], as: { name: 'Al Stone', job: 'Janitor' } }), 'me'],
      ['PARSE-14: Cora hears "Cora, I am here to collect crate 4521 for Hop Kins, please."', hears('Cora, I am here to collect crate 4521 for Hop Kins, please.', { ...two, with: [josh], others: ['Hop Kins'], as: { name: 'Cora Tech', job: 'Cargo Technician', post: 'Cargo Bay' } }), 'me'],
      ['PARSE-14: "Hop Kins, where are you?", Hop Kins aboard but not in view', hears('Hop Kins, where are you?', { ...two, with: [josh], others: ['Hop Kins'] }), 'other:Hop Kins'],
      ['PARSE-14: Al Stone hears "I also want it"', hears('I also want it', { ...two, with: [josh], as: { name: 'Al Stone', job: 'Janitor' } }), 'nobody'],
    ];
  })(),
];
let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(72)} ${got}${ok ? '' : `   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
