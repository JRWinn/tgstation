/**
 * The janitor: keeps the station clean, and has to find something to clean with before it can.
 *
 * All of the work is decided here, in code: where the supplies are, which tool to take, wetting a
 * mop, which mess comes next. The LLM is only asked to speak: to answer people, to take note of a
 * mess it is told of, and to ask cargo for supplies when the code says it is time to.
 */
import { allKnownItems, CARGO_LOBBY, knowsPlace } from '../memory';
import {
  addTask,
  blockTask,
  findTask,
  finishTask,
  placeNamedIn,
  takeToldWork,
} from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';
import { isCargo } from './cargo';
import type { Job } from './job';

/** The kinds of task a janitor has: a mess to clean, and getting something to clean it with. */
const CLEAN = 'clean';
const SUPPLIES = 'supplies';

/** TRUE if this job title is one whose work is cleaning. */
export function isJanitor(title: string): boolean {
  return /janitor|custodian/i.test(title);
}

/** Items that will clean, by name. A cleaner grenade is not one: it is only for a big mess. */
const CLEANING_SUPPLY = /soap|space cleaner|mop$/i;

/** How long (deciseconds) a janitor waits at the cargo counter for someone to turn up. */
const WAIT_AT_COUNTER_DS = 600;
/** How long (deciseconds) a janitor waits on cargo before it asks again. */
const ASK_AGAIN_DS = 2400;
/** How long (deciseconds) a PDA message saying supplies are waiting is acted on. */
const SUPPLIES_WAIT_DS = 6000;
/** How long (deciseconds) a janitor must be in a room it was told is messy before it can say it saw no mess. */
const LOOK_ABOUT_DS = 50;

/**
 * Why a mess task cannot go on: what is left there is beyond what the janitor holds, would not
 * come off, or is somewhere the body could not get to. The body knows which; this only says so.
 */
const BEYOND = 'what is left there cannot be got at, or is beyond what you are holding';
/** The plain words a janitor asks cargo for supplies in, by which that line is known afterwards. */
const ASKING_CARGO = 'could you order me a crate of janitorial supplies';
/** The plain words a janitor asks to be let into a locked room in, by which that line is known afterwards. */
const ASKING_IN = 'could you let me in';
/** How long (deciseconds) it waits at the door after asking to be let in, and how many times it asks. */
const LET_IN_WAIT_DS = 400;
const LET_IN_ASKS = 2;
/** How long (deciseconds) after nobody let it in before it comes back to try again. */
const LET_IN_RETRY_DS = 3000;
/** What a mess task is waiting on when nobody came to let the body in. */
const NOT_LET_IN = 'nobody let you in, and you will come back and ask again later';
/** What a mess task is waiting on when the body could not get into the room. */
const NO_WAY_IN = 'you could not find a way in, and will try again later';
/** What the LLM is given for the work a janitor takes on when told of it. */
const A_MESS = 'a mess that needs cleaning';
/** The words that mark what someone says or writes as telling of a mess. */
const MESS_WORDS =
  /\b(mess|messy|blood|bloody|vomit|threw up|thrown up|puke|spill|spilled|spilt|oil|dirt|dirty|filth|filthy|stain|grime|ash|ashes)\b/;

/** What a janitor is told about its job. The work itself needs no telling: the body does it. */
const RULES = [
  'Your job is keeping the station clean. Your body does that work by itself: it finds something to clean with, goes to the messes it knows of, and cleans them. Each report says what it is doing.',
  'When someone tells you about a mess somewhere, tell them you will see to it and put it in "work", with the room it is in.',
  'When a report tells you to ask someone for something, ask them: by name, outright, as a question.',
  'Other janitors have no supplies to spare. Do not ask them for theirs.',
];

/** The name of someone in view who works in cargo, and so can be asked for supplies, if there is one. */
function cargoStaffInView(brain: NpcBrain): string | null {
  return brain.peopleInView.find((person) => isCargo(person.job))?.name ?? null;
}

