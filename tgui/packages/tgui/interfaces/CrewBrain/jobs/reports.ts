/**
 * Reports of work done: what an NPC tells its head at a staff meeting, and what the head makes of
 * what it is told.
 *
 * The numbers are the server's. It counts each mess a body cleans up and each thing it puts away,
 * and a report says how much of each has been done since the last one. No LLM is asked for a
 * number, or to pass one on: a small model gets them wrong, and the head adds them up.
 *
 * So that a report still sounds like the person giving it, the sentence that carries the numbers is
 * written here, word for word, in one of a few wordings, and the LLM is asked only for a short
 * remark of its own to go after it. A remark with a number in it, or a question, or one that runs
 * long, is left off, and the sentence is said by itself. Either way what is said is true.
 *
 * Both ends are here: the words a report is given in, and how those words are read back. Change
 * one and the other has to change with it.
 */
import type { NpcBrain } from '../types';

/** One kind of work that is counted, and the words for it. */
type Tally = {
  /** The name the server counts it under. */
  key: string;
  /** What one of them is called, and what several are. */
  one: string;
  many: string;
  /** What was done to them. */
  did: string;
};

/** Every kind of work that is counted, in the order a report gives them. */
const TALLIES: Tally[] = [
  { key: 'put_away', one: 'item', many: 'items', did: 'cleaned up' },
  { key: 'cleaned', one: 'spot', many: 'spots', did: 'scrubbed' },
  // What cargo staff count: crates hauled in off the supply shuttle, and crates sent out, to
  // whoever came for one or back aboard the shuttle.
  { key: 'crates_in', one: 'crate', many: 'crates', did: 'brought in' },
  { key: 'crates_out', one: 'crate', many: 'crates', did: 'sent out' },
];

/** How many ways there are of wording the work done. Each NPC keeps to one for the length of a meeting. */
export const WORDINGS = 3;
/** The most characters the server lets a body say at once. A remark that would run past it is left off. */
const SAY_MAX = 200;
/** The most words a remark runs to. */
const REMARK_MAX_WORDS = 16;
/** Words for an amount. A remark with one in it could contradict the numbers it follows. */
const AMOUNT_WORDS =
  /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|dozens?|couple|several|half|twice|double|triple)\b/i;
/** Words a head listens for. A remark with one in it could be taken for a report, a need, or the end of the meeting. */
const TAKEN_WORDS = /\bneed|\breport\b|\bmeeting\b|\border/i;
/** A line that is only the model's way of saying it has nothing to add. */
const NOTHING_SAID =
  /^[\W_]*(nothing|none|null|n\/a|no (remark|comment)|silence|\(.*\)|\*.*\*)?[\W_]*$/i;

