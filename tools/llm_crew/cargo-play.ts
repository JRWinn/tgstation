// Faults from the played round-15.44.36, case by case (PLAY-05, PLAY-06, PLAY-10, PLAY-12): a
// janitor's roomless "open that door" after a PDA ask, a let-out door the body could not get to,
// an order to send for a janitor, and a collector that gave up hauling a crate. No model is called
// (CrewBrain/jobs/cargo.ts, jobs/orders.ts, tasks.ts, jobs/pickups.ts, jobs/head.ts).
//
//   bun run cargo-play.ts
const { ROOT, makeBrain, know, says } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { CALL, ORDERS, ORDER_SOUNDS, planOrders, ordersAfterActing, ordersAfterSaying, syncOrders } = await import(ROOT + 'jobs/orders');
const { addTask, takeToldWork, workInWords, WORK_NOWHERE } = await import(ROOT + 'tasks');
const { pickupsAfterActing, GAVE_UP_WORDS } = await import(ROOT + 'jobs/pickups');
const { HEAD_OF_PERSONNEL } = await import(ROOT + 'jobs/head');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HAYDEN = { handle: 'p6', name: 'Hayden Griffiths', job: 'Janitor' };
let clock = 10_000;
const tech = (people: any[]) => {
  const b: any = makeBrain('Kailyn Patterson', 'Cargo Technician');
  b.id = `play-${clock}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  clock += 5000;
  b.now = clock;
  b.closedRooms = ['Cargo Bay', 'Mining Office'];
  b.peopleInView = people;
  b.pdaPeople = [{ name: HAYDEN.name, job: HAYDEN.job }];
  b.toTell = [];
  b.heldCrates = [];
  b.doorAsks = [];
  return b;
};
const hear = (b: any, message: string, nearDoor?: string) =>
  CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: HAYDEN.name, message, said_to: 'me', near_door: nearDoor } });
const asks = (b: any) => b.doorAsks.map((ask: any) => [ask.room ?? null, !!ask.byPda, ask.door ?? null, !!ask.out]);

// PLAY-05: a roomless spoken ask after a PDA ask is the same ask said again.
{
  const b = tech([]);
  CARGO.readsMessage(b, HAYDEN.name, 'I am at the Mining Dock Maintenance door of the Mining Office about the mess. Could you let me in, please?', b.now, HAYDEN.job);
  b.now += 80;
  hear(b, "Kailyn, I'm standing here with a rag in hand waiting to scrub oil; open that door so I can get back to work.");
  add('PLAY-05: "open that door" after a PDA ask keeps its room, door and PDA', asks(b), [['Mining Office', true, 'Mining Dock Maintenance', false]]);
  add('PLAY-05: and is fresh', b.doorAsks[0].at, b.now);
}
{
  const b = tech([]);
  CARGO.readsMessage(b, HAYDEN.name, 'I am at the Mining Dock Maintenance door of the Mining Office about the mess. Could you let me in, please?', b.now, HAYDEN.job);
  hear(b, 'open that door, please', 'Mining Dock Maintenance');
  add('PLAY-05: said standing at the same door, it is still the same ask', asks(b), [['Mining Office', true, 'Mining Dock Maintenance', false]]);
}
{
  const b = tech([]);
  CARGO.readsMessage(b, HAYDEN.name, 'I am at the Mining Dock Maintenance door of the Mining Office about the mess. Could you let me in, please?', b.now, HAYDEN.job);
  hear(b, 'open that door, please', 'Cargo Bay Maintenance');
  add('PLAY-05: said at another door, it is a new ask, as before', asks(b), [[null, false, 'Cargo Bay Maintenance', false]]);
}
{
  const b = tech([]);
  CARGO.readsMessage(b, HAYDEN.name, 'I am at the Mining Dock Maintenance door of the Mining Office about the mess. Could you let me in, please?', b.now, HAYDEN.job);
  b.now += 700; // the PDA ask has run out
  hear(b, 'open that door, please');
  add('PLAY-05: after the first ask has run out, a roomless ask stands alone', asks(b), [[null, false, null, false]]);
}
// PLAY-05 step 2: a DOOR task whose open_door is on its way is not finished when the ask changes.
{
  const inFlight = (flying: boolean) => {
    const b = tech([]);
    const task = addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Mining Office', urgency: 'asked', source: 'own' });
    b.lastAct = flying ? { key: 'k', tool: 'open_door', at: Date.now(), act: { tool: 'open_door' }, task: task.id } : null;
    CARGO.syncTasks(b);
    return task.state;
  };
  add('PLAY-05: nobody wants the door now, open_door on its way: the task stands', inFlight(true), 'open');
  add('PLAY-05: nobody wants the door now, nothing on its way: the task is finished', inFlight(false), 'done');
  const b = tech([]);
  const task = addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Mining Office', urgency: 'asked', source: 'own' });
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, room: 'Mining Office', byPda: true }];
  CARGO.afterActing(b, { tool: 'open_door' }, task, true, false, {}, 'You open the door for Hayden Griffiths and hold it, to let them into Mining Office.');
  add('PLAY-05: the result finds the task: the ask is dropped and it stands by the door', [b.doorAsks.length, b.tasks.some((t: any) => t.kind === 'door_watch' && t.state !== 'done')], [0, true]);
}

// PLAY-06: a let-out door it could not get to is tried once more, then they are told.
{
  const inBay = [{ ...HAYDEN, place: 'Cargo Bay', in_post: 1, distance: 2 }];
  const b = tech(inBay);
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, out: true }];
  const task = addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Cargo Bay', urgency: 'asked', source: 'own' });
  CARGO.afterActing(b, { tool: 'open_door' }, task, false, false, {}, 'You could not get to it.');
  add('PLAY-06: could not get to the door once: the ask stands, to be tried in ten seconds', [b.doorAsks.length, b.doorAsks[0]?.after - b.now, b.toTell.length], [1, 100, 0]);
  b.now += 120;
  const again = addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Cargo Bay', urgency: 'asked', source: 'own' });
  CARGO.afterActing(b, { tool: 'open_door' }, again, false, false, {}, 'You could not get to it.');
  add('PLAY-06: a second time: the ask goes, and they are told why', [b.doorAsks.length, b.toTell.map((t: any) => [t.to, t.line, !!t.byPda])], [0, [[HAYDEN.name, 'Hayden, I could not get to the door to let you out.', false]]]);
  // A new ask later starts the count afresh.
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, out: true }];
  CARGO.afterActing(b, { tool: 'open_door' }, addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Cargo Bay', urgency: 'asked', source: 'own' }), false, false, {}, 'You could not get to it.');
  add('PLAY-06: a new ask after that is tried again too', b.doorAsks.length, 1);
}
{
  const b = tech([{ ...HAYDEN, place: 'Cargo Bay', in_post: 1, distance: 2 }]);
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, out: true }];
  CARGO.afterActing(b, { tool: 'open_door' }, addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Cargo Bay', urgency: 'asked', source: 'own' }), false, false, {}, 'The door will not open for you.');
  add('PLAY-06: a door that will not open is not gone back to: told at once', [b.doorAsks.length, b.toTell.map((t: any) => t.line)], [0, ['Hayden, that door will not open for me.']]);
}
{
  const b = tech([]);
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, out: true }];
  CARGO.afterActing(b, { tool: 'open_door' }, addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Cargo Bay', urgency: 'asked', source: 'own' }), false, false, {}, 'You could not get to it.');
  add('PLAY-06: not seen inside any more: the ask goes, as before, and nothing is said', [b.doorAsks.length, b.toTell.length], [0, 0]);
}
{
  const b = tech([{ ...HAYDEN, place: 'Fore Port Maintenance', distance: 2 }]);
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, room: 'Mining Office' }];
  CARGO.afterActing(b, { tool: 'open_door' }, addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Mining Office', urgency: 'asked', source: 'own' }), false, false, {}, 'You could not get to it.');
  // CARGO-04: a let-in door the body could not get to is tried once more, like a let-out one.
  add('CARGO-04: an ask to be let in whose door could not be got to is kept for one more try', [b.doorAsks.length, b.doorAsks[0]?.after - b.now], [1, 100]);
  b.now += 120;
  CARGO.afterActing(b, { tool: 'open_door' }, addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Mining Office', urgency: 'asked', source: 'own' }), false, false, {}, 'You could not get to it.');
  add('CARGO-04: a second time, the ask goes', b.doorAsks.length, 0);
}
{
  const b = tech([{ ...HAYDEN, place: 'Fore Port Maintenance', distance: 2 }]);
  b.doorAsks = [{ name: HAYDEN.name, at: b.now, room: 'Mining Office' }];
  CARGO.afterActing(b, { tool: 'open_door' }, addTask(b, { kind: 'door', item: HAYDEN.name, place: 'Mining Office', urgency: 'asked', source: 'own' }), false, false, {}, 'You have no call to let Hayden Griffiths into Mining Office.');
  add('PLAY-06: an ask to be let in that the server refuses goes, as before', b.doorAsks.length, 0);
}

// PLAY-10: an order to send for a janitor.
const ZIM = { handle: 'p1', name: 'Zim Fire', job: 'Captain', superior: true };
const order = () => {
  const b: any = makeBrain('Jace Richardson', 'Cargo Technician');
  b.id = `call-${clock}`;
  clock += 5000;
  b.post = 'Cargo Bay';
  know(b, ['Cargo Bay', 'Cargo Lobby', 'Bar']);
  b.location = 'Cargo Bay';
  b.now = clock;
  b.peopleInView = [{ ...ZIM, place: 'Cargo Bay', in_post: 1, distance: 2 }];
  b.janitorsOnPda = [HAYDEN.name, 'Dortha Matthews'];
  b.toTell = [];
  return b;
};
for (const [line, want] of [
  ['Then ask for a janitor', true],
  ['call a janitor', true],
  ['get someone, a janitor, in here', true],
  ['send for the janitors', true],
  ['call a janitor to check the bar', true],
  ['I got a message from the janitor', false],
  ['check the bar', false],
] as [string, boolean][]) {
  add(`PLAY-10: "${line}" ${want ? 'is' : 'is not'} an order to send for a janitor`, ORDER_SOUNDS[CALL].test(line.toLowerCase()), want);
}
{
  const b = order();
  const caught = workInWords(b, [says(ZIM, 'its messy in here'), says(ZIM, 'Then ask for a janitor')], ZIM.name, true);
  add('PLAY-10: "Then ask for a janitor", no room named, is caught for the room it stands in', [caught?.kind, caught?.place, caught?.askedBy, caught?.urgency], [CALL, 'Cargo Bay', ZIM.name, 'emergency']);
  syncOrders(b);
  const plan = planOrders(b, caught);
  add('PLAY-10: it sends a janitor a PDA message about the room', [plan?.act?.tool, plan?.act?.person, /mess in the Cargo Bay\..*Zim Fire has asked for a janitor/.test(plan?.act?.text ?? '')], ['message', HAYDEN.name, true]);
  CARGO.afterActing(b, plan.act, caught, true, false, {}, 'You send the message.');
  ordersAfterActing(plan.act, caught, true);
  add('PLAY-10: a mess it does not know of is left off the janitor calls', Object.keys(b.janitorCalls), []);
  const told = planOrders(b, caught);
  add('PLAY-10: then it tells whoever gave the order, here, who it sent for', [told?.say, told?.act ?? null], ['Zim, about the Cargo Bay. I have sent Hayden Griffiths, a janitor, a PDA message to come and clean it.', null]);
  ordersAfterSaying(b, told.say);
  syncOrders(b);
  add('PLAY-10: said, the order is done', caught.state, 'done');
}
{
  const b = order();
  add('PLAY-10: "don\'t call a janitor" is no order', workInWords(b, [says(ZIM, "don't call a janitor")], ZIM.name, true), null);
  add('PLAY-10: from someone it does not answer to, no order', workInWords(b, [says(HAYDEN, 'call a janitor')], HAYDEN.name, false), null);
  const task = takeToldWork(b, ORDERS[CALL], WORK_NOWHERE, ZIM.name, true);
  add('PLAY-10: the model naming "nowhere you know" takes the room it stands in', [task?.kind, task?.place], [CALL, 'Cargo Bay']);
  const named = takeToldWork(b, ORDERS[CALL], 'Bar', ZIM.name, true);
  add('PLAY-10: a room named is that room', named?.place, 'Bar');
  add('PLAY-10: a look still needs a room', takeToldWork(b, ORDERS.look, WORK_NOWHERE, ZIM.name, true), null);
}
{
  const b = order();
  b.areaMesses = { 'Cargo Bay': ['cobweb'] };
  const task = takeToldWork(b, ORDERS[CALL], 'Cargo Bay', ZIM.name, true);
  syncOrders(b);
  const plan = planOrders(b, task);
  add('PLAY-10: a mess it knows of is named to the janitor', /mess in the Cargo Bay: cobweb\./.test(plan?.act?.text ?? ''), true);
  CARGO.afterActing(b, plan.act, task, true, false, {}, 'You send the message.');
  add('PLAY-10: and the call is noted, so the janitor is let in', b.janitorCalls['Cargo Bay']?.to, HAYDEN.name);
}
{
  const b = order();
  b.janitorCalls = { 'Cargo Bay': { to: 'Dortha Matthews', at: b.now - 100, count: 1 } };
  const task = takeToldWork(b, ORDERS[CALL], 'Cargo Bay', ZIM.name, true);
  syncOrders(b);
  add('PLAY-10: called already: nobody else is sent, and it says who is coming', [planOrders(b, task)?.act ?? null, planOrders(b, task)?.say], [null, 'Zim, about the Cargo Bay. I have sent for Dortha Matthews, a janitor, already. They know of it.']);
}
{
  const b = order();
  b.janitorsOnPda = [];
  const task = takeToldWork(b, ORDERS[CALL], 'Cargo Bay', ZIM.name, true);
  syncOrders(b);
  add('PLAY-10: no janitor on its PDA: it says so', planOrders(b, task)?.say, 'Zim, about the Cargo Bay. There is no janitor on my PDA to send for.');
}
// PLAY-10 follow-up: no room named, the call is for the room the speaker stands in, if it can see
// that: tidying in the Cargo Lobby, the Captain speaking across the counter from the Cargo Bay.
{
  const b = order();
  b.location = 'Cargo Lobby';
  const caught = workInWords(b, [says(ZIM, 'call a janitor')], ZIM.name, true);
  add('PLAY-10: the Captain in the Cargo Bay, it in the Cargo Lobby: the call is for the Cargo Bay', caught?.place, 'Cargo Bay');
  syncOrders(b);
  const plan = planOrders(b, caught);
  add('PLAY-10: its PDA to the janitor carries call_for (MULTI-06)', [plan?.act?.call_for, /mess in the Cargo Bay/.test(plan?.act?.text ?? '')], ['Cargo Bay', true]);
  add('PLAY-10: the model naming "nowhere you know" takes the speaker\'s room too', takeToldWork(b, ORDERS[CALL], WORK_NOWHERE, ZIM.name, true)?.place, 'Cargo Bay');
}
{
  // The speaker's room unknown to it, or the speaker out of sight (a PDA order): its own room.
  const b = order();
  b.location = 'Cargo Lobby';
  b.peopleInView = [{ ...ZIM, place: 'Somewhere Odd', distance: 2 }];
  add('PLAY-10: the speaker in a room it does not know: its own room', workInWords(b, [says(ZIM, 'call a janitor')], ZIM.name, true)?.place, 'Cargo Lobby');
  const c = order();
  c.location = 'Cargo Lobby';
  c.peopleInView = [];
  add('PLAY-10: the speaker out of sight: its own room', takeToldWork(c, ORDERS[CALL], WORK_NOWHERE, ZIM.name, true)?.place, 'Cargo Lobby');
}

// PLAY-12: a collector that gives up hauling tells its head, and the head sends someone else.
const SUNSHINE = 'Sunshine Langston';
const collector = (leftIn: string | null) => {
  const b: any = makeBrain('Dortha Matthews', 'Janitor');
  b.location = 'Central Primary Hallway';
  b.now = 5000;
  b.toTell = [];
  const task = addTask(b, { kind: 'collect', item: '2', place: 'Custodial Closet', urgency: 'asked', source: 'asked', askedBy: SUNSHINE });
  b.gaveUp = { tool: 'collect_crate', what: 'crate #2', leftIn, at: 5000 };
  pickupsAfterActing(b, { tool: 'collect_crate', number: 2, place: 'Custodial Closet' }, task, false);
  return { b, task };
};
{
  const { b, task } = collector(null);
  add('PLAY-12: given up, its head is sent word of which crate and where it lies', b.toTell.map((t: any) => [t.to, t.line, t.byPda]), [[SUNSHINE, 'I could not get crate #2 to the Custodial Closet. It is left in the Central Primary Hallway. Could you send someone else for it, please?', true]]);
  add('PLAY-12: the errand is over and the give-up is spent', [task.state, b.gaveUp], ['done', null]);
  add('PLAY-12: the head knows the words', GAVE_UP_WORDS.exec(b.toTell[0].line)?.[1], '2');
}
{
  const { b } = collector('Service Hallway');
  add('PLAY-12: put clear of the doors, it says so', b.toTell[0]?.line, 'I could not get crate #2 to the Custodial Closet. It is left in the Service Hallway, clear of the doors. Could you send someone else for it, please?');
}
{
  // The server says where the crate lies (lies_in): that is the room told, not where the body is.
  const b: any = makeBrain('Dortha Matthews', 'Janitor');
  b.location = 'Service Hallway';
  b.now = 5000;
  b.toTell = [];
  const task = addTask(b, { kind: 'collect', item: '2', place: 'Custodial Closet', urgency: 'asked', source: 'asked', askedBy: SUNSHINE });
  b.gaveUp = { tool: 'collect_crate', what: 'crate #2', leftIn: null, liesIn: 'Central Primary Hallway', at: 5000 };
  pickupsAfterActing(b, { tool: 'collect_crate', number: 2, place: 'Custodial Closet' }, task, false);
  add('PLAY-12: lies_in from the server is the place told, not the body\'s room', b.toTell[0]?.line, 'I could not get crate #2 to the Custodial Closet. It is left in the Central Primary Hallway. Could you send someone else for it, please?');
}
{
  // The empty crate given up on the way back: the head is told once, and the errand stands.
  const b: any = makeBrain('Dortha Matthews', 'Janitor');
  b.location = 'Service Hallway';
  b.now = 5000;
  b.toTell = [];
  b.crateToReturn = true;
  const task = addTask(b, { kind: 'collect', item: '2', place: 'Custodial Closet', urgency: 'asked', source: 'asked', askedBy: SUNSHINE });
  task.unpacked = true;
  task.toldUnpacked = true;
  b.gaveUp = { tool: 'take_back', what: 'the large crate', leftIn: null, liesIn: 'Central Primary Hallway', at: 5000 };
  pickupsAfterActing(b, { tool: 'take_back' }, task, false);
  add('PLAY-12: the empty given up on the way back: its head is told where it lies', b.toTell.map((t: any) => [t.to, t.line, t.byPda]), [[SUNSHINE, 'I could not get the empty crate from #2 back to cargo. It is left in the Central Primary Hallway. I will try again.', true]]);
  add('PLAY-12: the errand stands, to try again, and the give-up is spent', [task.state, b.gaveUp], ['open', null]);
  add('PLAY-12: the head does not read it as a crate to send for', GAVE_UP_WORDS.test(b.toTell[0].line), false);
  b.gaveUp = { tool: 'take_back', what: 'the large crate', leftIn: 'Service Hallway', liesIn: null, at: 6000 };
  pickupsAfterActing(b, { tool: 'take_back' }, task, false);
  add('PLAY-12: given up again: nothing more is told', b.toTell.length, 1);
}
{
  const b: any = makeBrain('Dortha Matthews', 'Janitor');
  b.toTell = [];
  const task = addTask(b, { kind: 'collect', item: '2', place: 'Custodial Closet', urgency: 'asked', source: 'asked', askedBy: SUNSHINE });
  pickupsAfterActing(b, { tool: 'collect_crate' }, task, false);
  add('PLAY-12: a haul that failed without being given up: nothing told, the errand stands', [b.toTell.length, task.state], [0, 'open']);
}
{
  const hop: any = makeBrain(SUNSHINE, 'Head of Personnel');
  hop.metOnce = true;
  hop.nextMeetingAt = 1e9;
  hop.now = 5000;
  hop.toTell = [];
  hop.pdaPeople = [{ name: 'Dortha Matthews', job: 'Janitor' }, { name: HAYDEN.name, job: 'Janitor' }];
  hop.pickups = [{ number: 2, to: 'Dortha Matthews', room: 'Custodial Closet', what: 'janitorial supplies', at: 4900 }];
  HEAD_OF_PERSONNEL.readsMessage(hop, 'Dortha Matthews', 'I could not get crate #2 to the Custodial Closet. It is left in the Central Primary Hallway. Could you send someone else for it, please?', 5000, 'Janitor');
  add('PLAY-12: the head sends the next of its staff at once, not the one who gave up', hop.toTell.map((t: any) => [t.to, /crate #2 .*is waiting at cargo/.test(t.line), /Central Primary Hallway/.test(t.why)]), [[HAYDEN.name, true, true]]);
  hop.toTell = [];
  HEAD_OF_PERSONNEL.readsMessage(hop, 'Dortha Matthews', 'I could not get crate #2 to the Custodial Closet. It is left in the Central Primary Hallway.', 5010, 'Janitor');
  add('PLAY-12: word from someone it did not send for that crate is not acted on', hop.toTell.length, 0);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
