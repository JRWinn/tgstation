/**
 * Keeping a locked room, and answering for being in one.
 *
 * This is not any one job's work. Anyone whose post is behind a door that is locked to the rest of
 * the crew keeps it, and anyone at all can be asked what they are doing in such a room.
 *
 * Someone found in the room who has no right of their own to be there, and whom the NPC did not
 * send for or let in, is asked why they are there. If they say someone who works there sent for
 * them, that person is asked whether it is so. A yes, and they are left to it. No good reason, or a
 * no, and they are told to leave and walked out by the arm. The Captain and the heads of staff are
 * asked, and never touched.
 *
 * Workmates who hear all this follow it. One of them asking is enough: the rest stand back, and if
 * they hear the stranger vouched for, that settles it for them as well.
 *
 * The server knows who has a right to be in the room and who outranks whom. The LLM puts each line
 * in the NPC's own voice. Who is asked what, and what comes of the answer, is decided here.
 */
import { expectedCall, forgetExpected, takeOrder } from '../expected';
import { isHead } from '../hierarchy';
import { knownPlaces } from '../memory';
import { addTask, finishTask } from '../tasks';
import type {
  Action,
  NpcBrain,
  Plan,
  SenseEvent,
  Stranger,
  Task,
} from '../types';
import { jobFor } from './index';
import { isSecurity } from './security';

/** The words a keeper asks the Captain or a head in, whether they sent a stranger in: "Did you send Jan Mopp to the Cargo Bay?" (SECT-08 B). */
const ASKING_SENT = 'did you send';
export function sentAskLine(name: string, room: string): string {
  return `Did you send ${name} to the ${room}?`;
}
/** How long (deciseconds) a keeper waits for the Captain's or a head's yes before putting the stranger out (SECT-08 B). */
const HEAD_ANSWER_DS = 1200;
/** How long (deciseconds) someone told to leave is given to go of their own accord before being taken by the arm (MULTI-08 B). */
const LEAVE_GRACE_DS = 100;
/**
 * A stranger who says the Captain or a head sent them: whom they named, and when that one was
 * asked, by `brain id:stranger` (SECT-08 B). Kept here, not on `Stranger` in types.ts.
 */
type HeadAsk = { head: string; askedAt?: number; byPda?: boolean };
const headAsks = new Map<string, HeadAsk>();
const headKey = (brain: NpcBrain, name: string) => `${brain.id}:${name}`;

/** Someone in the post who has to account for being there. The task's item is their name. */
const STRANGER = 'stranger';
/** Having been asked why it is in a room, to answer. The task's item is whoever asked. */
const EXPLAIN = 'explain';
/** Having been asked whether it sent for someone, to answer. The task's item is whom. */
const VOUCH = 'vouch';

/** The plain words each question and answer is known by afterwards, to whoever said it and whoever heard. */
const ASKING_WHY = 'why are you in here';
const ASKING_WHO = 'did you ask';
const SEEING_OUT = 'out you go';

/** The words that mark what someone says as asking a person their business in a room. */
const CHALLENGE_WORDS =
  /\bwhy\b.*\b(here|in the)\b|what are you doing|what business|what brings you/;
