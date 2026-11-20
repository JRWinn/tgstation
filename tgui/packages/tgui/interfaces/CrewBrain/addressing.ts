/**
 * Who something was said to.
 *
 * In a room with several people in it, most of what is said is not said to any one NPC. Answering
 * all of it is what makes a room of them unbearable, and acting on a request made of someone else
 * is worse: asked "Zim, open the door", it was a bot that went and opened it.
 *
 * This is worked out here, in code, before the LLM is asked anything, from what a person in the
 * room would go by: a name, who the speaker is turned towards, who they were just talking with,
 * and how many people there are to mean. The LLM is then told plainly who it was said to.
 *
 * The rules, in order:
 * 1. It calls on this NPC by name (or by its job, if it serves at a post): it was said to this NPC.
 * 2. It uses someone else's name: it was said to them, and is none of this NPC's business.
 * 3. It is put to several people at once ("can either of you"): one of them answers, the nearest.
 * 4. No name at all: it is for this NPC if nobody else is there, if the speaker is beside it or
 *    turned towards it, or if the two of them were just talking. Otherwise it is for nobody.
 */
import type { NpcBrain, SenseEvent } from './types';

/** Who a line was said to, as far as this NPC is concerned. */
export type SaidTo = {
  /** This NPC, someone else by name, several people at once, or nobody in particular. */
  to: 'me' | 'other' | 'group' | 'nobody';
  /** The name of whoever it was said to, if it was said to someone else. */
  name?: string;
};

/** Words that put a thing to everyone there, or to whoever will take it up. */
const GROUP_WORDS =
  /\b(either of you|both of you|any of you|one of you|all of you|you two|you both|you all|you lot|you guys|everyone|everybody|anyone|anybody|someone|somebody|guys|folks)\b/i;
/** How close (in tiles) a speaker must be for talk with no name in it to be meant for whoever is beside them. */
const BESIDE = 1;
/** How close (in tiles) a speaker turned towards the NPC must be for it to count as talking to it. */
const FACING_RANGE = 3;
/** How long (milliseconds) after an exchange the two of them are still taken to be talking. */
const STILL_TALKING_MS = 20000;

/** Words a line may open with before the name of whoever it is for: "Hey Josh, ...". */
const OPENERS =
  '(?:hey|hi|hello|oi|yo|excuse me|sorry|ok|okay|right|so|and|but|please|thanks|thank you)';

/**
 * Words that may stand just before a name that ends the line, and leave it calling on them:
 * "come here tom", "thanks Tom!", "do it now, please tom". Only these: before any other word a
 * name at the end is spoken of, not to ("have you seen Tom?", "arrest Tom").
 */
const BEFORE_A_LAST_NAME =
  '(?:here|there|please|pls|plz|now|mate|thanks|thank you|thx|cheers|sorry|again|ok|okay|it|me|us|them|too|then|quick|quickly)';

/**
 * TRUE if this word (a part of a name, in lower case) is used the way a name is when calling on
 * someone: at the start of what was said, at its end after a word such as "here" or "thanks", or
 * set off from the rest by a comma. `loose` lets a comma after the word anywhere in the line do
 * ("Anyway Josh, ..."), as it does for a first name; a surname or a whole name must open the
 * line or be set off on both sides.
 */
function callsOnWord(
  lower: string,
  word: string,
  inView: boolean,
  loose: boolean,
): boolean {
  // "Oh hey Arielle!" is how the model often opens a line to someone. A first name that is also
  // a word is not one when "I", "me" or "the" follows it: "May I come in?", "Grant me access",
  // "Mark the crate". And someone who is not there is called on only with a comma or a colon:
  // "May, are you there?".
  const asWord = '(?!\\s+(?:i|me|the)\\b)';
  const atStart = new RegExp(
    `^\\W*(?:oh\\W+)?(?:${OPENERS}\\W+)?${word}\\b${asWord}`,
  );
  const atEnd = new RegExp(`\\b${BEFORE_A_LAST_NAME}\\W+${word}\\W*$`);
  const byComma = loose
    ? new RegExp(`(,\\s*${word}\\b${asWord})|(\\b${word}\\s*[,:])`)
    : new RegExp(
        `(,\\s*${word}\\s*(?:[,:!?.]|$))|(^\\W*(?:oh\\W+)?(?:${OPENERS}\\W+)?${word}\\s*[,:])`,
      );
  return (
    (inView && (atStart.test(lower) || atEnd.test(lower))) ||
    byComma.test(lower)
  );
}

