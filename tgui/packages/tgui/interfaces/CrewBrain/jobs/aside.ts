/**
 * Getting out of someone's way.
 *
 * This is not any one job's work. Anyone can be standing where someone else needs to get past: a
 * janitor scrubbing the floor of the bay while crates are hauled through it, a technician in a
 * doorway. A body steps past people, but what it hauls does not, so whoever is hauling asks, by
 * name, and whoever is asked moves. That is all there is to it, and none of it is a judgement: the
 * asking is a plain line, and the moving is done by code the moment the line is heard.
 *
 * It works the same when a person who is not an NPC does the asking.
 */
import type { Action, NpcBrain, SenseEvent } from '../types';
import { namesPerson } from './guarding';

/** The words that mark what someone says as asking a person to get out of the way, wherever they stand in the line. */
const ASIDE_WORDS =
  /\bstep aside\b|\b(stand|move|shift) aside\b|\bmake way\b|\blet me (past|through|thru|by|pass)\b|\b(please|pls|plz) move\b|\bmove,? (please|pls|plz)\b|\b(move|scoot) over\b|\bbudge up\b|\bget (this |it )?past you\b|\b(you are|you're|youre|ur) in (the|my) way\b|\bcoming (through|thru)\b|\b(move|get) out of the (doorway|door)\b/;
/** "Could you move", "can u move": but not "can you move the crate to the bay", which is about a thing. */
const YOU_MOVE =
  /\b(could|can|would|will) (you|u) (please |pls |plz )?move\b(?!\s+(the|that|this|it\s+to|those|these|a|an|my|your|them)\b)/;
/** "Out of the way", said to the one hearing it: "get out of the way", "I need you out of the way". */
const OUT_OF_WAY = /\b(out of|outta) (the|my) way\b/;
/** But not of a thing: "I moved the bucket out of the way", "put it out of the way". */
const THING_OUT_OF_WAY =
  /\b(the|that|this|it|my|those|these|a|an|them)\s+(?!hell\b)(\w+\s+)?(out of|outta) (the|my) way\b/;
/** Words that ask only when they are the whole line, give or take a name, "please" and the like: "move", "excuse me". */
const WHOLE_LINE =
  /^(move|move it|excuse me|step back|scoot|(get |move )?(out of|outta) the way)$/;
/** Words left out of a line before it is held up to WHOLE_LINE. */
const FILLER = new Set(['please', 'pls', 'plz', 'hey', 'oi', 'sorry', 'sir']);

/** TRUE if a line, lower-cased, asks whoever hears it to get out of the way. `name` is the hearer's. */
export function asksAside(heard: string, name: string): boolean {
  if (
    ASIDE_WORDS.test(heard) ||
    YOU_MOVE.test(heard) ||
    (OUT_OF_WAY.test(heard) && !THING_OUT_OF_WAY.test(heard))
  ) {
    return true;
  }
  const names = name.toLowerCase().split(/\s+/);
  const bare = heard
    .replace(/[^a-z' ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !names.includes(word) && !FILLER.has(word))
    .join(' ');
  return WHOLE_LINE.test(bare);
}
/** How long (milliseconds) being asked to step aside stands. After that the moment has passed. */
const ASIDE_STANDS_MS = 20000;
/**
 * Names the step of getting out of the way. Each asking adds its own time to it, so that a step
 * aside that found nowhere to go holds back only the asking it answered, not the next one.
 */
export const ASIDE_STEP_KEY = 'stepping-aside';
/** How long (milliseconds) it stays where it stepped to, so that it does not walk straight back into the way. */
export const ASIDE_HOLD_MS = 15000;

/** Notes that someone has asked the NPC, by name or to its face, to get out of the way. */
export function asideOverhears(brain: NpcBrain, event: SenseEvent): void {
  const speaker = String(event.details.speaker ?? '');
  const heard = String(event.details.message ?? '').toLowerCase();
  if (!speaker || speaker === brain.name || !asksAside(heard, brain.name)) {
    return;
  }
  if (event.details.said_to !== 'me' && !namesPerson(heard, brain.name)) {
    return;
  }
  // Whoever asked has to be someone it can see: it steps away from them, and from what they haul.
  const handle =
    typeof event.details.handle === 'string'
      ? event.details.handle
      : brain.handles[speaker];
  if (!handle) {
    return;
  }
  brain.asideAsked = { by: speaker, handle, at: Date.now(), done: false };
}

/**
 * What having been asked to step aside comes down to right now: stepping clear, once. Null if
 * nobody has asked, it has already moved, or the moment has passed.
 */
export function asideStep(
  brain: NpcBrain,
): { key: string; text: string; act: Action } | null {
  const asked = brain.asideAsked;
  if (!asked || asked.done) {
    return null;
  }
  if (Date.now() - asked.at > ASIDE_STANDS_MS) {
    brain.asideAsked = null;
    return null;
  }
  return {
    key: `${ASIDE_STEP_KEY}:${asked.at}`,
    text: `${asked.by} has asked you to step aside: you are in their way. You are stepping clear of them, and will get on with your own work once they are past.`,
    act: { tool: 'step_aside', person: asked.handle },
  };
}

/** Who asked it to step aside, while that asking still stands (the step and the hold after it), or null. */
export function asideStands(brain: NpcBrain): string | null {
  const asked = brain.asideAsked;
  return asked && Date.now() - asked.at < ASIDE_STANDS_MS + ASIDE_HOLD_MS
    ? asked.by
    : null;
}

/** What the server calls a step aside while it is being made (describe_doing in crew_npc_hands.dm). */
const STEPPING_ASIDE = /out of someone's way/;

/**
 * What it was doing, put for the LLM while an asking to step aside stands. The body has set that
 * down and is moving out of the way (PLAY-11), so "You are in the middle of cleaning" would pull
 * the voice the other way. Null when what it is doing is the step aside itself, which the aside
 * line already says.
 */
export function asideDoing(by: string, doing: string): string | null {
  return STEPPING_ASIDE.test(doing)
    ? null
    : `You have broken off ${doing} for now to let ${by} past. You go back to it once they are past.`;
}

/**
 * What the LLM should know about having been asked to move, so that what it says matches what the
 * body does. The code moves the body the moment the asking is heard, often before the LLM's answer
 * is back, so the line puts it as settled, not as something to be argued (PLAY-11).
 */
export function asideCues(brain: NpcBrain): string[] {
  const by = asideStands(brain);
  if (!by) {
    return [];
  }
  return [
    `${by} asked you to step aside, and you ${brain.asideAsked?.done ? 'have stepped' : 'are moving'} out of their way now. That is already done: you do not say you will wait, finish first or cannot. You do not argue it or explain what you were doing: at most you say sorry.`,
  ];
}
