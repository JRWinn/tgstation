/**
 * The janitor: keeps the station clean, and has to find something to clean with before it can.
 *
 * How the work is done is decided here, in code: where the supplies are, which tool to take,
 * wetting a mop. The LLM is asked to speak: to answer people, to take note of a mess it is told
 * of, and to ask cargo for supplies when the code says it is time to. And with several messes it
 * could go to, it is asked which comes first (see choice.ts).
 */
import { headOf } from '../hierarchy';
import { allKnownItems, CARGO_LOBBY, knowsPlace } from '../memory';
import {
  addTask,
  blockTask,
  dropTask,
  findTask,
  finishTask,
  placeNamedIn,
  takeToldWork,
} from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';
import { isCargo } from './cargo';
import { isTechnician } from './supply';
import type { Job } from './job';
import { needStep } from './meetings';

/** The kinds of task a janitor has: a mess to clean, and getting something to clean it with. */
const CLEAN = 'clean';
const SUPPLIES = 'supplies';

/** TRUE if this job title is one whose work is cleaning. */
export function isJanitor(title: string): boolean {
  return /janitor|custodian/i.test(title);
}

/**
 * Items that will clean, by name. A damp rag is one: it comes in every crate of janitorial supplies,
 * and with only a mop and a spray counted, a crate was good for two janitors and the rest stood
 * round it empty-handed. A cleaner grenade is not one: it is only for a big mess. Nor is a push
 * broom, which shifts rubbish and not what is on the floor.
 */
const CLEANING_SUPPLY = /soap|space cleaner|mop$|\brag$/i;
/**
 * Those of them that are worth having. A rag is a poor tool: it shifts little, and a janitor with
 * nothing else is short of something to clean with, the same as one with nothing at all.
 */
const PROPER_SUPPLY = /soap|space cleaner|mop$/i;

/** How long (deciseconds) a janitor waits at a locked door for someone who could open it to turn up. */
const WAIT_AT_COUNTER_DS = 600;
/** How long (deciseconds) a PDA message saying supplies are waiting is acted on. */
const SUPPLIES_WAIT_DS = 6000;
/** The fixed words of the head's PDA line saying what was asked for has come (head.ts). */
export const HAS_COME = 'what you asked for has come';
/** How long (deciseconds) a janitor must be in a room it was told is messy before it can say it saw no mess. */
const LOOK_ABOUT_DS = 50;

/**
 * Why a mess task cannot go on: what is left there is beyond what the janitor holds, would not
 * come off, or is somewhere the body could not get to. The body knows which; this only says so.
 */
const BEYOND = 'what is left there cannot be got at, or is beyond what you are holding';
/** What a janitor with nothing to clean with needs, in the words it asks its head for it in. */
const NEED = 'something to clean with';
/** What one with only a rag needs. */
const NEED_BETTER = 'something better than a rag to clean with';
/** The plain words a janitor asks to be let into a locked room in, by which that line is known afterwards. */
const ASKING_IN = 'could you let me in';
/** How long (deciseconds) it waits at the door after knocking and asking to be let in. */
const LET_IN_WAIT_DS = 600;
/** How long (deciseconds) after asking before someone who works there turning up is a reason to ask again. */
const ASK_AGAIN_AFTER_DS = 600;
/** What a mess task is waiting on when nobody came to let the body in. */
const NOT_LET_IN =
  'nobody let you in, and you will ask again when someone who works there turns up';
/**
 * The room whose door it asks at to get to this one. Usually the room itself. A locked room
 * inside a locked room is got to through the outer one, so until it is standing in that one, the
 * outer one's door is the door it asks at.
 */
export function doorFor(brain: NpcBrain, place: string): string {
  let door = place;
  const passed = [place];
  // Followed outwards, room by room. No station nests them more than a few deep.
  for (let depth = 0; depth < 4; depth++) {
    const outer = brain.reachedThrough[door];
    if (!outer || outer === brain.location) {
      break;
    }
    // Rooms that each open only from the other: the notes are wrong past here, learnt by a body
    // shut in elsewhere that could reach no door at all. Followed round, it stood at the door of
    // the public Cargo Lobby for a mess in the Delivery Office (LOGB-05). It goes no further out
    // than the first room the notes come back to.
    if (passed.includes(outer)) {
      return outer;
    }
    passed.push(outer);
    door = outer;
  }
  return door;
}

/**
 * The words by which a janitor sends word that a mess is beyond what it holds: that it cannot shift
 * it at all, or has done what it can and the rest will not come off. Whoever called it reads them
 * (see jobs/cargo.ts), and another janitor who is sent them does not take them for a call.
 */
const BEYOND_WORDS =
  /\bI cannot shift the mess in the (.+?)(?: with\b|[.,])|\bI have done what I can in the (.+?)\./i;

/** The room a janitor's word that a mess is beyond it is about, or undefined if the words are not that. */
export function beyondRoom(text: string): string | undefined {
  const found = text.match(BEYOND_WORDS);
  return found?.[1] ?? found?.[2];
}

/** What a mess that has beaten one janitor is said to want, in a call to the next. */
export const NEEDS_SCRUBBING = 'it needs scrubbing with soap or a rag';
/** The words of a call that asks a janitor to come only if it has that. */
const ONLY_IF_WORDS = /needs scrubbing with soap or a rag\b.*\bif you have one\b/is;
/**
 * The kinds of mess that only scrubbing shifts. A mop does not reach these and a spray only washes
 * what it is sprayed at: they stay when the floor round them is mopped. Decomposing garbage and a
 * gooey grey mass are not among them: a wet mop scrubs the floor and takes those up (JAN-02).
 */
const SCRUB_KINDS = /^(cobweb|rubble)$/i;