/** The words that mark what someone says as asking a person whether they sent for someone. */
const VOUCH_WORDS = /did you (ask|call|send|let|tell|invite)/;
/** What a no and a yes sound like. A line with both in it is a no: "no, I did not". */
const NO_WORDS = /\b(no|nope|not|never|didn'?t)\b/;
const YES_WORDS = /\b(yes|yeah|yep|aye|i did|i have|correct)\b/;
/** Set phrases with a no-word in them that mean nothing of the kind. */
const SET_PHRASES =
  /\bno (?:problem|worries|trouble|bother)\b|\bno need\b[^.!?]*|\bnot (?:yet|done|finished)\b|\bnot a problem\b/g;
/** An answer that begins, after a name and a comma, with a no or a yes. */
const BEGINS_NO =
  /^\W*(?:\w+,\s*)?(?:no|nope|never|i did not|i didn'?t|not me)\b/;
const BEGINS_YES =
  /^\W*(?:\w+,\s*)?(?:yes|yeah|yep|aye|i did|i have|correct|sure|of course)\b/;
/** What owning up to having no reason to be in a room sounds like. */
const NO_REASON_WORDS =
  /nobody|no one|should not be|shouldn'?t be|no business|no reason|just looking|only looking|lost/;

/** How long (deciseconds) a stranger is watched before being asked, and how much longer, at most, by who is watching. */
const LOOK_FIRST_DS = 40;
const STAGGER_DS = 80;
/** How long (deciseconds) an answer is waited for, and how many times a question is put. */
const ANSWER_WAIT_DS = 300;
const ASKS = 2;
/** How long (deciseconds) a stranger is left to a workmate who is seeing to them. */
const STAND_BACK_DS = 900;
/** How long (deciseconds) a stranger who has gone from sight is remembered. */
const GONE_DS = 600;
/** How long (deciseconds) having sent for someone, or let them in, counts. */
const SENT_FOR_DS = 12000;
/** How long (deciseconds) a question put to the NPC stands. */
const QUESTION_STANDS_DS = 600;
/** How long (deciseconds) someone whose welcome is over is given to go before they are seen out. */
const WELCOME_GRACE_DS = 600;
/** How long (deciseconds), at most, security let in on a warrant are left to serve it (ARR-02). */
const WARRANT_WELCOME_DS = 3000;
/** Words taken off a clause before it is read as an order to leave: they do not change what is meant. */
const LEAVE_FILLER =
  /\b(please|right now|at once|now|immediately|just|ok|okay)\b/g;
/** A clause that has a no in it is not an order to go: "don't leave the bar until it is clean". */
const LEAVE_NOT = /\b(not|don'?t|do not|dont|never|no need to)\b/;
/**
 * The words by which someone the NPC answers to tells it to put someone out of its post: a verb
 * and "out", with whom between them or just after ("get him out", "throw out the clown"), or
 * "remove" and whom.
 */
const PUT_OUT_VERB =
  /\b(?:toss|throw|kick|get|take|walk|haul|drag|escort|chuck|boot|see|put)\b([^.,!?;]*?)\bout\b([^.,!?;]*)/g;
/** "Remove" and whatever it is done to, up to the next "from", "of" or the like: "remove the crates from the janitor's closet" removes crates. */
const REMOVE_VERB =
  /\bremove\b((?:(?!\b(?:from|of|to|in|on|onto|into|at|by|with|for)\b)[^.,!?;])*)/g;
/** Words that say someone has no right to be there. They put nobody out unless the line says who. */
const NO_RIGHT_WORDS =
  /\b(not|un)\s?authori[sz]ed\b|\bno business\b|\btrespass/;
/** Words that point at someone without naming them. They mean the one stranger in the post, if there is just one. */
const POINTING_WORDS =
  /\b(him|her|them|he|she|that one|this one|that person|this person|that guy|this guy)\b/;
/** How long (milliseconds) it keeps out of a room it was told to leave, and does no work there. */
const KEPT_OUT_MS = 600000;
/** How long (milliseconds) being told to leave stands, if it cannot get out. */
const TOLD_TO_LEAVE_MS = 300000;
/** Names the steps of answering that it is going, and of going. */
const LEAVING_KEY = 'told-to-leave';

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** TRUE if these words, in lower case, use this person's first or last name. */
export function namesPerson(heard: string, name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2)
    .some((part) => new RegExp(`\\b${part}\\b`).test(heard));
}

/** The halves of a name, either of which will do to name someone: "Donna", or "Mrs. Sholl". */
function eitherName(name: string): RegExp {
  const parts = name
    .split(/[^a-z]+/i)
    .filter((part) => part.length > 2)
    .join('|');
  return new RegExp(`\\b(?:${parts})\\b`);
}

/** A check that a line has every one of these in it, whatever else it says: plain words, or a pattern. */
export function has(...parts: (string | RegExp)[]): RegExp {
  const checks = parts.map((part) =>
    typeof part === 'string'
      ? `(?=.*\\b${part.replace(/[^a-z0-9 ]/gi, '.')}\\b)`
      : `(?=.*(?:${part.source}))`,
  );
  return new RegExp(`^${checks.join('')}`, 'is');
}

/**
 * TRUE if these words, in lower case, tell the NPC to leave the room it is in. A clause of the
 * line, with its name and "please" taken off, must be the order and nothing else: "Tolly, leave.",
 * "Leave the bar, Tolly.", "Get out of here.", "Off you go.", "Tolly, you are not authorized in
 * here." A word like "leave" or "out of here" anywhere else is not one: "don't leave the bar until
 * it is clean", "leave the mop bucket by the door", "get that vomit out of here", "I have to leave
 * now", "I cannot get out of here by myself".
 */
export function toldToLeaveHere(brain: NpcBrain, heard: string): boolean {
  const names = brain.name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2);
  const room = (brain.location ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '.')
    .trim();
  const place = `(here|this room|this place|(this|the|my|our) (room|office)${room ? `|(the )?${room}` : ''})`;
  const orders = [
    // "Leave.", "Leave the bar.", "Leave us."
    new RegExp(`^leave( ${place}| us| me)?$`),
    // "Get out.", "Get out of here.", "Out.", "Off you go.", "Clear out of the bar."
    new RegExp(
      `^(get out|go away|clear off|clear out|off you go|out you go|out|go on out)( of ${place})?$`,
    ),
    // "You need to leave.", "You have to go now."
    new RegExp(
      `^you (need|have|ought|got|must|will have) (to )?(leave|go)( ${place})?$`,
    ),
  ];
  // "You are not allowed in here." The one order with a "not" in it.
  const notAllowed = new RegExp(
    `^(you are not|you aren'?t|you'?re not) (allowed|authori[sz]ed|permitted|supposed to be)( to be)? (in )?${place}$`,
  );
  return heard
    .replace(/[‘’]/g, "'")
    .split(/[.,!?;:]+/)
    .some((part) => {
      let clause = ` ${part} `;
      for (const name of names) {
        clause = clause.replace(new RegExp(`\\b${name}\\b`, 'g'), ' ');
      }
      clause = clause.replace(LEAVE_FILLER, ' ').replace(/\s+/g, ' ').trim();
      if (!clause) {
        return false;
      }
      if (notAllowed.test(clause)) {
        return true;
      }
      return (
        !LEAVE_NOT.test(clause) && orders.some((order) => order.test(clause))
      );
    });
}

/**
 * A wait that is the same every time for one NPC and different from one NPC to the next, so that
 * two of them who see the same thing at the same moment do not both speak up about it at once.
 */
export function stagger(brain: NpcBrain, spread: number): number {
  let sum = 0;
  for (const letter of brain.name) {
    sum = (sum * 31 + letter.charCodeAt(0)) % 9973;
  }
  return sum % spread;
}

/** What the NPC knows of this stranger in its post, starting from nothing if they are new to it. */
function recordOf(brain: NpcBrain, name: string): Stranger {
  brain.strangers[name] ??= {
    seenAt: brain.now,
    lastSeenAt: brain.now,
    asks: 0,
    verifyAsks: 0,
  };
  return brain.strangers[name];
}

/**
 * Why the NPC let someone in, when it was for more than a mess: security let in on a warrant, and
 * on whom if they said. By post, for all who keep it to go by, as with whom the department let in
 * (expected.ts): a workmate who did not open the door would otherwise see the officer out a minute
 * later. Then by whom it let in. Kept here and not on the brain, since nothing but the welcome
 * reads it.
 */
type LetInWhy = { warrant: true; on?: string; at: number };
const letInWhy = new Map<string, Map<string, LetInWhy>>();
const whyKey = (brain: NpcBrain) => brain.post ?? `npc:${brain.id}`;

/**
 * Notes that the NPC has sent for someone, or let them into its post. Security let in to serve a
 * warrant say so at the door ("with a warrant for X"); `why.warrant` holds X, or TRUE if they named
 * nobody. Their welcome then lasts while the warrant is being served (see warrantStands).
 */
export function noteSentFor(
  brain: NpcBrain,
  name: string,
  why?: { warrant?: string | true },
): void {
  brain.sentFor[name] = brain.now;
  const mine = letInWhy.get(whyKey(brain)) ?? new Map<string, LetInWhy>();
  letInWhy.set(whyKey(brain), mine);
  if (why?.warrant) {
    mine.set(name, {
      warrant: true,
      on: typeof why.warrant === 'string' ? why.warrant : undefined,
      at: brain.now,
    });
  } else {
    mine.delete(name);
  }
}

/**
 * TRUE while someone let in on a warrant is still serving it: for WARRANT_WELCOME_DS from being let
 * in, unless the one the warrant is on is seen in cuffs, or seen gone from the post and its rooms.
 * The keeper cannot know the officer's list; it knows only what it was told at the door and what it
 * sees. A general rule for whoever keeps a locked room, not for cargo alone.
 */
function warrantStands(brain: NpcBrain, name: string): boolean {
  const why = letInWhy.get(whyKey(brain))?.get(name);
  if (!why || brain.now - why.at > WARRANT_WELCOME_DS) {
    return false;
  }
  const on = why.on?.toLowerCase();
  const target = on
    ? brain.peopleInView.find((person) => person.name.toLowerCase() === on)
    : undefined;
  if (target?.cuffed) {
    return false;
  }
  const gone =
    !!target &&
    !target.in_post &&
    !(target.place !== undefined && brain.closedRooms.includes(target.place));
  return !gone;
}

/** TRUE if the NPC sent for this person, or let them in, not long ago. */
function sentFor(brain: NpcBrain, name: string): boolean {
  const at = brain.sentFor[name];
  if (at !== undefined && brain.now - at < SENT_FOR_DS) {
    return true;
  }
  // A workmate's call is on the department's list, for all who work there to go by.
  return !!brain.post && !!expectedCall(brain.post, name, brain.now);
}

/**
 * TRUE while what this person was sent for is still there to be done: a mess in a room of the
 * department that they are expected at. Sent for to several rooms, they are welcome until the
 * last of them is seen to.
 */
function welcomeStands(brain: NpcBrain, name: string): boolean {
  const post = brain.post;
  return (
    !!post &&
    Object.keys(brain.areaMesses).some(
      (room) => !!expectedCall(post, name, brain.now, room),
    )
  );
}

/** How long (deciseconds) an ask to be let out counts as being on the way out: as long as the ask stands (LET_OUT_ASK_DS in cargo.ts). */
const ASKED_OUT_DS = 3000;

/**
 * TRUE if this person has asked the NPC to be let out, lately: they are on their way. Any of their
 * asks is looked at, not only the newest: a second janitor asking a few seconds later used to
 * leave the first one to be walked out at the door it was waiting at (KNA-01).
 */
function askingOut(brain: NpcBrain, name: string): boolean {
  const asks = brain.doorAsks ?? (brain.doorAsked ? [brain.doorAsked] : []);
  return asks.some(
    (ask) =>
      ask.name === name && !!ask.out && brain.now - ask.at < ASKED_OUT_DS,
  );
}

/** How someone the NPC answers to is spoken to: the Captain by rank, anyone else by first name. */
function titleOf(brain: NpcBrain, name: string): string {
  const job = brain.peopleInView.find((seen) => seen.name === name)?.job ?? '';
  return /captain/i.test(job) ? 'Captain' : firstName(name);
}

/**
 * Whoever in the post these words point at: someone named, failing that someone spoken of by their
 * job ("this janitor"), and failing that, if the words say "him", "her" or "that one", the only
 * person in there who does not belong. Null if they point at nobody: "the crates", "the mail".
 */
function strangerMeant(brain: NpcBrain, words: string): string | null {
  const named = strangerNamedIn(brain, words);
  if (named) {
    return named;
  }
  const inPost = brain.peopleInView.filter(
    (person) => person.in_post && !person.belongs,
  );
  const byJob = inPost.filter((person) =>
    person.job
      .toLowerCase()
      .split(/[^a-z]+/)
      .some((word) => word.length > 3 && new RegExp(`\\b${word}s?\\b`).test(words)),
  );
  if (byJob.length === 1) {
    return byJob[0].name;
  }
  return inPost.length === 1 && POINTING_WORDS.test(words)
    ? inPost[0].name
    : null;
}

/**
 * Whom these words, in lower case, order put out of the post, or null if they are no such order.
 * The person must be what the verb is done to: "get him out", "put Tolly out", "throw out the
 * clown", "remove him", or the one said to have no right there: "Tolly has no business here". A
 * line about things ("take the crates out", "get the mail out") puts nobody out, and nor does a
 * bare "get out of here", which is said to the stranger, who heard it.
 */
function putOutMeant(brain: NpcBrain, heard: string): string | null {
  for (const match of heard.matchAll(PUT_OUT_VERB)) {
    const between = match[1].trim();
    const after = match[2].trim();
    // Whom is between the verb and "out", or straight after "out" when nothing is between:
    // "throw out the clown". Not after "out of" or "out to": "take the crates out to the janitor".
    const words = between
      ? between
      : /^(of|to|from|on|onto|in|into|at|for|by|with)\b/.test(after)
        ? ''
        : after;
    const target = words ? strangerMeant(brain, words) : null;
    if (target) {
      return target;
    }
  }
  for (const match of heard.matchAll(REMOVE_VERB)) {
    const target = match[1].trim() ? strangerMeant(brain, match[1]) : null;
    if (target) {
      return target;
    }
  }
  return NO_RIGHT_WORDS.test(heard) ? strangerMeant(brain, heard) : null;
}

/** TRUE if this is a room the NPC has been told to leave, or is keeping out of since: it does no work there. */
export function barred(brain: NpcBrain, place: string): boolean {
  return (
    brain.toldToLeave?.room === place ||
    (brain.keptOut[place] ?? 0) > Date.now()
  );
}

/** The plain words in which it answers that it is going. */
function leavingLine(brain: NpcBrain): string {
  const told = brain.toldToLeave;
  return told ? `Yes, ${titleOf(brain, told.by)}. I am going.` : '';
}

/**
 * What having been told to leave a room comes down to right now: saying that it is going, and
 * going. Null if it has not been told to, or is out. If the room is locked to it, the walk out
 * comes to nothing, and that is what sets it asking for the door it came in by.
 */
export function leavingStep(
  brain: NpcBrain,
): { key: string; text: string; say?: string; needs?: RegExp; act?: Action } | null {
  const told = brain.toldToLeave;
  if (!told) {
    return null;
  }
  if (
    brain.location !== told.room ||
    Date.now() - told.at > TOLD_TO_LEAVE_MS
  ) {
    brain.toldToLeave = null;
    return null;
  }
  const title = titleOf(brain, told.by);
  if (!told.said) {
    return {
      key: `${LEAVING_KEY}:say`,
      text: `${told.by}, whom you answer to, has told you to leave the ${told.room}. You are going, whatever you were doing there. In "say", tell ${told.by} so, beginning with "Yes, ${title}".`,
      say: leavingLine(brain),
      needs: has('yes'),
    };
  }
  // Back where it came in from, if it remembers; failing that, anywhere else it knows.
  const others = knownPlaces(brain).filter(
    (place) => place !== told.room && !barred(brain, place),
  );
  const out =
    brain.wayOutTo && brain.wayOutTo !== told.room
      ? brain.wayOutTo
      : brain.cameFrom && others.includes(brain.cameFrom)
        ? brain.cameFrom
        : others[0];
  if (!out) {
    return null;
  }
  return {
    key: `${LEAVING_KEY}:go`,
    text: `${told.by} has told you to leave the ${told.room}, and you are leaving it for the ${out}.`,
    act: { tool: 'go_to', place: out },
  };
}

/** TRUE while a workmate is seeing to this stranger, so the NPC leaves it to them. */
function standingBack(brain: NpcBrain, stranger: Stranger): boolean {
  return (
    stranger.handledAt !== undefined &&
    brain.now - stranger.handledAt < STAND_BACK_DS
  );
}

/** Settles whether a stranger stays or goes. Nobody who outranks the NPC is made to go. */
function settle(
  brain: NpcBrain,
  name: string,
  stranger: Stranger,
  verdict: 'stay' | 'go',
): void {
  const person = brain.peopleInView.find((seen) => seen.name === name);
  stranger.verdict = verdict === 'go' && person?.command ? 'stay' : verdict;
}

/** The stranger these words, in lower case, are about, if they name one. */
function strangerNamedIn(brain: NpcBrain, heard: string): string | null {
  const names = new Set([
    ...Object.keys(brain.strangers),
    ...brain.peopleInView
      .filter((person) => person.in_post && !person.belongs)
      .map((person) => person.name),
  ]);
  return [...names].find((name) => namesPerson(heard, name)) ?? null;
}

/** Whoever these words, in lower case, name among the people who work at the post, the NPC last of all. */
function workmateNamedIn(
  brain: NpcBrain,
  heard: string,
  except: string[],
): string | null {
  // The NPC's own name used to speak to it ("Donna, the QM sent me") names nobody (PARSE-07).
  const line = unaddressed(heard, brain.name);
  const others = [...brain.workmates].filter(
    (name) => !except.includes(name) && name !== brain.name,
  );
  // A job named ("the QM sent me") is the one workmate who holds it.
  const byJob = (name: string) => {
    const job = jobOf(brain, name);
    return (
      !!job &&
      jobWords(job).test(line) &&
      others.filter((other) => jobOf(brain, other) === job).length === 1
    );
  };
  return (
    others.find((name) => byName(line, name)) ??
    others.find(byJob) ??
    (byName(line, brain.name) ? brain.name : null)
  );
}

/**
 * The Captain or a head of staff a stranger's answer, in lower case, says sent them, if it names
 * one: by name, or by a title only one of them holds ("the Captain sent me", "the HoP asked me to
 * come"). Not a workmate: those are asked in the usual way. Null if it names none, or says nothing
 * of being sent.
 */
function headNamedIn(
  brain: NpcBrain,
  heard: string,
  stranger: string,
): string | null {
  if (!/\b(sent|send|asked|told|wants?|wanted|ordered|called)\b/.test(heard)) {
    return null;
  }
  const line = unaddressed(heard, brain.name);
  const heads = [...brain.peopleInView, ...brain.pdaPeople].filter(
    (person, index, all) =>
      all.findIndex((other) => other.name === person.name) === index &&
      person.name !== stranger &&
      person.name !== brain.name &&
      !brain.workmates.has(person.name) &&
      (/captain/i.test(person.job) || isHead(person.job)),
  );
  return (
    heads.find((person) => byName(line, person.name))?.name ??
    heads.find(
      (person) =>
        jobWords(person.job).test(line) &&
        heads.filter((other) => other.job === person.job).length === 1,
    )?.name ??
    null
  );
}

/**
 * The Captain's or a head's answer to "Did you send X to the Y?", face to face or by PDA: a reply
 * beginning "Yes" lets X stay, one beginning "No" puts them out (SECT-08 B). With several asked
 * of the same one, the reply that names a stranger is about that one.
 */
function headAnswer(
  brain: NpcBrain,
  from: string,
  heard: string,
  at: number,
): boolean {
  const asked = Object.keys(brain.strangers).filter((name) => {
    const ask = headAsks.get(headKey(brain, name));
    return (
      ask?.head === from &&
      ask.askedAt !== undefined &&
      at >= ask.askedAt &&
      !brain.strangers[name].verdict
    );
  });
  if (asked.length === 0) {
    return false;
  }
  const line = heard.toLowerCase();
  const about =
    asked.find((name) => namesPerson(line, name)) ??
    (asked.length === 1 ? asked[0] : undefined);
  const yes = /^\W*(?:[\w.]+,\s*)?yes\b/.test(line);
  const no = /^\W*(?:[\w.]+,\s*)?no\b/.test(line);
  if (!about || yes === no) {
    return false;
  }
  headAsks.delete(headKey(brain, about));
  const stranger = brain.strangers[about];
  if (yes) {
    stranger.verdict = 'stay';
    stranger.voucher = from;
  } else {
    settle(brain, about, stranger, 'go');
  }
  return true;
}

/**
 * Reads a PDA message for this duty: the Captain's or a head's answer to a keeper's "Did you send
 * X to the Y?" (SECT-08 B). Returns TRUE if it was one. Called from the keeper's job.
 */
export function guardReadsMessage(
  brain: NpcBrain,
  from: string,
  text: string,
): boolean {
  return headAnswer(brain, from, text, brain.now);
}

/** Openers before a name that is only speaking to someone: "hi Donna", "sorry Donna". */
const ADDRESS_OPENERS = 'hi|hey|hello|sorry|ok|okay|oh|yes|yeah|well|look';

/** These words, in lower case, with this person's first name taken out where it only speaks to them. */
function unaddressed(heard: string, name: string): string {
  const first = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .find((part) => part.length > 2);
  if (!first) {
    return heard;
  }
  return heard
    .replace(new RegExp(`^\\W*(?:${ADDRESS_OPENERS})\\W+${first}\\b`), '')
    .replace(new RegExp(`^\\W*${first}\\s*[,!:.]`), '')
    .replace(new RegExp(`,\\s*${first}\\b(?=\\s*[,.!?]|\\s*$)`, 'g'), '');
}

/** TRUE if these words name this person: by first name, full name, or "Mr/Mrs/Ms" and surname. */
function byName(heard: string, name: string): boolean {
  const parts = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2);
  const [first, last] = [parts[0], parts[parts.length - 1]];
  return (
    (!!first && new RegExp(`\\b${first}\\b`).test(heard)) ||
    (!!last && new RegExp(`\\b(?:mr|mrs|ms|miss)\\.? ${last}\\b`).test(heard))
  );
}

