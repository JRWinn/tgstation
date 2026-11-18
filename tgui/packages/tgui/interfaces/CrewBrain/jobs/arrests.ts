/**
 * Serving a warrant: finding someone, arresting them, and putting them in a cell.
 *
 * This is the work of whoever has the warrant in its hands: the security officer, or the Head of
 * Security when there is no officer fit to send. What was declared, and who has been told, is
 * kept by whoever keeps the list (jobs/desk.ts). What is here is the legwork.
 *
 * - Its first job is its kit: a stun baton and a pair of cuffs. The baton is in a locker in the
 *   security gear room, and it goes and gets it.
 * - With a warrant in hand it goes to where they were last seen and looks. With no sighting to
 *   follow, or a stale one, it walks the main hallways.
 * - Seeing them, it walks up and says, word for word: "Pun Pun, you are under arrest, for
 *   trespass. Stand still." Then it puts the cuffs on. Someone who stands for it is not hit.
 * - Someone who will not stand still, or who hits it, gets the baton first, and then the cuffs.
 *   There is nothing harder than the baton, and nothing harder is wanted. Fighting back adds
 *   five minutes.
 * - With the cuffs on it takes them by the arm to an empty cell in the brig, puts them in and
 *   starts the timer. The door opens by itself when the time is up.
 * - Three tries that come to nothing and it leaves them be for a couple of minutes. The warrant
 *   stands.
 * - Hurt, under half its health, it breaks off. It makes no arrest by force again until it is
 *   told to. Someone who stands still for the cuffs it still arrests.
 * - Someone with no warrant on them who attacks it is stopped with the baton, and not arrested.
 * - Told to let someone go, it lets go of them, or opens their cell, whichever it is.
 *
 * How each of those went is noted here as an outcome, for whoever keeps the list. All of it is
 * code. The LLM answers people in its voice.
 */
import { allPlaces, knowsPlace } from '../memory';
import { addTask, findTask, finishTask } from '../tasks';
import type {
  Action,
  BeatWarrant,
  BeatWork,
  NpcBrain,
  PersonInView,
  Plan,
  SecurityOutcome,
  SenseEvent,
  Task,
} from '../types';
import { captainName } from './head';
import { doorCalled } from './janitor';
import {
  ARREST_WORDS,
  addressOf,
  arrestLine,
  freeToGoLine,
  LET_IN_WORDS,
  letInLine,
  MINUTES_MOST,
  MINUTES_RESISTING,
  sameName,
} from './security';

/** Getting its baton and cuffs. */
const KIT = 'security_kit';
/** Finding and arresting someone there is a warrant on. The task's item is their name. */
const SERVE = 'serve_warrant';
/** Letting someone go. The task's item is their name. */
const FREE = 'let_go';
/** Stopping someone with no warrant on them who has attacked it. */
const STOP = 'stop_attacker';
/** Getting out of the reach of someone who is attacking it and whom it cannot stop. */
const AWAY = 'get_away';
/** How long (deciseconds) after it was last hit it keeps getting away. */
const AWAY_DS = 300;

/** How many times it goes for its kit and comes back short before it leaves that a while, and how long (deciseconds) a while is. */
const KIT_TRIES = 3;
const KIT_AGAIN_DS = 3000;
/** How long (deciseconds) having seen someone it has a warrant on keeps it after them: no trip for its kit, and no staff meeting. */
const OWN_SIGHT_DS = 1200;
/** How near (tiles) it stands to someone before it tells them they are under arrest. */
const NEAR = 2;
/** How long (deciseconds) having told someone they are under arrest stands before it is said again. */
const TOLD_STANDS_DS = 450;
/** How many tries at an arrest may come to nothing before they are left be a while, and how long (deciseconds) that is. */
const ARREST_TRIES = 3;
const REST_DS = 1200;
/** How long (deciseconds) a sighting is worth walking to. */
const SIGHTING_STALE_DS = 3000;
/** How long (deciseconds) it looks about a room for someone who was seen there. */
const LOOK_DS = 200;
/** How long (deciseconds) it looks down one hallway before it goes on to the next. */
const HALLWAY_DS = 100;
/** How long (deciseconds) it stays at its post between one walk of the hallways and the next. */
const BETWEEN_WALKS_DS = 900;
/** The health (percent) under which it breaks off and uses no more force. */
const HURT_BELOW = 50;
/** How long (deciseconds) someone who has attacked it is someone to stop. */
const ATTACK_FRESH_DS = 200;
/** How long (deciseconds) it waits for a cell to come empty before it tries the brig again. */
const NO_CELL_WAIT_DS = 300;
/** How many times it tries to let someone go before it gives that up. */
const FREE_TRIES = 3;
/** The room the cells are in, by the name the station knows it by. */
const BRIG = 'Brig';
/** How long (deciseconds) it stands in the brig with a prisoner no cell would take before it tries the cells again. */
const CELL_AGAIN_DS = 900;
/** How long (deciseconds) it goes on asking to be let into one room, and how long it waits on each person it asks. */
const SHUT_OUT_DS = 3000;
const LET_IN_WAIT_DS = 450;
/** How many people it asks to let it into a room before it gives that up. */
const LET_IN_ASKS = 3;