/** Writes a short list the way it is said: "cobweb", "cobweb and rubble", "oil, ashes and dirt". */
function listed(names: string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** TRUE if this janitor holds soap or a rag: what a mess that will not wash off is scrubbed with. A mop is not that. */
function canScrub(brain: NpcBrain): boolean {
  return brain.holding.some((item) => /soap|\brag$/i.test(item));
}

/** What a mess task is waiting on when what is left there is what the body could not get to. */
const UNREACHED_LEFT =
  'what is left there you could not get to, and you will try again later';
/** The mess jobs, by the task's id, whose last clean left only what the body could not get to (the server's `unreached`). */
const unreachedLeft = new Set<number>();

/** The mess jobs for which a janitor has begun putting its mop and bucket back, by the task's id: see changeForScrubbing. */
const puttingBack = new Set<number>();

/** Soap or a rag that it has put away about it, or knows the whereabouts of: what it scrubs with when it has a hand for it. Undefined if it knows of none. */
function scrubberToHand(brain: NpcBrain): string | undefined {
  const scrubs = (item: string) => /soap|\brag$/i.test(item);
  return brain.stowed.find(scrubs) ?? allKnownItems(brain).find(scrubs);
}

/**
 * The next step of changing a mop and bucket for something that scrubs, for a mess it was called
 * to that wants scrubbing. Null if there is nothing to change: it holds soap or a rag already,
 * the call is not of that kind, or it knows of nothing to scrub with.
 */
function changeForScrubbing(
  brain: NpcBrain,
  task: Task,
  toldBy: string,
): Plan | null {
  if (!task.wantsScrub || canScrub(brain) || task.place === brain.location) {
    return null;
  }
  const scrubber = scrubberToHand(brain);
  if (!scrubber) {
    return null;
  }
  const inTheWay = brain.holding.filter((item) => /\bmop$|bucket/i.test(item));
  const kept = brain.supplyPlaces.find((place) => knowsPlace(brain, place));
  // With a hand free it only has to take the rag up. With both full, the mop and the bucket both
  // go back: once it has begun putting them back it puts back both, and does not stop at the
  // first because that freed a hand. The owner: "put the mop and bucket back in the janitor area".
  if (brain.holding.length >= 2 && inTheWay.length > 0) {
    puttingBack.add(task.id);
  } else if (inTheWay.length === 0) {
    puttingBack.delete(task.id);
  }
  if (inTheWay.length > 0 && puttingBack.has(task.id)) {
    // Back to where the gear is kept, if it knows where that is, so that the mop and the bucket
    // are there to be had again and not lying in a hallway.
    if (kept && brain.location !== kept) {
      return {
        ready: true,
        step: `The mess in ${task.place}${toldBy} needs scrubbing with soap or a rag, which your ${listed(inTheWay)} will not do, and your hands are full. You are taking ${inTheWay.length > 1 ? 'them' : 'it'} back to the ${kept}, to put down there and take up your ${scrubber}.`,
        act: { tool: 'go_to', place: kept },
      };
    }
    return {
      ready: true,
      step: `The mess in ${task.place}${toldBy} needs scrubbing with soap or a rag. You are putting your ${inTheWay[0]} down here${kept ? `, in the ${kept}, where it is kept` : ''}, to have a hand for your ${scrubber}.`,
      act: { tool: 'put_down', item: inTheWay[0] },
    };
  }
  return {
    ready: true,
    step: `The mess in ${task.place}${toldBy} needs scrubbing with soap or a rag, and you ${brain.stowed.includes(scrubber) ? 'have' : 'know where there is'} ${scrubber}. You are getting it before you set off.`,
    act: { tool: 'pick_up', item: scrubber },
  };
}

/** What a janitor says is left in a room that it could not shift: the kinds by name if they are the scrubbing kind, and no claim about what the rest wants if not. */
function whatIsLeft(brain: NpcBrain): string {
  const kinds = brain.beyondKinds;
  return kinds.length > 0
    ? `What is left (${listed(kinds)}) needs scrubbing with soap or a rag.`
    : `The rest would not come off with my ${brain.cleaningTool}.`;
}

/** The kinds of mess a call names: "There is a mess in the Cargo Bay: pool of oil and cobweb." */
function kindsCalled(text: string): string[] {
  const named = text.match(/\bmess in [^:.]+: ([^.]+)\./i)?.[1];
  return named
    ? named
        .split(/,| and /)
        .map((kind) => kind.trim())
        .filter(Boolean)
    : [];
}

/** The job of someone it can see or has on its PDA, or '' if it does not know them. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** The words of a message that says no to letting it in. */
const REFUSED_WORDS = /cannot let you in|can't let you in|nobody (here )?sent for you/i;
/** What a mess task is waiting on when the body could not get into the room. */
const NO_WAY_IN = 'you could not find a way in, and will try again later';
/** What the LLM is given for the work a janitor takes on when told of it. */
const A_MESS = 'a mess that needs cleaning';
/**
 * The words that mark what someone says or writes as telling of a mess, or asking for cleaning.
 * Tested on lower-case text. Stems that begin other words are matched whole: "mess" not
 * "messages", "stain" not "stainless", "ash" not "ashley", "glass" not "glasses", "clean" not "cleaner".
 */
export const MESS_WORDS =
  /\b(?:mess(?:y|es)?|clean(?:s|ing|ed)?|mop(?:s|ping|ped)?|wipe|scrub|tidy|sweep|stain(?:s|ed)?|ash(?:es)?|glass|threw up|thrown up|throwing up)\b|\b(?:vomit|puk|spill|spilt|blood|trash|garbage|litter|puddle|sticky|gross|filth|dirt|grime|oil)\w*/;

/** What a janitor is told about its job, every time. The work itself needs no telling: the body does it. */
const ABOUT =
  'Your job is keeping the station clean. Your body does that work by itself: it finds something to clean with, goes to the messes it knows of, and cleans them.';

/** TRUE if this janitor is short of something to clean with: it has nothing, or nothing but a rag. */
function lacksTool(brain: NpcBrain): boolean {
  return !brain.cleaningTool || brain.poorTool;
}

/**
 * The cleaning gear it knows the whereabouts of that would be worth going for: a proper tool if it
 * knows of one, else, with nothing in hand, a rag. With a rag in hand, only something better.
 * Taking the rag first would leave it short and send it back for the mop, so that one janitor held
 * two of a crate's tools and the next had only the rag (TRA-01).
 */
function knownSupply(brain: NpcBrain): string | undefined {
  const known = allKnownItems(brain);
  const proper = known.find((item) => PROPER_SUPPLY.test(item));
  if (proper || brain.poorTool) {
    return proper;
  }
  return known.find((item) => CLEANING_SUPPLY.test(item));
}

/**
 * TRUE if it has been told, or has seen for itself, that what it asked for has come and is waiting
 * for it somewhere. It is still short of it until it has been to get it, but it has no more need
 * to ask for it: asked again, its head would only order the same thing twice.
 */
function suppliesWaiting(brain: NpcBrain): boolean {
  return (
    brain.suppliesSentAt !== null &&
    brain.now - brain.suppliesSentAt < SUPPLIES_WAIT_DS
  );
}

/** What it is short of, as a sentence about itself: nothing to clean with, or only a rag. */
function lack(brain: NpcBrain): string {
  return brain.poorTool
    ? `All you have to clean with is your ${brain.cleaningTool}, which shifts little`
    : 'You have nothing to clean with';
}

/** TRUE if this janitor is short of something to clean with and has not yet looked up where the supplies are. */
function mustFindSupplies(brain: NpcBrain): boolean {
  return lacksTool(brain) && brain.hasLocator && !brain.locatorUsed;
}

/** How long (deciseconds) a room where the body found no water it could get to is not gone to for water. */
const NO_WATER_DS = 3000;

/**
 * The rooms, by name, where each janitor stood with a dry mop and found no water it could get to,
 * with the time. Kept beside the brain, not in it: it is the janitor's own short note, and dies
 * with the brain.
 */
const noWaterNotes = new WeakMap<NpcBrain, Map<string, number>>();

/** The rooms this janitor lately found no water to hand in. */
function noWaterHere(brain: NpcBrain): Map<string, number> {
  let notes = noWaterNotes.get(brain);
  if (!notes) {
    notes = new Map();
    noWaterNotes.set(brain, notes);
  }
  return notes;
}

/** How long (deciseconds) a call it turned down for want of soap or a rag stays turned down. */
const DECLINED_DS = 3000;

/**
 * The rooms of the calls each janitor turned down for want of soap or a rag, with who called and
 * when. Kept beside the brain, as the notes on water are. The code turns such a call down; the
 * model, offered "work" for the same message, took it on all the same, and the janitor set off
 * for a room it could not get into, to a mess it could not shift (LOGA-07).
 */
const declinedNotes = new WeakMap<
  NpcBrain,
  Map<string, { by: string; at: number }>
>();

/** The calls this janitor has turned down, by room. */
function declinedCalls(brain: NpcBrain): Map<string, { by: string; at: number }> {
  let notes = declinedNotes.get(brain);
  if (!notes) {
    notes = new Map();
    declinedNotes.set(brain, notes);
  }
  return notes;
}

/**
 * TRUE if this is a mess task for a call the code has just turned down, taken on from the same
 * caller some other way (the model's "work", or work read from the words of the line): the code's
 * no stands while it still has nothing to scrub with. A task the message itself made sets
 * wantsScrub, and one the body noticed for itself is not told.
 */
function declinedCall(brain: NpcBrain, task: Task): boolean {
  if (
    task.kind !== CLEAN ||
    task.source !== 'told' ||
    !task.place ||
    task.wantsScrub !== undefined
  ) {
    return false;
  }
  const note = declinedCalls(brain).get(task.place.toLowerCase());
  return (
    !!note &&
    note.by === task.askedBy &&
    brain.now - note.at < DECLINED_DS &&
    !canScrub(brain) &&
    !scrubberToHand(brain)
  );
}

/** TRUE if the body remembers a sink among the things of this room. */
function remembersSinkIn(brain: NpcBrain, name: string): boolean {
  const place = brain.places.get(name);
  return (
    !!place && [...place.things.keys()].some((thing) => /sink/i.test(thing))
  );
}

/**
 * Works out the next step for a janitor with nothing to clean with. This is the whole of how a
 * janitor equips itself, in the order a person would try things: use what it knows of, look where
 * the gear is kept, and only then go and ask cargo.
 */
function supplyStep(brain: NpcBrain): Plan {
  // A dry mop is a tool once it is wet.
  if (brain.dryMop) {
    // Standing in a room it remembers a sink in, and still told its mop is dry with no water to
    // hand: that sink is one it cannot get to, seen through glass most often. Everything in view is
    // filed under the room it stands in, so the room keeps its sink, and the body was sent back to
    // it from elsewhere, to find again that it could not get to it.
    const noWater = noWaterHere(brain);
    if (remembersSinkIn(brain, brain.location)) {
      noWater.set(brain.location, brain.now);
    }
    const sinkRoom = [...brain.places.keys()].find(
      (name) =>
        name !== brain.location &&
        remembersSinkIn(brain, name) &&
        brain.now - (noWater.get(name) ?? -Infinity) >= NO_WATER_DS,
    );
    return sinkRoom
      ? {
          ready: true,
          step: `You are holding a mop, but it is dry and there is no sink in sight. There is a sink in ${sinkRoom}, so you are going there to wet it.`,
          act: { tool: 'go_to', place: sinkRoom },
        }
      : {
          ready: true,
          step: 'You are holding a mop, but it is dry, and you do not know where there is a sink to wet it at. You are looking for one.',
          act: { tool: 'explore' },
        };
  }
  const supply = knownSupply(brain);
  if (supply) {
    // Two of the same thing in its hands, a rag in each most often: one goes down first, or no
    // hand is free for what it is getting (LOGA-05).
    const twice = brain.holding.find(
      (item, i) => brain.holding.indexOf(item) !== i,
    );
    if (twice && brain.holding.length >= 2) {
      return {
        ready: true,
        step: `${lack(brain)}, but you know where there is ${supply}. Your hands are full, with a ${twice} in each, so you are putting one ${twice} down here to have a hand for the ${supply}.`,
        act: { tool: 'put_down', item: twice },
      };
    }
    return {
      ready: true,
      step: `${lack(brain)}, but you know where there is ${supply}, and you are going to get it.`,
      act: { tool: 'pick_up', item: supply },
    };
  }
  // Told by PDA that supplies are waiting, that is where to go, and the crate is what to look in.
  if (
    brain.suppliesSentAt !== null &&
    brain.now - brain.suppliesSentAt < SUPPLIES_WAIT_DS
  ) {
    const where = brain.suppliesAt ?? CARGO_LOBBY;
    if (brain.location !== where && knowsPlace(brain, where)) {
      return {
        ready: true,
        step: `${lack(brain)}, but your PDA says what you asked for has come and is in the ${where}. You are going there to get it.`,
        act: { tool: 'go_to', place: where },
      };
    }
    if (brain.location === where && brain.storageHere > 0) {
      return {
        ready: true,
        step: `${lack(brain)}, but what you asked for is somewhere in this room. You are looking through the storage here for it.`,
        act: { tool: 'search' },
      };
    }
  }
  if (mustFindSupplies(brain)) {
    return {
      ready: true,
      step: `${lack(brain)}, and you do not know where the cleaning supplies are kept. You are checking the custodial locator on your PDA.`,
      act: { tool: 'find_supplies' },
    };
  }
  // A supply room is done with once the NPC has stood in it with no storage left to look inside.
  if (brain.supplyPlaces.includes(brain.location) && brain.storageHere === 0) {
    brain.supplyPlacesSearched.add(brain.location);
  }
  const unsearched = brain.supplyPlaces.filter(
    (place) => !brain.supplyPlacesSearched.has(place),
  );
  if (unsearched.includes(brain.location)) {
    return {
      ready: true,
      step: `${lack(brain)}. This is where the cleaning gear is kept, and you are looking through the storage for some.`,
      act: { tool: 'search' },
    };
  }
  if (unsearched.length > 0) {
    return {
      ready: true,
      step: `${lack(brain)}. Your locator showed the cleaning gear is kept in ${unsearched[0]}, and you are going there to get some.`,
      act: { tool: 'go_to', place: unsearched[0] },
    };
  }
  // Nothing where the gear is kept. Cargo only takes orders from heads of department, so it takes
  // what it needs to the head it answers to, who orders for all their staff at once.
  return needStep(brain, brain.poorTool ? NEED_BETTER : NEED);
}

/** What the LLM should know about the mess in front of the janitor, so that what it says is true. */
function cues(brain: NpcBrain): string[] {
  const lines: string[] = [];
  // Only worth saying while it is looking for something to clean with, which is when it might ask.
  if (lacksTool(brain) && brain.peopleInView.some((person) => isJanitor(person.job))) {
    lines.push(
      'Other janitors have no supplies to spare. Do not ask them for theirs.',
    );
  }
  const messes = brain.thingsInView.filter((thing) => thing.kind === 'mess');
  // Called to a staff meeting, a mess in front of it is not what it is about: told that the mess
  // is its to clean, it says it is scrubbing while it stands and waits.
  if (messes.length === 0 || brain.summons) {
    return lines;
  }
  if (brain.cleanableMesses.length > 0 && brain.cleaningTool) {
    lines.push(
      `There is a mess here (${brain.cleanableMesses.join(', ')}), and it is yours to clean with your ${brain.cleaningTool}.`,
    );
    return lines;
  }
  lines.push(
    brain.cleaningTool
      ? `There is a mess here that your ${brain.cleaningTool} will not shift.${brain.beyondKinds.length > 0 ? ` The ${listed(brain.beyondKinds)} needs scrubbing with soap or a rag.` : ''}`
      : 'There is a mess here, but you have nothing to clean it with yet.',
  );
  return lines;
}

/**
 * Keeps the janitor's tasks true to what it has seen: a mess task for every room it remembers a
 * mess in, closed when it stands in the room and sees none, and a task to get something to clean
 * with for as long as it has nothing.
 */
function syncTasks(brain: NpcBrain): void {
  // A mess another janitor spoke of is not a call. Nobody is waiting on it, and nobody is owed
  // word of it: sent "I cannot shift it" about one, a janitor took that for a call, and the two of
  // them sent the same words back and forth.
  for (const task of brain.tasks) {
    if (
      task.kind === CLEAN &&
      task.source === 'told' &&
      task.askedBy &&
      isJanitor(jobOf(brain, task.askedBy))
    ) {
      task.source = 'noticed';
      task.urgency = 'routine';
      task.askedBy = undefined;
    }
  }
  // A call it turned down stays turned down, however else it came back onto the list. Once it has
  // soap or a rag to hand, the notes go: the next call is taken.
  const declined = declinedCalls(brain);
  if (declined.size > 0 && (canScrub(brain) || scrubberToHand(brain))) {
    declined.clear();
  }
  for (const task of declined.size > 0 ? [...brain.tasks] : []) {
    if (declinedCall(brain, task)) {
      dropTask(brain, task);
    }
  }
  // The body keeps track of the messes it has seen and not yet seen gone. A room wants cleaning
  // for as long as it remembers one there: not seeing a mess from where it stands proves nothing.
  const messy = new Set(brain.messPlaces);
  for (const name of messy) {
    if (!findTask(brain, CLEAN, { place: name })) {
      addTask(brain, {
        kind: CLEAN,
        place: name,
        urgency: 'routine',
        source: 'noticed',
      });
    }
  }
  for (const task of brain.tasks) {
    if (
      task.kind !== CLEAN ||
      task.state === 'done' ||
      !task.place ||
      messy.has(task.place)
    ) {
      continue;
    }
    // A mess it saw for itself is done with once the body has seen every spot of it clean. One it
    // was only told of is done with once it has gone there, looked about, and seen none.
    const lookedAbout =
      brain.location === task.place &&
      brain.now - brain.inPlaceSince >= LOOK_ABOUT_DS;
    if (task.source !== 'told' || lookedAbout) {
      finishTask(brain, task);
    }
  }
  // A mess that what it holds will not shift cannot go on until it holds something else. The body
  // knows which those are: it remembers each mess, and what it has in its hands.
  const workable = new Set(brain.workablePlaces);
  // What it did to be let in is for the call it did it for (DESK-02). Standing in the room, it has
  // been let through that door; a call done with leaves nothing behind, so the next starts with a
  // knock.
  delete brain.letInAsks[brain.location];
  forgetWrote(brain, brain.location);
  const askingAt = new Set(
    brain.tasks
      .filter(
        (task) =>
          task.kind === CLEAN &&
          task.state !== 'done' &&
          !!task.via &&
          !!task.place,
      )
      .map((task) => doorFor(brain, task.place ?? '')),
  );
  for (const door of Object.keys(brain.letInAsks)) {
    if (!askingAt.has(door)) {
      delete brain.letInAsks[door];
    }
  }
  for (const door of wroteNotes.get(brain)?.keys() ?? []) {
    if (!askingAt.has(door)) {
      forgetWrote(brain, door);
    }
  }
  for (const task of brain.tasks) {
    if (task.kind !== CLEAN || task.state === 'done' || !task.place) {
      continue;
    }
    // What is left there is what it could not get to, not what its tool will not shift (HAND-02):
    // tried again later, and not put down to the tool.
    const leftUnreached =
      unreachedLeft.has(task.id) &&
      messy.has(task.place) &&
      !workable.has(task.place);
    if (!leftUnreached) {
      unreachedLeft.delete(task.id);
    }
    const beyondIt =
      !!brain.cleaningTool &&
      messy.has(task.place) &&
      !workable.has(task.place) &&
      !leftUnreached;
    // Called to a mess that what it holds will not shift, it sends word to whoever called it,
    // once. They are waiting on it, and someone with soap or a mop can be sent for instead.
    // Only from in the room, where it has tried: a room it cannot get into is another matter.
    // And not in the middle of scrubbing: what is left is only known once it has stopped.
    if (
      (beyondIt || leftUnreached) &&
      task.place === brain.location &&
      task.askedBy &&
      task.source === 'told' &&
      !brain.doing?.startsWith('cleaning') &&
      brain.hasPda
    ) {
      // One thing is said of the room, and it is true of all of it: that none of it would shift,
      // or that some is done and the rest would not.
      brain.toTell.push({
        to: task.askedBy,
        line: leftUnreached
          ? `I have done what I can in the ${task.place}. I could not get to the rest.`
          : task.cleanedSome
          ? `I have done what I can in the ${task.place}. ${whatIsLeft(brain)}`
          : `I cannot shift the mess in the ${task.place} with my ${brain.cleaningTool}.${brain.beyondKinds.length > 0 ? ` ${whatIsLeft(brain)}` : ''}`,
        why: leftUnreached
          ? `${task.askedBy} called you to a mess in the ${task.place}. You have cleaned what you could get to, and could not get to the rest. You are sending ${task.askedBy} a PDA message to say so.`
          : task.cleanedSome
          ? `${task.askedBy} called you to a mess in the ${task.place}. You have cleaned what your ${brain.cleaningTool} would shift, and the rest will not come off. You are sending ${task.askedBy} a PDA message to say so.`
          : `${task.askedBy} called you to a mess in the ${task.place} that your ${brain.cleaningTool} will not shift. You are sending ${task.askedBy} a PDA message to say so.`,
        byPda: true,
        at: Date.now(),
      });
      // With that said the call is done with, on its side as on theirs. Kept on its list, it had
      // the janitor back at their door a few minutes later, to be told nobody had sent for it.
      // The mess is still one it knows of: it goes back on its list as its own, and waits there
      // until it holds something that will shift it.
      dropTask(brain, task);
      continue;
    }
    // A room it could not get into is left alone until the body is ready to try the way again.
    // A door being held open for it is a way in, whatever it found a moment ago.
    const noWayIn =
      !brain.doorHeld &&
      task.place !== brain.location &&
      brain.blockedPlaces.includes(task.place);
    // A room it has been called to and has to be let into is another matter: the way in is to go
    // and ask. It is only left alone once it has asked and nobody came.
    if (task.via && task.place !== task.via && task.place !== brain.location) {
      // It asks once: a knock, word to whoever called it, and a word to anyone in sight. There is
      // no asking again on a timer. Someone who works there turning up is what starts it again.
      const asks = brain.letInAsks[doorFor(brain, task.place)];
      const givenUp =
        !!asks &&
        hasAsked(brain, task, asks) &&
        brain.now - asks.at > LET_IN_WAIT_DS &&
        !brain.doorHeld;
      blockTask(task, givenUp ? NOT_LET_IN : null);
      continue;
    }
    blockTask(
      task,
      noWayIn
        ? NO_WAY_IN
        : beyondIt
          ? BEYOND
          : leftUnreached
            ? UNREACHED_LEFT
            : null,
    );
    task.blockedWith = beyondIt ? brain.cleaningTool : undefined;
  }

  // Getting something to clean with is on its list for as long as it is short of it. With only a
  // rag it still cleans what a rag will shift, and gets something better when it can.
  const supplies = findTask(brain, SUPPLIES);
  if (!lacksTool(brain)) {
    if (supplies) {
      finishTask(brain, supplies);
    }
    return;
  }
  const task =
    supplies ??
    addTask(brain, { kind: SUPPLIES, urgency: 'routine', source: 'own' });
  // With only a rag, and something better known to be there for the taking, it goes for that
  // before it answers a call to a mess: the rag would likely not shift the mess anyway.
  // Not while it has a mess to scrub that it took the rag up for: it put its mop down on purpose,
  // and goes back for it when that mess is seen to.
  const scrubbing = brain.tasks.some(
    (other) =>
      other.kind === CLEAN && other.state !== 'done' && !!other.wantsScrub,
  );
  task.urgency =
    brain.poorTool &&
    !scrubbing &&
    (!!knownSupply(brain) || suppliesWaiting(brain))
      ? 'asked'
      : 'routine';
  blockTask(
    task,
    // Told its head and waiting to hear: nothing more to do about it for now.
    !supplyStep(brain).ready && brain.toldHeadAt !== null
      ? 'you have told your head what you need, and will hear when it has come'
      : null,
  );
}

/** What doing one of the janitor's tasks comes down to right now. */
function plan(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === SUPPLIES) {
    return supplyStep(brain);
  }
  if (task.kind !== CLEAN) {
    return null;
  }
  // Taken on again since the last look at the list, from a call it has turned down: not gone to.
  if (declinedCall(brain, task)) {
    return {
      ready: false,
      step: `You have told ${task.askedBy} you cannot shift the mess in the ${task.place}: you have no soap or rag.`,
    };
  }
  const toldBy = task.askedBy ? ` (${task.askedBy} told you of it)` : '';
  // Called to a mess that wants scrubbing, a cobweb say, with a mop and a bucket in its hands:
  // neither will shift it, and it has no hand for what will. So it takes them back to where the
  // cleaning gear is kept, puts them down there, and takes up a rag or soap: one it put away in
  // its bag to carry the bucket, or one it knows the whereabouts of. This comes before the check
  // for something to clean with, because for a moment in the middle of it its hands are empty.
  // It goes back for the mop afterwards: with only a rag, it is short of something better.
  const change = changeForScrubbing(brain, task, toldBy);
  if (change) {
    return change;
  }
  if (!brain.cleaningTool) {
    return { ready: false, step: 'You need something to clean with first.' };
  }
  // Water comes before anything, wherever the mess is. A bucket that is running low is filled
  // while there is a tank or a sink in sight: it is the water the body carries to where there is
  // none, and a mop wetted from it saves a walk back across the station.
  if (brain.bucketToFill) {
    return {
      ready: true,
      step: `Your bucket is low and there is water here to fill it at. You are filling it before you set off for the mess in ${task.place}${toldBy}.`,
      act: { tool: 'clean' },
    };
  }
  // A dry mop with water to hand: its own bucket, a mop bucket or cart with water in, or a sink.
  if (brain.mopNeedsWater) {
    const water = brain.waterFrom ?? 'sink';
    const from = /^bucket$/i.test(water)
      ? 'you have water in your bucket'
      : `there is a ${water} right here`;
    return {
      ready: true,
      step:
        task.place === brain.location
          ? `Your mop is dry and ${from}. You are wetting it, and then cleaning up the mess here in ${task.place}${toldBy}.`
          : `Your mop is dry and ${from}. You are wetting it before you set off for the mess in ${task.place}${toldBy}.`,
      act: { tool: 'clean' },
    };
  }
  // A mop and nothing to carry water in: every few messes it is a walk back to a sink. A bucket
  // it knows the whereabouts of is worth going for once, before it sets off. Only for a mess
  // somewhere else: one in the room it stands in is cleaned first.
  if (brain.wantsBucket && task.place !== brain.location && !task.noBucket) {
    const bucket = allKnownItems(brain).find((item) => /^bucket$/i.test(item));
    if (bucket) {
      return {
        ready: true,
        step: `You have a mop and nothing to carry water in, and you know where there is a bucket. You are going to get it before you set off for the mess in ${task.place}${toldBy}.`,
        act: { tool: 'pick_up', item: bucket },
      };
    }
  }
  if (task.place === brain.location) {
    // A mess it remembers further off in the room counts: the body walks over to it.
    return brain.cleanableMesses.length > 0 ||
      brain.workablePlaces.includes(brain.location) ||
      brain.doing?.startsWith('cleaning')
      ? {
          ready: true,
          step: `You are cleaning up the mess here in ${task.place}${toldBy} with your ${brain.cleaningTool}.`,
          act: { tool: 'clean' },
        }
      : { ready: false, step: `Your ${brain.cleaningTool} will not shift it.` };
  }
  if (task.via && task.place && task.place !== task.via) {
    return letInStep(brain, task, task.place, task.via);
  }
  return task.place && knowsPlace(brain, task.place)
    ? {
        ready: true,
        step: `You have a mess to clean up in ${task.place}${toldBy}, and you are going there with your ${brain.cleaningTool}.`,
        act: { tool: 'go_to', place: task.place },
      }
    : { ready: false, step: 'You do not know the way there.' };
}