/** The job this NPC knows someone by, from seeing them or its PDA list, or ''. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** Short names the crew use for jobs. */
const JOB_SHORT: Record<string, string> = {
  quartermaster: 'qm',
  'head of personnel': 'hop',
  'chief engineer': 'ce',
  'head of security': 'hos',
  'chief medical officer': 'cmo',
  'research director': 'rd',
  'cargo technician': 'cargo tech',
};

/** A job's title, or its short name, as a word. */
function jobWords(job: string): RegExp {
  const title = job.toLowerCase();
  const short = JOB_SHORT[title];
  return new RegExp(`\\b(?:${title}${short ? `|${short}` : ''})\\b`);
}

/** What a yes-or-no answer, in lower case, comes to, or null if it is neither. */
export function yesOrNo(heard: string): boolean | null {
  // "No problem", "not done yet" and the like are no no (SECT-09).
  const line = heard.replace(SET_PHRASES, ' ');
  // How the answer begins settles it, the no first: "I did not" begins with "I did".
  if (BEGINS_NO.test(line)) {
    return false;
  }
  if (BEGINS_YES.test(line)) {
    return true;
  }
  if (NO_WORDS.test(line)) {
    return false;
  }
  return YES_WORDS.test(line) ? true : null;
}

/** Makes sure there is a task of this kind about this person or thing, and none about any other. */
function keepTask(
  brain: NpcBrain,
  kind: string,
  item: string | undefined,
  urgency: 'emergency' | 'asked',
): void {
  let found = false;
  for (const task of brain.tasks) {
    if (task.kind !== kind || task.state === 'done') {
      continue;
    }
    if (task.item === item) {
      found = true;
    } else {
      finishTask(brain, task);
    }
  }
  if (item && !found) {
    addTask(brain, { kind, item, urgency, source: 'own' });
  }
}

