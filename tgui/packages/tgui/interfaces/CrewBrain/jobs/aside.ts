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

/** The words that mark what someone says as asking a person to get out of the way. */
const ASIDE_WORDS =
  /\bstep aside\b|\b(stand|move|shift) aside\b|\bout of (the|my) way\b|\bmake way\b|\blet me (past|through|by)\b|\b(could|can|would|will) you (please )?move\b|\bplease move\b|\bmove over\b|\bmove,? please\b|\bget (this |it )?past you\b/;
/** How long (milliseconds) being asked to step aside stands. After that the moment has passed. */
const ASIDE_STANDS_MS = 20000;
/** Names the step of getting out of the way. */
export const ASIDE_STEP_KEY = 'stepping-aside';
/** How long (milliseconds) it stays where it stepped to, so that it does not walk straight back into the way. */
export const ASIDE_HOLD_MS = 15000;

/** Notes that someone has asked the NPC, by name or to its face, to get out of the way. */
export function asideOverhears(brain: NpcBrain, event: SenseEvent): void {
  const speaker = String(event.details.speaker ?? '');
  const heard = String(event.details.message ?? '').toLowerCase();
  if (!speaker || speaker === brain.name || !ASIDE_WORDS.test(heard)) {
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
    key: ASIDE_STEP_KEY,
    text: `${asked.by} has asked you to step aside: you are in their way. You are stepping clear of them, and will get on with your own work once they are past.`,
    act: { tool: 'step_aside', person: asked.handle },
  };
}

/** What the LLM should know about having been asked to move, so that what it says matches what the body does. */
export function asideCues(brain: NpcBrain): string[] {
  const asked = brain.asideAsked;
  return asked && Date.now() - asked.at < ASIDE_STANDS_MS + ASIDE_HOLD_MS
    ? [
        `${asked.by} asked you to step aside, and your body ${asked.done ? 'has stepped' : 'is stepping'} out of their way. You do not argue it or explain what you were doing: at most you say sorry.`,
      ]
    : [];
}