/**
 * Getting to a mess in a room that is locked to the janitor, which someone who works there called
 * it to: it goes and stands at the door, asks to be let in, and waits there. Once the
 * door is held for it, it goes through.
 */
function letInStep(
  brain: NpcBrain,
  task: Task,
  place: string,
  via: string,
): Plan {
  // The door it asks at: this room's, or that of the locked room this one lies inside, if it is
  // not through that one yet. What it says there names both, so whoever opens it knows why.
  const door = doorFor(brain, place);
  const within = door === place ? '' : `, which is reached through the ${door}`;
  // A door held open for it is the way in, if it is the door it was waiting at: not the door of
  // some other room, and not one being held to let it out of the room it is in.
  if (brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door) {
    return {
      ready: true,
      step: `The door into the ${door} is being held open for you, and you are going through${within ? ` on your way to the mess in the ${place}` : ' to clean up the mess there'}.`,
      act: { tool: 'go_to', place: door },
    };
  }
  // It goes and stands at the door it wants through, so that whoever opens it knows which one.
  if (brain.atDoorOf !== door) {
    return {
      ready: true,
      step: `${task.askedBy ?? 'Someone'} called you to a mess in the ${place}${within}, which is locked to you. You are going to stand at ${within ? `the door of the ${door}` : 'its door'} to be let in.`,
      act: { tool: 'go_to_door', place: door },
    };
  }
  // A voice does not carry through a shut door, and whoever is inside may not be in sight. So it
  // knocks, sends word to whoever called it, and says so to anyone it can see who works there:
  // each of those once.
  const asks = brain.letInAsks[door];
  // Which of the room's doors it is standing at, said in every asking. A room may have three, and
  // "the door of the Cargo Bay" had a technician open the tunnel door for a janitor in the lobby.
  const which = doorCalled(brain, door);
  if (!asks?.knocked) {
    return {
      ready: true,
      step: `You are at the door of the ${door}, which is locked to you. You are knocking, for whoever is inside.`,
      act: { tool: 'knock' },
    };
  }
  // Written to already about this door, the caller is not written to again when the asking starts
  // over: a knock, and a word to whoever has turned up.
  const wrote = wroteAbout(brain, door);
  if (
    !asks.messaged &&
    task.askedBy &&
    brain.hasPda &&
    !wrote.includes(task.askedBy)
  ) {
    return {
      ready: true,
      step: `You have knocked at the door of the ${door}. You are sending ${task.askedBy}, who called you, a PDA message to say you are there.`,
      act: {
        tool: 'message',
        person: task.askedBy,
        // The door it is at is named first: that is the one whoever reads it goes to.
        text: `I am at the ${which}door of the ${door} about the mess${within ? ` in the ${place}` : ''}. C${ASKING_IN.slice(1)}, please?`,
      },
    };
  }
  const caller =
    brain.peopleInView.find((person) => person.name === task.askedBy) ??
    // A technician: the doors of the department are theirs to open, not the Quartermaster's.
    brain.peopleInView.find((person) => isTechnician(person.job));
  if (!asks.said && caller) {
    return {
      ready: true,
      step: `${caller.name} called you to clean up a mess in the ${place}${within}, which is locked to you. You are standing at the door of the ${door}, and ${caller.name} is in sight: in "say", ask ${caller.name} outright to let you in.`,
      say: `${caller.name.split(' ')[0]}, I am at the ${which}door${within || which ? ` of the ${door}` : ''} about the mess in the ${place}. C${ASKING_IN.slice(1)}, please?`,
      needs: new RegExp(`\\b${caller.name.split(' ')[0]}\\b`, 'i'),
      // The words take a few seconds to find. If the door has been opened for it meanwhile, asking
      // for it would only get it opened a second time. Only this door counts: one held to let it
      // out of the room behind it, or the door of some other room, is no way in (BRAIN-03).
      sayIf: () =>
        !(brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door),
    };
  }
  // Nobody came for the caller's word. Someone else who could open it is written to.
  const next = nextToAsk(brain, task, door);
  if (next) {
    return {
      ready: true,
      step: `Nobody has let you into the ${door}. You are sending ${next.name} (${next.job}) a PDA message to ask to be let in.`,
      act: {
        tool: 'message',
        person: next.name,
        text: `I am at the ${which}door of the ${door} about the mess${within ? ` in the ${place}` : ''}. C${ASKING_IN.slice(1)}, please?`,
      },
    };
  }
  if (brain.now - asks.at < LET_IN_WAIT_DS) {
    return {
      ready: false,
      wait: true,
      asked: true,
      step: `You have knocked and asked to be let into the ${door}, and are waiting by the door.`,
    };
  }
  return {
    ready: false,
    step: `Nobody has let you into the ${door}. You will ask again when someone who works there turns up.`,
  };
}

