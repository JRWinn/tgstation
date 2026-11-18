// A small simulated station that runs the real window code (brain.ts and everything under it)
// end to end: it plays the server, answering each tool call the way the game would, and stands in
// for the LLM with a few fixed rules. It shows whether the code-driven routine gets a crew through
// their work without any judgement from a model.
//
//   bun run sim.ts            a quiet LLM (says nothing unless it has to): tests the fallbacks
//   bun run sim.ts chatty     an LLM that answers and agrees to orders
//   bun run sim.ts dead       no LLM at all
//   bun run sim.ts quiet solo      one janitor alone
//   bun run sim.ts quiet trapped   a janitor spawned behind a door it cannot open, with someone to ask
//   bun run sim.ts quiet orders    the Captain orders the technician to go and look at a room; a head of another department tries to
//   bun run sim.ts quiet rounds    a technician alone with nothing to do: it looks in on the rest of its department
//   bun run sim.ts quiet office    a mess in a room only cargo can open: found on a look round, a janitor sent for, let in, and let out
//   bun run sim.ts quiet alarm     someone pulls a fire alarm on a janitor: it resets it and gets on (alarmagain: it is pulled again at once)
//   bun run sim.ts quiet crew      the crew a round starts with: a Head of Personnel, two technicians and three janitors
//   bun run sim.ts quiet shutout   the head calls its meeting in a room the staff cannot get into: they answer by PDA
//   bun run sim.ts quiet vouch     two technicians: one sends for a janitor, the other asks what the janitor is doing in the bay
//   bun run sim.ts quiet waiting   a head orders a crate and nobody comes for it: the technicians take turns to look and remind, and hand it over when asked for by number
const MODE = process.argv[2] ?? 'quiet';
// BRAIN=<folder> runs another copy of the window code, to compare it with the one in the tree.
// The folder is given one spelling, or the same module is loaded twice under two names.
const PATH = await import('node:path');
const ROOT = PATH.resolve(process.env.BRAIN || `${import.meta.dir}/../../tgui/packages/tgui/interfaces/CrewBrain`) + PATH.sep;

// ---- a clock the simulation controls, so minutes pass in milliseconds
let clock = 1_000_000;
Date.now = () => clock;
// Timers set by the window code have to run on the same clock, or a four-second wait would take
// four real seconds while minutes of simulated time went by.
const realSetTimeout = globalThis.setTimeout;
const timers: { at: number; run: () => void }[] = [];
(globalThis as any).setTimeout = (run: () => void, delay = 0) => {
  if (delay <= 0) return realSetTimeout(run, 0);
  timers.push({ at: clock + delay, run });
  return 0;
};
function runTimers() {
  for (const timer of timers.filter((timer) => timer.at <= clock)) {
    timers.splice(timers.indexOf(timer), 1);
    timer.run();
  }
}

// ---- the stand-in LLM
const LLM_MS = 2500;
// Saying which job comes first is a much shorter answer.
const CHOICE_MS = 800;
let llmCalls = 0;
let choiceCalls = 0;
const choices: string[] = [];
(globalThis as any).fetch = async (_url: string, init: any) => {
  const body = JSON.parse(init.body);
  const properties = body.format.properties;
  // Asked which job comes first, it takes the last one listed. The jobs are listed in a different
  // order each time, so this is as often as not a job the code's own order would have left for later.
  if (properties.pick) {
    choiceCalls++;
    if (MODE === 'dead') throw new Error('Ollama is not running');
    const pick = properties.pick.enum.at(-1);
    const listed: string = body.messages[body.messages.length - 1].content;
    choices.push(`${stamp()} ${listed.split('\n').find((line) => line.startsWith(`${pick}: `))} (of ${properties.pick.enum.length})`);
    await new Promise((resolve) => setTimeout(resolve, CHOICE_MS));
    return { ok: true, json: async () => ({ message: { content: JSON.stringify({ why: 'that one first', pick }) }, done_reason: 'stop', prompt_eval_count: 250, eval_count: 20 }) };
  }
  llmCalls++;
  if (MODE === 'dead') throw new Error('Ollama is not running');
  const report: string = body.messages[body.messages.length - 1].content;
  // It is only asked what it will take on when there is something on offer.
  const moves: any[] = properties.move?.anyOf ?? [];
  const order = moves.find((move) => move.properties.tool.const === 'order');
  const heard = (report.match(/says: "[^"]*"/g) ?? []).join(' ').toLowerCase();
  const reply: any = properties.think ? { think: 'x' } : {};
  if (properties.feel) reply.feel = { person: properties.feel.properties.person.enum[0], change: 'same', why: '' };
  if (properties.work) reply.work = { what: 'nothing', where: properties.work.properties.where.enum.at(-1) };
  // Agrees to an order when asked for one; otherwise only answers when in a talkative mood.
  if (order && /order|suppl|crate/.test(heard)) {
    reply.say = 'I will see to it.';
    reply.move = { tool: 'order', crate: order.properties.crate.enum[0] };
  } else {
    // Quiet, it says nothing where that is allowed, and the least it can where it is not, which
    // is no line at all as far as the body is concerned: the plain line is said instead.
    // Code from before silence had a value of its own (run with BRAIN=) takes an empty line for it.
    const maySaySilent = !!properties.say.anyOf;
    const quiet = maySaySilent ? null : properties.say.minLength ? '...' : '';
    reply.say = MODE === 'chatty' && heard ? 'Right you are.' : quiet;
    if (properties.move) reply.move = { tool: 'stay' };
  }
  // The real one takes a few seconds to answer, and a lot can go wrong in those seconds.
  await new Promise((resolve) => setTimeout(resolve, LLM_MS));
  return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) }, done_reason: 'stop', prompt_eval_count: 900, eval_count: 40 }) };
};

const brainModule = await import(ROOT + 'brain');
const memoryModule = await import(ROOT + 'memory');

