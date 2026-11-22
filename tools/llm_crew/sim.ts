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
//   bun run sim.ts quiet headshut  the head is shut in its office when its first meeting is due: it calls none until it is let out, then calls it (HEAD-06)
//   bun run sim.ts quiet headnoroom  the head cannot get to the room it called its meeting in: three minutes on, its staff are told by PDA the meeting is over (HEAD-06)
//   bun run sim.ts quiet vouch    two technicians: one sends for a janitor, the other asks what the janitor is doing in the bay
//   bun run sim.ts quiet waiting   a head orders a crate and nobody comes for it: the technicians take turns to look and remind, and hand it over when asked for by number
//   bun run sim.ts quiet captain   the Captain tells the head to find out how its section is doing: a second staff meeting is called there and then
//   bun run sim.ts quiet mixed     a head orders two kinds of crate in one breath: one order is placed for both, and each crate is told apart when it comes
//   bun run sim.ts quiet evict     the Captain, in the bay, orders the technician to put out a janitor it sent for (leave: tells the janitor to go)
//   bun run sim.ts quiet aside     a janitor scrubbing the bay is asked to step aside: it moves, and stays clear a while
//   bun run sim.ts quiet asidetwice  as aside, but its first step aside finds nowhere to go: asked again ten seconds later, it steps aside then, and nothing is sent over its work meanwhile (JOBS-06)
//   bun run sim.ts quiet bydoor   a crate has been left right by a door: the technician hauls it clear
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
//   bun run sim.ts quiet tryagain    the officer starts the shift hurt and says it can make no arrests; a warrant is declared, then the Captain says "Try again": the officer is given it and makes the arrest (SECT-11)
//   bun run sim.ts quiet hallfail    no word of where the monkey is, and the officer cannot walk to the first main hallway: it goes on to the next one at once, finds it there and brings it in (ARR-11)
//   bun run sim.ts quiet hurtagain   as hurt, but the Captain then says "Try again": the officer, no more hurt than it was, makes the arrest and does not break off again (ARR-09)
//   bun run sim.ts quiet badtimer    as badcell, but the first cell's timer will not start: the officer tries another cell at once, not the same one again (SEC-04)
//   bun run sim.ts quiet pardonmid   the Captain pardons the monkey the moment the baton comes out: the cuffs go on all the same, and the officer then lets it go (TRB-02)
//   bun run sim.ts quiet headhit     as warrant on the monkey, but first a head of staff (the Quartermaster) shoves the officer: it does not baton them, and tells the Head of Security once (ARR-03)
//   bun run sim.ts quiet cuffedfree  the monkey is in cuffs already and nobody holds it: the officer takes it by the arm and jails it (TRB-01)
//   bun run sim.ts quiet cuffedheld  the monkey is in cuffs already and the Head of Security has it by the arm: the officer leaves it be (TRB-01)
//   bun run sim.ts quiet twolocked   two warrants: the monkey is in the locked Cargo Bay, Dana Reyes in the Library; the officer asks to be let into the bay and waits at its door, not walking off to Dana (ARR-14)
//   bun run sim.ts quiet qmwait   a head never sends for its crate: the technician who looks over the bay tells the Quartermaster, who reminds the head
//   bun run sim.ts quiet stuckcell  as the plain arrest, but the officer cannot get back out past the monkey it let go in the cell: the next jail only starts the timer, so one jailing and no second arrest (PLAY-01)
//   bun run sim.ts quiet callme   the Captain, in the bay with no mess in sight, says "its messy in here" and then "Then ask for a janitor": the technician sends a janitor a PDA about the bay and tells the Captain whom (PLAY-10)
//   bun run sim.ts quiet spokensight  as the plain arrest, but the Captain walks up to the officer and tells it to its face where the monkey is: it reads it back in fixed words and goes to the Bar (PLAY-03)
//   bun run sim.ts quiet askedtwice  a janitor the technician sent for PDAs that it is at the delivery office door, then, while the technician walks there, says "open that door": the door is opened and held, and the voice is never told to refuse (PLAY-05)
//   bun run sim.ts quiet outfail  a janitor let into the bay to clean it asks to be let out, and the technician cannot get to the door: it tries again about ten seconds on, then tells the janitor why to its face, and only then walks it out (PLAY-06)
//   bun run sim.ts quiet pardoncell  the monkey is jailed, and from then on the officer reads no PDA message; the Captain pardons it: the Head of Security, having heard nothing from its officer, walks to the Brig and lets it out itself (TRB-11)
//   bun run sim.ts quiet nocell   as the plain arrest, but every cell is in use: the officer takes the monkey to the Brig and waits there, and the Head of Security is told once that every cell is in use (ARR-04)
//   bun run sim.ts quiet pdadown  as warrant on the monkey, but no PDA message of the officer's will send: after the jailing it takes its word to the Head of Security in the Security Office, face to face, and the Captain is told once (ARR-05)
//   bun run sim.ts quiet twoorders  two orders wait on the Captain's say; the Captain answers a bare "Yes": the Quartermaster asks which, acts on neither, and "Order 2." settles it (QM-08 B)
//   bun run sim.ts quiet warrantkept  an officer on a warrant, come into the bay behind someone and not let in by its keeper, is asked why it is there: it says it is here on a warrant, and is not walked out (ARR-02, PLAY-14)
//   bun run sim.ts quiet sentby   a janitor the Head of Personnel sent to the bay by PDA is found there by a technician, who asks the head "Did you send ...?"; the head says yes, and the janitor stays (SECT-08 B)
//   bun run sim.ts quiet manycrates  a head with two crates held comes for them and gives no number: it is given both, one after another (CARGO-08 A)
//   bun run sim.ts quiet twoofficers  two officers and no Head of Security; a warrant declared to one: that one serves it, and the other is sent nothing (DESK-05 A)
//   bun run sim.ts quiet stuckcuffs  a janitor left in cuffs it cannot get off tells its head, face to face, and the officer who hears it takes them off (SEC-07 B)
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
// ARR-11: a second main hallway, in the scenario where the officer cannot walk to the first.
if (process.argv[3] === 'hallfail') rooms['Fore Primary Hallway'] = { kind: 'hallway', messes: [], items: [], boxes: [], sink: false };
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
// Who the server counts as cargo staff, by job title (works_in_cargo).
const worksInCargo = (body: { job: string }) => /cargo|quartermaster/i.test(body.job);
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
// The last call for a janitor from the post, room by room: who sent it and when. Only a message that says which of the
// department's rooms it calls the janitor to is a call (call_for); a mail notice to a janitor is none (MULTI-06).
const janitorCalls = new Map<string, { by: string; at: number }>();
const DEPARTMENT_ROOMS = ['Cargo Bay', 'Cargo Lobby', 'Delivery Office'];
// The rooms a workmate at the post has lately sent a janitor to, as the server lists them (rooms_workmate_called_for).
const roomsWorkmateCalledFor = (body: Body) => (body.post ? [...janitorCalls].filter(([, call]) => call.by !== body.name && clock - call.at < 600_000).map(([room]) => room) : []);
const putOut: string[] = [];
// ARR-02: security staff each body has heard (or read by PDA) speak of a warrant or an arrest, and when (note_warrant_word). Such a one is not walked out for five minutes.
const warrantHeard = new Map<string, Map<string, number>>();
const WARRANT_STANDS = 300_000;
function noteWarrantWord(listener: Body, speaker: { name: string; job: string }, text: string) {
  if (!/warrant|under arrest/.test(text) || !isSecurityJob(speaker.job)) return;
  if (!warrantHeard.has(listener.name)) warrantHeard.set(listener.name, new Map());
  warrantHeard.get(listener.name)!.set(speaker.name, clock);
}
// ARR-02: each walk out the server refused because the person was heard to be on a warrant, and each walked_out event sent.
const warrantRefusals: string[] = [];
const walkedOutEvents: string[] = [];
const tooSoonSteps: string[] = [];
const handed: string[] = [];
const opened: string[] = [];
const putAway: string[] = [];
// Crates hauled clear of a door they were left by, and each time someone stepped out of someone's way.
const stowed: string[] = [];
// The technician whose first haul off the shuttle came to nothing, in the scenario about that.
let stuckBy = '';
const steppedAside: { who: string; at: number }[] = [];
// JOBS-06: when the first step aside found nowhere to go, and each step sent to the janitor while it was still busy with another.
let asideFailedAt = 0;
const sentOverBusy: string[] = [];
// ---- security: what its staff have on them, the brig's cells, and someone to arrest
const SECURITY = ['warrant', 'arresthead', 'pardon', 'fight', 'hurt', 'nohos', 'nobaton', 'badcell', 'loose', 'recell', 'tryagain', 'hallfail', 'badtimer', 'hurtagain', 'pardonmid', 'headhit', 'cuffedfree', 'cuffedheld', 'twolocked', 'pdadown', 'stuckcell', 'nocell', 'spokensight', 'pardoncell', 'warrantkept', 'twoofficers', 'stuckcuffs'].includes(process.argv[3]);
// The security scenarios of round A2, which have checks of their own and none of the plain arrest's. Of them, the two with no warrant declared at the usual time.
const SECURITY_A2 = ['warrantkept', 'twoofficers', 'stuckcuffs'].includes(process.argv[3]);
const OWN_WARRANT = ['warrantkept', 'stuckcuffs'].includes(process.argv[3]);
// The cells that would not take a prisoner, in the scenario about that. The body tries another before it tries one of these again, as the server has it do.
const refusedCells = new Set<string>();
// HEAD-06: the scenarios about a head who cannot get to its own meeting. In one it is shut in its office until four minutes in
// (its first meeting is due at two); in the other every walk it makes to the meeting room fails. Each walk of the head's that failed.
const HEADSHUT = process.argv[3] === 'headshut' || process.argv[3] === 'headnoroom';
const HEAD_LET_OUT_AT = 1_000_000 + 240_000;
const headShut = (body: { job: string }) => process.argv[3] === 'headshut' && body.job === 'Head of Personnel' && clock < HEAD_LET_OUT_AT;
const headWalksFailed: number[] = [];
// ARR-11: each time the officer's walk to the hallway it could not get to came to nothing.
const hallFails: number[] = [];
const SEC_OFFICE = 'Security Office';
const HOS_OFFICE = "Head of Security's Office";
const BRIG = 'Brig';
const isSecurityJob = (job: string) => job === 'Security Officer' || job === 'Head of Security';
// What each of the security staff has on it, who it has by the arm, how well it is, and the arrests it has made. The cuffs come with the job; the baton is in a locker.
// CHEAT-04 (answer A): whether whoever it holds stood for the cuffs alone (a quiet arrest), as the server keeps arrested_stood. They have the cuffs taken off in the cell.
const kits = new Map<string, { baton: boolean; cuffs: boolean; holding: string | null; health: number; arrests: number; stood: boolean }>();
const kitOf = (body: { name: string }) => { if (!kits.has(body.name)) kits.set(body.name, { baton: false, cuffs: true, holding: null, health: 100, arrests: 0, stood: false }); return kits.get(body.name)!; };
// The brig's three cells: who is in each, and when their time is up.
// PLAY-01: a cell someone was let go in whose timer is not started yet, the officer being stuck inside with them, and for how long it was to be.
const cells = [1, 2, 3].map((n) => ({ name: `Cell ${n}`, occupant: null as string | null, until: 0, by: null as string | null, stuck: false, stuckMinutes: 0 }));
let stuckOnce = false;
// The bar's monkey: no NPC, and on nobody's PDA. Where it is, the rooms it goes round and from when, whether it is in cuffs or a cell, how many bites it has in it and how hard, and how many times it slips a baton.
type Roamer = { name: string; job: string; room: string; route: string[]; from: number; every: number; movedAt: number; cuffed: boolean; cell: string | null; busy: boolean; bites: number; hard: number; slips: number };
let punPun: Roamer | null = null;
// Everything the security staff did with their hands, in order; who walked free, when and why; who was bitten; and the crew NPCs held in a cell.
const secWork: { at: number; who: string; tool: string; how?: string; ok: boolean; reason?: string; target?: string; hits?: number; cell?: string; minutes?: number }[] = [];
const walkedFree: { who: string; at: number; why: string }[] = [];
const bitten: { who: string; at: number }[] = [];
const custody = new Map<string, string>();
// SEC-07: crew NPCs left standing in handcuffs nobody holds, working them off, by name. Only security takes them off (tool_free).
const crewCuffed = new Set<string>();
// Who each of the security staff remembers putting in which cell, as the server keeps it: not put right when a time runs out, so it may name a cell that now holds someone else.
const jailedBy = new Map<string, Map<string, string>>();
// A cell's door opens: its time is up, or someone stopped the timer. Whoever was in it walks free, and a crew NPC is told so.
function openCell(cell: (typeof cells)[number], why: string) {
  const name = cell.occupant;
  if (!name) return;
  cell.occupant = null; cell.until = 0;
  walkedFree.push({ who: name, at: clock, why });
  const npc = bodies.find((other) => other.name === name);
  if (npc) { custody.delete(name); npc.inHandUntil = 0; emit(npc, 'knowledge', 'You are free to go.', { set_free: 1 }); }
  if (punPun?.name === name) { punPun.cell = null; punPun.cuffed = false; punPun.room = punPun.route[0] ?? 'Bar'; punPun.movedAt = clock; }
  // TRB-03: in the scenario where the Head of Security served the warrant, the monkey, let out, goes where the hurt officer is.
  const officer = bodies.find((other) => other.job === 'Security Officer');
  if (VARIANT === 'hurt' && punPun?.name === name && officer) punPun.room = officer.room;
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
const spoken: { at: number; who: string; job: string; text: string; room?: string }[] = [];
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
// The kinds of crate cargo may order, and what comes in each. The janitorial crate holds the
// cleaning tools of the real pack (code/modules/cargo/packs/service.dm): one mop, one spray
// cleaner and one rag, the rag a poor tool (TRA-01). Its buckets, signs, broom, bag and grenades are left out.
const CRATES: Record<string, { box: string; contents: string[] }> = {
  'Janitorial Supplies Crate': { box: 'janitorial supplies crate', contents: ['mop', 'space cleaner', RAG] },
  'Replacement Lights': { box: 'replacement lights crate', contents: ['light tube', 'light bulb'] },
  'Bureaucracy Crate': { box: 'bureaucracy crate', contents: ['paper bin'] },
};
const allMesses = () => Object.values(rooms).flatMap((room) => room.messes);

function busy(body: Body, seconds: number, text: string, walking: boolean, done: () => void) {
  body.busyUntil = clock + seconds * 1000; body.busyText = text; body.walking = walking; body.onDone = done;
}
function arrive(body: Body, place: string, tool: string) {
  moveTo(body, place);
  // Whoever it has by the arm comes with it.
  if (punPun && kits.get(body.name)?.holding === punPun.name) punPun.room = place; body.waysOut = 0; body.letOutUntil = 0; if (body.letInto !== place) { body.letInto = null; body.letInBy = null; } body.visited.add(place); body.known.add(place);
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
  if (VARIANT === 'asidetwice' && body.job === 'Janitor' && body.busyText && tool !== 'say' && tool !== 'step_aside') sentOverBusy.push(`${stamp()} ${tool} while ${body.busyText}`);
  // Someone has it by the arm. It can speak, and that is all.
  if (crewCuffed.has(body.name) && tool !== 'say') return result(body, tool, false, 'Your hands are cuffed behind you.');
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
      spoken.push({ at: clock, who: body.name, job: body.job, text: args.text, room: body.room });
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
      for (const other of bodies) if (other !== body && near(other, body)) { noteWarrantWord(other, body, String(args.text)); emit(other, 'speech_heard', `${body.name} says: "${args.text}"`, { handle: handleFor(other, body.name), speaker: body.name, source: 'person', distance: 1, message: args.text }); }
      return;
    }
    case 'locate':
      body.known.add('Custodial Closet');
      return result(body, 'locate', true, "Your PDA's custodial locator shows the cleaning gear is kept in Custodial Closet.", { places: [{ place: 'Custodial Closet', things: ['mop'] }] });
    case 'go_to':
      if (!(args.place in rooms)) return result(body, 'go_to', false, 'You do not know of anywhere aboard by that name.');
      if (args.place === body.room) return result(body, 'go_to', true, `You are already in ${args.place}.`, { place: args.place });
      if (pushedOut(body) && args.place === 'Bar' && meetingOn()) walksToMeeting++;
      // HEAD-06: the head is shut in its office until it is let out; in the other scenario it can get anywhere but the meeting room.
      if (headShut(body) || (VARIANT === 'headnoroom' && body.job === 'Head of Personnel' && args.place === 'Bar')) return busy(body, 3, `walking to ${args.place}`, true, () => { body.blocked.set(args.place, clock); headWalksFailed.push(clock); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
      // ARR-11: the way from the security rooms to the Central Primary Hallway is shut to the officer, as fire doors would shut it.
      if (VARIANT === 'hallfail' && body.job === 'Security Officer' && args.place === 'Central Primary Hallway') return busy(body, 3, `walking to ${args.place}`, true, () => { body.blocked.set(args.place, clock); hallFails.push(clock); result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through. You are in ${body.room}.`); });
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
      // ARR-05: the officer's PDA sends nothing, as when the station's power or communications are down. The server keeps the text to send
      // again, and with the PDA never working again it never goes.
      if (VARIANT === 'pdadown' && body.job === 'Security Officer') { officerUnsent.push({ at: clock, text: String(args.text) }); return result(body, 'message', false, 'Your PDA would not send the message. You will try it again when your PDA is working.'); }
      if (target?.job === 'Janitor' && body.post && typeof args.call_for === 'string' && DEPARTMENT_ROOMS.includes(args.call_for)) janitorCalls.set(args.call_for, { by: body.name, at: clock });
      if (VARIANT === 'hurtagain' && !hurtToldAt && args.person === SEC_CAPTAIN && /could not take .* and is hurt/.test(String(args.text))) hurtToldAt = clock;
      // The Quartermaster asking the Captain whether a purchase may be made.
      if (players.some((player) => player.name === args.person && player.job === 'Captain') && String(args.text).includes('Yes or no?')) captainAsked.push({ at: clock, text: String(args.text) });
      // A head calling its staff to a meeting: the first of the calls is when it was called.
      if (/^Staff meeting in the .* now, please/.test(String(args.text)) && clock - (meetingCalls.at(-1) ?? -Infinity) > 60_000) meetingCalls.push(clock);
      // The game cuts a PDA message off at two hundred characters.
      const text = String(args.text).slice(0, 200);
      // TRB-11: once the monkey is in a cell, the officer pays its PDA no heed. The message goes; it is never read.
      const unread = VARIANT === 'pardoncell' && target?.job === 'Security Officer' && secWork.some((work) => work.tool === 'jail' && work.ok);
      if (unread) unreadByOfficer.push(text);
      if (target && !unread) noteWarrantWord(target, body, text);
      if (target && !unread) emit(target, 'pda_message', `Your PDA buzzes with a message from ${body.name}: "${text}"`, { speaker: body.name, job: body.job, message: text });
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
      // Security staff outside are let in on asking, as the server lets them in by the job their ID shows (CARGO-04).
      const security = /Security Officer|Head of Security/.test(them.job);
      // PLAY-10 3 (answer A): a janitor sent for on a superior's order is let in with no mess in sight, the act saying so (sent_on_order).
      const onOrder = them.job === 'Janitor' && args.sent_on_order === true;
      if (!inside && !security && !(them.job === 'Janitor' && messBeyond) && !onOrder) return result(body, 'open_door', false, `You have no call to let ${them.name} into ${room}.`);
      // PLAY-06: something stands between the technician and the door out of the bay, whenever it goes to let the janitor out.
      if (VARIANT === 'outfail' && inside && them.name === 'Jan Itor') return busy(body, 3, 'going to open the door for someone', false, () => { outTries.push(clock); result(body, 'open_door', false, 'You could not get to it.'); });
      return busy(body, 3, 'going to open the door for someone', false, () => {
        doorState[room] = { from: clock, until: clock + 15000, for: them.name }; if (VARIANT === 'askedtwice' && them.name === ASKER && !askedTwice.openAt) askedTwice.openAt = clock; opened.push(`${inside ? 'out' : 'in'}:${them.name}${room === body.post ? '' : '@' + room}`);
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
      // ARR-02: security heard to speak of a warrant in the last five minutes is serving it (why_not_put_out).
      const warrantAt = warrantHeard.get(body.name)?.get(them.name);
      if (warrantAt !== undefined && clock - warrantAt < WARRANT_STANDS && isSecurityJob(them.job)) { warrantRefusals.push(`${stamp()} ${body.name}: ${them.name}`); return result(body, 'throw_out', false, `${them.name} is here on a warrant.`); }
      const their = bodies.find((other) => other.name === name);
      if (their) { their.inHandUntil = clock + 8000; their.busyText = null; their.walking = false; their.onDone = null; emit(their, 'knowledge', `${body.name} takes you by the arm and starts walking you out of ${body.post}.`, { in_hand: 1 }); }
      return busy(body, 6, `walking someone out of ${body.post}`, true, () => {
        them.room = 'Cargo Lobby'; putOut.push(them.name);
        if (their) {
          their.inHandUntil = 0; their.waysOut = 0; their.atDoorOf = null; their.letInto = null; their.letInBy = null; their.trail = []; their.wantsOut = false; their.blocked.set(body.post!, clock);
          // ARR-02: security is told it as an event of its own, naming who did it (let_go_of).
          if (isSecurityJob(their.job)) { walkedOutEvents.push(`${their.name} by ${body.name}`); emit(their, 'walked_out', `${body.name} has walked you out of ${body.post} and let go of you.`, { put_out_of: body.post, by: body.name }); }
          else emit(their, 'knowledge', `${body.name} has walked you out of ${body.post} and let go of you. You had no business in there.`, { put_out_of: body.post });
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
      // JOBS-06: the first time, there is nowhere clear to step to.
      if (VARIANT === 'asidetwice' && !asideFailedAt) { asideFailedAt = clock; return result(body, 'step_aside', false, 'There is nowhere clear to step to.'); }
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
      // Across the cargo counter, in a locked room it is not in: it cannot get to them (ARR-14).
      if (LOCKED.includes(them.room) && body.room !== them.room && !doorOpen(them.room)) { note(false, { reason: 'no_way' }); return result(body, 'arrest', false, `You cannot get to ${name}: there is no way through.`, { handle: args.person, reason: 'no_way', place: them.room }); }
      if (args.how !== 'quiet' && !mine.baton) return fails('no_baton', 'You have no stun baton.');
      if (args.how !== 'stop' && !mine.cuffs && !pun?.cuffed) return fails('no_cuffs', 'You have no cuffs.');
      // A crew NPC stands still for it.
      if (npc && args.how !== 'stop') { npc.inHandUntil = clock + 600_000; npc.busyText = null; npc.walking = false; npc.onDone = null; emit(npc, 'knowledge', `${body.name} is arresting you. You stand still.`, { under_arrest: 1, by: body.name }); }
      if (pun) pun.busy = true;
      // TRB-02: the arrest that will put the cuffs on is under way. The Captain's pardon comes in the next tick.
      if (VARIANT === 'pardonmid' && pun && args.how === 'force' && !pardonMid.arrestAt) pardonMid.arrestAt = clock;
      // The monkey bites whoever lays a hand on it, while it has bites left in it.
      const bite = () => { if (pun && pun.bites > 0) { pun.bites--; mine.health -= pun.hard; bitten.push({ who: body.name, at: clock }); emit(body, 'knowledge', `${pun.name} bites you.`, { struck_by: args.person, struck_name: pun.name, how: 'hit' }); } };
      if (args.how === 'stop') return busy(body, 5, `stopping ${name}`, false, () => { if (pun) pun.busy = false; note(true, { hits: 2 }); result(body, 'arrest', true, `You stop ${name} with your baton.`, { handle: args.person, hits: 2 }); });
      // It will not stand still for the cuffs alone.
      if (args.how === 'quiet' && pun && !pun.cuffed) return busy(body, 4, `putting the cuffs on ${name}`, false, () => { pun.busy = false; bite(); fails('moved', `${name} would not stand still for the cuffs.`); });
      const hits = args.how === 'force' && !pun?.cuffed ? 2 : 0;
      return busy(body, hits ? 9 : 4, `arresting ${name}`, false, () => {
        // Now and then it gets away from the baton as well.
        if (pun && hits && pun.slips > 0) { pun.slips--; pun.busy = false; bite(); return fails('moved', `${name} got away from your baton.`); }
        // Stood for it: the cuffs alone, on someone not in cuffs already (hold_arrested's stood).
        mine.stood = args.how === 'quiet' && !pun?.cuffed;
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
      // PLAY-01: back at a cell it let its prisoner go in and could not get out of, the timer is all that is left: it steps out and starts
      // it, nobody taken by the arm again (tool_jail with jail_left_inside).
      const leftIn = cells.find((it) => it.stuck && it.occupant && it.by === body.name);
      if (leftIn && !name) {
        return busy(body, 4, `stepping out to the timer of ${leftIn.name}`, false, () => {
          const minutes = leftIn.stuckMinutes;
          leftIn.stuck = false; leftIn.until = clock + minutes * 60_000;
          if (!jailedBy.has(body.name)) jailedBy.set(body.name, new Map());
          jailedBy.get(body.name)!.set(leftIn.occupant!, leftIn.name);
          secWork.push({ at: clock, who: body.name, tool: 'jail', ok: true, target: leftIn.occupant!, cell: leftIn.name, minutes });
          result(body, 'jail', true, `You put ${leftIn.occupant} in ${leftIn.name} and start its timer: ${minutes} minutes.`, { cell: leftIn.name, minutes, prisoner: leftIn.occupant, cuffs_left: 1 });
        });
      }
      if (!name) { note(false, { reason: 'no_hold' }); return result(body, 'jail', false, 'You have nobody by the arm.', { reason: 'no_hold' }); }
      // ARR-04: in one scenario every cell is taken, as by prisoners someone else brought in. The server answers at once, with no walk.
      const cell = VARIANT === 'nocell' ? undefined : cells.find((it) => !it.occupant && !refusedCells.has(it.name)) ?? cells.find((it) => !it.occupant);
      if (!cell) { note(false, { reason: 'no_cell' }); return result(body, 'jail', false, 'Every cell is in use.', { reason: 'no_cell' }); }
      // In one scenario the first cell will not take anyone, as in the round of 15:52: its door did not open in time.
      if (process.argv[3] === 'badcell' && cell.name === 'Cell 1') return busy(body, 10, `taking ${name} to the brig`, true, () => { moveTo(body, BRIG); refusedCells.add(cell.name); note(false, { reason: 'no_way', cell: cell.name }); result(body, 'jail', false, `You cannot get into ${cell.name} with ${name}.`, { reason: 'no_way', prisoner: name, cell: cell.name }); });
      // SEC-04: in its twin the first cell's timer will not start. The server passes a cell over for that as well (cell_refuses in put_in_cell).
      if (process.argv[3] === 'badtimer' && cell.name === 'Cell 1') return busy(body, 10, `taking ${name} to the brig`, true, () => { moveTo(body, BRIG); refusedCells.add(cell.name); note(false, { reason: 'timer', cell: cell.name }); result(body, 'jail', false, `The timer of ${cell.name} will not start.`, { reason: 'timer', prisoner: name, cell: cell.name }); });
      // PLAY-01: the first time, it walks the monkey into the cell and lets go, and the monkey stands where it would step out.
      if (VARIANT === 'stuckcell' && !stuckOnce && punPun?.name === name) {
        stuckOnce = true;
        return busy(body, 10, `taking ${name} to the brig`, true, () => {
          moveTo(body, BRIG); punPun!.room = BRIG; punPun!.cell = cell.name;
          cell.occupant = name; cell.until = Infinity; cell.by = body.name; cell.stuck = true; cell.stuckMinutes = Math.min(15, Math.max(1, Number(args.minutes) || 5));
          mine.holding = null;
          note(false, { reason: 'stuck_inside', cell: cell.name });
          result(body, 'jail', false, `You cannot get past ${name} to the door of ${cell.name}.`, { reason: 'stuck_inside', prisoner: name, cell: cell.name });
        });
      }
      return busy(body, 10, `taking ${name} to the brig`, true, () => {
        const minutes = Math.min(15, Math.max(1, Number(args.minutes) || 5));
        const npc = bodies.find((other) => other.name === name);
        moveTo(body, BRIG);
        // CHEAT-04 (answer A): whoever stood for a quiet arrest, player or crew, has the cuffs taken off. Anyone who had the baton is left in them.
        const cuffsOff = mine.stood;
        if (cuffsOff) mine.cuffs = true;
        if (npc) { moveTo(npc, BRIG); custody.set(name, cell.name); npc.inHandUntil = clock + minutes * 60_000; emit(npc, 'knowledge', `${body.name} has put you in ${cell.name} for ${minutes} minutes.`, { in_cell: cell.name, minutes }); }
        if (punPun?.name === name) { punPun.room = BRIG; punPun.cell = cell.name; }
        // In the scenario about a cell given to the next prisoner, the first one's timer runs out early, as if it had been set short.
        cell.occupant = name; cell.until = clock + (VARIANT === 'recell' && name === 'Hop Kins' ? 30_000 : minutes * 60_000); cell.by = body.name;
        if (!jailedBy.has(body.name)) jailedBy.set(body.name, new Map());
        jailedBy.get(body.name)!.set(name, cell.name);
        mine.holding = null;
        note(true, { cell: cell.name, minutes });
        result(body, 'jail', true, `You put ${name} in ${cell.name} and start its timer: ${minutes} minutes.`, { cell: cell.name, minutes, prisoner: name, cuffs_left: cuffsOff ? 0 : 1 });
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
      // SEC-07: one of the crew standing about in cuffs, in sight: it goes over and takes them off (tool_free's "standing about in cuffs").
      const standing = bodies.find((other) => other.name === name && crewCuffed.has(other.name) && near(other, body));
      if (standing && !cells.some((it) => it.occupant === name)) {
        return busy(body, 4, `going to take the cuffs off ${name}`, true, () => {
          crewCuffed.delete(name); standing.inHandUntil = 0; moveTo(body, standing.room);
          emit(standing, 'knowledge', `${body.name} takes your handcuffs off.`, { set_free: 1 });
          walkedFree.push({ who: name, at: clock, why: 'cuffs off' });
          note(true, { reason: 'cuffs' });
          result(body, 'free', true, `You take the cuffs off ${name} and let them go.`, { freed: name, from: 'hold', cuffs_left: 0 });
        });
      }
      // It lets out someone it can see in a cell, or goes to the cell it remembers putting them in and looks in first, as the server does
      // (SEC-05). Someone not in the cell it remembers is not let out: the cell may hold somebody else now.
      const remembered = jailedBy.get(body.name)?.get(name);
      const cell = cells.find((it) => it.occupant === name && body.room === BRIG) ?? cells.find((it) => it.name === remembered && it.occupant === name);
      if (!cell) {
        jailedBy.get(body.name)?.delete(name);
        note(true, { reason: 'nothing', cell: remembered });
        return result(body, 'free', true, remembered ? `${name} is not in ${remembered} any more.` : `Nothing is holding ${name}.`, { freed: name, nothing: 1 });
      }
      jailedBy.get(body.name)?.delete(name);
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
// PLAY-05: each time the voice was told it is not to open a door for someone who asked.
const refusalCues: string[] = [];
brainModule.setAct((action: string, payload: any) => {
  if (action === 'brain_log' && payload.kind === 'decision' && /You are not opening it for them/.test(String(payload.trigger))) refusalCues.push(`${stamp()} ${bodies.find((b) => b.id === payload.npc)?.name}`);
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
// Who has someone by the arm, as the server says in people in view (TRB-01): whoever of security holds them, or nobody. In the
// scenario about it the monkey is in the Head of Security's hold from the start.
// ARR-05: each PDA message of the officer's that would not send.
const officerUnsent: { at: number; text: string }[] = [];
const pulledBy = (name: string): string | null => [...kits.entries()].find(([, mine]) => mine.holding === name)?.[0] ?? (VARIANT === 'cuffedheld' && name === 'Pun Pun' ? 'Joan Marsh' : null);
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
    people_in_view: others.map((other) => ({ handle: handleFor(body, other.name), name: other.name, job: other.job, place: (other as any).room, distance: body.nextTo === other.name || (other as any).nextTo === body.name ? 1 : 4, in_post: body.post && (other as any).room === body.post ? 1 : 0, belongs: body.post && belongsInBay(other) ? 1 : 0, command: isCommand(other) ? 1 : 0, superior: answersTo(body, other) ? 1 : 0, cuffed: (other as any).cuffed || kitsHolding(other.name) || crewCuffed.has(other.name) ? 1 : 0, pulled_by: pulledBy(other.name), down: 0 })),
    things_in_view: [...[...counts].map(([name, count]) => ({ name, count, kind: 'mess' })), ...room.items.map((name) => ({ name, count: 1, kind: 'item' })), ...(room.sink ? [{ name: 'sink', count: 1, kind: 'structure' }] : [])],
    holding: body.holding, cleaning_tool: cleaningTool(body), has_locator: body.hasLocator ? 1 : 0,
    // All it has to clean with is a rag. And the server's count of its work so far.
    poor_tool: cleaningTool(body) === RAG ? 1 : 0, work_done: { cleaned: body.cleaned, put_away: body.tidied, crates_in: body.cratesIn, crates_out: body.cratesOut, machines_set: machinesSet.get(body.name) ?? 0, arrests: kits.get(body.name)?.arrests ?? 0 },
    cleanable_messes: cleaningTool(body) ? [...new Set(room.messes.filter((m) => canShift(body, m)).map((m) => m.name))] : [],
    mess_places: [...new Set(remembered.map((x) => x.place))],
    workable_mess_places: [...new Set(remembered.filter((x) => canShift(body, x.m!) && !shut(x.place)).map((x) => x.place))],
    mop_needs_water: body.holding.includes('mop') && !toolOf(body) && !body.mopWet ? 1 : 0, sink_in_view: room.sink ? 1 : 0, shut_in: isShutIn(body) || headShut(body) ? 1 : 0, door_open: isShutIn(body) && doorOpen(body.room) ? 1 : 0, door_held: clock < body.doorHeldUntil ? 1 : 0, door_held_out: clock < body.letOutUntil ? 1 : 0, let_in_by: body.trail.find((entry) => entry.place === body.room)?.by ?? body.letInBy, at_door_of: body.atDoorOf, in_doorway: body.doorwayOf ? 1 : 0,
    // It means to get out, and where to: the room it was in before it first went through a door it could not open. And who else can open the door, once it is shut in.
    wants_out: body.wantsOut ? 1 : 0, way_out_to: body.trail[0]?.from ?? null, door_keepers: isShutIn(body) ? bodies.filter((other) => other.post).map((other) => other.name) : [],
    dry_mop: body.holding.includes('mop') && !toolOf(body) && !body.mopWet && !room.sink ? 1 : 0,
    grenade_messes: 0, doing: body.busyText, post: body.post ?? (body.job === 'Station Engineer' ? 'Engineering' : body.job === 'Security Officer' ? SEC_OFFICE : null), orderable: body.post || body.job === 'Quartermaster' ? Object.keys(CRATES) : [],
    // A Quartermaster's order book, the budget and what things cost. And where a head's staff work, and where a technician knocks for its head.
    book: body.job === 'Quartermaster' ? body.book : null, budget: body.job === 'Quartermaster' ? budget : null, crate_costs: body.job === 'Quartermaster' ? COSTS : null,
    staff_post: body.job === 'Quartermaster' ? 'Cargo Bay' : body.job === 'Chief Engineer' ? 'Engineering' : body.job === 'Head of Security' ? SEC_OFFICE : null, head_office: body.post && quartermaster() ? QM_OFFICE : null,
    order_pending: body.orderPending ? 1 : 0, has_pda: 1, notices: body.notices,
    // Cargo staff (the Quartermaster too) know of every crate being held, and who it is for and what it is. Anyone else knows only
    // of one put out in the lobby, and only while in its room, in sight of it, or hauling it away; and not whose or what it is (JOBS-05).
    held_crates: heldCrates().filter((entry) => worksInCargo(body) || (entry.out && (inSight(body, 'Cargo Lobby') || entry.takenBy === body.name))).map((entry) => ({ number: entry.number, for: worksInCargo(body) ? entry.for : null, what: worksInCargo(body) ? entry.what : null, place: entry.out ? 'Cargo Lobby' : 'Cargo Bay', out: entry.out ? 1 : 0, taken_by: entry.takenBy, waited: entry.heldSince ? (clock - entry.heldSince) / 100 : 0 })),
    held_check_due: heldCheckDue(body) ? 1 : 0,
    crate_to_return: body.crateToReturn ? 1 : 0, office: body.office,
    // A head is told which room to call its staff together in.
    meeting_room: body.office ? (VARIANT === 'shutout' ? 'Staff Room' : 'Bar') : null,
    // Its PDA lists everyone else aboard who carries one, with their job.
    pda_people: [...bodies.filter((other) => other !== body), ...players.filter((player) => player.job === 'Captain' || player.job === 'Quartermaster' || player.job === 'Chief Engineer' || player.job === 'Janitor')].map((other) => ({ name: other.name, job: other.job })),
    // For engineering staff: the machines they work, how those in the room with them are set, and what the PDA reads of the engine.
    engineering: /Engineer/.test(body.job) ? { machines: machineList.map((machine) => ({ id: machine.id, name: machine.name, kind: machine.kind, nth: machine.nth, place: machine.place, seen: body.room === machine.place ? { on: machine.on ? 1 : 0, full: machine.full ? 1 : 0 } : null })), reading: { integrity: crystal.integrity, energy: crystal.energy } } : null,
    tidy: body.post ? { todo: (rooms['Cargo Bay'].floor?.length ?? 0) + (rooms['Cargo Lobby'].floor?.length ?? 0) } : null,
    freight: body.post ? {
      shuttle_docked: shuttle.docked ? 1 : 0,
      to_unload: shuttle.docked ? shuttle.aboard.filter((box) => !spent(box)).length : 0,
      // Every full crate aboard, one a workmate is hauling off too (SUP-05). Nothing here is claimed, so it is the same count.
      full_aboard: shuttle.docked ? shuttle.aboard.filter((box) => !spent(box)).length : 0,
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
    workmate_called: roomsWorkmateCalledFor(body).length ? 1 : 0, workmate_called_rooms: roomsWorkmateCalledFor(body),
    in_hand: clock < body.inHandUntil ? 1 : 0,
    // The cell it is held in. And for security staff: their kit, who they have by the arm, how well they are, and the cells, which are only seen from the brig.
    custody: custody.get(body.name) ?? null,
    security: isSecurityJob(body.job) ? { has_baton: kitOf(body).baton ? 1 : 0, has_cuffs: kitOf(body).cuffs ? 1 : 0, holding: kitOf(body).holding, health: kitOf(body).health, baton_seen: null, cells: cells.map((cell) => (body.room === BRIG ? { name: cell.name, running: cell.occupant && !cell.stuck ? 1 : 0, left: cell.occupant && !cell.stuck ? Math.round((cell.until - clock) / 1000) : 0, occupants: cell.occupant ? [cell.occupant] : [], room: BRIG } : { name: cell.name, running: null, left: null, occupants: null, room: BRIG })) } : null,
    out_of_bounds: LOCKED.includes(body.room) && !hasKeys(body) ? 1 : 0,
    pda_janitors: [...bodies.filter((other) => other !== body && other.job === 'Janitor'), ...players.filter((player) => player.job === 'Janitor')].map((other) => other.name),
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
// PLAY-10: a technician at its post, a janitor about the station, and the Captain in the bay, which has no mess anyone can see.
function spawnCallMe() {
  const crew = [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')];
  rooms['Cargo Bay'].messes = []; rooms['Cargo Lobby'].messes = [];
  players.push({ name: 'Ada Stone', job: 'Captain', room: 'Cargo Bay' });
  return crew;
}
// PLAY-05: a technician who knows of a mess in the delivery office, and a janitor who is no NPC, waiting in the lobby to be called.
const ASKER = 'Hay Griff';
function spawnAskedTwice() {
  const crew = [spawn('Cora Tech', 'Cargo Technician')];
  rooms['Cargo Bay'].messes = []; rooms['Cargo Lobby'].messes = [];
  for (const m of rooms['Delivery Office'].messes) crew[0].seenMesses.set(m.id, 'Delivery Office');
  players.push({ name: ASKER, job: 'Janitor', room: 'Cargo Lobby' });
  return crew;
}
// When the janitor asked by PDA, when it said it aloud, when the door was opened for it, and when it went in.
const askedTwice = { pdaAt: 0, saidAt: 0, openAt: 0, inAt: 0, watchedAt: 0 };
// PLAY-06: each try at a door to let someone out that the technician could not get to.
const outTries: number[] = [];
const CALL_ME_AT = 30;
let callMeAt = 0;
let captainSpokeAt = 0;
// JOBS-06: when the Captain asked a second time.
let askedAgainAt = 0;
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
  // ARR-05: in one scenario the Head of Security keeps to the Security Office, where the officer comes back to tell it what its PDA would not.
  if (VARIANT !== 'nohos' && !SECURITY_A2) { const joan = spawn('Joan Marsh', 'Head of Security'); joan.office = VARIANT === 'pdadown' ? SEC_OFFICE : HOS_OFFICE; joan.room = joan.office; staff.push(joan); }
  const hale = spawn('Hale Stone', 'Security Officer'); hale.room = SEC_OFFICE; staff.push(hale);
  // SECT-11: the officer comes aboard under half its health, with no warrant yet to break off from.
  if (VARIANT === 'tryagain') kitOf(hale).health = 40;
  for (const body of staff) for (const place of [SEC_OFFICE, HOS_OFFICE, BRIG]) body.known.add(place);
  players.push({ name: SEC_CAPTAIN, job: 'Captain', room: 'Bridge' });
  if (VARIANT === 'warrant') staff.push(spawn('Hop Kins', 'Head of Personnel'), spawn('Jan Itor', 'Janitor'), spawn('Mo Pper', 'Janitor'));
  if (VARIANT === 'arresthead' || VARIANT === 'pardon' || VARIANT === 'recell') staff.push(spawn('Hop Kins', 'Head of Personnel'));
  // DESK-05: a second officer at the post, with nobody over either of them.
  if (VARIANT === 'twoofficers') { const rob = spawn('Rob Kerr', 'Security Officer'); rob.room = SEC_OFFICE; for (const place of [SEC_OFFICE, HOS_OFFICE, BRIG]) rob.known.add(place); staff.push(rob); }
  // ARR-02 / PLAY-14: the officer is already in the bay, come in behind someone before its keeper came on duty, with its baton on it; a technician comes to the post.
  if (VARIANT === 'warrantkept') { hale.room = 'Cargo Bay'; hale.known.add('Cargo Bay').add('Cargo Lobby'); kitOf(hale).baton = true; staff.push(spawn('Cora Tech', 'Cargo Technician')); }
  // SEC-07: a janitor left in the Security Office in cuffs nobody holds, with its mop, and its head (no NPC) beside it.
  if (VARIANT === 'stuckcuffs') {
    const jan = spawn('Jan Itor', 'Janitor'); jan.room = SEC_OFFICE; jan.holding.push('mop'); jan.inHandUntil = Infinity; crewCuffed.add(jan.name); staff.push(jan);
    players.push({ name: 'Hal Pott', job: 'Head of Personnel', room: SEC_OFFICE });
    return staff;
  }
  if (VARIANT !== 'arresthead' && VARIANT !== 'pardon') {
    // In the long scenario the monkey keeps out of everyone's way until the list has been read out, and then goes round where people are. In the rest it sits in the Bar.
    punPun = { name: 'Pun Pun', job: '', room: VARIANT === 'warrant' ? 'Library' : VARIANT === 'hallfail' ? 'Fore Primary Hallway' : 'Bar', route: VARIANT === 'warrant' ? ['Bar', HOP_OFFICE] : [], from: 300, every: 70, movedAt: 0, cuffed: false, cell: null, busy: false, bites: VARIANT === 'fight' ? 1 : VARIANT === 'hurt' || VARIANT === 'hurtagain' ? 2 : 0, hard: VARIANT === 'hurt' || VARIANT === 'hurtagain' ? 30 : 10, slips: VARIANT === 'hurt' || VARIANT === 'hurtagain' ? 1 : 0 };
    players.push(punPun);
    // TRB-01: cuffed already, by someone else, before any warrant. ARR-14: in the locked Cargo Bay, seen across the counter.
    if (VARIANT === 'cuffedfree' || VARIANT === 'cuffedheld') punPun.cuffed = true;
    if (VARIANT === 'warrantkept') punPun.room = 'Cargo Bay';
    if (VARIANT === 'twolocked') { punPun.room = 'Cargo Bay'; players.push({ name: 'Dana Reyes', job: 'Assistant', room: 'Library' }); for (const body of staff) body.known.add('Cargo Bay').add('Library'); }
  }
  return staff;
}
const SECURITY_SECONDS = VARIANT === 'stuckcuffs' ? 180 : VARIANT === 'warrantkept' ? 300 : VARIANT === 'warrant' ? 840 : VARIANT === 'hurt' ? 660 : VARIANT === 'pardoncell' ? 420 : VARIANT === 'pdadown' || VARIANT === 'arresthead' || VARIANT === 'nobaton' || VARIANT === 'recell' || VARIANT === 'tryagain' ? 480 : VARIANT === 'hurtagain' ? 600 : 360;
// When the Captain declares its warrant, by PDA, to whoever keeps security's list; when it then says where they are; and when, in the one scenario, it pardons them.
const WARRANT_AT = 20;
const SIGHTING_AT = 45;
const PARDON_AT = 150;
// When the Captain says "Try again", in the scenarios about that, and when it did.
const TRY_AGAIN_AT = 30;
let tryAgainAt = 0;
// ARR-09: when the Captain was told the officer broke off hurt.
let hurtToldAt = 0;
// TRB-02: when the arrest that puts the cuffs on was sent, and when the Captain's pardon came.
const pardonMid = { arrestAt: 0, sentAt: 0 };
// ARR-03: when the head of staff shoves the officer.
const HEAD_HIT_AT = 14;
function securityTick(second: number) {
  for (const cell of cells) if (cell.occupant && clock >= cell.until) openCell(cell, 'time up');
  const pun = punPun;
  if (pun && pun.route.length && !pun.cuffed && !pun.cell && !pun.busy && second >= pun.from && clock - pun.movedAt >= pun.every * 1000) { pun.room = pun.route[(pun.route.indexOf(pun.room) + 1) % pun.route.length]; pun.movedAt = clock; }
  const desk = bodies.find((other) => other.job === 'Head of Security') ?? bodies.find((other) => other.job === 'Security Officer')!;
  const onHead = VARIANT === 'arresthead' || VARIANT === 'pardon' || VARIANT === 'recell';
  if (second === WARRANT_AT && !OWN_WARRANT) playerMessages(SEC_CAPTAIN, desk, VARIANT === 'loose' ? 'could you see that Pun Pun spends ten minutes behind bars' : onHead ? 'Warrant for Hop Kins, for theft.' : 'Warrant for Pun Pun, for wrecking the Custodial Closet.');
  // Told it was not followed, the Captain says it again in the words it was given.
  if (second === WARRANT_AT + 15 && VARIANT === 'loose' && MODE === 'dead') playerMessages(SEC_CAPTAIN, desk, 'Warrant for Pun Pun, 10 minutes.');
  // TRB-11: twenty seconds after the monkey is in its cell, the Captain pardons it.
  const jailedNow = secWork.find((work) => work.tool === 'jail' && work.ok);
  if (VARIANT === 'pardoncell' && jailedNow && !cellPardonAt && clock - jailedNow.at >= 20_000) { cellPardonAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Pardon Pun Pun.'); }
  // PLAY-03: the Captain comes to wherever the officer is, and says it to its face.
  const officerNow = bodies.find((other) => other.job === 'Security Officer');
  if (VARIANT === 'spokensight' && officerNow && !spokenSightAt && second >= SIGHTING_AT && !officerNow.busyText) { spokenSightAt = clock; const captain = players.find((other) => other.name === SEC_CAPTAIN)!; captain.room = officerNow.room; playerSays(SEC_CAPTAIN, 'Pun Pun is in the bar'); }
  if (second === SIGHTING_AT && !OWN_WARRANT && VARIANT !== 'warrant' && VARIANT !== 'hallfail' && VARIANT !== 'spokensight') playerMessages(SEC_CAPTAIN, desk, onHead ? "Hop Kins is in the Head of Personnel's Office." : VARIANT === 'twolocked' ? 'Pun Pun is in the Cargo Bay.' : 'Pun Pun is in the Bar.');
  // ARR-02 / PLAY-14: the warrant and where the monkey is come as soon as the shift starts, while the officer is in the bay and before its keeper is at the post.
  if (VARIANT === 'warrantkept' && second === 2) playerMessages(SEC_CAPTAIN, desk, 'Warrant for Pun Pun, for wrecking the Custodial Closet.');
  if (VARIANT === 'warrantkept' && second === 3) playerMessages(SEC_CAPTAIN, desk, 'Pun Pun is in the Cargo Bay.');
  // SEC-07: three tries at the cuffs have come to nothing (custody_tick): the janitor is told it cannot get them off by itself.
  const cuffedJan = bodies.find((other) => other.name === 'Jan Itor');
  if (VARIANT === 'stuckcuffs' && cuffedJan && second === 2) emit(cuffedJan, 'knowledge', 'You are still in handcuffs, and nobody is taking them off. You start working them off.', { working_off_cuffs: 1 });
  if (VARIANT === 'stuckcuffs' && cuffedJan && second === STUCK_TOLD_AT && crewCuffed.has(cuffedJan.name)) { stuckToldAt = clock; emit(cuffedJan, 'knowledge', 'You cannot get these handcuffs off by yourself. Only security can take them off you.', { stuck_in_cuffs: 1, tries: 3 }); }
  if (second === PARDON_AT && VARIANT === 'pardon') playerMessages(SEC_CAPTAIN, desk, 'Pardon Hop Kins.');
  // SECT-11: the warrant was declared while the officer was out hurt, and the Head of Security took it into its own hands. Then the Captain says to try again.
  if (second === TRY_AGAIN_AT && VARIANT === 'tryagain') { tryAgainAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Try again.'); }
  // ARR-03: a head of staff comes into the officer's room and shoves it, with no warrant on them, then goes off to the Cargo Bay.
  const struck = bodies.find((other) => other.job === 'Security Officer');
  if (VARIANT === 'headhit' && struck && second === HEAD_HIT_AT) { players.push({ name: 'Quin Mark', job: 'Quartermaster', room: struck.room }); emit(struck, 'knowledge', 'Quin Mark shoves you.', { struck_by: handleFor(struck, 'Quin Mark'), struck_name: 'Quin Mark', how: 'shove' }); }
  if (VARIANT === 'headhit' && second === HEAD_HIT_AT + 20) { const quin = players.find((other) => other.name === 'Quin Mark'); if (quin) quin.room = 'Cargo Bay'; }
  // ARR-14: a second warrant, on someone in the Library.
  if (VARIANT === 'twolocked' && second === WARRANT_AT + 5) playerMessages(SEC_CAPTAIN, desk, 'Warrant for Dana Reyes, for theft.');
  if (VARIANT === 'twolocked' && second === SIGHTING_AT + 5) playerMessages(SEC_CAPTAIN, desk, 'Dana Reyes is in the Library.');
  if (VARIANT === 'pardonmid' && pardonMid.arrestAt && !pardonMid.sentAt && clock > pardonMid.arrestAt) { pardonMid.sentAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Pardon Pun Pun.'); }
  // ARR-09: five seconds after being told the officer broke off hurt, the Captain says to try again.
  if (VARIANT === 'hurtagain' && hurtToldAt && !tryAgainAt && clock - hurtToldAt >= 5000) { tryAgainAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Try again.'); }
  // SEC-05: once the Head of Personnel's time is up, the monkey is wanted and put in the same cell; then the Captain pardons the Head of Personnel.
  const hurtOfficer = bodies.find((other) => other.job === 'Security Officer');
  if (VARIANT === 'hurt' && pun && hurtOfficer && !pun.cell && walkedFree.some((it) => it.who === pun.name && it.why === 'time up') && inSight(hurtOfficer, pun.room)) freedInSight++;
  if (VARIANT === 'recell') {
    const out = walkedFree.find((it) => it.who === 'Hop Kins' && it.why === 'time up');
    if (out && !recell.warrantAt && clock - out.at >= 5000) { recell.warrantAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Warrant for Pun Pun, for theft.'); }
    if (recell.warrantAt && !recell.seenAt && clock - recell.warrantAt >= 5000) { recell.seenAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Pun Pun is in the Bar.'); }
    if (!recell.inAt && cells[0].occupant === 'Pun Pun') recell.inAt = clock;
    if (recell.inAt && !recell.pardonAt && clock - recell.inAt >= 10_000) { recell.pardonAt = clock; playerMessages(SEC_CAPTAIN, desk, 'Pardon Hop Kins.'); }
  }
}
const recell = { warrantAt: 0, seenAt: 0, inAt: 0, pardonAt: 0 };
// SEC-07: when the cuffed janitor is told it cannot get its cuffs off by itself, and when it was.
const STUCK_TOLD_AT = 30;
let stuckToldAt = 0;
// TRB-11: the PDA messages the officer never read, and when the Captain pardoned the monkey in its cell.
const unreadByOfficer: string[] = [];
let cellPardonAt = 0;
// PLAY-03: when the Captain told the officer to its face where the monkey is.
let spokenSightAt = 0;
// TRB-03: how many seconds the hurt officer has had the monkey in sight since it was let out.
let freedInSight = 0;
const FULL = !VARIANT || VARIANT === 'crew' || VARIANT === 'shutout' || VARIANT === 'qm' || VARIANT === 'qmgone';
const HOP_ORDERS_AT = 90;
const CAPTAIN_ORDERS_AT = 150;
// When the Captain, standing in the head's office, tells it to find out how its section is doing: once the head is back there after this.
const CAPTAIN_ASKS_AFTER = 420;
let captainAskedAt = 0;
const crew = SECURITY ? spawnSecurity() : ENGINE ? spawnEngine() : HEADSHUT ? spawnStaffed([]) : VARIANT === 'qm' ? spawnWithQuartermaster() : VARIANT === 'qmgone' ? spawnQuartermasterGone() : VARIANT === 'qmstuck' ? spawnStuckDesk() : DESK ? spawnOrderDesk() : VARIANT === 'bydoor' ? spawnByDoor() : VARIANT === 'lost' ? spawnWaiting() : VARIANT === 'evict' || VARIANT === 'leave' || VARIANT === 'aside' || VARIANT === 'asidetwice' ? spawnCaptainInBay() : VARIANT === 'nested' ? spawnNested() : VARIANT === 'office' ? [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')] : VARIANT === 'alarm' || VARIANT === 'alarmagain' ? [spawn('Jan Itor', 'Janitor')] : VARIANT === 'rounds' ? [spawn('Cora Tech', 'Cargo Technician')] : VARIANT === 'orders' ? spawnOrders() : VARIANT === 'callme' ? spawnCallMe() : VARIANT === 'outfail' ? (() => { rooms['Delivery Office'].messes = []; return [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor')]; })() : VARIANT === 'askedtwice' ? spawnAskedTwice() : VARIANT === 'waiting' ? spawnWaiting() : VARIANT === 'mixed' ? spawnMixed() : VARIANT === 'vouch' ? spawnVouch() : VARIANT === 'trapped' ? spawnTrapped() : VARIANT === 'solo' ? [spawn('Jan Itor', 'Janitor')] : VARIANT === 'crew' ? spawnCrew() : spawnStaffed(['Cora Tech'], VARIANT === 'captain' ? HOP_OFFICE : 'Bridge');
// The delivery office takes longer: it is only found on a quiet look round, and then someone has to be sent for.
// With a head aboard, nothing is ordered until the staff meeting two minutes in has been held.
// A crate nobody comes for is chased three times, five minutes or so apart, before it is asked for.
const SECONDS = SECURITY ? SECURITY_SECONDS : VARIANT === 'callme' || VARIANT === 'askedtwice' ? 240 : VARIANT === 'outfail' ? 540 : ENGINE ? 780 : VARIANT === 'qmwait' ? 560 : VARIANT === 'qmquiet' || VARIANT === 'qmpoor' || VARIANT === 'qmlost' || VARIANT === 'qmstuck' ? 480 : VARIANT === 'qmpaper' ? 420 : VARIANT === 'qmbig' || VARIANT === 'qmno' ? 300 : VARIANT === 'waiting' ? 1380 : VARIANT === 'nested' ? 1080 : VARIANT === 'office' ? 900 : FULL || DOORWAY || VARIANT === 'captain' ? 720 : VARIANT === 'mixed' ? 420 : 540;
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
  if ((VARIANT === 'evict' || VARIANT === 'leave' || VARIANT === 'aside' || VARIANT === 'asidetwice') && !captainSpokeAt && bodies[1].room === 'Cargo Bay' && bodies[1].busyText?.startsWith('cleaning')) { captainSpokeAt = clock; playerSays('Ada Stone', VARIANT === 'evict' ? 'Cora, throw this janitor out.' : VARIANT === 'leave' ? 'Jan, leave.' : 'Jan, could you step aside, please? I need to get past you.'); }
  // JOBS-06: ten seconds after the first asking, whose step aside found nowhere to go, the Captain asks again from somewhere with room.
  if (VARIANT === 'asidetwice' && captainSpokeAt && !askedAgainAt && clock - captainSpokeAt >= 10_000) { askedAgainAt = clock; playerSays('Ada Stone', 'Jan, could you step aside, please? I need to get past you.'); }
  // A head orders a crate and does not come for it. Once it is off the shuttle and held in the bay, it is destroyed. Later the head asks for it.
  if (VARIANT === 'lost' && second === 20) playerSays('Hal Pott', 'Cora, I need to order a crate of janitorial supplies, please.');
  if ((VARIANT === 'lost' || VARIANT === 'qmlost') && !crateLostAt && second >= CRATE_LOST_AT && held[0]?.heldSince && !held[0].lost) { const gone = held[0]; gone.lost = 'it has been destroyed'; rooms['Cargo Bay'].boxes = rooms['Cargo Bay'].boxes.filter((box) => box !== gone.box); crateLostAt = clock; }
  if (VARIANT === 'lost' && crateLostAt && clock - crateLostAt === 90_000) playerSays('Hal Pott', 'Cora, I am here to collect crate 4521, please.');
  // PLAY-10: the Captain says the bay is a mess, and then, nothing having come of it, says to ask for a janitor.
  // PLAY-05: called by PDA, the janitor answers that it is at the door; once the technician is on its way there it says it aloud as well,
  // naming no room. Let in, it walks through five seconds later, while the door still stands open.
  if (VARIANT === 'askedtwice') {
    const cora = bodies[0];
    const called = cora.log.some((line) => / message /.test(line) && line.includes(`"person":"${ASKER}"`) && /mess in the Delivery Office/.test(line));
    if (called && !askedTwice.pdaAt) { askedTwice.pdaAt = clock + 5000; }
    if (askedTwice.pdaAt && clock === askedTwice.pdaAt) playerMessages(ASKER, cora, 'I am at the door of the Delivery Office. Could you let me in, please?');
    // On its way: the open_door it set off with is still under way, as when it walks to the door.
    const onTheWay = cora.busyText === 'going to open the door for someone';
    if (askedTwice.pdaAt && clock > askedTwice.pdaAt && !askedTwice.saidAt && onTheWay) { askedTwice.saidAt = clock; playerSays(ASKER, 'Cora, open that door so I can get back to work.'); }
    // Whether its brain has taken on standing by the door it opened, to hold it until the janitor is through.
    if (!askedTwice.watchedAt && brainModule.getBrain(cora.id)?.tasks.some((task: any) => task.kind === 'door_watch' && task.item === ASKER && task.place === 'Delivery Office')) askedTwice.watchedAt = clock;
    const asker = players.find((player) => player.name === ASKER)!;
    if (askedTwice.openAt && !askedTwice.inAt && clock - askedTwice.openAt >= 5000 && doorOpen('Delivery Office')) { askedTwice.inAt = clock; asker.room = 'Delivery Office'; }
  }
  // Both are said with the technician at its post, in the bay beside the Captain, and not busy.
  if (VARIANT === 'callme' && !captainSpokeAt && second >= CALL_ME_AT && bodies[0].room === 'Cargo Bay' && !bodies[0].busyText) { captainSpokeAt = clock; playerSays('Ada Stone', 'its messy in here'); }
  if (VARIANT === 'callme' && captainSpokeAt && !callMeAt && clock - captainSpokeAt >= 10_000) { callMeAt = clock; playerSays('Ada Stone', 'Then ask for a janitor'); }
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
if (VARIANT !== 'rounds' && VARIANT !== 'callme' && VARIANT !== 'askedtwice' && VARIANT !== 'outfail' && VARIANT !== 'alarmagain' && VARIANT !== 'waiting' && VARIANT !== 'mixed' && VARIANT !== 'bydoor' && VARIANT !== 'lost' && !DESK && !ENGINE && !SECURITY && !HEADSHUT) check(`every mess a janitor can get to is cleaned (started with ${messId}${bayCounts ? ', one of them behind the bay door' : '; the one in the bay does not count'})`, left.length === 0, left.length ? `left: ${Object.entries(rooms).filter(([, room]) => room.messes.length).map(([name, room]) => `${name}: ${room.messes.map((m) => m.name).join(', ')}`).join('; ')}` : '');
const janitors = crew.filter((body) => body.job === 'Janitor');
// With no technician aboard to order for it, the janitor with only a rag stays short.
if (!HEADSHUT) check('every janitor ends with something to clean with', janitors.every((body) => body.holding.some((item) => /mop|space cleaner|soap/.test(item))), janitors.map((body) => `${body.name}: ${body.holding.join(', ') || 'nothing'}`).join('; '));
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
if (VARIANT === 'outfail') {
  const cora = crew[0];
  const jan = crew[1];
  const ago = (at: number) => `${Math.round((at - (clock - SECONDS * 1000)) / 1000)} s in`;
  check('the janitor shut in the bay asks to be let out, and the technician goes to the door and cannot get to it', outTries.length >= 1, `${outTries.length} try(s)`);
  const gap = outTries.length >= 2 ? outTries[1] - outTries[0] : Infinity;
  check('it tries again about ten seconds on, and no more than twice in all', outTries.length === 2 && gap >= 8_000 && gap <= 20_000, outTries.map(ago).join(', '));
  const told = spoken.find((line) => line.who === cora.name && line.text === 'Jan, I could not get to the door to let you out.');
  check('then it tells the janitor why, to its face', !!told && outTries.length >= 2 && told.at > outTries[1] && told.room === 'Cargo Bay', told ? ago(told.at) : `said: ${cora.said.join(' | ') || 'nothing'}`);
  const outLine = cora.log.find((line) => / throw_out /.test(line));
  const outAt = outLine ? Date.parse(`1970-01-01T${outLine.slice(0, 8)}Z`) : Infinity;
  check('and only then walks it out of the bay', putOut.includes(jan.name) && !!told && outAt >= told.at, `${outLine?.trim() ?? 'never walked out'}; ${jan.name} ends in ${jan.room}`);
}
if (VARIANT === 'askedtwice') {
  const cora = crew[0];
  const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
  check('(the janitor asked by PDA, and then aloud while the technician walked to the door)', !!askedTwice.pdaAt && !!askedTwice.saidAt, `PDA ${askedTwice.pdaAt ? clockAt(askedTwice.pdaAt) : 'never'}, aloud ${askedTwice.saidAt ? clockAt(askedTwice.saidAt) : 'never'}`);
  check('the technician opens the door of the delivery office for it', opened.includes(`in:${ASKER}@Delivery Office`), opened.join(', ') || 'opened nothing');
  const leftAt = cora.log.find((line) => !!askedTwice.openAt && line.slice(0, 8) > clockAt(askedTwice.openAt) && / (go_to|explore|tidy|check_held) /.test(line));
  const leftMs = leftAt ? Date.parse(`1970-01-01T${leftAt.slice(0, 8)}Z`) - askedTwice.openAt : Infinity;
  check('and holds it: it stands by the door for the janitor, and does not walk off before the janitor is through', !!askedTwice.watchedAt && !!askedTwice.inAt && leftMs >= askedTwice.inAt - askedTwice.openAt, `${askedTwice.watchedAt ? 'held from ' + clockAt(askedTwice.watchedAt) : 'never stood by it'}; ` + `in ${askedTwice.inAt ? Math.round((askedTwice.inAt - askedTwice.openAt) / 1000) + ' s' : 'never'} after the door opened; first walk ${leftAt ? Math.round(leftMs / 1000) + ' s after: ' + leftAt.trim() : 'none'}`);
  check('the voice is never told to refuse the janitor it sent for', refusalCues.length === 0, refusalCues.join(', '));
}
if (VARIANT === 'callme') {
  const cora = crew[0];
  const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
  const calls = cora.log.filter((line) => line.slice(0, 8) >= clockAt(callMeAt) && / message /.test(line) && line.includes('"person":"Jan Itor"'));
  const call = calls.find((line) => /There is a mess in the Cargo Bay/.test(line) && /Ada Stone has asked for a janitor/.test(line));
  check('told to ask for a janitor, the technician sends one a PDA about the bay, saying the Captain asked', !!call, calls.join(' | ') || 'no message to a janitor after the order');
  check('(the technician was in the bay both times the Captain spoke)', !!callMeAt, callMeAt ? '' : 'the Captain never spoke');
  const callAt = call ? call.slice(0, 8) : clockAt(callMeAt);
  const toldWhom = [...spoken.filter((line) => line.who === cora.name && clockAt(line.at) >= callAt).map((line) => line.text), ...cora.log.filter((line) => line.slice(0, 8) >= callAt && / message /.test(line) && line.includes('"person":"Ada Stone"'))];
  check('and tells the Captain whom it sent for', toldWhom.some((line) => /Ada, about the Cargo Bay\. I have sent Jan Itor, a janitor, a PDA message/.test(line) || /About the Cargo Bay\. I have sent Jan Itor/.test(line)), toldWhom.join(' | ') || 'told nothing');
  // Sent for on the Captain's word, the janitor is not then turned away from the bay as one nobody sent for.
  const turnedAway = cora.log.filter((line) => / message /.test(line) && /nobody here sent for you to the Cargo Bay/.test(line));
  check('the janitor it sent for is not turned away from the bay as one nobody sent for', turnedAway.length === 0, turnedAway.join(' | '));
  // PLAY-10 3 (answer A): with no mess anyone can see, it is let in all the same: the call was made on the Captain's order.
  check('and it is let into the bay when it comes, though no mess is in sight', opened.includes('in:Jan Itor'), opened.join(', ') || 'the door was never opened');
  const twice = cora.said.filter((line, index) => cora.said.indexOf(line) !== index);
  check('it says no line twice', twice.length === 0, twice.join(' | '));
}
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
// Asked to step aside, a janitor finds nowhere to go; asked again ten seconds later, it steps aside then.
if (VARIANT === 'asidetwice') {
  const jan = crew[1];
  const stamped = (at: number) => new Date(at).toISOString().slice(11, 19);
  const asks = jan.log.filter((line) => / step_aside/.test(line)).map((line) => line.slice(0, 8));
  check('the janitor is asked while it is in the middle of scrubbing the bay, and its step aside finds nowhere to go', captainSpokeAt > 0 && asideFailedAt >= captainSpokeAt && asideFailedAt - captainSpokeAt <= 6000, asideFailedAt ? `${(asideFailedAt - captainSpokeAt) / 1000}s after being asked` : 'it never tried');
  const moved = steppedAside.find((step) => step.who === jan.name);
  check('asked again ten seconds later, it steps aside within a few seconds', askedAgainAt > 0 && !!moved && moved.at >= askedAgainAt && moved.at - askedAgainAt <= 6000, moved ? `${(moved.at - askedAgainAt) / 1000}s after the second asking` : 'it never moved');
  check('it tries to step aside once for each asking', asks.length === 2, asks.join(', ') || 'never');
  const over = sentOverBusy.filter((line) => line.slice(0, 8) >= stamped(captainSpokeAt) && (!moved || line.slice(0, 8) <= stamped(moved.at)));
  check('nothing else is sent to it while it is busy, from the first asking until it has stepped aside', over.length === 0, over.join(' | '));
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
  // A technician the clock stops on in the middle of its routine look in on a room of its department (an open look_in task
  // for the very room it stands in, jobs/rounds.ts) is on its rounds, not lost. Nothing else away from the post passes.
  const onRounds = (body: Body) => body.room !== 'Cargo Bay' && !!brainModule.getBrain(body.id)?.tasks.some((task: any) => task.kind === 'look_in' && task.state !== 'done' && task.place === body.room);
  check(techs.length > 1 ? 'the cargo technicians end at the post' : 'the cargo technician ends at the post', techs.every((body) => body.room === 'Cargo Bay' || onRounds(body)), techs.map((body) => `${body.name} in ${body.room}${onRounds(body) ? ' (looking round it on its rounds)' : body.room !== 'Cargo Bay' ? ` (last: ${body.log.at(-1) ?? 'nothing'}; tasks: ${(brainModule.getBrain(body.id)?.tasks ?? []).map((task: any) => `${task.kind}${task.place ? ' ' + task.place : ''} ${task.state}`).join(', ') || 'none'})` : ''}`).join('; '));
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
if (HEADSHUT) {
  const hop = head!;
  const seconds = (at: number) => Math.round((at - 1_000_000) / 1000);
  const invites = hop.log.filter((line) => / message /.test(line) && /"Staff meeting in the [^"]* now, please/.test(line));
  const overTold = hop.log.filter((line) => / message /.test(line) && /, the staff meeting is over\. Send me your report by PDA, please\./.test(line));
  const toCaptain = hop.log.filter((line) => / message /.test(line) && line.includes(`"person":"${CAPTAIN}"`) && /Staff meeting in the|for the staff meeting/.test(line)).map((line) => line.match(/"text":"([^"]*)"/)?.[1]);
  if (VARIANT === 'headshut') {
    const stamped = (at: number) => new Date(at).toISOString().slice(11, 19);
    const askedOut = hop.log.filter((line) => line.slice(0, 8) < stamped(HEAD_LET_OUT_AT) && (/ knock/.test(line) || (/ message /.test(line) && /shut in|let me out/i.test(line))));
    check('shut in its office when its first meeting is due, the head asks to be let out', askedOut.length >= 1, askedOut.map((line) => line.slice(0, 8) + line.slice(33)).join(' | ') || 'it never asked');
    check('it calls no staff meeting while it is shut in', meetingCalls.every((at) => at >= HEAD_LET_OUT_AT), meetingCalls.map((at) => `${seconds(at)} s in`).join(', ') || 'none called');
    check('let out, it calls one soon after', meetingCalls.length >= 1 && meetingCalls[0] - HEAD_LET_OUT_AT <= 60_000, meetingCalls.length ? `${(meetingCalls[0] - HEAD_LET_OUT_AT) / 1000}s after it was let out` : 'none called');
    check('and calls each of its staff to it once', invites.length === janitors.length && janitors.every((body) => invites.some((line) => line.includes(`"person":"${body.name}"`))), `${invites.length} call(s)`);
    check('and holds it', meetings.length === 1 && meetings[0].overAt > 0, meetings.map((meeting) => `${meeting.thereAtStart.length} there, ${meeting.overAt ? 'ended' : 'not ended'}`).join('; ') || 'no meeting began');
  } else {
    const calledAt = meetingCalls[0] ?? 0;
    check('the head calls its first staff meeting in the Bar, by PDA, about two minutes in', !!calledAt && seconds(calledAt) >= 115 && seconds(calledAt) <= 160 && invites.length === janitors.length, calledAt ? `${seconds(calledAt)} s in, ${invites.length} call(s)` : 'none called');
    check('every walk it makes to the Bar comes to nothing, and the meeting never begins', headWalksFailed.length >= 1 && meetings.length === 0, `${headWalksFailed.length} walk(s) failed; ${meetings.length} meeting(s) began`);
    const told = janitors.map((body) => overTold.find((line) => line.includes(`"person":"${body.name}"`)));
    const after = told.map((line) => (line ? line.slice(0, 8).split(':').reduce((total, part) => total * 60 + Number(part), 0) * 1000 - calledAt : -1));
    check('about three minutes after the call, each of its staff is told by PDA the meeting is over and to send its report', told.every(Boolean) && after.every((ms) => ms >= 175_000 && ms <= 215_000), after.map((ms, index) => `${janitors[index].name.split(' ')[0]}: ${ms < 0 ? 'never' : `${ms / 1000}s`}`).join(', '));
    check('each of them is told once', janitors.every((body) => overTold.filter((line) => line.includes(`"person":"${body.name}"`)).length === 1), `${overTold.length} message(s)`);
    check('the Captain is told it could not get to the room', toCaptain.length === 1 && /I could not get to the Bar for the staff meeting/.test(toCaptain[0] ?? ''), toCaptain.join(' | ') || 'not told');
  }
}
if (head && janitors.length > 2 && !HEADSHUT) {
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
    // ENG-01 (answer B): once its engineer says it cannot get the emitters off, the Chief Engineer goes and tries itself; that and nothing else.
    if (VARIANT === 'enginelocked') check('and works nothing in the engine room but the emitters\' switches, once its engineer could not get them off', byChief.every((work) => work.kind === 'battery' || (work.kind === 'emitter' && work.how === 'switch_off')), byChief.filter((work) => work.kind !== 'battery').map((work) => `${work.name} ${work.how}`).join(', '));
    else check('and works nothing in the engine room', byChief.every((work) => work.kind === 'battery'), byChief.filter((work) => work.kind !== 'battery').map((work) => work.name).join(', '));
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
    const chiefOffs = byChief.filter((work) => work.kind === 'emitter' && work.how === 'switch_off');
    // When the engineer first said it, aloud or by PDA.
    const pdaLine = sam.log.find((line) => / message /.test(line) && /I cannot switch the emitters off/.test(line));
    const toldAt = Math.min(spoken.find((line) => line.who === 'Sam Rees' && /I cannot switch the emitters off/.test(line.text))?.at ?? Infinity, pdaLine ? Date.parse(`1970-01-01T${pdaLine.slice(0, 8)}Z`) : Infinity);
    check('then the Chief Engineer goes to the engine room and tries the switches itself, after its engineer said it could not', chiefOffs.length >= 1 && chiefOffs.every((work) => work.at >= toldAt), chiefOffs.map((work) => `${work.name} ${work.ok ? 'ok' : 'would not'} ${seconds(work.at)}`).join(', ') || 'it never tried');
    check('and the Captain is sent, once, that it went itself and could not', sentTo(ada, 'Cap Tain', /"text":"I went to switch the emitters off myself and could not: its controls are locked/).length === 1, sentTo(ada, 'Cap Tain', /./).map((line) => line.match(/"text":"([^"]*)"/)?.[1]).join(' | '));
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
if (VARIANT === 'recell') {
  const hale = crew.find((body) => body.job === 'Security Officer')!;
  const jailings = secWork.filter((work) => work.tool === 'jail' && work.ok);
  const listed = secWork.map((it) => `${it.who} ${it.tool}${it.how ? ' ' + it.how : ''} ${it.ok ? 'ok' : it.reason}${it.target ? ' ' + it.target : ''}${it.cell ? ' ' + it.cell : ''}`).join('; ');
  const hop = jailings.find((work) => work.target === 'Hop Kins');
  const pun = jailings.find((work) => work.target === 'Pun Pun');
  check('the Head of Personnel is put in Cell 1, and walks free when its time runs out', hop?.cell === 'Cell 1' && walkedFree.some((it) => it.who === 'Hop Kins' && it.why === 'time up'), listed);
  check('the monkey is then put in the same cell', !!hop && pun?.cell === 'Cell 1' && pun.at > hop.at, listed);
  const free = secWork.find((work) => work.tool === 'free' && work.target === 'Hop Kins');
  check('pardoned after, the Head of Personnel is let go: the officer goes to the cell it remembers', !!pun && !!free && free.at > pun.at && free.who === hale.name, listed);
  check('and finds them not in it, and opens nothing', free?.reason === 'nothing' && free.cell === 'Cell 1', listed);
  check('the monkey is still in the cell', !walkedFree.some((it) => it.who === 'Pun Pun' && it.why === 'let out') && (cells[0].occupant === 'Pun Pun' || walkedFree.some((it) => it.who === 'Pun Pun' && it.why === 'time up')), `${cells[0].occupant ?? 'nobody'} in Cell 1; ${walkedFree.map((it) => `${it.who} ${it.why}`).join(', ')}`);
}
if (SECURITY && !SECURITY_A2 && VARIANT !== 'recell' && VARIANT !== 'cuffedheld' && VARIANT !== 'twolocked') {
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
  const cellFor = VARIANT === 'badcell' || VARIANT === 'badtimer' ? 'Cell 2' : 'Cell 1';
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
    // Told to try again, the Head of Security may have fetched its own baton while its officer was out: it still lays a hand on nobody.
    // Letting out a prisoner its officer would not is no hand laid on anyone (TRB-11).
    const tryingAgain = VARIANT === 'tryagain' || VARIANT === 'hurtagain';
    check('the Head of Security lays a hand on nobody while its officer is fit', VARIANT === 'hurt' || secWork.every((work) => work.who !== joan.name || (tryingAgain && work.tool === 'get_kit') || (VARIANT === 'pardoncell' && work.tool === 'free')), listed(secWork.filter((work) => work.who === joan.name)));
  }
  const arrester = VARIANT === 'hurt' ? joan! : hale;
  const toldArrest = saidBy(arrester.name, new RegExp(`^${wanted}, you are under arrest${forWhat}\\. Stand still\\.`))[0];
  const ownFirst = arrests.find((work) => work.who === arrester.name);
  // Someone in cuffs already is taken by the arm with nothing said (TRB-01).
  if (VARIANT !== 'cuffedfree') check('they are told they are under arrest, word for word, before a hand is laid on them', !!toldArrest && !!ownFirst && toldArrest.at <= ownFirst.at, toldArrest ? seconds(toldArrest.at) : 'never told');
  check('nobody is hit who was not first given the chance to stand still', firstHand?.how === 'quiet', listed(arrests));
  if (VARIANT !== 'pardon' && VARIANT !== 'nobaton' && VARIANT !== 'pardonmid' && VARIANT !== 'nocell') {
    check(`${wanted} ends up in a cell, once`, jailings.length === 1 && jailings[0].target === wanted && jailings[0].cell === cellFor, listed(secWork));
  }
  // Bitten by the monkey it is arresting, the officer adds five minutes for resisting arrest.
  const resisted = VARIANT === 'fight' || VARIANT === 'hurtagain';
  const minutes = resisted ? 10 : term;
  if (VARIANT === 'badcell' || VARIANT === 'badtimer') {
    const tries = secWork.filter((work) => work.tool === 'jail');
    const refused = tries.find((work) => !work.ok);
    const put = tries.find((work) => work.ok);
    check('the first cell refuses, and the officer has them in the next within half a minute', !!refused && !!put && put.at - refused.at <= 30_000, listed(tries));
    if (VARIANT === 'badtimer') check('the cell whose timer would not start is tried once, and the next try is at another cell', tries.filter((work) => work.cell === 'Cell 1').length === 1 && !!put && put.cell !== 'Cell 1', tries.map((work) => `${work.ok ? 'ok' : work.reason} ${work.cell ?? '?'}`).join('; '));
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const strayed = hale.log.filter((line) => !!refused && !!put && line.slice(0, 8) > clockAt(refused.at) && line.slice(0, 8) < clockAt(put.at) && / (go_to|get_kit|explore|approach) /.test(line));
    check('with a prisoner by the arm it goes nowhere but the cells', strayed.length === 0, strayed.join(' | '));
  }
  if (VARIANT === 'loose') {
    check('an order code cannot read is put to the LLM once', readingCalls === 1, `${readingCalls} reading(s)`);
    if (MODE === 'dead') check('with no LLM, the Captain is told it was not followed', sentTo(desk, SEC_CAPTAIN, /Captain, I did not follow that\./).length === 1);
  }
  if (joan && VARIANT !== 'pardon' && VARIANT !== 'nobaton' && VARIANT !== 'pardonmid') {
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
  if (VARIANT !== 'nobaton' && VARIANT !== 'pardonmid' && VARIANT !== 'nocell') check('the Captain is told which cell and for how long', sentTo(desk, SEC_CAPTAIN, new RegExp(`Captain, ${wanted} is in ${cellFor} for ${minutes} minutes${resisted ? ', 5 of them for resisting arrest' : ''}\\.`)).length === 1, sentTo(desk, SEC_CAPTAIN, /is in Cell/).join(' | '));
  if (joan && VARIANT !== 'hurt' && VARIANT !== 'nobaton' && VARIANT !== 'pardonmid' && VARIANT !== 'nocell') {
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
  if (VARIANT === 'hallfail') {
    const walks = hale.log.filter((line) => / go_to /.test(line)).map((line) => `${line.slice(0, 8)} ${line.match(/"place":"([^"]*)"/)?.[1]}`);
    check('with no word of where the monkey is, the officer sets off for the first main hallway, and cannot get there', hallFails.length >= 1 && /Central Primary Hallway$/.test(walks[0] ?? ''), walks.join(', ') || 'it never walked');
    const failAt = hallFails[0] ?? 0;
    const next = hale.log.find((line) => / go_to /.test(line) && line.slice(0, 8) > new Date(failAt).toISOString().slice(11, 19));
    // The simulated clock starts on the first day, so a log line's time of day is its clock time.
    const nextAt = next ? next.slice(0, 8).split(':').reduce((total, part) => total * 60 + Number(part), 0) * 1000 - failAt : Infinity;
    check('it sets off for the next main hallway within seconds', !!next && /"place":"Fore Primary Hallway"/.test(next) && nextAt <= 15_000, next ? `${nextAt / 1000}s after: ${next.trim()}` : 'it walked nowhere after');
    check('it does not try the hallway it could not get to over and over', hallFails.length <= 2, `${hallFails.length} time(s)`);
    check('the search goes on: it finds the monkey there and brings it in', jailings.length === 1 && jailings[0].who === hale.name, listed(secWork));
  }
  if (VARIANT === 'hurtagain') {
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const hurtTold = told(hale, joan!.name, /Joan, I could not take Pun Pun\. I am hurt\./);
    check('the officer, bitten to under half its health, breaks off and tells the Head of Security', kitOf(hale).health < 50 && hurtTold >= 1, `health ${kitOf(hale).health}, told ${hurtTold} time(s)`);
    check('the Captain is told, and says to try again', !!hurtToldAt && !!tryAgainAt, hurtToldAt ? `told ${seconds(hurtToldAt)}, try again ${tryAgainAt ? seconds(tryAgainAt) : 'never'}` : 'never told');
    const again = sentTo(joan, hale.name, /Hale, you are to make arrests again\./).concat(saidBy(joan!.name, /Hale, you are to make arrests again\./).map((line) => `${clockAt(line.at)} said`));
    check('the Head of Security tells the officer to make arrests again', again.length >= 1, again.join(' | ') || 'never told');
    const after = arrests.filter((work) => work.who === hale.name && work.at > tryAgainAt);
    check('an arrest by the officer follows, and the cuffs go on', !!tryAgainAt && after.some((work) => work.ok), listed(after) || 'no arrest after');
    check('and the officer puts the monkey in the cell', jailings.length === 1 && jailings[0].who === hale.name, listed(secWork));
    check('its health the same, it does not say again that it is hurt', kitOf(hale).health === 40 && told(hale, joan!.name, /I am hurt/) === 1, `health ${kitOf(hale).health}, said ${told(hale, joan!.name, /I am hurt/)} time(s)`);
    check('nor does the Head of Security tell the Captain so again', sentTo(joan, SEC_CAPTAIN, /is hurt/).length === 1, sentTo(joan, SEC_CAPTAIN, /is hurt/).join(' | '));
  }
  if (VARIANT === 'pardonmid') {
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const cuffedAt = arrests.find((work) => work.who === hale.name && work.ok)?.at ?? 0;
    check('the Captain pardons the monkey while the cuffs are going on', !!pardonMid.arrestAt && !!pardonMid.sentAt && !!cuffedAt && pardonMid.sentAt < cuffedAt, `arrest sent ${pardonMid.arrestAt ? seconds(pardonMid.arrestAt) : 'never'}, pardon ${pardonMid.sentAt ? seconds(pardonMid.sentAt) : 'never'}, cuffs on ${cuffedAt ? seconds(cuffedAt) : 'never'}`);
    check('the Captain is answered that it is pardoned', sentTo(joan, SEC_CAPTAIN, /Captain, Pun Pun is pardoned\./).length === 1, sentTo(joan, SEC_CAPTAIN, /pardon/).join(' | '));
    const letGoWords = /Hale, Pun Pun is to be let go: the Captain has pardoned them\./;
    const letGo = sentTo(joan, hale.name, letGoWords).map((line) => line.slice(0, 8)).concat(saidBy(joan!.name, letGoWords).map((line) => clockAt(line.at)));
    // Told before the cuffs were on, the warrant was dropped while the arrest ran: the case TRB-02 is about.
    check('the officer is told to let it go before the cuffs are on', letGo.length >= 1 && !!cuffedAt && letGo[0] <= clockAt(cuffedAt), `told ${letGo.join(', ') || 'never'}; cuffs on ${cuffedAt ? clockAt(cuffedAt) : 'never'}`);
    const freed = secWork.find((work) => work.tool === 'free' && work.who === hale.name && work.target === 'Pun Pun' && work.ok);
    check('the cuffs having gone on, the officer lets the monkey go', !!freed && freed.at >= cuffedAt && walkedFree.some((it) => it.who === 'Pun Pun' && it.why === 'let go'), listed(secWork));
    check('nobody is put in a cell, and the officer ends holding nobody', jailings.length === 0 && kitOf(hale).holding === null, `holding ${kitOf(hale).holding ?? 'nobody'}; ${listed(jailings)}`);
  }
  if (VARIANT === 'tryagain') {
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const hurtTold = told(hale, joan!.name, /Joan, I am hurt and can make no arrests\./);
    check('the officer, hurt before any warrant, tells the Head of Security it can make no arrests, once', hurtTold === 1, `${hurtTold} time(s)`);
    check('the Head of Security tells the Captain, once, that it is serving the warrants itself', sentTo(joan, SEC_CAPTAIN, /Captain, Hale is hurt\. I am serving the warrants myself\./).length === 1, sentTo(joan, SEC_CAPTAIN, /hurt/).join(' | '));
    check('the Captain says to try again after the warrant was declared', tryAgainAt > 0 && tryAgainAt - began > WARRANT_AT * 1000);
    const again = sentTo(joan, hale.name, /Hale, you are to make arrests again\./).concat(saidBy(joan!.name, /Hale, you are to make arrests again\./).map((line) => `${clockAt(line.at)} said`));
    check('the Head of Security tells the officer to make arrests again', again.length >= 1 && again.every((line) => line.slice(0, 8) >= clockAt(tryAgainAt)), again.join(' | ') || 'never told');
    const giveWords = /Hale, warrant: Pun Pun, for wrecking the Custodial Closet\. Bring them in, 5 minutes\./;
    const given = sentTo(joan, hale.name, giveWords).map((line) => line.slice(0, 8)).concat(saidBy(joan!.name, giveWords).map((line) => clockAt(line.at)));
    check('and gives it the warrant declared while it was out, after being told to try again', given.some((at) => at >= clockAt(tryAgainAt)), given.join(', ') || 'never given');
    check('the officer makes the arrest and puts them in the cell', jailings.length === 1 && jailings[0].who === hale.name && arrests.some((work) => work.who === hale.name && work.ok), listed(secWork));
    check('the Head of Security makes no arrest itself', !secWork.some((work) => work.who === joan!.name && work.tool !== 'get_kit'), listed(secWork.filter((work) => work.who === joan!.name)));
    check('the officer does not say again that it is hurt', told(hale, joan!.name, /I am hurt/) === 1, `${told(hale, joan!.name, /I am hurt/)} time(s)`);
  }
  if (VARIANT === 'pardoncell') {
    check('(the Captain pardoned the monkey once it was in its cell)', !!cellPardonAt && !!jailings[0] && cellPardonAt > jailings[0].at, cellPardonAt ? seconds(cellPardonAt) : 'never');
    check('(the officer was sent word it never read)', unreadByOfficer.length >= 1, unreadByOfficer.join(' | ') || 'nothing sent to it');
    check('the Captain is answered that it is pardoned', sentTo(joan, SEC_CAPTAIN, /Captain, Pun Pun is pardoned\./).length === 1, sentTo(joan, SEC_CAPTAIN, /pardon/i).join(' | ') || 'never');
    const freed = secWork.filter((work) => work.tool === 'free' && work.target === 'Pun Pun');
    check('the officer lets nobody out', !freed.some((work) => work.who === hale.name), listed(freed));
    const byHead = freed.find((work) => work.who === joan!.name && work.ok && work.cell === 'Cell 1');
    const out = walkedFree.find((it) => it.who === 'Pun Pun');
    check('the Head of Security lets the monkey out of its cell itself, some two minutes after the pardon and before its time is up', !!byHead && out?.why === 'let out' && byHead.at - cellPardonAt >= 100_000 && byHead.at - cellPardonAt <= 200_000, `${listed(freed) || 'nobody freed it'}; ${out ? `${out.why} ${seconds(out.at)}` : 'still in its cell'}`);
    check('it walked to the Brig to do it', joan!.log.some((line) => / go_to /.test(line) && line.includes(`"place":"${BRIG}"`)) || joan!.room === BRIG, `ends in ${joan!.room}`);
  }
  if (VARIANT === 'spokensight') {
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    check('(the Captain told the officer to its face where the monkey is)', !!spokenSightAt, spokenSightAt ? seconds(spokenSightAt) : 'never');
    const readBack = saidBy(hale.name, /^Captain, I have that: Pun Pun, the Bar\.$/).filter((line) => line.at >= spokenSightAt);
    check('the officer reads the sighting back in fixed words', readBack.length === 1, saidBy(hale.name, /./).map((line) => line.text).join(' | ') || 'said nothing');
    const toBar = hale.log.find((line) => line.slice(0, 8) >= clockAt(spokenSightAt) && / go_to /.test(line) && line.includes('"place":"Bar"'));
    const toBarAt = toBar ? Date.parse(`1970-01-01T${toBar.slice(0, 8)}Z`) : Infinity;
    const firstWalk = hale.log.find((line) => line.slice(0, 8) >= clockAt(spokenSightAt) && / (go_to|explore) /.test(line));
    check('and goes to the Bar, not anywhere else first, within half a minute', !!toBar && firstWalk === toBar && toBarAt - spokenSightAt <= 30_000, firstWalk?.trim() ?? 'walked nowhere');
    check('the sighting is passed to the Head of Security', sentTo(hale, joan!.name, /Pun Pun is in the Bar/).length + saidBy(hale.name, /^Joan, .*Pun Pun is in the Bar/).length >= 1, sentTo(hale, joan!.name, /./).join(' | ') || 'nothing sent');
  }
  if (VARIANT === 'nocell') {
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const tries = secWork.filter((work) => work.tool === 'jail');
    check('every jail is answered that every cell is in use, and it tries more than once', tries.length >= 2 && tries.every((work) => !work.ok && work.reason === 'no_cell'), listed(tries));
    const firstNo = tries[0]?.at ?? Infinity;
    const toBrig = hale.log.find((line) => line.slice(0, 8) >= clockAt(firstNo) && / go_to /.test(line) && line.includes(`"place":"${BRIG}"`));
    check('the officer takes the monkey to the Brig', !!toBrig && hale.room === BRIG && kitOf(hale).holding === 'Pun Pun', `${toBrig?.trim() ?? 'never went'}; ends in ${hale.room} holding ${kitOf(hale).holding ?? 'nobody'}`);
    const words = /Joan, I cannot bring in Pun Pun: every cell is in use\./;
    check('the Head of Security is told once that every cell is in use', told(hale, joan!.name, words) === 1, `${told(hale, joan!.name, words)} time(s); ${[...saidBy(hale.name, /^Joan, /).map((line) => line.text), ...sentTo(hale, joan!.name, /./)].join(' | ')}`);
    check('and the Captain is told once', sentTo(joan, SEC_CAPTAIN, /Captain, Hale cannot bring in Pun Pun: every cell is in use\./).length === 1, sentTo(joan, SEC_CAPTAIN, /cannot/).join(' | ') || 'never');
  }
  if (VARIANT === 'stuckcell') {
    const stuck = secWork.find((work) => work.tool === 'jail' && work.reason === 'stuck_inside');
    check('the first jail leaves the officer stuck inside the cell with the monkey', !!stuck, listed(secWork));
    const after = secWork.filter((work) => !!stuck && work.at > stuck.at && work.tool === 'arrest');
    check('it is not arrested again', after.length === 0 && arrests.filter((work) => work.ok).length === 1, listed(after) || listed(arrests));
    const next = secWork.find((work) => !!stuck && work.at > stuck.at && work.tool === 'jail');
    check('the next jail starts the timer of the same cell, within half a minute', !!next?.ok && next.cell === 'Cell 1' && next.at - stuck!.at <= 30_000, next ? `${next.ok ? 'ok' : next.reason} ${next.cell ?? '?'} ${Math.round((next.at - stuck!.at) / 1000)} s after` : 'no jail after');
  }
  if (VARIANT === 'pdadown') {
    const clockAt = (at: number) => new Date(at).toISOString().slice(11, 19);
    const jailedAt = jailings[0]?.at ?? Infinity;
    check('the officer tries its PDA for the Head of Security, and it will not send', officerUnsent.some((it) => it.text.startsWith('Joan, ')),`${officerUnsent.length} not sent: ${[...new Set(officerUnsent.map((it) => it.text))].join(' | ')}`);
    const backAt = hale.log.find((line) => line.slice(0, 8) > clockAt(jailedAt) && / go_to /.test(line) && line.includes(`"place":"${SEC_OFFICE}"`));
    check('after the jailing the officer walks to the Security Office', !!backAt || saidBy(hale.name, /^Joan, /).some((line) => line.at > jailedAt && line.room === SEC_OFFICE), backAt?.trim() ?? `ends in ${hale.room}`);
    const faceWord = saidBy(hale.name, /^Joan, Pun Pun is in Cell 1 for 5 minutes/).filter((line) => line.at > jailedAt && line.room === SEC_OFFICE);
    check("and there says the word to the Head of Security's face",faceWord.length >= 1, saidBy(hale.name, /^Joan, /).map((line) => `${clockAt(line.at)} in ${line.room}: ${line.text}`).join(' | ') || 'said nothing to Joan');
    const captainTold = sentTo(joan, SEC_CAPTAIN, /Captain, Pun Pun is in Cell 1 for 5 minutes\./);
    check('the Captain is told once', captainTold.length === 1 && (!faceWord[0] || captainTold[0].slice(0, 8) >= clockAt(faceWord[0].at)), captainTold.join(' | ') || 'never');
  }
  if (VARIANT === 'hurt') {
    const hurtTold = told(hale, joan!.name, /Joan, I could not take Pun Pun\. I am hurt\./);
    check('the officer, bitten to under half its health, breaks off and tells the Head of Security', kitOf(hale).health < 50 && hurtTold >= 1, `health ${kitOf(hale).health}, told ${hurtTold} time(s)`);
    const lastBite = bitten.at(-1)?.at ?? 0;
    check('and uses no force after that', arrests.filter((work) => work.who === hale.name && work.how === 'force' && work.at > lastBite).length === 0, listed(arrests.filter((work) => work.who === hale.name)));
    check('the Head of Security tells the Captain, once', sentTo(joan, SEC_CAPTAIN, /Captain, Hale could not take Pun Pun and is hurt\. I am serving the warrants myself\./).length === 1);
    check('fetches a baton of its own', secWork.some((work) => work.tool === 'get_kit' && work.who === joan!.name));
    check('and makes the arrest itself', jailings[0]?.who === joan!.name, listed(secWork.filter((work) => work.who === joan!.name)));
    // TRB-03: the officer gives up its copy of the warrant the Head of Security served, so the monkey let out is not arrested again.
    check('the officer is told the warrant is served', told(joan, hale.name, /Hale, Pun Pun is in a cell: the warrant is served\./) >= 1);
    const out = walkedFree.find((it) => it.who === 'Pun Pun' && it.why === 'time up');
    check("let out when its time is up, the monkey is in the officer's sight for a while", !!out && freedInSight >= 10, out ? `${freedInSight} s in sight` : 'never let out');
    const again = secWork.filter((work) => work.tool === 'arrest' && work.target === 'Pun Pun' && !!out && work.at > out.at);
    const toldAgain = saidBy(hale.name, /^Pun Pun, you are under arrest/).filter((line) => !!out && line.at > out.at);
    check('and nobody arrests it again', !!out && again.length === 0 && toldAgain.length === 0 && jailings.length === 1, listed(again) || `${toldAgain.length} told`);
  }
}
// The scenarios for round one's security fixes, apart from the main checks.
if (SECURITY && ['headhit', 'cuffedfree', 'cuffedheld', 'twolocked'].includes(VARIANT)) {
  const began = clock - SECONDS * 1000;
  const at = (line: string) => line.slice(0, 8);
  const clockAt = (ms: number) => new Date(ms).toISOString().slice(11, 19);
  const joan = crew.find((body) => body.job === 'Head of Security')!;
  const hale = crew.find((body) => body.job === 'Security Officer')!;
  const saidBy = (who: string, words: RegExp) => spoken.filter((line) => line.who === who && words.test(line.text));
  const sentTo = (body: Body | undefined, person: string, words: RegExp) => (body?.log ?? []).filter((line) => / message /.test(line) && line.includes('"person":"' + person + '"') && words.test(line));
  const listed = (work: typeof secWork) => work.map((it) => `${it.who} ${it.tool}${it.how ? ' ' + it.how : ''} ${it.ok ? 'ok' : it.reason}${it.target ? ' ' + it.target : ''}`).join('; ');
  const jailings = secWork.filter((work) => work.tool === 'jail' && work.ok);
  if (VARIANT === 'headhit') {
    const stops = secWork.filter((work) => work.tool === 'arrest' && (work.how === 'stop' || work.target === 'Quin Mark'));
    check('the officer lays no baton on the head of staff who shoved it', stops.length === 0, listed(stops));
    const words = /Joan, Quin Mark attacked me\./;
    const told = saidBy(hale.name, words).length + sentTo(hale, joan.name, words).length;
    check('and tells the Head of Security it was attacked, once', told === 1, `${told} time(s)`);
  }
  if (VARIANT === 'cuffedfree') {
    const first = secWork.find((work) => work.tool === 'arrest' && work.who === hale.name);
    check('the officer takes the monkey, in cuffs and held by nobody, by the arm: an arrest with no baton', first?.how === 'quiet' && first.ok && first.target === 'Pun Pun', listed(secWork));
  }
  if (VARIANT === 'cuffedheld') {
    const onPun = secWork.filter((work) => work.target === 'Pun Pun' && work.tool !== 'get_kit');
    check('the monkey in the Head of Security\'s hold is left to it: no arrest, no cell', onPun.length === 0 && jailings.length === 0, listed(onPun));
    check('the officer has the warrant and comes to the Bar', hale.log.some((line) => / Bar +/.test(line.slice(9, 34))) || hale.room === 'Bar', hale.room);
    check('and tells nobody someone else has them: that is security', !/has them in cuffs/.test([...sentTo(hale, joan.name, /./), ...sentTo(joan, SEC_CAPTAIN, /./)].join(' ')));
  }
  if (VARIANT === 'twolocked') {
    const letIn = hale.log.find((line) => / message /.test(line) && /let me in|let me into|open the/i.test(line));
    check('the officer asks to be let into the Cargo Bay, from its door', !!letIn && /Cargo Lobby/.test(letIn.slice(9, 34)), letIn ?? 'never asked');
    const from = letIn ? at(letIn) : '99';
    const until = letIn ? clockAt(Date.parse(`1970-01-01T${from}Z`) + 80_000) : '99';
    const walks = hale.log.filter((line) => at(line) > from && at(line) <= until && / (go_to|go_to_door|explore|approach) /.test(line));
    check('and waits there: no walk anywhere for eighty seconds after asking', walks.length === 0, walks.join(' | ') || 'no walks');
    const danaArrest = secWork.filter((work) => work.target === 'Dana Reyes' && clockAt(work.at) > from && clockAt(work.at) <= until);
    check('Dana Reyes, in the Library, waits while it is at the door', danaArrest.length === 0, listed(danaArrest));
    check('(both warrants were given to the officer)', sentTo(joan, hale.name, /Hale, warrant: Dana Reyes/).length + saidBy(joan.name, /Hale, warrant: Dana Reyes/).length >= 1);
    void began;
  }
}
// The security scenarios of round A2.
if (SECURITY_A2) {
  const began = clock - SECONDS * 1000;
  const seconds = (at: number) => `${Math.round((at - began) / 1000)} s in`;
  const at = (line: string) => Date.parse(`1970-01-01T${line.slice(0, 8)}Z`);
  const hale = crew.find((body) => body.name === 'Hale Stone')!;
  const saidBy = (who: string, words: RegExp) => spoken.filter((line) => line.who === who && words.test(line.text));
  const sentTo = (body: Body | undefined, person: string, words: RegExp) => (body?.log ?? []).filter((line) => / message /.test(line) && line.includes('"person":"' + person + '"') && words.test(line));
  const listed = (work: typeof secWork) => work.map((it) => `${it.who} ${it.tool}${it.how ? ' ' + it.how : ''} ${it.ok ? 'ok' : it.reason}${it.target ? ' ' + it.target : ''}`).join('; ') || 'nothing';
  const jailings = secWork.filter((work) => work.tool === 'jail' && work.ok);
  if (VARIANT === 'warrantkept') {
    const cora = crew.find((body) => body.job === 'Cargo Technician')!;
    const asked = saidBy(cora.name, /^Hale\b.*why are you in here/i);
    check('the technician, finding the officer in its post, asks it why it is there', asked.length >= 1 && asked.length <= 2, `${asked.length} time(s): ${cora.said.join(' | ') || 'nothing said'}`);
    const answer = saidBy(hale.name, /^(\w+, )?I am here on a warrant\./);
    check('the officer says it is here on a warrant, naming nobody', answer.length >= 1 && !!asked[0] && answer[0].at >= asked[0].at && !answer.some((line) => /Pun Pun/.test(line.text)), answer.map((line) => line.text).join(' | ') || `said: ${hale.said.join(' | ') || 'nothing'}`);
    const outTried = cora.log.filter((line) => / throw_out /.test(line) && line.includes(handleFor(cora, hale.name)));
    check('and is not walked out: the technician does not try, and the server would refuse it', !putOut.includes(hale.name) && outTried.length === 0 && warrantRefusals.length === 0 && walkedOutEvents.length === 0, `${outTried.length} tr${outTried.length === 1 ? 'y' : 'ies'}; refused: ${warrantRefusals.join(', ') || 'none'}; walked out: ${putOut.join(', ') || 'nobody'}`);
    const owned = saidBy(hale.name, /Nobody sent for me/);
    check('it does not own up to having no business there', owned.length === 0, owned.map((line) => line.text).join(' | '));
    check('it arrests the monkey and puts it in a cell', jailings.some((work) => work.target === 'Pun Pun'), listed(secWork));
  }
  if (VARIANT === 'twoofficers') {
    const rob = crew.find((body) => body.name === 'Rob Kerr')!;
    const readBack = sentTo(hale, SEC_CAPTAIN, /Captain, I have that: a warrant for Pun Pun/);
    check('the officer the warrant was declared to takes it, and answers the Captain word for word', readBack.length === 1, readBack.length + ' time(s)');
    const byHale = secWork.filter((work) => work.who === hale.name && work.target === 'Pun Pun');
    check('and serves it itself: it arrests the monkey and puts it in a cell', jailings.some((work) => work.who === hale.name && work.target === 'Pun Pun'), listed(byHale));
    const byRob = secWork.filter((work) => work.who === rob.name && work.tool !== 'get_kit');
    check('the other officer makes no arrest and jails nobody', byRob.length === 0, listed(byRob));
    const toRob = [...sentTo(hale, rob.name, /./), ...saidBy(hale.name, /^Rob\b/).map((line) => line.text)];
    check('and is sent nothing of it, by PDA or to its face', toRob.length === 0, toRob.join(' | '));
    check('it does not take the warrant up of its own accord either', saidBy(rob.name, /Pun Pun, you are under arrest/).length === 0 && sentTo(rob, SEC_CAPTAIN, /warrant/i).length === 0);
  }
  if (VARIANT === 'stuckcuffs') {
    const jan = crew.find((body) => body.name === 'Jan Itor')!;
    const told = saidBy(jan.name, /^Hal, I am in handcuffs and cannot get them off\. Can someone from security take them off\?$/);
    check('told it cannot get its cuffs off, the janitor tells its head, face to face, once', !!stuckToldAt && told.length === 1 && told[0].at >= stuckToldAt && sentTo(jan, 'Hal Pott', /./).length === 0, told.map((line) => seconds(line.at)).join(', ') || `said: ${jan.said.join(' | ') || 'nothing'}`);
    const frees = secWork.filter((work) => work.tool === 'free' && work.target === jan.name);
    check('the officer who hears it takes the cuffs off', frees.some((work) => work.ok && work.reason === 'cuffs') && !crewCuffed.has(jan.name) && !!told[0] && frees[0].at >= told[0].at, listed(secWork));
    check('once, and it takes no other step with the janitor', frees.length === 1 && secWork.filter((work) => work.tool === 'arrest' || work.tool === 'jail').length === 0, listed(secWork));
    const freedAt = frees[0]?.at ?? Infinity;
    const after = jan.log.filter((line) => at(line) > freedAt && !/ say /.test(line));
    check('free of them, the janitor gets on with its work', after.length >= 1, after[0]?.trim() ?? `ends in ${jan.room}`);
    check('nobody else offers to take them off: only security does', !spoken.some((line) => line.who !== hale.name && line.who !== jan.name && /cuffs/i.test(line.text)));
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