/**
 * What the door the body is standing at is called, as words to go before "door": "Quartermaster
 * Maintenance " or "Cargo Lobby ". Empty if it is at no door of this room, or the door has no name
 * of its own to go by. See `doorNamed`, which reads it back out of what was said.
 */
export function doorCalled(brain: NpcBrain, room: string): string {
  const label = brain.atDoorOf === room ? brain.atDoorLabel : null;
  return label && label.toLowerCase() !== room.toLowerCase() ? `${label} ` : '';
}

/** The door someone says they are at, by what it is called, or undefined if they did not say: "I am at the Deliveries door of the Cargo Bay". */
export function doorNamed(text: string): string | undefined {
  return text
    .match(/\bat the ((?:(?! of )[^.,!?])+?) door\b/i)?.[1]
    ?.trim();
}

/** TRUE once the body has done all it can to be let in: knocked, and sent word if there is anyone to send it to. */
function hasAsked(
  brain: NpcBrain,
  task: Task,
  asks: NpcBrain['letInAsks'][string],
): boolean {
  const door = task.place ? doorFor(brain, task.place) : '';
  return (
    !!asks.knocked &&
    (!!asks.messaged ||
      !task.askedBy ||
      !brain.hasPda ||
      wroteAbout(brain, door).includes(task.askedBy)) &&
    !nextToAsk(brain, task, door)
  );
}