/**
 * TRUE if what was said calls on this person by name. Speaking of someone is not speaking to
 * them: "have you seen Billy?" does not call on Billy, and "there is a fire in the bar" does not
 * call on Zim Fire. It has to be their first name or their surname, used the way a name is when
 * calling on someone: at the start of what was said, at its end ("come here, Tom", "over here
 * Tom!"), or set off from the rest by a comma. The same test serves an NPC's own name (MEM-01):
 * "Ann, have the cook make lunch" does not call on Tom Cook.
 */
export function callsOn(heard: string, name: string, inView = true): boolean {
  return calledBy(heard.toLowerCase(), name, inView) !== null;
}

/** Which of its names a line calls someone by, if any: the first name or the surname. */
function calledBy(
  lower: string,
  name: string,
  inView: boolean,
): 'first' | 'last' | null {
  const parts = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2);
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (callsOnShortName(lower, name)) {
    return 'first';
  }
  if (first && callsOnWord(lower, first, inView, true)) {
    // A name of two letters and a longer one ("Al Haines") has its longer one as `first`.
    return name.toLowerCase().startsWith(first) ? 'first' : 'last';
  }
  return last && callsOnWord(lower, last, inView, false) ? 'last' : null;
}

/** The whole of a name as a pattern of words, any punctuation between: "josh[^a-z]+reed". Null for a name of one word. */
function fullName(name: string): string | null {
  const parts = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return parts.length > 1 ? parts.join('[^a-z]+') : null;
}

/** The first word of a name, in lower case. */
function firstWord(name: string): string {
  return name.toLowerCase().split(/[^a-z]+/)[0] ?? '';
}

/**
 * The words people call crew by, for each job. A job not here is called by its title alone.
 * Each is matched as a whole, at the start of a line or set off at its end, so "Engineer" is not
 * found in "Chief Engineer, come here".
 */
const JOB_CALLS: Record<string, string[]> = {
  Captain: ['captain', 'cap'],
  'Head of Personnel': ['head of personnel', 'hop'],
  'Head of Security': ['head of security', 'hos'],
  'Chief Engineer': ['chief engineer', 'ce'],
  'Chief Medical Officer': ['chief medical officer', 'cmo'],
  'Research Director': ['research director', 'rd'],
  Quartermaster: ['quartermaster', 'qm'],
  Janitor: ['janitor', 'jani', 'janny', 'custodian'],
  'Security Officer': ['security officer', 'officer', 'secoff', 'sec'],
  'Cargo Technician': ['cargo technician', 'cargo tech', 'technician', 'cargo'],
  'Station Engineer': ['station engineer', 'engineer', 'engi'],
  'Medical Doctor': ['medical doctor', 'doctor', 'doc'],
};

/** The words a job is called by, in lower case. */
function jobWords(job: string): string[] {
  return JOB_CALLS[job] ?? [job.toLowerCase()];
}

/**
 * TRUE if what was said calls on whoever holds this job by what the job is called: "Officer,
 * over here", "Hey, cargo technician, any mail?", "clean the bar, janitor". A job word set off by
 * a comma in the middle of a line is spoken of, not to ("the janitor, he never cleans"), so only
 * the start and the very end count, and a job word alone at the start must be set off as a name
 * is ("Cargo, open up", not "cargo bay is open").
 */
export function callsOnJob(heard: string, job: string): boolean {
  if (!job) {
    return false;
  }
  const lower = heard.toLowerCase();
  return jobWords(job).some((words) => {
    const word = words
      .split(/[^a-z]+/)
      .filter(Boolean)
      .join('[^a-z]+');
    const atStart = new RegExp(
      `^\\W*(?:oh\\W+)?(?:${OPENERS}\\W+${word}\\b|${word}\\s*(?:[,:!?.]|$))`,
    );
    const atEnd = new RegExp(`,\\s*${word}\\W*$`);
    return atStart.test(lower) || atEnd.test(lower);
  });
}

/** Two-letter words too common to be taken for a first name: "So, ...", "No, ...", "Ok, ...". */
const SHORT_WORDS = new Set(
  'am an as at be by do go he hi if in is it me my no of oh ok on or ox so to up us we ye yo'.split(
    ' ',
  ),
);

/**
 * TRUE if a first name of two letters ("Al", "Mo") calls on its holder: set off as a name is, at
 * the start of the line or between commas ("Al, take this", "Hey Mo: the door", "Thanks, Al.").
 * Run on its own it is not enough to be a name, being so short, so it must be set off.
 */
