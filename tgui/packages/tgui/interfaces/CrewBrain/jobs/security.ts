/**
 * What the security staff have in common, and the words a warrant is known by as it passes round
 * the station.
 *
 * The Captain or a head of department declares a warrant to the Head of Security. The Head of
 * Security sends every other head a notice of who is wanted. Each head reads the list out at its
 * next staff meeting. Anyone who then sees one of them sends security where. The Head of Security
 * gives the warrant to its officer, who finds them, arrests them and puts them in a cell, and
 * says so. The Captain can pardon anyone.
 *
 * Every one of those lines is said or written word for word, and read by code: the names, the
 * reasons and the minutes are never the LLM's to pass on. They are kept here, in one place, so
 * that whoever says a line and whoever hears it cannot come to disagree about it.
 *
 * There are no laws yet. The reason on a warrant is whatever was said, carried as it was given.
 */
import type { SecurityOutcome, WantedEntry } from '../types';

/** The most characters a body can say at once, or send in one PDA message. Past that the end is cut off. */
const SAID_MAX = 200;
/** The longest name and the longest reason a warrant carries. Longer ones are cut, so that every line fits. */
const NAME_MAX = 32;
const REASON_MAX = 60;
/** How long in a cell a warrant earns when nothing was said about it, the most it can be, and what fighting back adds: all in minutes. */
export const MINUTES_USUAL = 5;
export const MINUTES_MOST = 15;
export const MINUTES_RESISTING = 5;

/** TRUE if this job title is the Head of Security, who heads the security staff. */
export function isHeadOfSecurity(title: string): boolean {
  return /head of security/i.test(title);
}

/** TRUE if this job title is a security officer: one of the Head of Security's staff, who makes the arrests. */
export function isOfficer(title: string): boolean {
  return /security officer/i.test(title);
}

/** TRUE if this job title is one of the security staff. */
export function isSecurity(title: string): boolean {
  return isHeadOfSecurity(title) || isOfficer(title);
}

export function firstName(name: string): string {
  return name.split(' ')[0];
}

/** How someone is spoken to by security: the Captain by rank, anyone else by first name. */
export function addressOf(name: string, job: string): string {
  return /captain/i.test(job) ? 'Captain' : firstName(name);
}