/** The most of the caller's workmates a janitor writes to about one door, after the caller. */
const WORKMATES_WRITTEN_TO = 2;

/**
 * Whom each janitor has written to about each door it waits at, by the room the door is of. Kept
 * beside the brain, as the notes on water are. It wrote only to whoever called it, eight times in
 * thirteen minutes while that technician was in cuffs, and never to the other one (LOGB-06).
 */
const wroteNotes = new WeakMap<NpcBrain, Map<string, string[]>>();

/** Whom this janitor has written to about the door of this room. */
function wroteAbout(brain: NpcBrain, door: string): string[] {
  let notes = wroteNotes.get(brain);
  if (!notes) {
    notes = new Map();
    wroteNotes.set(brain, notes);
  }
  let wrote = notes.get(door);
  if (!wrote) {
    wrote = [];
    notes.set(door, wrote);
  }
  return wrote;
}

/** Forgets whom it wrote to about the door of this room: the call it wrote for is over. */
function forgetWrote(brain: NpcBrain, door: string): void {
  wroteNotes.get(brain)?.delete(door);
}

/**
 * Who to write to next about the door it waits at, once word to whoever called it has brought
 * nobody: one of the caller's workmates it has a PDA contact for (their doors are theirs to open),
 * then the head of the caller's department. Each once. Null while the last word is still being
 * waited on, or with nobody left.
 */
