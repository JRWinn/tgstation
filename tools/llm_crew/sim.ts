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
const MODE = process.argv[2] ?? 'quiet';
const ROOT = `${import.meta.dir}/../../tgui/packages/tgui/interfaces/CrewBrain/`;

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
let llmCalls = 0;
(globalThis as any).fetch = async (_url: string, init: any) => {
  llmCalls++;
  if (MODE === 'dead') throw new Error('Ollama is not running');
  const body = JSON.parse(init.body);
  const report: string = body.messages[body.messages.length - 1].content;
  const properties = body.format.properties;
  const moves: any[] = properties.move.anyOf;
  const order = moves.find((move) => move.properties.tool.const === 'order');
  const heard = (report.match(/says: "[^"]*"/g) ?? []).join(' ').toLowerCase();
  const reply: any = { think: 'x' };
  if (properties.feel) reply.feel = { person: properties.feel.properties.person.enum[0], change: 'same', why: '' };
  if (properties.work) reply.work = { what: 'nothing', where: properties.work.properties.where.enum.at(-1) };
  // Agrees to an order when asked for one; otherwise only answers when in a talkative mood.
  if (order && /order|suppl|crate/.test(heard)) {
    reply.say = 'I will see to it.';
    reply.move = { tool: 'order', crate: order.properties.crate.enum[0] };
  } else {
    reply.say = MODE === 'chatty' && heard ? 'Right you are.' : '';
    reply.move = { tool: 'stay' };
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
  orderPending: boolean; crateWaiting: string | null; messageOwed: string | null; dockAt: number; orderFor: string | null; mail: string[]; stillUntil: number; lastSaidAt: number; setOffTooSoon: number; saidWalking: number; doorHeldUntil: number; letOutUntil: number; letInto: string | null; letInBy: string | null; bayFails: number;
  log: string[]; said: string[];
};
const bodies: Body[] = [];
// The cargo counter is open: people in the bay and the lobby can see and hear each other.
const COUNTER = ['Cargo Bay', 'Cargo Lobby'];
// People who are not NPCs: they stand where they are put, and open a door when asked to.
const players: { name: string; job: string; room: string }[] = [];
let bayDoorOpenFrom = Infinity;
let bayDoorOpenUntil = -Infinity;
const bayDoorOpen = () => clock >= bayDoorOpenFrom && clock <= bayDoorOpenUntil;
// Only cargo staff can open the bay door. Anyone else in there is shut in until someone opens it.
// A body knows it is shut in after two ways out have failed, or one if it was let into the room.
const isShutIn = (body: Body) => body.waysOut >= 2 || (body.waysOut >= 1 && body.letInto === body.room);
// What takes a body off across the room or out of it, as against what it does where it stands.
const LEAVES = new Set(['go_to', 'explore', 'bring_out', 'unload', 'recycle', 'send_shuttle', 'order', 'pick_up', 'hand_mail', 'collect_mail', 'open_door']);
const shutInBay = (body: Body) => body.room === 'Cargo Bay' && !body.post && !bayDoorOpen();
// The people a body can see: those in its room, and across the open cargo counter.
const inSight = (body: Body, room: string) => body.room === room || (COUNTER.includes(body.room) && COUNTER.includes(room));
const handed: string[] = [];
const opened: string[] = [];
const putAway: string[] = [];
const near = (a: Body, b: Body) => a.room === b.room || (COUNTER.includes(a.room) && COUNTER.includes(b.room));
function spawn(name: string, job: string): Body {
  const body: Body = { id: `npc${bodies.length + 1}`, name, job, room: 'Arrival Shuttle Hallway', holding: [], mopWet: false, visited: new Set(), known: new Set(['Cargo Lobby']), blocked: new Map(), seenMesses: new Map(), stubborn: new Set(), busyUntil: 0, busyText: null, walking: false, onDone: null, events: [], seq: 0, handles: new Map(), seen: new Set(), explored: false, waysOut: 0, hasLocator: job === 'Janitor', post: job === 'Janitor' ? null : 'Cargo Bay', orderPending: false, crateWaiting: null, messageOwed: null, dockAt: 0, orderFor: null, mail: [], stillUntil: 0, lastSaidAt: -Infinity, setOffTooSoon: 0, saidWalking: 0, doorHeldUntil: 0, letOutUntil: 0, letInto: null, letInBy: null, bayFails: 0, log: [], said: [] };
  if (body.post) body.known.add(body.post);
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
  result(body, tool, true, `You arrive in ${place}.`, { place });
}

// ---- what the server does with each tool call
function toolCall(body: Body, tool: string, args: any) {
  // Standing still to talk is not a step of anyone's work, so it is not logged as one.
  if (tool === 'hold') { body.stillUntil = Math.max(body.stillUntil, clock + 4000); return; }
  body.log.push(`${stamp()} ${body.room.padEnd(24)} ${tool}${Object.keys(args).length ? ' ' + JSON.stringify(args) : ''}`);
  // What it says it will do and then at once does is one act. Wandering off after speaking is another.
  if (LEAVES.has(tool) && clock > body.lastSaidAt && clock - body.lastSaidAt < 2000) body.setOffTooSoon++;
  const room = rooms[body.room];
  switch (tool) {
    case 'say': {
      body.said.push(args.text);
      // Said while walking, with the walk not held for it, is said over the shoulder on the way out.
      if (body.walking && clock >= body.stillUntil) body.saidWalking++;
      body.lastSaidAt = clock; body.stillUntil = Math.max(body.stillUntil, clock + 2500);
      // A player asked about the door goes and opens it, and it stays open a little while.
      if (/door/i.test(args.text) && players.some((player) => player.room === body.room)) { bayDoorOpenFrom = clock + 4000; bayDoorOpenUntil = clock + 30000; }
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
      // Only cargo staff have the access to get into the bay. Anyone else finds no way through.
      if (args.place === 'Cargo Bay' && !body.post && !bayDoorOpen()) {
        return busy(body, 3, `walking to ${args.place}`, true, () => {
          body.blocked.set(args.place, clock); body.bayFails++;
          result(body, 'go_to', false, `You stop on the way to ${args.place}: there is no way through.`);
        });
      }
      return busy(body, 6, `walking to ${args.place}`, true, () => arrive(body, args.place, 'go_to'));
    case 'explore': {
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
      if (body.orderPending || body.crateWaiting) return result(body, 'order', false, 'You already have an order on the go.');
      return busy(body, 4, 'going to the supply console to place an order', false, () => {
        body.orderPending = true; body.dockAt = clock + 20_000;
        body.orderFor = [...body.handles.entries()].find(([, handle]) => handle === args.for)?.[0] ?? null;
        result(body, 'order', true, `You order the ${args.crate} for ${body.orderFor}.`);
      });
    case 'bring_out':
      if (!body.crateWaiting) return result(body, 'bring_out', false, 'You have no crate waiting to be brought out.');
      return busy(body, 6, 'hauling a crate out to Cargo Lobby', true, () => {
        rooms['Cargo Lobby'].boxes.push({ name: 'janitorial supplies crate', contents: ['mop', 'space cleaner'], openedBy: new Set(), crate: true });
        body.room = 'Cargo Lobby'; body.crateWaiting = null; body.messageOwed = body.orderFor;
        result(body, 'bring_out', true, 'You bring the crate out to Cargo Lobby.', { place: 'Cargo Lobby' });
      });
    case 'message': {
      const target = bodies.find((other) => other.name === args.person);
      if (target) emit(target, 'pda_message', `Your PDA buzzes with a message from ${body.name}: "${args.text}"`, { speaker: body.name, message: args.text });
      if (args.person === body.messageOwed) body.messageOwed = null;
      return result(body, 'message', true, `You send ${args.person} a PDA message.`);
    }
    case 'open_door': {
      const name = [...body.handles.entries()].find(([, handle]) => handle === args.person)?.[0];
      const them = bodies.find((other) => other.name === name) ?? players.find((other) => other.name === name);
      if (!body.post || !them || !inSight(body, them.room)) return result(body, 'open_door', false, 'You cannot see that person.');
      const inside = them.room === body.post;
      if (!inside && !(them.job === 'Janitor' && rooms[body.post].messes.length > 0)) return result(body, 'open_door', false, `You have no call to let ${them.name} into ${body.post}.`);
      return busy(body, 3, 'going to open the door for someone', false, () => {
        bayDoorOpenFrom = clock; bayDoorOpenUntil = clock + 15000; opened.push(`${inside ? 'out' : 'in'}:${them.name}`);
        const their = bodies.find((other) => other.name === name);
        if (their) {
          their.blocked.clear(); their.waysOut = 0; their.doorHeldUntil = clock + 15000; their.known.add(body.post!);
          if (!inside) { their.letInto = body.post; their.letInBy = body.name; } else { their.letOutUntil = clock + 15000; }
          emit(their, 'knowledge', `${body.name} opens the door ${inside ? 'out of' : 'into'} ${body.post} and holds it for you.`, { places: [{ place: body.post, things: [] }], door_held: 1 });
        }
        result(body, 'open_door', true, `You open the door for ${them.name} and hold it.`);
      });
    }
    case 'unload': {
      const crate = shuttle.docked ? shuttle.aboard.find((box) => !spent(box)) : undefined;
      if (!crate) return result(body, 'unload', false, 'There is nothing left aboard the supply shuttle to unload.');
      return busy(body, 6, 'hauling a crate off the supply shuttle', true, () => {
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
        room.boxes.splice(room.boxes.indexOf(crate), 1); shuttle.aboard.push(crate); body.room = 'Cargo Bay';
        result(body, 'recycle', true, `You put the empty ${crate.name} aboard the supply shuttle to go back.`);
      });
    }
    case 'tidy': {
      const where = ['Cargo Bay', 'Cargo Lobby'].find((name) => rooms[name].floor?.length);
      if (!body.post || !where) return result(body, 'tidy', false, 'There is nothing lying about that you have anywhere to put.');
      return busy(body, 5, 'putting away something that was lying about', true, () => {
        const thing = rooms[where].floor!.shift()!; body.room = where; putAway.push(`${thing.name} ${thing.rubbish ? 'in the bin' : 'on a table'}`);
        result(body, 'tidy', true, `You put the ${thing.name} ${thing.rubbish ? 'in the disposal bin' : 'on the table'} in ${where}.`);
      });
    }
    case 'send_shuttle':
      if (!shuttle.docked) return result(body, 'send_shuttle', false, 'The supply shuttle is not here to send back.');
      if (shuttle.aboard.some((box) => !spent(box))) return result(body, 'send_shuttle', false, 'There is still something aboard that has to come off first.');
      return busy(body, 4, 'going to the supply console to send the shuttle back', false, () => {
        shuttle.sentWith = shuttle.aboard.length; shuttle.docked = false; shuttle.aboard = []; body.room = 'Cargo Bay';
        result(body, 'send_shuttle', true, 'You send the supply shuttle back.');
      });
    default:
      return result(body, tool, false, 'Your body does not know how to do that.');
  }
}
brainModule.setAct((action: string, payload: any) => {
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
  for (const [id, place] of body.seenMesses) if (place === body.room && !room.messes.some((m) => m.id === id)) body.seenMesses.delete(id);
  const others: { name: string; job: string }[] = [...bodies.filter((other) => other !== body && near(other, body)), ...players.filter((player) => inSight(body, player.room))];
  for (const other of others) if (!body.seen.has(other.name)) { body.seen.add(other.name); emit(body, 'person_in_view', `${other.name}, ${other.job}, comes into view 2 tiles away.`, { handle: handleFor(body, other.name), name: other.name, job: other.job }); }
  for (const name of [...body.seen]) if (!others.some((other) => other.name === name)) body.seen.delete(name);
  const remembered = [...body.seenMesses.entries()].map(([id, place]) => ({ place, m: allMesses().find((x) => x.id === id) })).filter((x) => x.m);
  const counts = new Map<string, number>();
  for (const m of room.messes) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  const unopened = room.boxes.filter((box) => !box.openedBy.has(body.id)).length;
  return {
    id: body.id, name: body.name, job: body.job, awake: 1, location: body.room, place_kind: room.kind,
    people_in_view: others.map((other) => ({ handle: handleFor(body, other.name), name: other.name, job: other.job, in_post: body.post && (other as any).room === body.post ? 1 : 0 })),
    things_in_view: [...[...counts].map(([name, count]) => ({ name, count, kind: 'mess' })), ...room.items.map((name) => ({ name, count: 1, kind: 'item' })), ...(room.sink ? [{ name: 'sink', count: 1, kind: 'structure' }] : [])],
    holding: body.holding, cleaning_tool: cleaningTool(body), has_locator: body.hasLocator ? 1 : 0,
    cleanable_messes: cleaningTool(body) ? [...new Set(room.messes.filter((m) => canShift(body, m)).map((m) => m.name))] : [],
    mess_places: [...new Set(remembered.map((x) => x.place))],
    workable_mess_places: [...new Set(remembered.filter((x) => canShift(body, x.m!) && !shut(x.place)).map((x) => x.place))],
    mop_needs_water: body.holding.includes('mop') && !toolOf(body) && !body.mopWet ? 1 : 0, sink_in_view: room.sink ? 1 : 0, shut_in: isShutIn(body) ? 1 : 0, door_open: isShutIn(body) && bayDoorOpen() ? 1 : 0, door_held: clock < body.doorHeldUntil ? 1 : 0, door_held_out: clock < body.letOutUntil ? 1 : 0, let_in_by: body.letInBy,
    dry_mop: body.holding.includes('mop') && !toolOf(body) && !body.mopWet && !room.sink ? 1 : 0,
    grenade_messes: 0, doing: body.busyText, post: body.post, orderable: body.post ? ['Janitorial Supplies Crate'] : [],
    order_pending: body.orderPending ? 1 : 0, crate_waiting: body.crateWaiting, has_pda: 1, message_owed: body.messageOwed,
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
    work_area_messes: body.post ? Object.fromEntries(['Cargo Lobby', body.post].filter((place) => remembered.some((x) => x.place === place)).map((place) => [place, [...new Set(remembered.filter((x) => x.place === place).map((x) => x.m!.name))].slice(0, 3)])) : {},
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
const crew = VARIANT === 'trapped' ? spawnTrapped() : VARIANT === 'solo' ? [spawn('Jan Itor', 'Janitor')] : [spawn('Cora Tech', 'Cargo Technician'), spawn('Jan Itor', 'Janitor'), spawn('Mo Pper', 'Janitor'), spawn('Sue Ds', 'Janitor')];
const SECONDS = 540;
const PAT_COMES_AT = 300;
for (let second = 0; second < SECONDS; second++) {
  clock += 1000; serverNow += 10;
  for (const body of bodies) {
    if (body.busyText && clock >= body.busyUntil && !(body.walking && clock < body.stillUntil)) { const done = body.onDone; body.busyText = null; body.walking = false; body.onDone = null; done?.(); }
    if (body.orderPending && clock >= body.dockAt) {
      body.orderPending = false; body.crateWaiting = 'Janitorial Supplies Crate';
      shuttle.docked = true; shuttle.aboard.push({ name: 'mail crate', contents: [], openedBy: new Set(), mail: ['Pat Rick'], crate: true });
      result(body, 'order', true, 'The supply shuttle has docked with the crate you ordered.');
    }
  }
  // Whoever the mail is for comes to the counter some minutes after it has arrived.
  if (second === PAT_COMES_AT && !VARIANT) players.push({ name: 'Pat Rick', job: 'Botanist', room: 'Cargo Lobby' });
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
const bayCounts = !VARIANT;
const left = allMesses().filter((m) => bayCounts || !rooms['Cargo Bay'].messes.includes(m));
check(`every mess a janitor can get to is cleaned (started with ${messId}${bayCounts ? ', one of them behind the bay door' : '; the one in the bay does not count'})`, left.length === 0, left.length ? `left: ${Object.entries(rooms).filter(([, room]) => room.messes.length).map(([name, room]) => `${name}: ${room.messes.map((m) => m.name).join(', ')}`).join('; ')}` : '');
const janitors = crew.filter((body) => body.job === 'Janitor');
check('every janitor ends with something to clean with', janitors.every((body) => body.holding.some((item) => /mop|space cleaner|soap/.test(item))), janitors.map((body) => `${body.name}: ${body.holding.join(', ') || 'nothing'}`).join('; '));
const bayTries = janitors.map((body) => body.bayFails);
check('no janitor keeps walking at a room it cannot get into', bayTries.every((tries) => tries <= 2), `tries at the Cargo Bay: ${bayTries.join(', ')}`);
if (VARIANT === 'trapped') {
  const shutIn = janitors[0];
  const asks = shutIn.said.filter((line) => /door/i.test(line)).length;
  check('the janitor shut in the bay asks for the door, without nagging', asks >= 1 && asks <= 2, asks + ' time(s)');
  check('it does not keep walking at the door meanwhile', shutIn.log.filter((line) => /Cargo Bay .*(go_to|explore)/.test(line)).length <= 6, `tries from inside the bay: ${shutIn.log.filter((line) => /Cargo Bay .*(go_to|explore)/.test(line)).length}`);
  check('once let out, it gets on with its job', shutIn.room !== 'Cargo Bay' || shutIn.holding.length > 0, `ends in ${shutIn.room}`);
}
const tech = crew.find((body) => body.job === 'Cargo Technician');
if (tech) {
  const orders = tech.log.filter((line) => / order /.test(line)).length;
  check(janitors.length > 2 ? 'exactly one order was placed' : 'no order was needed', janitors.length > 2 ? orders === 1 : orders === 0, `orders: ${orders}`);
  check('the cargo technician ends at the post', tech.room === 'Cargo Bay', `in ${tech.room}`);
  check('nobody is still owed a PDA message', !tech.messageOwed && !tech.crateWaiting);
}
// Shut in the bay, the janitor is in the technician's sight, and is out and cleaning before a call is due.
if (tech && janitors.length && VARIANT !== 'trapped') {
  const called = tech.log.filter((line) => / message /.test(line) && /There is a mess in the Cargo Lobby/.test(line));
  check('the technician does not nag about the mess in the lobby', called.length <= 2, `${called.length} call(s)`);
  const to = called[0]?.match(/"person":"([^"]*)"/)?.[1];
  const callee = janitors.find((body) => body.name === to);
  check('a janitor called to the lobby goes there', !to || (!!callee && callee.log.some((line) => line.includes('go_to {"place":"Cargo Lobby"}') || / Cargo Lobby .* clean/.test(line))), to ?? 'the lobby was clean before a call was due');
  if (bayCounts) {
    const bayCalls = tech.log.filter((line) => / message /.test(line) && /There is a mess in the Cargo Bay/.test(line)).length;
    check('the technician calls a janitor to the mess in the bay, and does not nag', bayCalls >= 1 && bayCalls <= 2, `${bayCalls} call(s)`);
    const lets = { in: opened.filter((entry) => entry.startsWith('in:')).length, out: opened.filter((entry) => entry.startsWith('out:')).length };
    check('that janitor is let in to clean it, and let out again, without the door being opened over and over', lets.in >= 1 && lets.in <= 2 && lets.out >= 1 && lets.out <= janitors.length + 1 && rooms['Cargo Bay'].messes.length === 0 && janitors.every((body) => body.room !== 'Cargo Bay'), opened.join(', ') || 'the door was never opened');
  }
}
if (tech) check('the technician puts away what was lying about in the bay and the lobby', putAway.length === 3, putAway.join('; ') || 'nothing was put away');
if (tech && janitors.length > 2) {
  const told = tech.log.filter((line) => / message /.test(line) && /Pat Rick/.test(line)).length;
  check('the mail crate is unloaded and the mail taken out of it', tech.log.some((line) => / unload/.test(line)) && tech.log.some((line) => / collect_mail/.test(line)));
  check('whoever the mail is for is told once by PDA', told === 1, `${told} message(s)`);
  check('they are handed it when they come to the counter', handed.includes('Pat Rick') && tech.mail.length === 0, handed.join(', ') || 'nothing handed over');
  check('the empty crates go back on the shuttle, and it is sent away', !shuttle.docked && shuttle.sentWith >= 2, `sent with ${shuttle.sentWith} crate(s) aboard`);
}
const tooSoon = crew.reduce((total, body) => total + body.setOffTooSoon, 0);
const overShoulder = crew.reduce((total, body) => total + body.saidWalking, 0);
check('nobody sets off within two seconds of speaking', tooSoon === 0, `${tooSoon} time(s)`);
check('nobody says their piece while walking off', overShoulder === 0, `${overShoulder} time(s)`);
const calls = crew.reduce((total, body) => total + body.log.filter((line) => !/ say /.test(line)).length, 0);
console.log(`\n${calls} steps taken by code; the LLM was asked ${llmCalls} time(s) in ${SECONDS / 60} minutes (${MODE} LLM).`);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
