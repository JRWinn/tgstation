/**
 * The janitor: keeps the station clean, and has to find something to clean with before it can.
 *
 * How the work is done is decided here, in code: where the supplies are, which tool to take,
 * wetting a mop. The LLM is asked to speak: to answer people, to take note of a mess it is told
 * of, and to ask cargo for supplies when the code says it is time to. And with several messes it
 * could go to, it is asked which comes first (see choice.ts).
 */
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
function doorFor(brain: NpcBrain, place: string): string {
  let door = place;
  // Followed outwards, room by room. No station nests them more than a few deep.
  for (let depth = 0; depth < 4; depth++) {
    const outer = brain.reachedThrough[door];
    if (!outer || outer === brain.location) {
      break;
    }
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
export const NEEDS_SCRUBBING = 'it needs soap or a wet mop';
/** The words of a call that asks a janitor to come only if it has that. */
const ONLY_IF_WORDS = /needs soap or a wet mop\b.*\bif you have one\b/is;

/** TRUE if what this janitor holds is soap or a mop: what a mess that will not wash off is scrubbed with. */
function canScrub(brain: NpcBrain): boolean {
  return brain.dryMop || /soap|mop/i.test(brain.cleaningTool ?? '');
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
/** The words that mark what someone says or writes as telling of a mess. */
const MESS_WORDS =
  /\b(mess|messy|blood|bloody|vomit|threw up|thrown up|puke|spill|spilled|spilt|oil|dirt|dirty|filth|filthy|stain|grime|ash|ashes)\b/;

/** What a janitor is told about its job, every time. The work itself needs no telling: the body does it. */
const ABOUT =
  'Your job is keeping the station clean. Your body does that work by itself: it finds something to clean with, goes to the messes it knows of, and cleans them.';

/** TRUE if this janitor is short of something to clean with: it has nothing, or nothing but a rag. */
function lacksTool(brain: NpcBrain): boolean {
  return !brain.cleaningTool || brain.poorTool;
}

/** The cleaning gear it knows the whereabouts of that would be worth going for: anything, or with a rag in hand, anything better. */
function knownSupply(brain: NpcBrain): string | undefined {
  const worthHaving = brain.poorTool ? PROPER_SUPPLY : CLEANING_SUPPLY;
  return allKnownItems(brain).find((item) => worthHaving.test(item));
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

/**
 * Works out the next step for a janitor with nothing to clean with. This is the whole of how a
 * janitor equips itself, in the order a person would try things: use what it knows of, look where
 * the gear is kept, and only then go and ask cargo.
 */
function supplyStep(brain: NpcBrain): Plan {
  // A dry mop is a tool once it is wet.
  if (brain.dryMop) {
    const sinkRoom = [...brain.places.entries()].find(
      ([name, place]) =>
        name !== brain.location &&
        [...place.things.keys()].some((thing) => /sink/i.test(thing)),
    )?.[0];
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
      ? `There is a mess here that your ${brain.cleaningTool} will not shift. It needs soap or a wet mop.`
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
  for (const task of brain.tasks) {
    if (task.kind !== CLEAN || task.state === 'done' || !task.place) {
      continue;
    }
    const beyondIt =
      !!brain.cleaningTool &&
      messy.has(task.place) &&
      !workable.has(task.place);
    // Called to a mess that what it holds will not shift, it sends word to whoever called it,
    // once. They are waiting on it, and someone with soap or a mop can be sent for instead.
    // Only from in the room, where it has tried: a room it cannot get into is another matter.
    // And not in the middle of scrubbing: what is left is only known once it has stopped.
    if (
      beyondIt &&
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
        line: task.cleanedSome
          ? `I have done what I can in the ${task.place}. The rest needs soap or a wet mop.`
          : `I cannot shift the mess in the ${task.place} with my ${brain.cleaningTool}. It needs soap or a wet mop.`,
        why: task.cleanedSome
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
    blockTask(task, noWayIn ? NO_WAY_IN : beyondIt ? BEYOND : null);
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
  task.urgency =
    brain.poorTool && (!!knownSupply(brain) || suppliesWaiting(brain))
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
  if (!brain.cleaningTool) {
    return { ready: false, step: 'You need something to clean with first.' };
  }
  const toldBy = task.askedBy ? ` (${task.askedBy} told you of it)` : '';
  // A dry mop with a sink in sight: wetting it comes before anything, wherever the mess is.
  if (brain.mopNeedsWater) {
    return {
      ready: true,
      step:
        task.place === brain.location
          ? `Your mop is dry and there is a sink here. You are wetting it, and then cleaning up the mess here in ${task.place}${toldBy}.`
          : `Your mop is dry and there is a sink right here. You are wetting it before you set off for the mess in ${task.place}${toldBy}.`,
      act: { tool: 'clean' },
    };
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
  if (!asks?.knocked) {
    return {
      ready: true,
      step: `You are at the door of the ${door}, which is locked to you. You are knocking, for whoever is inside.`,
      act: { tool: 'knock' },
    };
  }
  if (!asks.messaged && task.askedBy && brain.hasPda) {
    return {
      ready: true,
      step: `You have knocked at the door of the ${door}. You are sending ${task.askedBy}, who called you, a PDA message to say you are there.`,
      act: {
        tool: 'message',
        person: task.askedBy,
        // The door it is at is named first: that is the one whoever reads it goes to.
        text: `I am at the door of the ${door} about the mess${within ? ` in the ${place}` : ''}. C${ASKING_IN.slice(1)}, please?`,
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
      say: `${caller.name.split(' ')[0]}, I am at the door${within ? ` of the ${door}` : ''} about the mess in the ${place}. C${ASKING_IN.slice(1)}, please?`,
      needs: new RegExp(`\\b${caller.name.split(' ')[0]}\\b`, 'i'),
      // The words take a few seconds to find. If the door has been opened for it meanwhile, asking
      // for it would only get it opened a second time.
      sayIf: () => !brain.doorHeld,
    };
  }
  if (brain.now - asks.at < LET_IN_WAIT_DS) {
    return {
      ready: false,
      wait: true,
      step: `You have knocked and asked to be let into the ${door}, and are waiting by the door.`,
    };
  }
  return {
    ready: false,
    step: `Nobody has let you into the ${door}. You will ask again when someone who works there turns up.`,
  };
}

/** TRUE once the body has done all it can to be let in: knocked, and sent word if there is anyone to send it to. */
function hasAsked(
  brain: NpcBrain,
  task: Task,
  asks: NpcBrain['letInAsks'][string],
): boolean {
  return !!asks.knocked && (!!asks.messaged || !task.askedBy || !brain.hasPda);
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
  // list as something someone is waiting on. Any other message is, most likely, cargo saying the
  // supplies are in.
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
      if (named && from && ONLY_IF_WORDS.test(text) && !canScrub(brain)) {
        brain.toTell.push({
          to: from,
          line: `I have no soap or wet mop either, so I cannot shift the mess in the ${named}.`,
          why: `${from} has called you to a mess in the ${named} that needs soap or a wet mop. You have neither, so you are sending ${from} a PDA message to say you cannot shift it, and staying where you are.`,
          byPda: true,
          at: Date.now(),
        });
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
    // Word that what it asked for has come, and where it is.
    brain.suppliesSentAt = at;
    brain.suppliesAt = placeNamedIn(brain, heard) ?? CARGO_LOBBY;
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
  afterActing: (brain, act, task, ok) => {
    // Having cleaned something in a room, what it says of that room afterwards allows for it.
    if (act.tool === 'clean' && ok) {
      const here = findTask(brain, CLEAN, { place: brain.location });
      if (here) {
        here.cleanedSome = true;
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