/** What it knows of its own legwork. Made the first time it is asked for. */
export function beatOf(brain: NpcBrain): BeatWork {
  brain.beat ??= {
    warrants: [],
    kitTries: 0,
    kitAt: 0,
    hurt: false,
    attacker: null,
    jailed: {},
    toFree: [],
    outcomes: [],
    words: [],
    round: { next: 0, at: 0 },
  };
  return brain.beat;
}

/** Takes a warrant into its own hands, unless it has it already. */
export function giveWarrant(
  brain: NpcBrain,
  warrant: { name: string; reason: string; minutes: number },
): void {
  const beat = beatOf(brain);
  if (beat.warrants.some((it) => it.name === warrant.name)) {
    return;
  }
  beat.warrants.push({
    name: warrant.name,
    reason: warrant.reason,
    minutes: warrant.minutes,
    lastSeen: null,
    lookedAt: null,
    toldAt: null,
    tries: 0,
    force: false,
    resisted: false,
    restUntil: 0,
  });
}

/** TRUE if it has a warrant in its hands that names someone seen under this name. */
export function isWarrantOn(brain: NpcBrain, seenAs: string): boolean {
  return (
    !!seenAs && !!brain.beat?.warrants.some((it) => sameName(it.name, seenAs))
  );
}

/** TRUE if it has a warrant on this person in its hands. */
export function hasWarrant(brain: NpcBrain, name: string): boolean {
  return !!brain.beat?.warrants.some((it) => it.name === name);
}

/**
 * Gives a warrant up, and lets go of whoever it was on if it has them: by the arm, or in a cell.
 * `pardoned` says the Captain has pardoned them, which is what they are told.
 */
export function dropWarrant(
  brain: NpcBrain,
  name: string,
  pardoned: boolean,
): void {
  const beat = beatOf(brain);
  const had = beat.warrants.some((it) => sameName(name, it.name));
  beat.warrants = beat.warrants.filter((it) => !sameName(name, it.name));
  const holding = brain.security?.holding;
  const inCell = Object.keys(beat.jailed).some((it) => sameName(name, it));
  const cuffed = brain.peopleInView.some(
    (person) => sameName(name, person.name) && person.cuffed,
  );
  if (
    ((holding && sameName(name, holding)) || inCell || (had && cuffed)) &&
    !beat.toFree.some((it) => it.name === name)
  ) {
    beat.toFree.push({ name, pardoned, tries: 0 });
  }
}

/** Notes where someone it has a warrant on was last seen, if that is newer than what it had. */
export function noteSeen(
  brain: NpcBrain,
  name: string,
  place: string,
  at: number,
): void {
  const warrant = beatOf(brain).warrants.find((it) => sameName(name, it.name));
  if (warrant && (!warrant.lastSeen || at > warrant.lastSeen.at)) {
    warrant.lastSeen = { place, at };
  }
}

/** Hands its warrants back: there is an officer to serve them. One whose person it has by the arm it sees through. */
export function handBack(brain: NpcBrain): void {
  const beat = beatOf(brain);
  const holding = brain.security?.holding;
  beat.warrants = beat.warrants.filter(
    (it) => !!holding && sameName(it.name, holding),
  );
}

/** Told to make arrests again after breaking off hurt. */
export function arrestAgain(brain: NpcBrain): void {
  const beat = beatOf(brain);
  beat.hurt = false;
  for (const warrant of beat.warrants) {
    warrant.tries = 0;
    warrant.restUntil = 0;
  }
}

/** Hands over how its warrants have gone since this was last asked. */
export function takeOutcomes(brain: NpcBrain): SecurityOutcome[] {
  const beat = beatOf(brain);
  const outcomes = beat.outcomes;
  beat.outcomes = [];
  return outcomes;
}

/** The names of those it knows to be shut in a cell: ones it put there, and ones it can see there. */
function inCells(brain: NpcBrain): string[] {
  return [
    ...Object.keys(beatOf(brain).jailed),
    ...(brain.security?.cells ?? []).flatMap((cell) =>
      cell.running ? (cell.occupants ?? []) : [],
    ),
  ];
}

/** Whoever a warrant is on, if they are in view and not already in a cell. */
function target(
  brain: NpcBrain,
  warrant: BeatWarrant,
): PersonInView | undefined {
  const shut = inCells(brain);
  return brain.peopleInView.find(
    (person) =>
      sameName(warrant.name, person.name) &&
      person.name !== brain.name &&
      !shut.includes(person.name),
  );
}

/** TRUE if it has this warrant's person by the arm. */
function holds(brain: NpcBrain, warrant: BeatWarrant): boolean {
  const holding = brain.security?.holding;
  return !!holding && sameName(warrant.name, holding);
}

/** The main hallways it walks when it has nobody's whereabouts to go on, in a fixed order. */
function hallways(brain: NpcBrain): string[] {
  return allPlaces(brain)
    .filter((place) => /primary hallway/i.test(place))
    .sort();
}

/** Opens or closes one of its tasks to match whether there is that work to do, and says how pressing it is. */
function keep(
  brain: NpcBrain,
  kind: string,
  wanted: boolean,
  urgency: Task['urgency'],
  item?: string,
): void {
  const task = findTask(brain, kind, { item });
  if (wanted && !task) {
    addTask(brain, { kind, urgency, source: 'own', item });
  } else if (wanted && task) {
    task.urgency = urgency;
  } else if (!wanted && task) {
    finishTask(brain, task);
  }
}