/** TRUE if this janitor has nothing to clean with and has not yet looked up where the supplies are. */
function mustFindSupplies(brain: NpcBrain): boolean {
  return !brain.cleaningTool && brain.hasLocator && !brain.locatorUsed;
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
  const supply = allKnownItems(brain).find((item) =>
    CLEANING_SUPPLY.test(item),
  );
  if (supply) {
    return {
      ready: true,
      step: `You have nothing to clean with, but you know where there is ${supply}, and you are going to get it.`,
      act: { tool: 'pick_up', item: supply },
    };
  }
  // Told by PDA that supplies are waiting, that is where to go, and the crate is what to look in.
  if (
    brain.suppliesSentAt !== null &&
    brain.now - brain.suppliesSentAt < SUPPLIES_WAIT_DS
  ) {
    if (brain.location !== CARGO_LOBBY && knowsPlace(brain, CARGO_LOBBY)) {
      return {
        ready: true,
        step: 'You have nothing to clean with, but your PDA says the supplies you asked for are waiting in the Cargo Lobby. You are going there to look in the crate.',
        act: { tool: 'go_to', place: CARGO_LOBBY },
      };
    }
    if (brain.location === CARGO_LOBBY && brain.storageHere > 0) {
      return {
        ready: true,
        step: 'You have nothing to clean with, but the supplies you asked for are in a crate in this room. You are looking through it.',
        act: { tool: 'search' },
      };
    }
  }
  if (mustFindSupplies(brain)) {
    return {
      ready: true,
      step: 'You have nothing to clean with and do not know where the cleaning supplies are kept. You are checking the custodial locator on your PDA.',
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
      step: 'You have nothing to clean with. This is where the cleaning gear is kept, and you are looking through the storage for some.',
      act: { tool: 'search' },
    };
  }
  if (unsearched.length > 0) {
    return {
      ready: true,
      step: `You have nothing to clean with. Your locator showed the cleaning gear is kept in ${unsearched[0]}, and you are going there to get some.`,
      act: { tool: 'go_to', place: unsearched[0] },
    };
  }
  if (!knowsPlace(brain, CARGO_LOBBY)) {
    return {
      ready: true,
      step: 'You have nothing to clean with and have not found any yet. You are looking round the station for some.',
      act: { tool: 'explore' },
    };
  }
  if (brain.askedCargo) {
    return {
      ready: false,
      step: 'You have nothing to clean with, and you have asked cargo for supplies. Your PDA will tell you when they arrive.',
    };
  }
  if (brain.location !== CARGO_LOBBY) {
    return {
      ready: true,
      step: 'You have nothing to clean with and have found nothing where the supplies are kept. You are going to the Cargo Lobby to ask the cargo technician for some.',
      act: { tool: 'go_to', place: CARGO_LOBBY },
    };
  }
  // Supplies ordered for the janitors are left in the lobby, so anything unopened there comes first.
  if (brain.storageHere > 0) {
    return {
      ready: true,
      step: 'You have nothing to clean with. Supplies ordered for the janitors are left in this room, and you are looking through the storage here before you ask for more.',
      act: { tool: 'search' },
    };
  }
  const technician = cargoStaffInView(brain);
  if (!technician) {
    // Nobody at the counter. It waits a while, and then comes back later as if it had asked.
    if (brain.now - brain.inPlaceSince > WAIT_AT_COUNTER_DS) {
      brain.askedCargo = true;
      brain.askedCargoAt = brain.now;
      return {
        ready: false,
        step: 'You have nothing to clean with, and nobody from cargo came to the counter. You will try again later.',
      };
    }
    return {
      ready: false,
      wait: true,
      step: 'You have nothing to clean with. You are in the Cargo Lobby, waiting at the counter for someone from cargo to ask.',
    };
  }
  return {
    ready: true,
    step: `You have nothing to clean with. ${technician}, who works in cargo, is here: in "say", ask ${technician} outright, as a question, to order you a crate of janitorial supplies.`,
    say: `${technician.split(' ')[0]}, ${ASKING_CARGO}, please?`,
  };
}

/** What the LLM should know about the mess in front of the janitor, so that what it says is true. */
function cues(brain: NpcBrain): string[] {
  const messes = brain.thingsInView.filter((thing) => thing.kind === 'mess');
  if (messes.length === 0) {
    return [];
  }
  if (brain.cleanableMesses.length > 0 && brain.cleaningTool) {
    return [
      `There is a mess here (${brain.cleanableMesses.join(', ')}), and it is yours to clean with your ${brain.cleaningTool}.`,
    ];
  }
  return [
    brain.cleaningTool
      ? `There is a mess here that your ${brain.cleaningTool} will not shift. It needs soap or a wet mop.`
      : 'There is a mess here, but you have nothing to clean it with yet.',
  ];
}

/**
 * Keeps the janitor's tasks true to what it has seen: a mess task for every room it remembers a
 * mess in, closed when it stands in the room and sees none, and a task to get something to clean
 * with for as long as it has nothing.
 */