/**
 * Keeps track of who is in the NPC's post without a right to be, how far things have got with each
 * of them, and what the NPC has been asked and has yet to answer.
 */
export function syncGuarding(brain: NpcBrain): void {
  if (brain.post) {
    for (const person of brain.peopleInView) {
      if (person.belongs) {
        brain.workmates.add(person.name);
      } else if (
        person.in_post &&
        // Someone seen to belong earlier in the round is a workmate whose card no longer opens
        // the door, not a stranger (MULTI-03). Unless a superior has ordered them out.
        (!brain.workmates.has(person.name) ||
          !!brain.strangers[person.name]?.orderedBy)
      ) {
        recordOf(brain, person.name).lastSeenAt = brain.now;
      }
    }
  }
  for (const [name, stranger] of Object.entries(brain.strangers)) {
    const seen = brain.peopleInView.find((person) => person.name === name);
    // Seen outside the room, or not seen for a good while: they are gone, and so is the matter.
    // A workmate is no stranger, unless ordered out.
    if (
      (seen && (!seen.in_post || seen.belongs)) ||
      (brain.workmates.has(name) && !stranger.orderedBy) ||
      brain.now - stranger.lastSeenAt > GONE_DS
    ) {
      delete brain.strangers[name];
      headAsks.delete(headKey(brain, name));
      continue;
    }
    // Nobody who outranks the NPC is made to go, however the asking came out. Nor is security
    // with a warrant to serve in here, whoever orders it (ARR-02: the server refuses it too).
    if (
      stranger.verdict === 'go' &&
      (seen?.command || warrantStands(brain, name))
    ) {
      stranger.verdict = 'stay';
      stranger.sent ||= warrantStands(brain, name);
    }
    // Sent for, they may stay for as long as what they were sent for lasts. Once the mess is
    // gone, with nothing further in left for them, their welcome is over. They are given a
    // little while to go, and anyone who is already asking for the door is on their way.
    // Security let in on a warrant are welcome while they serve it: an officer walked out by
    // the arm a minute after being let in took the hold for an attack (ARR-02).
    if (stranger.verdict === 'stay' && stranger.sent) {
      if (welcomeStands(brain, name) || warrantStands(brain, name)) {
        stranger.overAt = undefined;
      } else {
        stranger.overAt ??= brain.now;
        const leaving = askingOut(brain, name);
        if (!leaving && brain.now - stranger.overAt > WELCOME_GRACE_DS) {
          stranger.seenOut = true;
          settle(brain, name, stranger, 'go');
        }
      }
    }
    if (stranger.verdict) {
      continue;
    }
    const waitedOut = (since: number | undefined, asks: number) =>
      asks >= ASKS && since !== undefined && brain.now - since > ANSWER_WAIT_DS;
    if (sentFor(brain, name)) {
      stranger.verdict = 'stay';
      stranger.sent = true;
    } else if (seen?.command && stranger.asks >= 1) {
      // Its betters are asked, out of duty. What they answer is their own affair.
      stranger.verdict = 'stay';
    } else if (headAsks.has(headKey(brain, name))) {
      // They say the Captain or a head sent them: that one is asked, and only a yes lets them
      // stay. No answer in two minutes is no yes (SECT-08 B).
      const ask = headAsks.get(headKey(brain, name));
      if (
        ask?.askedAt !== undefined &&
        brain.now - ask.askedAt > HEAD_ANSWER_DS &&
        !seen?.down
      ) {
        headAsks.delete(headKey(brain, name));
        settle(brain, name, stranger, 'go');
      }
    } else if (stranger.voucher) {
      // Whoever is said to have sent for them is not there to ask, or will not say. Their word is taken.
      if (
        !brain.peopleInView.some((person) => person.name === stranger.voucher) ||
        waitedOut(stranger.verifyAskedAt, stranger.verifyAsks)
      ) {
        stranger.verdict = 'stay';
      }
    } else if (waitedOut(stranger.askedAt, stranger.asks) && !seen?.down) {
      // Asked twice, and not a word. Someone lying down, out cold or worse, cannot answer: that is
      // no refusal, and the matter waits while they are down (SENSE-01).
      settle(brain, name, stranger, 'go');
    }
  }

  // Each stranger who has yet to account for themselves, or has to go, is the NPC's to see to,
  // unless a workmate already is.
  const mine = Object.entries(brain.strangers)
    .filter(
      ([, stranger]) =>
        stranger.verdict !== 'stay' && !standingBack(brain, stranger),
    )
    .map(([name]) => name);
  for (const task of brain.tasks) {
    if (
      task.kind === STRANGER &&
      task.state !== 'done' &&
      !mine.includes(task.item ?? '')
    ) {
      finishTask(brain, task);
    }
  }
  for (const name of mine) {
    addTask(brain, { kind: STRANGER, item: name, urgency: 'asked', source: 'own' });
  }

  // A question put to the NPC is answered, and does not stand for ever.
  if (
    brain.challenged &&
    brain.now - brain.challenged.at > QUESTION_STANDS_DS
  ) {
    brain.challenged = null;
  }
  if (
    brain.vouchAsked &&
    brain.now - brain.vouchAsked.at > QUESTION_STANDS_DS
  ) {
    brain.vouchAsked = null;
  }
  keepTask(brain, EXPLAIN, brain.challenged?.by, 'emergency');
  keepTask(brain, VOUCH, brain.vouchAsked?.about, 'emergency');
}