function nextToAsk(
  brain: NpcBrain,
  task: Task,
  door: string,
): { name: string; job: string } | null {
  const asks = brain.letInAsks[door];
  const wrote = wroteAbout(brain, door);
  if (
    !brain.hasPda ||
    !task.askedBy ||
    !asks?.knocked ||
    !wrote.includes(task.askedBy) ||
    brain.now - asks.at < LET_IN_WAIT_DS ||
    brain.doorHeld
  ) {
    return null;
  }
  const callerJob = jobOf(brain, task.askedBy);
  if (!callerJob) {
    return null;
  }
  const others = brain.pdaPeople.filter(
    (person) => person.name !== brain.name && person.name !== task.askedBy,
  );
  const workmates = others.filter(
    (person) => person.job.toLowerCase() === callerJob.toLowerCase(),
  );
  const workmate = workmates.find((person) => !wrote.includes(person.name));
  if (
    workmate &&
    workmates.filter((person) => wrote.includes(person.name)).length <
      WORKMATES_WRITTEN_TO
  ) {
    return workmate;
  }
  const headJob = headOf(callerJob);
  const head = headJob
    ? others.find((person) =>
        person.job.toLowerCase().includes(headJob.toLowerCase()),
      )
    : undefined;
  return head && !wrote.includes(head.name) ? head : null;
}

