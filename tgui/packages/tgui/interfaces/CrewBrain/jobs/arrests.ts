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
 * - Three tries that come to nothing and it leaves them be for half a minute, and says why
 *   there is no arrest yet. The warrant stands.
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
import { doorCalled, doorFor } from './janitor';
import {
  ARREST_WORDS,
  addressOf,
  arrestLine,
  EARLY,
  freeToGoLine,
  LET_IN_WORDS,
  letInFarLine,
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
/** How many tries at an arrest may come to nothing before they are left be a while, and how long (deciseconds) that is. */
const ARREST_TRIES = 3;
const REST_DS = 300;
/** Why there is no arrest yet, of someone in sight that three tries have not taken. It reads the same in any mouth. */
const WILL_NOT_STAND = 'they will not stand still for the baton or the cuffs';
/** Why there is no arrest yet, of someone in sight it cannot walk to and has nobody to ask to let it through. */
const NO_WAY_TO_THEM = 'they are in sight, but there is no way through to them';
/** Why there is no arrest of someone the server would not let it touch: they wear or hold a Captain's ID. */
const CAPTAIN_CARD =
  "they carry a Captain's ID, and nobody lays a hand on the Captain";
/** How long (deciseconds) someone the server would not let it arrest is passed over. They may take the card off. */
const REFUSED_DS = 3000;
/** How long (deciseconds) a warrant dropped by a pardon or taken back is remembered, for an arrest still under way. */
const DROPPED_DS = 600;
/** How long (deciseconds) after an arrest it sent another step over, someone seen in cuffs is taken as cuffed by that arrest. */
const OWN_CUFFS_DS = 100;
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
/**
 * Told to try again while hurt, how much more (percent) it may lose before it breaks off again,
 * and the health under which it breaks off whatever it was told. A guess: the owner's to set.
 */
const AGAIN_MARGIN = 15;
const AGAIN_FLOOR = 20;
/** How long (deciseconds) after it breaks off hurt that saying so comes before getting away. */
const HURT_WORD_DS = 50;
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
/**
 * Left its prisoner in a cell and could not get back out past them (PLAY-01): how long
 * (deciseconds) it goes on trying to walk out and start that cell's timer, and how many times.
 * A crew prisoner let go is free to go after 20 seconds with no hand on them.
 */
const STUCK_FRESH_DS = 200;
const STUCK_TRIES = 2;
/** How long (deciseconds) it goes on asking to be let into one room, and how long it waits on each person it asks. */
const SHUT_OUT_DS = 3000;
const LET_IN_WAIT_DS = 900;
/** How many walks to a door may come to nothing before it asks from where it stands. */
const DOOR_TRIES = 2;
/** How many people it asks to let it into a room before it gives that up. */
const LET_IN_ASKS = 3;
/** How long (deciseconds) after it puts someone in a cell before seeing them out of one counts: what it sees of the cells may be a moment behind (TRB-06). */
const SEEN_OUT_AFTER_DS = 150;

/** Someone it put in a cell, with when it put them there (TRB-06). */
type JailedMore = BeatWork['jailed'][string] & { at?: number };

/**
 * TRUE if someone it put in a cell is in view and in no cell it can see running with them in it
 * (TRB-06): let out by someone, or broken out. Someone in view inside a cell puts that cell in
 * sight, so a cell it cannot see is no cell they are in.
 */
function seenOutEarly(
  brain: NpcBrain,
  name: string,
  held: JailedMore,
): boolean {
  if (held.at !== undefined && brain.now - held.at < SEEN_OUT_AFTER_DS) {
    return false;
  }
  if (!brain.peopleInView.some((person) => sameName(name, person.name))) {
    return false;
  }
  return !(brain.security?.cells ?? []).some(
    (cell) =>
      !!cell.running &&
      (cell.occupants ?? []).some((inside) => sameName(name, inside)),
  );
}

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
  warrant: {
    name: string;
    reason: string;
    minutes: number;
    /** TRUE if the Captain declared it: only then is it served on a head of staff. */
    byCaptain?: boolean;
    /** TRUE to do no more than put right the time on one it already has. */
    onlyIfHeld?: boolean;
  },
): void {
  const beat = beatOf(brain);
  const held = beat.warrants.find((it) => it.name === warrant.name);
  // Given again, it is the time that has changed.
  if (held) {
    held.minutes = warrant.minutes;
    if (warrant.byCaptain !== undefined) {
      held.byCaptain = warrant.byCaptain;
    }
    return;
  }
  if (warrant.onlyIfHeld) {
    return;
  }
  beat.warrants.push({
    name: warrant.name,
    reason: warrant.reason,
    minutes: warrant.minutes,
    byCaptain: !!warrant.byCaptain,
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
  // An arrest under way when the word came may yet put the cuffs on: kept a minute, so that
  // its answer lets them go.
  if (had) {
    beat.dropped = [
      ...(beat.dropped ?? []).filter((it) => brain.now - it.at < DROPPED_DS),
      { name, pardoned, at: brain.now },
    ];
  }
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

/**
 * Gives a warrant up that someone else has served: the person is in a cell already. Unlike
 * `dropWarrant` it lets nobody go, so a prisoner left in cuffs in a cell stays there.
 */
export function forgetWarrant(brain: NpcBrain, name: string): void {
  const beat = beatOf(brain);
  beat.warrants = beat.warrants.filter(
    (it) => !sameName(name, it.name) && !sameName(it.name, name),
  );
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

/** How long (deciseconds) word that engineering has opened a room is worth walking in on. */
const OPENED_DS = 1800;

/**
 * Takes word that engineering has forced a room open for it. Whoever it has a warrant on in
 * there, or in a room reached through there, is worth going for again, at once.
 */
export function doorOpened(brain: NpcBrain, room: string): void {
  const told = beatOf(brain).cannotTold ?? {};
  for (const warrant of beatOf(brain).warrants) {
    const shut = warrant.shutOut;
    const last = warrant.lastSeen;
    if (
      shut?.place === room ||
      shut?.door === room ||
      last?.place === room ||
      (last && doorFor(brain, last.place) === room)
    ) {
      // A room locked again after this is told of again.
      for (const place of [room, shut?.door, shut?.place]) {
        delete told[
          `${warrant.name}|nobody has opened the ${place} for security`
        ];
      }
      warrant.shutOut = undefined;
      warrant.opened = { place: room, at: brain.now };
      warrant.lookedAt = null;
      if (last) {
        last.at = brain.now;
      }
    }
  }
}

/** Hands its warrants back: there is an officer to serve them. One whose person it has by the arm it sees through. */
export function handBack(brain: NpcBrain): void {
  const beat = beatOf(brain);
  const holding = brain.security?.holding;
  // One whose arrest is under way is kept too: the hold comes only at the end of the arrest,
  // and handed back before it, the cuffs went on someone held on no warrant.
  const last = brain.lastAct;
  const arresting =
    last?.act.tool === 'arrest' && last.act.how !== 'stop'
      ? brain.tasks.find((it) => it.id === last.task && it.kind === SERVE)?.item
      : undefined;
  beat.warrants = beat.warrants.filter(
    (it) => (!!holding && sameName(it.name, holding)) || it.name === arresting,
  );
}

/** Told to make arrests again after breaking off hurt. */
export function arrestAgain(brain: NpcBrain): void {
  const beat = beatOf(brain);
  if (beat.hurt) {
    beat.againAt = brain.security?.health ?? HURT_BELOW;
  }
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

/**
 * The names of those it knows to be shut in a cell: ones it put there, unless it sees them out of
 * one (TRB-06), and ones it can see there.
 */
function inCells(brain: NpcBrain): string[] {
  const jailed = beatOf(brain).jailed;
  return [
    ...Object.keys(jailed).filter(
      (name) => !seenOutEarly(brain, name, jailed[name] as JailedMore),
    ),
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
  // A warrant on someone it knows of by that full name is on that one person: "Pun Pun" is not
  // "Pun Pun II" when both are aboard. Only a name nobody knew is matched loosely.
  const known =
    brain.pdaPeople.some((person) => person.name === warrant.name) ||
    brain.people.has(warrant.name);
  // Someone the server would not let it arrest is passed over a while, so that it looks past them.
  const refused = (warrant.refused ?? [])
    .filter((it) => brain.now - it.at < REFUSED_DS)
    .map((it) => it.handle);
  return brain.peopleInView.find(
    (person) =>
      (known
        ? person.name === warrant.name ||
          person.name.startsWith(`${warrant.name} (as `)
        : sameName(warrant.name, person.name)) &&
      person.name !== brain.name &&
      !shut.includes(person.name) &&
      !refused.includes(person.handle),
  );
}

/** TRUE if someone other than itself is pulling them, or the server does not say who is. */
function heldByAnother(brain: NpcBrain, person: PersonInView): boolean {
  return (
    person.pulled_by === undefined ||
    (!!person.pulled_by && person.pulled_by !== brain.name)
  );
}

/**
 * TRUE if it has just made an arrest of this warrant's person itself: one still under way, or one
 * the driver sent another step over in the last few seconds (brain.droppedArrest), for this
 * warrant's serve task or on this person.
 */
function ownArrestOf(
  brain: NpcBrain,
  warrant: BeatWarrant,
  seen: PersonInView,
): boolean {
  const serve = findTask(brain, SERVE, { item: warrant.name });
  const last = brain.lastAct;
  if (
    last?.act.tool === 'arrest' &&
    last.act.how !== 'stop' &&
    ((serve && last.task === serve.id) || last.act.person === seen.handle)
  ) {
    return true;
  }
  const dropped = brain.droppedArrest;
  return (
    !!dropped &&
    brain.now - dropped.at < OWN_CUFFS_DS &&
    ((!!serve && dropped.task === serve.id) || dropped.person === seen.handle)
  );
}

/**
 * TRUE if whoever the warrant is on, in view, is a head of staff by their ID, and the Captain did
 * not declare it. Only the Captain may have a head arrested: such a warrant is not served on them.
 */
function headSpared(brain: NpcBrain, warrant: BeatWarrant): boolean {
  return !warrant.byCaptain && !!target(brain, warrant)?.command;
}

/** The cell it left this warrant's person in, let go, and could not get out of past them (PLAY-01). */
type StuckInside = { cell: string; at: number; tries: number };

/**
 * What a warrant keeps beyond BeatWarrant's own fields (types.ts is not this file's): the cell it
 * is stuck in (PLAY-01), and how many tries at arresting them it has made in all, which numbers
 * each try so that the driver does not hold the next one back (ARR-01).
 */
type WarrantMore = {
  stuckInside?: StuckInside;
  arrestAttempts?: number;
  /** How many times in a row no cell would do, and why the last time: no_cell or no_power (ARR-04). */
  noCellTries?: number;
  noCellWhy?: string;
  /** Walks through the door it asked at, found standing open, that came to nothing (ARR-06). */
  openWalks?: number;
  /**
   * Its look round the room of a sighting (KNA-23): the sighting it is for (its time), which leg
   * it is on (0 by the door it came in by, 1 walking to the middle, 2 looking from the middle),
   * when the last leg began, and how many walks to the middle it has sent.
   */
  lookFor?: number;
  lookLeg?: number;
  lookLegAt?: number;
  lookWalks?: number;
  /** The door it last knocked at, asking to be let in, and whom it is asking aloud (KNA-26). */
  knockedAt?: string;
  sayingTo?: string;
};
/** How long (deciseconds) it looks from the middle of the room of a sighting (KNA-23). */
const LOOK_MIDDLE_DS = 100;
/** How many walks through a door found open may come to nothing before it waits as before (ARR-06). */
const OPEN_WALKS = 3;

/**
 * TRUE if the door the body stands at, the one it wants through, is open: what its eyes tell it
 * (ARR-06). The server sends it as at_door_open, copied to brain.atDoorOpen; until it does, this
 * is always FALSE and nothing changes.
 */
function atDoorOpen(brain: NpcBrain): boolean {
  return !!(brain as NpcBrain & { atDoorOpen?: boolean }).atDoorOpen;
}
/** How many times no cell will do before whoever keeps the list is told (ARR-04). */
const NO_CELL_TELL = 2;

function more(warrant: BeatWarrant): WarrantMore {
  return warrant as BeatWarrant & WarrantMore;
}

/** The warrant's StuckInside, if any. Kept on the warrant beside its other cell counts. */
function stuckOf(warrant: BeatWarrant): StuckInside | undefined {
  return more(warrant).stuckInside;
}

function setStuck(warrant: BeatWarrant, stuck: StuckInside | undefined): void {
  more(warrant).stuckInside = stuck;
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
  // Hurt: it breaks off, and whoever keeps the list is told. Told to try again, it goes on until
  // it is a good deal more hurt than it was then: nothing aboard heals it, so its health alone
  // would have it break off again the same second.
  if (security && security.health >= HURT_BELOW) {
    beat.againAt = undefined;
  }
  const breaksOff =
    !!security &&
    security.health < HURT_BELOW &&
    (beat.againAt === undefined ||
      security.health <= beat.againAt - AGAIN_MARGIN ||
      security.health < AGAIN_FLOOR);
  if (security && breaksOff && !beat.hurt) {
    beat.againAt = undefined;
    beat.hurt = true;
    beat.hurtAt = brain.now;
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
    // Seen in cuffs nobody else holds them by, just after its own arrest of them: the cuffs are
    // its own, though the answer never came (ARR-08: another step was sent over the arrest).
    if (
      seen?.cuffed &&
      !warrant.cuffedByMe &&
      !heldByAnother(brain, seen) &&
      ownArrestOf(brain, warrant, seen)
    ) {
      warrant.cuffedByMe = true;
      warrant.shutOut = undefined;
      beat.outcomes.push({ what: 'cuffed', name: warrant.name });
    }
  }
  // What stops it serving a warrant is word for whoever keeps the list, once for each reason:
  // three trips for a baton that came to nothing, and a room they were seen in that it cannot
  // get into. Left unsaid, the Captain waits on an arrest that is not coming.
  beat.cannotTold ??= {};
  const told = beat.cannotTold;
  // Once a warrant, not once a round: what was told of a warrant now gone (served, pardoned,
  // handed back) is forgotten, so a second warrant on the same person is told afresh.
  for (const key of Object.keys(told)) {
    const name = key.slice(0, key.indexOf('|'));
    if (!beat.warrants.some((it) => it.name === name)) {
      delete told[key];
    }
  }
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
    // With them in sight it is said at once: the trip for one takes a minute.
    const inSight = !!target(brain, warrant);
    if (
      security &&
      !security.has_baton &&
      warrant.force &&
      (beat.kitTries >= 1 || inSight)
    ) {
      cannot(warrant.name, 'no baton');
    }
    if (security && !security.has_cuffs && inSight && !holds(brain, warrant)) {
      cannot(warrant.name, 'no cuffs');
    }
    // A room they are in that it cannot get into. With someone to ask, that is said only once
    // nobody it asked has opened the door.
    const shut = warrant.shutOut;
    if (shut?.gaveUp) {
      cannot(
        warrant.name,
        `nobody has opened the ${shut.door ?? shut.place} for security`,
      );
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
      // In words the Head of Security can pass on as they are (PLAY-02).
      cannot(warrant.name, 'no cell would take them');
    }
    // In cuffs and by the arm, and no cell will do: all in use, or dark (ARR-04).
    if (
      holds(brain, warrant) &&
      (more(warrant).noCellTries ?? 0) >= NO_CELL_TELL
    ) {
      cannot(
        warrant.name,
        more(warrant).noCellWhy === 'no_power'
          ? 'the cells have no power'
          : 'every cell is in use',
      );
    }
    // The one it has found is a head of staff, going by their ID, and the Captain did not declare
    // the warrant. Only the Captain may have a head arrested, whatever went wrong with the name.
    // In cuffs it did not put on, and in someone else's hold: it leaves them be, and says whose.
    // Not when that is security: the list hears of that arrest from them.
    const cuffedSeen = target(brain, warrant);
    if (
      cuffedSeen?.cuffed &&
      !warrant.cuffedByMe &&
      cuffedSeen.pulled_by &&
      cuffedSeen.pulled_by !== brain.name &&
      !/security|warden/i.test(jobOf(brain, cuffedSeen.pulled_by))
    ) {
      cannot(warrant.name, `${cuffedSeen.pulled_by} has them in cuffs`);
    }
    if (headSpared(brain, warrant)) {
      cannot(
        warrant.name,
        'they are a head of staff, and the Captain did not declare it',
      );
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
    } else if (seenOutEarly(brain, name, held as JailedMore)) {
      // Seen out of the cells before their time, let out or broken out: the head is told, and
      // the desk tells the Captain (TRB-06). Whether they are arrested again is the owner's to say.
      delete beat.jailed[name];
      beat.outcomes.push({ what: 'freed', name, cell: held.cell, why: EARLY });
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
  // Not until it has said that it is hurt, if it has a PDA to say it with and has only just
  // broken off: the message takes a moment, and an officer that walked off first was beaten
  // down ten seconds later with nobody told.
  const sayingHurt =
    beat.hurtAt !== undefined &&
    brain.now - beat.hurtAt < HURT_WORD_DS &&
    brain.hasPda &&
    (beat.outcomes.some((it) => it.what === 'hurt') ||
      beat.words.some((it) => it.outcome.what === 'hurt'));
  const away =
    !!security &&
    beat.struckAt !== undefined &&
    brain.now - beat.struckAt < AWAY_DS &&
    (!security.has_baton || beat.hurt) &&
    !security.holding &&
    !sayingHurt;
  keep(brain, AWAY, away, 'emergency');
  // Someone with no warrant on them who attacked it, and whom it could not stop: whoever keeps
  // the list is told, so that the Captain can declare a warrant.
  if (away && beat.attacker && !beat.attacker.told) {
    beat.attacker.told = true;
    beat.outcomes.push({ what: 'attacked', name: beat.attacker.name });
  }
  const attacker = beat.attacker;
  const attackerSeen = attacker
    ? brain.peopleInView.find((person) => person.name === attacker.name)
    : undefined;
  // Nobody lays a hand on the Captain or a head of staff with no warrant. It stands, and whoever
  // keeps the list is told at once, so that the Captain can declare one.
  if (attacker && attackerSeen?.command && !attacker.told) {
    attacker.told = true;
    beat.outcomes.push({ what: 'attacked', name: attacker.name });
  }
  keep(
    brain,
    STOP,
    !!attacker &&
      !attacker.stopped &&
      !beat.hurt &&
      !!security?.has_baton &&
      !!attackerSeen &&
      !attackerSeen.command,
    'emergency',
  );
  return beat.warrants.length > 0 || beat.toFree.length > 0 || kit || away;
}

/**
 * Who it can ask to open a room it is shut out of: those the server says have an ID for one of
 * its doors, and failing them the Captain, whose ID opens every door. Never itself, and never
 * anyone it has a warrant on: the person it has come for is not asked to open the door.
 * Those are struck first, and the Captain is the one asked when nobody is left: a head wanted in
 * its own office is the only one listed for it, and the Captain's ID opens it too (PLAY-09).
 */
export function keepersOf(
  brain: NpcBrain,
  place: string,
  given?: unknown,
): string[] {
  const listed = Array.isArray(given)
    ? given.map(String)
    : (brain.security?.keepers?.[place] ?? []);
  const wanted = beatOf(brain).warrants.map((warrant) => warrant.name);
  const askable = (name: string) =>
    name !== brain.name && !wanted.some((other) => sameName(other, name));
  const names = listed.filter(askable);
  if (names.length > 0) {
    return names;
  }
  const captain = captainName(brain);
  return captain && askable(captain) ? [captain] : [];
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
  // The door it asks at: this room's, or that of the locked room this one lies inside. The
  // Quartermaster's Office opens off the Cargo Bay, so it is the Cargo Bay it has to be let into
  // first. Each door has its own people to ask.
  const door = doorFor(brain, shut.place);
  if (shut.door !== door) {
    shut.door = door;
    shut.asked = [];
    shut.askedAt = 0;
    shut.doorTries = 0;
  }
  const within =
    door === shut.place ? '' : `, which is reached through the ${door}`;
  // A door held open for it is the way in.
  if (brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door) {
    return {
      ready: true,
      step: `The door into the ${door} is being held open for you, and you are going through for ${name}.`,
      act: { tool: 'go_to', place: door },
    };
  }
  // It stands at the door it wants through, so that whoever opens it knows which one. A walk
  // there that comes to nothing is tried once more, at once, and then it asks from where it is:
  // the try is numbered so that the driver does not hold it back and send the body off on its
  // other warrant meanwhile.
  const atDoor = brain.atDoorOf === door;
  // The door it asked at stands open now, with no crew member holding it: someone let it in by
  // hand, as the Captain does with their own ID (ARR-06). Only the door it is standing at, and
  // only once it has asked: a locked room's door someone else happens to open is no invitation.
  // Numbered, so that a walk that just missed it shutting is not held back; three that came to
  // nothing, and it waits as before.
  const openWalks = more(warrant).openWalks ?? 0;
  if (
    atDoor &&
    atDoorOpen(brain) &&
    shut.asked.length > 0 &&
    openWalks < OPEN_WALKS
  ) {
    return {
      ready: true,
      step: `The door into the ${door} has been opened for you, and you are going through for ${name}.`,
      act: { tool: 'go_to', place: door, attempt: openWalks + 1 },
    };
  }
  const tries = shut.doorTries ?? 0;
  if (!atDoor && tries < DOOR_TRIES) {
    return {
      ready: true,
      step: `${name} is in the ${shut.place}${within}, which is locked to you. You are going to the door of the ${door}.`,
      act: { tool: 'go_to_door', place: door, attempt: tries + 1 },
    };
  }
  const last = shut.asked[shut.asked.length - 1];
  if (last && brain.now - shut.askedAt < LET_IN_WAIT_DS) {
    // At the door, whoever comes to open it has to find it standing there: the wait comes before
    // its other work, as a janitor's at a door does.
    return {
      ready: false,
      wait: true,
      asked: atDoor,
      step: `${name} is in the ${shut.place}${within}, which is locked to you. You have asked ${last} to let you into the ${door}, and are waiting${atDoor ? ' at the door' : ''}.`,
    };
  }
  // Whoever can open it and is in sight comes first, and is asked to their face (KNA-26). The
  // server's list as it is now is added to the one it gave when it was shut out: someone who has
  // come into sight since may be on it, and with no PDA it is only who is in sight.
  const listed = keepersOf(
    brain,
    door,
    door === shut.place ? shut.keepers : undefined,
  );
  const live = keepersOf(brain, door).filter(
    (keeper) => !listed.some((other) => sameName(other, keeper)),
  );
  const inSight = (keeper: string) =>
    brain.peopleInView.some((person) => sameName(person.name, keeper));
  const keepers = [
    ...[...listed, ...live].filter(inSight),
    ...listed.filter((keeper) => !inSight(keeper)),
  ];
  const next = keepers.find((keeper) => !shut.asked.includes(keeper));
  const extra = more(warrant);
  // At the door, it knocks first, once, for whoever is inside: as a janitor does, and a player.
  if (atDoor && extra.knockedAt !== door) {
    return {
      ready: true,
      step: `${name} is in the ${shut.place}${within}, which is locked to you. You are at the door of the ${door}, and are knocking.`,
      act: { tool: 'knock' },
    };
  }
  if (
    next &&
    atDoor &&
    inSight(next) &&
    shut.asked.length < LET_IN_ASKS
  ) {
    extra.sayingTo = next;
    const to = addressOf(next, jobOf(brain, next));
    return {
      ready: true,
      step: `${name} is in the ${shut.place}${within}, which is locked to you. ${next}'s ID opens the ${door}, and ${next} is in sight. You are asking them outright to let you in.`,
      say: letInLine(to, doorCalled(brain, door), door, name),
      exact: true,
      // The words take a moment. If the door has been opened for it meanwhile, asking would only
      // have it opened twice.
      sayIf: () =>
        !(
          (brain.doorHeld &&
            !brain.doorHeldOut &&
            brain.doorHeldFor === door) ||
          atDoorOpen(brain)
        ),
    };
  }
  // With no PDA there is nobody to write to: it waits at the door for someone who can open it to
  // come into sight, as long as three asks by PDA would have taken, before it gives up.
  if (
    !brain.hasPda &&
    atDoor &&
    shut.asked.length < LET_IN_ASKS &&
    brain.now - shut.at < LET_IN_ASKS * LET_IN_WAIT_DS
  ) {
    return {
      ready: false,
      wait: true,
      asked: true,
      step: `${name} is in the ${shut.place}${within}, which is locked to you. You have no PDA to ask anyone with, and are waiting at the door for someone who can open it to come by.`,
    };
  }
  if (!next || shut.asked.length >= LET_IN_ASKS || !brain.hasPda) {
    shut.gaveUp = true;
    return {
      ready: false,
      step: `${name} is in the ${shut.place}, which is locked to you, and nobody has let you in.`,
    };
  }
  const to = addressOf(next, jobOf(brain, next));
  return {
    ready: true,
    step: `${name} is in the ${shut.place}${within}, which is locked to you. ${next}'s ID opens the ${door}. You are sending ${next} a PDA message asking to be let in.`,
    act: {
      tool: 'message',
      person: next,
      text: atDoor
        ? letInLine(to, doorCalled(brain, door), door, name)
        : letInFarLine(to, door, name),
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
    // No cell will do: every one is in use, or dark (ARR-04). It waits with them in the brig, as
    // the plan says, not where it made the arrest, and tries again every 30 seconds.
    if (
      warrant.noCellAt !== undefined &&
      brain.now - warrant.noCellAt < NO_CELL_WAIT_DS
    ) {
      const dark = more(warrant).noCellWhy === 'no_power';
      const brig = brigPlace(brain);
      if (brig && brain.location !== brig) {
        return {
          ready: true,
          step: `You have ${name} by the arm, and ${dark ? "no cell's timer has power" : 'every cell is in use'}. You are taking them to the brig to wait there.`,
          act: { tool: 'go_to', place: brig },
        };
      }
      return {
        ready: false,
        wait: true,
        step: dark
          ? `You have ${name} by the arm, and no cell's timer in the brig has power: their displays are blank. You are waiting with them in the brig, and will try the cells again shortly.`
          : `You have ${name} by the arm, and every cell in the brig is in use. You are waiting for one to come empty.`,
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
  // In a cell already, let go, and it could not get back out past them a moment ago (PLAY-01). It
  // is not arrested again and walked to the next cell: it walks out and starts this cell's timer.
  // The server finds that it is the same cell and only that is left.
  const stuck = stuckOf(warrant);
  if (stuck) {
    if (
      !security?.holding &&
      stuck.tries <= STUCK_TRIES &&
      brain.now - stuck.at < STUCK_FRESH_DS
    ) {
      return {
        ready: true,
        step: `You have put ${name} in ${stuck.cell} and let go, and could not get past them to its door a moment ago. You are stepping out to its timer to start it.`,
        act: {
          tool: 'jail',
          minutes: minutesFor(warrant),
          attempt: (warrant.cellAttempts ?? 0) + 1,
        },
      };
    }
    setStuck(warrant, undefined);
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
    if (headSpared(brain, warrant)) {
      return {
        ready: false,
        step: `${seen.name} is here, and is a head of staff. Only the Captain may have a head arrested, and the Captain did not declare this warrant. You leave them be, and report that you cannot bring them in.`,
      };
    }
    if (brain.now < warrant.restUntil) {
      return {
        ready: false,
        step: `${seen.name} is here, and you could not take them a moment ago. You are leaving them be for now. The warrant stands.`,
      };
    }
    // In cuffs that it did not put on, and someone else has them by the arm: two do not pull at
    // one prisoner, so it leaves them to whoever has them. In cuffs with nobody holding them (the
    // Captain cuffed them and let go), it takes them by the arm itself. Until the server says who
    // is pulling whom, it leaves them, as before.
    if (seen.cuffed && !warrant.cuffedByMe && heldByAnother(brain, seen)) {
      return {
        ready: false,
        step: `${seen.name} is in cuffs already. Someone else from security has made the arrest, and you are leaving them to it.`,
      };
    }
    // In its own cuffs and got loose of its hold: it takes hold again.
    if (seen.cuffed) {
      return {
        ready: true,
        step: warrant.cuffedByMe
          ? `${seen.name} is in cuffs and not in your hold. You are taking them by the arm again.`
          : `${seen.name} is in cuffs, and nobody has them by the arm. You are taking them by the arm.`,
        act: {
          tool: 'arrest',
          person: seen.handle,
          how: 'quiet',
          attempt: (more(warrant).arrestAttempts ?? 0) + 1,
        },
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
    // A walk at them has already failed with them in that room: near or far, fought back or not,
    // the baton cannot reach them until someone lets it in.
    const far = (seen.distance ?? 0) > NEAR;
    if (warrant.shutOut) {
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
      // Said once, and again only where a fresh telling is right: after a rest, after losing them,
      // after a door between them (each sets toldAt back to null). Said every 45 seconds, each
      // saying was held back longer by the driver, and the arrest waited behind it (ARR-01).
      if (warrant.toldAt === null) {
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
      // Numbered, as the tries at a cell are: a try that came to nothing is not held back longer
      // each time by the driver (ARR-01). The plan paces them itself: three, then a rest.
      act: {
        tool: 'arrest',
        person: seen.handle,
        how: force ? 'force' : 'quiet',
        attempt: (more(warrant).arrestAttempts ?? 0) + 1,
      },
      dropsWalk: true,
    };
  }
  // Not in sight. Where they were last seen, if that is fresh and it has not looked there since.
  const sighting = warrant.lastSeen;
  // Engineering has forced the way open: it goes in, whatever it found there before. Twice at
  // most: a room further in may be locked as well, and that one is asked about in its turn.
  const forced = warrant.opened;
  if (
    sighting &&
    forced &&
    brain.now - forced.at < OPENED_DS &&
    (forced.tries ?? 0) < 2 &&
    brain.location !== sighting.place &&
    !warrant.shutOut &&
    (forced.place === sighting.place ||
      doorFor(brain, sighting.place) === forced.place)
  ) {
    return {
      ready: true,
      step: `Engineering has opened the ${forced.place}. You are going in for ${name}, to the ${sighting.place}.`,
      act: {
        tool: 'go_to',
        place: sighting.place,
        attempt: (forced.tries ?? 0) + 1,
      },
    };
  }
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
    // It looks in two legs (KNA-23): from where it came in, then from the middle of the room, each
    // timed from its own arrival. Stood by the door, it saw seven tiles of a room twice as long.
    const look = more(warrant);
    if (look.lookFor !== sighting.at) {
      look.lookFor = sighting.at;
      look.lookLeg = 0;
      look.lookWalks = 0;
    }
    if ((look.lookLeg ?? 0) === 0) {
      if (brain.now - brain.inPlaceSince < LOOK_DS) {
        return {
          ready: false,
          wait: true,
          step: `You are in the ${sighting.place}, where ${name} was last seen, and are looking for them.`,
        };
      }
      look.lookLeg = 1;
    }
    if (look.lookLeg === 1) {
      return {
        ready: true,
        step: `You are in the ${sighting.place}, where ${name} was last seen, and cannot see them from here. You are walking to the middle of the room to look.`,
        act: {
          tool: 'go_to',
          place: sighting.place,
          middle: true,
          attempt: (look.lookWalks ?? 0) + 1,
        },
      };
    }
    if (brain.now - (look.lookLegAt ?? 0) < LOOK_MIDDLE_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the middle of the ${sighting.place}, where ${name} was last seen, and are looking for them.`,
      };
    }
    warrant.lookedAt = brain.now;
  }
  // No sighting to follow. It walks the main hallways, one after the other, and looks.
  const halls = hallways(brain);
  const round = beat.round;
  let walking = round.next > 0 || brain.now - round.at > BETWEEN_WALKS_DS;
  // A hallway it has just found no way into is passed over, and the round goes on to the next.
  // The server lets the place go again after a while, or when the fire doors lift.
  if (walking) {
    while (
      round.next < halls.length &&
      brain.blockedPlaces.includes(halls[round.next])
    ) {
      round.next += 1;
    }
    if (halls.length > 0 && round.next >= halls.length) {
      round.next = 0;
      round.at = brain.now;
      walking = false;
    }
  }
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
    // What it cannot see, it does not know: in the dark it sees only what is beside it (CHEAT-15).
    return {
      ready: false,
      step: `You do not see ${name} in the ${hall}.`,
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
    if (!warrant) {
      return {
        ready: false,
        step: 'That warrant is no longer yours to serve.',
      };
    }
    // In the middle of arresting someone else: this one waits until that arrest is done, so the
    // cuffs going on are not walked away from when the other comes into sight.
    const last = brain.lastAct;
    if (
      last?.act.tool === 'arrest' &&
      last.task !== undefined &&
      last.task !== task.id
    ) {
      return {
        ready: false,
        wait: true,
        step: `You are in the middle of arresting someone else. ${warrant.name} waits.`,
      };
    }
    return serveStep(brain, warrant);
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
        // Getting out of reach breaks off an arrest under way (ARR-08).
        breaksIn: true,
      };
    }
    const post = brain.post ?? brigPlace(brain);
    if (post && brain.location !== post) {
      return {
        ready: true,
        step: `${by} is attacking you, and you cannot stop them${beat.hurt ? ': you are hurt' : ''}. You are getting out of their reach, back to the ${post}.`,
        act: { tool: 'go_to', place: post },
        breaksIn: true,
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
    if (seen?.command) {
      return {
        ready: false,
        step: `${seen.name} attacked you, but they are a head of staff. With no warrant you do not lay a hand on them.`,
      };
    }
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

/** Notes that it has told someone they are under arrest, or asked someone aloud to let it in. */
export function beatAfterSaying(brain: NpcBrain, called: string | null): void {
  // Asked aloud to be let in (KNA-26): that is one asked, as a PDA message is, and the wait runs
  // from here.
  if (called && LET_IN_WORDS.test(called)) {
    for (const warrant of beatOf(brain).warrants) {
      const extra = more(warrant);
      const shut = warrant.shutOut;
      if (shut && extra.sayingTo && called.includes(warrant.name)) {
        shut.asked.push(extra.sayingTo);
        shut.askedAt = brain.now;
        extra.sayingTo = undefined;
      }
    }
    return;
  }
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

/**
 * An arrest has come back with the cuffs on, and no warrant in its hands is for it: the warrant
 * was pardoned, taken back or handed back while the cuffs were going on, and its serve task may
 * be finished and gone too. Whoever the arrest was on is named by the task, by whom the server
 * says it was on, or by whom it now holds.
 *
 * Someone a list it keeps still has a warrant on (handed back mid-arrest, ARR-13) is wanted: the
 * warrant is taken back into its hands and they go to a cell. Only one whose warrant was dropped
 * by a pardon or taken back (TRB-02) is let go. Returns the warrant taken back, if one was.
 */
function cuffedOnNoWarrant(
  brain: NpcBrain,
  act: Action,
  task: Task | undefined,
  details: SenseEvent['details'],
): BeatWarrant | undefined {
  const beat = beatOf(brain);
  const handle = String(details.handle ?? act.person ?? '');
  const name =
    (task?.kind === SERVE ? task.item : undefined) ??
    brain.peopleInView.find((person) => !!handle && person.handle === handle)
      ?.name ??
    brain.security?.holding ??
    undefined;
  if (!name) {
    return undefined;
  }
  const fits = (wanted: string) =>
    sameName(wanted, name) || sameName(name, wanted);
  // Another warrant on them in its hands since (declared again): that one is served.
  const held = beat.warrants.find((it) => fits(it.name));
  if (held) {
    return held;
  }
  // Still on the list it keeps: it was handed back, not given up. It sees it through.
  const listed = brain.desk?.warrants.find((it) => fits(it.name));
  if (listed) {
    giveWarrant(brain, {
      name: listed.name,
      reason: listed.reason,
      minutes: listed.minutes,
      byCaptain: /captain/i.test(listed.byJob),
    });
    const desk = brain.desk;
    // Its officer is not given it as well, until it lets go of them.
    if (desk?.servedBy && !desk.keptBack?.includes(listed.name)) {
      desk.keptBack = [...(desk.keptBack ?? []), listed.name];
    }
    return beat.warrants.find((it) => it.name === listed.name);
  }
  // Pardoned or taken back while the cuffs were going on: they are let go, as a pardon of
  // someone already by the arm is.
  const dropped = (beat.dropped ?? []).find(
    (it) => fits(it.name) && brain.now - it.at < DROPPED_DS,
  );
  if (dropped && !beat.toFree.some((it) => sameName(it.name, dropped.name))) {
    beat.toFree.push({
      name: dropped.name,
      pardoned: dropped.pardoned,
      tries: 0,
    });
  }
  return undefined;
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
  let warrant =
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
  // A walk down the hallways that could not reach the one it was making for: the round goes on
  // to the next, before the server's list of places it cannot get to comes in.
  if (warrant && !ok && act.tool === 'go_to' && act.attempt === undefined) {
    const halls = hallways(brain);
    const round = beat.round;
    if (halls[round.next] === act.place) {
      round.next += 1;
      if (round.next >= halls.length) {
        round.next = 0;
        round.at = brain.now;
      }
      return;
    }
  }
  // A knock at the door it asks at (KNA-26): once a door, whether or not anyone heard it.
  if (warrant?.shutOut && act.tool === 'knock') {
    more(warrant).knockedAt = warrant.shutOut.door ?? warrant.shutOut.place;
    return;
  }
  // The walk to the middle of the room of a sighting (KNA-23): the look from there starts now. One
  // that came to nothing is tried once more, then it looks from where it stands.
  if (warrant && act.tool === 'go_to' && act.middle && act.attempt !== undefined) {
    const look = more(warrant);
    if (look.lookLeg === 1) {
      look.lookWalks = (look.lookWalks ?? 0) + 1;
      if (ok || look.lookWalks >= 2) {
        look.lookLeg = 2;
        look.lookLegAt = brain.now;
      }
    }
    return;
  }
  // A walk through the door it asked at, found open, is counted when it comes to nothing (ARR-06).
  if (
    warrant?.shutOut &&
    !warrant.opened &&
    act.tool === 'go_to' &&
    act.attempt !== undefined
  ) {
    more(warrant).openWalks = ok ? 0 : (more(warrant).openWalks ?? 0) + 1;
    return;
  }
  // A walk into a room engineering opened that came to nothing is counted.
  if (warrant?.opened && act.tool === 'go_to' && act.attempt !== undefined) {
    if (!ok) {
      warrant.opened.tries = (warrant.opened.tries ?? 0) + 1;
    }
    return;
  }
  // A walk to the door of a room it is shut out of that came to nothing is counted: after two it
  // asks from where it stands.
  if (warrant?.shutOut && act.tool === 'go_to_door') {
    if (!ok) {
      warrant.shutOut.doorTries = (warrant.shutOut.doorTries ?? 0) + 1;
    }
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
        // Refused because they are the Captain or a head of staff: still word for the list.
        const spared =
          details.reason === 'captain' || details.reason === 'command';
        if ((ok || spared) && !attacker.told) {
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
    // The cuffs went on, and the warrant left its hands while they were going on (TRB-02,
    // ARR-13). Its serve task may be gone with it, so the person is found by whom the arrest
    // named.
    const served =
      warrant ??
      (ok || details.cuffed
        ? cuffedOnNoWarrant(brain, act, task, details)
        : undefined);
    if (!served) {
      return;
    }
    warrant = served;
    warrant.walkedUp = false;
    // Each try that came to nothing is numbered afresh, whatever stopped it (ARR-01).
    if (!ok) {
      more(warrant).arrestAttempts = (more(warrant).arrestAttempts ?? 0) + 1;
    }
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
    // The server would not let it lay a hand on them: they carry a Captain's ID. That is no try
    // and no refusal to stand still. They are passed over a while, and the list is told why, once.
    if (reason === 'captain') {
      warrant.refused = [
        ...(warrant.refused ?? []).filter(
          (it) => brain.now - it.at < REFUSED_DS,
        ),
        { handle: String(details.handle ?? act.person ?? ''), at: brain.now },
      ];
      warrant.toldAt = null;
      beat.cannotTold ??= {};
      const key = `${warrant.name}|${CAPTAIN_CARD}`;
      if (beat.cannotTold[key] === undefined) {
        beat.cannotTold[key] = brain.now;
        beat.outcomes.push({
          what: 'cannot',
          name: warrant.name,
          why: CAPTAIN_CARD,
        });
      }
      return;
    }
    // Refused for itself or for a kind of arrest it does not know: no try at them.
    if (reason === 'self' || reason === 'how') {
      return;
    }
    // It could not get to them, and can still see them: a door or a counter is between them.
    // That is not losing them. It asks to be let in.
    // In its own room, behind a counter or a shut fire door, or with nobody to ask: there is no
    // door to ask at, so it is a try that came to nothing like any other, and after three it
    // rests and says why.
    if (reason === 'no_way') {
      const asking = noteShutOut(
        brain,
        warrant,
        String(details.place ?? target(brain, warrant)?.place ?? ''),
        details.keepers,
      );
      if (asking || warrant.shutOut) {
        warrant.toldAt = null;
        return;
      }
    }
    // Knocked down itself before it was done: that is no try at them, and says nothing of
    // whether they would stand still. It goes at them again once it is up.
    if (reason === 'down') {
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
      // Someone it cannot get to needs no telling again: they heard it the first time.
      if (reason !== 'no_way') {
        warrant.toldAt = null;
      }
      warrant.lastSeen = { place: brain.location, at: brain.now };
      warrant.lookedAt = brain.now;
      if (reason === 'lost') {
        warrant.restUntil = 0;
        beat.outcomes.push({
          what: 'lost',
          name: warrant.name,
          place: brain.location,
        });
      } else {
        // Three tries have come to nothing and they are still in front of it. That is not losing
        // them: it sent "I lost Pun Pun in the Bar Lounge" standing a step from the monkey. It
        // takes a short rest and goes at them again, and whoever keeps the list is told why
        // there is no arrest yet, once.
        warrant.restUntil = brain.now + REST_DS;
        beat.cannotTold ??= {};
        const why = reason === 'no_way' ? NO_WAY_TO_THEM : WILL_NOT_STAND;
        const key = `${warrant.name}|${why}`;
        if (beat.cannotTold[key] === undefined) {
          beat.cannotTold[key] = brain.now;
          beat.outcomes.push({
            what: 'cannot',
            name: warrant.name,
            why,
          });
        }
      }
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
        at: brain.now,
      } as JailedMore;
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
    const reason = String(details.reason ?? '');
    // Knocked down itself on the way in or out: the cell did not refuse them, and they did not get
    // away. The same try is made again once it is up. It keeps its number, so that the try is
    // held back like any step that failed, and not made over and over while it lies there.
    if (reason === 'down') {
      return;
    }
    warrant.cellAttempts = (warrant.cellAttempts ?? 0) + 1;
    // In the cell and let go, and it could not get back out past them (PLAY-01). The cell did not
    // refuse them: no cell try is counted and no other cell is gone to. It steps out to this
    // one's timer next (serveStep). Tried again, the time it was first stuck is kept.
    if (reason === 'stuck_inside') {
      const before = stuckOf(warrant);
      const cell = String(details.cell ?? before?.cell ?? 'the cell');
      setStuck(warrant, {
        cell,
        at: before && before.cell === cell ? before.at : brain.now,
        tries: before && before.cell === cell ? before.tries + 1 : 1,
      });
      return;
    }
    setStuck(warrant, undefined);
    // No cell will do, in use or dark (ARR-04). Counted: after the second, whoever keeps the list
    // is told why there is no cell for them (syncBeat).
    if (reason === 'no_cell' || reason === 'no_power') {
      warrant.noCellAt = brain.now;
      more(warrant).noCellTries = (more(warrant).noCellTries ?? 0) + 1;
      more(warrant).noCellWhy = reason;
      return;
    }
    more(warrant).noCellTries = 0;
    // The cell would not take them, and it still has them by the arm: the next cell, at once. (Only
    // on the walk in does it still hold them; the walk out after letting go is stuck_inside.)
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

/**
 * A line the model wrote for a security body, screened for a warrant talked about. If it names
 * someone it has a warrant on and does not yet hold (or one of `others`, for whoever keeps the
 * list), and it is not said to security, the Captain or a head of staff, the plain line to say in
 * its place: said before it has a hand on them, it is a warning to run. NULL to say it as it is.
 * Not for its own fixed lines, the arrest line among them: those are code's words.
 */
export function warrantTalk(
  brain: NpcBrain,
  text: string,
  to: string | null,
  others: string[] = [],
): string | null {
  if (to) {
    const seen = brain.peopleInView.find((person) => person.name === to);
    if (seen?.command || /security|warden|captain/i.test(jobOf(brain, to))) {
      return null;
    }
  }
  const names = [
    ...beatOf(brain)
      .warrants.filter((warrant) => !holds(brain, warrant))
      .map((warrant) => warrant.name),
    ...others,
  ];
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const named = names.some((name) => {
    if (sameName(name, text)) {
      return true;
    }
    // Their first name alone, when it is a name of its own and not a short word.
    const first = name.toLowerCase().split(/[^a-z0-9]+/)[0] ?? '';
    return (
      name.includes(' ') &&
      first.length >= 3 &&
      first !== brain.name.toLowerCase().split(/[^a-z0-9]+/)[0] &&
      lower.includes(` ${first} `)
    );
  });
  if (!named) {
    return null;
  }
  // A greeting keeps only who it is.
  return sameName(brain.name, text)
    ? `I am ${brain.name}, security.`
    : 'I am on security business.';
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
  // Where no cell it knows of is in the Brig (Tramstation's are in the department checkpoints),
  // it waits by the nearest cell's room instead (MAP-04).
  const rooms = (brain.security?.cells ?? []).filter((cell) => !!cell.room);
  if (
    rooms.length > 0 &&
    !rooms.some((cell) => new RegExp(`^${BRIG}\\b`).test(cell.room as string))
  ) {
    const nearest = rooms
      .filter((cell) => knowsPlace(brain, cell.room as string))
      .sort(
        (a, b) => (a.dist ?? Number.MAX_VALUE) - (b.dist ?? Number.MAX_VALUE),
      )[0];
    if (nearest) {
      return nearest.room as string;
    }
  }
  return knowsPlace(brain, BRIG) ? BRIG : null;
}