// ---- the station
type Mess = { id: number; name: string; scrub: boolean };
type Box = { name: string; contents: string[]; openedBy: Set<string>; mail?: string[]; crate?: boolean };
type Room = { kind: 'hallway' | 'room'; messes: Mess[]; items: string[]; boxes: Box[]; sink: boolean; floor?: { name: string; rubbish?: boolean }[] };
let messId = 0;
const mess = (name: string, scrub = false): Mess => ({ id: ++messId, name, scrub });
const rooms: Record<string, Room> = {
  'Arrival Shuttle Hallway': { kind: 'hallway', messes: [mess('dirt')], items: [], boxes: [{ name: 'emergency closet', contents: ['oxygen tank'], openedBy: new Set() }], sink: false },
  'Central Primary Hallway': { kind: 'hallway', messes: [mess('dirt'), mess('pool of oil', true)], items: [], boxes: [], sink: false },
  'Custodial Closet': { kind: 'room', messes: [mess('dirt'), mess('dirt')], items: ['mop', 'space cleaner'], boxes: [{ name: 'biohazard closet', contents: ['orange gloves'], openedBy: new Set() }], sink: true },
  Bar: { kind: 'room', messes: [mess('blood'), mess('vomit')], items: [], boxes: [], sink: false },
  'Cargo Lobby': { kind: 'room', messes: [mess('pool of oil', true)], items: [], boxes: [{ name: 'crate', contents: [], openedBy: new Set(), crate: true }], sink: false, floor: [{ name: 'candy wrapper', rubbish: true }, { name: 'wrench' }] },
  'Cargo Bay': { kind: 'room', messes: [mess('wrapping shreds')], items: [], boxes: [], sink: false, floor: [{ name: 'hand labeler' }] },
  // A room only a head's ID opens.
  'Staff Room': { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  // Where the Head of Personnel keeps to between errands.
  "Head of Personnel's Office": { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  // Part of cargo's department, behind a door only cargo staff can open. Nobody else ever sees inside.
  'Delivery Office': { kind: 'room', messes: [mess('dirt')], items: [], boxes: [], sink: false },
};
// The supply shuttle: at the station or away, and the crates aboard it. A crate is spent once it
// has nothing in it and no mail.
const shuttle = { docked: false, aboard: [] as Box[], sentWith: -1 };
const spent = (box: Box) => box.contents.length === 0 && !box.mail?.length;
const cargoCrates = () => [...rooms['Cargo Bay'].boxes, ...rooms['Cargo Lobby'].boxes].filter((box) => box.crate);
// Crew know their way around: the window is given the name of every room aboard.
memoryModule.setStationPlaces(Object.keys(rooms));
const EXPLORE_ORDER = ['Arrival Shuttle Hallway', 'Central Primary Hallway', 'Bar', 'Custodial Closet', 'Cargo Lobby'];

type Body = {
  id: string; name: string; job: string; room: string; holding: string[]; mopWet: boolean;
  visited: Set<string>; known: Set<string>; blocked: Map<string, number>; seenMesses: Map<number, string>; stubborn: Set<number>;
  busyUntil: number; busyText: string | null; walking: boolean; onDone: (() => void) | null;
  events: any[]; seq: number; handles: Map<string, string>; seen: Set<string>;
  explored: boolean; hasLocator: boolean; post: string | null; waysOut: number;
  orderPending: boolean; notices: { to: string; kind: 'arrived' | 'waiting'; numbers: number[]; what?: string }[]; dockAt: number; orderFor: string | null; orderCount: number; crateToReturn: Box | null; heldCheckAt: number; heldClaimSeen: number; office: string | null; mail: string[]; stillUntil: number; lastSaidAt: number; setOffTooSoon: number; saidWalking: number; doorHeldUntil: number; letOutUntil: number; inHandUntil: number; letInto: string | null; letInBy: string | null; atDoorOf: string | null; bayFails: number;
  log: string[]; said: string[];
};
const bodies: Body[] = [];
// The cargo counter is open: people in the bay and the lobby can see and hear each other.
const COUNTER = ['Cargo Bay', 'Cargo Lobby'];
// People who are not NPCs: they stand where they are put, and open a door when asked to.
const players: { name: string; job: string; room: string }[] = [];
// The rooms only cargo staff can open the doors of, and when each door stands open and for whom.
const LOCKED = ['Cargo Bay', 'Delivery Office'];
const doorState: Record<string, { from: number; until: number; for: string | null }> = Object.fromEntries(LOCKED.map((room) => [room, { from: Infinity, until: -Infinity, for: null }]));
const doorOpen = (room: string) => !!doorState[room] && clock >= doorState[room].from && clock <= doorState[room].until;
const bayDoorOpen = () => doorOpen('Cargo Bay');
// A fire alarm someone has pulled: the room it has sealed, how often it has been reset, and when it is pulled again.
let fireAlarm: string | null = null;
let alarmResets = 0;
let repullAt = Infinity;
let alarmPulled = false;
const knocks: string[] = [];
// A walk that would cross the fire doors of a sealed room ends at them.
const fireStops = (body: Body, place: string | null) => !!fireAlarm && ((body.room === fireAlarm) !== (place === fireAlarm));
// Only cargo staff can open the bay door. Anyone else in there is shut in until someone opens it.
// A body knows it is shut in after two ways out have failed, or one if it was let into the room.
const isShutIn = (body: Body) => body.waysOut >= 2 || (body.waysOut >= 1 && body.letInto === body.room);
// What takes a body off across the room or out of it, as against what it does where it stands.
const LEAVES = new Set(['throw_out', 'go_to', 'go_to_door', 'explore', 'release', 'collect_crate', 'check_held', 'unload', 'recycle', 'send_shuttle', 'order', 'take_back', 'pick_up', 'hand_mail', 'collect_mail', 'open_door']);
const shutInBay = (body: Body) => LOCKED.includes(body.room) && !body.post && !doorOpen(body.room);
// The people a body can see: those in its room, and across the open cargo counter.
const inSight = (body: Body, room: string) => body.room === room || (COUNTER.includes(body.room) && COUNTER.includes(room));
// Who the bay door opens for: cargo staff, and those whose rank lets them in anywhere. And who nobody lays a hand on.
const belongsInBay = (who: { job: string }) => /Cargo|Head of|Captain/.test(who.job);
const isCommand = (who: { job: string }) => /Head of|Captain/.test(who.job);
// Who answers to whom: everyone to the Captain, and the janitors to the Head of Personnel.
const answersTo = (body: { job: string }, who: { job: string }) => who.job === 'Captain' || (who.job === 'Head of Personnel' && body.job === 'Janitor');
// Someone who is not an NPC says something, to whoever can hear it.
function playerSays(name: string, text: string) {
  const player = players.find((other) => other.name === name)!;
  for (const other of bodies) if (inSight(other, player.room)) emit(other, 'speech_heard', `${name} says: "${text}"`, { handle: handleFor(other, name), speaker: name, source: 'person', distance: 2, message: text });
}
// The last PDA message a technician sent a janitor: one call from the post is enough.
let janitorCall: { by: string; at: number } | null = null;
const putOut: string[] = [];
const tooSoonSteps: string[] = [];
const handed: string[] = [];
const opened: string[] = [];
const putAway: string[] = [];
const HOP_OFFICE = "Head of Personnel's Office";
// What was ordered and for whom; where each crate was unpacked and by whom; how many came back; who was at the meeting when the room was asked.
const ordersPlaced: string[] = [];
const tippedOut: string[] = [];
const unpackedBy: string[] = [];
let cratesTakenBack = 0;
// Crates cargo is holding for collection, as the server keeps them: known by the number on the manifest.
type Held = { box: Box; number: number; for: string | null; what: string; heldSince: number; reminders: number; out: boolean; takenBy: string | null };
let held: Held[] = [];
let nextOrderNumber = 4521;
// Which crates were brought out to the lobby and for whom, and each time someone said they were going to look over what is waiting.
const released: string[] = [];
const claims: { by: string; at: number }[] = [];
let heldClaimAt = 0;
const HELD_CHECK_EVERY = 300_000;
const HELD_CHECK_SPREAD = 60_000;
const HELD_OVERDUE = 300_000;
const HELD_REMINDERS = 3;
const HELD_CLAIM = 'I am going to check to see what crates are still here.';
// The crates still held, with those that have come off the shuttle noted as waiting since then.
function heldCrates(): Held[] {
  for (const entry of held) if (!entry.heldSince && !shuttle.aboard.includes(entry.box)) entry.heldSince = clock;
  return held;
}
const heldWaiting = () => heldCrates().filter((entry) => entry.heldSince && !entry.takenBy && entry.reminders < HELD_REMINDERS);
const heldOverdue = () => heldWaiting().filter((entry) => clock - entry.heldSince >= HELD_OVERDUE);
const heldWait = () => HELD_CHECK_EVERY + (Math.random() * 2 - 1) * HELD_CHECK_SPREAD;
// Whether it is this technician's moment to go and look: each counts down by itself, and all start again when one says it is going.
function heldCheckDue(body: Body): boolean {
  if (!body.post) return false;
  const waiting = heldWaiting();
  if (!waiting.length) { body.heldCheckAt = 0; return false; }
  if (heldClaimAt && heldClaimAt !== body.heldClaimSeen) { body.heldClaimSeen = heldClaimAt; body.heldCheckAt = heldClaimAt + heldWait(); }
  if (!body.heldCheckAt) body.heldCheckAt = clock + heldWait();
  if (clock < body.heldCheckAt) return false;
  const oldest = Math.min(...waiting.map((entry) => entry.heldSince));
  if (clock - oldest < HELD_OVERDUE) { body.heldCheckAt = oldest + HELD_OVERDUE + Math.random() * HELD_CHECK_SPREAD; return false; }
  return true;
}
// Something the body says of its own accord as part of its work, in fixed words. It stops for it.
function bodySays(body: Body, text: string) {
  body.said.push(text); body.stillUntil = Math.max(body.stillUntil, clock + 2500);
  for (const other of bodies) if (other !== body && near(other, body)) emit(other, 'speech_heard', `${body.name} says: "${text}"`, { handle: handleFor(other, body.name), speaker: body.name, source: 'person', distance: 1, message: text });
}
const written = (numbers: number[]) => `crate${numbers.length === 1 ? '' : 's'} ${numbers.map((number) => `#${number}`).join(' and ')}`;
const atMeeting = new Set<string>();
const staffRoomTries: string[] = [];
const near = (a: Body, b: Body) => a.room === b.room || (COUNTER.includes(a.room) && COUNTER.includes(b.room));
function spawn(name: string, job: string): Body {
  const body: Body = { id: `npc${bodies.length + 1}`, name, job, room: 'Arrival Shuttle Hallway', holding: [], mopWet: false, visited: new Set(), known: new Set(['Cargo Lobby']), blocked: new Map(), seenMesses: new Map(), stubborn: new Set(), busyUntil: 0, busyText: null, walking: false, onDone: null, events: [], seq: 0, handles: new Map(), seen: new Set(), explored: false, waysOut: 0, hasLocator: job === 'Janitor', post: job === 'Cargo Technician' ? 'Cargo Bay' : null, orderPending: false, notices: [], dockAt: 0, orderFor: null, orderCount: 1, crateToReturn: null, heldCheckAt: 0, heldClaimSeen: 0, office: job === 'Head of Personnel' ? HOP_OFFICE : null, mail: [], stillUntil: 0, lastSaidAt: -Infinity, setOffTooSoon: 0, saidWalking: 0, doorHeldUntil: 0, letOutUntil: 0, inHandUntil: 0, letInto: null, letInBy: null, atDoorOf: null, bayFails: 0, log: [], said: [] };
  if (body.post) body.known.add(body.post);
  // A head starts the shift in its office.
  if (body.office) { body.room = body.office; body.known.add(body.office); }
  bodies.push(body);
  emit(body, 'knowledge', 'You know the way to the Cargo Lobby.', { places: [...body.known].map((place) => ({ place, things: [] })) });
  return body;
}
let serverNow = 10_000;
const stamp = () => new Date(clock).toISOString().slice(11, 19);
function emit(body: Body, kind: string, text: string, details: any = {}) {
  body.events.push({ seq: ++body.seq, time: stamp(), at: serverNow, kind, text, details });
  if (body.events.length > 30) body.events.shift();
}
const result = (body: Body, tool: string, ok: boolean, text: string, extra: any = {}) => emit(body, 'action_result', text, { tool, ok: ok ? 1 : 0, ...extra });
function handleFor(observer: Body, other: string) {
  if (!observer.handles.has(other)) observer.handles.set(other, `p${observer.handles.size + 1}`);
  return observer.handles.get(other)!;
}
const toolOf = (body: Body) => (body.holding.includes('space cleaner') ? 'space cleaner' : body.holding.includes('soap') ? 'soap' : null);
const mopWorks = (body: Body) => body.holding.includes('mop') && (body.mopWet || rooms[body.room].sink);
const cleaningTool = (body: Body) => toolOf(body) ?? (mopWorks(body) ? 'mop' : null);
// A spray only washes. Soap and a wet mop scrub as well.
const canShift = (body: Body, m: Mess, held = cleaningTool(body) ?? (body.holding.includes('mop') ? 'mop' : null)) => !body.stubborn.has(m.id) && (held === null || held !== 'space cleaner' || !m.scrub);
const allMesses = () => Object.values(rooms).flatMap((room) => room.messes);

function busy(body: Body, seconds: number, text: string, walking: boolean, done: () => void) {
  body.busyUntil = clock + seconds * 1000; body.busyText = text; body.walking = walking; body.onDone = done;
}
function arrive(body: Body, place: string, tool: string) {
  body.room = place; body.waysOut = 0; body.letOutUntil = 0; if (body.letInto !== place) { body.letInto = null; body.letInBy = null; } body.visited.add(place); body.known.add(place);
  body.atDoorOf = null;
  // The door is shut behind whoever it was opened for, the moment they are through.
  for (const state of Object.values(doorState)) if (state.for === body.name) { state.for = null; state.until = clock; }
  result(body, tool, true, `You arrive in ${place}.`, { place });
}

// ---- what the server does with each tool call
function toolCall(body: Body, tool: string, args: any) {
  // Standing still to talk is not a step of anyone's work, so it is not logged as one.
  if (tool === 'hold') { body.stillUntil = Math.max(body.stillUntil, clock + 4000); return; }
  body.log.push(`${stamp()} ${body.room.padEnd(24)} ${tool}${Object.keys(args).length ? ' ' + JSON.stringify(args) : ''}`);
  // Someone has it by the arm. It can speak, and that is all.
  if (clock < body.inHandUntil && tool !== 'say') return result(body, tool, false, 'Someone has you by the arm and is walking you out.');
  // What it says it will do and then at once does is one act. Wandering off after speaking is another.
  if (LEAVES.has(tool) && clock > body.lastSaidAt && clock - body.lastSaidAt < 2000) { body.setOffTooSoon++; tooSoonSteps.push(`${stamp()} ${body.name}: ${tool} ${JSON.stringify(args)} ${clock - body.lastSaidAt} ms after "${body.said.at(-1)}"`); }
  const room = rooms[body.room];
  switch (tool) {
    case 'say': {
      body.said.push(args.text);
      // Said while walking, with the walk not held for it, is said over the shoulder on the way out.
      if (body.walking && clock >= body.stillUntil) body.saidWalking++;
      body.lastSaidAt = clock; body.stillUntil = Math.max(body.stillUntil, clock + 2500);
      // In the shut-in case, the player asked about the door goes and opens it, and it stays open a little while.
      if (VARIANT === 'trapped' && /door/i.test(args.text) && players.some((player) => player.room === body.room)) { doorState['Cargo Bay'].from = clock + 4000; doorState['Cargo Bay'].until = clock + 30000; }
      if (body.office && /need anything/i.test(args.text)) for (const other of bodies) if (other !== body && other.room === body.room) atMeeting.add(other.name);
      for (const other of bodies) if (other !== body && near(other, body)) emit(other, 'speech_heard', `${body.name} says: "${args.text}"`, { handle: handleFor(other, body.name), speaker: body.name, source: 'person', distance: 1, message: args.text });
      return;
    }
    case 'locate':
      body.known.add('Custodial Closet');
      return result(body, 'locate', true, "Your PDA's custodial locator shows the cleaning gear is kept in Custodial Closet.", { places: [{ place: 'Custodial Closet', things: ['mop'] }] });
    case 'go_to':
      if (!(args.place in rooms)) return result(body, 'go_to', false, 'You do not know of anywhere aboard by that name.');
      if (args.place === body.room) return result(body, 'go_to', true, `You are already in ${args.place}.`, { place: args.place });
      if (shutInBay(body)) return busy(body, 3, `walking to ${args.place}`, true, () => { body.waysOut++; result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
      // Fire doors shut by an alarm stop anyone walking into or out of the room they seal.
      if (fireStops(body, args.place)) { const sealed = fireAlarm!; return busy(body, 3, `walking to ${args.place}`, true, () => result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. The fire doors are shut in ${sealed}. You are in ${body.room}.`, { fire_doors: sealed, alarm_pulled: 1 })); }
      // The staff room opens to a head and nobody else.
      if (args.place === 'Staff Room' && !body.office) return busy(body, 3, `walking to ${args.place}`, true, () => { body.blocked.set(args.place, clock); staffRoomTries.push(body.name); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
      // The delivery office is locked to everyone but cargo staff, like the bay.
      if (args.place === 'Delivery Office' && !body.post && !doorOpen('Delivery Office')) return busy(body, 3, `walking to ${args.place}`, true, () => { body.blocked.set(args.place, clock); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through.`); });
      // Only cargo staff have the access to get into the bay. Anyone else finds no way through.
      if (args.place === 'Cargo Bay' && !body.post && !bayDoorOpen()) {
        return busy(body, 3, `walking to ${args.place}`, true, () => {
          body.blocked.set(args.place, clock); body.bayFails++;
          result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through.`);
        });
      }
      return busy(body, 6, `walking to ${args.place}`, true, () => arrive(body, args.place, 'go_to'));
    case 'explore': {
      if (fireAlarm && body.room === fireAlarm) return result(body, 'explore', false, `You stop on the way to somewhere new: there is no way through. The fire doors are shut in ${fireAlarm}. You are in ${body.room}.`, { fire_doors: fireAlarm, alarm_pulled: 1 });
      if (shutInBay(body)) { body.waysOut++; return result(body, 'explore', false, 'You look for a way to somewhere new but find none from here.'); }
      const next = EXPLORE_ORDER.find((place) => !body.visited.has(place));
      if (!next) { body.explored = true; return result(body, 'explore', false, 'There is nowhere new that you can reach.'); }
      return busy(body, 6, 'walking off to explore', true, () => arrive(body, next, 'explore'));
    }
    case 'search': {
      const unopened = room.boxes.filter((box) => !box.openedBy.has(body.id));
      if (!unopened.length) return result(body, 'search', false, 'There is no storage here that you have not already looked inside.');
      return busy(body, 2 * unopened.length, 'looking through the storage here', false, () => {
        for (const box of unopened) {
          box.openedBy.add(body.id);
          emit(body, 'storage_seen', `You look inside the ${box.name}.`, { place: body.room, container: box.name, state: 'open', contents: box.contents.map((name) => ({ name, count: 1 })) });
        }
        result(body, 'search', true, `You have looked through the storage in ${body.room}.`);
      });
    }
    case 'pick_up': {
      const loose = room.items.indexOf(args.item);
      const box = Object.values(rooms).flatMap((r) => r.boxes).find((b) => b.openedBy.has(body.id) && b.contents.includes(args.item));
      if (loose < 0 && !box) return result(body, 'pick_up', false, 'You cannot see one, and you do not remember where one is kept.');
      if (body.holding.length >= 2) return result(body, 'pick_up', false, 'Your hands are full.');
      return busy(body, 2, `going to get ${args.item}`, false, () => {
        if (loose >= 0 && room.items[loose] === args.item) room.items.splice(loose, 1);
        else if (box?.contents.includes(args.item)) box.contents.splice(box.contents.indexOf(args.item), 1);
        else return result(body, 'pick_up', false, `The ${args.item} is not where you saw it.`);
        body.holding.push(args.item);
        result(body, 'pick_up', true, `You pick up the ${args.item}.`);
        // The game wets a mop picked up beside a sink.
        if (args.item === 'mop' && rooms[body.room].sink) body.mopWet = true;
      });
    }
    case 'clean': {
      if (!cleaningTool(body)) return result(body, 'clean', false, 'You have nothing to clean with.');
      if (body.holding.includes('mop') && !toolOf(body) && !body.mopWet) body.mopWet = true;
      const here = room.messes.filter((m) => canShift(body, m));
      if (!here.length) return result(body, 'clean', false, `There is no mess here that your ${cleaningTool(body)} will shift.`);
      return busy(body, 3 * here.length, 'cleaning up the mess here', false, () => {
        room.messes = room.messes.filter((m) => !here.includes(m));
        result(body, 'clean', true, `You clean up ${here.length} mess${here.length === 1 ? '' : 'es'} in ${body.room}.`, { place: body.room });
      });
    }
    case 'order':
      if (body.orderPending) return result(body, 'order', false, 'You already have an order on the go.');
      return busy(body, 4, 'going to the supply console to place an order', false, () => {
        body.orderPending = true; body.dockAt = clock + 20_000;
        body.orderFor = [...body.handles.entries()].find(([, handle]) => handle === args.for)?.[0] ?? null;
        // One order may be for several crates.
        body.orderCount = Math.max(1, Math.min(4, Math.round(Number(args.count)) || 1));
        ordersPlaced.push(`${body.orderCount} for ${body.orderFor}`);
        result(body, 'order', true, `You order the ${args.crate} for ${body.orderFor}.`);
      });
    case 'release': {
      // A crate that is being held is brought out to the lobby for whoever came with its number. Cargo staff only.
      if (!body.post) return result(body, 'release', false, "Handing out the crates that are being held is cargo's job.");
      const entry = heldCrates().find((it) => it.number === Number(args.number));
      if (!entry) return result(body, 'release', false, 'You are not holding a crate by that number.', { no_such_crate: 1 });
      if (entry.out) return result(body, 'release', true, `Crate #${entry.number} has been put out already. It is in Cargo Lobby.`, { place: 'Cargo Lobby', number: entry.number });
      if (entry.takenBy) return result(body, 'release', false, `${entry.takenBy} is already taking crate #${entry.number} away.`);
      const forWhom = [...body.handles.entries()].find(([, handle]) => handle === args.person)?.[0] ?? null;
      return busy(body, 6, 'hauling a crate out to Cargo Lobby for whoever came for it', true, () => {
        // It may still be aboard the shuttle, if nobody has unloaded it yet.
        for (const from of [shuttle.aboard, rooms['Cargo Bay'].boxes]) if (from.includes(entry.box)) from.splice(from.indexOf(entry.box), 1);
        rooms['Cargo Lobby'].boxes.push(entry.box); entry.out = true; body.room = 'Cargo Lobby'; released.push(`${entry.number} for ${forWhom}`);
        result(body, 'release', true, `You bring crate #${entry.number} out to Cargo Lobby and leave it there${forWhom ? ` for ${forWhom}` : ''} to take away.`, { place: 'Cargo Lobby', number: entry.number });
      });
    }
    case 'collect_crate': {
      // Anyone sent for a crate hauls it from the lobby to a room their own ID gets them into, and unpacks it there.
      const entry = heldCrates().find((it) => it.number === Number(args.number));
      if (!entry || !entry.out) return result(body, 'collect_crate', false, 'Cargo has not put a crate by that number out for you.', { no_such_crate: entry ? 0 : 1 });
      if (entry.takenBy && entry.takenBy !== body.name) return result(body, 'collect_crate', false, `${entry.takenBy} is already taking crate #${entry.number} away.`, { no_such_crate: 1 });
      if (!(args.place in rooms)) return result(body, 'collect_crate', false, 'You do not know of anywhere aboard by that name.');
      if ((LOCKED.includes(args.place) && !body.post) || (args.place === 'Staff Room' && !body.office)) return result(body, 'collect_crate', false, `You cannot get into ${args.place} yourself, so you cannot take a crate there.`);
      entry.takenBy = body.name;
      return busy(body, 8, `hauling a crate you collected to ${args.place}`, true, () => {
        const lobby = rooms['Cargo Lobby'].boxes;
        if (lobby.includes(entry.box)) lobby.splice(lobby.indexOf(entry.box), 1);
        const names = [...entry.box.contents];
        rooms[args.place].items.push(...names); entry.box.contents = []; tippedOut.push(args.place); unpackedBy.push(body.name);
        body.room = args.place; body.visited.add(args.place); body.known.add(args.place); body.crateToReturn = entry.box; held = held.filter((it) => it !== entry);
        result(body, 'collect_crate', true, `You haul the crate #${entry.number} to ${args.place} and unpack it there: ${names.join(', ')}. The empty crate is yours to take back to cargo.`, { place: args.place, number: entry.number });
      });
    }
    case 'take_back': {
      const crate = body.crateToReturn;
      if (!crate) return result(body, 'take_back', false, 'You have no empty crate to take back.');
      // Cargo staff take it into the bay. Anyone else leaves it in the lobby, which is as far as they can get.
      const where = body.post ? 'Cargo Bay' : 'Cargo Lobby';
      return busy(body, 6, `hauling an empty crate back to ${where}`, true, () => {
        rooms[where].boxes.push(crate);
        body.room = where; body.crateToReturn = null; cratesTakenBack++;
        result(body, 'take_back', true, `You bring the empty crate back to ${where}. It can go back on the supply shuttle.`, { place: where });
      });
    }
    case 'check_held': {
      // Its turn to see which crates are still waiting. It says so in fixed words, which is what starts everyone at the post counting again.
      if (!body.post) return result(body, 'check_held', false, "Keeping track of the crates waiting to be collected is cargo's job.");
      if (!heldCheckDue(body)) return result(body, 'check_held', false, 'There is no call to look over the crates waiting to be collected just now.');
      heldClaimAt = clock; claims.push({ by: body.name, at: clock });
      bodySays(body, HELD_CLAIM);
      return busy(body, 4, 'going to see what crates are still waiting to be collected', false, () => {
        const owed = new Map<string, number[]>();
        for (const entry of heldOverdue()) { entry.reminders++; owed.set(entry.for ?? 'nobody you know of', [...(owed.get(entry.for ?? 'nobody you know of') ?? []), entry.number]); }
        body.room = 'Cargo Bay';
        if (!owed.size) return result(body, 'check_held', true, 'You look over the bay. Nothing has been waiting long enough to chase anyone about.');
        for (const [to, numbers] of owed) body.notices.push({ to, kind: 'waiting', numbers });
        const parts = [...owed].map(([to, numbers]) => `${written(numbers)} for ${to}`).join(', ');
        bodySays(body, `Still waiting: ${parts.replace(/#/g, '')}. I will send word.`);
        result(body, 'check_held', true, `You look over the crates waiting to be collected. Still here: ${parts}. Whoever ordered them is to be reminded by PDA.`);
      });
    }
    case 'message': {
      const target = bodies.find((other) => other.name === args.person);
      if (target?.job === 'Janitor' && body.post) janitorCall = { by: body.name, at: clock };
      // The game cuts a PDA message off at two hundred characters.
      const text = String(args.text).slice(0, 200);
      if (target) emit(target, 'pda_message', `Your PDA buzzes with a message from ${body.name}: "${text}"`, { speaker: body.name, job: body.job, message: text });
      // Having tried is enough: whoever it owed word about their crates is not owed it twice.
      const owedAt = body.notices.findIndex((notice) => notice.to === args.person);
      if (owedAt >= 0) body.notices.splice(owedAt, 1);
      return result(body, 'message', true, `You send ${args.person} a PDA message.`);
    }
    case 'go_to_door': {
      // Into a room: it walks to the outside of that room's door, which for the bay is in the lobby.
      // With no room named: it walks to the door out of the room it is in.
      const place: string | undefined = args.place;
      if (place && !(place in rooms)) return result(body, 'go_to_door', false, 'You do not know of anywhere aboard by that name.');
      if (place && body.room === place) return result(body, 'go_to_door', true, `You are already in ${place}.`, { place });
      const outside = place && LOCKED.includes(place) ? 'Cargo Lobby' : body.room;
      // Shut in a room it cannot open the door of, it cannot walk to the door of some other room: it has to be let out first.
      if (place && body.room !== outside && shutInBay(body)) return busy(body, 3, `walking to the door into ${place}`, true, () => { body.waysOut++; result(body, 'go_to_door', false, `You could not get to the door into ${place}: there is no way through. You are in ${body.room}.`, { place: body.room }); });
      return busy(body, place && body.room !== outside ? 6 : 2, `walking to the door ${place ? 'into ' + place : 'out of ' + body.room}`, true, () => {
        if (place && body.room !== outside) { body.room = outside; body.visited.add(outside); body.waysOut = 0; }
        body.atDoorOf = place ?? body.room;
        result(body, 'go_to_door', true, `You are at the door ${place ? 'into ' + place : 'out of ' + body.room}.`, { place: body.room });
      });
    }
    case 'open_door': {
      const name = [...body.handles.entries()].find(([, handle]) => handle === args.person)?.[0] ?? args.name;
      const them = bodies.find((other) => other.name === name) ?? players.find((other) => other.name === name);
      const room: string = args.place && LOCKED.includes(args.place) ? args.place : body.post!;
      if (!body.post || !them) return result(body, 'open_door', false, 'You do not know who that is.');
      const inside = them.room === room;
      // Someone at the door, or shut inside, need not be in sight: the door hides them.
      const atTheDoor = (them as Body).atDoorOf === room;
      if (!inSight(body, them.room) && !inside && !atTheDoor) return result(body, 'open_door', false, 'You cannot see that person.');
      if (!inside && !(them.job === 'Janitor' && rooms[room].messes.length > 0)) return result(body, 'open_door', false, `You have no call to let ${them.name} into ${room}.`);
      return busy(body, 3, 'going to open the door for someone', false, () => {
        doorState[room] = { from: clock, until: clock + 15000, for: them.name }; opened.push(`${inside ? 'out' : 'in'}:${them.name}${room === body.post ? '' : '@' + room}`);
        const their = bodies.find((other) => other.name === name);
        if (their) {
          their.blocked.clear(); their.waysOut = 0; their.doorHeldUntil = clock + 15000; their.known.add(room);
          if (!inside) { their.letInto = room; their.letInBy = body.name; } else { their.letOutUntil = clock + 15000; }
          emit(their, 'knowledge', `${body.name} opens the door ${inside ? 'out of' : 'into'} ${room} and holds it for you.`, { places: [{ place: room, things: [] }], door_held: 1, ...(inside ? { out_to: 'Cargo Lobby' } : {}) });
        }
        result(body, 'open_door', true, `You open the door for ${them.name} and hold it.`);
      });
    }
    case 'knock': {
      // A knock is heard by whoever is near the door, on either side of it. It does not say who.
      if (!body.atDoorOf) return result(body, 'knock', false, 'You are not standing at a door to knock at.');
      knocks.push(`${body.name}@${body.atDoorOf}`);
      for (const other of bodies) if (other !== body && (other.room === body.atDoorOf || other.room === body.room || COUNTER.includes(other.room))) emit(other, 'knowledge', `Someone is knocking at the door of ${body.atDoorOf}.`, { knock: body.atDoorOf, knock_from_inside: body.room === body.atDoorOf ? 1 : 0 });
      return result(body, 'knock', true, `You knock at the door of ${body.atDoorOf}.`);
    }
    case 'reset_alarm': {
      if (fireAlarm !== args.place) return result(body, 'reset_alarm', true, `The fire alarm in ${args.place} is off already.`, { place: args.place });
      if (body.room !== fireAlarm) return result(body, 'reset_alarm', false, `You cannot get to a fire alarm for ${args.place}.`, { alarm_out_of_reach: args.place });
      return busy(body, 4, 'going to reset a fire alarm someone has pulled', false, () => {
        fireAlarm = null; alarmResets++;
        if (VARIANT === 'alarmagain') repullAt = clock + 5000;
        result(body, 'reset_alarm', true, `You reset the fire alarm in ${args.place}. The fire doors there are opening.`);
      });
    }
    case 'throw_out': {
      const name = [...body.handles.entries()].find(([, handle]) => handle === args.person)?.[0];
      const them = bodies.find((other) => other.name === name) ?? players.find((other) => other.name === name);
      if (!body.post || !them || !inSight(body, them.room)) return result(body, 'throw_out', false, 'You cannot see that person.');
      if (them.room !== body.post) return result(body, 'throw_out', true, `${them.name} is not in ${body.post} any more.`);
      if (belongsInBay(them)) return result(body, 'throw_out', false, `${them.name} has every right to be in ${body.post}.`);
      if (isCommand(them)) return result(body, 'throw_out', false, `${them.name} outranks you. You do not lay a hand on them.`);
      const their = bodies.find((other) => other.name === name);
      if (their) { their.inHandUntil = clock + 8000; their.busyText = null; their.walking = false; their.onDone = null; emit(their, 'knowledge', `${body.name} takes you by the arm and starts walking you out of ${body.post}.`, { in_hand: 1 }); }
      return busy(body, 6, `walking someone out of ${body.post}`, true, () => {
        them.room = 'Cargo Lobby'; putOut.push(them.name);
        if (their) {
          their.inHandUntil = 0; their.waysOut = 0; their.atDoorOf = null; their.letInto = null; their.letInBy = null; their.blocked.set(body.post!, clock);
          emit(their, 'knowledge', `${body.name} has walked you out of ${body.post} and let go of you. You had no business in there.`, { put_out_of: body.post });
        }
        result(body, 'throw_out', true, `You walk ${them.name} out of ${body.post} and let go of them.`);
      });
    }
    case 'unload': {
      const crate = shuttle.docked ? shuttle.aboard.find((box) => !spent(box)) : undefined;
      if (!crate) return result(body, 'unload', false, 'There is nothing left aboard the supply shuttle to unload.');
      return busy(body, 6, 'hauling a crate off the supply shuttle', true, () => {
        // A workmate may have had it off first.
        if (!shuttle.aboard.includes(crate)) return result(body, 'unload', false, 'There is nothing left aboard the supply shuttle to unload.');
        shuttle.aboard.splice(shuttle.aboard.indexOf(crate), 1); rooms['Cargo Bay'].boxes.push(crate); body.room = 'Cargo Bay';
        result(body, 'unload', true, `You haul the ${crate.name} off the supply shuttle and leave it in Cargo Bay.`, { place: 'Cargo Bay' });
      });
    }
    case 'collect_mail': {
      const crate = rooms['Cargo Bay'].boxes.find((box) => box.mail?.length);
      if (!crate) return result(body, 'collect_mail', false, 'There is no mail waiting to be taken out of a crate.');
      return busy(body, 3, 'going to take the mail out of its crate', false, () => {
        body.mail.push(...crate.mail!); crate.mail = [];
        result(body, 'collect_mail', true, `You take the mail out of the ${crate.name}: for ${body.mail.join(', ')}.`);
      });
    }
    case 'hand_mail': {
      const name = [...body.handles.entries()].find(([, handle]) => handle === args.person)?.[0];
      const player = players.find((other) => other.name === name && inSight(body, other.room));
      if (!player || !body.mail.includes(player.name)) return result(body, 'hand_mail', false, 'You are not holding any mail for them.');
      return busy(body, 4, 'taking someone their mail', true, () => {
        body.room = player.room; body.mail = body.mail.filter((whose) => whose !== player.name); handed.push(player.name);
        result(body, 'hand_mail', true, `You hand ${player.name} the mail that came for them.`);
      });
    }
    case 'recycle': {
      const room = Object.values(rooms).find((r) => r.boxes.some((box) => box.crate && spent(box)) && (r === rooms['Cargo Bay'] || r === rooms['Cargo Lobby']));
      const crate = room?.boxes.find((box) => box.crate && spent(box));
      if (!shuttle.docked || !room || !crate) return result(body, 'recycle', false, 'There is no empty crate here to send back.');
      return busy(body, 6, 'hauling an empty crate aboard the supply shuttle', true, () => {
        // A workmate may have put it aboard first, or the shuttle may have gone.
        if (!room.boxes.includes(crate) || !shuttle.docked) return result(body, 'recycle', false, 'There is no empty crate here to send back.');
        room.boxes.splice(room.boxes.indexOf(crate), 1); shuttle.aboard.push(crate); body.room = 'Cargo Bay';
        result(body, 'recycle', true, `You put the empty ${crate.name} aboard the supply shuttle to go back.`);
      });
    }
    case 'tidy': {
      const where = ['Cargo Bay', 'Cargo Lobby'].find((name) => rooms[name].floor?.length);
      if (!body.post || !where) return result(body, 'tidy', false, 'There is nothing lying about that you have anywhere to put.');
      return busy(body, 5, 'putting away something that was lying about', true, () => {
        // A workmate may have put it away first.
        if (!rooms[where].floor?.length) return result(body, 'tidy', false, 'There is nothing lying about that you have anywhere to put.');
        const thing = rooms[where].floor!.shift()!; body.room = where; putAway.push(`${thing.name} ${thing.rubbish ? 'in the bin' : 'on a table'}`);
        result(body, 'tidy', true, `You put the ${thing.name} ${thing.rubbish ? 'in the disposal bin' : 'on the table'} in ${where}.`);
      });
    }
    case 'send_shuttle':
      if (!shuttle.docked) return result(body, 'send_shuttle', false, 'The supply shuttle is not here to send back.');
      if (shuttle.aboard.some((box) => !spent(box))) return result(body, 'send_shuttle', false, 'There is still something aboard that has to come off first.');
      return busy(body, 4, 'going to the supply console to send the shuttle back', false, () => {
        // A workmate may have sent it first.
        if (!shuttle.docked) return result(body, 'send_shuttle', false, 'The supply shuttle is not here to send back.');
        shuttle.sentWith = shuttle.aboard.length; shuttle.docked = false; shuttle.aboard = []; body.room = 'Cargo Bay';
        result(body, 'send_shuttle', true, 'You send the supply shuttle back.');
      });
    default:
      return result(body, tool, false, 'Your body does not know how to do that.');
  }
}
// TRACE=<part of a name> keeps what that NPC's brain decided, and why, to print at the end.
const trace: string[] = [];
brainModule.setAct((action: string, payload: any) => {
  if (action === 'brain_log' && payload.kind === 'decision' && process.env.TRACE) {
    const who = bodies.find((b) => b.id === payload.npc);
    if (who?.name.includes(process.env.TRACE)) trace.push(`${stamp()} ${who.name}: ${String(payload.trigger).replace(/\s+/g, ' ').slice(0, 260)}  ->  ${String(payload.reply).replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  if (action !== 'tool_call') return;
  const body = bodies.find((b) => b.id === payload.npc)!;
  toolCall(body, payload.tool, payload.args ?? {});
});

// ---- what the server tells the window about each body, once a second
function uiData(body: Body) {
  const room = rooms[body.room];
  body.visited.add(body.room); body.known.add(body.room);
  for (const m of room.messes) body.seenMesses.set(m.id, body.room);
  // Across the counter, a body in the lobby can see the bay's floor.
  if (body.room === 'Cargo Lobby') for (const m of rooms['Cargo Bay'].messes) body.seenMesses.set(m.id, 'Cargo Bay');
  // And from the post, the lobby's.
  if (body.room === 'Cargo Bay') for (const m of rooms['Cargo Lobby'].messes) body.seenMesses.set(m.id, 'Cargo Lobby');
  // A room it lately failed to get into is left alone for five minutes.
  const shut = (place: string) => clock - (body.blocked.get(place) ?? -Infinity) < 300_000;
  for (const [id, place] of body.seenMesses) if (inSight(body, place) && !rooms[place].messes.some((m) => m.id === id)) body.seenMesses.delete(id);
  const others: { name: string; job: string }[] = [...bodies.filter((other) => other !== body && near(other, body)), ...players.filter((player) => inSight(body, player.room))];
  for (const other of others) if (!body.seen.has(other.name)) { body.seen.add(other.name); emit(body, 'person_in_view', `${other.name}, ${other.job}, comes into view 2 tiles away.`, { handle: handleFor(body, other.name), name: other.name, job: other.job }); }
  for (const name of [...body.seen]) if (!others.some((other) => other.name === name)) body.seen.delete(name);
  const remembered = [...body.seenMesses.entries()].map(([id, place]) => ({ place, m: allMesses().find((x) => x.id === id) })).filter((x) => x.m);
  const counts = new Map<string, number>();
  for (const m of room.messes) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  const unopened = room.boxes.filter((box) => !box.openedBy.has(body.id)).length;
  return {
    id: body.id, name: body.name, job: body.job, awake: 1, location: body.room, place_kind: room.kind,
    people_in_view: others.map((other) => ({ handle: handleFor(body, other.name), name: other.name, job: other.job, place: (other as any).room, in_post: body.post && (other as any).room === body.post ? 1 : 0, belongs: body.post && belongsInBay(other) ? 1 : 0, command: isCommand(other) ? 1 : 0, superior: answersTo(body, other) ? 1 : 0 })),
    things_in_view: [...[...counts].map(([name, count]) => ({ name, count, kind: 'mess' })), ...room.items.map((name) => ({ name, count: 1, kind: 'item' })), ...(room.sink ? [{ name: 'sink', count: 1, kind: 'structure' }] : [])],
    holding: body.holding, cleaning_tool: cleaningTool(body), has_locator: body.hasLocator ? 1 : 0,
    cleanable_messes: cleaningTool(body) ? [...new Set(room.messes.filter((m) => canShift(body, m)).map((m) => m.name))] : [],
    mess_places: [...new Set(remembered.map((x) => x.place))],
    workable_mess_places: [...new Set(remembered.filter((x) => canShift(body, x.m!) && !shut(x.place)).map((x) => x.place))],
    mop_needs_water: body.holding.includes('mop') && !toolOf(body) && !body.mopWet ? 1 : 0, sink_in_view: room.sink ? 1 : 0, shut_in: isShutIn(body) ? 1 : 0, door_open: isShutIn(body) && doorOpen(body.room) ? 1 : 0, door_held: clock < body.doorHeldUntil ? 1 : 0, door_held_out: clock < body.letOutUntil ? 1 : 0, let_in_by: body.letInBy, at_door_of: body.atDoorOf,
    dry_mop: body.holding.includes('mop') && !toolOf(body) && !body.mopWet && !room.sink ? 1 : 0,
    grenade_messes: 0, doing: body.busyText, post: body.post, orderable: body.post ? ['Janitorial Supplies Crate'] : [],
    order_pending: body.orderPending ? 1 : 0, has_pda: 1, notices: body.notices,
    // Cargo staff know of every crate being held. Everyone else knows only of those put out in the lobby.
    held_crates: heldCrates().filter((entry) => body.post || entry.out).map((entry) => ({ number: entry.number, for: entry.for, what: entry.what, place: entry.out ? 'Cargo Lobby' : 'Cargo Bay', out: entry.out ? 1 : 0, taken_by: entry.takenBy, waited: entry.heldSince ? (clock - entry.heldSince) / 100 : 0 })),
    held_check_due: heldCheckDue(body) ? 1 : 0,
    crate_to_return: body.crateToReturn ? 1 : 0, office: body.office,
    // A head is told which room to call its staff together in.
    meeting_room: body.office ? (VARIANT === 'shutout' ? 'Staff Room' : 'Bar') : null,
    // Its PDA lists everyone else aboard who carries one, with their job.
    pda_people: bodies.filter((other) => other !== body).map((other) => ({ name: other.name, job: other.job })),
    tidy: body.post ? { todo: (rooms['Cargo Bay'].floor?.length ?? 0) + (rooms['Cargo Lobby'].floor?.length ?? 0) } : null,
    freight: body.post ? {
      shuttle_docked: shuttle.docked ? 1 : 0,
      to_unload: shuttle.docked ? shuttle.aboard.filter((box) => !spent(box)).length : 0,
      empties_aboard: shuttle.docked ? shuttle.aboard.filter(spent).length : 0,
      mail_crate: rooms['Cargo Bay'].boxes.some((box) => box.mail?.length) ? 1 : 0,
      mail_for: [...new Set(body.mail)],
      empty_crates: cargoCrates().filter(spent).length,
    } : null,
    // The lobby is the technician's to keep fit to be in. Its PDA lists every janitor aboard.
    look_in_rooms: body.post ? ['Delivery Office'] : [], closed_rooms: body.post ? [body.post, 'Delivery Office'] : [],
    work_area_messes: body.post ? Object.fromEntries(['Cargo Lobby', body.post, 'Delivery Office'].filter((place) => remembered.some((x) => x.place === place)).map((place) => [place, [...new Set(remembered.filter((x) => x.place === place).map((x) => x.m!.name))].slice(0, 3)])) : {},
    workmate_called: body.post && janitorCall && janitorCall.by !== body.name && clock - janitorCall.at < 600_000 ? 1 : 0,
    in_hand: clock < body.inHandUntil ? 1 : 0,
    out_of_bounds: LOCKED.includes(body.room) && !body.post ? 1 : 0,
    pda_janitors: bodies.filter((other) => other !== body && other.job === 'Janitor').map((other) => other.name),
    blocked_places: [...body.blocked.keys()].filter(shut),
    walking: body.busyText ? 1 : 0, resting: 0, explored_everything: body.explored ? 1 : 0, storage_here: unopened, acked_seq: 0, events: [...body.events],
  };
}

// ---- run
const VARIANT = process.argv[3];
function spawnTrapped() {
  const tech = spawn('Cora Tech', 'Cargo Technician');
  const janitor = spawn('Sha Nika', 'Janitor');
  janitor.room = 'Cargo Bay';
  players.push({ name: 'Zim Fire', job: 'Head of Personnel', room: 'Cargo Bay' });
  return [tech, janitor];
}
function spawnVouch() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Vik Hale', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')];
  // Enough of a mess in the bay to keep a janitor in there a while, and someone in there who has no business to be.
  rooms['Cargo Bay'].messes.push(mess('dirt'), mess('dirt'), mess('dirt'), mess('dirt'));
  players.push({ name: 'Greg Loiter', job: 'Assistant', room: 'Cargo Bay' });
  return crew;
}
function spawnOrders() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')];
  players.push({ name: 'Ada Stone', job: 'Captain', room: 'Cargo Lobby' }, { name: 'Hal Pott', job: 'Head of Personnel', room: 'Cargo Lobby' });
  return crew;
}
// Two technicians, and a head who orders at the counter and does not send anyone for what comes.
function spawnWaiting() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Vik Hale', 'Cargo Technician')];
  players.push({ name: 'Hal Pott', job: 'Head of Personnel', room: 'Cargo Lobby' });
  return crew;
}
const WRONG_NUMBER_AT = 1260;
const RIGHT_NUMBER_AT = 1300;
// What a round starts with: a head, two technicians and three janitors.
function spawnCrew() {
  return [spawn('Hop Kins', 'Head of Personnel'), spawn('Cora Tech', 'Cargo Technician'), spawn('Vik Hale', 'Cargo Technician'), spawn('Jan Itor', 'Janitor'), spawn('Mo Pper', 'Janitor'), spawn('Sue Ds', 'Janitor')];
}
// The scenarios with a whole crew aboard: everything in them is done, the bay and the mail included.
const FULL = !VARIANT || VARIANT === 'crew' || VARIANT === 'shutout';
const HOP_ORDERS_AT = 90;
const CAPTAIN_ORDERS_AT = 150;
const crew = VARIANT === 'office' ? [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')] : VARIANT === 'alarm' || VARIANT === 'alarmagain' ? [spawn('Jan Itor', 'Janitor')] : VARIANT === 'rounds' ? [spawn('Cora Tech', 'Cargo Technician')] : VARIANT === 'orders' ? spawnOrders() : VARIANT === 'waiting' ? spawnWaiting() : VARIANT === 'vouch' ? spawnVouch() : VARIANT === 'trapped' ? spawnTrapped() : VARIANT === 'solo' ? [spawn('Jan Itor', 'Janitor')] : VARIANT === 'crew' ? spawnCrew() : [spawn('Hop Kins', 'Head of Personnel'), spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor'), spawn('Mo Pper', 'Janitor'), spawn('Sue Ds', 'Janitor')];
// The delivery office takes longer: it is only found on a quiet look round, and then someone has to be sent for.
// With a head aboard, nothing is ordered until the staff meeting two minutes in has been held.
// A crate nobody comes for is chased three times, five minutes or so apart, before it is asked for.
const SECONDS = VARIANT === 'waiting' ? 1380 : VARIANT === 'office' ? 900 : FULL ? 720 : 540;
// When someone pulls a fire alarm in the room the janitor is in, in the scenarios about that.
const ALARM_PULLED_AT = 45;
const PAT_COMES_AT = 420;
for (let second = 0; second < SECONDS; second++) {
  clock += 1000; serverNow += 10;
  for (const body of bodies) {
    if (body.busyText && clock >= body.busyUntil && !(body.walking && clock < body.stillUntil)) { const done = body.onDone; body.busyText = null; body.walking = false; body.onDone = null; done?.(); }
    if (body.orderPending && clock >= body.dockAt) {
      body.orderPending = false;
      shuttle.docked = true; shuttle.aboard.push({ name: 'mail crate', contents: [], openedBy: new Set(), mail: ['Pat Rick'], crate: true });
      // Each crate of the order comes with its own manifest number, and is held for collection from here on.
      const numbers: number[] = [];
      for (let i = 0; i < body.orderCount; i++) {
        const box: Box = { name: 'janitorial supplies crate', contents: ['mop', 'space cleaner'], openedBy: new Set(), crate: true };
        shuttle.aboard.push(box);
        held.push({ box, number: nextOrderNumber, for: body.orderFor, what: 'Janitorial Supplies Crate', heldSince: 0, reminders: 0, out: false, takenBy: null });
        numbers.push(nextOrderNumber++);
      }
      if (body.orderFor) body.notices.push({ to: body.orderFor, kind: 'arrived', numbers, what: 'Janitorial Supplies Crate' });
      result(body, 'order', true, `The supply shuttle has docked with what you ordered: ${written(numbers)}. It is held in the bay until someone comes to the counter with the number.`, { numbers });
    }
  }
  // Whoever the mail is for comes to the counter some minutes after it has arrived.
  if (second === PAT_COMES_AT && FULL) players.push({ name: 'Pat Rick', job: 'Botanist', room: 'Cargo Lobby' });
  if ((VARIANT === 'alarm' || VARIANT === 'alarmagain') && second >= ALARM_PULLED_AT && !alarmPulled && !bodies[0].walking) { fireAlarm = bodies[0].room; alarmPulled = true; }
  // Pulled again as soon as it is reset: a real problem, or someone who will not leave it alone.
  if (clock >= repullAt) { fireAlarm = bodies[0].room; repullAt = Infinity; }
  if (VARIANT === 'orders' && second === HOP_ORDERS_AT) playerSays('Hal Pott', 'Cora, go and look at the Custodial Closet and report back to me.');
  if (VARIANT === 'orders' && second === CAPTAIN_ORDERS_AT) playerSays('Ada Stone', 'Cora, go and look at the Bar and report back to me.');
  // A head orders a crate at the counter and then leaves it sitting there. Much later it asks for it: first by a number that is no crate's, then by the right one.
  if (VARIANT === 'waiting' && second === 20) playerSays('Hal Pott', 'Cora, I need to order a crate of janitorial supplies, please.');
  if (VARIANT === 'waiting' && second === WRONG_NUMBER_AT) playerSays('Hal Pott', 'Cora, I am here to collect crate 9999, please.');
  if (VARIANT === 'waiting' && second === RIGHT_NUMBER_AT) playerSays('Hal Pott', 'Cora, I am here to collect crate 4521, please.');
  runTimers();
  brainModule.ingest(bodies.map(uiData), serverNow);
  // Let anything the stand-in LLM was asked finish, as it would between two looks at the world.
  for (let i = 0; i < 6; i++) await new Promise((resolve) => realSetTimeout(resolve, 0));
}

// ---- report
let failed = 0;
function check(label: string, ok: boolean, detail = '') { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); }
for (const body of crew) {
  console.log(`\n=== ${body.name}, ${body.job}: ends in ${body.room} holding ${body.holding.join(', ') || 'nothing'}; said ${body.said.length} thing(s)`);
  if (process.env.SHOW) for (const line of body.log) console.log('   ' + line);
  for (const line of body.said) console.log(`   said: "${line}"`);
}
console.log('');
// With a technician to let them in, the janitors can get at the bay as well. Without one they cannot.
const bayCounts = FULL;
// The mess in the delivery office is never a janitor's to get to: nobody lets them in there.
const left = allMesses().filter((m) => (bayCounts || !rooms['Cargo Bay'].messes.includes(m)) && !rooms['Delivery Office'].messes.includes(m));
// With no janitor aboard there is nobody to clean anything.
if (VARIANT !== 'rounds' && VARIANT !== 'alarmagain' && VARIANT !== 'waiting') check(`every mess a janitor can get to is cleaned (started with ${messId}${bayCounts ? ', one of them behind the bay door' : '; the one in the bay does not count'})`, left.length === 0, left.length ? `left: ${Object.entries(rooms).filter(([, room]) => room.messes.length).map(([name, room]) => `${name}: ${room.messes.map((m) => m.name).join(', ')}`).join('; ')}` : '');
const janitors = crew.filter((body) => body.job === 'Janitor');
check('every janitor ends with something to clean with', janitors.every((body) => body.holding.some((item) => /mop|space cleaner|soap/.test(item))), janitors.map((body) => `${body.name}: ${body.holding.join(', ') || 'nothing'}`).join('; '));
const bayTries = janitors.map((body) => body.bayFails);
// A room it failed to get into is left alone for five minutes and then tried again: the longer runs have time for one more try.
check('no janitor keeps walking at a room it cannot get into', bayTries.every((tries) => tries <= (FULL ? 3 : 2)), `tries at the Cargo Bay: ${bayTries.join(', ')}`);
if (VARIANT === 'trapped') {
  const shutIn = janitors[0];
  // Asking to be let out, as against saying it is at a door it was called to: each person is asked once a stay.
  const asks = shutIn.said.filter((line) => /open the door/i.test(line)).length;
  const walkedOut = putOut.includes(shutIn.name);
  check('the janitor shut in the bay asks for the door without nagging, or is walked out of it first', asks <= 3 && (asks >= 1 || walkedOut), `${asks} time(s)${walkedOut ? '; walked out' : ''}`);
  const hop = players[0].name.split(' ')[0];
  check('nobody asks a head of staff their business, or lays a hand on them', !putOut.includes(players[0].name) && !crew.some((body) => body.said.some((line) => line.includes(hop) && /why are you in here|out you go/i.test(line))), putOut.join(', '));
  check('it does not keep walking at the door meanwhile', shutIn.log.filter((line) => /Cargo Bay +(go_to \{|explore)/.test(line)).length <= 6, `tries from inside the bay: ${shutIn.log.filter((line) => /Cargo Bay +(go_to \{|explore)/.test(line)).length}`);
  check('once let out, it gets on with its job', shutIn.room !== 'Cargo Bay' || shutIn.holding.length > 0, `ends in ${shutIn.room}`);
}
if (VARIANT === 'orders') {
  const cora = crew[0];
  const went = cora.log.findIndex((line) => line.includes('go_to {"place":"Bar"}'));
  check('ordered by the Captain to look at the Bar, the technician leaves the post and goes', went >= 0);
  const report = cora.said.find((line) => /about the Bar/i.test(line));
  check('it comes back and reports what it found to the Captain', !!report && cora.log.slice(went).some((line) => line.includes('go_to {"place":"Cargo Bay"}')), report ?? 'no report');
  check('it does not take the same order from a head of another department', !cora.log.some((line) => line.includes('go_to {"place":"Custodial Closet"}')));
  check('nobody asks the Captain or a head their business', !crew.some((body) => body.said.some((line) => /why are you in here|out you go/i.test(line))));
}
if (VARIANT === 'vouch') {
  const techs = crew.filter((body) => body.job === 'Cargo Technician');
  const jan = janitors[0];
  const callers = techs.filter((body) => body.log.some((line) => / message /.test(line) && /There is a mess in the Cargo Bay/.test(line)));
  check('one technician sends for a janitor about the bay, and the other leaves it at that', callers.length === 1, callers.map((body) => body.name).join(', ') || 'nobody called');
  const caller = callers[0] ?? techs[0];
  const other = techs.find((body) => body !== caller)!;
  const first = (body: { name: string }) => body.name.split(' ')[0];
  const asksJan = techs.reduce((total, body) => total + body.said.filter((line) => line.includes(first(jan)) && /why are you in here/i.test(line)).length, 0);
  check('the other one knows from the department\'s list that the janitor was sent for, and does not ask their business', asksJan === 0 && !!other, `${asksJan} time(s)`);
  check('nor does it have to ask its workmate whether it is so', !techs.some((body) => body.said.some((line) => /did you ask/i.test(line) && line.includes(first(jan)))));
  check('the janitor is left to clean, and the bay is cleaned', !putOut.includes(jan.name) && rooms['Cargo Bay'].messes.length === 0, `left in the bay: ${rooms['Cargo Bay'].messes.length}`);
  const asksGreg = techs.reduce((total, body) => total + body.said.filter((line) => line.includes('Greg') && /why are you in here/i.test(line)).length, 0);
  check('someone with no business in the bay is asked, by one of them, and then walked out', putOut.filter((name) => name === 'Greg Loiter').length === 1 && asksGreg >= 1 && asksGreg <= 3 && players[0].room === 'Cargo Lobby', `asked ${asksGreg} time(s); walked out: ${putOut.join(', ') || 'nobody'}`);
}
if (VARIANT === 'alarm' || VARIANT === 'alarmagain') {
  const jan = crew[0];
  const resets = jan.log.filter((line) => / reset_alarm /.test(line)).length;
  if (VARIANT === 'alarm') check('boxed in by fire doors after someone pulled the alarm, the janitor resets it, once, and gets on', alarmResets === 1 && resets === 1, `${resets} tr${resets === 1 ? 'y' : 'ies'}, ${alarmResets} reset(s)`);
  else check('an alarm that comes straight back is left alone, not reset over and over', alarmResets >= 1 && alarmResets <= 2 && resets <= 3, `${resets} tr${resets === 1 ? 'y' : 'ies'}, ${alarmResets} reset(s)`);
  check('it does not take the fire doors for being shut in, and ask for a door', !jan.said.some((line) => /open the door/i.test(line)), jan.said.join(' | '));
}
const tech = crew.find((body) => body.job === 'Cargo Technician');
// With two technicians, either may do any of cargo's work: what counts is that it is done, and done once.
const techs = crew.filter((body) => body.job === 'Cargo Technician');
const techLog = techs.flatMap((body) => body.log);
if (tech) {
  // With nothing to do and nobody about, it looks in on the rest of its department, and comes back.
  const looks = tech.log.filter((line) => line.includes('go_to {"place":"Delivery Office"}')).length;
  if (VARIANT === 'rounds') check('left alone with nothing to do, the technician looks in on the delivery office, and not over and over', looks >= 1 && looks <= 2, `${looks} time(s)`);
  if (VARIANT === 'office') {
    const jan = crew.find((body) => body.job === 'Janitor')!;
    const lets = opened.filter((entry) => entry.endsWith('@Delivery Office'));
    check('finding a mess in the delivery office, the technician sends for a janitor', tech.log.some((line) => / message /.test(line) && /mess in the Delivery Office/.test(line)));
    check('the janitor knocks at its door and sends word, and does not keep knocking', knocks.filter((entry) => entry === `${jan.name}@Delivery Office`).length >= 1 && knocks.filter((entry) => entry === `${jan.name}@Delivery Office`).length <= 4, knocks.join(', ') || 'no knock');
    check('the technician lets the janitor it sent for into the delivery office', lets.some((entry) => entry.startsWith('in:')), lets.join(', ') || 'the door was never opened');
    check('the mess in there is cleaned', rooms['Delivery Office'].messes.length === 0, `left: ${rooms['Delivery Office'].messes.length}`);
    check('and the janitor is let out again, not left shut in', lets.some((entry) => entry.startsWith('out:')) && jan.room !== 'Delivery Office', `${lets.join(', ')}; ends in ${jan.room}`);
  }
  const orders = techLog.filter((line) => /^\S+ .{24} order( |$)/.test(line)).length;
  const ordered = janitors.length > 2 || VARIANT === 'waiting';
  check(ordered ? 'exactly one order was placed, by one technician' : 'no order was needed', ordered ? orders === 1 : orders === 0, `orders: ${orders}`);
  check(techs.length > 1 ? 'the cargo technicians end at the post' : 'the cargo technician ends at the post', techs.every((body) => body.room === 'Cargo Bay'), techs.map((body) => `${body.name} in ${body.room}`).join('; '));
  check('nobody is still owed a PDA message about their crates', techs.every((body) => body.notices.length === 0), techs.map((body) => `${body.name}: ${body.notices.length}`).join('; '));
  check('no technician carries a crate anywhere but out to the lobby', !techLog.some((line) => / collect_crate /.test(line)) && tippedOut.every((_, index) => !techs.some((body) => body.name === unpackedBy[index])));
}
// A crate nobody comes for: the technicians take turns to look, say so, and remind whoever ordered it. Asked for by its number, it is handed over.
if (VARIANT === 'waiting') {
  const techs = crew;
  const techLog = techs.flatMap((body) => body.log);
  const said = techs.flatMap((body) => body.said);
  check('whoever ordered is sent the manifest number when the crate comes in', techLog.filter((line) => / message /.test(line) && /Your order has come in: crate #4521/.test(line) && line.includes('"person":"Hal Pott"')).length === 1);
  check('the crate is hauled off the shuttle and held in the bay, not taken anywhere', techLog.some((line) => / unload/.test(line)) && tippedOut.length === 0);
  const spoken = said.filter((line) => line === HELD_CLAIM).length;
  check('one of them says, in those words, that it is going to check what crates are still here, three times in all and no more', claims.length === HELD_REMINDERS && spoken === HELD_REMINDERS, `${claims.map((claim) => `${claim.by.split(' ')[0]} at ${Math.round((claim.at - 1_000_000) / 1000)}s`).join(', ') || 'never'}; said ${spoken} time(s)`);
  const gaps = claims.slice(1).map((claim, index) => (claim.at - claims[index].at) / 1000);
  check('never two of them at once: each look is four to six minutes after the last', gaps.every((gap) => gap >= 235 && gap <= 380), gaps.map((gap) => `${Math.round(gap)}s`).join(', '));
  check('the first look is not before the crate has waited five minutes', claims.length > 0 && (claims[0].at - 1_000_000) / 1000 >= 300 + 40, claims.length ? `${Math.round((claims[0].at - 1_000_000) / 1000)}s in` : 'no look');
  const reminders = techLog.filter((line) => / message /.test(line) && /Still waiting at cargo: crate #4521/.test(line) && line.includes('"person":"Hal Pott"')).length;
  check('each look is followed by one PDA reminder to whoever ordered, with the number', reminders === claims.length, `${reminders} reminder(s) for ${claims.length} look(s)`);
  check('each look is said aloud when it is done, with the number', said.filter((line) => /^Still waiting: crate 4521 for Hal Pott/.test(line)).length === claims.length);
  check('asked for a crate by a number that is no crate\'s, cargo says so and brings nothing out', said.filter((line) => /not holding a crate by that number/i.test(line)).length === 1 && !released.some((entry) => entry.startsWith('9999')), said.filter((line) => /not holding/i.test(line)).join(' | ') || 'nothing said');
  check('asked for it by its number, the one who was asked brings it out to the lobby, once', released.length === 1 && released[0] === '4521 for Hal Pott' && techLog.filter((line) => / release /.test(line)).length === 1 && rooms['Cargo Lobby'].boxes.some((box) => box.name === 'janitorial supplies crate' && box.contents.length > 0), released.join(', ') || 'nothing was brought out');
  check('and tells them it is there', said.some((line) => /Hal, crate 4521 is out in the lobby for you/.test(line)), said.filter((line) => /4521/.test(line)).at(-1) ?? 'nothing said');
}
// The head finds out what its staff need, orders it all at once, and has it delivered.
const head = crew.find((body) => body.job === 'Head of Personnel');
if (head && janitors.length > 2) {
  const first = (body: { name: string }) => body.name.split(' ')[0];
  const invites = head.log.filter((line) => / message /.test(line) && /Staff meeting/.test(line));
  const calledAt = invites[0]?.slice(0, 8) ?? 'never';
  const meetsIn = VARIANT === 'shutout' ? 'Staff Room' : 'Bar';
  check(`about two minutes in, the head calls its staff to a meeting in the ${meetsIn} by PDA, each of them once`, invites.length === janitors.length && janitors.every((body) => invites.some((line) => line.includes(`"person":"${body.name}"`))) && invites.every((line) => line.includes(`in the ${meetsIn} `)), `${invites.length} call(s), the first at ${calledAt}`);
  if (VARIANT === 'shutout') {
    const word = janitors.map((body) => body.log.filter((line) => / message /.test(line) && /I could not get into the Staff Room/.test(line)).length);
    check('shut out of the room, each janitor tries the walk once and no more', janitors.every((body) => staffRoomTries.filter((name) => name === body.name).length === 1), staffRoomTries.join(', ') || 'nobody tried');
    check('and sends the head its answer by PDA instead, once', word.every((count) => count === 1), `messages: ${word.join(', ')}`);
  } else check('the janitors come to the meeting: all of them, or all but one who was held up', atMeeting.size >= janitors.length - 1, `there: ${[...atMeeting].join(', ') || 'nobody'}`);
  const spoke = janitors.filter((body) => body.said.some((line) => line.includes(first(head)) && /I need|Nothing from me/i.test(line)));
  if (MODE !== 'dead' && VARIANT !== 'shutout') check('each one there says what it needs, or that it needs nothing', janitors.filter((body) => atMeeting.has(body.name)).every((body) => spoke.includes(body)), `spoke: ${spoke.map((body) => body.name).join(', ') || 'nobody'}`);
  const askedCargo = janitors.filter((body) => body.said.some((line) => /order|supplies/i.test(line) && techs.some((it) => line.includes(first(it)))));
  check('no janitor asks cargo for supplies: that is the head\'s to do', askedCargo.length === 0, askedCargo.map((body) => body.name).join(', '));
  check('the head goes to the counter and orders for its staff', ordersPlaced.length === 1 && ordersPlaced[0].includes(`for ${head.name}`) && head.log.some((line) => line.includes('go_to {"place":"Cargo Lobby"}')), ordersPlaced.join('; ') || 'nothing was ordered');
  const crates = Number(ordersPlaced[0]?.split(' ')[0] ?? 0);
  const word = techLog.filter((line) => / message /.test(line) && /Your order has come in: crates? #\d+/.test(line) && line.includes(`"person":"${head.name}"`));
  check('cargo holds what comes in the bay and sends the head the manifest number of each crate, once', word.length === 1 && (word[0].match(/#\d+/g) ?? []).length === crates, `${word.length} message(s) for ${crates} crate(s)`);
  const sent = head.log.filter((line) => / message /.test(line) && /is waiting at cargo/.test(line));
  const sentTo = sent.map((line) => line.match(/"person":"([^"]*)"/)?.[1]);
  check('the head sends one of its janitors for each crate, by PDA, with the number and where to take it: a different one for each', sent.length === crates && crates >= 1 && sent.every((line) => /crate #\d+/.test(line) && /Take it to the Custodial Closet/.test(line)) && new Set(sentTo).size === Math.min(crates, janitors.length) && sentTo.every((name) => janitors.some((body) => body.name === name)), `${sent.length} sent for ${crates} crate(s): ${sentTo.join(', ')}`);
  const askedFor = janitors.flatMap((body) => body.said.map((line) => line.match(/here to collect crate (\d+)/)?.[1]).filter(Boolean));
  check('whoever is sent asks at the counter for the crate by its number, and cargo brings that one out to the lobby', released.length === crates && released.every((entry) => askedFor.includes(entry.split(' ')[0])), `asked for: ${askedFor.join(', ') || 'nothing'}; brought out: ${released.join(', ') || 'nothing'}`);
  check('they haul it to the Custodial Closet and unpack it there, and no crate is left in the way', tippedOut.length === crates && tippedOut.every((where) => where === 'Custodial Closet') && unpackedBy.every((name) => sentTo.includes(name)) && !rooms['Custodial Closet'].boxes.some((box) => box.crate), `${tippedOut.join(', ') || 'nothing was unpacked'}${unpackedBy.length ? ` by ${unpackedBy.join(', ')}` : ''}`);
  check('the empty crate is brought back to the lobby for cargo', cratesTakenBack === tippedOut.length && cratesTakenBack >= 1 && janitors.every((body) => !body.crateToReturn), `${cratesTakenBack} of ${tippedOut.length}`);
  check('nobody says they are going to check on crates when none has been left waiting', claims.length === 0, claims.map((claim) => claim.by).join(', '));
  const told = head.log.filter((line) => / message /.test(line) && /what you asked for has come/i.test(line));
  check('the head tells anyone else who asked, by PDA and once, where it is', told.length <= janitors.length && told.every((line) => /Custodial Closet/.test(line)) && new Set(told.map((line) => line.match(/"person":"([^"]*)"/)?.[1])).size === told.length && !told.some((line) => unpackedBy.some((name) => line.includes(`"person":"${name}"`))), `${told.length} message(s)`);
  const setOffFromOffice = head.log.filter((line) => line.includes(`${HOP_OFFICE} `) && line.includes(`go_to {"place":"${HOP_OFFICE}"}`)).length;
  check('and goes back to its office when it has nothing to see to, and stays put once there', head.room === HOP_OFFICE && setOffFromOffice === 0, `ends in ${head.room}; set off for it from inside it ${setOffFromOffice} time(s)`);
}
// Shut in the bay, the janitor is in the technician's sight, and is out and cleaning before a call is due.
if (tech && janitors.length && VARIANT !== 'trapped') {
  const called = techLog.filter((line) => / message /.test(line) && /There is a mess in the Cargo Lobby/.test(line));
  check('the technician does not nag about the mess in the lobby', called.length <= 2, `${called.length} call(s)`);
  const to = called[0]?.match(/"person":"([^"]*)"/)?.[1];
  const callee = janitors.find((body) => body.name === to);
  check('a janitor called to the lobby goes there', !to || (!!callee && callee.log.some((line) => line.includes('go_to {"place":"Cargo Lobby"}') || / Cargo Lobby .* clean/.test(line))), to ?? 'the lobby was clean before a call was due');
  if (bayCounts) {
    const bayCalls = techLog.filter((line) => / message /.test(line) && /There is a mess in the Cargo Bay/.test(line)).length;
    check('the technician calls a janitor to the mess in the bay, and does not nag', bayCalls >= 1 && bayCalls <= 2, `${bayCalls} call(s)`);
    const lets = { in: opened.filter((entry) => entry.startsWith('in:') && !entry.includes('@')).length, out: opened.filter((entry) => entry.startsWith('out:') && !entry.includes('@')).length };
    // Whoever is let out has gone to stand at the door before asking for it.
    const atDoorFirst = janitors.every((body) => { const asked = body.log.findIndex((line) => / say /.test(line) && /door/i.test(line)); return asked < 0 || body.log.slice(0, asked).some((line) => / go_to_door/.test(line)); });
    check('that janitor is let in to clean it, and let out again, without the door being opened over and over', lets.in >= 1 && lets.in <= 2 && lets.out + putOut.length >= 1 && lets.out <= 2 && atDoorFirst && rooms['Cargo Bay'].messes.length === 0 && janitors.every((body) => body.room !== 'Cargo Bay'), `${opened.join(', ') || 'the door was never opened'}${putOut.length ? `; walked out: ${putOut.join(', ')}` : ''}`);
  }
}
if (tech) check('the technician puts away what was lying about in the bay and the lobby', putAway.length === 3, putAway.join('; ') || 'nothing was put away');
if (tech && janitors.length > 2) {
  const told = techLog.filter((line) => / message /.test(line) && /Pat Rick/.test(line)).length;
  check('the mail crate is unloaded and the mail taken out of it', techLog.some((line) => / unload/.test(line)) && techLog.some((line) => / collect_mail/.test(line)));
  check('whoever the mail is for is told once by PDA', told === 1, `${told} message(s)`);
  check('they are handed it when they come to the counter', handed.includes('Pat Rick') && techs.every((body) => body.mail.length === 0), handed.join(', ') || 'nothing handed over');
  check('the empty crates go back on the shuttle, and it is sent away', !shuttle.docked && shuttle.sentWith >= 2, `sent with ${shuttle.sentWith} crate(s) aboard`);
}
const tooSoon = crew.reduce((total, body) => total + body.setOffTooSoon, 0);
const overShoulder = crew.reduce((total, body) => total + body.saidWalking, 0);
check('nobody sets off within two seconds of speaking', tooSoon === 0, `${tooSoon} time(s)${tooSoonSteps.length ? ': ' + tooSoonSteps.join('; ') : ''}`);
check('nobody says their piece while walking off', overShoulder === 0, `${overShoulder} time(s)`);
const calls = crew.reduce((total, body) => total + body.log.filter((line) => !/ say /.test(line)).length, 0);
for (const line of trace) console.log(`   trace ${line}`);
if (process.env.SHOW) for (const line of choices) console.log(`   chose ${line}`);
console.log(`\n${calls} steps taken by code; in ${SECONDS / 60} minutes the LLM was asked ${llmCalls} time(s) to talk and ${choiceCalls} time(s) which job comes first (${MODE} LLM).`);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