/** TRUE while someone it has a warrant on is in its sight, by the arm, or was seen by it in the last two minutes. */
export function onLead(brain: NpcBrain): boolean {
  return beatOf(brain).warrants.some(
    (warrant) =>
      holds(brain, warrant) ||
      !!target(brain, warrant) ||
      (warrant.ownSeenAt !== undefined &&
        brain.now - warrant.ownSeenAt < OWN_SIGHT_DS),
  );
}

/** TRUE if it is short of a baton or cuffs and it is worth going for them now. */
function wantsKit(brain: NpcBrain): boolean {
  const beat = beatOf(brain);
  const security = brain.security;
  return (
    !!security &&
    (!security.has_baton || !security.has_cuffs) &&
    !security.holding &&
    // Not while it is after someone: a trip to the lockers is a minute with its back to them.
    !onLead(brain) &&
    (beat.kitTries < KIT_TRIES || brain.now - beat.kitAt > KIT_AGAIN_DS)
  );
}

/**
 * Keeps its legwork true to what it sees and what has happened to it. Returns TRUE if it has
 * work of this kind in hand, so that whoever calls knows not to send it off on anything idle.
 * `kitToo` is FALSE for someone who only needs its kit once it has a warrant of its own to serve.
 */
export function syncBeat(brain: NpcBrain, kitToo = true): boolean {
  const beat = beatOf(brain);
  const security = brain.security;
  // Hurt: it breaks off, and whoever keeps the list is told.
  if (security && security.health < HURT_BELOW && !beat.hurt) {
    beat.hurt = true;
    const about =
      beat.warrants.find((it) => target(brain, it) || holds(brain, it)) ??
      beat.warrants[0];
    beat.outcomes.push({ what: 'hurt', name: about?.name ?? '' });
  }
  // Seeing someone it has a warrant on is a sighting like any other: where, and when. Left to
  // word from others alone, it saw the monkey across a hallway, walked on, and did not know
  // where to go back to.
  for (const warrant of beat.warrants) {
    const seen = target(brain, warrant);
    if (seen) {
      warrant.ownSeenAt = brain.now;
      warrant.lastSeen = { place: seen.place ?? brain.location, at: brain.now };
    }
  }
  // What stops it serving a warrant is word for whoever keeps the list, once for each reason:
  // three trips for a baton that came to nothing, and a room they were seen in that it cannot
  // get into. Left unsaid, the Captain waits on an arrest that is not coming.
  beat.cannotTold ??= {};
  const told = beat.cannotTold;
  const cannot = (name: string, why: string) => {
    const key = `${name}|${why}`;
    if (told[key] === undefined) {
      told[key] = brain.now;
      beat.outcomes.push({ what: 'cannot', name, why });
    }
  };
  const cells = Math.max(security?.cells.length ?? 0, 1);
  for (const warrant of beat.warrants) {
    // No baton, once they have shown they will not stand still for the cuffs and a trip for one
    // has come to nothing. Until they have, there is the quiet arrest to try: someone who stands
    // still is cuffed without a baton, and "no baton" sent the moment a warrant came in was not
    // yet true of them.
    if (
      security &&
      !security.has_baton &&
      warrant.force &&
      beat.kitTries >= 1
    ) {
      cannot(warrant.name, 'no baton');
    }
    // A room they are in that it cannot get into. With someone to ask, that is said only once
    // nobody it asked has opened the door.
    const shut = warrant.shutOut;
    if (shut?.gaveUp) {
      cannot(warrant.name, `nobody has let me into the ${shut.place}`);
    }
    const last = warrant.lastSeen;
    if (
      last &&
      brain.now - last.at < SIGHTING_STALE_DS &&
      brain.blockedPlaces.includes(last.place) &&
      keepersOf(brain, last.place).length === 0
    ) {
      cannot(warrant.name, `no way into the ${last.place}`);
    }
    // In cuffs and by the arm, and every cell has refused them.
    if (holds(brain, warrant) && (warrant.cellTries ?? 0) >= cells) {
      cannot(warrant.name, 'I cannot get them into a cell');
    }
  }
  // Someone has its baton in their hand. That is told once.
  const baton = security?.baton_seen;
  if (security?.has_baton) {
    beat.batonTold = false;
  } else if (baton?.where === 'held' && baton.by && !beat.batonTold) {
    beat.batonTold = true;
    beat.outcomes.push({ what: 'baton', name: baton.by });
  }
  // Someone who attacked it a while ago and has not been seen since is let be.
  if (beat.attacker && brain.now - beat.attacker.at > ATTACK_FRESH_DS) {
    beat.attacker = null;
  }
  // Those whose time is up are no longer in a cell.
  for (const [name, held] of Object.entries(beat.jailed)) {
    if (brain.now > held.until) {
      delete beat.jailed[name];
    }
  }

  const kit =
    (kitToo || beat.warrants.length > 0 || beat.toFree.length > 0) &&
    wantsKit(brain);
  keep(brain, KIT, kit, 'asked');
  // A warrant no longer in its hands is no longer work.
  for (const task of brain.tasks) {
    if (
      task.state !== 'done' &&
      ((task.kind === SERVE &&
        !beat.warrants.some((it) => it.name === task.item)) ||
        (task.kind === FREE &&
          !beat.toFree.some((it) => it.name === task.item)))
    ) {
      finishTask(brain, task);
    }
  }
  for (const warrant of beat.warrants) {
    // With them in sight, or by the arm, nothing comes before it.
    const now = !!target(brain, warrant) || holds(brain, warrant);
    keep(brain, SERVE, true, now ? 'emergency' : 'asked', warrant.name);
  }
  for (const free of beat.toFree) {
    keep(brain, FREE, true, 'emergency', free.name);
  }
  // Being hit by someone it cannot stop, with no baton or hurt: it does not stand and take it,
  // and it does not walk on with its work. It gets out of their reach. An officer with no baton
  // walked off down a hallway at its usual pace while a monkey with a club beat it unconscious.
  const away =
    !!security &&
    beat.struckAt !== undefined &&
    brain.now - beat.struckAt < AWAY_DS &&
    (!security.has_baton || beat.hurt) &&
    !security.holding;
  keep(brain, AWAY, away, 'emergency');
  // Someone with no warrant on them who attacked it, and whom it could not stop: whoever keeps
  // the list is told, so that the Captain can declare a warrant.
  if (away && beat.attacker && !beat.attacker.told) {
    beat.attacker.told = true;
    beat.outcomes.push({ what: 'attacked', name: beat.attacker.name });
  }
  const attacker = beat.attacker;
  keep(
    brain,
    STOP,
    !!attacker &&
      !attacker.stopped &&
      !beat.hurt &&
      !!security?.has_baton &&
      brain.peopleInView.some((person) => person.name === attacker.name),
    'emergency',
  );
  return beat.warrants.length > 0 || beat.toFree.length > 0 || kit || away;
}