/** Writes a short list the way it is said: "a", "a and b", "a, b and c". */
export function listed(parts: string[]): string {
  return parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Begins a sentence with a capital. */
export function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * How much of each kind of work an NPC has done since it last reported. Kinds it has done none of
 * are left out. `only` is the kinds its job reports, if it does not report them all.
 */
export function workSince(
  brain: NpcBrain,
  only?: string[],
): Record<string, number> {
  const since: Record<string, number> = {};
  for (const { key } of TALLIES) {
    if (only && !only.includes(key)) {
      continue;
    }
    const done = (brain.workDone[key] ?? 0) - (brain.workReported[key] ?? 0);
    if (done > 0) {
      since[key] = done;
    }
  }
  return since;
}

/** One kind of work and how much of it, as "14 items" or "1 spot". */
function amount(tally: Tally, count: number): string {
  return `${count} ${count === 1 ? tally.one : tally.many}`;
}

/** The kinds of work there is any of in these counts, with how much. */
function counted(counts: Record<string, number>): [Tally, number][] {
  return TALLIES.filter((tally) => (counts[tally.key] ?? 0) > 0).map(
    (tally) => [tally, counts[tally.key]],
  );
}

/** Work done as a total, with no "I": "31 items cleaned up and 22 spots scrubbed". '' if there is none. */
export function totalWords(counts: Record<string, number>): string {
  return listed(
    counted(counts).map(
      ([tally, count]) => `${amount(tally, count)} ${tally.did}`,
    ),
  );
}

/**
 * The work one NPC has done, as it says it, without a capital or a full stop: "I have cleaned up
 * 14 items and scrubbed 9 spots". The wording is one of a few, so that three janitors in a row do
 * not recite the same sentence.
 */
export function workWords(
  counts: Record<string, number>,
  wording: number,
): string {
  const done = counted(counts);
  if (done.length === 0) {
    return [
      'I have nothing to show yet',
      'nothing done yet to speak of',
      'I have no work to speak of yet',
    ][wording % WORDINGS];
  }
  const total = totalWords(counts);
  switch (wording % WORDINGS) {
    case 0:
      return `I have ${listed(done.map(([tally, count]) => `${tally.did} ${amount(tally, count)}`))}`;
    case 1:
      return `that is ${total}`;
    default:
      return `${total} since last time`;
  }
}

/** What an NPC is short of for its work, as it says it. Said every time, so that a head hears a plain yes or no. */
export function needWords(need: string | null): string {
  return need ? `I need ${need}.` : 'I need nothing.';
}

/** The whole of a report, as two sentences: the work done, and what is needed. */
export function reportWords(
  brain: NpcBrain,
  need: string | null,
  wording: number,
  only?: string[],
): string {
  return `${capital(workWords(workSince(brain, only), wording))}. ${needWords(need)}`;
}

/**
 * Reads a report back: how much work of each kind it tells of, and whether whoever gave it is short
 * of something. Null if these words are not a report at all.
 */
export function readReport(
  text: string,
): { counts: Record<string, number>; need: boolean } | null {
  const told = /\bI need\b/i.test(text);
  const counts: Record<string, number> = {};
  for (const tally of TALLIES) {
    // The number always comes straight before what it counts, and what was done to them comes
    // straight before or after the two: "scrubbed 9 spots", "9 spots scrubbed". Two kinds of work
    // may count the same thing, crates brought in and crates sent out, so it takes all three.
    const what = `(\\d+)\\s+(?:${tally.many}|${tally.one})`;
    const found = text.match(
      new RegExp(`\\b(?:${tally.did}\\s+${what}|${what}\\s+${tally.did})\\b`, 'i'),
    );
    if (found) {
      counts[tally.key] = Number(found[1] ?? found[2]);
    }
  }
  if (!told && Object.keys(counts).length === 0) {
    return null;
  }
  return { counts, need: told && !/\bI need nothing\b/i.test(text) };
}

/** Notes that an NPC has given this report: what it told of is not told of again next time. */
export function noteReported(brain: NpcBrain, line: string): void {
  const counts = readReport(line)?.counts ?? {};
  for (const [key, count] of Object.entries(counts)) {
    brain.workReported[key] = (brain.workReported[key] ?? 0) + count;
  }
}

/** Adds one lot of counts into another. */
export function addCounts(
  into: Record<string, number>,
  counts: Record<string, number>,
): void {
  for (const [key, count] of Object.entries(counts)) {
    into[key] = (into[key] ?? 0) + count;
  }
}

/**
 * Puts the LLM's remark after a line that is said word for word. The remark is left off if it has
 * a number or an amount in it, asks a question, uses a word the listener acts on, runs long, or
 * would take the whole past what a body can say at once.
 */
export function withRemark(line: string, said: unknown): string {
  let remark = typeof said === 'string' ? said.trim().replace(/\s+/g, ' ') : '';
  // The model sometimes gives the line back with its remark on the end. The line is said already.
  if (remark.toLowerCase().startsWith(line.toLowerCase())) {
    remark = remark.slice(line.length).trim();
  }
  if (
    NOTHING_SAID.test(remark) ||
    /\d/.test(remark) ||
    AMOUNT_WORDS.test(remark) ||
    TAKEN_WORDS.test(remark) ||
    remark.includes('?') ||
    remark.split(' ').length > REMARK_MAX_WORDS ||
    line.length + 1 + remark.length > SAY_MAX
  ) {
    return line;
  }
  return `${line} ${capital(remark)}${/[.!]$/.test(remark) ? '' : '.'}`;
}