/** Writes a short list the way it is said: "a", "a and b", "a, b and c". */
function listed(parts: string[]): string {
  return parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The words of a name, in lower case. */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * TRUE if someone seen under one name is who a warrant under another names: every word of the
 * wanted name is in theirs. A warrant for "Pun Pun" names "Pun Pun III".
 */
export function sameName(wanted: string, seen: string): boolean {
  return wordsIn(nameWords(seen), nameWords(wanted));
}

/** TRUE if one run of words has another in it, whole and in order. */
function wordsIn(have: string[], need: string[]): boolean {
  if (need.length === 0) {
    return false;
  }
  for (let start = 0; start + need.length <= have.length; start++) {
    if (need.every((word, index) => have[start + index] === word)) {
      return true;
    }
  }
  return false;
}

/** The one of these names that these words use in full, if they use one. Longest first. */
export function nameIn(text: string, names: string[]): string | undefined {
  const have = nameWords(text);
  return [...names]
    .sort((a, b) => b.length - a.length)
    .find((name) => wordsIn(have, nameWords(name)));
}

/** A name as a warrant carries it: nothing in it that a line is cut up by. */
export function tidyName(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9 '-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

/** A reason as a warrant carries it: one clause, with nothing in it that a line is cut up by. */
export function tidyReason(raw: string): string {
  return raw
    .replace(/[.;:!?"]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .slice(0, REASON_MAX)
    .trim();
}

// ---- declaring a warrant

/** The words by which the Captain or a head declares a warrant: what follows them is who it is on. */
const WARRANT_WORDS =
  /\b(?:warrant\s+(?:out\s+)?(?:for|on)|arrest|bring\s+in|lock\s+up)\s+(.+)/is;
/** What follows those words when nobody was named. */
const NOT_A_NAME =
  /^(?:him|her|them|that|this|it|the|a|an|any|anyone|someone|somebody|people|everyone|nobody|me|you|us|warrants?)\b/i;
const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
];
const MINUTES_SAID = new RegExp(
  `\\b(\\d{1,2}|${NUMBER_WORDS.join('|')})\\s*min(?:ute)?s?\\b`,
  'i',
);

/**
 * Reads a warrant out of what was said or sent: who it is on, what for if that was said, and how
 * long in a cell if that was said. `known` is everyone the reader knows of by name, so that a
 * full name is taken whole and a first name alone finds its owner. Null if these words declare
 * no warrant.
 */
export function readWarrant(
  text: string,
  known: string[],
): { name: string; reason: string; minutes: number | null } | null {
  const found = text.match(WARRANT_WORDS);
  if (!found) {
    return null;
  }
  const rest = found[1].trim();
  if (NOT_A_NAME.test(rest)) {
    return null;
  }
  const said = rest.match(MINUTES_SAID)?.[1].toLowerCase();
  const number = said
    ? /^\d/.test(said)
      ? Number(said)
      : NUMBER_WORDS.indexOf(said) + 1
    : null;
  const minutes =
    number === null ? null : Math.min(MINUTES_MOST, Math.max(1, number));
  // Someone it knows of, named in full, is taken whole.
  const lower = rest.toLowerCase();
  let name = [...known]
    .sort((a, b) => b.length - a.length)
    .find((it) => lower.startsWith(it.toLowerCase()));
  let after: string;
  if (name) {
    after = rest.slice(name.length);
  } else {
    // Anyone else is named by the words up to where the reason or the time begins.
    const cut = rest.search(
      new RegExp(
        `[,.:;!?]|\\s+for\\s+|\\s+(?:\\d{1,2}|${NUMBER_WORDS.join('|')})\\s*min`,
        'i',
      ),
    );
    const raw = cut === -1 ? rest : rest.slice(0, cut);
    name = tidyName(raw.split(/\s+/).slice(0, 4).join(' '));
    after = cut === -1 ? '' : rest.slice(cut);
    // A first name alone is whoever it knows of by that first name, if there is only one.
    const owners = known.filter(
      (it) => firstName(it).toLowerCase() === (name ?? '').toLowerCase(),
    );
    if (owners.length === 1) {
      name = owners[0];
    }
  }
  if (!name || name.length < 2) {
    return null;
  }
  const why = after.match(/^[\s,:]*(?:for\s+)?(.*)/is)?.[1] ?? '';
  const reason = tidyReason(
    why
      .split(/[.!?]/)[0]
      .replace(
        new RegExp(
          `\\b(?:\\d{1,2}|${NUMBER_WORDS.join('|')})\\s*min(?:ute)?s?\\b.*$`,
          'i',
        ),
        '',
      ),
  );
  return { name: tidyName(name), reason, minutes };
}

/** A warrant as a head declares it by PDA: the same words the Captain would use. */
export function warrantLine(name: string, reason: string): string {
  return `Warrant for ${name}${reason ? `, for ${reason}` : ''}.`;
}

/** "Pun Pun, for wrecking the Custodial Closet", or the name alone. */
function onWhom(name: string, reason: string): string {
  return reason ? `${name}, for ${reason}` : name;
}

/** Security's word back to whoever declared a warrant, so that they see what was understood. */
export function takenLine(
  to: string,
  name: string,
  reason: string,
  minutes: number,
  unknown: boolean,
): string {
  return `${to}, I have that: a warrant for ${onWhom(name, reason)}. ${minutes} minutes.${unknown ? ' I do not know that name yet.' : ''}`;
}
export const TAKEN_WORDS = /\bI have that: a warrant for\b/i;

/** The Captain's copy of a warrant a head has declared. */
export function copyLine(by: string, name: string, reason: string): string {
  return `Captain, ${firstName(by)} has declared a warrant for ${onWhom(name, reason)}.`;
}

/** What security says to someone who cannot declare a warrant, or names someone it will not take one on. */
export const REFUSALS = {
  notDeclarer: (to: string) =>
    `${to}, a warrant is for the Captain or a head of department to declare. Take it to your head.`,
  onCaptain: (to: string) => `${to}, nobody declares a warrant on the Captain.`,
  onSecurity: (to: string) => `${to}, I take no warrant on my own staff.`,
  onHead: (to: string) =>
    `${to}, only the Captain can declare a warrant on a head of department.`,
  already: (to: string, name: string) =>
    `${to}, there is already a warrant on ${name}.`,
  toDesk: (to: string, desk: string) =>
    `${to}, warrants go to ${desk}, the Head of Security.`,
  notPardoner: (to: string) => `${to}, a pardon is the Captain's to give.`,
  notYours: (to: string) => `${to}, that warrant is not yours to take back.`,
};

// ---- the notice to the heads

const NOTICE_TAIL = 'If you or your staff see them, send me where, at once.';

/** The notice security sends each head of department: everyone wanted, in as many messages as it takes. */
export function noticeLines(entries: WantedEntry[]): string[] {
  if (entries.length === 0) {
    return ['Security notice. Nobody is wanted now.'];
  }
  const write = (items: string[], more: boolean) =>
    `Security notice${more ? ', continued' : ''}. Wanted: ${items.join('; ')}. ${NOTICE_TAIL}`;
  const lines: string[] = [];
  let batch: string[] = [];
  for (const entry of entries) {
    const item = onWhom(entry.name, entry.reason ?? '');
    if (
      batch.length > 0 &&
      write([...batch, item], lines.length > 0).length > SAID_MAX
    ) {
      lines.push(write(batch, lines.length > 0));
      batch = [];
    }
    batch.push(item);
  }
  lines.push(write(batch, lines.length > 0));
  return lines;
}

/**
 * Reads a notice from security: who is wanted, and whether it adds to the list it had or takes
 * its place. Null if these words are not one.
 */
export function readNotice(
  text: string,
): { entries: WantedEntry[]; more: boolean } | null {
  const line = text.trim();
  if (/^Security notice\. Nobody is wanted now\b/i.test(line)) {
    return { entries: [], more: false };
  }
  const found = line.match(
    /^Security notice(, continued)?\. Wanted: (.+?)\. If you or your staff see them\b/i,
  );
  if (!found) {
    return null;
  }
  const entries = found[2]
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cut = part.indexOf(', for ');
      return cut === -1
        ? { name: part }
        : { name: part.slice(0, cut), reason: part.slice(cut + 6) };
    });
  return { entries, more: !!found[1] };
}

/** A head's word back that it has the notice. Until this comes the notice has not reached it. */
export const NOTICE_ACK = 'Security notice received.';
export const NOTICE_ACK_WORDS = /\bsecurity notice received\b/i;

// ---- what a head reads out at its staff meeting

/** What a head says at its staff meeting: everyone security is looking for, in as many lines as it takes. */
export function meetingLines(names: string[]): string[] {
  if (names.length === 0) {
    return ['Security is looking for nobody now.'];
  }
  const write = (items: string[], more: boolean) =>
    `Security is ${more ? 'also ' : ''}looking for ${listed(items)}. If you see ${items.length === 1 ? 'them' : items.length === 2 ? 'either of them' : 'any of them'}, send security a PDA message saying where.`;
  const lines: string[] = [];
  let batch: string[] = [];
  for (const name of names) {
    if (
      batch.length > 0 &&
      write([...batch, name], lines.length > 0).length > SAID_MAX
    ) {
      lines.push(write(batch, lines.length > 0));
      batch = [];
    }
    batch.push(name);
  }
  lines.push(write(batch, lines.length > 0));
  return lines;
}

/** Reads what a head said of who security is looking for. Null if these words are not that. */
export function readMeetingLine(
  text: string,
): { names: string[]; more: boolean } | null {
  if (/\bSecurity is looking for nobody now\b/i.test(text)) {
    return { names: [], more: false };
  }
  const found = text.match(
    /\bSecurity is (also )?looking for (.+?)\. If you see\b/i,
  );
  if (!found) {
    return null;
  }
  return {
    names: found[2]
      .split(/, | and /)
      .map((name) => name.trim())
      .filter(Boolean),
    more: !!found[1],
  };
}
export const MEETING_LINE_WORDS = /\bSecurity is (?:also )?looking for\b/i;

// ---- a sighting

/** Word to security that someone wanted has been seen, and where. */
export function sightLine(name: string, place: string): string {
  return `Security: ${name} is in the ${place}.`;
}
/** The words that mark what someone says or sends as telling where a person is. */
export const SIGHTING_WORDS =
  /\b(?:is in|is at|are in|in the|at the|saw|seen|spotted|hiding)\b/i;

// ---- the Head of Security to its officer

/** TRUE if a line is said to this NPC by its first name: "Hale, ..." */
export function saidTo(name: string, line: string): boolean {
  return new RegExp(`^${firstName(name)}\\b`, 'i').test(line.trim());
}

/** The Head of Security giving its officer a warrant: "Hale, warrant: Pun Pun, for trespass. Bring them in, 5 minutes." */
export function giveLine(
  to: string,
  name: string,
  reason: string,
  minutes: number,
): string {
  return `${firstName(to)}, warrant: ${onWhom(name, reason)}. Bring them in, ${minutes} minutes.`;
}
export const GIVE_WORDS = /\bwarrant: (.+?)\. Bring them in, (\d+) minutes\b/i;

/** Reads a warrant as the Head of Security gives it. Null if these words are not one. */
export function readGiven(
  text: string,
): { name: string; reason: string; minutes: number } | null {
  const found = text.match(GIVE_WORDS);
  if (!found) {
    return null;
  }
  const cut = found[1].indexOf(', for ');
  return {
    name: cut === -1 ? found[1] : found[1].slice(0, cut),
    reason: cut === -1 ? '' : found[1].slice(cut + 6),
    minutes: Number(found[2]),
  };
}

/** The officer's word back that it has the warrant. */
export const WARRANT_ACK = 'The warrant, right away.';
export const WARRANT_ACK_WORDS = /\bthe warrant, right away\b/i;

/** The Head of Security passing on where someone wanted was last seen. */
export function seenLine(to: string, name: string, place: string): string {
  return `${firstName(to)}, ${name} was seen in the ${place}.`;
}
export const SEEN_WORDS = /^\S+, (.+?) was seen in the /i;

/** The Head of Security telling its officer to let someone go: a pardon, or a warrant taken back. */
export function letGoLine(to: string, name: string, pardoned: boolean): string {
  return `${firstName(to)}, ${name} is to be let go: ${pardoned ? 'the Captain has pardoned them' : 'the warrant is withdrawn'}.`;
}
export const LET_GO_WORDS = /^\S+, (.+?) is to be let go\b/i;

/** The Head of Security telling its officer, who broke off hurt, to make arrests again. */
export function againLine(to: string): string {
  return `${firstName(to)}, you are to make arrests again.`;
}
export const AGAIN_WORDS = /\bmake arrests again\b/i;

/** Word back that something told was heard. Until it comes, nothing has been passed on. */
export function heardLine(to: string): string {
  return `${firstName(to)}, I have that.`;
}
export const HEARD_WORDS = /\bI have that\b/i;

// ---- the officer to the Head of Security

/** How an officer tells the Head of Security how a warrant went. `to` is who is told, as they are spoken to. */
export function outcomeLine(to: string, outcome: SecurityOutcome): string {
  const { name } = outcome;
  switch (outcome.what) {
    case 'jailed':
      return `${to}, ${name} is in ${outcome.cell} for ${outcome.minutes} minutes${outcome.resisted ? `, ${MINUTES_RESISTING} of them for resisting arrest` : ''}.`;
    case 'lost':
      return `${to}, I lost ${name} in the ${outcome.place}.`;
    case 'hurt':
      return name
        ? `${to}, I could not take ${name}. I am hurt.`
        : `${to}, I am hurt and can make no arrests.`;
    case 'baton':
      return `${to}, ${name} has my baton.`;
    case 'attacked':
      return outcome.other
        ? `${to}, ${name} attacked me while I was arresting ${outcome.other}.`
        : `${to}, ${name} attacked me.`;
    case 'freed':
      return `${to}, ${name} is free.`;
    default:
      return `${to}, I cannot bring in ${name}: ${outcome.why}.`;
  }
}

/**
 * Reads how a warrant went, as an officer tells it. The room of a "lost" is left for the reader
 * to make out, since it knows the station's rooms. Null if these words are no such thing.
 */
export function readOutcome(text: string): SecurityOutcome | null {
  const line = text.trim();
  const jailed = line.match(
    /^\S+, (.+?) is in (.+?) for (\d+) minutes(, \d+ of them for resisting arrest)?/i,
  );
  if (jailed) {
    return {
      what: 'jailed',
      name: jailed[1],
      cell: jailed[2],
      minutes: Number(jailed[3]),
      resisted: !!jailed[4],
    };
  }
  const lost = line.match(/\bI lost (.+?) in the /i);
  if (lost) {
    return { what: 'lost', name: lost[1] };
  }
  const hurt = line.match(/\bI could not take (.+?)\. I am hurt\b/i);
  if (hurt) {
    return { what: 'hurt', name: hurt[1] };
  }
  if (/\bI am hurt and can make no arrests\b/i.test(line)) {
    return { what: 'hurt', name: '' };
  }
  const baton = line.match(/^\S+, (.+?) has my baton\b/i);
  if (baton) {
    return { what: 'baton', name: baton[1] };
  }
  const during = line.match(
    /^\S+, (.+?) attacked me while I was arresting (.+?)\./i,
  );
  if (during) {
    return { what: 'attacked', name: during[1], other: during[2] };
  }
  const attacked = line.match(/^\S+, (.+?) attacked me\./i);
  if (attacked) {
    return { what: 'attacked', name: attacked[1] };
  }
  const freed = line.match(/^\S+, (.+?) is free\./i);
  if (freed) {
    return { what: 'freed', name: freed[1] };
  }
  const cannot = line.match(/\bI cannot bring in (.+?): (.+?)\./i);
  if (cannot) {
    return { what: 'cannot', name: cannot[1], why: cannot[2] };
  }
  return null;
}

// ---- the arrest itself

/** What an officer says to someone it is arresting. A crew NPC that hears it stands still. */
export function arrestLine(name: string, reason: string): string {
  return `${name}, you are under arrest${reason ? `, for ${reason}` : ''}. Stand still.`;
}
export const ARREST_WORDS = /\byou are under arrest\b/i;

// ---- a pardon, and a warrant taken back

/** The words by which the Captain pardons someone, and a head takes back a warrant of its own. */
export const PARDON_WORDS = /\b(?:pardon|release|let go|set free|free)\b/i;
export const CANCEL_WORDS =
  /\b(?:cancel|withdraw|drop|call off|take back)\b.*\bwarrant\b/i;
/** The words by which the Captain has security make arrests again after its staff were hurt. */
export const TRY_AGAIN_WORDS = /\btry again\b/i;

/** Who a pardon names when they are nobody security has anything against: the words after "pardon". */
export function pardonNamed(text: string): string {
  return tidyName(
    text.match(
      /\b(?:[Pp]ardon|[Rr]elease|[Ss]et free|[Ff]ree)\s+((?:[A-Z][\w'-]*\s*){1,4})/,
    )?.[1] ?? '',
  );
}

export function pardonedLine(to: string, name: string): string {
  return `${to}, ${name} is pardoned.`;
}
export function nothingAgainstLine(to: string, name: string): string {
  return `${to}, there is nothing against ${name || 'them'}.`;
}
export function withdrawnLine(to: string, name: string): string {
  return `${to}, the warrant on ${name} is withdrawn.`;
}
/** What whoever declared a warrant is told when the Captain pardons the person it was on. */
export function pardonToldLine(to: string, name: string): string {
  return `${firstName(to)}, the Captain has pardoned ${name}.`;
}
/** What someone who has been pardoned is told, if they are there to be told. */
export function freeToGoLine(name: string): string {
  return `${name}, the Captain has pardoned you. You are free to go.`;
}

// ---- someone a body could not put out of its room

/** A body telling its head that someone would not be put out of its room. The head declares a warrant for trespass. */
export function couldNotLine(to: string, name: string, place: string): string {
  return `${firstName(to)}, I could not put ${name} out of the ${place}.`;
}
export const COULD_NOT_WORDS = /\bI could not put (.+?) out of the /i;
