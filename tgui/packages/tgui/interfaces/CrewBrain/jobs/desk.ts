/**
 * Security's desk: keeping the list of who is wanted.
 *
 * This is the Head of Security's work. With no Head of Security aboard, an officer keeps the
 * list itself, in the same way.
 *
 * - The Captain, or a head of department, declares a warrant: by PDA, or to its face. "Warrant
 *   for Pun Pun, for wrecking the Custodial Closet." Code reads who, what for and how long. It
 *   answers word for word, so that whoever declared it sees what was understood. Nobody else can
 *   declare one. Nobody declares one on the Captain or on security's own staff, and only the
 *   Captain declares one on a head.
 * - A warrant a head declares is copied to the Captain.
 * - Each time the list changes, every other head of department is sent the whole of it by PDA,
 *   and sends word back. One that does not answer in a minute is sent it once more. After that
 *   the Captain is told which head it did not reach.
 * - The warrant is given to the officer, to its face if it is there and by PDA if not. With no
 *   officer aboard, or the officer hurt, whoever keeps the list serves it with its own hands.
 * - Word of a sighting comes here, from anyone. The newest is passed to whoever is serving the
 *   warrant.
 * - How a warrant went comes back here. Someone put in a cell comes off the list, and the
 *   Captain and whoever declared the warrant are told which cell and for how long.
 * - The Captain can pardon anyone: a warrant not yet served, an arrest under way, or time in a
 *   cell. Only the Captain. A head can take back a warrant of its own.
 *
 * All of that is code, the names and the minutes included. There are no laws yet: the reason on
 * a warrant is whatever was said. The LLM answers people in its voice.
 */
import { isHead } from '../hierarchy';
import { addTask, findTask, finishTask, placeNamedIn } from '../tasks';
import type {
  Action,
  DeskWork,
  NpcBrain,
  Plan,
  SecurityOutcome,
  SenseEvent,
  Task,
  Warrant,
} from '../types';
import {
  arrestAgain,
  beatOf,
  brigPlace,
  dropWarrant,
  forgetWarrant,
  giveWarrant,
  handBack,
  noteSeen,
  takeOutcomes,
} from './arrests';
import { askEngineering } from './forcing';
import { captainName } from './head';
import {
  addressOf,
  againLine,
  cancelAsked,
  closeIn,
  copyLine,
  EARLY,
  firstName,
  GIVE_WORDS,
  giveLine,
  HEARD_WORDS,
  heardLine,
  isNoName,
  isOfficer,
  isSecurity,
  letGoLine,
  looksLikeOrder,
  MINUTES_USUAL,
  mendWords,
  NOTICE_ACK_WORDS,
  nameIn,
  notFollowedLine,
  nothingAgainstLine,
  noticeLines,
  noWarrantLine,
  outcomeLine,
  pardonAsked,
  pardonedLine,
  pardonNamed,
  pardonToldLine,
  REFUSALS,
  type Reading,
  readGiven,
  readingAsOrder,
  readOutcome,
  readPardon,
  readTerm,
  readWarrant,
  SIGHTING_WORDS,
  sameName,
  seenLine,
  servedLine,
  sightedName,
  TRY_AGAIN_WORDS,
  takenLine,
  termLine,
  WARRANT_ACK_WORDS,
  withdrawnLine,
} from './security';

/** Sending the heads of department the list of who is wanted. */
const NOTICE = 'security_notice';
/** Giving its officer a warrant. The task's item is who the warrant is on. */
const GIVE = 'give_warrant';
/** Going to the cells to let out someone its officer has not let out. The task's item is who (TRB-11). */
const RELEASE = 'release_prisoner';
/** How long (deciseconds) it waits for its officer to say someone is free before it goes to let them out itself (TRB-11). */
const RELEASE_WAIT_DS = 1200;

/** How long (deciseconds) it waits for a head's word that it has the notice, and how many times the notice is sent. */
const ACK_WAIT_DS = 600;
const NOTICE_TRIES = 2;
/** How long (deciseconds) it waits to hear that its officer has a warrant, and how many times it gives it before it takes it as heard. */
const TAKEN_WAIT_DS = 600;
const GIVE_TRIES = 3;
/** How far off (tiles) its officer has to be standing before it walks up to them to speak. */
const SPEAKING_DISTANCE = 2;
/** How long (deciseconds) a new warrant, and how long a sighting, keeps its officer out and no staff meeting called. */
const NEW_WARRANT_DS = 1200;
const LEAD_FRESH_DS = 3000;
/** How often (milliseconds), at most, it says that it did not follow something. */
const NOT_FOLLOWED_EVERY_MS = 60000;
/** How long (deciseconds) before a sighting in the same room is passed on again. */
const PASS_AGAIN_DS = 1200;
/** The most characters a body can say at once, or send in one PDA message. */
const SAID_MAX = 200;

/** How long (deciseconds) the same word from its staff on how a warrant went is taken once only (ARR-05). */
const SAME_WORD_DS = 6000;

/**
 * What the desk keeps beyond DeskWork in types.ts. These belong on DeskWork, Warrant and the
 * held list there, and are kept here until that file is free to change.
 */
type DeskMore = DeskWork & {
  /** Each word from its staff on how a warrant went, by "what|name|from|cell|why", and when it came (ARR-05). */
  lately?: Record<string, number>;
  /**
   * Prisoners its officer put in a cell and has been told to let go, until it says they are free
   * (TRB-11): the cell, when the word went, whether it was a pardon, which officer was told, and
   * whether it has gone to do it itself.
   */
  toRelease?: {
    name: string;
    cell: string;
    until: number;
    pardoned: boolean;
    at: number;
    officer: string | null;
    going?: boolean;
  }[];
  /** The officer that broke off hurt, so that "try again" goes to that one. */
  hurtOfficer?: string;
};

/** The desk with what it keeps beyond DeskWork. */
function moreOf(brain: NpcBrain): DeskMore {
  return deskOf(brain) as DeskMore;
}

/** A warrant, with the officer it was given to (MULTI-01). */
type WarrantMore = Warrant & { officer?: string };
/** Someone in a cell, with the officer who put them there (MULTI-01) and when (TRB-06). */
type HeldMore = DeskWork['held'][string] & { by?: string; at?: number };

/** How long (deciseconds) after someone is put in a cell before seeing them out of one counts: what it sees of the cells may be a moment behind. */
const SEEN_OUT_AFTER_DS = 150;

/**
 * TRUE if someone it has in a cell is in view, and in no cell it can see running with them in it
 * (TRB-06). Someone in view inside a cell puts that cell in sight, so a cell it cannot see is no
 * cell they are in.
 */
