/**
 * How an NPC feels about the people it has met.
 *
 * The LLM judges: it knows the NPC's personality, and it is the only thing that can tell how what
 * someone said would land with that personality. Players have no personality card to compare with,
 * so nothing here tries to work a clash out from two cards. The code keeps the score. It moves one
 * step at a time, not too often, between fixed limits, and is shown back to the LLM in every later
 * prompt, so a feeling lasts longer than the conversation that caused it.
 *
 * A feeling colours how the NPC talks. It gives the NPC no ability it did not have.
 */
import type { Feeling, NpcBrain } from './types';

/** How far a feeling can go in either direction. */
const SCORE_LIMIT = 3;
/** How long (deciseconds of server time) before an NPC's feeling about the same person can move again. */
const CHANGE_GAP_DS = 600;
/** The longest reason kept for a feeling, in characters. */
const WHY_MAX_LENGTH = 80;

/** What each score means, in the words the LLM is given. */
const FEELING_TEXT: Record<number, string> = {
  [-3]: 'you cannot stand them',
  [-2]: 'you dislike them',
  [-1]: 'they get on your nerves',
  1: 'you have taken to them',
  2: 'you like them',
  3: 'you count them a friend',
};

/**
 * Moves an NPC's feeling about someone one step warmer or cooler.
 * Returns the feeling as it now stands, or null if the change was not taken: the reply was
 * malformed, the feeling moved too recently, or it was already as strong as it gets.
 */
export function shiftFeeling(
  brain: NpcBrain,
  name: string,
  change: unknown,
  why: unknown,
): Feeling | null {
  if (change !== 'warmer' && change !== 'cooler') {
    return null;
  }
  const current = brain.feelings.get(name);
  if (current && brain.now - current.changedAt < CHANGE_GAP_DS) {
    return null;
  }
  const score = Math.max(
    -SCORE_LIMIT,
    Math.min(SCORE_LIMIT, (current?.score ?? 0) + (change === 'warmer' ? 1 : -1)),
  );
  if (score === (current?.score ?? 0)) {
    return null;
  }
  const feeling: Feeling = {
    score,
    why: typeof why === 'string' ? why.trim().slice(0, WHY_MAX_LENGTH) : '',
    changedAt: brain.now,
  };
  brain.feelings.set(name, feeling);
  return feeling;
}

/** Says how an NPC feels about someone, or '' if it feels nothing in particular. */
export function describeFeeling(brain: NpcBrain, name: string): string {
  const feeling = brain.feelings.get(name);
  return feeling ? (FEELING_TEXT[feeling.score] ?? '') : '';
}

/** Says how an NPC feels about someone and what last moved it, or '' if it feels nothing in particular. */
export function describeFeelingWithReason(
  brain: NpcBrain,
  name: string,
): string {
  const text = describeFeeling(brain, name);
  const why = brain.feelings.get(name)?.why;
  return text && why ? `${text} (${why})` : text;
}