/** Notes one of the things the body has done to be let into a room, and when. */
function noteAsked(
  brain: NpcBrain,
  place: string,
  what: 'knocked' | 'messaged' | 'said',
): void {
  const asks = brain.letInAsks[place] ?? { at: brain.now, count: 0 };
  asks[what] = true;
  asks.at = brain.now;
  asks.count++;
  brain.letInAsks[place] = asks;
}

function describeTask(task: Task): string | null {
  if (task.kind === SUPPLIES) {
    return 'get something to clean with';
  }
  return task.kind === CLEAN ? `clean up the mess in ${task.place}` : null;
}

export const JANITOR: Job = {
  is: isJanitor,
  keepsPost: false,
  cleans: true,
  about: () => ABOUT,
  // With nothing to clean with, or nothing but a rag, and nowhere it knows of to get better,
  // that is what it is short of. Not once what it asked for has come and is only waiting for it.
  needs: (brain) =>
    lacksTool(brain) && !knownSupply(brain) && !suppliesWaiting(brain)
      ? brain.poorTool
        ? NEED_BETTER
        : NEED
      : null,
  whenAsked: () => [
    'If they tell you of a mess somewhere, tell them you will see to it.',
  ],
  cues,
  syncTasks,
  plan,
  describeTask,
  // What the mess is, as far as it remembers. Blood on the floor of the Bar is not dust in a tunnel.
  weighs: (brain, task) => {
    const seen =
      task.kind === CLEAN && task.place
        ? brain.places.get(task.place)?.things
        : undefined;
    const messes = [...(seen?.entries() ?? [])]
      .filter(([, thing]) => thing.kind === 'mess')
      .map(([name]) => name);
    return messes.length > 0 ? `What you saw there: ${messes.join(', ')}.` : null;
  },
  // A cleaner grenade is only ever for a spot with a lot of mess close together. The body knows
  // when it is standing by one, and that is the moment to use it.
  reflex: (brain) =>
    brain.grenadeMesses > 0 && !brain.doing
      ? {
          act: { tool: 'grenade' },
          text: `There are ${brain.grenadeMesses} messes close together here, which is what your cleaner grenade is for. You are throwing it.`,
        }
      : null,
  // Told of a mess, a janitor takes it on.
  takes: { [CLEAN]: A_MESS },
  soundsLike: { [CLEAN]: MESS_WORDS },
  // A message that names a mess and a room it knows is a call to come and clean: that goes on its
  // list as something someone is waiting on. Only its head's fixed line (HAS_COME) says the
  // supplies are in; anything else changes nothing here.
  readsMessage: (brain, from, text, at, job) => {
    const heard = text.toLowerCase();
    // Word that a mess is beyond whoever sent it names a mess and a room, and is not a call.
    if (beyondRoom(text)) {
      return;
    }
    if (MESS_WORDS.test(heard)) {
      // Cargo calls janitors to rooms the janitors may never have set foot in, so the room is
      // taken from the message itself, and the way in is by asking at the lobby.
      const fromCargo = isCargo(job);
      // The room is the one the mess is said to be in. A message can name other rooms as well
      // ("come to the Cargo Lobby and I will let you in"), and those are not it.
      const said = text.match(/mess in (?:the )?([^:.,]+)/i)?.[1]?.trim();
      const known = placeNamedIn(brain, (said ?? heard).toLowerCase());
      const named = known ?? (fromCargo ? said : undefined);
      // A call that says the mess wants soap or a wet mop, and to come if it has one. With
      // neither it would walk the length of the station to find that out at the door, as two did
      // in turn. It sends back that it cannot, and stays where it is.
      // So does a call that names only the kinds of mess that want scrubbing: a cobweb, rubble.
      // Called to "pool of oil and cobweb" with a space cleaner, it comes, for the oil. Called to
      // a cobweb alone, it would be let in and say at once that it could not shift it.
      const kinds = kindsCalled(text);
      const scrubOnly =
        ONLY_IF_WORDS.test(text) ||
        (kinds.length > 0 && kinds.every((kind) => SCRUB_KINDS.test(kind)));
      // It may have soap or a rag put away, or know where there is some: then it takes the call
      // and gets that first, putting its mop and bucket back if its hands are full of them.
      const within = !!scrubberToHand(brain);
      if (named && from && scrubOnly && !canScrub(brain) && !within) {
        brain.toTell.push({
          to: from,
          line: `I have no soap or rag, so I cannot shift the mess in the ${named}.`,
          why: `${from} has called you to a mess in the ${named} that needs scrubbing with soap or a rag. You have neither, so you are sending ${from} a PDA message to say you cannot shift it, and staying where you are.`,
          byPda: true,
          at: Date.now(),
        });
        declinedCalls(brain).set(named.toLowerCase(), { by: from, at: brain.now });
        return;
      }
      if (named) {
        const task =
          known === named && !fromCargo
            ? takeToldWork(brain, A_MESS, named, from || undefined)
            : named === brain.location && !findTask(brain, CLEAN, { place: named })
              ? null
              : addTask(brain, {
                  kind: CLEAN,
                  place: named,
                  urgency: 'asked',
                  source: 'told',
                  askedBy: from || undefined,
                });
        if (task && fromCargo && named !== CARGO_LOBBY) {
          task.via = CARGO_LOBBY;
        }
        if (task) {
          task.wantsScrub = scrubOnly;
        }
        return;
      }
    }
    // Word back about a door it is waiting at: someone is coming, or it is not being let in.
    if (/\bdoor\b|let you (in|out)|sent for you/i.test(text)) {
      for (const [place, asks] of Object.entries(brain.letInAsks)) {
        if (!heard.includes(place.toLowerCase())) {
          continue;
        }
        if (REFUSED_WORDS.test(text)) {
          // Told no. That mess is not its to get to, and it does not stand at the door for it.
          // Nor any mess further in that it was asking at this door on the way to.
          brain.tasks = brain.tasks.filter(
            (task) =>
              !(
                task.kind === CLEAN &&
                !!task.place &&
                !!task.via &&
                (task.place === place || doorFor(brain, task.place) === place)
              ),
          );
          delete brain.letInAsks[place];
        } else {
          // Someone is on the way. It waits by the door a while longer.
          asks.at = at;
        }
      }
      return;
    }
    // Word that what it asked for has come, and where it is. Only its head's fixed line says so;
    // any other message (a thank-you, a mess in a room it does not know) is no such word.
    if (!heard.includes(HAS_COME)) {
      return;
    }
    const where = heard
      .split(HAS_COME)[1]
      ?.match(/it is in (?:the )?(.+)/)?.[1];
    brain.suppliesSentAt = at;
    brain.suppliesAt =
      (where ? placeNamedIn(brain, where) : undefined) ??
      placeNamedIn(brain, heard) ??
      CARGO_LOBBY;
    brain.toldHeadAt = null;
  },
  // Someone who works behind a door it is waiting at has turned up: the one reason to ask again.
  meets: (brain, _name, job) => {
    if (!isCargo(job)) {
      return;
    }
    for (const [place, asks] of Object.entries(brain.letInAsks)) {
      if (brain.now - asks.at > ASK_AGAIN_AFTER_DS) {
        delete brain.letInAsks[place];
      }
    }
  },
  // What it has done to be let into a locked room, each thing once.
  afterActing: (brain, act, task, ok, _looped, details) => {
    // The soap or rag it meant to scrub with was not to be had after all: someone has taken it.
    // The mess is then one to go to with what it has, like any other, and it says what is left.
    if (
      task?.kind === CLEAN &&
      task.wantsScrub &&
      act.tool === 'pick_up' &&
      !ok &&
      /soap|\brag$/i.test(String(act.item ?? ''))
    ) {
      task.wantsScrub = false;
      puttingBack.delete(task.id);
    }
    // A bucket it could not pick up, its hands full of what it needs most often: it sets off for
    // the mess without one rather than try again before it goes (DESK-10).
    if (
      task?.kind === CLEAN &&
      act.tool === 'pick_up' &&
      !ok &&
      /^bucket$/i.test(String(act.item ?? ''))
    ) {
      task.noBucket = true;
    }
    // Having cleaned something in a room, what it says of that room afterwards allows for it.
    if (act.tool === 'clean' && ok) {
      const here = findTask(brain, CLEAN, { place: brain.location });
      if (here) {
        here.cleanedSome = true;
      }
    }
    // What was left was what it could not get to (HAND-02), or it was not.
    if (act.tool === 'clean') {
      const here = findTask(brain, CLEAN, { place: brain.location });
      if (here && details?.unreached) {
        unreachedLeft.add(here.id);
      } else if (here) {
        unreachedLeft.delete(here.id);
      }
    }
    if (task?.kind !== CLEAN || !task.place || !task.via) {
      return;
    }
    // What it has asked is kept by the door it asked at, which for a room inside another is the
    // outer one's until it is through it.
    const door = doorFor(brain, task.place);
    // A knock that did not land is not a knock. It is tried again once it is back at the door.
    if (act.tool === 'knock' && ok) {
      noteAsked(brain, door, 'knocked');
    }
    if (act.tool === 'message') {
      noteAsked(brain, door, 'messaged');
      const to = String(act.person ?? '');
      const wrote = wroteAbout(brain, door);
      if (to && !wrote.includes(to)) {
        wrote.push(to);
      }
    }
  },
  // Whoever told it of a mess hears that the mess is gone, which is true whoever cleaned it.
  sayDone: (task) =>
    task.kind === CLEAN ? `the mess in the ${task.place} is cleaned up` : null,
  // Having asked cargo for supplies, it waits to hear. Only that line counts: anything else said
  // at the counter, a greeting or an answer, is not asking.
  afterSaying: (brain, called) => {
    // Likewise, having asked out loud to be let in somewhere, it waits by the door.
    if (called?.toLowerCase().includes(ASKING_IN)) {
      for (const task of brain.tasks) {
        if (
          task.kind === CLEAN &&
          task.state !== 'done' &&
          task.place &&
          brain.atDoorOf === doorFor(brain, task.place)
        ) {
          noteAsked(brain, doorFor(brain, task.place), 'said');
        }
      }
    }
  },
};
