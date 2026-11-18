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
 * 1. It uses this NPC's name (or its job, if it serves at a post): it was said to this NPC.
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

/** The parts of a name that will do to name someone, in lower case. */
function nameParts(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2);
}

/** TRUE if any part of this name is used, as a word, in what was said. */
function usesName(heardLower: string, name: string): boolean {
  return nameParts(name).some((part) =>
    new RegExp(`\\b${part}\\b`).test(heardLower),
  );
}

/** Words a line may open with before the name of whoever it is for: "Hey Josh, ...". */
const OPENERS =
  '(?:hey|hi|hello|oi|yo|excuse me|sorry|ok|okay|right|so|and|but|please|thanks|thank you)';

/**
 * TRUE if what was said calls on this person by name. Much stricter than usesName, because being
 * wrong here means ignoring something that was meant for the NPC. Speaking of someone is not
 * speaking to them: "have you seen Billy?" does not call on Billy, and "there is a fire in the
 * bar" does not call on Zim Fire. It has to be their first name, used the way a name is when
 * calling on someone: at the start of what was said, or set off from the rest by a comma.
 */
function callsOn(heard: string, name: string): boolean {
  const first = name.split(/[^A-Za-z]+/).find((part) => part.length > 2);
  if (!first) {
    return false;
  }
  const lower = heard.toLowerCase();
  const word = first.toLowerCase();
  const atStart = new RegExp(`^\\W*(?:${OPENERS}\\W+)?${word}\\b`);
  const byComma = new RegExp(`(,\\s*${word}\\b)|(\\b${word}\\s*[,:])`);
  return atStart.test(lower) || byComma.test(lower);
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
  const heard = String(event.details.message ?? '');
  const lower = heard.toLowerCase();
  const speaker = String(event.details.speaker ?? '');
  const distance =
    typeof event.details.distance === 'number' ? event.details.distance : 99;

  if (
    usesName(lower, brain.name) ||
    (!!brain.post && usesName(lower, brain.job))
  ) {
    return { to: 'me' };
  }
  const known = new Set([
    ...brain.peopleInView.map((person) => person.name),
    ...brain.people.keys(),
    ...others,
  ]);
  for (const name of known) {
    if (name !== brain.name && name !== speaker && callsOn(heard, name)) {
      return { to: 'other', name };
    }
  }
  if (GROUP_WORDS.test(heard)) {
    return { to: 'group' };
  }
  // With no name used, who is there decides it.
  const company = brain.peopleInView.filter((person) => person.name !== speaker);
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