/**
 * Who it can ask to open a room it is shut out of: those the server says have an ID for one of
 * its doors, and failing them the Captain, whose ID opens every door. Never itself, and never
 * anyone it has a warrant on: the person it has come for is not asked to open the door.
 */
function keepersOf(brain: NpcBrain, place: string, given?: unknown): string[] {
  const listed = Array.isArray(given)
    ? given.map(String)
    : (brain.security?.keepers?.[place] ?? []);
  const captain = captainName(brain);
  const names = listed.length > 0 ? listed : captain ? [captain] : [];
  const wanted = beatOf(brain).warrants.map((warrant) => warrant.name);
  return names.filter(
    (name) =>
      name !== brain.name && !wanted.some((other) => sameName(other, name)),
  );
}

/** Notes that someone it has a warrant on is in a room it cannot get into. Returns FALSE if there is nobody to ask. */
function noteShutOut(
  brain: NpcBrain,
  warrant: BeatWarrant,
  place: string,
  given?: unknown,
): boolean {
  if (!place || place === brain.location) {
    return false;
  }
  if (warrant.shutOut?.place === place) {
    return !warrant.shutOut.gaveUp;
  }
  const keepers = keepersOf(brain, place, given);
  if (keepers.length === 0) {
    return false;
  }
  warrant.shutOut = { place, at: brain.now, keepers, asked: [], askedAt: 0 };
  return true;
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/**
 * What getting into a room it is shut out of comes down to right now: it goes to the door, asks
 * someone whose ID opens it, and waits there. One person at a time, three at most.
 */
function letInStep(brain: NpcBrain, warrant: BeatWarrant): Plan {
  const shut = warrant.shutOut;
  const name = warrant.name;
  if (!shut || shut.gaveUp) {
    return {
      ready: false,
      step: `${name} is in the ${shut?.place ?? 'next room'}, which is locked to you, and nobody has let you in.`,
    };
  }
  // A door held open for it is the way in.
  if (brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === shut.place) {
    return {
      ready: true,
      step: `The door into the ${shut.place} is being held open for you, and you are going through for ${name}.`,
      act: { tool: 'go_to', place: shut.place },
    };
  }
  // It stands at the door it wants through, so that whoever opens it knows which one.
  if (brain.atDoorOf !== shut.place && !shut.atDoor) {
    return {
      ready: true,
      step: `${name} is in the ${shut.place}, which is locked to you. You are going to its door.`,
      act: { tool: 'go_to_door', place: shut.place },
    };
  }
  const last = shut.asked[shut.asked.length - 1];
  if (last && brain.now - shut.askedAt < LET_IN_WAIT_DS) {
    return {
      ready: false,
      wait: true,
      step: `${name} is in the ${shut.place}, which is locked to you. You have asked ${last} to let you in, and are waiting at the door.`,
    };
  }
  const next = shut.keepers.find((keeper) => !shut.asked.includes(keeper));
  if (!next || shut.asked.length >= LET_IN_ASKS || !brain.hasPda) {
    shut.gaveUp = true;
    return {
      ready: false,
      step: `${name} is in the ${shut.place}, which is locked to you, and nobody has let you in.`,
    };
  }
  return {
    ready: true,
    step: `${name} is in the ${shut.place}, which is locked to you. ${next}'s ID opens it. You are sending ${next} a PDA message asking to be let in.`,
    act: {
      tool: 'message',
      person: next,
      text: letInLine(
        addressOf(next, jobOf(brain, next)),
        doorCalled(brain, shut.place),
        shut.place,
        name,
      ),
    },
  };
}

/** What getting its kit comes down to right now. */
function kitStep(brain: NpcBrain): Plan {
  const security = brain.security;
  if (!security || (security.has_baton && security.has_cuffs)) {
    return { ready: false, step: 'You have your baton and your cuffs.' };
  }
  const short = [
    ...(security.has_baton ? [] : ['a stun baton']),
    ...(security.has_cuffs ? [] : ['a pair of cuffs']),
  ].join(' and ');
  return {
    ready: true,
    step: `You are short of ${short}. You are going to the security lockers for ${security.has_baton ? 'them' : 'it'}, as anyone would.`,
    act: { tool: 'get_kit' },
  };
}

/** How long someone goes into a cell for: what the warrant says, and more if they fought back, up to the most a cell's timer allows. */
function minutesFor(warrant: BeatWarrant): number {
  return Math.min(
    MINUTES_MOST,
    warrant.minutes + (warrant.resisted ? MINUTES_RESISTING : 0),
  );
}

/** What serving one warrant comes down to right now. */
function serveStep(brain: NpcBrain, warrant: BeatWarrant): Plan {
  const beat = beatOf(brain);
  const security = brain.security;
  const name = warrant.name;
  const why = warrant.reason ? `, for ${warrant.reason}` : '';
  // By the arm and in cuffs: to the brig.
  if (holds(brain, warrant)) {
    if (
      warrant.noCellAt !== undefined &&
      brain.now - warrant.noCellAt < NO_CELL_WAIT_DS
    ) {
      return {
        ready: false,
        wait: true,
        step: `You have ${name} by the arm, and every cell in the brig is in use. You are waiting for one to come empty.`,
      };
    }
    // Every cell has refused them. It does not walk off with them: it stands in the brig, where
    // the Head of Security knows to find it, and tries the cells again in a while.
    const cells = Math.max(security?.cells.length ?? 0, 1);
    if ((warrant.cellTries ?? 0) >= cells) {
      if (brain.now - (warrant.cellFailedAt ?? 0) < CELL_AGAIN_DS) {
        const brig = brigPlace(brain);
        if (brig && brain.location !== brig) {
          return {
            ready: true,
            step: `You have ${name} in cuffs and by the arm, and could not get them into a cell. You are taking them back to the brig to wait there.`,
            act: { tool: 'go_to', place: brig },
          };
        }
        return {
          ready: false,
          wait: true,
          step: `You have ${name} in cuffs and by the arm, and could not get them into any cell. You are standing with them in the brig, and will try the cells again shortly.`,
        };
      }
      warrant.cellTries = 0;
    }
    const minutes = minutesFor(warrant);
    return {
      ready: true,
      step: `You have ${name} in cuffs and by the arm. You are taking them to a cell in the brig, for ${minutes} minutes${warrant.resisted ? `: ${MINUTES_RESISTING} of them for resisting arrest` : ''}.`,
      // The try is numbered so that one that came to nothing is not held back like a step that
      // keeps failing: the next try is at another cell, and is made at once.
      act: { tool: 'jail', minutes, attempt: (warrant.cellAttempts ?? 0) + 1 },
    };
  }
  // With someone else by the arm, nobody else is gone after: they are put in a cell first. Left
  // to its next warrant, it walked every hallway on the station with its prisoner in tow.
  const held = security?.holding;
  if (held) {
    return {
      ready: false,
      wait: true,
      step: `You have ${held} by the arm. ${name} waits until they are in a cell.`,
    };
  }
  // A room it was shut out of is no longer one once it is in it, or once long enough has gone by
  // to ask again.
  if (
    warrant.shutOut &&
    (brain.location === warrant.shutOut.place ||
      brain.now - warrant.shutOut.at > SHUT_OUT_DS)
  ) {
    warrant.shutOut = undefined;
  }
  const seen = target(brain, warrant);
  if (seen) {
    if (brain.now < warrant.restUntil) {
      return {
        ready: false,
        step: `${seen.name} is here, and you could not take them a moment ago. You are leaving them be for now. The warrant stands.`,
      };
    }
    // In cuffs that it did not put on: someone else from security has them. Two do not pull at
    // one prisoner, so it leaves them to whoever made the arrest.
    if (seen.cuffed && !warrant.cuffedByMe) {
      return {
        ready: false,
        step: `${seen.name} is in cuffs already. Someone else from security has made the arrest, and you are leaving them to it.`,
      };
    }
    // In its own cuffs and got loose of its hold: it takes hold again.
    if (seen.cuffed) {
      return {
        ready: true,
        step: `${seen.name} is in cuffs and not in your hold. You are taking them by the arm again.`,
        act: { tool: 'arrest', person: seen.handle, how: 'quiet' },
      };
    }
    // The baton, once they have shown they will not stand still. Not when it is hurt, and not without one.
    const force = warrant.force && !beat.hurt;
    if (warrant.force && beat.hurt) {
      return {
        ready: false,
        step: `${seen.name} is here, and will not stand still to be arrested. You are hurt, and use no force until you are told to try again.`,
      };
    }
    if (force && !security?.has_baton) {
      return {
        ready: false,
        step: `${seen.name} is here and will not stand still, and you have no baton to hand.`,
      };
    }
    if (!security?.has_cuffs) {
      return {
        ready: false,
        step: `${seen.name} is here, and you have no cuffs to hand.`,
      };
    }
    // In sight, and in a room it cannot get into: across a counter, or through a window. It
    // does not call the arrest out from there. It asks to be let in.
    // They have moved to another room since: the door it was asking at is no longer the one.
    if (
      warrant.shutOut &&
      seen.place &&
      warrant.shutOut.place !== seen.place
    ) {
      warrant.shutOut = undefined;
    }
    const far = (seen.distance ?? 0) > NEAR;
    if (far && warrant.shutOut && !warrant.resisted) {
      return letInStep(brain, warrant);
    }
    // Someone who has hit it gets no second telling: the baton, at once.
    if (!warrant.resisted || warrant.toldAt === null) {
      if (far && !warrant.walkedUp) {
        return {
          ready: true,
          step: `There is a warrant on ${name}${why}, and ${seen.name} is in sight. You are walking up to them.`,
          act: { tool: 'approach', person: seen.handle },
          dropsWalk: true,
        };
      }
      if (
        warrant.toldAt === null ||
        brain.now - warrant.toldAt > TOLD_STANDS_DS
      ) {
        const line = arrestLine(seen.name, warrant.reason);
        return {
          ready: true,
          step: `There is a warrant on ${name}${why}, and ${seen.name} is here. Your body is telling them, in these words: "${line}"`,
          say: line,
          exact: true,
        };
      }
    }
    return {
      ready: true,
      step: force
        ? `${seen.name} will not stand still to be arrested. You are using your baton, and then the cuffs.`
        : `You have told ${seen.name} they are under arrest. You are putting the cuffs on them.`,
      act: {
        tool: 'arrest',
        person: seen.handle,
        how: force ? 'force' : 'quiet',
      },
      dropsWalk: true,
    };
  }
  // Not in sight. Where they were last seen, if that is fresh and it has not looked there since.
  const sighting = warrant.lastSeen;
  // A room it has found no way into: it asks whoever can open it, at the door.
  if (
    sighting &&
    brain.now - sighting.at < SIGHTING_STALE_DS &&
    brain.blockedPlaces.includes(sighting.place) &&
    (warrant.shutOut?.place === sighting.place
      ? !warrant.shutOut.gaveUp
      : noteShutOut(brain, warrant, sighting.place))
  ) {
    return letInStep(brain, warrant);
  }
  if (
    sighting &&
    brain.now - sighting.at < SIGHTING_STALE_DS &&
    (warrant.lookedAt === null || warrant.lookedAt < sighting.at) &&
    !brain.blockedPlaces.includes(sighting.place)
  ) {
    if (brain.location !== sighting.place) {
      return knowsPlace(brain, sighting.place)
        ? {
            ready: true,
            step: `There is a warrant on ${name}${why}. They were last seen in the ${sighting.place}, and you are going there to look.`,
            act: { tool: 'go_to', place: sighting.place },
          }
        : {
            ready: false,
            step: `${name} was last seen in the ${sighting.place}, and you do not know the way there.`,
          };
    }
    if (brain.now - brain.inPlaceSince < LOOK_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${sighting.place}, where ${name} was last seen, and are looking for them.`,
      };
    }
    warrant.lookedAt = brain.now;
  }
  // No sighting to follow. It walks the main hallways, one after the other, and looks.
  const halls = hallways(brain);
  const round = beat.round;
  const walking = round.next > 0 || brain.now - round.at > BETWEEN_WALKS_DS;
  if (halls.length > 0 && walking && round.next < halls.length) {
    const hall = halls[round.next];
    if (brain.location !== hall) {
      return {
        ready: true,
        step: `There is a warrant on ${name}${why}, and you have no fresh word of where they are. You are walking the main hallways to look for them: the ${hall} next.`,
        act: { tool: 'go_to', place: hall },
      };
    }
    if (brain.now - brain.inPlaceSince < HALLWAY_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${hall}, looking for ${name}.`,
      };
    }
    round.next += 1;
    if (round.next >= halls.length) {
      round.next = 0;
      round.at = brain.now;
    }
    return {
      ready: false,
      step: `${name} is not in the ${hall}.`,
    };
  }
  return {
    ready: false,
    step: `There is a warrant on ${name}${why}. You have no fresh word of where they are, and have walked the hallways lately.`,
  };
}

