/**
 * What the supply department's people, and the heads who order from it, have in common: who is
 * the Quartermaster and who is a technician, and the words an order is known by as it passes from
 * one of them to the next.
 *
 * An order goes from a head to the Quartermaster by PDA, from the Quartermaster to a technician
 * face to face, and word that it has come goes back the same way. Each of those lines is said or
 * written word for word, and read by code. They are kept here, in one place, so that whoever says
 * a line and whoever hears it cannot come to disagree about it.
 */
import type { NpcBrain } from '../types';

/** TRUE if this job title is the Quartermaster, who heads the supply staff. */
export function isQuartermaster(title: string): boolean {
  return /quartermaster/i.test(title);
}

/** TRUE if this job title is a cargo technician: one of the Quartermaster's staff, who work the counter and the bay. */
export function isTechnician(title: string): boolean {
  return /cargo/i.test(title) && !isQuartermaster(title);
}

/**
 * The Quartermaster aboard, as far as this NPC can tell: one in view, or one its PDA lists. Null
 * if there is none, or it is the Quartermaster itself.
 */
export function quartermasterAboard(
  brain: NpcBrain,
): { name: string; job: string } | null {
  if (isQuartermaster(brain.job)) {
    return null;
  }
  return (
    brain.peopleInView.find((person) => isQuartermaster(person.job)) ??
    brain.pdaPeople.find((person) => isQuartermaster(person.job)) ??
    null
  );
}

/** A kind of crate as it is spoken of when ordering: "janitorial supplies", "replacement lights". */
export function crateSpoken(crate: string): string {
  return crate
    .toLowerCase()
    .replace(/\bcrates?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** An order as it is said: "a crate of janitorial supplies and 2 crates of replacement lights". */
export function orderSpoken(items: { crate: string; count: number }[]): string {
  const parts = items.map(
    (item) =>
      `${item.count === 1 ? 'a crate' : `${item.count} crates`} of ${crateSpoken(item.crate)}`,
  );
  return parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** An order as it is written down: "2 Janitorial Supplies Crate, 1 Replacement Lights". */
export function orderWritten(
  items: { crate: string; count: number }[],
): string {
  return items.map((item) => `${item.count} ${item.crate}`).join(', ');
}

/** The plain words a head orders in, of the Quartermaster or of a technician, by which that line is known. */
export const ORDERING = 'I need to order';

/** How the Quartermaster's word back to a head begins, that their order is in its book, and under which number. */
export const NOTED = 'Noted, order';
export const NOTED_WORDS = /^noted, order (\d+)\b/i;

/** How the Quartermaster tells a head that the Captain has refused their order, or that it is not something cargo can get. */
export const REFUSED_WORDS = /\bcaptain has said no to order (\d+)\b/i;
export const CANNOT_ORDER = 'I cannot order that';
export const CANNOT_ORDER_WORDS = /^i cannot order that\b/i;

/**
 * The Quartermaster giving an order to a technician, to their face: "Sam, order 3: I need to
 * order 2 crates of janitorial supplies, for Hop Kins." The number is the order's in its book.
 */
export const GIVEN_WORDS =
  /\border (\d+): i need to order\b(.+?),? for ([^.]+)\./i;

/** The technician's word back that it has the order: "Order 3, right away." */
export const TAKEN = 'right away';
export const TAKEN_WORDS = /\border (\d+)\b[^.]*\bright away\b/i;

/** The technician telling the Quartermaster that an order has come in, with the number of each crate. */
export const DOCKED = 'has come in:';
export const DOCKED_WORDS = /\border (\d+) has come in: (.+)$/i;

/** The technician telling the Quartermaster that an order could not be placed. */
export const NOT_PLACED = 'did not go through';
export const NOT_PLACED_WORDS = /\border (\d+) did not go through\b/i;

/** What a head adds, ordering at the counter, when it sent its order to the Quartermaster and had no word back. */
export const QM_SILENT = 'The Quartermaster has not answered.';
export const QM_SILENT_WORDS = /\bquartermaster has not answered\b/i;

/** What a technician tells a head who tries to order from it while there is a Quartermaster to order from. */
export const THROUGH_QM = 'orders go through the Quartermaster';

/** The standing work a Quartermaster divides among its technicians, in the order it is dealt out. */
export const DUTIES = ['counter', 'shuttle', 'rooms'];

/**
 * How the standing work falls to a number of technicians, by name. One has all of it. Two have
 * the counter, and the shuttle and the rooms. Three have one each, and any more help with the
 * shuttle. The names are taken in order, so that the same people get the same work every time.
 */
export function dutiesFor(names: string[]): Record<string, string[]> {
  const sorted = [...new Set(names)].sort();
  const dealt: Record<string, string[]> = {};
  sorted.forEach((name, index) => {
    dealt[name] =
      sorted.length === 1
        ? [...DUTIES]
        : sorted.length === 2
          ? index === 0
            ? ['counter']
            : ['shuttle', 'rooms']
          : [DUTIES[index] ?? 'shuttle'];
  });
  return dealt;
}

/** The Quartermaster giving a technician its standing work, to its face: "Cora, the counter is yours this shift." */
export function dutyLine(name: string, duties: string[]): string {
  const parts = duties.map((duty) => `the ${duty}`);
  const said =
    parts.length < 2
      ? parts.join('')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${name.split(' ')[0]}, ${said} ${duties.length === 1 ? 'is' : 'are'} yours this shift.`;
}

/** Reads such a line back: whose first name it was said to, and the work it gave them. Null if these words are not that. */
export function dutiesIn(
  line: string,
): { first: string; duties: string[] } | null {
  const said = line
    .trim()
    .match(
      /^(\S+), (the (?:counter|shuttle|rooms)(?:(?:, | and )the (?:counter|shuttle|rooms))*) (?:is|are) yours this shift\b/i,
    );
  if (!said) {
    return null;
  }
  return {
    first: said[1],
    duties: DUTIES.filter((duty) => said[2].toLowerCase().includes(duty)),
  };
}

/** Manifest numbers as they are written down: "crate #12", "crates #12 and #13". */
export function cratesWritten(numbers: number[]): string {
  const written = numbers.map((number) => `#${number}`);
  return `crate${numbers.length === 1 ? '' : 's'} ${
    written.length < 2
      ? written.join('')
      : `${written.slice(0, -1).join(', ')} and ${written[written.length - 1]}`
  }`;
}

/**
 * The crates a line tells of: the manifest number of each, and what kind it is, if the line
 * says. Several kinds come as "crates #12 and #13 (Janitorial Supplies Crate); crate #14
 * (Replacement Lights)": each lot ends with what it is.
 */
export function cratesTold(text: string): { number: number; kind?: string }[] {
  return text.split(';').flatMap((part) => {
    const kind = part.match(/\(([^)]+)\)/)?.[1];
    return [...part.matchAll(/#(\d+)/g)].map((found) => ({
      number: Number(found[1]),
      kind,
    }));
  });
}

/** A technician telling the Quartermaster that crates someone ordered are still waiting to be collected. */
export const WAITING_TOLD = 'still waiting to be collected:';
export const WAITING_TOLD_WORDS =
  /\bstill waiting to be collected: (crates? #\d+(?:(?:, | and )#\d+)*) for ([^.]+)\./i;

/** A technician telling the Quartermaster that crates someone ordered have been lost, and why. */
export const LOST_TOLD_WORDS =
  /\b(crates? #\d+(?:(?:, | and )#\d+)*) for (.+?) (?:is|are) lost: ([^.]+)\./i;