/** Why the NPC is in the room it is in, if someone sent for it or let it in: who, and what for. */
function reasonToBeHere(
  brain: NpcBrain,
): { who: string; what: string | null } | null {
  const task = brain.tasks.find(
    (work) => work.place === brain.location && !!work.askedBy,
  );
  if (task?.askedBy) {
    return {
      who: task.askedBy,
      what: jobFor(brain.job).describeTask?.(task) ?? null,
    };
  }
  return brain.letInBy ? { who: brain.letInBy, what: null } : null;
}

/**
 * TRUE if this body is security with a warrant it is serving on someone in this room, or in a room
 * reached through it: seen here, last seen or shut out there, or forced open there for it. Read from
 * its own list of warrants (`brain.beat`, jobs/arrests.ts), as it knows it.
 */
function onWarrantIn(brain: NpcBrain, room: string): boolean {
  if (!isSecurity(brain.job) || !room) {
    return false;
  }
  // Whether a room is this one, or further in through it.
  const within = (place: string | undefined) => {
    let at = place;
    for (let step = 0; at && step < 8; step++) {
      if (at === room) {
        return true;
      }
      at = brain.reachedThrough[at];
    }
    return false;
  };
  return (brain.beat?.warrants ?? []).some(
    (warrant) =>
      brain.peopleInView.some(
        (person) => person.name === warrant.name && !person.cuffed,
      ) ||
      within(warrant.lastSeen?.place) ||
      within(warrant.shutOut?.place) ||
      within(warrant.opened?.place),
  );
}