/** What letting someone go comes down to right now. */
function freeStep(brain: NpcBrain, name: string): Plan {
  const free = beatOf(brain).toFree.find((it) => it.name === name);
  if (!free) {
    return { ready: false, step: `${name} has been let go.` };
  }
  return {
    ready: true,
    step: `${name} is to be let go${free.pardoned ? ': the Captain has pardoned them' : ': the warrant on them is withdrawn'}. You are letting them go now.`,
    act: { tool: 'free', person: name },
  };
}

export function planBeat(brain: NpcBrain, task: Task): Plan | null {
  const beat = beatOf(brain);
  if (task.kind === KIT) {
    return kitStep(brain);
  }
  if (task.kind === SERVE) {
    const warrant = beat.warrants.find((it) => it.name === task.item);
    return warrant
      ? serveStep(brain, warrant)
      : { ready: false, step: 'That warrant is no longer yours to serve.' };
  }
  if (task.kind === FREE) {
    return freeStep(brain, task.item ?? '');
  }
  if (task.kind === AWAY) {
    const security = brain.security;
    const by = beat.struckBy ?? 'Someone';
    // A baton is what stops them, and the lockers are out of their reach.
    if (security && !security.has_baton && !beat.hurt && beat.kitTries < KIT_TRIES) {
      return {
        ready: true,
        step: `${by} is attacking you, and you have no baton to stop them with. You are getting out of their reach and going to the security lockers for one.`,
        act: { tool: 'get_kit' },
      };
    }
    const post = brain.post ?? brigPlace(brain);
    if (post && brain.location !== post) {
      return {
        ready: true,
        step: `${by} is attacking you, and you cannot stop them${beat.hurt ? ': you are hurt' : ''}. You are getting out of their reach, back to the ${post}.`,
        act: { tool: 'go_to', place: post },
      };
    }
    return {
      ready: false,
      wait: true,
      step: `${by} attacked you, and you could not stop them. You are keeping out of their reach.`,
    };
  }
  if (task.kind === STOP) {
    const attacker = beat.attacker;
    const seen = attacker
      ? brain.peopleInView.find((person) => person.name === attacker.name)
      : undefined;
    return seen
      ? {
          ready: true,
          step: `${seen.name} has attacked you. There is no warrant on them, so you are stopping them with your baton and no more.`,
          act: { tool: 'arrest', person: seen.handle, how: 'stop' },
        }
      : { ready: false, step: 'Whoever attacked you has gone.' };
  }
  return null;
}