function syncTasks(brain: NpcBrain): void {
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
    // A room it could not get into is left alone until the body is ready to try the way again.
    const noWayIn =
      task.place !== brain.location && brain.blockedPlaces.includes(task.place);
    // A room it has been called to and has to be let into is another matter: the way in is to go
    // and ask. It is only left alone once it has asked and nobody came.
    if (task.via && task.place !== task.via && task.place !== brain.location) {
      const asks = brain.letInAsks[task.place];
      if (asks && brain.now - asks.at >= LET_IN_RETRY_DS) {
        delete brain.letInAsks[task.place];
      }
      const givenUp =
        !!asks &&
        asks.count >= LET_IN_ASKS &&
        brain.now - asks.at > LET_IN_WAIT_DS &&
        brain.now - asks.at < LET_IN_RETRY_DS &&
        !brain.doorHeld;
      blockTask(task, givenUp ? NOT_LET_IN : null);
      continue;
    }
    blockTask(task, noWayIn ? NO_WAY_IN : beyondIt ? BEYOND : null);
    task.blockedWith = beyondIt ? brain.cleaningTool : undefined;
  }
  // Having asked cargo and heard nothing in a good while, it is time to ask again.
  if (brain.askedCargo && brain.now - brain.askedCargoAt > ASK_AGAIN_DS) {
    brain.askedCargo = false;
  }

  const supplies = findTask(brain, SUPPLIES);
  if (brain.cleaningTool) {
    if (supplies) {
      finishTask(brain, supplies);
    }
    return;
  }
  blockTask(
    supplies ??
      addTask(brain, { kind: SUPPLIES, urgency: 'routine', source: 'own' }),
    brain.askedCargo
      ? 'you have asked cargo, and your PDA will tell you when the supplies come'
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
 * it to: it goes to where they serve the crew, asks to be let in, and waits at the door. Once the
 * door is held for it, it goes through.
 */
function letInStep(
  brain: NpcBrain,
  task: Task,
  place: string,
  via: string,
): Plan {
  if (brain.doorHeld) {
    return {
      ready: true,
      step: `The door into the ${place} is being held open for you, and you are going through to clean up the mess there.`,
      act: { tool: 'go_to', place },
    };
  }
  if (brain.location !== via) {
    return knowsPlace(brain, via)
      ? {
          ready: true,
          step: `${task.askedBy ?? 'Someone'} called you to a mess in the ${place}, which is locked to you. You are going to the ${via} to be let in.`,
          act: { tool: 'go_to', place: via },
        }
      : { ready: false, step: 'You do not know the way there.' };
  }
  const asks = brain.letInAsks[place];
  if (asks && brain.now - asks.at < LET_IN_WAIT_DS) {
    return {
      ready: false,
      wait: true,
      step: `You have asked to be let into the ${place}, and are waiting by the door.`,
    };
  }
  if (asks && asks.count >= LET_IN_ASKS) {
    return { ready: false, step: `Nobody has let you into the ${place}.` };
  }
  const caller =
    brain.peopleInView.find((person) => person.name === task.askedBy) ??
    brain.peopleInView.find((person) => isCargo(person.job));
  if (!caller) {
    // Nobody to ask. It waits a while, and then gets on with other work and comes back later.
    if (brain.now - brain.inPlaceSince > WAIT_AT_COUNTER_DS) {
      brain.letInAsks[place] = { at: brain.now, count: LET_IN_ASKS };
    }
    return {
      ready: false,
      wait: true,
      step: `You are waiting in the ${via} for someone to let you into the ${place}.`,
    };
  }
  return {
    ready: true,
    step: `${caller.name} called you to clean up a mess in the ${place}, which is locked to you. ${caller.name} is here: in "say", ask ${caller.name} outright to let you in.`,
    say: `${caller.name.split(' ')[0]}, I am here about the mess in the ${place}. C${ASKING_IN.slice(1)}, please?`,
  };
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
  rules: () => RULES,
  cues,
  syncTasks,
  plan,
  describeTask,
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
    if (MESS_WORDS.test(heard)) {
      // Cargo calls janitors to rooms the janitors may never have set foot in, so the room is
      // taken from the message itself, and the way in is by asking at the lobby.
      const fromCargo = isCargo(job);
      // The room is the one the mess is said to be in. A message can name other rooms as well
      // ("come to the Cargo Lobby and I will let you in"), and those are not it.
      const said = text.match(/mess in (?:the )?([^:.,]+)/i)?.[1]?.trim();
      const known = placeNamedIn(brain, (said ?? heard).toLowerCase());
      const named = known ?? (fromCargo ? said : undefined);
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
    brain.askedCargo = false;
    brain.suppliesSentAt = at;
  },
  // Whoever told it of a mess hears that the mess is gone, which is true whoever cleaned it.
  sayDone: (task) =>
    task.kind === CLEAN ? `the mess in the ${task.place} is cleaned up` : null,
  // Having asked cargo for supplies, it waits to hear. Only that line counts: anything else said
  // at the counter, a greeting or an answer, is not asking.
  afterSaying: (brain, called) => {
    if (called?.includes(ASKING_CARGO)) {
      brain.askedCargo = true;
      brain.askedCargoAt = brain.now;
    }
    // Likewise, having asked to be let in somewhere, it waits by the door.
    if (called?.toLowerCase().includes(ASKING_IN)) {
      for (const task of brain.tasks) {
        if (
          task.kind === CLEAN &&
          task.state !== 'done' &&
          task.via === brain.location &&
          task.place
        ) {
          brain.letInAsks[task.place] = {
            at: brain.now,
            count: (brain.letInAsks[task.place]?.count ?? 0) + 1,
          };
        }
      }
    }
  },
};