/** Answering someone who has asked the NPC why it is in a room: the truth, as the code knows it. */
function explainStep(brain: NpcBrain): Plan {
  const by = brain.challenged?.by;
  if (!by || !brain.peopleInView.some((person) => person.name === by)) {
    return { ready: false, step: 'Whoever asked has gone.' };
  }
  const why = reasonToBeHere(brain);
  // Its own post is the one room it always has a reason to be in, card or no card (MULTI-03).
  if (!why && brain.post && brain.location === brain.post) {
    return {
      ready: true,
      step: `${by} has asked why you are in ${brain.location}. It is where you work. In "say", tell ${by} so, beginning with "I work here".`,
      say: 'I work here.',
      needs: has('work'),
    };
  }
  // Security with a warrant to serve in here, or in a room reached through here, however it got
  // in: it says so, and names nobody, since the one wanted may be in earshot (PLAY-14, ARR-02).
  if (!why && onWarrantIn(brain, brain.location)) {
    return {
      ready: true,
      step: `${by} has asked why you are in ${brain.location}. The truth is that you are here on security business, to serve a warrant. Do not say on whom. In "say", tell ${by} so, beginning with "I am here on a warrant".`,
      say: 'I am here on a warrant.',
      needs: has('warrant'),
    };
  }
  if (!why) {
    return {
      ready: true,
      step: `${by} has asked why you are in ${brain.location}. The truth is that nobody sent for you and nobody let you in: you have no business in here. In "say", own up to it, beginning with "Nobody sent for me".`,
      say: 'Nobody sent for me. I should not be in here, I know.',
      needs: has('nobody'),
    };
  }
  const sender = why.who === by ? 'You' : firstName(why.who);
  return {
    ready: true,
    step: `${by} has asked why you are in ${brain.location}. The truth is that ${why.who} sent for you${why.what ? `, to ${why.what}` : ''}. In "say", tell ${by} so, and name ${why.who}.`,
    say: `${sender} asked me to come in here${why.what ? `, to ${why.what}` : ''}.`,
    needs: why.who === by ? undefined : has(eitherName(why.who)),
  };
}

/** Answering a workmate who has asked whether the NPC sent for someone: yes or no, as the code knows it. */
function vouchStep(brain: NpcBrain): Plan {
  const asked = brain.vouchAsked;
  if (!asked || !brain.peopleInView.some((person) => person.name === asked.by)) {
    return { ready: false, step: 'Whoever asked has gone.' };
  }
  const did = sentFor(brain, asked.about);
  const answer = did ? 'Yes' : 'No';
  return {
    ready: true,
    step: `${asked.by} has asked whether you sent for ${asked.about}. ${did ? 'You did: you called them in, or let them in yourself.' : 'You did not: you neither called them nor let them in.'} In "say", tell ${asked.by} so, beginning with "${answer}".`,
    say: did
      ? `Yes, ${firstName(asked.by)}, I asked ${firstName(asked.about)} to come in.`
      : `No, ${firstName(asked.by)}, I did not ask ${firstName(asked.about)} in here.`,
    // The answer comes first, so the one who asked reads it right (SECT-09).
    needs: new RegExp(`^\\W*${answer}\\b`, 'i'),
  };
}

/** What seeing to a stranger in the post comes down to right now, or null if the task is not this duty's. */
export function planGuarding(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === EXPLAIN) {
    return explainStep(brain);
  }
  if (task.kind === VOUCH) {
    return vouchStep(brain);
  }
  if (task.kind !== STRANGER) {
    return null;
  }
  const name = task.item ?? '';
  const stranger = brain.strangers[name];
  const person = brain.peopleInView.find((seen) => seen.name === name);
  if (!stranger || !person) {
    return { ready: false, step: `${name} is out of your sight.` };
  }
  const first = firstName(name);
  const room = `the ${brain.post}`;
  if (stranger.verdict === 'go') {
    const out = `${SEEING_OUT[0].toUpperCase()}${SEEING_OUT.slice(1)}`;
    if (stranger.toldOutAt === undefined) {
      // Ordered out by someone the NPC answers to: that is the whole of the reason.
      if (stranger.orderedBy) {
        return {
          ready: true,
          step: `${stranger.orderedBy}, whom you answer to, has ordered ${name} put out of ${room}. In "say", tell ${name} they have to leave, and that you are walking them out.`,
          say: `${first}, ${titleOf(brain, stranger.orderedBy) === 'Captain' ? 'the Captain' : firstName(stranger.orderedBy)} wants you out of here. ${out}.`,
          needs: has(eitherName(name)),
        };
      }
      // What they were sent for is done with, and they have not gone: seen out, not turned out.
      if (stranger.seenOut) {
        return {
          ready: true,
          step: `${name} was sent for, and what they were sent for is done with. They are still in ${room}, which is locked to them. In "say", thank ${name}, and tell them you are seeing them out.`,
          say: `Thank you, ${first}, that is all that was wanted in here. ${out}: I will see you to the door.`,
          needs: has(eitherName(name)),
        };
      }
      return {
        ready: true,
        step: `${name} has no good reason to be in ${room}${stranger.voucher ? `: ${stranger.voucher} did not send for them` : ''}. In "say", tell ${name} they have to leave, and that you are walking them out.`,
        say: `You have no business in here, ${first}. ${out}.`,
        needs: has(eitherName(name)),
      };
    }
    // Told to go, they are given a moment to go of their own accord, and one asking for the door
    // is on their way. Only one who stays is taken by the arm (MULTI-08 B).
    if (
      brain.now - stranger.toldOutAt < LEAVE_GRACE_DS ||
      askingOut(brain, name)
    ) {
      return {
        ready: false,
        wait: true,
        step: `You have told ${name} to leave ${room}, and are giving them a moment to go of their own accord.`,
      };
    }
    return {
      ready: true,
      step: stranger.seenOut
        ? `${name} has nothing left to do in ${room}. You are taking them by the arm and seeing them out.`
        : `${name} has no business in ${room}. You are taking them by the arm and walking them out.`,
      act: { tool: 'throw_out', person: person.handle },
    };
  }
  const waiting = (since: number | undefined) =>
    since !== undefined && brain.now - since < ANSWER_WAIT_DS;
  // They say the Captain or a head sent them. That one is asked: face to face if in sight, else by
  // PDA. They wait for a yes (SECT-08 B).
  const headAsk = headAsks.get(headKey(brain, name));
  if (headAsk) {
    const head = headAsk.head;
    if (headAsk.askedAt !== undefined) {
      return {
        ready: false,
        wait: true,
        step: `${name} says ${head} sent them. You have asked ${head}${headAsk.byPda ? ' by PDA' : ''} whether they did, and are waiting for a yes. They stay until then.`,
      };
    }
    if (brain.peopleInView.some((seen) => seen.name === head)) {
      return {
        ready: true,
        step: `${name} says ${head} sent them, and ${head} is here. In "say", ask ${head} outright, with respect, "${sentAskLine(name, brain.post ?? '')}"`,
        say: `${titleOf(brain, head)}, ${sentAskLine(name, brain.post ?? '').replace(/^D/, 'd')}`,
        exact: true,
      };
    }
    // Not in sight: by PDA. With no PDA it cannot ask, and no yes will come.
    headAsk.askedAt = brain.now;
    if (brain.hasPda) {
      headAsk.byPda = true;
      brain.toTell.push({
        to: head,
        line: sentAskLine(name, brain.post ?? ''),
        why: `${name} is in the ${brain.post}, which is locked to them, and says ${head} sent them. You are asking ${head} whether that is so.`,
        byPda: true,
        at: Date.now(),
      });
    }
    return {
      ready: false,
      wait: true,
      step: `${name} says ${head} sent them. You are asking ${head} by PDA whether they did.`,
    };
  }
  if (stranger.voucher) {
    if (waiting(stranger.verifyAskedAt)) {
      return {
        ready: false,
        wait: true,
        step: `You have asked ${stranger.voucher} whether they sent for ${name}, and are waiting to hear.`,
      };
    }
    const voucher = firstName(stranger.voucher);
    return {
      ready: true,
      step: `${name} says ${stranger.voucher} sent for them. ${stranger.voucher} is here: in "say", ask ${stranger.voucher} outright, by name, "${ASKING_WHO} ${first} to come in here?"`,
      say: `${voucher}, ${ASKING_WHO} ${first} to come in here?`,
      needs: has(eitherName(stranger.voucher), eitherName(name), ASKING_WHO),
    };
  }
  if (waiting(stranger.askedAt)) {
    return {
      ready: false,
      wait: true,
      step: `You have asked ${name} why they are in ${room}, and are waiting for an answer.`,
    };
  }
  // Someone lying down, out cold or worse, is not asked what they are doing in here (SENSE-01).
  if (person.down) {
    return {
      ready: false,
      step: `${name} is lying down in ${room} and cannot answer you.`,
    };
  }
  if (
    stranger.asks === 0 &&
    brain.now - stranger.seenAt < LOOK_FIRST_DS + stagger(brain, STAGGER_DS)
  ) {
    return {
      ready: false,
      step: `${name} is in ${room}, and you do not know why.`,
    };
  }
  return {
    ready: true,
    step: `${name}${person.job ? `, ${person.job},` : ''} is in ${room}, which is locked to everyone who does not work in it. You did not send for them and you did not let them in. In "say", ask ${name} outright, by name, "${ASKING_WHY}?"${person.command ? ' They outrank you, so ask with respect.' : ''}`,
    say: `${first}, ${ASKING_WHY}? This room is locked to the crew.`,
    needs: has(eitherName(name), CHALLENGE_WORDS),
    // A workmate may have asked, or the matter been settled, while the words were being found.
    sayIf: () => {
      const now = brain.strangers[name];
      return !!now && !now.verdict && !standingBack(brain, now);
    },
  };
}