function seenOut(brain: NpcBrain, name: string, held: HeldMore): boolean {
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

/** TRUE if this officer is still aboard as far as it can tell: in view, or on its PDA. */
function officerKnown(brain: NpcBrain, name: string): boolean {
  return [...brain.peopleInView, ...brain.pdaPeople].some(
    (person) => person.name === name && isOfficer(person.job),
  );
}

/**
 * The officer a warrant goes to: the one it was given to, while that one is still aboard and its
 * officers are not out, and otherwise whoever serving() picks (MULTI-01). With two officers, the
 * word on one warrant all goes to one of them. Null if it serves the warrant itself.
 */
function officerFor(brain: NpcBrain, warrant: Warrant): string | null {
  const officer = serving(brain);
  const holder = (warrant as WarrantMore).officer;
  return officer && holder && officerKnown(brain, holder) ? holder : officer;
}

/**
 * TRUE if this word on how a warrant went has come already, lately: the same word said to its
 * face and then sent again by the server's own copy of a PDA that would not send at the time
 * (ARR-05). A new warrant on the person, or their getting away, starts afresh.
 */
function heardAlready(
  brain: NpcBrain,
  outcome: SecurityOutcome,
  from: string,
): boolean {
  const desk = moreOf(brain);
  const lately = Object.fromEntries(
    Object.entries(desk.lately ?? {}).filter(
      ([, at]) => brain.now - at < SAME_WORD_DS,
    ),
  );
  desk.lately = lately;
  const key = [
    outcome.what,
    outcome.name,
    from,
    outcome.cell ?? '',
    outcome.why ?? '',
  ].join('|');
  if (lately[key] !== undefined) {
    return true;
  }
  if (outcome.what === 'lost') {
    forgetWords(brain, (_what, who) => sameName(outcome.name, who));
  }
  desk.lately ??= {};
  desk.lately[key] = brain.now;
  return false;
}

/** Forgets the words lately come that `which` picks: what comes next of them is new (ARR-05). */
function forgetWords(
  brain: NpcBrain,
  which: (what: string, who: string) => boolean,
): void {
  const desk = moreOf(brain);
  desk.lately = Object.fromEntries(
    Object.entries(desk.lately ?? {}).filter(([key]) => {
      const [what, who] = key.split('|');
      return !which(what, who);
    }),
  );
}

/** The list it keeps. Made the first time it is asked for. */
export function deskOf(brain: NpcBrain): DeskWork {
  brain.desk ??= {
    warrants: [],
    serial: 0,
    noticed: {},
    held: {},
    officerOut: null,
    arrests: 0,
  };
  return brain.desk;
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** Everyone it knows of by name: in view, on its PDA, or seen before. */
function knownNames(brain: NpcBrain): string[] {
  return [
    ...new Set([
      ...brain.peopleInView.map((person) => person.name),
      ...brain.pdaPeople.map((person) => person.name),
      ...brain.people.keys(),
    ]),
  ].filter((name) => name !== brain.name);
}

/** An officer aboard other than itself: one in sight if there is one, and failing that the first its PDA lists. */
export function officerAboard(brain: NpcBrain): string | null {
  const isOther = (person: { name: string; job: string }) =>
    isOfficer(person.job) && person.name !== brain.name;
  return (
    brain.peopleInView.find(isOther)?.name ??
    brain.pdaPeople.find(isOther)?.name ??
    null
  );
}

/** The officer its warrants go to, or null if it serves them itself: there is none, or the one there is has broken off. */
function serving(brain: NpcBrain): string | null {
  return deskOf(brain).officerOut ? null : officerAboard(brain);
}

/** Says or sends something to someone, in so many words: to their face if that is how they spoke, by PDA if not. */
function reply(
  brain: NpcBrain,
  to: string,
  line: string,
  aloud: boolean,
  why: string,
): void {
  brain.toTell = brain.toTell.filter(
    (tell) => !(tell.to === to && tell.line === line),
  );
  brain.toTell.push(
    aloud
      ? {
          to,
          line: line.slice(0, SAID_MAX),
          why,
          exact: true,
          // Whoever declared it is standing waiting on the answer.
          whileBusy: true,
          at: Date.now(),
        }
      : { to, line: line.slice(0, SAID_MAX), why, byPda: true, at: Date.now() },
  );
}

/** Tells the Captain something by PDA, if there is a Captain aboard. */
function tellCaptain(brain: NpcBrain, line: string, why: string): void {
  const captain = captainName(brain);
  if (captain) {
    reply(brain, captain, line, false, why);
  }
}

/**
 * Tells its officer something outside a warrant: to its face if it is there, by PDA if not. `to`
 * is the officer it is about, if it knows which (MULTI-01); else any officer aboard.
 */
function tellOfficer(
  brain: NpcBrain,
  line: string,
  why: string,
  to?: string | null,
): void {
  const officer = to ?? officerAboard(brain);
  if (!officer) {
    return;
  }
  const here = brain.peopleInView.some((person) => person.name === officer);
  brain.toTell.push({
    to: officer,
    line,
    why,
    byPda: !here,
    exact: true,
    at: Date.now(),
  });
}

/** Who is still wanted, and where each was last seen, as a sentence. '' if nobody is. */
export function stillWanted(brain: NpcBrain): string {
  const desk = deskOf(brain);
  if (desk.warrants.length === 0) {
    return '';
  }
  return `Still wanted: ${desk.warrants
    .map(
      (warrant) =>
        `${warrant.name}${
          desk.cuffed?.[warrant.name] !== undefined
            ? ', in cuffs and on the way to a cell'
            : warrant.lastSeen
              ? `, last seen in the ${warrant.lastSeen.place}`
              : ''
        }`,
    )
    .join('; ')}.`;
}

/**
 * TRUE while a warrant is newly declared, or someone wanted has lately been seen: its officer is
 * out after them, and is not called in to a staff meeting.
 */
export function leadIsFresh(brain: NpcBrain): boolean {
  return deskOf(brain).warrants.some(
    (warrant) =>
      brain.now - warrant.at < NEW_WARRANT_DS ||
      (!!warrant.lastSeen && brain.now - warrant.lastSeen.at < LEAD_FRESH_DS),
  );
}

/** Who is in the cells, as a sentence. '' if nobody is. */
export function inTheCells(brain: NpcBrain): string {
  const held = Object.entries(deskOf(brain).held);
  return held.length === 0
    ? ''
    : `In the cells: ${held.map(([name, cell]) => `${name} in ${cell.cell}`).join('; ')}.`;
}

/** Takes a warrant off the list, and has whoever it was on let go if anyone has them. */
function strike(brain: NpcBrain, name: string, pardoned: boolean): void {
  const desk = deskOf(brain);
  const warrant = desk.warrants.find((it) => sameName(name, it.name));
  const held = Object.keys(desk.held).find((it) => sameName(name, it));
  const heldBy = held ? desk.held[held] : undefined;
  if (warrant) {
    desk.warrants = desk.warrants.filter((it) => it !== warrant);
    desk.serial += 1;
  }
  if (held) {
    delete desk.held[held];
  }
  const who = warrant?.name ?? held ?? name;
  if (desk.cuffed) {
    delete desk.cuffed[who];
  }
  // Whoever may have them lets them go: the officer it gave the warrant to, or who put them in
  // the cell, if it is still aboard (MULTI-01), else any officer aboard; and itself.
  const theirs =
    (warrant as WarrantMore | undefined)?.officer ??
    (heldBy as HeldMore | undefined)?.by;
  const officer =
    theirs && officerKnown(brain, theirs) ? theirs : officerAboard(brain);
  if (officer && (held || (warrant && warrant.given !== 'no'))) {
    tellOfficer(
      brain,
      letGoLine(officer, who, pardoned),
      `${who} is to be let go${pardoned ? ': the Captain has pardoned them' : ''}. You are telling your officer.`,
      officer,
    );
  }
  // Someone its officer put in a cell is let out by the officer. If no word comes that they are
  // free, it goes and does it itself (TRB-11). One it put there itself is in its own hands.
  const more = moreOf(brain);
  more.toRelease = (more.toRelease ?? []).filter(
    (it) => !sameName(who, it.name),
  );
  if (held && heldBy && (heldBy as HeldMore).by !== brain.name) {
    more.toRelease.push({
      name: held,
      cell: heldBy.cell,
      until: heldBy.until,
      pardoned,
      at: brain.now,
      // An officer out hurt is letting nobody out: it goes itself at once.
      officer: serving(brain) ? (officer ?? null) : null,
    });
  }
  dropWarrant(brain, who, pardoned);
}

/** The officer who is letting someone out of a cell for it, if one is (TRB-11). */
function releasedBy(brain: NpcBrain, name: string): string | null {
  return (
    moreOf(brain).toRelease?.find((it) => sameName(name, it.name))?.officer ??
    null
  );
}

/** How long (deciseconds) after a warrant is declared a time said with no name is taken to be for it. */
const TERM_AFTER_DS = 3000;

/** Changes how long a warrant earns, and sees that whoever is serving it hears of it. */
function setTerm(brain: NpcBrain, warrant: Warrant, minutes: number): void {
  warrant.minutes = minutes;
  // Its officer is given the warrant again, with the new time on it.
  if (warrant.given !== 'no') {
    warrant.given = 'no';
    warrant.gives = 0;
  }
  // Serving it itself, its own copy is put right.
  giveWarrant(brain, {
    name: warrant.name,
    reason: warrant.reason,
    minutes,
    onlyIfHeld: true,
  });
}

/**
 * Takes what has been said or sent to it, if it is security's business: a warrant declared, one
 * taken back, a pardon, word of how a warrant went, or word of where someone is. `aloud` is TRUE
 * if it was said in its hearing. Returns TRUE if it was any of those.
 */
export function deskTakes(
  brain: NpcBrain,
  from: string,
  fromJob: string,
  written: string,
  aloud: boolean,
): boolean {
  const desk = deskOf(brain);
  const to = addressOf(from, fromJob);
  // Its own staff say their lines word for word. Anyone else may have typed in a hurry: the
  // words an order turns on are put right before it is read.
  const text = isSecurity(fromJob)
    ? written
    : mendWords(written, knownNames(brain));
  // A head saying it has the notice.
  if (NOTICE_ACK_WORDS.test(text)) {
    const state = desk.noticed[from];
    if (state) {
      state.acked = true;
    }
    return true;
  }
  // Its own staff: that they have a warrant, or how one went.
  if (isSecurity(fromJob)) {
    if (WARRANT_ACK_WORDS.test(text)) {
      // Only the warrants given to whoever says it (MULTI-01).
      for (const warrant of desk.warrants) {
        const to = (warrant as WarrantMore).officer;
        if (warrant.given === 'said' && (!to || to === from)) {
          warrant.given = 'taken';
        }
      }
      return true;
    }
    const outcome = readOutcome(text);
    if (outcome) {
      if (outcome.what === 'lost') {
        outcome.place = placeNamedIn(brain, text.toLowerCase());
      }
      deskOutcome(brain, outcome, from, aloud);
      return true;
    }
    // Word of where someone wanted is, from its own staff: given to them to their face (PLAY-03).
    // They are following it already, so it is not passed back to them.
    const standing = desk.warrants.map((warrant) => warrant.name);
    const seen = nameIn(text, standing) ?? closeIn(text, standing);
    const place = seen ? placeNamedIn(brain, text.toLowerCase()) : undefined;
    const warrant = desk.warrants.find((it) => it.name === seen);
    if (warrant && place && SIGHTING_WORDS.test(text)) {
      if (!warrant.lastSeen || brain.now >= warrant.lastSeen.at) {
        warrant.lastSeen = { place, at: brain.now, by: from };
        warrant.passed = { place, at: brain.now };
      }
      return true;
    }
    return false;
  }
  const declarer = isHead(fromJob);
  const captain = /captain/i.test(fromJob);
  const standing = desk.warrants.map((warrant) => warrant.name);
  const anyone = [...standing, ...Object.keys(desk.held)];

  // A warrant taken back by whoever declared it, or by the Captain.
  if (cancelAsked(text)) {
    const name = nameIn(text, standing) ?? closeIn(text, standing);
    const warrant = desk.warrants.find((it) => it.name === name);
    if (!declarer) {
      reply(
        brain,
        from,
        REFUSALS.notDeclarer(to),
        aloud,
        `${from} wants a warrant taken back, and is neither the Captain nor a head of department. You are telling them so.`,
      );
    } else if (!warrant) {
      reply(
        brain,
        from,
        nothingAgainstLine(to, pardonNamed(text)),
        aloud,
        `${from} wants a warrant taken back, and there is none on whoever they named. You are telling them so.`,
      );
    } else if (!captain && warrant.by !== from) {
      reply(
        brain,
        from,
        REFUSALS.notYours(to),
        aloud,
        `${from} wants the warrant on ${warrant.name} taken back, and it was ${warrant.by} who declared it. You are telling them so.`,
      );
    } else {
      strike(brain, warrant.name, false);
      reply(
        brain,
        from,
        withdrawnLine(to, warrant.name),
        aloud,
        `${from} has taken back the warrant on ${warrant.name}. You are saying that it is withdrawn.`,
      );
    }
    return true;
  }
  // A pardon. It names someone there is something against, right by the pardon word, or uses
  // the word "pardon". "Don't release Pun Pun" and "Pun Pun broke free" are no pardon. A warrant
  // declared on the same person, with "free" or "release" in its reason, is the warrant.
  const warrantToo = readWarrant(text, knownNames(brain));
  const loose = readPardon(text, anyone);
  const pardoned =
    loose &&
    !(
      warrantToo &&
      !pardonAsked(text) &&
      (sameName(warrantToo.name, loose) || sameName(loose, warrantToo.name))
    )
      ? loose
      : undefined;
  if (pardoned || pardonAsked(text)) {
    if (!captain) {
      reply(
        brain,
        from,
        REFUSALS.notPardoner(to),
        aloud,
        `${from} wants someone pardoned, and only the Captain can pardon. You are telling them so.`,
      );
    } else if (!pardoned) {
      reply(
        brain,
        from,
        nothingAgainstLine(to, pardonNamed(text)),
        aloud,
        `The Captain has pardoned someone security has nothing against. You are telling them so.`,
      );
    } else {
      const warrant = desk.warrants.find((it) => it.name === pardoned);
      strike(brain, pardoned, true);
      // Someone in a cell is not out yet: the Captain is told who is letting them out (TRB-11).
      const letting = releasedBy(brain, pardoned);
      reply(
        brain,
        from,
        letting
          ? `${pardonedLine(to, pardoned)} ${firstName(letting)} is letting them out.`
          : pardonedLine(to, pardoned),
        aloud,
        `The Captain has pardoned ${pardoned}. You are saying that it is done.`,
      );
      if (warrant && warrant.by !== from && warrant.by !== brain.name) {
        reply(
          brain,
          warrant.by,
          pardonToldLine(warrant.by, pardoned),
          false,
          `The Captain has pardoned ${pardoned}, and it was ${warrant.by} who declared the warrant. You are telling them by PDA.`,
        );
      }
    }
    return true;
  }
  // The Captain having arrests made again after security's staff were hurt.
  if (captain && TRY_AGAIN_WORDS.test(text)) {
    desk.officerOut = null;
    // Its staff hurt again after this is news.
    forgetWords(brain, (what) => what === 'hurt');
    arrestAgain(brain);
    // The officer that broke off hurt is the one told, while it is still aboard; else any.
    const more = moreOf(brain);
    const hurt = more.hurtOfficer;
    delete more.hurtOfficer;
    const officer =
      hurt && officerKnown(brain, hurt) ? hurt : officerAboard(brain);
    if (officer) {
      tellOfficer(
        brain,
        againLine(officer),
        'The Captain has said to try again. You are telling your officer to make arrests again.',
        officer,
      );
    }
    reply(
      brain,
      from,
      `${to}, we will try again.`,
      aloud,
      'The Captain has said to try again. You are saying that you will.',
    );
    return true;
  }
  // A warrant declared.
  const declared = readWarrant(text, knownNames(brain));
  if (declared) {
    // Settled on one person it knows of, by full name, here and now: the rules below are
    // tested against that one, and the warrant is kept under that name. A name that fits two
    // it knows of ("Dana", with Dana Reyes and Dana Smith aboard) is asked about, not guessed.
    const fits = knownNames(brain).filter((it) => sameName(declared.name, it));
    const owners = fits.includes(declared.name) ? [declared.name] : fits;
    if (declarer && owners.length > 1) {
      reply(
        brain,
        from,
        REFUSALS.whichOne(to, owners),
        aloud,
        `${from} has declared a warrant on ${declared.name}, and more than one person aboard goes by that name. You are asking which one.`,
      );
      return true;
    }
    if (owners.length === 1) {
      declared.name = owners[0];
    }
    const theirJob = jobOf(brain, declared.name);
    const why = (rest: string) =>
      `${from} has declared a warrant on ${declared.name}. ${rest}`;
    if (!declarer) {
      reply(
        brain,
        from,
        REFUSALS.notDeclarer(to),
        aloud,
        why(
          'They are neither the Captain nor a head of department, and you are telling them so.',
        ),
      );
    } else if (isNoName(declared.name)) {
      // "Unknown" is anyone with their face hidden and no ID on show: a warrant on it is on
      // every one of them, and on nobody once the mask is off.
      reply(
        brain,
        from,
        REFUSALS.noName(to),
        aloud,
        why(
          'That is how anyone with their face hidden is seen, not a name, and you are telling them so.',
        ),
      );
    } else if (/captain/i.test(theirJob)) {
      reply(
        brain,
        from,
        REFUSALS.onCaptain(to),
        aloud,
        why('Nobody declares one on the Captain, and you are telling them so.'),
      );
    } else if (isSecurity(theirJob) || sameName(declared.name, brain.name)) {
      reply(
        brain,
        from,
        REFUSALS.onSecurity(to),
        aloud,
        why(
          'That is one of your own staff, and you are telling them you take no such warrant.',
        ),
      );
    } else if (isHead(theirJob) && !captain) {
      reply(
        brain,
        from,
        REFUSALS.onHead(to),
        aloud,
        why(
          'That is a head of department, and only the Captain can declare one on a head. You are telling them so.',
        ),
      );
    } else if (
      desk.warrants.some(
        (it) =>
          sameName(declared.name, it.name) || sameName(it.name, declared.name),
      )
    ) {
      // Either way round: "Pun Pun the monkey" is the Pun Pun already wanted.
      const standingOne = desk.warrants.find(
        (it) =>
          sameName(declared.name, it.name) || sameName(it.name, declared.name),
      );
      // Declared again with a time on it: the time is what is new.
      if (
        standingOne &&
        declared.minutes !== null &&
        declared.minutes !== standingOne.minutes
      ) {
        setTerm(brain, standingOne, declared.minutes);
        reply(
          brain,
          from,
          termLine(to, standingOne.name, declared.minutes, declared.minutes),
          aloud,
          why(
            'There is one on them already, and what is new is how long. You are saying back what you have understood.',
          ),
        );
      } else {
        reply(
          brain,
          from,
          REFUSALS.already(to, standingOne?.name ?? declared.name),
          aloud,
          why('There is one on them already, and you are telling them so.'),
        );
      }
    } else {
      const minutes = declared.minutes ?? MINUTES_USUAL;
      const unknown = !knownNames(brain).some((it) =>
        sameName(declared.name, it),
      );
      desk.warrants.push({
        name: declared.name,
        reason: declared.reason,
        minutes,
        by: from,
        byJob: fromJob,
        at: brain.now,
        given: 'no',
        givenAt: null,
        gives: 0,
        lastSeen: null,
        passed: null,
      });
      desk.serial += 1;
      // A new warrant: what comes of it is new, whatever came of an old one on them (ARR-05).
      forgetWords(brain, (_what, who) => sameName(declared.name, who));
      reply(
        brain,
        from,
        takenLine(to, declared.name, declared.reason, minutes, unknown),
        aloud,
        why('You are saying back what you have understood, word for word.'),
      );
      if (!captain) {
        tellCaptain(
          brain,
          copyLine(from, declared.name, declared.reason),
          `${from} has declared a warrant on ${declared.name}. You are sending the Captain a copy.`,
        );
      }
    }
    return true;
  }
  // How long, said after the warrant and naming nobody: "Keep him in jail for 30 minutes". It
  // goes on the warrant that person last declared, if that was in the last few minutes.
  const term = declarer ? readTerm(text) : null;
  const theirs = term
    ? [...desk.warrants]
        .reverse()
        .find(
          (it) =>
            (it.by === from || captain) && brain.now - it.at < TERM_AFTER_DS,
        )
    : undefined;
  if (term && theirs) {
    setTerm(brain, theirs, term.minutes);
    reply(
      brain,
      from,
      termLine(to, theirs.name, term.minutes, term.asked),
      aloud,
      `${from} has said how long ${theirs.name} is to be held. You are saying back what you have understood, word for word.`,
    );
    return true;
  }
  // Word of where someone wanted is.
  // A first name alone, a misspelling or a name run together is taken, as for a pardon.
  const seen = nameIn(text, standing) ?? closeIn(text, standing);
  const place = seen ? placeNamedIn(brain, text.toLowerCase()) : undefined;
  if (seen && place && SIGHTING_WORDS.test(text)) {
    const warrant = desk.warrants.find((it) => it.name === seen);
    if (warrant && (!warrant.lastSeen || brain.now >= warrant.lastSeen.at)) {
      warrant.lastSeen = { place, at: brain.now, by: from };
    }
    return true;
  }
  // Word from the Captain or a head of where someone is who is not on the list. There is nothing
  // to follow it with, and they are told so, with the words that would put them on it.
  const stranger =
    declarer && SIGHTING_WORDS.test(text) ? sightedName(text) : '';
  if (stranger && placeNamedIn(brain, text.toLowerCase())) {
    reply(
      brain,
      from,
      noWarrantLine(to, stranger),
      aloud,
      `${from} has sent word of where ${stranger} is, and there is no warrant on them. You are telling ${from} so, and how to declare one.`,
    );
    return true;
  }
  return false;
}

/**
 * Answers a PDA message from the Captain or a head that it could make nothing of, so that they
 * are not left guessing at the words: once a minute at most. Returns TRUE if it answered.
 */
export function deskNotFollowed(
  brain: NpcBrain,
  from: string,
  fromJob: string,
): boolean {
  const desk = deskOf(brain);
  if (
    !isHead(fromJob) ||
    isSecurity(fromJob) ||
    Date.now() - (desk.notFollowedAt ?? 0) < NOT_FOLLOWED_EVERY_MS
  ) {
    return false;
  }
  desk.notFollowedAt = Date.now();
  reply(
    brain,
    from,
    notFollowedLine(addressOf(from, fromJob)),
    false,
    `${from} has sent you a PDA message you could make nothing of. You are saying so, and how a warrant or a pardon is worded.`,
  );
  return true;
}

/** How many orders may wait on the LLM to read them, and how often (ms) one is put to it. Past either, the sender is told it was not followed. */
const UNREAD_MOST = 2;
const READING_EVERY_MS = 5000;

/**
 * Takes a PDA message from the Captain or a head that code could make nothing of, and has the LLM
 * read it: the reader of last resort, for an order typed loosely. The answer comes back to
 * deskRead. Returns TRUE if the message is anyone's whose order it could be.
 */
export function deskUnread(
  brain: NpcBrain,
  from: string,
  fromJob: string,
  text: string,
): boolean {
  if (!isHead(fromJob) || isSecurity(fromJob)) {
    return false;
  }
  const desk = deskOf(brain);
  desk.unread ??= [];
  if (
    desk.unread.length >= UNREAD_MOST ||
    Date.now() - (desk.readingAt ?? 0) < READING_EVERY_MS
  ) {
    // Too many to read just now. Only what could be an order is answered so (SECT-10).
    return looksLikeOrder(text) ? deskNotFollowed(brain, from, fromJob) : true;
  }
  desk.readingAt = Date.now();
  desk.unread.push({ from, fromJob, text, at: Date.now() });
  return true;
}

/**
 * Takes what the LLM made of an order code could not read. A warrant or a pardon is put into the
 * words code reads and taken exactly as an order in those words would be: the name is matched to
 * who is aboard, every rule about who may declare what still holds, and the sender gets the same
 * word back, so that a wrong reading is seen at once. The LLM saying it is no order, or no
 * answer to a message with no order words in it or that asks a question, gets nothing back: thanks
 * and talk are not answered "I did not follow that" (SECT-10). Anything else gets that line.
 * Returns what came of it, for the log.
 */
export function deskRead(
  brain: NpcBrain,
  asked: NonNullable<DeskWork['unread']>[number],
  reading: Reading | null,
): string {
  const desk = deskOf(brain);
  desk.unread = (desk.unread ?? []).filter((it) => it !== asked);
  if (reading && reading.kind !== 'neither') {
    const order = readingAsOrder(reading);
    if (deskTakes(brain, asked.from, asked.fromJob, order, false)) {
      return `Read as: "${order}" The body answers ${asked.from} in the fixed words.`;
    }
  } else if (reading) {
    return `Read as no order. Nothing is sent to ${asked.from}.`;
  } else if (!looksLikeOrder(asked.text)) {
    return `No answer to go by, and no order in the words. Nothing is sent to ${asked.from}.`;
  }
  // An order it could not read: said so at once, whenever it last said so.
  desk.notFollowedAt = 0;
  deskNotFollowed(brain, asked.from, asked.fromJob);
  return `Not read. ${asked.from} is told it was not followed.`;
}

/** Takes what was said in its hearing, if it is security's business. Returns TRUE if it was. */
export function deskHears(brain: NpcBrain, event: SenseEvent): boolean {
  const heard = String(event.details.message ?? '');
  const speaker = String(event.details.speaker ?? '');
  if (!speaker || speaker === brain.name) {
    return false;
  }
  const job = jobOf(brain, speaker);
  // Its own staff are heard whoever they seemed to be speaking to. Anyone else has to be
  // speaking to it: a warrant talked about in its hearing is not a warrant declared.
  if (!isSecurity(job) && event.details.said_to !== 'me') {
    return false;
  }
  return deskTakes(brain, speaker, job, heard, true);
}

/**
 * Takes how a warrant went: from its officer, or from its own legwork. `from` is who served it.
 * `aloud` is TRUE if an officer said it to its face, in which case it says that it has it.
 */
export function deskOutcome(
  brain: NpcBrain,
  outcome: SecurityOutcome,
  from: string,
  aloud: boolean,
): void {
  const desk = deskOf(brain);
  const own = from === brain.name;
  if (aloud && !own) {
    const line = heardLine(from);
    brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
    brain.toTell.push({
      to: from,
      line,
      why: `${from} has told you how a warrant went, to your face. You are saying that you have it, so that they know they were heard.`,
      needs: HEARD_WORDS,
      exact: true,
      whileBusy: true,
      at: Date.now(),
    });
  }
  // The same word again, said to its face and come again by PDA: heard, and taken once (ARR-05).
  if (!own && heardAlready(brain, outcome, from)) {
    return;
  }
  const warrant = desk.warrants.find((it) => sameName(it.name, outcome.name));
  const who = own ? 'I' : firstName(from);
  if (outcome.what !== 'cuffed' && outcome.what !== 'cannot' && desk.cuffed) {
    delete desk.cuffed[warrant?.name ?? outcome.name];
  }
  switch (outcome.what) {
    case 'cuffed':
      // Word come late, of someone in a cell already: they were in cuffs, and the Captain has
      // been told they are in a cell (ARR-05). With a new warrant on them, out early, it is news.
      if (
        !warrant &&
        Object.keys(desk.held).some((it) => sameName(outcome.name, it))
      ) {
        return;
      }
      desk.cuffed ??= {};
      desk.cuffed[warrant?.name ?? outcome.name] = brain.now;
      tellCaptain(
        brain,
        `Captain, ${own ? 'I have' : `${firstName(from)} has`} ${outcome.name} in cuffs.`,
        `${outcome.name} is in cuffs and on the way to a cell. You are telling the Captain by PDA.`,
      );
      return;
    case 'jailed': {
      const minutes = outcome.minutes ?? MINUTES_USUAL;
      const entry: HeldMore = {
        cell: outcome.cell ?? 'a cell',
        until: brain.now + minutes * 600,
        by: from,
        at: brain.now,
      };
      desk.held[outcome.name] = entry;
      desk.arrests += 1;
      if (warrant) {
        desk.warrants = desk.warrants.filter((it) => it !== warrant);
        desk.serial += 1;
      }
      // The warrant is served, and the one who did not serve it gives up its copy: else it
      // would arrest them again once the cell opens. Nobody is let go by this.
      if (!own) {
        forgetWarrant(brain, warrant?.name ?? outcome.name);
      } else if (warrant && officerAboard(brain)) {
        // Its officer may have it still: given it before it broke off hurt, or given it and
        // then outrun to the arrest. The one it was given to, if it knows which (MULTI-01).
        const to = (warrant as WarrantMore).officer;
        const officer =
          to && officerKnown(brain, to) ? to : (officerAboard(brain) ?? '');
        tellOfficer(
          brain,
          servedLine(officer, warrant.name),
          `${warrant.name} is in a cell, and you served the warrant yourself. You are telling your officer, who may still have it, that it is served.`,
          officer,
        );
      }
      tellCaptain(
        brain,
        outcomeLine('Captain', outcome),
        `${outcome.name} is in ${outcome.cell}. You are telling the Captain by PDA.`,
      );
      if (
        warrant &&
        !/captain/i.test(warrant.byJob) &&
        warrant.by !== brain.name
      ) {
        reply(
          brain,
          warrant.by,
          outcomeLine(firstName(warrant.by), outcome),
          false,
          `${outcome.name} is in ${outcome.cell}, on the warrant ${warrant.by} declared. You are telling them by PDA.`,
        );
      }
      return;
    }
    case 'lost':
      if (warrant && outcome.place) {
        warrant.lastSeen = { place: outcome.place, at: brain.now, by: from };
        warrant.passed = { place: outcome.place, at: brain.now };
      }
      return;
    case 'hurt':
      if (own) {
        tellCaptain(
          brain,
          `Captain, ${outcome.name ? `I could not take ${outcome.name}. ` : ''}I am hurt, and will use no more force. Say "try again" and I will.`,
          'You are hurt and have broken off. You are telling the Captain by PDA.',
        );
      } else {
        desk.officerOut = 'hurt';
        moreOf(brain).hurtOfficer = from;
        for (const it of desk.warrants) {
          it.given = 'no';
        }
        tellCaptain(
          brain,
          `Captain, ${firstName(from)} ${outcome.name ? `could not take ${outcome.name} and ` : ''}is hurt. I am serving the warrants myself.`,
          `${from} is hurt and has broken off. You are telling the Captain by PDA, and taking the warrants into your own hands.`,
        );
      }
      return;
    case 'baton':
      tellCaptain(
        brain,
        `Captain, ${outcome.name} has ${own ? 'my' : `${firstName(from)}'s`} stun baton.`,
        `${outcome.name} has taken a stun baton. You are telling the Captain by PDA.`,
      );
      return;
    case 'attacked':
      tellCaptain(
        brain,
        `Captain, ${outcome.name} attacked ${own ? 'me' : firstName(from)}${outcome.other ? ` during the arrest of ${outcome.other}` : ''}. There is no warrant on them.`,
        `${outcome.name} attacked ${who === 'I' ? 'you' : who}. You are telling the Captain by PDA: a warrant on them is the Captain's or a head's to declare.`,
      );
      return;
    case 'freed': {
      const held = Object.keys(desk.held).find((it) =>
        sameName(outcome.name, it),
      );
      if (held) {
        delete desk.held[held];
      }
      // Let out: nobody need go to the cell (TRB-11).
      {
        const more = moreOf(brain);
        more.toRelease = more.toRelease?.filter(
          (it) => !sameName(outcome.name, it.name),
        );
      }
      // Out before their time, and not by security's hand: the Captain is told (TRB-06).
      if (outcome.why === EARLY && held) {
        tellCaptain(
          brain,
          outcomeLine('Captain', outcome),
          `${outcome.name} is out of their cell before their time. You are telling the Captain by PDA.`,
        );
      }
      return;
    }
    default:
      // Word come late, of someone in a cell already: no longer true, and not passed on (PLAY-02).
      if (Object.keys(desk.held).some((it) => sameName(outcome.name, it))) {
        return;
      }
      tellCaptain(
        brain,
        `Captain, ${own ? 'I' : firstName(from)} cannot bring in ${outcome.name}: ${outcome.why}.`,
        `${outcome.name} cannot be brought in. You are telling the Captain by PDA.`,
      );
      // Nobody whose ID opens the room has opened it: engineering is asked to force the door.
      {
        const shutRoom = outcome.why?.match(
          /^nobody has opened the (.+) for security$/,
        )?.[1];
        if (shutRoom) {
          askEngineering(brain, shutRoom, outcome.name);
        }
      }
  }
}

/**
 * The heads of department it sends the notice to: every one aboard but the Captain and
 * security's own. A head there is a warrant on is sent nothing while it stands, and a head in
 * a cell nothing while its time runs: it cannot answer from there (PLAY-08). It is owed the list
 * once syncDesk takes it off the held list.
 */
export function headsToTell(brain: NpcBrain): string[] {
  const desk = deskOf(brain);
  return brain.pdaPeople
    .filter(
      (person) =>
        isHead(person.job) &&
        !/captain/i.test(person.job) &&
        !isSecurity(person.job) &&
        person.name !== brain.name &&
        !desk.warrants.some((warrant) => sameName(warrant.name, person.name)) &&
        !Object.keys(desk.held).some((name) => sameName(name, person.name)),
    )
    .map((person) => person.name);
}

/** The notice as one head is sent it: everyone wanted but that head itself. */
function noticeFor(brain: NpcBrain, head: string): string[] {
  return noticeLines(
    deskOf(brain)
      .warrants.filter((warrant) => !sameName(warrant.name, head))
      .map((warrant) => ({ name: warrant.name, reason: warrant.reason })),
  );
}

/** The next line of the notice a head is owed, or null if it is owed none just now. */
function noticeOwed(brain: NpcBrain, head: string): string | null {
  const desk = deskOf(brain);
  // Nothing has ever been declared: there is no list to send.
  if (desk.serial === 0) {
    return null;
  }
  const lines = noticeFor(brain, head);
  const state = desk.noticed[head];
  if (!state || state.serial !== desk.serial) {
    return lines[0];
  }
  if (state.lines < lines.length) {
    return lines[state.lines];
  }
  if (state.acked || brain.now - state.sentAt < ACK_WAIT_DS) {
    return null;
  }
  // No word back. It is sent once more, and after that the Captain is told who it did not reach.
  if (state.tries < NOTICE_TRIES) {
    return lines[0];
  }
  if (!state.failed) {
    state.failed = true;
    tellCaptain(
      brain,
      `Captain, the security notice did not reach ${head}.`,
      `${head} has not answered the security notice, sent twice. You are telling the Captain by PDA.`,
    );
  }
  return null;
}

/** Opens or closes one of its tasks to match whether there is that work to do. */
function keep(
  brain: NpcBrain,
  kind: string,
  wanted: boolean,
  item?: string,
): void {
  const task = findTask(brain, kind, { item });
  if (wanted && !task) {
    addTask(brain, { kind, urgency: 'asked', source: 'own', item });
  } else if (!wanted && task) {
    finishTask(brain, task);
  }
}

/** Keeps the list true to the time, to who is serving it, and to what has come back. */
export function syncDesk(brain: NpcBrain): void {
  const desk = deskOf(brain);
  // How its own legwork has gone.
  for (const outcome of takeOutcomes(brain)) {
    deskOutcome(brain, outcome, brain.name, false);
  }
  for (const [name, held] of Object.entries(desk.held)) {
    if (brain.now > held.until) {
      delete desk.held[name];
    } else if (seenOut(brain, name, held as HeldMore)) {
      // Seen out of the cells before their time: let out by someone, or broken out (TRB-06).
      delete desk.held[name];
      tellCaptain(
        brain,
        outcomeLine('Captain', {
          what: 'freed',
          name,
          cell: held.cell,
          why: EARLY,
        }),
        `${name} is out of their cell before their time. You are telling the Captain by PDA.`,
      );
    }
  }
  const officer = serving(brain);
  // With an officer to send, whoever keeps the list does not go after anyone itself. It keeps only
  // the warrant on whoever it has by the arm, and one whose arrest is under way (ARR-13).
  if (officer) {
    handBack(brain);
  }
  const ownHands = (name: string) =>
    beatOf(brain).warrants.some((it) => sameName(it.name, name));
  // An officer to send who was not sending before (told to try again, or come aboard): every
  // warrant is given to it, but those still in its own hands, which wait until it lets go of them.
  // Another officer coming into sight while the one before is still aboard is no change (MULTI-01).
  const before = desk.servedBy ?? null;
  if (officer && (before === null || !officerKnown(brain, before))) {
    desk.keptBack = [];
    for (const warrant of desk.warrants) {
      if (ownHands(warrant.name)) {
        desk.keptBack.push(warrant.name);
      } else {
        giveAgain(warrant);
      }
    }
  } else if (officer && desk.keptBack?.length) {
    // One it kept back and has let go of, the arrest failed or the person got away, goes to the
    // officer then. One served in the meantime is off the list.
    desk.keptBack = desk.keptBack.filter((name) => {
      if (ownHands(name)) {
        return true;
      }
      const warrant = desk.warrants.find((it) => it.name === name);
      if (warrant) {
        giveAgain(warrant);
      }
      return false;
    });
  }
  if (!officer) {
    desk.keptBack = undefined;
  }
  desk.servedBy = officer;
  for (const warrant of desk.warrants) {
    // The officer it was given to is gone from sight and PDA: it is given afresh to another
    // (MULTI-01).
    const holder = (warrant as WarrantMore).officer;
    if (holder && !officerKnown(brain, holder)) {
      (warrant as WarrantMore).officer = undefined;
      if (officer && warrant.given !== 'no') {
        giveAgain(warrant);
      }
    }
    if (!officer) {
      // Nobody to send. It serves the warrant itself.
      giveWarrant(brain, { ...warrant, byCaptain: byCaptain(warrant) });
      warrant.given = 'taken';
    } else if (
      warrant.given === 'said' &&
      warrant.givenAt !== null &&
      brain.now - warrant.givenAt > TAKEN_WAIT_DS
    ) {
      // Given, and no word back. It is given again, and after that taken as heard.
      warrant.gives += 1;
      warrant.given = warrant.gives >= GIVE_TRIES ? 'taken' : 'no';
      warrant.walkedUp = false;
    }
    // The newest sighting goes to whoever is serving it.
    const seen = warrant.lastSeen;
    const passed = warrant.passed;
    // Serving it itself, it goes by the newest it has, whoever that was first passed to: an
    // officer who broke off hurt took what it had been told with it.
    if (!officer && seen) {
      noteSeen(brain, warrant.name, seen.place, seen.at);
    }
    if (
      seen &&
      warrant.given !== 'no' &&
      (!passed ||
        (seen.at > passed.at &&
          (seen.place !== passed.place || seen.at - passed.at > PASS_AGAIN_DS)))
    ) {
      warrant.passed = { place: seen.place, at: seen.at };
      if (officer) {
        // To the officer it gave the warrant to, not whoever is nearest (MULTI-01).
        const to = officerFor(brain, warrant) ?? officer;
        tellOfficer(
          brain,
          seenLine(to, warrant.name, seen.place),
          `${seen.by} has sent word that ${warrant.name} is in the ${seen.place}. You are passing it to your officer.`,
          to,
        );
      } else {
        noteSeen(brain, warrant.name, seen.place, seen.at);
      }
    }
  }
  syncRelease(brain, officer);
  keep(
    brain,
    NOTICE,
    brain.hasPda && headsToTell(brain).some((head) => noticeOwed(brain, head)),
  );
  for (const task of brain.tasks) {
    if (
      task.kind === GIVE &&
      task.state !== 'done' &&
      !desk.warrants.some((it) => it.name === task.item && it.given === 'no')
    ) {
      finishTask(brain, task);
    }
  }
  for (const warrant of desk.warrants) {
    keep(brain, GIVE, !!officer && warrant.given === 'no', warrant.name);
  }
}

/**
 * Someone its officer was told to let out of a cell, and has not said is free: after two minutes,
 * or at once with no officer fit to send, whoever keeps the list goes to the cells and lets them
 * out with its own hands (TRB-11). The Captain is told so, in fixed words. Once there, it is its
 * own legwork's to do: from the cells the cell is found by sight.
 */
function syncRelease(brain: NpcBrain, officer: string | null): void {
  const more = moreOf(brain);
  const brig = brigPlace(brain);
  more.toRelease = (more.toRelease ?? []).filter((release) => {
    // Their time is up: the cell has let them out.
    if (brain.now > release.until) {
      return false;
    }
    if (
      !release.going &&
      (!officer || brain.now - release.at > RELEASE_WAIT_DS)
    ) {
      release.going = true;
      if (release.officer) {
        tellCaptain(
          brain,
          `Captain, ${firstName(release.officer)} has not let ${release.name} out. I am going to do it.`,
          `${release.officer} was told to let ${release.name} out of ${release.cell} and has not said they are free. You are telling the Captain you are going to do it yourself.`,
        );
      }
    }
    // At the cells, it lets them out itself.
    if (release.going && brig && brain.location === brig) {
      const beat = beatOf(brain);
      if (!beat.toFree.some((it) => sameName(it.name, release.name))) {
        beat.toFree.push({
          name: release.name,
          pardoned: release.pardoned,
          tries: 0,
        });
      }
      return false;
    }
    return true;
  });
  for (const task of brain.tasks) {
    if (
      task.kind === RELEASE &&
      task.state !== 'done' &&
      !more.toRelease.some((it) => it.going && it.name === task.item)
    ) {
      finishTask(brain, task);
    }
  }
  for (const release of more.toRelease) {
    keep(brain, RELEASE, !!release.going && !!brig, release.name);
  }
}

/** TRUE if the Captain declared this warrant. Whoever serves it is told so: only then is it served on a head of staff. */
function byCaptain(warrant: Warrant): boolean {
  return /captain/i.test(warrant.byJob);
}

/** Sets a warrant to be given to its officer afresh. */
function giveAgain(warrant: Warrant): void {
  warrant.given = 'no';
  warrant.gives = 0;
  warrant.walkedUp = false;
}

/** What giving its officer a warrant comes down to right now: to its face if it is there, and by PDA if not. */
function giveStep(brain: NpcBrain, warrant: Warrant): Plan {
  // Given again, it goes to the same officer as before while that one is aboard (MULTI-01).
  const officer = officerFor(brain, warrant);
  if (!officer) {
    return { ready: false, step: 'You have no officer to give it to.' };
  }
  (warrant as WarrantMore).officer = officer;
  const line = giveLine(
    officer,
    warrant.name,
    warrant.reason,
    warrant.minutes,
    byCaptain(warrant),
  );
  const why = `${warrant.by} has declared a warrant on ${warrant.name}${warrant.reason ? `, for ${warrant.reason}` : ''}.`;
  const seen = brain.peopleInView.find((person) => person.name === officer);
  if (seen) {
    if ((seen.distance ?? 0) > SPEAKING_DISTANCE && !warrant.walkedUp) {
      return {
        ready: true,
        step: `${why} ${officer} is in sight, and you are walking up to them to give it.`,
        act: { tool: 'approach', person: seen.handle },
      };
    }
    return {
      ready: true,
      step: `${why} ${officer} is here. Your body is giving them the warrant, in these words: "${line}"`,
      say: line,
      exact: true,
    };
  }
  if (brain.hasPda && !warrant.unsent) {
    return {
      ready: true,
      step: `${why} ${officer} is not in sight, so you are sending the warrant by PDA: "${line}"`,
      act: { tool: 'message', person: officer, text: line },
    };
  }
  if (brain.staffPost && brain.location !== brain.staffPost) {
    return {
      ready: true,
      step: `${why} You cannot reach ${officer} by PDA, so you are going to the ${brain.staffPost} to find them.`,
      act: { tool: 'go_to', place: brain.staffPost },
    };
  }
  return {
    ready: false,
    wait: true,
    step: `${why} You are looking for ${officer} to give it to.`,
  };
}

export function planDesk(brain: NpcBrain, task: Task): Plan | null {
  const desk = deskOf(brain);
  if (task.kind === NOTICE) {
    for (const head of headsToTell(brain)) {
      const line = noticeOwed(brain, head);
      if (line) {
        return {
          ready: true,
          step: `The list of who is wanted has changed. You are sending ${head} the security notice by PDA: "${line}"`,
          act: { tool: 'message', person: head, text: line },
        };
      }
    }
    return { ready: false, step: 'Every head has the security notice.' };
  }
  if (task.kind === GIVE) {
    const warrant = desk.warrants.find((it) => it.name === task.item);
    return warrant
      ? giveStep(brain, warrant)
      : { ready: false, step: 'That warrant is off the list.' };
  }
  if (task.kind === RELEASE) {
    const release = moreOf(brain).toRelease?.find(
      (it) => it.name === task.item,
    );
    const brig = brigPlace(brain);
    return release && brig
      ? {
          ready: true,
          step: `${release.name} is to be let out of ${release.cell}${release.pardoned ? ': the Captain has pardoned them' : ': the warrant on them is withdrawn'}, and nobody has said they are free. You are going to the ${brig} to let them out yourself.`,
          act: { tool: 'go_to', place: brig },
        }
      : { ready: false, step: 'Nobody is waiting to be let out.' };
  }
  return null;
}

export function describeDesk(task: Task): string | null {
  if (task.kind === NOTICE) {
    return 'send the heads of department the security notice';
  }
  if (task.kind === GIVE) {
    return `give your officer the warrant on ${task.item}`;
  }
  if (task.kind === RELEASE) {
    return `let ${task.item} out of their cell`;
  }
  return null;
}

/** Notes that it has given its officer a warrant in so many words. */
export function deskAfterSaying(brain: NpcBrain, called: string | null): void {
  const given = called && GIVE_WORDS.test(called) ? readGiven(called) : null;
  if (!given) {
    return;
  }
  const warrant = deskOf(brain).warrants.find((it) => it.name === given.name);
  if (warrant) {
    warrant.given = 'said';
    warrant.givenAt = brain.now;
  }
}

/** Notes how a step of keeping the list went: a notice sent, a warrant sent, its officer walked up to. */
export function deskAfterActing(
  brain: NpcBrain,
  act: Action,
  task: Task | undefined,
  ok: boolean,
): void {
  const desk = deskOf(brain);
  const warrant =
    task?.kind === GIVE
      ? desk.warrants.find((it) => it.name === task.item)
      : undefined;
  if (warrant && act.tool === 'approach') {
    warrant.walkedUp = true;
    return;
  }
  if (act.tool !== 'message') {
    return;
  }
  const text = String(act.text ?? '');
  // Sent by PDA, a warrant is given. One that would not send it takes to its officer on foot.
  if (warrant && GIVE_WORDS.test(text)) {
    if (ok) {
      warrant.given = 'taken';
      warrant.givenAt = brain.now;
    } else {
      warrant.unsent = true;
    }
    return;
  }
  if (task?.kind === NOTICE && /^Security notice\b/i.test(text)) {
    const head = String(act.person);
    const state = desk.noticed[head];
    if (!state || state.serial !== desk.serial) {
      desk.noticed[head] = {
        serial: desk.serial,
        lines: ok ? 1 : 0,
        sentAt: brain.now,
        tries: 1,
        acked: false,
      };
    } else if (state.lines < noticeFor(brain, head).length) {
      state.lines += ok ? 1 : 0;
      state.sentAt = brain.now;
      state.tries += ok ? 0 : 1;
    } else {
      // The whole of it sent again, for want of an answer.
      state.lines = ok ? 1 : 0;
      state.tries += 1;
      state.sentAt = brain.now;
    }
  }
}

/** What the LLM should know of the list it keeps, so that what it says about it is true. */
export function deskCues(brain: NpcBrain): string[] {
  const desk = deskOf(brain);
  const lines: string[] = [];
  lines.push(
    desk.warrants.length > 0
      ? `Warrants standing: ${desk.warrants.map((warrant) => `${warrant.name}${warrant.reason ? `, for ${warrant.reason}` : ''}, declared by ${warrant.by}${warrant.lastSeen ? `, last seen in the ${warrant.lastSeen.place}` : ''}`).join('; ')}.`
      : 'There is no warrant standing on anyone.',
  );
  const cells = inTheCells(brain);
  if (cells) {
    lines.push(cells);
  }
  if (desk.officerOut) {
    lines.push(
      'Your officer is hurt and has broken off. You are serving the warrants with your own hands.',
    );
  }
  return lines;
}
