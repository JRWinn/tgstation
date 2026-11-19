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
//   bun run sim.ts quiet captain   the Captain tells the head to find out how its section is doing: a second staff meeting is called there and then
//   bun run sim.ts quiet mixed     a head orders two kinds of crate in one breath: one order is placed for both, and each crate is told apart when it comes
//   bun run sim.ts quiet evict     the Captain, in the bay, orders the technician to put out a janitor it sent for (leave: tells the janitor to go)
//   bun run sim.ts quiet aside     a janitor scrubbing the bay is asked to step aside: it moves, and stays clear a while
//   bun run sim.ts quiet bydoor    a crate has been left right by a door: the technician hauls it clear
//   bun run sim.ts quiet lost      a crate being held for collection is destroyed: it is written off aloud and whoever ordered it is told
//   bun run sim.ts quiet nested    a mess in a locked room that lies inside the locked bay: the janitor is let through both doors, and back out through both
//   bun run sim.ts quiet qm        the crew with a Quartermaster aboard: the head's order goes to it by PDA, into its order book, to a technician face to face, and word of the crates comes back the same way
//   bun run sim.ts quiet qmbig     a head orders more than 1,000 credits' worth: the Quartermaster asks the Captain, who says yes (qmno: says no; qmquiet: never answers)
//   bun run sim.ts quiet qmpoor    a head orders more than the budget holds: the order is held until the money is there
//   bun run sim.ts quiet qmgone    a Quartermaster who never answers: after three minutes the head takes its order to the counter, as it did before there was one
//   bun run sim.ts quiet qmpaper   no paper anywhere to be found: the Quartermaster orders some like anything else, and opens that crate itself
//   bun run sim.ts quiet qmlost    a crate a head ordered is destroyed in the bay: the technician tells the Quartermaster to its face, who tells the head and has it ordered again
//   bun run sim.ts quiet qmstuck   a technician gives a crate up after it got away too often: it tells the Quartermaster where it left it, and the Quartermaster sends the other technician to see to it
//   bun run sim.ts quiet engine    a Chief Engineer and one engineer: the engine is given at the first meeting and lit, emitters last; the batteries are set
//   bun run sim.ts quiet enginestuck  a canister will not connect: the job stops, the emitters are never touched, and the Chief Engineer is told which step
//   bun run sim.ts quiet enginehot    the lit engine starts to come apart: the emitters are ordered off, and the Captain is told
//   bun run sim.ts quiet enginelocked  as enginehot, but one emitter's controls are locked: the other two go off, and the Captain is told why the engine is still firing
//   bun run sim.ts quiet engalone     a Chief Engineer who never speaks: the engineer starts by itself two minutes in
//   bun run sim.ts quiet enginedim    the emitters stop on a sound engine: the engineer is sent to switch them on again
//   bun run sim.ts quiet warrant     the Captain declares a warrant on the bar's monkey: the heads are sent the notice, a head reads it out at its meeting, a sighting is sent, and the officer arrests it and puts it in a cell
//   bun run sim.ts quiet arresthead  the Captain declares a warrant on a head of department: it stands still, is not hit, and sits out its time (pardon: the Captain pardons it, and its cell is opened)
//   bun run sim.ts quiet fight       the monkey bites: the baton comes out at once, and it gets five minutes more
//   bun run sim.ts quiet hurt        the monkey bites hard: the officer breaks off hurt, and the Head of Security makes the arrest itself
//   bun run sim.ts quiet nobaton     the lockers give the officer no baton: it says so, the Captain is told, and it stays with the monkey: no more trips to the lockers, and no walking off to a staff meeting
//   bun run sim.ts quiet badcell     the first cell will not take the prisoner: the officer tries the next at once, and walks nowhere else with it by the arm
//   bun run sim.ts quiet loose       the Captain words the warrant loosely: code cannot read it, the LLM does, and it is read back in the fixed words. With a dead LLM the Captain is told it was not followed, and says it again plainly
//   bun run sim.ts quiet nohos       an officer with no Head of Security aboard: it takes the warrant from the Captain and keeps the list itself
//   bun run sim.ts quiet qmwait   a head never sends for its crate: the technician who looks over the bay tells the Quartermaster, who reminds the head
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
let readingCalls = 0;
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
  // Asked to read an order code could not: it finds the monkey's name in it, and how long.
  if (properties.kind) {
    readingCalls++;
    if (MODE === 'dead') throw new Error('Ollama is not running');
    const asked: string = body.messages[body.messages.length - 1].content;
    const named = asked.match(/pun pun/i)?.[0];
    const made = named ? { kind: 'warrant', name: named, minutes: /ten minutes|10 min/i.test(asked) ? 10 : 0 } : { kind: 'neither', name: '', minutes: 0 };
    await new Promise((resolve) => setTimeout(resolve, CHOICE_MS));
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(made) }, done_reason: 'stop', prompt_eval_count: 120, eval_count: 20 }) };
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
type Box = { name: string; contents: string[]; openedBy: Set<string>; mail?: string[]; crate?: boolean; byDoor?: boolean };
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
  // Opens off the bay, to the Quartermaster and nobody else. A technician with word for it knocks.
  "Quartermaster's Office": { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  // Where the engineers work from, with the station's batteries; the engine room; and the Chief Engineer's office.
  Engineering: { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  'Supermatter Engine Room': { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  "Chief Engineer's Office": { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  // Where the security staff work from, with their lockers; the cells; the Head of Security's office; and somewhere out of everyone's way.
  'Security Office': { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  Brig: { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  "Head of Security's Office": { kind: 'room', messes: [], items: [], boxes: [], sink: false },
  Library: { kind: 'room', messes: [], items: [], boxes: [], sink: false },
};
const QM_OFFICE = "Quartermaster's Office";
// Where there is paper to be had: a bin of it, with a pen.
let paperIn: string | null = process.argv[3] === 'qmpaper' ? null : 'Delivery Office';
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
  orderPending: boolean; notices: { to: string; kind: 'arrived' | 'waiting' | 'lost'; numbers: number[]; what?: string | null; kinds?: string[]; why?: string; via?: string | null; ref?: number | null }[]; dockAt: number; orderFor: string | null; orderCount: number; orderItems: { crate: string; count: number }[]; cleaned: number; tidied: number; cratesIn: number; cratesOut: number; cratesInTold: number; cratesOutTold: number; cleanedTold: number; crateToReturn: Box | null; heldCheckAt: number; heldClaimSeen: number; office: string | null; mail: string[]; stillUntil: number; lastSaidAt: number; setOffTooSoon: number; saidWalking: number; doorHeldUntil: number; letOutUntil: number; inHandUntil: number; letInto: string | null; letInBy: string | null; atDoorOf: string | null; doorwayOf: string | null; nextTo: string | null; bumpAt: number; bayFails: number;
  trail: { place: string; from: string; by: string | null }[]; wantsOut: boolean;
  // A Quartermaster's order book: null until it has paper. And who gave a technician the order it has on the go, and under what number.
  book: string[] | null; orderVia: string | null; orderRef: number | null;
  log: string[]; said: string[];
};
const bodies: Body[] = [];
// The cargo counter is open: people in the bay and the lobby can see and hear each other.
const COUNTER = ['Cargo Bay', 'Cargo Lobby'];
// People who are not NPCs: they stand where they are put, and open a door when asked to.
const players: { name: string; job: string; room: string }[] = [];
// The rooms only cargo staff can open the doors of, and when each door stands open and for whom.
const LOCKED = ['Cargo Bay', 'Delivery Office'];
// Where the door of each of them opens from. In one scenario the delivery office lies inside the
// bay, as it does aboard the real station: a locked room inside a locked room.
const NESTED = process.argv[3] === 'nested';
const OUTER: Record<string, string> = { 'Cargo Bay': 'Cargo Lobby', 'Delivery Office': NESTED ? 'Cargo Bay' : 'Cargo Lobby' };
// The locked doors between a room and the open station, innermost first.
const doorsOut = (room: string): string[] => (LOCKED.includes(room) ? [room, ...doorsOut(OUTER[room])] : []);
const doorState: Record<string, { from: number; until: number; for: string | null }> = Object.fromEntries(LOCKED.map((room) => [room, { from: Infinity, until: -Infinity, for: null }]));
const doorOpen = (room: string) => !!doorState[room] && clock >= doorState[room].from && clock <= doorState[room].until;
const bayDoorOpen = () => doorOpen('Cargo Bay');
// A fire alarm someone has pulled: the room it has sealed, how often it has been reset, and when it is pulled again.
let fireAlarm: string | null = null;
let alarmResets = 0;
let repullAt = Infinity;
let alarmPulled = false;
const knocks: string[] = [];
// When the Quartermaster got paper for its order book, and each time a technician noted that word of an order was passed on face to face.
const gotPaperAt: number[] = [];
const wordPassed: string[] = [];
// Each time it looked for paper and found none, and the crates of its own that it opened.
const paperTries: number[] = [];
const openedOwn: number[] = [];
// A walk that would cross the fire doors of a sealed room ends at them.
const fireStops = (body: Body, place: string | null) => !!fireAlarm && ((body.room === fireAlarm) !== (place === fireAlarm));
// Only cargo staff can open the bay door. Anyone else in there is shut in until someone opens it.
// A body knows it is shut in after two ways out have failed, or one if it was let into the room.
const isShutIn = (body: Body) => body.waysOut >= 2 || (body.waysOut >= 1 && (body.letInto === body.room || body.trail.length > 0));
// The first locked door on the way from where a body stands to another room that is not standing
// open for it, and whether it is one on the way out or one on the way in. Null if the way is clear.
function shutDoor(body: Body, to: string): { door: string; leaving: boolean } | null {
  if (hasKeys(body)) return null;
  const out = doorsOut(body.room);
  const into = doorsOut(to);
  // A door both rooms are behind is not one that is gone through.
  while (out.length && into.length && out.at(-1) === into.at(-1)) { out.pop(); into.pop(); }
  for (const door of out) if (!doorOpen(door)) return { door, leaving: true };
  for (const door of into.reverse()) if (!doorOpen(door)) return { door, leaving: false };
  return null;
}
// Keeps a body's trail true to a step from one room into another, the way the server does: the
// locked rooms it has come through since it was last somewhere it could leave by itself.
function followTrail(body: Body, from: string, place: string) {
  const forget = () => { body.trail = []; body.wantsOut = false; };
  if (body.trail.length && body.trail[0].from === place) return forget();
  const at = body.trail.findIndex((entry) => entry.place === place);
  if (at >= 0) { body.trail.length = at + 1; return; }
  if (!LOCKED.includes(place) || hasKeys(body)) return forget();
  body.trail.push({ place, from, by: body.letInto === place ? body.letInBy : null });
}
// Puts a body in another room, however it got there.
function moveTo(body: Body, place: string) {
  if (body.room === place) return;
  const from = body.room;
  body.room = place;
  followTrail(body, from, place);
}
// A walk out that came to nothing. A body that came in through a door it cannot open means to get out from then on.
function wayOutFailed(body: Body) {
  body.waysOut++;
  if (body.trail.length) body.wantsOut = true;
}
// What takes a body off across the room or out of it, as against what it does where it stands.
const LEAVES = new Set(['throw_out', 'go_to', 'go_to_door', 'explore', 'release', 'collect_crate', 'check_held', 'unload', 'recycle', 'send_shuttle', 'order', 'take_back', 'pick_up', 'hand_mail', 'collect_mail', 'open_door', 'get_kit', 'jail', 'free']);
const shutInBay = (body: Body) => LOCKED.includes(body.room) && !hasKeys(body) && !doorOpen(body.room);
// The people a body can see: those in its room, and across the open cargo counter.
const inSight = (body: Body, room: string) => body.room === room || (COUNTER.includes(body.room) && COUNTER.includes(room));
// Who the bay door opens for: cargo staff, and those whose rank lets them in anywhere. And who nobody lays a hand on.
const belongsInBay = (who: { job: string }) => /Cargo|Quartermaster|Head of|Captain/.test(who.job);
const isCommand = (who: { job: string }) => /Head of|Captain|Quartermaster|Chief Engineer/.test(who.job);
// Who answers to whom: everyone to the Captain, the janitors to the Head of Personnel, and the technicians to the Quartermaster.
const answersTo = (body: { job: string }, who: { job: string }) => who.job === 'Captain' || (who.job === 'Head of Security' && body.job === 'Security Officer') || (who.job === 'Head of Personnel' && body.job === 'Janitor') || (who.job === 'Quartermaster' && body.job === 'Cargo Technician') || (who.job === 'Chief Engineer' && body.job === 'Station Engineer');
// Whose own ID opens cargo's doors: the technicians, whose post it is, and the Quartermaster.
const hasKeys = (body: { job: string; post?: string | null }) => !!body.post || body.job === 'Quartermaster';
// The Quartermaster aboard, NPC or not, by name. With one aboard, cargo's budget is counted.
const quartermaster = () => bodies.find((other) => other.job === 'Quartermaster')?.name ?? players.find((other) => other.job === 'Quartermaster')?.name ?? null;
// Cargo's one budget, which every order is paid from: what it starts with, and what comes in every five minutes.
let budget = process.argv[3] === 'qmpoor' || process.argv[3] === 'qmgone' ? 500 : 2000;
const INCOME = 500;
const INCOME_EVERY = 300;
const COSTS: Record<string, number> = { 'Janitorial Supplies Crate': 400, 'Replacement Lights': 400, 'Bureaucracy Crate': 640 };
// Each time the Quartermaster asked the Captain about a purchase, and what the Captain's PDA got.
const captainAsked: { at: number; text: string }[] = [];
// Someone who is not an NPC sends one a PDA message.
function playerMessages(name: string, to: Body, text: string) {
  const player = players.find((other) => other.name === name)!;
  emit(to, 'pda_message', `Your PDA buzzes with a message from ${name}: "${text}"`, { speaker: name, job: player.job, message: text });
}
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
// Crates hauled clear of a door they were left by, and each time someone stepped out of someone's way.
const stowed: string[] = [];
// The technician whose first haul off the shuttle came to nothing, in the scenario about that.
let stuckBy = '';
const steppedAside: { who: string; at: number }[] = [];
// ---- security: what its staff have on them, the brig's cells, and someone to arrest
const SECURITY = ['warrant', 'arresthead', 'pardon', 'fight', 'hurt', 'nohos', 'nobaton', 'badcell', 'loose'].includes(process.argv[3]);
// The cells that would not take a prisoner, in the scenario about that. The body tries another before it tries one of these again, as the server has it do.
const refusedCells = new Set<string>();
const SEC_OFFICE = 'Security Office';
const HOS_OFFICE = "Head of Security's Office";
const BRIG = 'Brig';
const isSecurityJob = (job: string) => job === 'Security Officer' || job === 'Head of Security';
// What each of the security staff has on it, who it has by the arm, how well it is, and the arrests it has made. The cuffs come with the job; the baton is in a locker.
const kits = new Map<string, { baton: boolean; cuffs: boolean; holding: string | null; health: number; arrests: number }>();
const kitOf = (body: { name: string }) => { if (!kits.has(body.name)) kits.set(body.name, { baton: false, cuffs: true, holding: null, health: 100, arrests: 0 }); return kits.get(body.name)!; };
// The brig's three cells: who is in each, and when their time is up.
const cells = [1, 2, 3].map((n) => ({ name: `Cell ${n}`, occupant: null as string | null, until: 0, by: null as string | null }));
// The bar's monkey: no NPC, and on nobody's PDA. Where it is, the rooms it goes round and from when, whether it is in cuffs or a cell, how many bites it has in it and how hard, and how many times it slips a baton.
type Roamer = { name: string; job: string; room: string; route: string[]; from: number; every: number; movedAt: number; cuffed: boolean; cell: string | null; busy: boolean; bites: number; hard: number; slips: number };
let punPun: Roamer | null = null;
// Everything the security staff did with their hands, in order; who walked free, when and why; who was bitten; and the crew NPCs held in a cell.
const secWork: { at: number; who: string; tool: string; how?: string; ok: boolean; reason?: string; target?: string; hits?: number; cell?: string; minutes?: number }[] = [];
const walkedFree: { who: string; at: number; why: string }[] = [];
const bitten: { who: string; at: number }[] = [];
const custody = new Map<string, string>();
// A cell's door opens: its time is up, or someone stopped the timer. Whoever was in it walks free, and a crew NPC is told so.
function openCell(cell: (typeof cells)[number], why: string) {
  const name = cell.occupant;
  if (!name) return;
  cell.occupant = null; cell.until = 0;
  walkedFree.push({ who: name, at: clock, why });
  const npc = bodies.find((other) => other.name === name);
  if (npc) { custody.delete(name); npc.inHandUntil = 0; emit(npc, 'knowledge', 'You are free to go.', { set_free: 1 }); }
  if (punPun?.name === name) { punPun.cell = null; punPun.cuffed = false; punPun.room = punPun.route[0] ?? 'Bar'; punPun.movedAt = clock; }
}

// ---- the engine: its room's machines as the server names them to engineering staff, how each is set, and the crystal.
const ENGINE = ['engine', 'enginestuck', 'enginehot', 'enginelocked', 'engalone', 'enginedim'].includes(process.argv[3]);
const CE_OFFICE = "Chief Engineer's Office";
const ENGINE_ROOM = 'Supermatter Engine Room';
type Machine = { id: string; name: string; kind: string; nth: number; place: string; on: boolean; full: boolean };
const machineList: Machine[] = [];
function putMachine(kind: string, name: string, count = 1, on = false, place = ENGINE_ROOM) {
  for (let nth = 1; nth <= count; nth++) machineList.push({ id: 'm' + (machineList.length + 1), name, kind, nth, place, on, full: false });
}
putMachine('canister', 'nitrogen canister', 2);
putMachine('canister', 'canister', 2);
putMachine('pump', 'External Gas to Loop', 2);
// As the map has them at round start: three pumps running, the rest off, and nothing at full.
for (const [name, on] of [['Engine Coolant Bypass', true], ['Gas to Chamber', false], ['Gas to Filter', false], ['Cooling Loop Bypass', false], ['Atmos to Loop', false], ['Gas to Cold Loop', true], ['Cold Loop to Gas', true], ['Mix Bypass', false], ['Mix to Gas', false], ['Gas to Mix', false]] as [string, boolean][]) putMachine('pump', name, 1, on);
putMachine('filter', 'filter', 2);
putMachine('alarm', 'engine air alarm');
putMachine('emitter', 'emitter', 3);
putMachine('battery', 'battery', 3, false, 'Engineering');
const machineNamed = (name: string, nth = 1) => machineList.find((machine) => machine.name === name && machine.nth === nth)!;
const emitters = () => machineList.filter((machine) => machine.kind === 'emitter');
// The gas is going round and through the chamber: the canisters are on, the bypass is shut, and every pump and filter on the way is running at full.
const loopRunning = () => [1, 2].every((nth) => machineNamed('nitrogen canister', nth).on && machineNamed('External Gas to Loop', nth).on && machineNamed('filter', nth).on)
  && !machineNamed('Engine Coolant Bypass').on && ['Gas to Chamber', 'Gas to Filter', 'Mix Bypass'].every((name) => machineNamed(name).on && machineNamed(name).full)
  && machineNamed('Gas to Cold Loop').full && machineNamed('Cold Loop to Gas').full && machineNamed('engine air alarm').on;
// The crystal: how whole it is, the energy in it, and when in the run it was lit, began to come apart, fell low, had its emitters off, or had them stop.
const crystal = { integrity: 100, energy: 0, litAt: 0, faultAt: 0, dimAt: 0, lowAt: 0, offAt: 0 };
// Every time a machine was worked: when, by whom, which, how, whether it took, and whether the gas was going round at the time.
const machineWork: { at: number; who: string; name: string; kind: string; how: string; ok: boolean; changed: boolean; loop: boolean }[] = [];
const machinesSet = new Map<string, number>();
// Each second: emitters firing put energy into the crystal, and it bleeds away without them. Hit with no gas going round, or once a fault has set in, it comes apart.
function engineTick() {
  const firing = emitters().filter((machine) => machine.on).length;
  crystal.energy = firing ? Math.min(900, crystal.energy + firing * 40) : Math.max(0, crystal.energy - 150);
  if (firing === 3 && !crystal.litAt) crystal.litAt = clock;
  if (['enginehot', 'enginelocked'].includes(process.argv[3]) && crystal.litAt && !crystal.faultAt && clock - crystal.litAt >= 60_000) crystal.faultAt = clock;
  if (firing && (!loopRunning() || crystal.faultAt)) crystal.integrity = Math.max(0, crystal.integrity - 0.5);
  if (crystal.integrity < 95 && !crystal.lowAt) crystal.lowAt = clock;
  if (crystal.lowAt && !firing && !crystal.offAt) crystal.offAt = clock;
  // The emitters stop by themselves, well after the engine was lit, with nothing wrong with the crystal.
  if (process.argv[3] === 'enginedim' && crystal.litAt && !crystal.dimAt && clock - crystal.litAt >= 150_000) { crystal.dimAt = clock; for (const machine of emitters()) machine.on = false; }
}
const HOP_OFFICE = "Head of Personnel's Office";
// What was ordered and for whom; where each crate was unpacked and by whom; how many came back; who was at the meeting when the room was asked.
const ordersPlaced: string[] = [];
// What each order placed cost, and when, where the budget is counted.
const spentOn: { at: number; cost: number }[] = [];
// What each order was for, kind by kind.
const orderKinds: string[] = [];
// Everything said out loud, in order, and the staff meetings as they went: who was in the room when
// the head first called on someone, who was still there when it said the meeting was over, and
// each report with the number of spots it gave against what the server had counted.
const spoken: { at: number; who: string; job: string; text: string }[] = [];
const meetings: { room: string; beganAt: number; thereAtStart: string[]; overAt: number; thereAtEnd: string[]; closing: string }[] = [];
const reportsGiven: { who: string; how: 'aloud' | 'pda'; at: number; said: number; counted: number }[] = [];
// When each staff meeting was called.
const meetingCalls: number[] = [];
// The Quartermaster's staff meetings: each call aloud and who was there to hear it, each meeting as it went, the work it gave out, and each technician's report.
const supplyCalls: { at: number; room: string; heardBy: string[] }[] = [];
const supplyMeetings: { room: string; beganAt: number; thereAtStart: string[]; overAt: number; thereAtEnd: string[]; closing: string }[] = [];
const dutiesSaid: { at: number; text: string }[] = [];
const crateReports: { who: string; at: number; text: string; saidIn: number; saidOut: number; countedIn: number; countedOut: number }[] = [];
// A report's count of spots scrubbed is checked against the server's own, and then that much is counted as told.
function noteReport(body: Body, text: string, how: 'aloud' | 'pda') {
  const said = Number(text.match(/(\d+) spots?\b/)?.[1] ?? 0);
  reportsGiven.push({ who: body.name, how, at: clock, said, counted: body.cleaned - body.cleanedTold });
  body.cleanedTold += said;
}
const tippedOut: string[] = [];
const unpackedBy: string[] = [];
let cratesTakenBack = 0;
// Crates cargo is holding for collection, as the server keeps them: known by the number on the manifest.
type Held = { box: Box; number: number; for: string | null; what: string; heldSince: number; reminders: number; out: boolean; takenBy: string | null; lost?: string };
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
  // One that can no longer be handed over is not held any more: it is kept apart until someone at the post has written it off.
  for (const entry of held.filter((it) => it.lost)) { held = held.filter((it) => it !== entry); lostCrates.push(entry); }
  return held;
}
// Crates that were being held and are lost, until one of those at the post writes each off: says so aloud, and owes whoever ordered it word.
let lostCrates: Held[] = [];
function writeOffLost(body: Body) {
  if (!body.post) return;
  heldCrates();
  for (const entry of lostCrates) {
    bodySays(body, `Crate ${entry.number}${entry.for ? ` for ${entry.for}` : ''} is lost: ${entry.lost}. I will send word.`);
    if (entry.for) body.notices.push({ to: entry.for, kind: 'lost', numbers: [entry.number], what: entry.what, why: entry.lost });
    writtenOff.push(`${entry.number} by ${body.name}`);
  }
  lostCrates = [];
}
const writtenOff: string[] = [];
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
// Two bodies see and hear each other in the same room, across the open cargo counter, and when one of them is standing in the doorway of the room the other is in.
const near = (a: Body, b: Body) => a.room === b.room || (COUNTER.includes(a.room) && COUNTER.includes(b.room)) || a.doorwayOf === b.room || b.doorwayOf === a.room;
// The doorway scenarios: someone called to a meeting in the Bar is pushed back out of it, into the
// doorway, three seconds after every time they get there, for as long as the meeting is called
// and not yet over. In one it is a janitor, in the other the head who called it.
const DOORWAY = process.argv[3] === 'doorway' || process.argv[3] === 'headdoor';
const pushedOut = (body: Body) => (process.argv[3] === 'doorway' && body.name === 'Jan Itor') || (process.argv[3] === 'headdoor' && !!body.office);
const meetingOn = () => meetingCalls.length > meetings.filter((meeting) => meeting.overAt).length;
const bumps: { who: string; at: number }[] = [];
// Who has walked up to someone, each time they did.
const walkUps: string[] = [];
// How many times whoever is being pushed out set off for the meeting room while the meeting was on.
let walksToMeeting = 0;
function spawn(name: string, job: string): Body {
  const body: Body = { id: `npc${bodies.length + 1}`, name, job, room: 'Arrival Shuttle Hallway', holding: [], mopWet: false, visited: new Set(), known: new Set(['Cargo Lobby']), blocked: new Map(), seenMesses: new Map(), stubborn: new Set(), busyUntil: 0, busyText: null, walking: false, onDone: null, events: [], seq: 0, handles: new Map(), seen: new Set(), explored: false, waysOut: 0, hasLocator: job === 'Janitor', post: job === 'Cargo Technician' ? 'Cargo Bay' : null, book: null, orderVia: null, orderRef: null, orderPending: false, notices: [], dockAt: 0, orderFor: null, orderCount: 1, orderItems: [], cleaned: 0, tidied: 0, cratesIn: 0, cratesOut: 0, cratesInTold: 0, cratesOutTold: 0, cleanedTold: 0, crateToReturn: null, heldCheckAt: 0, heldClaimSeen: 0, office: job === 'Head of Personnel' ? HOP_OFFICE : job === 'Quartermaster' ? QM_OFFICE : null, mail: [], stillUntil: 0, lastSaidAt: -Infinity, setOffTooSoon: 0, saidWalking: 0, doorHeldUntil: 0, letOutUntil: 0, inHandUntil: 0, letInto: null, letInBy: null, atDoorOf: null, doorwayOf: null, nextTo: null, bumpAt: 0, bayFails: 0, trail: [], wantsOut: false, log: [], said: [] };
  if (body.post) body.known.add(body.post);
  // A head starts the shift in its office.
  if (body.office) { body.room = body.office; body.known.add(body.office); }
  // The Quartermaster knows where its staff work.
  if (job === 'Quartermaster') body.known.add('Cargo Bay');
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
// A rag is what is used when there is nothing better in the other hand.
const RAG = 'damp rag';
const cleaningTool = (body: Body) => toolOf(body) ?? (mopWorks(body) ? 'mop' : body.holding.includes(RAG) ? RAG : null);
// A spray only washes, and a rag only wipes. Soap and a wet mop scrub as well.
const canShift = (body: Body, m: Mess, held = cleaningTool(body) ?? (body.holding.includes('mop') ? 'mop' : null)) => !body.stubborn.has(m.id) && (held === null || (held !== 'space cleaner' && held !== RAG) || !m.scrub);
// The kinds of crate cargo may order, and what comes in each.
const CRATES: Record<string, { box: string; contents: string[] }> = {
  'Janitorial Supplies Crate': { box: 'janitorial supplies crate', contents: ['mop', 'space cleaner'] },
  'Replacement Lights': { box: 'replacement lights crate', contents: ['light tube', 'light bulb'] },
  'Bureaucracy Crate': { box: 'bureaucracy crate', contents: ['paper bin'] },
};
const allMesses = () => Object.values(rooms).flatMap((room) => room.messes);

function busy(body: Body, seconds: number, text: string, walking: boolean, done: () => void) {
  body.busyUntil = clock + seconds * 1000; body.busyText = text; body.walking = walking; body.onDone = done;
}
function arrive(body: Body, place: string, tool: string) {
  moveTo(body, place); body.waysOut = 0; body.letOutUntil = 0; if (body.letInto !== place) { body.letInto = null; body.letInBy = null; } body.visited.add(place); body.known.add(place);
  body.atDoorOf = null; body.doorwayOf = null; body.nextTo = null;
  if (pushedOut(body) && place === 'Bar' && meetingOn()) body.bumpAt = clock + 3000;
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
      spoken.push({ at: clock, who: body.name, job: body.job, text: args.text });
      // The head calls on someone for their report: the first time it does, the meeting has begun. It says the meeting is over: it has ended.
      const staffHere = () => bodies.filter((other) => other !== body && other.job === 'Janitor' && near(other, body)).map((other) => other.name);
      const open = meetings.find((meeting) => !meeting.overAt);
      if (body.job === 'Head of Personnel' && /\breport\b/i.test(args.text) && !open) { meetings.push({ room: body.room, beganAt: clock, thereAtStart: staffHere(), overAt: 0, thereAtEnd: [], closing: '' }); for (const name of staffHere()) atMeeting.add(name); }
      if (body.job === 'Head of Personnel' && /meeting is over/i.test(args.text) && open) { open.overAt = clock; open.thereAtEnd = staffHere(); open.closing = args.text; }
      // One of its staff gives a report at the meeting.
      const head = bodies.find((other) => other.job === 'Head of Personnel' && near(other, body));
      if (body.job === 'Janitor' && head && args.text.startsWith(`${head.name.split(' ')[0]}, `) && /\bI need\b/.test(args.text) && open) noteReport(body, args.text, 'aloud');
      // The Quartermaster's staff meeting, in the bay: called aloud, each technician called on by name, their work divided, and ended.
      const techsHere = () => bodies.filter((other) => other !== body && other.job === 'Cargo Technician' && near(other, body)).map((other) => other.name);
      const supplyOpen = supplyMeetings.find((meeting) => !meeting.overAt);
      if (body.job === 'Quartermaster') {
        if (/^Staff meeting in the .* now, please/.test(args.text)) supplyCalls.push({ at: clock, room: body.room, heardBy: techsHere() });
        if (/your report, please/i.test(args.text) && !supplyOpen) supplyMeetings.push({ room: body.room, beganAt: clock, thereAtStart: techsHere(), overAt: 0, thereAtEnd: [], closing: '' });
        if (/ yours this shift\./.test(args.text)) dutiesSaid.push({ at: clock, text: args.text });
        if (/meeting is over/i.test(args.text) && supplyOpen) { supplyOpen.overAt = clock; supplyOpen.thereAtEnd = techsHere(); supplyOpen.closing = args.text; }
      }
      // A technician's report at it: crates in and crates out, against the server's own count since its last report.
      const boss = bodies.find((other) => other.job === 'Quartermaster' && near(other, body));
      if (body.job === 'Cargo Technician' && boss && supplyOpen && args.text.startsWith(`${boss.name.split(' ')[0]}, `) && /\bI need\b/.test(args.text)) {
        const saidIn = Number(args.text.match(/brought in (\d+) crates?|(\d+) crates? brought in/)?.slice(1).find(Boolean) ?? 0);
        const saidOut = Number(args.text.match(/sent out (\d+) crates?|(\d+) crates? sent out/)?.slice(1).find(Boolean) ?? 0);
        crateReports.push({ who: body.name, at: clock, text: args.text, saidIn, saidOut, countedIn: body.cratesIn - body.cratesInTold, countedOut: body.cratesOut - body.cratesOutTold });
        body.cratesInTold += saidIn; body.cratesOutTold += saidOut;
      }
      for (const other of bodies) if (other !== body && near(other, body)) emit(other, 'speech_heard', `${body.name} says: "${args.text}"`, { handle: handleFor(other, body.name), speaker: body.name, source: 'person', distance: 1, message: args.text });
      return;
    }
    case 'locate':
      body.known.add('Custodial Closet');
      return result(body, 'locate', true, "Your PDA's custodial locator shows the cleaning gear is kept in Custodial Closet.", { places: [{ place: 'Custodial Closet', things: ['mop'] }] });
    case 'go_to':
      if (!(args.place in rooms)) return result(body, 'go_to', false, 'You do not know of anywhere aboard by that name.');
      if (args.place === body.room) return result(body, 'go_to', true, `You are already in ${args.place}.`, { place: args.place });
      if (pushedOut(body) && args.place === 'Bar' && meetingOn()) walksToMeeting++;
      // Only cargo staff can open the doors of the bay and the delivery office. Anyone else behind
      // one that is not standing open finds no way through. A walk to a room that is locked to it
      // as well says nothing about getting out, and does not count towards being shut in.
      const shut = shutDoor(body, args.place);
      if (shut?.leaving) return busy(body, 3, `walking to ${args.place}`, true, () => { if (!LOCKED.includes(args.place)) wayOutFailed(body); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
      // Fire doors shut by an alarm stop anyone walking into or out of the room they seal.
      if (fireStops(body, args.place)) { const sealed = fireAlarm!; return busy(body, 3, `walking to ${args.place}`, true, () => result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. The fire doors are shut in ${sealed}. You are in ${body.room}.`, { fire_doors: sealed, alarm_pulled: 1 })); }
      // The Quartermaster's office opens to the Quartermaster and nobody else.
      if (args.place === QM_OFFICE && body.job !== 'Quartermaster') return busy(body, 3, `walking to ${args.place}`, true, () => { body.blocked.set(args.place, clock); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
      // The staff room opens to a head and nobody else.
      if (args.place === 'Staff Room' && !body.office) return busy(body, 3, `walking to ${args.place}`, true, () => { body.blocked.set(args.place, clock); staffRoomTries.push(body.name); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
      // A locked room it is not in: the delivery office, or the bay.
      if (shut) {
        return busy(body, 3, `walking to ${args.place}`, true, () => {
          body.blocked.set(args.place, clock); if (args.place === 'Cargo Bay') body.bayFails++;
          result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through.`);
        });
      }
      return busy(body, 6, `walking to ${args.place}`, true, () => arrive(body, args.place, 'go_to'));
    case 'explore': {
      if (fireAlarm && body.room === fireAlarm) return result(body, 'explore', false, `You stop on the way to somewhere new: there is no way through. The fire doors are shut in ${fireAlarm}. You are in ${body.room}.`, { fire_doors: fireAlarm, alarm_pulled: 1 });
      if (shutInBay(body)) { wayOutFailed(body); return result(body, 'explore', false, 'You look for a way to somewhere new but find none from here.'); }
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
        // The server counts each mess a body cleans up. Its head hears the count at staff meetings.
        body.cleaned += here.filter((m) => room.messes.includes(m)).length;
        room.messes = room.messes.filter((m) => !here.includes(m));
        result(body, 'clean', true, `You clean up ${here.length} mess${here.length === 1 ? '' : 'es'} in ${body.room}.`, { place: body.room });
      });
    }
    case 'order':
      if (body.orderPending) return result(body, 'order', false, 'You already have an order on the go.');
      return busy(body, 4, 'going to the supply console to place an order', false, () => {
        body.orderPending = true; body.dockAt = clock + 20_000;
        // Who it is for is whoever asked, unless whoever gave the order said: the Quartermaster names the head it is for.
        body.orderFor = typeof args.for_name === 'string' ? args.for_name : ([...body.handles.entries()].find(([, handle]) => handle === args.for)?.[0] ?? null);
        body.orderVia = typeof args.via === 'string' ? args.via : null; body.orderRef = typeof args.ref === 'number' ? args.ref : null;
        // One order may be for several kinds of crate, and for several crates of each.
        const wanted = new Map<string, number>();
        const crates = (count: unknown) => Math.max(1, Math.min(4, Math.round(Number(count)) || 1));
        for (const item of Array.isArray(args.items) ? args.items : []) if (item.crate in CRATES) wanted.set(item.crate, Math.min(4, (wanted.get(item.crate) ?? 0) + crates(item.count)));
        if (!wanted.size && args.crate in CRATES) wanted.set(args.crate, crates(args.count));
        if (!wanted.size) { body.orderPending = false; return result(body, 'order', false, 'That is not something you can order.'); }
        // With a Quartermaster aboard the budget is counted: an order it cannot cover is not placed.
        const cost = [...wanted].reduce((total, [crate, count]) => total + COSTS[crate] * count, 0);
        if (quartermaster()) {
          if (budget < cost) { body.orderPending = false; return result(body, 'order', false, 'There is not enough money left in the cargo budget to order that.'); }
          budget -= cost; spentOn.push({ at: clock, cost });
        }
        body.orderItems = [...wanted].map(([crate, count]) => ({ crate, count }));
        body.orderCount = body.orderItems.reduce((total, item) => total + item.count, 0);
        ordersPlaced.push(`${body.orderCount} for ${body.orderFor}`);
        orderKinds.push(body.orderItems.map((item) => `${item.count} ${item.crate}`).join(' + '));
        result(body, 'order', true, `You order ${body.orderItems.map((item) => `${item.count > 1 ? `${item.count} of ` : ''}the ${item.crate}`).join(' and ')} for ${body.orderFor}.`);
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
        rooms['Cargo Lobby'].boxes.push(entry.box); entry.out = true; body.cratesOut++; body.room = 'Cargo Lobby'; released.push(`${entry.number} for ${forWhom}`);
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
      // The Quartermaster asking the Captain whether a purchase may be made.
      if (players.some((player) => player.name === args.person && player.job === 'Captain') && String(args.text).includes('Yes or no?')) captainAsked.push({ at: clock, text: String(args.text) });
      // A head calling its staff to a meeting: the first of the calls is when it was called.
      if (/^Staff meeting in the .* now, please/.test(String(args.text)) && clock - (meetingCalls.at(-1) ?? -Infinity) > 60_000) meetingCalls.push(clock);
      // The game cuts a PDA message off at two hundred characters.
      const text = String(args.text).slice(0, 200);
      if (target) emit(target, 'pda_message', `Your PDA buzzes with a message from ${body.name}: "${text}"`, { speaker: body.name, job: body.job, message: text });
      // A report sent by PDA, by someone who could not be at the meeting.
      if (/^(I could not get into|Sorry I missed the meeting)/.test(text)) noteReport(body, text, 'pda');
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
      const outside = place === QM_OFFICE ? 'Cargo Bay' : place && LOCKED.includes(place) ? OUTER[place] : body.room;
      // A locked room inside a locked room: its door opens from a room that is locked to the body as well. It is told which.
      if (place && body.room !== outside && LOCKED.includes(outside) && !hasKeys(body)) return result(body, 'go_to_door', false, `You cannot get to the door into ${place}: it opens from ${outside}, which is locked to you as well.`, { place: body.room, door_of: place, door_through: outside });
      // Shut in a room it cannot open the door of, it cannot walk to the door of some other room: it has to be let out first.
      if (place && body.room !== outside && shutInBay(body)) return busy(body, 3, `walking to the door into ${place}`, true, () => { body.waysOut++; result(body, 'go_to_door', false, `You could not get to the door into ${place}: there is no way through. You are in ${body.room}.`, { place: body.room }); });
      return busy(body, place && body.room !== outside ? 6 : 2, `walking to the door ${place ? 'into ' + place : 'out of ' + body.room}`, true, () => {
        if (place && body.room !== outside) { moveTo(body, outside); body.visited.add(outside); body.waysOut = 0; }
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
      // A mess in the room, or in a locked room that can only be got into through it.
      const messBeyond = rooms[room].messes.length > 0 || LOCKED.some((inner) => inner !== room && doorsOut(inner).includes(room) && rooms[inner].messes.length > 0);
      if (!inside && !(them.job === 'Janitor' && messBeyond)) return result(body, 'open_door', false, `You have no call to let ${them.name} into ${room}.`);
      return busy(body, 3, 'going to open the door for someone', false, () => {
        doorState[room] = { from: clock, until: clock + 15000, for: them.name }; opened.push(`${inside ? 'out' : 'in'}:${them.name}${room === body.post ? '' : '@' + room}`);
        const their = bodies.find((other) => other.name === name);
        if (their) {
          their.blocked.clear(); their.waysOut = 0; their.doorHeldUntil = clock + 15000; their.known.add(room);
          if (!inside) { their.letInto = room; their.letInBy = body.name; } else { their.letOutUntil = clock + 15000; }
          emit(their, 'knowledge', `${body.name} opens the door ${inside ? 'out of' : 'into'} ${room} and holds it for you.`, { places: [{ place: room, things: [] }], door_held: 1, ...(inside ? { out_to: OUTER[room] } : {}) });
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
          their.inHandUntil = 0; their.waysOut = 0; their.atDoorOf = null; their.letInto = null; their.letInBy = null; their.trail = []; their.wantsOut = false; their.blocked.set(body.post!, clock);
          emit(their, 'knowledge', `${body.name} has walked you out of ${body.post} and let go of you. You had no business in there.`, { put_out_of: body.post });
        }
        result(body, 'throw_out', true, `You walk ${them.name} out of ${body.post} and let go of them.`);
      });
    }
    case 'unload': {
      const crate = shuttle.docked ? shuttle.aboard.find((box) => !spent(box)) : undefined;
      if (!crate) return result(body, 'unload', false, 'There is nothing left aboard the supply shuttle to unload.');
      const ordered = held.find((entry) => entry.box === crate);
      if (VARIANT === 'qmstuck' && !stuckBy && ordered) {
        stuckBy = body.name;
        return busy(body, 12, 'hauling a crate off the supply shuttle', true, () => result(body, 'unload', false, `You could not get the ${crate.name} where it was going: it caught on something and you lost your grip on it. You have left it in Supply Shuttle, clear of the doors. You are in Cargo Bay.`, { place: 'Cargo Bay', gave_up: true, crate: crate.name, number: ordered.number, left_in: 'Supply Shuttle' }));
      }
      return busy(body, 6, 'hauling a crate off the supply shuttle', true, () => {
        // A workmate may have had it off first.
        if (!shuttle.aboard.includes(crate)) return result(body, 'unload', false, 'There is nothing left aboard the supply shuttle to unload.');
        shuttle.aboard.splice(shuttle.aboard.indexOf(crate), 1); rooms['Cargo Bay'].boxes.push(crate); body.cratesIn++; body.room = 'Cargo Bay';
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
        room.boxes.splice(room.boxes.indexOf(crate), 1); shuttle.aboard.push(crate); body.cratesOut++; body.room = 'Cargo Bay';
        result(body, 'recycle', true, `You put the empty ${crate.name} aboard the supply shuttle to go back.`);
      });
    }
    case 'stow_crate': {
      // A crate left within a tile of a door is hauled to a clear spot nearby. Cargo staff only.
      const crate = cargoCrates().find((box) => box.byDoor);
      if (!body.post || !crate) return result(body, 'stow_crate', false, 'There is no crate lying by a door.');
      return busy(body, 5, 'hauling a crate clear of a door', true, () => {
        // A workmate may have moved it first.
        if (!crate.byDoor) return result(body, 'stow_crate', false, 'There is no crate lying by a door.');
        crate.byDoor = false; stowed.push(`${crate.name} by ${body.name}`);
        result(body, 'stow_crate', true, `You haul the ${crate.name} clear of the door, where it is in nobody's way.`);
      });
    }
    case 'step_aside':
      // Asked to get out of the way, it steps to a clear spot nearby, whatever it was in the middle of.
      body.busyText = null; body.walking = false; body.onDone = null;
      // Clear of any doorway it was standing in, on whichever side of it that was.
      return busy(body, 2, "stepping out of someone's way", true, () => { steppedAside.push({ who: body.name, at: clock }); body.doorwayOf = null; body.nextTo = null; result(body, 'step_aside', true, 'You step aside, out of the way.'); });
    case 'walk_to': {
      // Walking up to someone in sight ends beside them, in whatever room they are standing in.
      const name = [...body.handles].find(([, handle]) => handle === args.person)?.[0];
      const other = bodies.find((it) => it.name === name);
      if (!other || !near(other, body)) return result(body, 'walk_to', false, 'You cannot see that person.');
      return busy(body, 2, `walking over to ${other.name}`, true, () => {
        moveTo(body, other.room); body.doorwayOf = null; body.nextTo = other.name; walkUps.push(body.name);
        if (pushedOut(body) && body.room === 'Bar' && meetingOn()) body.bumpAt = clock + 3000;
        result(body, 'walk_to', true, `You arrive next to ${other.name}.`, { handle: args.person });
      });
    }
    case 'tidy': {
      const where = ['Cargo Bay', 'Cargo Lobby'].find((name) => rooms[name].floor?.length);
      if (!body.post || !where) return result(body, 'tidy', false, 'There is nothing lying about that you have anywhere to put.');
      return busy(body, 5, 'putting away something that was lying about', true, () => {
        // A workmate may have put it away first.
        if (!rooms[where].floor?.length) return result(body, 'tidy', false, 'There is nothing lying about that you have anywhere to put.');
        const thing = rooms[where].floor!.shift()!; body.room = where; body.tidied++; putAway.push(`${thing.name} ${thing.rubbish ? 'in the bin' : 'on a table'}`);
        result(body, 'tidy', true, `You put the ${thing.name} ${thing.rubbish ? 'in the disposal bin' : 'on the table'} in ${where}.`);
      });
    }
    case 'get_paper': {
      // The Quartermaster goes to where paper is kept and takes a sheet, and the pen that is with it, for its order book.
      if (body.book) return result(body, 'get_paper', true, 'You have paper to write on already.');
      const bin = paperIn;
      if (!bin || !hasKeys(body)) { paperTries.push(clock); return result(body, 'get_paper', false, 'You cannot think where there is any paper to be had.'); }
      return busy(body, 8, 'going to find paper for your order book', true, () => {
        moveTo(body, bin); body.visited.add(bin); body.known.add(bin); body.book = []; gotPaperAt.push(clock);
        // The clipboard comes out of the bag to have the sheet clipped to it, and stays in the hand.
        if (!body.holding.includes('clipboard')) body.holding.push('clipboard');
        result(body, 'get_paper', true, `You take a sheet of paper and a pen from the paper bin in ${bin}, and clip the sheet to your clipboard.`, { place: bin });
      });
    }
    case 'note': {
      // Writing in the order book: each line as it is given, on the paper it carries.
      const lines: string[] = Array.isArray(args.lines) ? args.lines.filter((line: unknown) => typeof line === 'string') : [];
      if (!body.book) return result(body, 'note', false, 'You have nothing to write on.', { no_paper: 1 });
      if (!lines.length) return result(body, 'note', false, 'You have nothing to write down.');
      // Nothing is written from inside a bag: the clipboard is in the hand.
      if (!body.holding.includes('clipboard')) { if (body.holding.length >= 2) return result(body, 'note', false, 'Your hands are full, so you cannot get your clipboard out to write in it.', { no_paper: 1 }); body.holding.push('clipboard'); }
      body.book.push(...lines);
      return result(body, 'note', true, `You write ${lines.length === 1 ? 'a line' : `${lines.length} lines`} in your order book.`);
    }
    case 'word_passed': {
      // Word of an order was passed on face to face: whoever ordered is not owed a PDA message about it.
      const owedAt = body.notices.findIndex((notice) => notice.to === args.person && (!args.kind || notice.kind === args.kind));
      if (owedAt >= 0) body.notices.splice(owedAt, 1);
      wordPassed.push(`${body.name} of ${args.person}'s${args.kind ? ` (${args.kind})` : ''}`);
      return result(body, 'word_passed', owedAt >= 0, owedAt >= 0 ? 'You have passed word of it on.' : 'You owe nobody word about their crates.');
    }
    case 'open_own_crate': {
      // The Quartermaster opens a crate cargo is holding for it, where it stands in the bay. What was in it is out where it can be got at.
      const entry = heldCrates().find((it) => it.number === Number(args.number));
      if (body.job !== 'Quartermaster' || !entry || entry.for !== body.name) return result(body, 'open_own_crate', false, 'Cargo is not holding a crate by that number for you.', { no_such_crate: 1 });
      if (!entry.heldSince) return result(body, 'open_own_crate', false, `Crate #${entry.number} has not been hauled off the supply shuttle yet.`);
      return busy(body, 6, 'going to open a crate that came for you', true, () => {
        moveTo(body, 'Cargo Bay'); held = held.filter((it) => it !== entry); openedOwn.push(entry.number);
        if (entry.box.contents.includes('paper bin')) paperIn = 'Cargo Bay';
        entry.box.contents = [];
        result(body, 'open_own_crate', true, `You open crate #${entry.number} in Cargo Bay. What was in it is out where you can get at it.`, { number: entry.number });
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
    case 'get_kit': {
      if (!isSecurityJob(body.job)) return result(body, 'get_kit', false, 'The security lockers are not yours to open.');
      const mine = kitOf(body);
      if (mine.baton && mine.cuffs) return result(body, 'get_kit', true, 'You have your baton and your cuffs.', { has_baton: 1, has_cuffs: 1 });
      // In one scenario the lockers give it nothing, as they did in the round of 14:28.
      if (process.argv[3] === 'nobaton') return busy(body, 8, 'going to the security lockers', true, () => { moveTo(body, SEC_OFFICE); secWork.push({ at: clock, who: body.name, tool: 'get_kit', ok: false, reason: 'nothing' }); result(body, 'get_kit', false, 'You find no baton there.', { has_baton: 0, has_cuffs: mine.cuffs ? 1 : 0, reason: 'nothing' }); });
      // One trip to the lockers fetches one thing.
      return busy(body, 8, 'fetching your kit from the security lockers', true, () => {
        moveTo(body, SEC_OFFICE);
        if (!mine.baton) mine.baton = true; else mine.cuffs = true;
        secWork.push({ at: clock, who: body.name, tool: 'get_kit', ok: true });
        result(body, 'get_kit', true, 'You take what you were short of from a locker.', { has_baton: mine.baton ? 1 : 0, has_cuffs: mine.cuffs ? 1 : 0 });
      });
    }
    case 'arrest': {
      const mine = kitOf(body);
      const name = [...body.handles.entries()].find(([, handle]) => handle === args.person)?.[0];
      const npc = bodies.find((other) => other.name === name);
      const them: { name: string; job: string; room: string } | undefined = npc ?? players.find((other) => other.name === name);
      const pun = punPun && punPun.name === name ? punPun : null;
      const note = (ok: boolean, extra: any = {}) => secWork.push({ at: clock, who: body.name, tool: 'arrest', how: args.how, ok, target: name, ...extra });
      const fails = (reason: string, words: string) => { note(false, { reason }); return result(body, 'arrest', false, words, { reason }); };
      if (!isSecurityJob(body.job)) return result(body, 'arrest', false, 'Making arrests is security\'s job.');
      if (!them || !inSight(body, them.room) || pun?.cell) return fails('lost', 'You cannot see that person.');
      if (them.job === 'Captain') return fails('captain', 'You do not lay a hand on the Captain.');
      if (args.how !== 'quiet' && !mine.baton) return fails('no_baton', 'You have no stun baton.');
      if (args.how !== 'stop' && !mine.cuffs && !pun?.cuffed) return fails('no_cuffs', 'You have no cuffs.');
      // A crew NPC stands still for it.
      if (npc && args.how !== 'stop') { npc.inHandUntil = clock + 600_000; npc.busyText = null; npc.walking = false; npc.onDone = null; emit(npc, 'knowledge', `${body.name} is arresting you. You stand still.`, { under_arrest: 1, by: body.name }); }
      if (pun) pun.busy = true;
      // The monkey bites whoever lays a hand on it, while it has bites left in it.
      const bite = () => { if (pun && pun.bites > 0) { pun.bites--; mine.health -= pun.hard; bitten.push({ who: body.name, at: clock }); emit(body, 'knowledge', `${pun.name} bites you.`, { struck_by: args.person, struck_name: pun.name, how: 'hit' }); } };
      if (args.how === 'stop') return busy(body, 5, `stopping ${name}`, false, () => { if (pun) pun.busy = false; note(true, { hits: 2 }); result(body, 'arrest', true, `You stop ${name} with your baton.`, { handle: args.person, hits: 2 }); });
      // It will not stand still for the cuffs alone.
      if (args.how === 'quiet' && pun && !pun.cuffed) return busy(body, 4, `putting the cuffs on ${name}`, false, () => { pun.busy = false; bite(); fails('moved', `${name} would not stand still for the cuffs.`); });
      const hits = args.how === 'force' && !pun?.cuffed ? 2 : 0;
      return busy(body, hits ? 9 : 4, `arresting ${name}`, false, () => {
        // Now and then it gets away from the baton as well.
        if (pun && hits && pun.slips > 0) { pun.slips--; pun.busy = false; bite(); return fails('moved', `${name} got away from your baton.`); }
        if (pun) { bite(); pun.cuffed = true; pun.busy = false; }
        mine.cuffs = false; mine.holding = name!; mine.arrests++;
        note(true, { hits });
        result(body, 'arrest', true, `You cuff ${name} and take them by the arm.`, { handle: args.person, cuffed: 1, hits });
      });
    }
    case 'jail': {
      const mine = kitOf(body);
      const name = mine.holding;
      const note = (ok: boolean, extra: any = {}) => secWork.push({ at: clock, who: body.name, tool: 'jail', ok, target: name ?? undefined, ...extra });
      if (!name) { note(false, { reason: 'no_hold' }); return result(body, 'jail', false, 'You have nobody by the arm.', { reason: 'no_hold' }); }
      const cell = cells.find((it) => !it.occupant && !refusedCells.has(it.name)) ?? cells.find((it) => !it.occupant);
      if (!cell) { note(false, { reason: 'no_cell' }); return result(body, 'jail', false, 'Every cell is in use.', { reason: 'no_cell' }); }
      // In one scenario the first cell will not take anyone, as in the round of 15:52: its door did not open in time.
      if (process.argv[3] === 'badcell' && cell.name === 'Cell 1') return busy(body, 10, `taking ${name} to the brig`, true, () => { moveTo(body, BRIG); refusedCells.add(cell.name); note(false, { reason: 'no_way', cell: cell.name }); result(body, 'jail', false, `You cannot get into ${cell.name} with ${name}.`, { reason: 'no_way', prisoner: name, cell: cell.name }); });
      return busy(body, 10, `taking ${name} to the brig`, true, () => {
        const minutes = Math.min(15, Math.max(1, Number(args.minutes) || 5));
        const npc = bodies.find((other) => other.name === name);
        moveTo(body, BRIG);
        // A crew NPC stands for having the cuffs taken off. Anyone else is left in them.
        if (npc) { moveTo(npc, BRIG); custody.set(name, cell.name); npc.inHandUntil = clock + minutes * 60_000; mine.cuffs = true; emit(npc, 'knowledge', `${body.name} has put you in ${cell.name} for ${minutes} minutes.`, { in_cell: cell.name, minutes }); }
        if (punPun?.name === name) { punPun.room = BRIG; punPun.cell = cell.name; }
        cell.occupant = name; cell.until = clock + minutes * 60_000; cell.by = body.name;
        mine.holding = null;
        note(true, { cell: cell.name, minutes });
        result(body, 'jail', true, `You put ${name} in ${cell.name} and start its timer: ${minutes} minutes.`, { cell: cell.name, minutes, prisoner: name, cuffs_left: npc ? 0 : 1 });
      });
    }
    case 'free': {
      const mine = kitOf(body);
      const name = String(args.person);
      const note = (ok: boolean, extra: any = {}) => secWork.push({ at: clock, who: body.name, tool: 'free', ok, target: name, ...extra });
      if (mine.holding === name) {
        mine.holding = null; mine.cuffs = true;
        const npc = bodies.find((other) => other.name === name);
        if (npc) { npc.inHandUntil = 0; emit(npc, 'knowledge', 'You are free to go.', { set_free: 1 }); }
        if (punPun?.name === name) punPun.cuffed = false;
        walkedFree.push({ who: name, at: clock, why: 'let go' });
        note(true);
        return result(body, 'free', true, `You let go of ${name} and take the cuffs off.`, { freed: name, from: 'hold' });
      }
      // It lets out only someone it put in a cell itself, or can see in one.
      const cell = cells.find((it) => it.occupant === name && (it.by === body.name || body.room === BRIG));
      if (!cell) { note(true, { reason: 'nothing' }); return result(body, 'free', true, `Nothing is holding ${name}.`, { nothing: 1 }); }
      return busy(body, 8, `going to let ${name} out of ${cell.name}`, true, () => {
        moveTo(body, BRIG);
        openCell(cell, 'let out');
        note(true, { cell: cell.name });
        result(body, 'free', true, `You stop the timer on ${cell.name}, and ${name} walks out.`, { freed: name, from: cell.name });
      });
    }
    case 'work_machine': {
      // Engineering staff go to a machine and work it one way. One that is already as asked is left alone.
      const machine = machineList.find((it) => it.id === args.machine);
      if (!/Engineer/.test(body.job)) return result(body, 'work_machine', false, "Working the engine's machines is engineering's job.");
      if (!machine) return result(body, 'work_machine', false, 'You know of no such machine.');
      const how = String(args.how);
      return busy(body, body.room === machine.place ? 3 : 7, 'going to work a machine', true, () => {
        moveTo(body, machine.place); body.visited.add(machine.place); body.known.add(machine.place); body.nextTo = null; body.doorwayOf = null;
        // In one scenario the nitrogen canisters will not go onto their connectors, however often they are tried.
        // In another, the first emitter's controls are locked, so it will not switch off.
        const locked = VARIANT === 'enginelocked' && how === 'switch_off' && machine === emitters()[0];
        const takes = !(VARIANT === 'enginestuck' && how === 'connect') && !locked;
        const before = String(machine.on) + String(machine.full);
        if (takes) { if (how === 'full') machine.full = true; else machine.on = !['off', 'switch_off'].includes(how); }
        const changed = before !== String(machine.on) + String(machine.full);
        machineWork.push({ at: clock, who: body.name, name: machine.name, kind: machine.kind, how, ok: takes, changed, loop: loopRunning() });
        if (changed) machinesSet.set(body.name, (machinesSet.get(body.name) ?? 0) + 1);
        result(body, 'work_machine', takes, takes ? (changed ? 'You work the ' + machine.name + ': ' + how + '.' : 'The ' + machine.name + ' is so already.') : locked ? 'The emitter will not switch off: its controls are locked.' : 'The ' + machine.name + ' will not connect.');
      });
    }
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

// TRUE if one of the security staff has this person by the arm, in cuffs.
const kitsHolding = (name: string) => [...kits.values()].some((mine) => mine.holding === name);
// ---- what the server tells the window about each body, once a second
function uiData(body: Body) {
  const room = rooms[body.room];
  writeOffLost(body);
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
    people_in_view: others.map((other) => ({ handle: handleFor(body, other.name), name: other.name, job: other.job, place: (other as any).room, distance: body.nextTo === other.name || (other as any).nextTo === body.name ? 1 : 4, in_post: body.post && (other as any).room === body.post ? 1 : 0, belongs: body.post && belongsInBay(other) ? 1 : 0, command: isCommand(other) ? 1 : 0, superior: answersTo(body, other) ? 1 : 0, cuffed: (other as any).cuffed || kitsHolding(other.name) ? 1 : 0, down: 0 })),
    things_in_view: [...[...counts].map(([name, count]) => ({ name, count, kind: 'mess' })), ...room.items.map((name) => ({ name, count: 1, kind: 'item' })), ...(room.sink ? [{ name: 'sink', count: 1, kind: 'structure' }] : [])],
    holding: body.holding, cleaning_tool: cleaningTool(body), has_locator: body.hasLocator ? 1 : 0,
    // All it has to clean with is a rag. And the server's count of its work so far.
    poor_tool: cleaningTool(body) === RAG ? 1 : 0, work_done: { cleaned: body.cleaned, put_away: body.tidied, crates_in: body.cratesIn, crates_out: body.cratesOut, machines_set: machinesSet.get(body.name) ?? 0, arrests: kits.get(body.name)?.arrests ?? 0 },
    cleanable_messes: cleaningTool(body) ? [...new Set(room.messes.filter((m) => canShift(body, m)).map((m) => m.name))] : [],
    mess_places: [...new Set(remembered.map((x) => x.place))],
    workable_mess_places: [...new Set(remembered.filter((x) => canShift(body, x.m!) && !shut(x.place)).map((x) => x.place))],
    mop_needs_water: body.holding.includes('mop') && !toolOf(body) && !body.mopWet ? 1 : 0, sink_in_view: room.sink ? 1 : 0, shut_in: isShutIn(body) ? 1 : 0, door_open: isShutIn(body) && doorOpen(body.room) ? 1 : 0, door_held: clock < body.doorHeldUntil ? 1 : 0, door_held_out: clock < body.letOutUntil ? 1 : 0, let_in_by: body.trail.find((entry) => entry.place === body.room)?.by ?? body.letInBy, at_door_of: body.atDoorOf, in_doorway: body.doorwayOf ? 1 : 0,
    // It means to get out, and where to: the room it was in before it first went through a door it could not open. And who else can open the door, once it is shut in.
    wants_out: body.wantsOut ? 1 : 0, way_out_to: body.trail[0]?.from ?? null, door_keepers: isShutIn(body) ? bodies.filter((other) => other.post).map((other) => other.name) : [],
    dry_mop: body.holding.includes('mop') && !toolOf(body) && !body.mopWet && !room.sink ? 1 : 0,
    grenade_messes: 0, doing: body.busyText, post: body.post ?? (body.job === 'Station Engineer' ? 'Engineering' : body.job === 'Security Officer' ? SEC_OFFICE : null), orderable: body.post || body.job === 'Quartermaster' ? Object.keys(CRATES) : [],
    // A Quartermaster's order book, the budget and what things cost. And where a head's staff work, and where a technician knocks for its head.
    book: body.job === 'Quartermaster' ? body.book : null, budget: body.job === 'Quartermaster' ? budget : null, crate_costs: body.job === 'Quartermaster' ? COSTS : null,
    staff_post: body.job === 'Quartermaster' ? 'Cargo Bay' : body.job === 'Chief Engineer' ? 'Engineering' : body.job === 'Head of Security' ? SEC_OFFICE : null, head_office: body.post && quartermaster() ? QM_OFFICE : null,
    order_pending: body.orderPending ? 1 : 0, has_pda: 1, notices: body.notices,
    // Cargo staff know of every crate being held. Everyone else knows only of those put out in the lobby.
    held_crates: heldCrates().filter((entry) => body.post || entry.out).map((entry) => ({ number: entry.number, for: entry.for, what: entry.what, place: entry.out ? 'Cargo Lobby' : 'Cargo Bay', out: entry.out ? 1 : 0, taken_by: entry.takenBy, waited: entry.heldSince ? (clock - entry.heldSince) / 100 : 0 })),
    held_check_due: heldCheckDue(body) ? 1 : 0,
    crate_to_return: body.crateToReturn ? 1 : 0, office: body.office,
    // A head is told which room to call its staff together in.
    meeting_room: body.office ? (VARIANT === 'shutout' ? 'Staff Room' : 'Bar') : null,
    // Its PDA lists everyone else aboard who carries one, with their job.
    pda_people: [...bodies.filter((other) => other !== body), ...players.filter((player) => player.job === 'Captain' || player.job === 'Quartermaster' || player.job === 'Chief Engineer')].map((other) => ({ name: other.name, job: other.job })),
    // For engineering staff: the machines they work, how those in the room with them are set, and what the PDA reads of the engine.
    engineering: /Engineer/.test(body.job) ? { machines: machineList.map((machine) => ({ id: machine.id, name: machine.name, kind: machine.kind, nth: machine.nth, place: machine.place, seen: body.room === machine.place ? { on: machine.on ? 1 : 0, full: machine.full ? 1 : 0 } : null })), reading: { integrity: crystal.integrity, energy: crystal.energy } } : null,
    tidy: body.post ? { todo: (rooms['Cargo Bay'].floor?.length ?? 0) + (rooms['Cargo Lobby'].floor?.length ?? 0) } : null,
    freight: body.post ? {
      shuttle_docked: shuttle.docked ? 1 : 0,
      to_unload: shuttle.docked ? shuttle.aboard.filter((box) => !spent(box)).length : 0,
      empties_aboard: shuttle.docked ? shuttle.aboard.filter(spent).length : 0,
      mail_crate: rooms['Cargo Bay'].boxes.some((box) => box.mail?.length) ? 1 : 0,
      mail_for: [...new Set(body.mail)],
      empty_crates: cargoCrates().filter(spent).length,
      misplaced: cargoCrates().filter((box) => box.byDoor).length,
    } : null,
    // The lobby is the technician's to keep fit to be in. Its PDA lists every janitor aboard.
    look_in_rooms: body.post ? ['Delivery Office'] : [], closed_rooms: body.post ? [body.post, 'Delivery Office'] : [],
    // Which of those lie inside another of them.
    rooms_through: body.post && NESTED ? { 'Delivery Office': 'Cargo Bay' } : {},
    work_area_messes: body.post ? Object.fromEntries(['Cargo Lobby', body.post, 'Delivery Office'].filter((place) => remembered.some((x) => x.place === place)).map((place) => [place, [...new Set(remembered.filter((x) => x.place === place).map((x) => x.m!.name))].slice(0, 3)])) : {},
    workmate_called: body.post && janitorCall && janitorCall.by !== body.name && clock - janitorCall.at < 600_000 ? 1 : 0,
    in_hand: clock < body.inHandUntil ? 1 : 0,
    // The cell it is held in. And for security staff: their kit, who they have by the arm, how well they are, and the cells, which are only seen from the brig.
    custody: custody.get(body.name) ?? null,
    security: isSecurityJob(body.job) ? { has_baton: kitOf(body).baton ? 1 : 0, has_cuffs: kitOf(body).cuffs ? 1 : 0, holding: kitOf(body).holding, health: kitOf(body).health, baton_seen: null, cells: cells.map((cell) => (body.room === BRIG ? { name: cell.name, running: cell.occupant ? 1 : 0, left: cell.occupant ? Math.round((cell.until - clock) / 1000) : 0, occupants: cell.occupant ? [cell.occupant] : [] } : { name: cell.name, running: null, left: null, occupants: null })) } : null,
    out_of_bounds: LOCKED.includes(body.room) && !hasKeys(body) ? 1 : 0,
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
// A technician and a janitor, with the delivery office inside the bay and nothing to clean in the
// bay itself: the janitor is let into the bay only because the way to the delivery office is through it.
function spawnNested() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')];
  rooms['Cargo Bay'].messes = [];
  return crew;
}
// A technician, a janitor let into the bay to clean a good deal of mess, and the Captain standing
// in the bay, who gives an order about it: to the technician to put the janitor out, or to the
// janitor to leave.
function spawnCaptainInBay() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')];
  for (let i = 0; i < 8; i++) rooms['Cargo Bay'].messes.push(mess('dirt'));
  players.push({ name: 'Ada Stone', job: 'Captain', room: 'Cargo Bay' });
  return crew;
}
let captainSpokeAt = 0;
// A technician alone, with a loaded crate that someone has left right by the lobby door.
function spawnByDoor() {
  const crew = [spawn('Cora Tech', 'Cargo Technician')];
  rooms['Cargo Lobby'].boxes.push({ name: 'supply crate', contents: ['wrench'], openedBy: new Set(), crate: true, byDoor: true });
  return crew;
}
// When the crate a head ordered, and never came for, is destroyed where it stands in the bay.
const CRATE_LOST_AT = 120;
let crateLostAt = 0;
// Two technicians, and a head who orders at the counter and does not send anyone for what comes.
function spawnWaiting() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Vik Hale', 'Cargo Technician')];
  players.push({ name: 'Hal Pott', job: 'Head of Personnel', room: 'Cargo Lobby' });
  return crew;
}
const WRONG_NUMBER_AT = 1260;
const RIGHT_NUMBER_AT = 1300;
// A head with a technician and three janitors under it. One of the janitors starts the shift with
// nothing but a rag, and the Captain is aboard, somewhere out of everyone's sight unless said otherwise.
const CAPTAIN = 'Zim Fire';
function spawnStaffed(technicians: string[], captainIn = 'Bridge') {
  const crew = [spawn('Hop Kins', 'Head of Personnel'), ...technicians.map((name) => spawn(name, 'Cargo Technician')), spawn('Jan Itor', 'Janitor'), spawn('Mo Pper', 'Janitor'), spawn('Sue Ds', 'Janitor')];
  crew.at(-1)!.holding.push(RAG);
  players.push({ name: CAPTAIN, job: 'Captain', room: captainIn });
  return crew;
}
// What a round starts with: a head, two technicians and three janitors.
function spawnCrew() {
  return spawnStaffed(['Cora Tech', 'Vik Hale']);
}
// One technician, and a head at the counter who orders two kinds of crate in one breath.
function spawnMixed() {
  const crew = [spawn('Cora Tech', 'Cargo Technician')];
  players.push({ name: 'Hal Pott', job: 'Head of Personnel', room: 'Cargo Lobby' });
  return crew;
}
// The whole crew, with a Quartermaster over the two technicians.
function spawnWithQuartermaster() {
  const crew = spawnCrew();
  crew.push(spawn('Ada Finch', 'Quartermaster'));
  return crew;
}
// A Quartermaster and one technician. A head of another department sends its order by PDA from elsewhere aboard, and the Captain is on the bridge.
function spawnOrderDesk() {
  const crew = [spawn('Ada Finch', 'Quartermaster'), spawn('Cora Tech', 'Cargo Technician')];
  players.push({ name: 'Hal Pott', job: 'Head of Personnel', room: 'Bridge' }, { name: CAPTAIN, job: 'Captain', room: 'Bridge' });
  return crew;
}
// A Quartermaster and two technicians, so that there is a second one to send.
function spawnStuckDesk() {
  const crew = [spawn('Ada Finch', 'Quartermaster'), spawn('Cora Tech', 'Cargo Technician'), spawn('Vik Hale', 'Cargo Technician')];
  players.push({ name: 'Hal Pott', job: 'Head of Personnel', room: 'Bridge' }, { name: CAPTAIN, job: 'Captain', room: 'Bridge' });
  return crew;
}
// The usual crew with one technician, and a Quartermaster who is aboard and never answers: it is not one of the NPCs.
function spawnQuartermasterGone() {
  const crew = spawnStaffed(['Cora Tech']);
  players.push({ name: 'Ada Finch', job: 'Quartermaster', room: QM_OFFICE });
  return crew;
}
// The scenarios about the Quartermaster's desk alone: no janitors, no meeting, one order.
const DESK = VARIANT === 'qmbig' || VARIANT === 'qmno' || VARIANT === 'qmquiet' || VARIANT === 'qmpoor' || VARIANT === 'qmpaper' || VARIANT === 'qmlost' || VARIANT === 'qmwait' || VARIANT === 'qmstuck';
// How many of the Quartermaster's questions the Captain has answered, in the scenarios where it answers.
let captainAnswers = 0;
let captainAnsweredAt = 0;
// The engineering staff: a Chief Engineer in its office and one engineer at its post, with a Captain aboard to be told things.
// In one scenario the Chief Engineer is not an NPC, and never says a word.
function spawnEngine() {
  const staff: Body[] = [];
  if (VARIANT === 'engalone') players.push({ name: 'Ada Volt', job: 'Chief Engineer', room: CE_OFFICE });
  else { const ada = spawn('Ada Volt', 'Chief Engineer'); ada.office = CE_OFFICE; ada.room = CE_OFFICE; staff.push(ada); }
  const sam = spawn('Sam Rees', 'Station Engineer'); sam.room = 'Engineering'; staff.push(sam);
  for (const body of staff) for (const place of ['Engineering', ENGINE_ROOM, CE_OFFICE]) body.known.add(place);
  players.push({ name: 'Cap Tain', job: 'Captain', room: 'Bridge' });
  return staff;
}
// The scenarios with a whole crew aboard: everything in them is done, the bay and the mail included.
// The security scenarios. A Head of Security and one officer, except where there is no head; the Captain, who is no NPC; and either the bar's monkey or a head of
// department to arrest. Where the warrant goes all the way round, there is a Head of Personnel with two janitors to hear it read out.
const SEC_CAPTAIN = 'Zim Fire';
function spawnSecurity() {
  const staff: Body[] = [];
  if (VARIANT !== 'nohos') { const joan = spawn('Joan Marsh', 'Head of Security'); joan.office = HOS_OFFICE; joan.room = HOS_OFFICE; staff.push(joan); }
  const hale = spawn('Hale Stone', 'Security Officer'); hale.room = SEC_OFFICE; staff.push(hale);
  for (const body of staff) for (const place of [SEC_OFFICE, HOS_OFFICE, BRIG]) body.known.add(place);
  players.push({ name: SEC_CAPTAIN, job: 'Captain', room: 'Bridge' });
  if (VARIANT === 'warrant') staff.push(spawn('Hop Kins', 'Head of Personnel'), spawn('Jan Itor', 'Janitor'), spawn('Mo Pper', 'Janitor'));
  if (VARIANT === 'arresthead' || VARIANT === 'pardon') staff.push(spawn('Hop Kins', 'Head of Personnel'));
  if (VARIANT !== 'arresthead' && VARIANT !== 'pardon') {
    // In the long scenario the monkey keeps out of everyone's way until the list has been read out, and then goes round where people are. In the rest it sits in the Bar.
    punPun = { name: 'Pun Pun', job: '', room: VARIANT === 'warrant' ? 'Library' : 'Bar', route: VARIANT === 'warrant' ? ['Bar', HOP_OFFICE] : [], from: 300, every: 70, movedAt: 0, cuffed: false, cell: null, busy: false, bites: VARIANT === 'fight' ? 1 : VARIANT === 'hurt' ? 2 : 0, hard: VARIANT === 'hurt' ? 30 : 10, slips: VARIANT === 'hurt' ? 1 : 0 };
    players.push(punPun);
  }
  return staff;
}
const SECURITY_SECONDS = VARIANT === 'warrant' ? 840 : VARIANT === 'arresthead' || VARIANT === 'nobaton' ? 480 : 360;
// When the Captain declares its warrant, by PDA, to whoever keeps security's list; when it then says where they are; and when, in the one scenario, it pardons them.
const WARRANT_AT = 20;
const SIGHTING_AT = 45;
const PARDON_AT = 150;
function securityTick(second: number) {
  for (const cell of cells) if (cell.occupant && clock >= cell.until) openCell(cell, 'time up');
  const pun = punPun;
  if (pun && pun.route.length && !pun.cuffed && !pun.cell && !pun.busy && second >= pun.from && clock - pun.movedAt >= pun.every * 1000) { pun.room = pun.route[(pun.route.indexOf(pun.room) + 1) % pun.route.length]; pun.movedAt = clock; }
  const desk = bodies.find((other) => other.job === 'Head of Security') ?? bodies.find((other) => other.job === 'Security Officer')!;
  const onHead = VARIANT === 'arresthead' || VARIANT === 'pardon';
  if (second === WARRANT_AT) playerMessages(SEC_CAPTAIN, desk, VARIANT === 'loose' ? 'could you see that Pun Pun spends ten minutes behind bars' : onHead ? 'Warrant for Hop Kins, for theft.' : 'Warrant for Pun Pun, for wrecking the Custodial Closet.');
  // Told it was not followed, the Captain says it again in the words it was given.
  if (second === WARRANT_AT + 15 && VARIANT === 'loose' && MODE === 'dead') playerMessages(SEC_CAPTAIN, desk, 'Warrant for Pun Pun, 10 minutes.');
  if (second === SIGHTING_AT && VARIANT !== 'warrant') playerMessages(SEC_CAPTAIN, desk, onHead ? "Hop Kins is in the Head of Personnel's Office." : 'Pun Pun is in the Bar.');
  if (second === PARDON_AT && VARIANT === 'pardon') playerMessages(SEC_CAPTAIN, desk, 'Pardon Hop Kins.');
}
const FULL = !VARIANT || VARIANT === 'crew' || VARIANT === 'shutout' || VARIANT === 'qm' || VARIANT === 'qmgone';
const HOP_ORDERS_AT = 90;
const CAPTAIN_ORDERS_AT = 150;
// When the Captain, standing in the head's office, tells it to find out how its section is doing: once the head is back there after this.
const CAPTAIN_ASKS_AFTER = 420;
let captainAskedAt = 0;
const crew = SECURITY ? spawnSecurity() : ENGINE ? spawnEngine() : VARIANT === 'qm' ? spawnWithQuartermaster() : VARIANT === 'qmgone' ? spawnQuartermasterGone() : VARIANT === 'qmstuck' ? spawnStuckDesk() : DESK ? spawnOrderDesk() : VARIANT === 'bydoor' ? spawnByDoor() : VARIANT === 'lost' ? spawnWaiting() : VARIANT === 'evict' || VARIANT === 'leave' || VARIANT === 'aside' ? spawnCaptainInBay() : VARIANT === 'nested' ? spawnNested() : VARIANT === 'office' ? [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')] : VARIANT === 'alarm' || VARIANT === 'alarmagain' ? [spawn('Jan Itor', 'Janitor')] : VARIANT === 'rounds' ? [spawn('Cora Tech', 'Cargo Technician')] : VARIANT === 'orders' ? spawnOrders() : VARIANT === 'waiting' ? spawnWaiting() : VARIANT === 'mixed' ? spawnMixed() : VARIANT === 'vouch' ? spawnVouch() : VARIANT === 'trapped' ? spawnTrapped() : VARIANT === 'solo' ? [spawn('Jan Itor', 'Janitor')] : VARIANT === 'crew' ? spawnCrew() : spawnStaffed(['Cora Tech'], VARIANT === 'captain' ? HOP_OFFICE : 'Bridge');
// The delivery office takes longer: it is only found on a quiet look round, and then someone has to be sent for.
// With a head aboard, nothing is ordered until the staff meeting two minutes in has been held.
// A crate nobody comes for is chased three times, five minutes or so apart, before it is asked for.
const SECONDS = SECURITY ? SECURITY_SECONDS : ENGINE ? 780 : VARIANT === 'qmwait' ? 560 : VARIANT === 'qmquiet' || VARIANT === 'qmpoor' || VARIANT === 'qmlost' || VARIANT === 'qmstuck' ? 480 : VARIANT === 'qmpaper' ? 420 : VARIANT === 'qmbig' || VARIANT === 'qmno' ? 300 : VARIANT === 'waiting' ? 1380 : VARIANT === 'nested' ? 1080 : VARIANT === 'office' ? 900 : FULL || DOORWAY || VARIANT === 'captain' ? 720 : VARIANT === 'mixed' ? 420 : 540;
// When someone pulls a fire alarm in the room the janitor is in, in the scenarios about that.
const ALARM_PULLED_AT = 45;
// With a Quartermaster who does not answer, the order, and the mail that comes with it, are three minutes later.
const PAT_COMES_AT = VARIANT === 'qmgone' ? 600 : 420;
for (let second = 0; second < SECONDS; second++) {
  clock += 1000; serverNow += 10;
  for (const body of bodies) {
    // Pushed back out of the meeting room, into its doorway, by whoever came through. From there it still sees and hears the room.
    if (body.bumpAt && clock >= body.bumpAt && !body.busyText) { body.bumpAt = 0; if (body.room === 'Bar' && meetingOn()) { moveTo(body, 'Central Primary Hallway'); body.doorwayOf = 'Bar'; body.nextTo = null; bumps.push({ who: body.name, at: clock }); } }
    if (body.busyText && clock >= body.busyUntil && !(body.walking && clock < body.stillUntil)) { const done = body.onDone; body.busyText = null; body.walking = false; body.onDone = null; done?.(); }
    if (body.orderPending && clock >= body.dockAt) {
      body.orderPending = false;
      shuttle.docked = true; shuttle.aboard.push({ name: 'mail crate', contents: [], openedBy: new Set(), mail: ['Pat Rick'], crate: true });
      // Each crate of the order comes with its own manifest number, and is held for collection from here on.
      const numbers: number[] = [];
      // What kind each of them is, in the same order as the numbers.
      const kinds: string[] = [];
      for (const item of body.orderItems.length ? body.orderItems : [{ crate: 'Janitorial Supplies Crate', count: body.orderCount }]) {
        for (let i = 0; i < item.count; i++) {
          const box: Box = { name: CRATES[item.crate].box, contents: [...CRATES[item.crate].contents], openedBy: new Set(), crate: true };
          shuttle.aboard.push(box);
          held.push({ box, number: nextOrderNumber, for: body.orderFor, what: item.crate, heldSince: 0, reminders: 0, out: false, takenBy: null });
          numbers.push(nextOrderNumber++); kinds.push(item.crate);
        }
      }
      if (body.orderFor) body.notices.push({ to: body.orderFor, kind: 'arrived', numbers, what: new Set(kinds).size === 1 ? kinds[0] : null, kinds, via: body.orderVia, ref: body.orderRef });
      result(body, 'order', true, `The supply shuttle has docked with what you ordered: ${written(numbers)}. It is held in the bay until someone comes to the counter with the number.`, { numbers });
    }
  }
  // Cargo's budget gains its income every five minutes.
  if (second > 0 && second % INCOME_EVERY === 0) budget += INCOME;
  // A head of another department sends the Quartermaster its order by PDA: three crates, more than 1,000 credits' worth, or two, more than the budget holds.
  if ((VARIANT === 'qmbig' || VARIANT === 'qmno' || VARIANT === 'qmquiet') && second === 20) playerMessages('Hal Pott', bodies[0], 'I need to order two crates of janitorial supplies and a crate of replacement lights for my staff, please.');
  if (VARIANT === 'qmpoor' && second === 20) playerMessages('Hal Pott', bodies[0], 'I need to order two crates of janitorial supplies for my staff, please.');
  // One crate, well within the budget: nothing the Captain has to be asked about.
  if ((VARIANT === 'qmlost' || VARIANT === 'qmwait' || VARIANT === 'qmstuck') && second === 20) playerMessages('Hal Pott', bodies[0], 'I need to order a crate of janitorial supplies for my staff, please.');
  // The Captain answers the Quartermaster a little after being asked, in the scenarios where it answers at all.
  // Each question is answered once, yes, except where the scenario is the Captain saying no, or saying nothing.
  const quartermasterBody = bodies.find((other) => other.job === 'Quartermaster');
  if (quartermasterBody && VARIANT !== 'qmquiet' && captainAsked.length > captainAnswers && clock - captainAsked[captainAnswers].at >= 15_000) { captainAnswers++; captainAnsweredAt ||= clock; playerMessages(CAPTAIN, quartermasterBody, VARIANT === 'qmno' ? 'No. Not this shift.' : 'Yes, go ahead.'); }
  // Whoever the mail is for comes to the counter some minutes after it has arrived.
  if (second === PAT_COMES_AT && (FULL || DOORWAY || VARIANT === 'captain')) players.push({ name: 'Pat Rick', job: 'Botanist', room: 'Cargo Lobby' });
  if ((VARIANT === 'alarm' || VARIANT === 'alarmagain') && second >= ALARM_PULLED_AT && !alarmPulled && !bodies[0].walking) { fireAlarm = bodies[0].room; alarmPulled = true; }
  // Pulled again as soon as it is reset: a real problem, or someone who will not leave it alone.
  if (clock >= repullAt) { fireAlarm = bodies[0].room; repullAt = Infinity; }
  // The Captain gives its order once the janitor has been let into the bay and has started on the mess there.
  if ((VARIANT === 'evict' || VARIANT === 'leave' || VARIANT === 'aside') && !captainSpokeAt && bodies[1].room === 'Cargo Bay' && bodies[1].busyText?.startsWith('cleaning')) { captainSpokeAt = clock; playerSays('Ada Stone', VARIANT === 'evict' ? 'Cora, throw this janitor out.' : VARIANT === 'leave' ? 'Jan, leave.' : 'Jan, could you step aside, please? I need to get past you.'); }
  // A head orders a crate and does not come for it. Once it is off the shuttle and held in the bay, it is destroyed. Later the head asks for it.
  if (VARIANT === 'lost' && second === 20) playerSays('Hal Pott', 'Cora, I need to order a crate of janitorial supplies, please.');
  if ((VARIANT === 'lost' || VARIANT === 'qmlost') && !crateLostAt && second >= CRATE_LOST_AT && held[0]?.heldSince && !held[0].lost) { const gone = held[0]; gone.lost = 'it has been destroyed'; rooms['Cargo Bay'].boxes = rooms['Cargo Bay'].boxes.filter((box) => box !== gone.box); crateLostAt = clock; }
  if (VARIANT === 'lost' && crateLostAt && clock - crateLostAt === 90_000) playerSays('Hal Pott', 'Cora, I am here to collect crate 4521, please.');
  if (VARIANT === 'orders' && second === HOP_ORDERS_AT) playerSays('Hal Pott', 'Cora, go and look at the Custodial Closet and report back to me.');
  if (VARIANT === 'orders' && second === CAPTAIN_ORDERS_AT) playerSays('Ada Stone', 'Cora, go and look at the Bar and report back to me.');
  // A head orders a crate at the counter and then leaves it sitting there. Much later it asks for it: first by a number that is no crate's, then by the right one.
  if (VARIANT === 'waiting' && second === 20) playerSays('Hal Pott', 'Cora, I need to order a crate of janitorial supplies, please.');
  // Two kinds of crate, asked for in one breath.
  if (VARIANT === 'mixed' && second === 20) playerSays('Hal Pott', 'Cora, I need to order two crates of janitorial supplies and a crate of replacement lights, please.');
  // The Captain tells the head to find out how its section is doing, well after the first meeting, when the head is back in its office.
  if (VARIANT === 'captain' && !captainAskedAt && second >= CAPTAIN_ASKS_AFTER && bodies[0].room === HOP_OFFICE && !bodies[0].busyText) { captainAskedAt = clock; playerSays(CAPTAIN, 'Hop, find out how your section is doing.'); }
  if (VARIANT === 'waiting' && second === WRONG_NUMBER_AT) playerSays('Hal Pott', 'Cora, I am here to collect crate 9999, please.');
  if (VARIANT === 'waiting' && second === RIGHT_NUMBER_AT) playerSays('Hal Pott', 'Cora, I am here to collect crate 4521, please.');
  if (ENGINE) engineTick();
  if (SECURITY) securityTick(second);
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
if (VARIANT !== 'rounds' && VARIANT !== 'alarmagain' && VARIANT !== 'waiting' && VARIANT !== 'mixed' && VARIANT !== 'bydoor' && VARIANT !== 'lost' && !DESK && !ENGINE && !SECURITY) check(`every mess a janitor can get to is cleaned (started with ${messId}${bayCounts ? ', one of them behind the bay door' : '; the one in the bay does not count'})`, left.length === 0, left.length ? `left: ${Object.entries(rooms).filter(([, room]) => room.messes.length).map(([name, room]) => `${name}: ${room.messes.map((m) => m.name).join(', ')}`).join('; ')}` : '');
const janitors = crew.filter((body) => body.job === 'Janitor');
check('every janitor ends with something to clean with', janitors.every((body) => body.holding.some((item) => /mop|space cleaner|soap/.test(item))), janitors.map((body) => `${body.name}: ${body.holding.join(', ') || 'nothing'}`).join('; '));
const bayTries = janitors.map((body) => body.bayFails);
// A room it failed to get into is left alone for five minutes and then tried again: the longer runs have time for one more try.
check('no janitor keeps walking at a room it cannot get into', bayTries.every((tries) => tries <= (FULL || SECURITY ? 3 : 2)), `tries at the Cargo Bay: ${bayTries.join(', ')}`);
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
  check('nobody asks the Captain or a head their business', !crew.some((body) => body.said.some((line) => /Ada|Hal/.test(line) && /why are you in here|out you go/i.test(line))));
}
// A crate left by a door is hauled clear of it, once, and the technician goes back to its post.
if (VARIANT === 'bydoor') {
  const cora = crew[0];
  check('a crate left right by a door is hauled to a clear spot, once', stowed.length === 1 && stowed[0].startsWith('supply crate') && cora.log.filter((line) => / stow_crate/.test(line)).length === 1, stowed.join(', ') || 'it was left where it lay');
  check('it is not sent back on the shuttle or emptied: it is only moved', rooms['Cargo Lobby'].boxes.some((box) => box.name === 'supply crate' && box.contents.length === 1 && !box.byDoor));
}
// Asked to step aside, a janitor moves there and then, and does not go straight back to the spot.
if (VARIANT === 'aside') {
  const jan = crew[1];
  const moved = steppedAside.find((step) => step.who === jan.name);
  const stamped = (at: number) => new Date(at).toISOString().slice(11, 19);
  check('the janitor is asked while it is in the middle of scrubbing the bay', captainSpokeAt > 0);
  check('asked to step aside, it does, within a few seconds, dropping what it was at', !!moved && moved.at - captainSpokeAt <= 6000, moved ? `${(moved.at - captainSpokeAt) / 1000}s after being asked` : 'it never moved');
  const backAt = jan.log.find((line) => moved && line.slice(0, 8) > stamped(moved.at) && / clean/.test(line))?.slice(0, 8);
  check('it stays out of the way a little while before it takes up its work again', !!moved && !!backAt && backAt >= stamped(moved.at + 12000), backAt ? `back at it at ${backAt}, having moved at ${moved ? stamped(moved.at) : '?'}` : 'it never went back to its work');
  check('it steps aside once for one asking', steppedAside.filter((step) => step.who === jan.name).length === 1, `${steppedAside.length} time(s)`);
  check('and the bay is still cleaned in the end', rooms['Cargo Bay'].messes.length === 0, `left: ${rooms['Cargo Bay'].messes.length}`);
}
// A crate that was being held is destroyed: one technician writes it off aloud, whoever ordered it is told, and nobody is chased about it or handed anything.
if (VARIANT === 'lost') {
  const techLog = crew.flatMap((body) => body.log);
  const said = crew.flatMap((body) => body.said);
  check('the crate is held in the bay, and is then lost', crateLostAt > 0);
  check('one of the technicians writes it off, saying so aloud with the number and why', writtenOff.length === 1 && said.filter((line) => /^Crate 4521 for Hal Pott is lost: it has been destroyed/.test(line)).length === 1, writtenOff.join(', ') || 'nobody wrote it off');
  const word = techLog.filter((line) => / message /.test(line) && /Lost at cargo: crate #4521/.test(line) && line.includes('"person":"Hal Pott"'));
  check('whoever ordered it is told by PDA, once, that it is lost and why', word.length === 1 && /destroyed/.test(word[0]), `${word.length} message(s)`);
  check('nobody goes on reminding them that it is waiting', !techLog.some((line) => /Still waiting at cargo/.test(line)) && claims.length === 0, `${claims.length} look(s)`);
  check('asked for at the counter afterwards, cargo says it has no such crate and brings nothing out', released.length === 0 && said.some((line) => /not holding a crate by that number/i.test(line)), said.filter((line) => /4521|not holding/i.test(line)).join(' | ') || 'nothing said');
}
// The Captain's word about someone in a locked room is carried out, not argued with.
if (VARIANT === 'evict' || VARIANT === 'leave') {
  const cora = crew[0];
  const jan = crew[1];
  const since = (line: string) => line.slice(0, 8) >= new Date(captainSpokeAt).toISOString().slice(11, 19);
  const cleanedAfter = jan.log.filter((line) => since(line) && /Cargo Bay +clean/.test(line)).length;
  const backIn = jan.log.filter((line) => since(line) && (line.includes('go_to {"place":"Cargo Bay"}') || line.includes('go_to_door {"place":"Cargo Bay"}'))).length;
  check('the Captain gets to give the order: the janitor was let into the bay and started on the mess', captainSpokeAt > 0, captainSpokeAt ? '' : 'the janitor never got into the bay');
  if (VARIANT === 'evict') {
    check('ordered by the Captain to put the janitor out, the technician says it will', cora.said.some((line) => /^Yes, Captain\b.*putting Jan out/i.test(line)), cora.said.filter((line) => /captain/i.test(line)).join(' | ') || 'nothing said to the Captain');
    check('it tells the janitor so, and walks them out by the arm, though it sent for them itself', cora.said.some((line) => /Jan\b.*the Captain wants you out of here/i.test(line)) && putOut.filter((name) => name === jan.name).length === 1, `walked out: ${putOut.join(', ') || 'nobody'}`);
  } else {
    check('told by the Captain to leave, the janitor says it is going', jan.said.some((line) => /^Yes, Captain\b/i.test(line)), jan.said.join(' | ') || 'nothing said');
    check('it goes: it asks to be let out to where it came in from, and is', jan.said.some((line) => /let me out to the Cargo Lobby/i.test(line)) && (opened.includes(`out:${jan.name}`) || putOut.includes(jan.name)), `${opened.join(', ')}${putOut.length ? `; walked out: ${putOut.join(', ')}` : ''}`);
  }
  check('the janitor does no more cleaning in there once the order is given', cleanedAfter === 0, `${cleanedAfter} time(s)`);
  check('and does not go straight back in', backIn === 0 && jan.room !== 'Cargo Bay', `${backIn} tr${backIn === 1 ? 'y' : 'ies'}; ends in ${jan.room}`);
  check('nobody lays a hand on the Captain, or asks them their business', !putOut.includes('Ada Stone') && !crew.some((body) => body.said.some((line) => /Ada\b.*why are you in here/i.test(line))));
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
  if (VARIANT === 'nested') {
    const jan = crew.find((body) => body.job === 'Janitor')!;
    const lets = opened.filter((entry) => entry.includes(jan.name));
    check('finding a mess in the delivery office, the technician sends for a janitor', tech.log.some((line) => / message /.test(line) && /mess in the Delivery Office/.test(line)));
    check('the janitor, told the office is inside the bay, asks at the bay door first', jan.log.some((line) => line.includes('go_to_door {"place":"Cargo Bay"}')) && knocks.includes(`${jan.name}@Cargo Bay`), knocks.join(', ') || 'no knock');
    check('it is let through the bay, which has no mess of its own, and then into the delivery office', lets.indexOf(`in:${jan.name}`) >= 0 && lets.indexOf(`in:${jan.name}@Delivery Office`) > lets.indexOf(`in:${jan.name}`), lets.join(', ') || 'the doors were never opened');
    check('the mess in there is cleaned', rooms['Delivery Office'].messes.length === 0, `left: ${rooms['Delivery Office'].messes.length}`);
    const outOffice = lets.indexOf(`out:${jan.name}@Delivery Office`);
    const outBay = lets.lastIndexOf(`out:${jan.name}`);
    check('it is let out the way it came: out of the delivery office, then out of the bay', outOffice >= 0 && outBay > outOffice, lets.join(', '));
    check('and ends up out of cargo, not left behind either door', !LOCKED.includes(jan.room) && jan.trail.length === 0 && !jan.wantsOut, `ends in ${jan.room}`);
    const asked = [...jan.said, ...jan.log.filter((line) => / message /.test(line))].filter((line) => /let me out/i.test(line));
    check('each time it asks to be let out it says where it is trying to get to', asked.length >= 1 && asked.every((line) => /out to the Cargo Lobby/.test(line)), asked.map((line) => line.match(/"text":"([^"]*)"/)?.[1] ?? line).join(' | ') || 'it never asked');
    check('it does not nag: each door is knocked at or asked for a few times at most', knocks.filter((entry) => entry.startsWith(jan.name)).length <= 6 && asked.length <= 6, `${knocks.length} knock(s), ${asked.length} ask(s)`);
  }
  const orders = techLog.filter((line) => /^\S+ .{24} order( |$)/.test(line)).length;
  const ordered = janitors.length > 2 || VARIANT === 'waiting' || VARIANT === 'mixed' || VARIANT === 'lost' || VARIANT === 'qmbig' || VARIANT === 'qmpoor' || VARIANT === 'qmpaper' || VARIANT === 'qmwait' || VARIANT === 'qmstuck';
  // A crate that is lost is ordered again: two orders, one after the other.
  if (VARIANT === 'qmlost') check('two orders were placed: the one the head sent, and the same again when its crate was lost', orders === 2, `orders: ${orders}`);
  else check(ordered ? 'exactly one order was placed, by one technician' : 'no order was needed', ordered ? orders === 1 : orders === 0, `orders: ${orders}`);
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
// A head ordering two kinds of crate in one breath: one order for both, and each crate told apart when it comes.
if (VARIANT === 'mixed') {
  const techLog = crew.flatMap((body) => body.log);
  check('two kinds of crate asked for in one breath go in one order: two of the one and one of the other', orderKinds.length === 1 && orderKinds[0] === '2 Janitorial Supplies Crate + 1 Replacement Lights', orderKinds.join('; ') || 'nothing was ordered');
  const word = techLog.filter((line) => / message /.test(line) && /Your order has come in/.test(line));
  check('whoever ordered is sent the manifest number of every crate, with what each one is', word.length === 1 && /crates #4521 and #4522 \(Janitorial Supplies Crate\); crate #4523 \(Replacement Lights\)/.test(word[0]), word[0]?.match(/"text":"([^"]*)"/)?.[1] ?? 'no message');
}
// A Quartermaster aboard: every order goes through it, into its order book, and to a technician face to face.
const qm = crew.find((body) => body.job === 'Quartermaster');
if (qm) {
  const firstOf = (name: string) => name.split(' ')[0];
  const techNames = techs.map((body) => body.name);
  const sentBy = (body: Body, to: string, words: RegExp) => body.log.filter((line) => / message /.test(line) && line.includes(`"person":"${to}"`) && words.test(line));
  const textOf = (line: string | undefined) => line?.match(/"text":"([^"]*)"/)?.[1];
  const book = qm.book ?? [];
  const inBook = (words: RegExp) => book.some((line) => words.test(line));
  // In one scenario the order is the Quartermaster's own: paper, which it could not find.
  const own = VARIANT === 'qmpaper';
  const orderer = own ? qm.name : VARIANT === 'qm' ? 'Hop Kins' : 'Hal Pott';
  const ordererJob = own ? 'Quartermaster' : 'Head of Personnel';
  const seconds = (at: number) => Math.round((at - 1_000_000) / 1000);
  check('the Quartermaster finds paper for its order book, once, before anything else', gotPaperAt.length === 1 && / get_paper/.test(qm.log[0] ?? '') && qm.book !== null, `${gotPaperAt.length} time(s); first step: ${qm.log[0] ?? 'none'}`);
  const noted = sentBy(qm, orderer, /Noted, order 1: /);
  check(own ? 'it takes its own order down under a number, like anyone\'s, and sends nobody word of it' : 'it takes the order down under a number, and sends word back that it is noted, once', noted.length === (own ? 0 : 1) && inBook(new RegExp(`^Order 1\\. From ${orderer}, ${ordererJob}: .* \\d+ cr\\.$`)), textOf(noted[0]) ?? (own ? book[0] ?? 'nothing written' : 'no word sent back'));
  check('nothing passes between the Quartermaster and its technicians by PDA', !techNames.some((name) => sentBy(qm, name, /./).length > 0) && !techs.some((body) => sentBy(body, qm.name, /./).length > 0));
  check('the Quartermaster places no order and hauls no crate itself', !qm.log.some((line) => /^\S+ .{24} (order|unload|release|recycle|send_shuttle|collect_crate|check_held|tidy|open_door)( |$)/.test(line)));
  const gives = qm.said.filter((line) => /, order 1: I need to order /.test(line));
  const givenAt = spoken.find((line) => line.who === qm.name && /, order 1: I need to order /.test(line.text))?.at ?? 0;
  if (VARIANT === 'qm' || VARIANT === 'qmbig' || VARIANT === 'qmpoor' || VARIANT === 'qmpaper' || VARIANT === 'qmlost' || VARIANT === 'qmwait') {
    // A crate that is lost is ordered again, so there are two orders in that scenario.
    const placedWanted = VARIANT === 'qmlost' ? 2 : 1;
    check('it gives the order to a technician face to face, by name, in so many words', gives.length >= 1 && gives.length <= 2 && gives.every((line) => techNames.some((name) => line.startsWith(`${firstOf(name)}, order 1: `)) && line.includes(`, for ${orderer}.`)), gives.join(' | ') || 'never given');
    check('the technician says it has the order, and places it for whoever ordered', techs.some((body) => body.said.some((line) => /order 1\b.*right away/i.test(line))) && ordersPlaced.length === placedWanted && ordersPlaced.every((entry) => entry.endsWith(`for ${orderer}`)), ordersPlaced.join('; ') || 'nothing was placed');
    const told = techs.flatMap((body) => body.said.filter((line) => new RegExp(`^${firstOf(qm.name)}, order 1 has come in: crates? #4521`).test(line)));
    const passedOn = wordPassed.filter((entry) => entry.endsWith('(arrived)')).length;
    check('when it comes in the technician tells the Quartermaster face to face, once, knocking at its office door if it has to', told.length === 1 && passedOn === placedWanted, `said ${told.length} time(s); knocks: ${knocks.join(', ') || 'none'}`);
    const word = sentBy(qm, orderer, /Your order has come in: crates? #4521/);
    check(own ? 'nobody is sent word of its own order coming in: it is its own' : 'the Quartermaster sends whoever ordered the number of every crate, once, and no technician does', word.length === (own ? 0 : 1) && !techs.some((body) => sentBy(body, orderer, /Your order has come in/).length > 0), textOf(word[0]) ?? 'no word sent');
    check('the order book has it from the taking to the docking', inBook(/^Order 1\. From /) && inBook(/^Order 1\. Given to (Cora Tech|Vik Hale)\.$/) && inBook(/^Order 1\. Docked: crates? #4521/), book.join(' | ') || 'nothing written');
  }
  if (VARIANT === 'qmbig' || VARIANT === 'qmno' || VARIANT === 'qmquiet') {
    const asked = sentBy(qm, CAPTAIN, /Yes or no\?/);
    const times = VARIANT === 'qmquiet' ? 2 : 1;
    check(`an order of more than 1,000 credits is put to the Captain by PDA, with what it costs and what is in the budget${times > 1 ? ', twice and no more' : ', once'}`, asked.length === times && asked.every((line) => /order 1: .*1,200 credits of 2,000 in the budget\. Yes or no\?/.test(line)) && inBook(/^Order 1\. Asked the Captain\.$/), asked.map(textOf).join(' | ') || 'the Captain was never asked');
  }
  if (VARIANT === 'qmbig') {
    check('it is not given to a technician until the Captain has said yes', captainAnsweredAt > 0 && givenAt > captainAnsweredAt && inBook(/^Order 1\. The Captain said yes\.$/), givenAt ? `answered at ${seconds(captainAnsweredAt)}s, given at ${seconds(givenAt)}s` : 'never given');
    check('both kinds go in the one order, and whoever ordered is told which crate is which', orderKinds.length === 1 && orderKinds[0] === '2 Janitorial Supplies Crate + 1 Replacement Lights' && sentBy(qm, orderer, /crates #4521 and #4522 \(Janitorial Supplies Crate\); crate #4523 \(Replacement Lights\)/).length === 1, orderKinds.join('; ') || 'nothing was ordered');
  }
  if (VARIANT === 'qmno') {
    const word = sentBy(qm, orderer, /The Captain has said no to order 1/);
    check('the Captain says no: nothing is given or ordered, it is written down, and whoever ordered is told, once', gives.length === 0 && ordersPlaced.length === 0 && word.length === 1 && inBook(/^Order 1\. The Captain said no\.$/), textOf(word[0]) ?? 'no word sent');
  }
  if (VARIANT === 'qmquiet') {
    const gap = captainAsked.length > 1 ? (captainAsked[1].at - captainAsked[0].at) / 1000 : 0;
    check('the Captain does not answer: it asks again after three minutes', gap >= 175 && gap <= 220, `${Math.round(gap)}s apart`);
    const word = sentBy(qm, orderer, /Order 1 is waiting on the Captain's say/);
    check('and then holds the order: nothing is given or ordered, it is written down, and whoever ordered is told, once', gives.length === 0 && ordersPlaced.length === 0 && word.length === 1 && inBook(/^Order 1\. No answer from the Captain: held\.$/), textOf(word[0]) ?? 'no word sent');
  }
  // An order of 1,000 credits or less that is no more than half of what is in the budget is the Quartermaster's own to clear.
  if (VARIANT === 'qm' || VARIANT === 'qmpaper' || VARIANT === 'qmlost' || VARIANT === 'qmwait') check('the Captain is not asked about a small order the budget covers twice over', captainAsked.length === 0, `${captainAsked.length} time(s)`);
  // The Quartermaster's own staff meeting: called aloud in the bay, crates in and out reported, and the standing work divided.
  if (techs.length > 0) {
    const first = supplyMeetings[0];
    check('first thing in the shift, the Quartermaster calls its technicians together aloud, in the bay where they work', supplyCalls.length >= 1 && seconds(supplyCalls[0].at) >= 30 && seconds(supplyCalls[0].at) <= 120 && supplyCalls[0].room === 'Cargo Bay', supplyCalls.length ? `${supplyCalls.length} call(s), the first at ${seconds(supplyCalls[0].at)}s in ${supplyCalls[0].room}` : 'never called');
    check('every technician is there when it begins, and still there when it says the meeting is over', !!first && first.thereAtStart.length === techs.length && first.overAt > 0 && first.thereAtStart.every((name) => first.thereAtEnd.includes(name)), first ? `${first.thereAtStart.length} of ${techs.length} there at the start; ${first.overAt ? `${first.thereAtEnd.length} at the end` : 'never said to be over'}` : 'no meeting began');
    const firstReports = crateReports.filter((report) => first && report.at >= first.beganAt && report.at <= (first.overAt || Infinity));
    check('each technician reports the crates it has brought in and sent out, when called on by name', !!first && first.thereAtStart.every((name) => firstReports.some((report) => report.who === name)), firstReports.map((report) => report.text).join(' | ') || 'no reports');
    check('every number in a technician\'s report is the server\'s own count since its last one', crateReports.length > 0 && crateReports.every((report) => report.saidIn === report.countedIn && report.saidOut === report.countedOut), crateReports.map((report) => `${firstOf(report.who)}: said ${report.saidIn} in, ${report.saidOut} out; counted ${report.countedIn} in, ${report.countedOut} out`).join('; ') || 'no reports');
    // The work is dealt out by name, in the order of the names: one has all three, two have the counter and the rest.
    const sorted = [...techNames].sort();
    const wanted = sorted.length === 1 ? [`${firstOf(sorted[0])}, the counter, the shuttle and the rooms are yours this shift.`] : sorted.length === 2 ? [`${firstOf(sorted[0])}, the counter is yours this shift.`, `${firstOf(sorted[1])}, the shuttle and the rooms are yours this shift.`] : [];
    check('it divides the standing work between them, each told once, by name and to their face', wanted.every((line) => dutiesSaid.filter((said) => said.text.startsWith(line)).length === 1) && dutiesSaid.length === wanted.length, dutiesSaid.map((said) => said.text).join(' | ') || 'nothing was given out');
    const sums = supplyMeetings.filter((meeting) => meeting.overAt).map((meeting) => crateReports.filter((report) => report.at >= meeting.beganAt && report.at <= meeting.overAt).reduce((total, report) => ({ in: total.in + report.saidIn, out: total.out + report.saidOut }), { in: 0, out: 0 }));
    check('it sums up the crates in and out, and says the meeting is over', supplyMeetings.filter((meeting) => meeting.overAt).every((meeting, index) => /The meeting is over, thank you\./.test(meeting.closing) && Number(meeting.closing.match(/(\d+) crates? brought in/)?.[1] ?? 0) === sums[index].in && Number(meeting.closing.match(/(\d+) crates? sent out/)?.[1] ?? 0) === sums[index].out), supplyMeetings.map((meeting) => meeting.closing).join(' | ') || 'no meeting');
    const sentUp = sentBy(qm, CAPTAIN, /Supply staff meeting: \d+ of \d+ there\./);
    check('the Captain is sent its report of each meeting: who came, crates in and out, orders in hand and the budget', sentUp.length === supplyMeetings.filter((meeting) => meeting.overAt).length && sentUp.length >= 1 && sentUp.every((line) => /(orders? in hand|No orders in hand)\. Budget: [\d,]+ credits\./.test(line)), sentUp.map(textOf).join(' | ') || 'no report');
    if (sorted.length === 2 && dutiesSaid.length === 2) {
      const since = new Date(dutiesSaid[1].at).toISOString().slice(11, 19);
      const counter = techs.find((body) => body.name === sorted[0])!;
      const other = techs.find((body) => body.name === sorted[1])!;
      const notHers = counter.log.filter((line) => line.slice(0, 8) > since && /^\S+ .{24} (unload|recycle|send_shuttle|collect_mail|tidy|check_held|stow_crate|go_to \{"place":"Delivery Office"\})( |$)/.test(line));
      // Sent by the Quartermaster to see to a crate a workmate gave up, the shuttle is whoever was sent's as well. Until then it is left alone.
      if (VARIANT === 'qmstuck') {
        const sentAt = spoken.find((line) => line.who === qm.name && /See to it, please\.$/.test(line.text))?.at;
        const before = sentAt ? new Date(sentAt).toISOString().slice(11, 19) : '99';
        check('whoever has the counter leaves the shuttle alone until the Quartermaster sends them to it, and then sees to it', notHers.length > 0 && notHers.every((line) => line.slice(0, 8) >= before), notHers.join(' | ') || 'they never went to the shuttle');
      } else check('whoever has the counter leaves the shuttle and the rooms to whoever was given them', notHers.length === 0 && other.log.some((line) => / unload/.test(line)), notHers.length ? notHers.join(' | ') : `${other.name} unloaded the shuttle`);
    }
  }
  if (VARIANT === 'qmpaper') {
    check('finding no paper anywhere, it orders a crate that has some in it, through its own technician', paperTries.length >= 1 && orderKinds.length === 1 && orderKinds[0] === '1 Bureaucracy Crate', `${paperTries.length} look(s) for paper; ordered: ${orderKinds.join('; ') || 'nothing'}`);
    check('when the crate comes it opens it itself, in its own department, once it is off the shuttle', openedOwn.length === 1 && openedOwn[0] === 4521 && released.length === 0, `opened: ${openedOwn.join(', ') || 'nothing'}`);
    check('and then has its paper: it finds a sheet, takes its clipboard in hand, and writes up what it carried in its head', gotPaperAt.length === 1 && qm.holding.includes('clipboard') && inBook(/^Order 1\. From Ada Finch, Quartermaster: 1 Bureaucracy Crate\. 640 cr\.$/) && inBook(/^Order 1\. Docked: crate #4521/), book.join(' | ') || 'nothing written');
  }
  if (VARIANT === 'qmstuck') {
    const stuck = techs.find((body) => body.name === stuckBy);
    const helper = techs.find((body) => body.name !== stuckBy);
    const told = stuck?.said.filter((line) => /^Ada, I could not get crate #4521 off the shuttle\. It is in the Supply Shuttle, clear of the doors\./.test(line)) ?? [];
    check('a technician who gave a crate up tells the Quartermaster, face to face, what would not come and where it left it', !!stuck && told.length >= 1 && told.length <= 2, told[0] ?? `it was never said; ${stuckBy || 'nobody'} gave a crate up`);
    const heardIt = qm.said.filter((line) => line.startsWith(`${firstOf(stuckBy)}, `) && /\bI have that\b/.test(line));
    check('the Quartermaster says, by name, that it has that', heardIt.length >= 1, `${heardIt.length} time(s), counting its word back about the order coming in`);
    const sent = qm.said.filter((line) => !!helper && line === `${firstOf(helper.name)}, crate #4521 is in the Supply Shuttle and ${firstOf(stuckBy)} could not get it off the shuttle. See to it, please.`);
    check('and sends the other technician to see to it, face to face, once, in so many words', sent.length === 1, sent[0] ?? `it said: ${qm.said.join(' | ')}`);
    check('the crate is hauled off the shuttle in the end', (held[0]?.heldSince ?? 0) > 0, held[0] ? `crate #${held[0].number} is ${held[0].heldSince ? 'in the bay' : 'still aboard'}` : 'no crate came');
    check('nobody is sent word of it by PDA: the crate was not lost', !techs.some((body) => sentBy(body, orderer, /could not get|held up/i).length > 0) && sentBy(qm, orderer, /held up/i).length === 0);
  }
  if (VARIANT === 'qmlost') {
    const tech = techs[0];
    const told = tech.said.filter((line) => /^Ada, crate #4521 for Hal Pott is lost: it has been destroyed\./.test(line));
    check('the technician tells the Quartermaster, face to face, that the crate is lost and why, once', crateLostAt > 0 && told.length === 1 && wordPassed.filter((entry) => entry.endsWith('(lost)')).length === 1, told[0] ?? 'it was never said');
    check('and sends the head nothing about it by PDA itself', sentBy(tech, orderer, /./).length === 0, sentBy(tech, orderer, /./).map(textOf).join(' | '));
    const word = sentBy(qm, orderer, /Lost at cargo: crate #4521 from your order\. It has been destroyed\. I am having it ordered again, as order 2/);
    check('the Quartermaster tells the head it is lost and is being ordered again, once', word.length === 1, textOf(word[0]) ?? 'no word sent');
    check('it writes the loss in its book and takes the same again as a new order', inBook(/^Order 1\. Lost: crate #4521\. Ordered again as order 2\.$/) && inBook(/^Order 2\. From Hal Pott, Head of Personnel: 1 Janitorial Supplies Crate\. 400 cr\.$/), book.join(' | '));
    const again = sentBy(qm, orderer, /Your order has come in: crate #4522/);
    check('the second order is given out, placed and comes in, and the head is sent its number', orderKinds.length === 2 && orderKinds[1] === '1 Janitorial Supplies Crate' && again.length === 1 && inBook(/^Order 2\. Docked: crate #4522/), textOf(again[0]) ?? `orders: ${orderKinds.join('; ')}`);
    check('it is ordered again once, and no more', book.filter((line) => /Ordered again/.test(line)).length === 1 && ordersPlaced.length === 2);
  }
  if (VARIANT === 'qmwait') {
    const tech = techs[0];
    const told = tech.said.filter((line) => /^Ada, still waiting to be collected: crate #4521 for Hal Pott\./.test(line));
    check('a crate nobody comes for: the technician looks over the bay, and tells the Quartermaster face to face that it is still waiting', claims.length >= 1 && told.length === claims.length && wordPassed.filter((entry) => entry.endsWith('(waiting)')).length === told.length, `${claims.length} look(s), told ${told.length} time(s)`);
    const reminders = sentBy(qm, orderer, /Still waiting at cargo: crate #4521 from your order/);
    check('the Quartermaster reminds the head by PDA, once for each look, and the technician sends the head nothing itself', reminders.length === told.length && reminders.length >= 1 && sentBy(tech, orderer, /./).length === 0, `${reminders.length} reminder(s)`);
  }
  if (VARIANT === 'qmpoor') {
    const asked = sentBy(qm, CAPTAIN, /Yes or no\?/);
    check('an order of more than half of what is in the budget is put to the Captain first, once, and the Captain says yes', asked.length === 1 && /order 1: .*800 credits of 500 in the budget\. Yes or no\?/.test(asked[0]) && inBook(/^Order 1\. Asked the Captain\.$/) && inBook(/^Order 1\. The Captain said yes\.$/), asked.map(textOf).join(' | ') || 'the Captain was never asked');
    const word = sentBy(qm, orderer, /Order 1 is held for money: it comes to 800 credits and there are 500 free in the budget/);
    check('an order the budget cannot cover is held, written down, and whoever ordered is told why, once', word.length === 1 && inBook(/^Order 1\. Held for money: 800 cr wanted, 500 cr in the budget\.$/), textOf(word[0]) ?? 'no word sent');
    check('it is given to a technician only once the money has come in, five minutes on, and is then placed and paid for', givenAt > 0 && seconds(givenAt) >= INCOME_EVERY && spentOn.length === 1 && spentOn[0].cost === 800, givenAt ? `given at ${seconds(givenAt)}s; spent ${spentOn.map((it) => it.cost).join(', ') || 'nothing'}` : 'never given');
  }
  // Its second staff meeting falls due ten minutes after the first, which in the longest run is as the run ends: it is in the bay for that.
  const meetingNow = supplyCalls.length > 0 && clock - supplyCalls[supplyCalls.length - 1].at < 90_000;
  check('with nothing left to see to it goes back to its office', qm.room === QM_OFFICE || meetingNow, `ends in ${qm.room}${meetingNow ? ', holding a staff meeting' : ''}`);
}
// A Quartermaster who never answers: the order is taken to the counter after three minutes, and cargo serves it as it did before.
if (VARIANT === 'qmgone') {
  const hop = crew[0];
  const sent = hop.log.filter((line) => / message /.test(line) && line.includes('"person":"Ada Finch"') && line.includes('I need to order'));
  check('the head sends its order to the Quartermaster first, once', sent.length === 1, `${sent.length} message(s)`);
  const sentAt = spoken.length ? Date.parse(`1970-01-01T${sent[0]?.slice(0, 8) ?? '00:00:00'}Z`) : 0;
  const atCounter = spoken.find((line) => line.who === hop.name && /I need to order .*The Quartermaster has not answered\./.test(line.text));
  check('with no word back in three minutes, it takes the order to the counter and says the Quartermaster has not answered', !!atCounter && (atCounter.at % 86_400_000) - sentAt >= 180_000, atCounter ? `${Math.round(((atCounter.at % 86_400_000) - sentAt) / 1000)}s after sending it` : 'it never went to the counter');
  check('the technician takes that order itself, and sends the head the crate numbers by PDA', ordersPlaced.length === 1 && ordersPlaced[0].endsWith('for Hop Kins') && techLog.filter((line) => / message /.test(line) && /Your order has come in: crate #4521/.test(line) && line.includes('"person":"Hop Kins"')).length === 1, ordersPlaced.join('; ') || 'nothing was placed');
  check('nobody stands knocking at the Quartermaster\'s door', knocks.filter((entry) => entry.endsWith(`@${QM_OFFICE}`)).length === 0, knocks.join(', '));
}
// The head finds out what its staff have done and what they need, tells the Captain, and gets what is needed ordered.
const head = crew.find((body) => body.job === 'Head of Personnel');
if (head && janitors.length > 2) {
  const first = (body: { name: string }) => body.name.split(' ')[0];
  const invites = head.log.filter((line) => / message /.test(line) && /"Staff meeting in the [^"]* now, please/.test(line));
  const calledAt = invites[0]?.slice(0, 8) ?? 'never';
  const meetsIn = VARIANT === 'shutout' ? 'Staff Room' : 'Bar';
  // How many meetings there should have been: the one two minutes in, and in one scenario the one the Captain orders.
  const due = VARIANT === 'captain' ? 2 : 1;
  const seconds = (at: number) => Math.round((at - 1_000_000) / 1000);
  check(`about two minutes in, the head calls its staff to a meeting in the ${meetsIn} by PDA, each of them once${due > 1 ? ', and once more when the Captain orders one' : ''}`, meetingCalls.length === due && invites.length === janitors.length * due && janitors.every((body) => invites.filter((line) => line.includes(`"person":"${body.name}"`)).length === due) && invites.every((line) => line.includes(`in the ${meetsIn} `)), `${invites.length} call(s) for ${meetingCalls.length} meeting(s), the first at ${calledAt}`);
  const copies = head.log.filter((line) => / message /.test(line) && line.includes(`"person":"${CAPTAIN}"`) && /holding a staff meeting in the/.test(line)).length;
  check('the Captain is sent word, by PDA, each time a meeting is held', copies === due, `${copies} message(s)`);
  const coming = janitors.map((body) => body.log.filter((line) => / message /.test(line) && /(On my way to the|I will come to the|I am in the [^"]* already)/.test(line) && line.includes(`"person":"${head.name}"`)).length);
  check('each janitor sends word back that it is coming, once a meeting', coming.every((count) => count === due), `messages: ${coming.join(', ')}`);
  if (VARIANT === 'shutout') {
    const word = janitors.map((body) => body.log.filter((line) => / message /.test(line) && /I could not get into the Staff Room/.test(line)).length);
    const tries = janitors.map((body) => staffRoomTries.filter((name) => name === body.name).length);
    check('shut out of the room, each janitor tries the walk twice and no more', tries.every((count) => count >= 1 && count <= 2), `tries: ${tries.join(', ') || 'nobody tried'}`);
    check('and sends the head its report by PDA instead, once', word.every((count) => count === 1) && reportsGiven.filter((report) => report.how === 'pda').length === janitors.length, `messages: ${word.join(', ')}`);
    check('the head does not stand in an empty room: once they have all sent word, the meeting is over', meetings.length === 0 && head.room !== 'Staff Room', `ends in ${head.room}`);
  } else {
    check('the janitors come to the meeting: all of them, or all but one who was held up', atMeeting.size >= janitors.length - 1, `there: ${[...atMeeting].join(', ') || 'nobody'}`);
    check('the head does not begin until they are all there, or it has waited three minutes for them', meetings.length === due && meetings.every((meeting, index) => meeting.thereAtStart.length === janitors.length || seconds(meeting.beganAt) - seconds(meetingCalls[index]) >= 180), meetings.map((meeting, index) => `${meeting.thereAtStart.length} there, ${seconds(meeting.beganAt) - seconds(meetingCalls[index] ?? 0)}s after the call`).join('; ') || 'no meeting began');
    // One at a time: nobody gives a report until the head has called on them by name, and nobody gives two.
    let calledOn = '';
    const outOfTurn: string[] = [];
    for (const line of spoken) {
      if (line.who === head.name && /\breport\b/i.test(line.text)) calledOn = janitors.map(first).find((name) => new RegExp(`\\b${name}\\b`).test(line.text)) ?? '';
      else if (line.job === 'Janitor' && line.text.startsWith(`${first(head)}, `) && /\bI need\b/.test(line.text)) { if (calledOn !== line.who.split(' ')[0]) outOfTurn.push(line.who); calledOn = ''; }
    }
    const aloud = reportsGiven.filter((report) => report.how === 'aloud');
    check('they speak one at a time: each gives its report when the head calls on it by name, and not before', aloud.length >= (janitors.length - 1) * due && outOfTurn.length === 0, `${aloud.length} report(s) given${outOfTurn.length ? `; out of turn: ${outOfTurn.join(', ')}` : ''}`);
    check('each one there gives its report: the work it has done, and what it needs or that it needs nothing', meetings.every((meeting) => meeting.thereAtStart.every((name) => aloud.some((report) => report.who === name && report.at >= meeting.beganAt && report.at <= (meeting.overAt || Infinity)))), `reported: ${aloud.map((report) => report.who).join(', ') || 'nobody'}`);
    check('they stay until the head says the meeting is over', meetings.every((meeting) => meeting.overAt > 0 && meeting.thereAtStart.every((name) => meeting.thereAtEnd.includes(name))), meetings.map((meeting) => (meeting.overAt ? `${meeting.thereAtEnd.length} of ${meeting.thereAtStart.length} still there at the end` : 'never said to be over')).join('; '));
    // What the head says the staff have done between them is what they reported, added up.
    const sums = meetings.map((meeting, index) => reportsGiven.filter((report) => report.at <= meeting.overAt && report.at > (meetings[index - 1]?.overAt ?? 0)).reduce((total, report) => total + report.said, 0));
    check('the head sums up: the work reported adds up, and it says how many need supplies', meetings.every((meeting, index) => Number(meeting.closing.match(/(\d+) spots?\b/)?.[1] ?? 0) === sums[index] && /(needs? supplies|Nobody needs anything)/.test(meeting.closing)), meetings.map((meeting) => meeting.closing).join(' | '));
  }
  if (DOORWAY) {
    const pushed = crew.find(pushedOut)!;
    const times = bumps.filter((bump) => bump.who === pushed.name).length;
    check(`pushed back out into the doorway after every arrival, ${pushed.name} does not walk at the room over and over: three walks at most`, times >= 1 && walksToMeeting >= 1 && walksToMeeting <= 3, `${walksToMeeting} walk(s) to the room, pushed out ${times} time(s)`);
    const aloud = reportsGiven.filter((report) => report.how === 'aloud').map((report) => report.who);
    check('the meeting is still held, from the doorway: it begins, every janitor is counted there and gives its report aloud, and it is ended', meetings.length === 1 && meetings[0].overAt > 0 && meetings[0].thereAtStart.length === janitors.length && janitors.every((body) => aloud.includes(body.name)), `${meetings.length} meeting(s), ${meetings[0]?.thereAtStart.length ?? 0} there at the start, reports aloud from ${aloud.join(', ') || 'nobody'}`);
    if (VARIANT === 'doorway') {
      const ups = walkUps.filter((name) => name === pushed.name).length;
      check('it walks up to its head once or twice, and no more', ups <= 2, `${ups} time(s)`);
      const others = janitors.filter((body) => body !== pushed);
      check('the janitors who are left alone walk up to the head and stand with it', others.every((body) => walkUps.includes(body.name)), `walked up: ${[...new Set(walkUps)].join(', ') || 'nobody'}`);
    }
  }
  check('every number in a report is the server\'s own count of the work done since the last one', reportsGiven.length > 0 && reportsGiven.every((report) => report.said === report.counted), reportsGiven.map((report) => `${report.who.split(' ')[0]} ${report.how}: said ${report.said}, counted ${report.counted}`).join('; ') || 'no reports');
  check('a janitor short of something to clean with says so in its report, a rag not counting as something', [...spoken.map((line) => line.text), ...janitors.flatMap((body) => body.log.filter((line) => / message /.test(line)))].some((text) => /I need something (better than a rag )?to clean with/.test(text)));
  const sentUp = head.log.filter((line) => / message /.test(line) && line.includes(`"person":"${CAPTAIN}"`) && /Staff meeting in the [^:]+: \d+ of \d+ there/.test(line));
  check('the Captain is sent the head\'s report of each meeting: who came, the work done, and what is being ordered', sentUp.length === due && sentUp.every((line) => /(I am ordering|Nothing needed)/.test(line)), sentUp.map((line) => line.match(/"text":"([^"]*)"/)?.[1]).join(' | ') || 'no report');
  if (VARIANT === 'captain') {
    check('told by the Captain to find out how its section is doing, the head calls a meeting there and then', captainAskedAt > 0 && meetingCalls.length === 2 && seconds(meetingCalls[1]) - seconds(captainAskedAt) <= 40, captainAskedAt ? `${meetingCalls.length} meeting(s); the second ${meetingCalls[1] ? seconds(meetingCalls[1]) - seconds(captainAskedAt) : '?'}s after being told` : 'the Captain never got to ask');
    const walks = head.log.filter((line) => / go_to /.test(line)).map((line) => line.match(/"place":"([^"]*)"/)?.[1]);
    check('and does not take it for an order to go and look at a room', walks.every((place) => ['Bar', 'Cargo Lobby', HOP_OFFICE].includes(place ?? '')), [...new Set(walks)].join(', '));
  }
  const askedCargo = janitors.filter((body) => body.said.some((line) => /order|supplies/i.test(line) && techs.some((it) => line.includes(first(it)))));
  check('no janitor asks cargo for supplies: that is the head\'s to do', askedCargo.length === 0, askedCargo.map((body) => body.name).join(', '));
  const viaQm = crew.find((body) => body.job === 'Quartermaster');
  if (viaQm) check('the head sends its order to the Quartermaster by PDA, and does not go to the counter with it', ordersPlaced.length === 1 && ordersPlaced[0].includes(`for ${head.name}`) && head.log.filter((line) => / message /.test(line) && line.includes(`"person":"${viaQm.name}"`) && line.includes('I need to order')).length === 1 && !head.log.some((line) => line.includes('go_to {"place":"Cargo Lobby"}')), ordersPlaced.join('; ') || 'nothing was ordered');
  else check('the head goes to the counter and orders for its staff', ordersPlaced.length === 1 && ordersPlaced[0].includes(`for ${head.name}`) && head.log.some((line) => line.includes('go_to {"place":"Cargo Lobby"}')), ordersPlaced.join('; ') || 'nothing was ordered');
  const crates = Number(ordersPlaced[0]?.split(' ')[0] ?? 0);
  const word = (viaQm ? viaQm.log : techLog).filter((line) => / message /.test(line) && /Your order has come in: crates? #\d+/.test(line) && line.includes(`"person":"${head.name}"`));
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
if (ENGINE) {
  const began = clock - SECONDS * 1000;
  const sam = crew.find((body) => body.job === 'Station Engineer')!;
  const ada = crew.find((body) => body.job === 'Chief Engineer');
  const byEngineer = machineWork.filter((work) => work.who === sam.name);
  const byChief = machineWork.filter((work) => work.who === 'Ada Volt');
  const firing = emitters().filter((machine) => machine.on).length;
  const batteriesSet = machineList.filter((machine) => machine.kind === 'battery' && machine.on).length;
  const saidBy = (who: string, words: RegExp) => spoken.filter((line) => line.who === who && words.test(line.text));
  const sentTo = (body: Body | undefined, person: string, words: RegExp) => (body?.log ?? []).filter((line) => / message /.test(line) && line.includes('"person":"' + person + '"') && words.test(line));
  const told = (body: Body | undefined, who: string, person: string, words: RegExp) => saidBy(who, words).length + sentTo(body, person, words).length;
  const seconds = (at: number) => Math.round((at - began) / 1000) + ' s in';
  if (VARIANT !== 'engalone') {
    const call = saidBy('Ada Volt', /^Staff meeting in the Engineering now, please/)[0];
    check('the Chief Engineer calls its staff together in Engineering, aloud, inside the first minute and a half', !!call && call.at - began <= 90_000, call ? seconds(call.at) : 'never called');
    check('it gives its engineer the engine, to its face, word for word, once', saidBy('Ada Volt', /^Sam, the engine is yours\. Light it now, please\./).length === 1, saidBy('Ada Volt', /engine is yours/).length + ' time(s)');
    check('the engineer says that it has it', saidBy('Sam Rees', /^The engine, right away\./).length === 1);
    check('the Chief Engineer sets the three batteries itself', byChief.filter((work) => work.how === 'charge' && work.ok).length === 3 && batteriesSet === 3, batteriesSet + ' set');
    check('and works nothing in the engine room', byChief.every((work) => work.kind === 'battery'), byChief.filter((work) => work.kind !== 'battery').map((work) => work.name).join(', '));
    check('the Captain is told a meeting is being held, and sent the report of it', sentTo(ada, 'Cap Tain', /holding a staff meeting/).length >= 1 && sentTo(ada, 'Cap Tain', /Engineering staff meeting:/).length >= 1);
  }
  if (VARIANT !== 'enginestuck') {
    const firstEmitter = byEngineer.findIndex((work) => work.kind === 'emitter');
    const before = firstEmitter < 0 ? [] : byEngineer.slice(0, firstEmitter);
    check('every one of the 18 steps before the emitters is done first, and takes', before.length === 18 && before.every((work) => work.ok && work.kind !== 'emitter'), before.length + ' step(s) before the first emitter');
    check('the gas is going round before any emitter is switched on', byEngineer.filter((work) => work.how === 'switch_on').every((work) => work.loop) && firstEmitter >= 0);
    check('the engine is lit inside nine minutes', !!crystal.litAt && crystal.litAt - began < 540_000, crystal.litAt ? seconds(crystal.litAt) : 'never lit');
    check('the engineer tells the Chief Engineer it is lit', told(sam, 'Sam Rees', 'Ada Volt', /the engine is lit/) >= 1);
  }
  if (VARIANT === 'engine') {
    check('lighting it takes 21 steps and no more', byEngineer.length === 21 && byEngineer.every((work) => work.ok), byEngineer.length + ' step(s)');
    check('the crystal is whole and all three emitters are on at the end', crystal.integrity === 100 && firing === 3, crystal.integrity + ' percent, ' + firing + ' emitter(s) on');
    check('the engineer ends at its post, not in the engine room', sam.room === 'Engineering', sam.room);
    check("at the second meeting the engineer reports the machines it has set, from the server's count", machinesSet.get(sam.name) === 21 && saidBy('Sam Rees', /\b21 machines\b/).length === 1, saidBy('Sam Rees', /machines/).map((line) => line.text).join(' | '));
    check('and the Chief Engineer closes it with the engine reading', saidBy('Ada Volt', /The engine is lit\. It is at 100 percent integrity\. The meeting is over/).length === 1);
  }
  if (VARIANT === 'enginestuck') {
    check('a canister that will not connect is tried twice and no more', byEngineer.filter((work) => work.how === 'connect').length === 2, byEngineer.filter((work) => work.how === 'connect').length + ' time(s)');
    check('the job stops there: nothing else is worked, and the emitters are never touched', byEngineer.length === 2 && firing === 0, byEngineer.length + ' step(s), ' + firing + ' emitter(s) on');
    check('the engineer tells the Chief Engineer which step it was', told(sam, 'Sam Rees', 'Ada Volt', /I cannot light the engine: the nitrogen canister will not connect/) >= 1);
    check('the Chief Engineer tells the Captain', sentTo(ada, 'Cap Tain', /"text":"The engine is not lit: the nitrogen canister will not connect/).length === 1);
    check('the crystal is untouched', crystal.integrity === 100 && crystal.energy === 0);
  }
  if (VARIANT === 'enginehot') {
    check('the engine starts to come apart after it is lit', !!crystal.faultAt && !!crystal.lowAt);
    check('the Chief Engineer orders the emitters off', told(ada, 'Ada Volt', 'Sam Rees', /the engine is losing integrity\. Emitters off, now/) >= 1);
    check('all three are off within a minute of integrity falling under 95', !!crystal.offAt && crystal.offAt - crystal.lowAt <= 60_000, crystal.offAt ? Math.round((crystal.offAt - crystal.lowAt) / 1000) + ' s' : 'never off');
    check('they stay off: the engine is not lit again unasked', firing === 0 && !byEngineer.some((work) => work.how === 'switch_on' && work.at > crystal.offAt));
    check('the engineer says the emitters are off', told(sam, 'Sam Rees', 'Ada Volt', /the emitters are off/) >= 1);
    check('the Captain is told it is losing integrity, and then that the emitters are off', sentTo(ada, 'Cap Tain', /"text":"The engine is losing integrity:/).length === 1 && sentTo(ada, 'Cap Tain', /"text":"The emitters are off\./).length === 1);
    check('the crystal is still mostly whole', crystal.integrity > 80, crystal.integrity + ' percent');
  }
  if (VARIANT === 'enginelocked') {
    const offs = byEngineer.filter((work) => work.how === 'switch_off');
    const lockedTries = offs.filter((work) => !work.ok).length;
    check('the Chief Engineer orders the emitters off', told(ada, 'Ada Volt', 'Sam Rees', /Emitters off, now/) >= 1);
    check('the other two are switched off: one locked emitter does not keep them firing', firing === 1, firing + ' on');
    check('the locked one is not tried over and over', lockedTries >= 2 && lockedTries <= 6, lockedTries + ' tries');
    check('the engineer tells the Chief Engineer why', told(sam, 'Sam Rees', 'Ada Volt', /I cannot switch the emitters off: its controls are locked/) >= 1);
    check('the Captain is told once that the engine is still firing', sentTo(ada, 'Cap Tain', /"text":"The emitters will not go off: its controls are locked/).length === 1);
  }
  if (VARIANT === 'engalone') {
    const first = byEngineer[0];
    check('with no word from the Chief Engineer it starts by itself, two minutes in', !!first && first.at - began >= 120_000 && first.at - began <= 160_000, first ? seconds(first.at) : 'never started');
    check('word that the engine is lit goes to the Chief Engineer by PDA', sentTo(sam, 'Ada Volt', /the engine is lit/).length === 1);
    check('all three emitters are on at the end', firing === 3);
  }
  if (VARIANT === 'enginedim') {
    check('the emitters stop on a sound engine', !!crystal.dimAt && crystal.integrity === 100);
    check('the Chief Engineer sends the engineer to switch them on again', told(ada, 'Ada Volt', 'Sam Rees', /the emitters have stopped\. Switch them on again, please/) >= 1);
    check('all three are on again at the end', firing === 3, firing + ' on');
    check('the engineer says so', told(sam, 'Sam Rees', 'Ada Volt', /the emitters are on again/) >= 1);
    check('nobody orders them off', told(ada, 'Ada Volt', 'Sam Rees', /Emitters off, now/) === 0);
  }
}
if (SECURITY) {
  const began = clock - SECONDS * 1000;
  const seconds = (at: number) => Math.round((at - began) / 1000) + ' s in';
  const joan = crew.find((body) => body.job === 'Head of Security');
  const hale = crew.find((body) => body.job === 'Security Officer')!;
  const hop = crew.find((body) => body.job === 'Head of Personnel');
  // Whoever keeps the list: the Head of Security, or the officer where there is no head.
  const desk = joan ?? hale;
  const onHead = VARIANT === 'arresthead' || VARIANT === 'pardon';
  const wanted = onHead ? 'Hop Kins' : 'Pun Pun';
  const reason = onHead ? 'theft' : VARIANT === 'loose' ? '' : 'wrecking the Custodial Closet';
  const forWhat = reason ? `, for ${reason}` : '';
  const term = VARIANT === 'loose' ? 10 : 5;
  const cellFor = VARIANT === 'badcell' ? 'Cell 2' : 'Cell 1';
  const saidBy = (who: string, words: RegExp) => spoken.filter((line) => line.who === who && words.test(line.text));
  const sentTo = (body: Body | undefined, person: string, words: RegExp) => (body?.log ?? []).filter((line) => / message /.test(line) && line.includes('"person":"' + person + '"') && words.test(line));
  const told = (body: Body | undefined, person: string, words: RegExp) => (body ? saidBy(body.name, words).length : 0) + sentTo(body, person, words).length;
  const arrests = secWork.filter((work) => work.tool === 'arrest');
  const jailings = secWork.filter((work) => work.tool === 'jail' && work.ok);
  const firstHand = arrests[0];
  const listed = (work: typeof secWork) => work.map((it) => `${it.who} ${it.tool}${it.how ? ' ' + it.how : ''} ${it.ok ? 'ok' : it.reason}`).join('; ');

  check('whoever declared the warrant is answered, word for word, with what was understood', sentTo(desk, SEC_CAPTAIN, new RegExp(`Captain, I have that: a warrant for ${wanted}${forWhat}\\. ${term} minutes\\.`)).length === 1);
  const fetched = secWork.find((work) => work.tool === 'get_kit' && work.who === hale.name);
  check('the officer fetches its baton from the lockers before anything else', !!fetched && fetched.at - began < 60_000, fetched ? seconds(fetched.at) : 'never');
  if (joan) {
    check('the Head of Security gives its officer the warrant, to its face or by PDA', told(joan, hale.name, new RegExp(`Hale, warrant: ${wanted}${forWhat}\\. Bring them in, ${term} minutes\\.`)) >= 1);
    check('the Head of Security lays a hand on nobody while its officer is fit', VARIANT === 'hurt' || secWork.every((work) => work.who !== joan.name), listed(secWork.filter((work) => work.who === joan.name)));
  }
  const arrester = VARIANT === 'hurt' ? joan! : hale;
  const toldArrest = saidBy(arrester.name, new RegExp(`^${wanted}, you are under arrest${forWhat}\\. Stand still\\.`))[0];
  const ownFirst = arrests.find((work) => work.who === arrester.name);
  check('they are told they are under arrest, word for word, before a hand is laid on them', !!toldArrest && !!ownFirst && toldArrest.at <= ownFirst.at, toldArrest ? seconds(toldArrest.at) : 'never told');
  check('nobody is hit who was not first given the chance to stand still', firstHand?.how === 'quiet', listed(arrests));
  if (VARIANT !== 'pardon' && VARIANT !== 'nobaton') {
    check(`${wanted} ends up in a cell, once`, jailings.length === 1 && jailings[0].target === wanted && jailings[0].cell === cellFor, listed(secWork));
  }
  const minutes = VARIANT === 'fight' ? 10 : term;
  if (VARIANT === 'badcell') {
    const tries = secWork.filter((work) => work.tool === 'jail');
    const refused = tries.find((work) => !work.ok);
    const put = tries.find((work) => work.ok);
    check('the first cell refuses, and the officer has them in the next within half a minute', !!refused && !!put && put.at - refused.at <= 30_000, listed(tries));
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const strayed = hale.log.filter((line) => !!refused && !!put && line.slice(0, 8) > clockAt(refused.at) && line.slice(0, 8) < clockAt(put.at) && / (go_to|get_kit|explore|approach) /.test(line));
    check('with a prisoner by the arm it goes nowhere but the cells', strayed.length === 0, strayed.join(' | '));
  }
  if (VARIANT === 'loose') {
    check('an order code cannot read is put to the LLM once', readingCalls === 1, `${readingCalls} reading(s)`);
    if (MODE === 'dead') check('with no LLM, the Captain is told it was not followed', sentTo(desk, SEC_CAPTAIN, /Captain, I did not follow that\./).length === 1);
  }
  if (joan && VARIANT !== 'pardon' && VARIANT !== 'nobaton') {
    const cuffer = VARIANT === 'hurt' ? 'I have' : 'Hale has';
    check('the Captain is told when they are in cuffs', sentTo(joan, SEC_CAPTAIN, new RegExp(`Captain, ${cuffer} ${wanted} in cuffs\\.`)).length >= 1, sentTo(joan, SEC_CAPTAIN, /in cuffs/).join(' | '));
  }
  if (VARIANT === 'nobaton') {
    const trips = secWork.filter((work) => work.tool === 'get_kit' && work.who === hale.name);
    check('the officer goes to the lockers no more than three times', trips.length >= 1 && trips.length <= 3, `${trips.length} trip(s)`);
    check('it tells the Head of Security why it cannot serve the warrant, once', told(hale, joan!.name, /Joan, I cannot bring in Pun Pun: no baton\./) === 1, `${told(hale, joan!.name, /I cannot bring in/)} time(s)`);
    check('and the Captain is told', sentTo(joan, SEC_CAPTAIN, /Captain, Hale cannot bring in Pun Pun: no baton\./).length === 1);
    const reached = arrests[0]?.at ?? 0;
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const leftAfter = hale.log.filter((line) => line.slice(0, 8) > clockAt(reached) && / (go_to|get_kit|explore) /.test(line));
    check('having reached the monkey, it stays with it: no trip to the lockers, and no walking off', !!reached && hale.room === 'Bar' && leftAfter.length === 0, leftAfter.join(' | ') || `ends in ${hale.room}`);
    check('with no baton it tries the cuffs once, and hits nobody', arrests.length === 1 && arrests[0].how === 'quiet', listed(arrests));
    const call = joan!.log.find((line) => / message /.test(line) && /Staff meeting in the Security Office now/.test(line) && line.slice(0, 8) > clockAt(began + WARRANT_AT * 1000));
    const callAt = call ? call.slice(0, 8).split(':').reduce((total, part) => total * 60 + Number(part), 0) - clockAt(began).split(':').reduce((total, part) => total * 60 + Number(part), 0) : 0;
    check('the Head of Security calls no staff meeting inside five minutes of a sighting', !call || callAt >= SIGHTING_AT + 295, call ? `${callAt} s in` : 'none called');
    check('called to one while it is with the monkey, the officer sends its report by PDA and stays', !call || sentTo(hale, joan!.name, /I cannot come to the meeting: I am after someone on a warrant\./).length === 1, call ? '' : 'no meeting was called in the time');
  }
  if (VARIANT !== 'nobaton') check('the Captain is told which cell and for how long', sentTo(desk, SEC_CAPTAIN, new RegExp(`Captain, ${wanted} is in ${cellFor} for ${minutes} minutes${VARIANT === 'fight' ? ', 5 of them for resisting arrest' : ''}\\.`)).length === 1, sentTo(desk, SEC_CAPTAIN, /is in Cell/).join(' | '));
  if (joan && VARIANT !== 'hurt' && VARIANT !== 'nobaton') {
    check('the officer tells the Head of Security how the warrant went', told(hale, joan.name, new RegExp(`Joan, ${wanted} is in ${cellFor} for ${minutes} minutes`)) >= 1);
  }

  if (VARIANT === 'warrant') {
    check('the Head of Personnel is sent the notice, once, and answers that it has it', sentTo(joan, 'Hop Kins', /Security notice\. Wanted: Pun Pun, for wrecking the Custodial Closet\. If you or your staff see them, send me where, at once\./).length === 1 && sentTo(hop, 'Joan Marsh', /Security notice received\./).length >= 1, `${sentTo(joan, 'Hop Kins', /Security notice\. Wanted/).length} sent, ${sentTo(hop, 'Joan Marsh', /Security notice received/).length} answered`);
    check('the Head of Personnel reads the list out at its staff meeting, word for word, once', saidBy('Hop Kins', /^Security is looking for Pun Pun\. If you see them, send security a PDA message saying where\./).length === 1, saidBy('Hop Kins', /Security is/).map((line) => line.text).join(' | ') || 'never said');
    const sightings = crew.filter((body) => !isSecurityJob(body.job)).flatMap((body) => sentTo(body, 'Joan Marsh', /Security: Pun Pun is in the /).map((line) => `${body.name}: ${line.slice(0, 8)}`));
    check('someone who is not security sees the monkey and sends security where', sightings.length >= 1, sightings.join('; ') || 'nobody did');
    // Each sighting a body sent, as the second of the day it was sent at and the room it named.
    const sentAt = (line: string) => line.slice(0, 8).split(':').reduce((total, part) => total * 60 + Number(part), 0);
    const repeats = crew.flatMap((body) => {
      const sent = sentTo(body, 'Joan Marsh', /Security: Pun Pun is in the /).map((line) => ({ at: sentAt(line), room: line.match(/is in the (.+?)\./)?.[1] ?? '' }));
      return sent.filter((one, index) => sent.slice(0, index).some((other) => other.room === one.room && one.at - other.at < 120)).map((one) => `${body.name}: ${one.room}`);
    });
    check('nobody sends word of the same room twice inside two minutes', repeats.length === 0, repeats.join('; '));
    check('the Head of Security passes the sighting to its officer', told(joan, hale.name, /Hale, Pun Pun was seen in the /) >= 1);
    check('the monkey is hit only once it would not stand still for the cuffs', arrests.some((work) => work.how === 'quiet' && work.reason === 'moved') && arrests.some((work) => work.how === 'force' && work.ok), listed(arrests));
    check('with the monkey in a cell, the Head of Personnel is sent word that nobody is wanted', sentTo(joan, 'Hop Kins', /Security notice\. Nobody is wanted now\./).length >= 1);
    const out = walkedFree.find((it) => it.who === 'Pun Pun');
    check('the monkey walks free when its five minutes are up', out?.why === 'time up' && Math.abs(out.at - (jailings[0]?.at ?? 0) - 300_000) < 5_000, out ? `${out.why}, ${Math.round((out.at - (jailings[0]?.at ?? 0)) / 1000)} s after` : 'never');
    check('the officer fetches another pair of cuffs, the monkey having gone into the cell in the first', kitOf(hale).cuffs, '');
  }
  if (onHead) {
    check('a head of department who stands still is cuffed without being hit', arrests.length >= 1 && arrests.every((work) => work.how === 'quiet') && arrests.filter((work) => work.ok).length === 1 && (arrests.find((work) => work.ok)?.hits ?? 1) === 0, listed(arrests));
    check('the head it is on is sent no notice while the warrant stands', sentTo(joan, 'Hop Kins', /Security notice\. Wanted/).length === 0);
    const jailedAt = secWork.find((work) => work.tool === 'jail' && work.ok)?.at ?? 0;
    const out = walkedFree.find((it) => it.who === 'Hop Kins');
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const stepsHeld = hop!.log.filter((line) => !/ say /.test(line) && line.slice(0, 8) > clockAt(jailedAt) && (!out || line.slice(0, 8) < clockAt(out.at)));
    check('in the cell it does nothing but talk', stepsHeld.length === 0, stepsHeld.join(' | '));
    if (VARIANT === 'arresthead') {
      check('it walks free when its five minutes are up', out?.why === 'time up' && Math.abs(out.at - jailedAt - 300_000) < 5_000, out ? `${out.why}, ${Math.round((out.at - jailedAt) / 1000)} s after` : 'never');
      check('and goes back to its office', hop!.room === HOP_OFFICE, `ends in ${hop!.room}`);
    } else {
      check('the Captain is answered that they are pardoned', sentTo(joan, SEC_CAPTAIN, /Captain, Hop Kins is pardoned\./).length === 1);
      check('the Head of Security tells its officer to let them go', told(joan, hale.name, /Hale, Hop Kins is to be let go: the Captain has pardoned them\./) >= 1);
      check('the officer opens the cell before the time is up', out?.why === 'let out' && out.at - jailedAt < 200_000, out ? `${out.why}, ${Math.round((out.at - jailedAt) / 1000)} s after` : 'never');
      check('and tells the Head of Security they are free', told(hale, joan!.name, /Joan, Hop Kins is free\./) >= 1);
    }
  }
  if (VARIANT === 'fight') {
    const bite = bitten[0];
    const next = bite ? arrests.find((work) => work.at > bite.at) : undefined;
    check('the monkey bites the officer once', bitten.length === 1, `${bitten.length} time(s)`);
    check('and the baton comes out at once', next?.how === 'force', listed(arrests));
    check('it gets five minutes more for it', jailings[0]?.minutes === 10, `${jailings[0]?.minutes} minutes`);
    check('the officer is not hurt enough to break off', saidBy(hale.name, /I am hurt/).length + sentTo(hale, joan!.name, /I am hurt/).length === 0);
  }
  if (VARIANT === 'hurt') {
    const hurtTold = told(hale, joan!.name, /Joan, I could not take Pun Pun\. I am hurt\./);
    check('the officer, bitten to under half its health, breaks off and tells the Head of Security', kitOf(hale).health < 50 && hurtTold >= 1, `health ${kitOf(hale).health}, told ${hurtTold} time(s)`);
    const lastBite = bitten.at(-1)?.at ?? 0;
    check('and uses no force after that', arrests.filter((work) => work.who === hale.name && work.how === 'force' && work.at > lastBite).length === 0, listed(arrests.filter((work) => work.who === hale.name)));
    check('the Head of Security tells the Captain, once', sentTo(joan, SEC_CAPTAIN, /Captain, Hale could not take Pun Pun and is hurt\. I am serving the warrants myself\./).length === 1);
    check('fetches a baton of its own', secWork.some((work) => work.tool === 'get_kit' && work.who === joan!.name));
    check('and makes the arrest itself', jailings[0]?.who === joan!.name, listed(secWork.filter((work) => work.who === joan!.name)));
  }
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