/** Says one of this duty's tasks in a few words, or null if the task is not this duty's. */
export function describeGuarding(task: Task): string | null {
  switch (task.kind) {
    case STRANGER:
      return `find out what ${task.item} is doing in your post`;
    case EXPLAIN:
      return `tell ${task.item} why you are in here`;
    case VOUCH:
      return `say whether you sent for ${task.item}`;
    default:
      return null;
  }
}

/** What the LLM should know about who is in the post and why, so that what it says matches what the body does. */
export function guardCues(brain: NpcBrain): string[] {
  const lines: string[] = [];
  for (const [name, stranger] of Object.entries(brain.strangers)) {
    if (!brain.peopleInView.some((person) => person.name === name)) {
      continue;
    }
    if (stranger.verdict === 'stay') {
      lines.push(
        `${name} is in the ${brain.post} with good reason${sentFor(brain, name) ? ': you sent for them, or let them in yourself' : stranger.voucher ? `: ${stranger.voucher} sent for them` : ''}. Leave them to it.`,
      );
    } else if (stranger.verdict === 'go') {
      lines.push(
        stranger.orderedBy
          ? `${stranger.orderedBy}, whom you answer to, has ordered ${name} out of the ${brain.post}, and you are walking them out of it. You do not argue the order.`
          : stranger.seenOut
            ? `What ${name} was sent for in the ${brain.post} is done with, and you are seeing them out of it.`
            : `${name} has no business in the ${brain.post}, and you are walking them out of it.`,
      );
    } else if (standingBack(brain, stranger)) {
      lines.push(
        `${stranger.handledBy} is finding out why ${name} is in the ${brain.post}. Leave that to ${stranger.handledBy}: do not ask ${name} yourself.`,
      );
    } else if (stranger.voucher) {
      lines.push(
        `${name} says ${stranger.voucher} sent for them into the ${brain.post}. You do not know yet whether that is so: do not tell ${name} they may stay, or that they must go.`,
      );
    }
  }
  if (brain.inHand) {
    lines.push('Someone has you by the arm and is walking you out of the room. You go along with it.');
  }
  if (brain.toldToLeave) {
    lines.push(
      `${brain.toldToLeave.by}, whom you answer to, has told you to leave the ${brain.toldToLeave.room}. You are going: you do not argue it, and you do not stay to finish anything.`,
    );
  }
  return lines;
}

/**
 * Follows what is said in the NPC's hearing about who is in a locked room and why: the answers to
 * its own questions, the questions put to it, and what its workmates ask and are told.
 */