export function describeBeat(task: Task): string | null {
  switch (task.kind) {
    case KIT:
      return 'get your baton and cuffs from the security lockers';
    case SERVE:
      return `find and arrest ${task.item}`;
    case FREE:
      return `let ${task.item} go`;
    case STOP:
      return 'stop whoever attacked you';
    case AWAY:
      return 'get out of the reach of whoever is attacking you';
    default:
      return null;
  }
}

/** Notes that it has told someone they are under arrest. */
export function beatAfterSaying(brain: NpcBrain, called: string | null): void {
  if (!called || !ARREST_WORDS.test(called)) {
    return;
  }
  const warrant = beatOf(brain).warrants.find((it) =>
    sameName(it.name, called.split(',')[0]),
  );
  if (warrant) {
    warrant.toldAt = brain.now;
  }
}

/** Notes how a step of its legwork went. `details` is what the body said of it. */
export function beatAfterActing(
  brain: NpcBrain,
  act: Action,
  task: Task | undefined,
  ok: boolean,
  details: SenseEvent['details'] = {},
): void {
  const beat = beatOf(brain);
  if (act.tool === 'get_kit') {
    beat.kitAt = brain.now;
    // One trip fetches one thing. A trip that got something is not a failed one, short or not.
    beat.kitTries = ok ? 0 : beat.kitTries + 1;
    return;
  }
  const warrant =
    task?.kind === SERVE
      ? beat.warrants.find((it) => it.name === task.item)
      : undefined;
  if (warrant && act.tool === 'approach') {
    warrant.walkedUp = true;
    // It could not get to them, and they are in sight in another room: shut out of it.
    const seen = target(brain, warrant);
    if (!ok && seen && (seen.distance ?? 0) > NEAR && seen.place) {
      noteShutOut(brain, warrant, seen.place);
    }
    return;
  }
  // At the door of a room it is shut out of, or as near as it could get.
  if (warrant?.shutOut && act.tool === 'go_to_door') {
    warrant.shutOut.atDoor = true;
    return;
  }
  // It has asked someone to let it in. Sent or not, that is one asked: the wait runs from here.
  if (
    warrant?.shutOut &&
    act.tool === 'message' &&
    LET_IN_WORDS.test(String(act.text ?? ''))
  ) {
    warrant.shutOut.asked.push(String(act.person ?? ''));
    warrant.shutOut.askedAt = brain.now;
    return;
  }
  if (act.tool === 'arrest') {
    if (act.how === 'stop') {
      const attacker = beat.attacker;
      if (attacker) {
        attacker.stopped = true;
        if (ok && !attacker.told) {
          attacker.told = true;
          const about = beat.warrants.find(
            (it) => target(brain, it) || holds(brain, it),
          );
          beat.outcomes.push({
            what: 'attacked',
            name: attacker.name,
            other: about?.name,
          });
        }
      }
      return;
    }
    if (!warrant) {
      return;
    }
    warrant.walkedUp = false;
    // The cuffs went on, whether or not it then got a hold of them: they are its prisoner, and
    // whoever keeps the list is told so. Left unsaid, the list read "still wanted" for seven
    // minutes while it walked them about the station.
    if (ok || details.cuffed) {
      if (!warrant.cuffedByMe) {
        beat.outcomes.push({ what: 'cuffed', name: warrant.name });
      }
      warrant.cuffedByMe = true;
      warrant.shutOut = undefined;
    }
    if (ok) {
      return;
    }
    const reason = String(details.reason ?? '');
    // It could not get to them, and can still see them: a door or a counter is between them.
    // That is not losing them. It asks to be let in.
    if (reason === 'no_way') {
      warrant.toldAt = null;
      noteShutOut(
        brain,
        warrant,
        String(details.place ?? target(brain, warrant)?.place ?? ''),
        details.keepers,
      );
      return;
    }
    // Would not stand still for the cuffs. The baton comes first from now on.
    if (reason === 'moved') {
      warrant.force = true;
    }
    // Short of its kit: that is not a try at them, and its kit comes next.
    if (reason === 'no_baton' || reason === 'no_cuffs') {
      beat.kitTries = 0;
      return;
    }
    warrant.tries += 1;
    if (reason === 'lost' || warrant.tries >= ARREST_TRIES) {
      warrant.tries = 0;
      warrant.toldAt = null;
      warrant.restUntil = reason === 'lost' ? 0 : brain.now + REST_DS;
      warrant.lastSeen = { place: brain.location, at: brain.now };
      warrant.lookedAt = brain.now;
      beat.outcomes.push({
        what: 'lost',
        name: warrant.name,
        place: brain.location,
      });
    }
    return;
  }
  if (act.tool === 'jail') {
    if (!warrant) {
      return;
    }
    if (ok) {
      const cell = String(details.cell ?? 'a cell');
      const minutes = Number(details.minutes ?? minutesFor(warrant));
      const prisoner = String(details.prisoner ?? warrant.name);
      beat.jailed[prisoner] = {
        cell,
        until: brain.now + minutes * 600,
        cuffsLeft: !!details.cuffs_left,
      };
      beat.outcomes.push({
        what: 'jailed',
        name: warrant.name,
        cell,
        minutes,
        resisted: warrant.resisted,
      });
      beat.warrants = beat.warrants.filter((it) => it !== warrant);
      return;
    }
    warrant.cellAttempts = (warrant.cellAttempts ?? 0) + 1;
    const reason = String(details.reason ?? '');
    if (reason === 'no_cell') {
      warrant.noCellAt = brain.now;
      return;
    }
    // The cell would not take them, and it still has them by the arm: the next cell, at once.
    if (reason === 'no_way' || reason === 'timer') {
      warrant.cellTries = (warrant.cellTries ?? 0) + 1;
      warrant.cellFailedAt = brain.now;
      return;
    }
    // Got away on the walk, or was never in its hold. It looks for them again from here.
    warrant.toldAt = null;
    warrant.lastSeen = { place: brain.location, at: brain.now };
    warrant.lookedAt = null;
    if (reason === 'got_away') {
      beat.outcomes.push({
        what: 'lost',
        name: warrant.name,
        place: brain.location,
      });
    }
    return;
  }
  if (act.tool === 'free' && task?.kind === FREE) {
    const free = beat.toFree.find((it) => it.name === task.item);
    if (!free) {
      return;
    }
    free.tries += 1;
    if (!ok && free.tries < FREE_TRIES) {
      return;
    }
    beat.toFree = beat.toFree.filter((it) => it !== free);
    for (const name of Object.keys(beat.jailed)) {
      if (sameName(free.name, name)) {
        delete beat.jailed[name];
      }
    }
    // Nothing was holding them: there is nobody to say is free.
    if (ok && !details.nothing) {
      beat.outcomes.push({ what: 'freed', name: free.name });
      // Whoever was pardoned is told so, if they are there to be told.
      const seen = brain.peopleInView.find((person) =>
        sameName(free.name, person.name),
      );
      if (seen && free.pardoned) {
        brain.toTell.push({
          to: seen.name,
          line: freeToGoLine(seen.name),
          why: `The Captain has pardoned ${seen.name}, and you have let them go. You are telling them so.`,
          exact: true,
          at: Date.now(),
        });
      }
    }
  }
}

