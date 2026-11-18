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
  dropWarrant,
  giveWarrant,
  handBack,
  noteSeen,
  takeOutcomes,
} from './arrests';
import { captainName } from './head';
import {
  addressOf,
  againLine,
  CANCEL_WORDS,
  copyLine,
  firstName,
  GIVE_WORDS,
  giveLine,
  HEARD_WORDS,
  heardLine,
  isOfficer,
  isSecurity,
  letGoLine,
  MINUTES_USUAL,
  NOTICE_ACK_WORDS,
  nameIn,
  notFollowedLine,
  nothingAgainstLine,
  noticeLines,
  noWarrantLine,
  outcomeLine,
  PARDON_WORDS,
  pardonedLine,
  pardonNamed,
  pardonToldLine,
  REFUSALS,
  readGiven,
  readOutcome,
  readWarrant,
  SIGHTING_WORDS,
  sameName,
  seenLine,
  sightedName,
  TRY_AGAIN_WORDS,
  takenLine,
  WARRANT_ACK_WORDS,
  withdrawnLine,
} from './security';

/** Sending the heads of department the list of who is wanted. */
const NOTICE = 'security_notice';
/** Giving its officer a warrant. The task's item is who the warrant is on. */
const GIVE = 'give_warrant';

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

/** Tells its officer something outside a warrant: to its face if it is there, by PDA if not. */
function tellOfficer(brain: NpcBrain, line: string, why: string): void {
  const officer = officerAboard(brain);
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
        `${warrant.name}${warrant.lastSeen ? `, last seen in the ${warrant.lastSeen.place}` : ''}`,
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
  if (warrant) {
    desk.warrants = desk.warrants.filter((it) => it !== warrant);
    desk.serial += 1;
  }
  if (held) {
    delete desk.held[held];
  }
  const who = warrant?.name ?? held ?? name;
  // Whoever may have them lets them go: its officer, if the officer was given the warrant or
  // put them in the cell, and itself.
  if (officerAboard(brain) && (held || (warrant && warrant.given !== 'no'))) {
    tellOfficer(
      brain,
      letGoLine(officerAboard(brain) ?? '', who, pardoned),
      `${who} is to be let go${pardoned ? ': the Captain has pardoned them' : ''}. You are telling your officer.`,
    );
  }
  dropWarrant(brain, who, pardoned);
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
  text: string,
  aloud: boolean,
): boolean {
  const desk = deskOf(brain);
  const to = addressOf(from, fromJob);
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
      for (const warrant of desk.warrants) {
        if (warrant.given === 'said') {
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
    return false;
  }
  const declarer = isHead(fromJob);
  const captain = /captain/i.test(fromJob);
  const standing = desk.warrants.map((warrant) => warrant.name);
  const anyone = [...standing, ...Object.keys(desk.held)];

  // A warrant taken back by whoever declared it, or by the Captain.
  if (CANCEL_WORDS.test(text)) {
    const name = nameIn(text, standing);
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
  // A pardon. It names someone there is something against, or uses the word.
  const pardoned = PARDON_WORDS.test(text) ? nameIn(text, anyone) : undefined;
  if (pardoned || /\bpardon\b/i.test(text)) {
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
      reply(
        brain,
        from,
        pardonedLine(to, pardoned),
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
    arrestAgain(brain);
    const officer = officerAboard(brain);
    if (officer) {
      tellOfficer(
        brain,
        againLine(officer),
        'The Captain has said to try again. You are telling your officer to make arrests again.',
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
    const theirJob =
      jobOf(brain, declared.name) ||
      jobOf(
        brain,
        knownNames(brain).find((it) => sameName(declared.name, it)) ?? '',
      );
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
    } else if (desk.warrants.some((it) => sameName(declared.name, it.name))) {
      reply(
        brain,
        from,
        REFUSALS.already(to, declared.name),
        aloud,
        why('There is one on them already, and you are telling them so.'),
      );
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
  // Word of where someone wanted is.
  const seen = nameIn(text, standing);
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
  const warrant = desk.warrants.find((it) => sameName(it.name, outcome.name));
  const who = own ? 'I' : firstName(from);
  switch (outcome.what) {
    case 'jailed': {
      const minutes = outcome.minutes ?? MINUTES_USUAL;
      desk.held[outcome.name] = {
        cell: outcome.cell ?? 'a cell',
        until: brain.now + minutes * 600,
      };
      desk.arrests += 1;
      if (warrant) {
        desk.warrants = desk.warrants.filter((it) => it !== warrant);
        desk.serial += 1;
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
      return;
    }
    default:
      tellCaptain(
        brain,
        `Captain, ${own ? 'I' : firstName(from)} cannot bring in ${outcome.name}: ${outcome.why}.`,
        `${outcome.name} cannot be brought in. You are telling the Captain by PDA.`,
      );
  }
}

/**
 * The heads of department it sends the notice to: every one aboard but the Captain and
 * security's own. A head there is a warrant on is sent nothing while it stands.
 */
function headsToTell(brain: NpcBrain): string[] {
  const desk = deskOf(brain);
  return brain.pdaPeople
    .filter(
      (person) =>
        isHead(person.job) &&
        !/captain/i.test(person.job) &&
        !isSecurity(person.job) &&
        person.name !== brain.name &&
        !desk.warrants.some((warrant) => sameName(warrant.name, person.name)),
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
    }
  }
  const officer = serving(brain);
  // With an officer to send, whoever keeps the list does not go after anyone itself.
  if (officer) {
    handBack(brain);
  }
  for (const warrant of desk.warrants) {
    if (!officer) {
      // Nobody to send. It serves the warrant itself.
      giveWarrant(brain, warrant);
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
        tellOfficer(
          brain,
          seenLine(officer, warrant.name, seen.place),
          `${seen.by} has sent word that ${warrant.name} is in the ${seen.place}. You are passing it to your officer.`,
        );
      } else {
        noteSeen(brain, warrant.name, seen.place, seen.at);
      }
    }
  }
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

/** What giving its officer a warrant comes down to right now: to its face if it is there, and by PDA if not. */
function giveStep(brain: NpcBrain, warrant: Warrant): Plan {
  const officer = serving(brain);
  if (!officer) {
    return { ready: false, step: 'You have no officer to give it to.' };
  }
  const line = giveLine(officer, warrant.name, warrant.reason, warrant.minutes);
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
  return null;
}

export function describeDesk(task: Task): string | null {
  if (task.kind === NOTICE) {
    return 'send the heads of department the security notice';
  }
  if (task.kind === GIVE) {
    return `give your officer the warrant on ${task.item}`;
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