export function guardOverhears(brain: NpcBrain, event: SenseEvent): void {
  const speaker = String(event.details.speaker ?? '');
  const heard = String(event.details.message ?? '').toLowerCase();
  if (!speaker || speaker === brain.name) {
    return;
  }

  // Someone asks the NPC why it is where it is. If it was sent for, or is in a room that is
  // locked to it, the answer is a matter of fact and is given as one. Asked the same in a
  // hallway, it is only being talked to.
  if (
    CHALLENGE_WORDS.test(heard) &&
    namesPerson(heard, brain.name) &&
    (brain.outOfBounds || reasonToBeHere(brain))
  ) {
    brain.challenged = { by: speaker, at: brain.now };
  }

  // Told to leave by someone it answers to: the Captain, or the head of its own department. It
  // goes, and keeps out a while. Whether it was sent for makes no difference, and nobody is told
  // to leave their own post this way.
  const superior = !!brain.peopleInView.find(
    (person) => person.name === speaker,
  )?.superior;
  if (
    superior &&
    toldToLeaveHere(brain, heard) &&
    (event.details.said_to === 'me' || namesPerson(heard, brain.name)) &&
    brain.location !== brain.post
  ) {
    brain.toldToLeave = {
      by: speaker,
      room: brain.location,
      at: Date.now(),
      said: false,
    };
    brain.keptOut[brain.location] = Date.now() + KEPT_OUT_MS;
  }

  // The rest is for those with a post to keep.
  if (!brain.post) {
    return;
  }

  // Told by someone it answers to to put someone out of its post. That settles it, sent for or
  // not: the call that brought them is struck off. One of those at the post takes it, and the
  // rest stand back. Nobody lays a hand on the Captain or a head of staff, whoever orders it.
  if (superior && event.details.said_to !== 'other') {
    const target = putOutMeant(brain, heard);
    if (target) {
      const record = recordOf(brain, target);
      if (
        takeOrder(
          brain.post,
          `${speaker}, to put ${target} out`,
          brain.name,
          brain.now,
        )
      ) {
        record.orderedBy = speaker;
        record.toldOutAt = undefined;
        record.seenOut = false;
        record.verdict = undefined;
        settle(brain, target, record, 'go');
        forgetExpected(brain.post, target);
        delete brain.sentFor[target];
        // Nor are they sent for again to whatever they were called to: the next call goes to someone else.
        for (const call of Object.values(brain.janitorCalls)) {
          if (call.to === target) {
            call.declined = [...new Set([...(call.declined ?? []), target])];
            call.declinedAt = brain.now;
          }
        }
        if (record.verdict === 'go') {
          brain.toTell.push({
            to: speaker,
            line: `Yes, ${titleOf(brain, speaker)}. I am putting ${firstName(target)} out.`,
            why: `${speaker}, whom you answer to, has ordered ${target} put out of the ${brain.post}. You are saying that you will, and then doing it.`,
            needs: has('yes'),
            at: Date.now(),
          });
        }
      } else {
        // A workmate has taken it. This one stands back and lets them.
        record.handledBy = 'Your workmate';
        record.handledAt = brain.now;
      }
    }
  }

  // A stranger answers the NPC's question. Naming someone who works here is a reason, to be
  // checked. Owning up to having none, or naming the NPC itself, which knows it did not send for
  // them, settles it the other way.
  const asked = brain.strangers[speaker];
  // Security in the post saying it is here on a warrant: the warrant is the permission, whoever
  // asked and however it got in, and its welcome lasts while it is served (PLAY-14, ARR-02). Read
  // before owning up, since "nobody" may be in the same line.
  if (
    asked &&
    asked.verdict !== 'stay' &&
    /\bwarrant\b/.test(heard) &&
    isSecurity(jobOf(brain, speaker))
  ) {
    noteSentFor(brain, speaker, { warrant: true });
    asked.verdict = 'stay';
    asked.sent = true;
    asked.toldOutAt = undefined;
    asked.orderedBy = undefined;
    headAsks.delete(headKey(brain, speaker));
  } else if (
    asked &&
    !asked.verdict &&
    !asked.voucher &&
    !headAsks.has(headKey(brain, speaker)) &&
    asked.askedAt !== undefined &&
    event.at >= asked.askedAt
  ) {
    // "You let me in", said to the NPC, names the NPC.
    const voucher =
      workmateNamedIn(brain, heard, [speaker]) ??
      (/\byou (?:let me in|asked me|sent for me|sent me)\b/.test(heard)
        ? brain.name
        : null);
    // The Captain or a head named as having sent them: asked, and a yes waited for (SECT-08 B).
    const head = voucher ? null : headNamedIn(brain, heard, speaker);
    if (head) {
      headAsks.set(headKey(brain, speaker), { head });
    } else if (voucher && voucher !== brain.name) {
      asked.voucher = voucher;
    } else if (voucher || NO_REASON_WORDS.test(heard)) {
      settle(brain, speaker, asked, 'go');
    }
    // Anything else is no answer yet. They are asked once more before it is taken for none.
  }

  // The Captain or a head answering, face to face, whether they sent a stranger in.
  headAnswer(brain, speaker, heard, event.at);

  // Whoever was said to have sent for a stranger answers the NPC's question.
  for (const [name, stranger] of Object.entries(brain.strangers)) {
    if (
      stranger.voucher === speaker &&
      !stranger.verdict &&
      stranger.verifyAskedAt !== undefined &&
      event.at >= stranger.verifyAskedAt
    ) {
      const answer = yesOrNo(heard);
      if (answer !== null) {
        settle(brain, name, stranger, answer ? 'stay' : 'go');
      }
    }
  }

  // The answer to a question a workmate put, which the NPC heard as well.
  const listening = brain.verifyHeard;
  if (
    listening &&
    speaker === listening.voucher &&
    brain.now - listening.at < ANSWER_WAIT_DS
  ) {
    const answer = yesOrNo(heard);
    const stranger = brain.strangers[listening.about];
    if (answer !== null) {
      brain.verifyHeard = null;
      if (answer && stranger) {
        stranger.verdict = 'stay';
        stranger.voucher ??= speaker;
      }
    }
  }

  if (!brain.workmates.has(speaker)) {
    return;
  }
  const about = strangerNamedIn(brain, heard);
  if (!about) {
    return;
  }
  // A workmate is asking a stranger their business, or asking after them. One of them doing so
  // is enough: the NPC stands back and listens.
  const asksWhy = CHALLENGE_WORDS.test(heard);
  const asksWho = VOUCH_WORDS.test(heard);
  if (!asksWhy && !asksWho) {
    return;
  }
  const stranger = recordOf(brain, about);
  stranger.handledBy = speaker;
  stranger.handledAt = brain.now;
  if (!asksWho) {
    return;
  }
  if (namesPerson(heard, brain.name)) {
    // The workmate is asking the NPC whether it sent for them.
    brain.vouchAsked = { by: speaker, about, at: brain.now };
  } else {
    // The workmate is asking someone else. The NPC listens for the answer.
    brain.verifyHeard = {
      about,
      voucher: workmateNamedIn(brain, heard, [speaker, about]),
      at: brain.now,
    };
  }
}

/**
 * Notes what the NPC has just said for this duty. `called` is the plain line its work called for:
 * what it said may be in other words, but it said that.
 */
export function guardAfterSaying(brain: NpcBrain, called: string | null): void {
  if (!called) {
    return;
  }
  const said = called.toLowerCase();
  for (const [name, stranger] of Object.entries(brain.strangers)) {
    if (!said.includes(firstName(name).toLowerCase())) {
      continue;
    }
    const headAsk = headAsks.get(headKey(brain, name));
    if (headAsk && said.includes(ASKING_SENT)) {
      headAsk.askedAt = brain.now;
    } else if (said.includes(ASKING_WHY)) {
      stranger.askedAt = brain.now;
      stranger.asks++;
    } else if (said.includes(ASKING_WHO)) {
      stranger.verifyAskedAt = brain.now;
      stranger.verifyAsks++;
    } else if (said.includes(SEEING_OUT)) {
      stranger.toldOutAt = brain.now;
    }
  }
  if (brain.toldToLeave && called === leavingLine(brain)) {
    brain.toldToLeave.said = true;
  }
  if (brain.challenged && called === explainStep(brain).say) {
    brain.challenged = null;
  }
  if (brain.vouchAsked && called === vouchStep(brain).say) {
    brain.vouchAsked = null;
  }
}