function callsOnShortName(lower: string, name: string): boolean {
  const word = name.split(/[^A-Za-z]+/)[0]?.toLowerCase() ?? '';
  if (word.length !== 2 || SHORT_WORDS.has(word)) {
    return false;
  }
  const setOff = '\\s*(?:[,:!?.]|$)';
  const atStart = new RegExp(
    `^\\W*(?:oh\\W+)?(?:${OPENERS}\\W+)?${word}${setOff}`,
  );
  const betweenCommas = new RegExp(`,\\s*${word}${setOff}`);
  return atStart.test(lower) || betweenCommas.test(lower);
}

/**
 * Works out who a line was said to.
 *
 * `others` are the names of everyone this NPC knows of besides those in view: people it has met,
 * and the other NPCs aboard. `nearest` says no other NPC that heard the line is nearer the speaker.
 */
export function saidTo(
  brain: NpcBrain,
  event: SenseEvent,
  others: string[],
  nearest: boolean,
): SaidTo {
  const said = String(event.details.message ?? '');
  const speaker = String(event.details.speaker ?? '');
  const distance =
    typeof event.details.distance === 'number' ? event.details.distance : 99;
  const known = new Set([
    ...brain.peopleInView.map((person) => person.name),
    ...brain.people.keys(),
    ...others,
  ]);
  const inView = new Set(brain.peopleInView.map((person) => person.name));

  // A whole name used to call on someone settles it, the longest first: "Josh Reed, come here"
  // is not said to Josh Kim (PARSE-14). A whole name used otherwise is someone spoken of, and is
  // cut out before the rest are tried: "Josh, have you seen Josh Reed?" calls on a Josh, not
  // Josh Reed, and "Have you seen Josh Reed?" calls on nobody.
  let heard = said.toLowerCase();
  const wholeNames = [...known, brain.name]
    .filter((name) => name !== speaker)
    .map((name) => ({ name, whole: fullName(name) }))
    .filter((one): one is { name: string; whole: string } => !!one.whole)
    .sort((a, b) => b.whole.length - a.whole.length);
  for (const { name, whole } of wholeNames) {
    const own = name === brain.name;
    // Set off on both sides, not merely followed by a comma: "I am here for Hop Kins, please"
    // speaks of Hop Kins.
    if (callsOnWord(heard, whole, own || inView.has(name), false)) {
      return own ? { to: 'me' } : { to: 'other', name };
    }
  }
  for (const { whole } of wholeNames) {
    heard = heard.replace(new RegExp(`\\b${whole}\\b`, 'g'), ' ');
  }

  // Its own name is held to the same test as anyone else's: called on, not merely in the line
  // (MEM-01). "There is a fire in the bar" is not said to Ben Fire, and "order a mop through
  // cargo" is not said to a cargo technician.
  const byName = calledBy(heard, brain.name, true);
  // Anyone may be called by their job, not only those at a post: "QM, order some paper",
  // "Janitor, clean the bar" (PARSE-16).
  const byJob = !byName && callsOnJob(heard, brain.job);
  const company = brain.peopleInView.filter(
    (person) => person.name !== brain.name && person.name !== speaker,
  );
  if (byName || byJob) {
    // A first name it shares with someone else there, and no surname, is put to both of them:
    // the nearest answers (PARSE-14). So is a job two there hold (PARSE-16).
    const shared = company.some((person) =>
      byJob
        ? person.job === brain.job
        : byName === 'first' &&
          firstWord(person.name) === firstWord(brain.name),
    );
    return { to: shared ? 'group' : 'me' };
  }
  for (const name of known) {
    if (
      name !== brain.name &&
      name !== speaker &&
      callsOn(heard, name, inView.has(name))
    ) {
      return { to: 'other', name };
    }
  }
  // Someone else there called by their job, as far as their ID shows it.
  const calledJob = company.find(
    (person) => !!person.job && callsOnJob(heard, person.job),
  );
  if (calledJob) {
    return { to: 'other', name: calledJob.name };
  }
  if (GROUP_WORDS.test(heard)) {
    return { to: 'group' };
  }
  // With no name used, who is there decides it.
  if (company.length === 0) {
    return { to: 'me' };
  }
  // The server says whether the speaker is turned this way. An older one says nothing of it.
  const facing = event.details.facing as boolean | number | undefined;
  const turnedAway = facing !== undefined && !facing;
  if (distance <= BESIDE && (!turnedAway || nearest)) {
    return { to: 'me' };
  }
  if (!!facing && distance <= FACING_RANGE && nearest) {
    return { to: 'me' };
  }
  const talk = brain.inTalkWith;
  if (
    talk &&
    talk.name === speaker &&
    Date.now() - talk.at < STILL_TALKING_MS
  ) {
    return { to: 'me' };
  }
  return { to: 'nobody' };
}