/**
 * Takes in what has just happened to its body: someone has hit it, shoved it, taken hold of it or
 * taken something out of its hand. Someone it has a warrant on has fought back: they get the
 * baton, at once, and five minutes more. Anyone else is someone to stop.
 */
export function securityFeels(brain: NpcBrain, event: SenseEvent): void {
  const by = event.details.struck_name;
  if (typeof by !== 'string' || !brain.beat) {
    return;
  }
  const beat = brain.beat;
  beat.struckBy = by;
  beat.struckAt = brain.now;
  const warrant = beat.warrants.find((it) => sameName(it.name, by));
  if (warrant) {
    warrant.resisted = true;
    warrant.force = true;
    warrant.restUntil = 0;
    return;
  }
  if (beat.attacker?.name !== by || beat.attacker.stopped) {
    beat.attacker = {
      name: by,
      handle: String(event.details.struck_by ?? ''),
      at: brain.now,
    };
  } else {
    beat.attacker.at = brain.now;
  }
}

/** What the LLM should know of the warrants in its hands, so that what it says about them is true. */
export function beatCues(brain: NpcBrain): string[] {
  const beat = beatOf(brain);
  const security = brain.security;
  const lines: string[] = [];
  for (const warrant of beat.warrants) {
    const seen = warrant.lastSeen
      ? ` They were last seen in the ${warrant.lastSeen.place}.`
      : '';
    lines.push(
      holds(brain, warrant)
        ? `You have ${warrant.name} in cuffs and by the arm, and are taking them to the brig.`
        : `You have a warrant to serve on ${warrant.name}${warrant.reason ? `, for ${warrant.reason}` : ''}.${seen}`,
    );
  }
  if (beat.warrants.length > 0) {
    lines.push(
      'A warrant is security business. You do not bring it up with people you meet, and never with whoever it is on: said to them before you have a hand on them, it is a warning to run. Asked what you are doing, you are on security business.',
    );
  }
  const jailed = Object.entries(beat.jailed);
  if (jailed.length > 0) {
    lines.push(
      `In the cells, put there by you: ${jailed.map(([name, held]) => `${name} in ${held.cell}`).join('; ')}.`,
    );
  }
  if (beat.hurt) {
    lines.push(
      'You are hurt, and have broken off. You make no arrest by force until you are told to try again.',
    );
  }
  if (security && !security.has_baton) {
    lines.push('You have no stun baton on you.');
  }
  if (beat.warrants.length === 0 && jailed.length === 0) {
    lines.push('You have no warrant to serve just now.');
  }
  return lines;
}

/** The room the cells are in, if this NPC knows the way there. */
export function brigPlace(brain: NpcBrain): string | null {
  return knowsPlace(brain, BRIG) ? BRIG : null;
}
