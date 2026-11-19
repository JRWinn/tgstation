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
  const have = nameWords(seen);
  if (wordsIn(have, nameWords(wanted))) {
    return true;
  }
  // Written as one word: a warrant for "punpun" names "Pun Pun".
  const run = squash(wanted);
  if (run.length < 4) {
    return false;
  }
  for (let start = 0; start < have.length; start++) {
    let joined = '';
    for (let end = start; end < have.length; end++) {
      joined += have[end];
      if (joined === run) {
        return true;
      }
    }
  }
  return false;
}

/** A name or a word with nothing left in it but its letters and figures, in lower case. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** How many letters have to be put in, taken out, changed or swapped with a neighbour to turn one word into another. */
export function lettersApart(one: string, other: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= one.length; i++) {
    rows.push([i]);
    for (let j = 1; j <= other.length; j++) {
      if (i === 0) {
        rows[0].push(j);
        continue;
      }
      const same = one[i - 1] === other[j - 1];
      let least = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (same ? 0 : 1),
      );
      if (
        i > 1 &&
        j > 1 &&
        one[i - 1] === other[j - 2] &&
        one[i - 2] === other[j - 1]
      ) {
        least = Math.min(least, rows[i - 2][j - 2] + 1);
      }
      rows[i].push(least);
    }
  }
  return rows[one.length][other.length];
}

/** How many letters out a word of this length may be and still be taken for the word that was meant. */
function slack(length: number): number {
  return length >= 8 ? 2 : length >= 5 ? 1 : 0;
}

/**
 * Whoever of these a misspelt name means: "Marisol Buris" is Marisol Burris, "punpun" is Pun Pun,
 * "marisol" is whoever alone has that first name. Undefined if nobody is near enough, or two are
 * equally near.
 */
export function closeName(raw: string, known: string[]): string | undefined {
  const want = squash(raw);
  if (want.length < 3) {
    return undefined;
  }
  const near = known
    .map((name) => ({
      name,
      apart: Math.min(
        lettersApart(want, squash(name)),
        // A first name of three letters ("Bob") is taken only when spelt right: its slack is 0.
        want.length >= 3 ? lettersApart(want, squash(firstName(name))) : 99,
      ),
    }))
    .filter((it) => it.apart <= slack(want.length))
    .sort((a, b) => a.apart - b.apart);
  if (near.length === 0 || (near.length > 1 && near[0].apart === near[1].apart)) {
    return undefined;
  }
  return near[0].name;
}

/** The words an order to security turns on. A word a letter or two off one of them is taken for it. */
const KEY_WORDS = [
  'warrant',
  'arrest',
  'pardon',
  'release',
  'wanted',
  'minutes',
  'cancel',
  'withdraw',
  'detain',
  'apprehend',
];

/**
 * Puts right the spelling of the words an order turns on: "warrent", "arest", "pardn". A word
 * that is part of someone's name is left as it is, whatever it looks like.
 */
export function mendWords(text: string, known: string[] = []): string {
  const inNames = new Set(known.flatMap((name) => nameWords(name)));
  return text.replace(/[A-Za-z]{4,}/g, (word) => {
    const lower = word.toLowerCase();
    if (KEY_WORDS.includes(lower) || inNames.has(lower)) {
      return word;
    }
    const meant = KEY_WORDS.find(
      (key) =>
        key[0] === lower[0] &&
        Math.abs(key.length - lower.length) <= 1 &&
        lettersApart(lower, key) <= slack(key.length),
    );
    return meant ?? word;
  });
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

/**
 * The one of these names that these words come near, misspelt or run together: "pardon punpun",
 * "let marisol buris go". Up to three words together are tried, the most first. Undefined if they
 * come near none.
 */
export function closeIn(text: string, names: string[]): string | undefined {
  const words = nameWords(text);
  for (let size = Math.min(3, words.length); size > 0; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      const meant = closeName(words.slice(start, start + size).join(' '), names);
      if (meant) {
        return meant;
      }
    }
  }
  return undefined;
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
  /\b(?:warrant\s+(?:out\s+)?(?:for|on)|apb\s+(?:out\s+)?(?:on|for)|wanted:|arrest|bring\s+in|lock\s+up|jail|detain|apprehend|capture)\s+(.+)/is;
/** With the name in the middle: "lock Pun Pun up for 10 minutes", "throw Dana Reyes in the brig". */
const LOCK_AROUND =
  /\b(?:lock|throw|put|toss|stick|chuck)\s+(.+?)\s+(?:up\b|in(?:to|side)?\s+(?:the\s+|a\s+)?(?:brig|cells?|jail|lock-?up)\b)(.*)$/is;
/** What follows a name when it says what is to be done with them, and gives no reason: "lock him up", "and put them in a cell". */
const SENTENCE_WORDS =
  /^(?:and\s+|then\s+)?(?:lock|keep|hold|jail|detain|put|throw|leave|brig|arrest|cuff)\s+(?:him|her|them|it)\b/i;
/** Words that say how soon or how politely, and are no part of anyone's name. */
const FILLER =
  /\b(?:right\s+now|right\s+away|at\s+once|on\s+site|on\s+sight|on\s+the\s+spot|thank\s+you|now|please|pls|plz|pl0x|thx|immediately|asap|quickly|thanks|today)\b/gi;
/** The other way round: "Pun Pun is wanted", "Joan, Dana Reyes is wanted for theft". Who it is on comes first. */
const WANTED_AFTER =
  /^(?:[A-Za-z'-]+,\s*)?(.+?)\s+(?:is|are)\s+wanted\b[\s,]*(.*)$/is;
/** What follows those words when nobody was named. */
const NOT_A_NAME =
  /^(?:him|her|them|that|this|it|the|a|an|any|anyone|someone|somebody|people|everyone|nobody|no|who|what|which|me|you|us|warrants?|is|are|was|were|went|has|have|had|will|would|should|can|could|did|do|does|to|in|on|at|of|and|or|but|for|with|my|your|his|their|our|not|up|down|out|some|more|all|when|if|before|after|while|until|then)\b/i;
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

/** A word that turns an order round: "do not arrest", "don't release", "no warrant for", "never". */
const NEGATION = /\b(?:not|dont|never|no)\b|n't\b|\bhold\s+off\b/i;
/** How a question begins: "Is there a warrant", "Why did you arrest", "Did your officer arrest". */
const ASKING =
  /^(?:is|are|was|were|did|does|has|have|had|why|who|when|where|how)\b/i;
/** How an order is put politely as a question: "Could you arrest Pun Pun, please?" That is still an order. */
const POLITE = /^(?:please\s+)?(?:can|could|would|will)\s+you\b/i;

/**
 * TRUE if the order words that begin at `at` in these words are not an order: a negation stands
 * in the last few words before them in the same clause ("Joan, do not arrest Dana Reyes"), or
 * the sentence they are in asks a question ("Is there a warrant for Dana Reyes?", "Why did you
 * arrest Pun Pun?"). A polite "Could you arrest Pun Pun?" is an order. Only the clause they are
 * in counts, so "Don't wait, arrest Pun Pun now" and "Don't worry, release Pun Pun" are orders.
 */
export function heldBack(text: string, at: number): boolean {
  const before = text.slice(0, at);
  const clause = before.slice(
    Math.max(
      ...[',', '.', ';', ':', '!', '?'].map((mark) => before.lastIndexOf(mark)),
    ) + 1,
  );
  if (NEGATION.test(clause.trim().split(/\s+/).slice(-3).join(' '))) {
    return true;
  }
  const start =
    Math.max(...['.', '!', '?'].map((mark) => before.lastIndexOf(mark))) + 1;
  const stop = text.slice(at).search(/[.!?]/);
  const sentence = text
    .slice(start, stop === -1 ? text.length : at + stop + 1)
    .trim()
    // Whoever it is said to, by name first: "Joan, is there a warrant ..."
    .replace(/^[A-Za-z'-]+,\s*/, '');
  if (POLITE.test(sentence)) {
    return false;
  }
  return sentence.endsWith('?') || ASKING.test(sentence);
}

/**
 * Reads a warrant out of what was said or sent: who it is on, what for if that was said, and how
 * long in a cell if that was said. `known` is everyone the reader knows of by name, so that a
 * full name is taken whole and a first name alone finds its owner. Null if these words declare
 * no warrant, and null if they say not to arrest someone or ask about a warrant: those are left
 * to the LLM reader.
 */
export function readWarrant(
  written: string,
  known: string[],
): { name: string; reason: string; minutes: number | null } | null {
  const text = mendWords(written, known);
  const found = text.match(WARRANT_WORDS);
  const around = found ? null : text.match(LOCK_AROUND);
  const turned = found || around ? null : text.trim().match(WANTED_AFTER);
  if (!found && !around && !turned) {
    return null;
  }
  // "Do not arrest Pun Pun", "Is there a warrant for Dana Reyes?": no warrant.
  if (heldBack(text, found?.index ?? around?.index ?? text.search(/\S/))) {
    return null;
  }
  // "Pun Pun is wanted for theft" is read as "Pun Pun, for theft", and "lock Pun Pun up for 10
  // minutes" as "Pun Pun for 10 minutes".
  const rest = (
    found
      ? found[1]
      : around
        ? `${around[1]}${around[2]}`
        : `${turned?.[1] ?? ''}${turned?.[2] ? `, ${turned[2]}` : ''}`
  )
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
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
    // Anyone else is named by the words up to where the reason or the time begins, or a word
    // that is no part of a name: "Pun Pun in the bar", "Pun Pun who wrecked it", "Pun Pun - theft".
    const cut = rest.search(
      new RegExp(
        `[,.:;!?]|\\s+for\\s+|\\s+(?:and|then|but)\\s+|\\s+(?:\\d{1,2}|${NUMBER_WORDS.join('|')})\\s*min|\\s+(?:who|which|that|whom|he|she|they|it|in|at|on|by|near|inside|is|was|are|has|had|because|since|as|after|before|again)\\b|\\s+[-–](?:\\s|$)`,
        'i',
      ),
    );
    const raw = cut === -1 ? rest : rest.slice(0, cut);
    const every = raw.split(/\s+/);
    const words = every.slice(0, 4);
    name = tidyName(words.join(' '));
    after = cut === -1 ? '' : rest.slice(cut);
    // A first name alone is whoever it knows of by that first name, if there is only one.
    const owners = known.filter(
      (it) => firstName(it).toLowerCase() === (name ?? '').toLowerCase(),
    );
    if (owners.length === 1) {
      name = owners[0];
    } else {
      // Someone it knows of, misspelt, or run together, or with more said after the name: the
      // most words that come near a name it knows are that name.
      for (let count = words.length; count > 0; count--) {
        const meant = closeName(words.slice(0, count).join(' '), known);
        if (meant) {
          name = meant;
          after = `${every.slice(count).join(' ')}${after}`;
          break;
        }
      }
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
  )
    // What is left of "for 15 minutes" once the time is taken out of it.
    .replace(/(?:^|\s+)(?:for|for about|about)$/i, '');
  // "Lock him up for 15 minutes" after a name says what to do with them, not what they did.
  return {
    name: tidyName(name),
    reason: SENTENCE_WORDS.test(reason) ? '' : reason,
    minutes,
  };
}

/**
 * Reads how long someone is to be held out of words that name nobody: "Keep him in jail for 30
 * minutes", sent after the warrant. `asked` is what was said, `minutes` what a cell's timer
 * allows of it. Null if these words give no time, or do not speak of anyone.
 */
export function readTerm(
  written: string,
): { minutes: number; asked: number } | null {
  const text = mendWords(written);
  if (!/\b(?:him|her|them|it|that\s+one)\b/i.test(text)) {
    return null;
  }
  const said = text.match(MINUTES_SAID)?.[1].toLowerCase();
  if (!said) {
    return null;
  }
  const asked = /^\d/.test(said) ? Number(said) : NUMBER_WORDS.indexOf(said) + 1;
  return { minutes: Math.min(MINUTES_MOST, Math.max(1, asked)), asked };
}

/** Security's word back when the time on a warrant is changed. It says so when a cell's timer allows less than was asked. */
export function termLine(
  to: string,
  name: string,
  minutes: number,
  asked: number,
): string {
  return `${to}, I have that: ${name}, ${minutes} minutes.${asked > minutes ? ` ${MINUTES_MOST} is the most a cell's timer allows.` : ''}`;
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
  whichOne: (to: string, names: string[]) =>
    `${to}, there are ${names.length === 2 ? 'two' : 'several'} by that name: ${listed(names.slice(0, 4))}. Which one?`,
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

/** Who word of a sighting is about, when they are nobody on the list: the words before "is in". '' if it cannot tell. */
export function sightedName(text: string): string {
  const found = text
    .trim()
    .match(
      /^(?:security:\s*)?(?:[A-Za-z'-]+,\s*)?(.+?)\s+(?:is|was|are|has been)\s+(?:in|at|by|near|outside)\b/i,
    );
  return found ? tidyName(found[1].split(/\s+/).slice(-4).join(' ')) : '';
}

/** Security's answer to word of where someone is who is not wanted: there is nothing it can do with it. */
export function noWarrantLine(to: string, name: string): string {
  return `${to}, there is no warrant on ${name}. To declare one, say: Warrant for ${name}.`;
}

/** Security's answer to the Captain or a head whose message it could make nothing of. Nobody is left guessing at the words. */
export function notFollowedLine(to: string): string {
  return `${to}, I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name. To take one back: Cancel the warrant on a name.`;
}

/** How a report begins that is sent by PDA by someone whose own work keeps them from a staff meeting. */
export const KEPT_AWAY = 'I cannot come to the meeting';

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
  byCaptain = false,
): string {
  return `${firstName(to)}, warrant: ${onWhom(name, reason)}. Bring them in, ${minutes} minutes.${byCaptain ? ` ${BY_CAPTAIN}` : ''}`;
}
export const GIVE_WORDS = /\bwarrant: (.+?)\. Bring them in, (\d+) minutes\b/i;
/** Said after a warrant given that the Captain declared. Only such a warrant is served on a head of staff. */
const BY_CAPTAIN = 'The Captain declared it.';
const BY_CAPTAIN_WORDS =
  /\bBring them in, \d+ minutes\. The Captain declared it\b/i;

/** Reads a warrant as the Head of Security gives it. Null if these words are not one. */
export function readGiven(text: string): {
  name: string;
  reason: string;
  minutes: number;
  byCaptain: boolean;
} | null {
  const found = text.match(GIVE_WORDS);
  if (!found) {
    return null;
  }
  const cut = found[1].indexOf(', for ');
  return {
    name: cut === -1 ? found[1] : found[1].slice(0, cut),
    reason: cut === -1 ? '' : found[1].slice(cut + 6),
    minutes: Number(found[2]),
    byCaptain: BY_CAPTAIN_WORDS.test(text),
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

/**
 * The Head of Security telling its officer that a warrant the officer may still hold has been
 * served by someone else: the person is in a cell. The officer gives its copy up, and lets
 * nobody go.
 */
export function servedLine(to: string, name: string): string {
  return `${firstName(to)}, ${name} is in a cell: the warrant is served.`;
}
export const SERVED_WORDS =
  /^\S+, (.+?) is in a cell: the warrant is served\b/i;

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
    case 'cuffed':
      return `${to}, I have ${name} in cuffs.`;
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
  const cuffed = line.match(/^\S+, I have (.+?) in cuffs\./i);
  if (cuffed) {
    return { what: 'cuffed', name: cuffed[1] };
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
/**
 * The words by which a warrant is taken back. The verb has to be bound to the warrant: two words
 * at most between them ("Cancel the warrant on Pun Pun", "Drop Pun Pun's warrant", "Call off the
 * arrest of Pun Pun"), or the warrant said to be withdrawn at the end of its clause ("The warrant
 * on Pun Pun is withdrawn", "Pun Pun's warrant is cancelled"), or "Forget the warrant" first
 * thing. "Drop everything, the warrant on Pun Pun comes first" and "Call off your patrol, I have
 * a warrant for Dana Reyes" are no taking back. See cancelAsked for a negation or a question.
 */
export const CANCEL_WORDS =
  /\b(?:cancel(?:l?ed)?|withdraw|drop|call(?:ed)?\s+off|take\s+back|lift)\s+(?:(?:[\w'-]+\s+){0,2}warrant|(?:the|that|this|my|your)\s+arrest)\b|\b(?:warrant|arrest)\b[^.!?;,]*?\b(?:is|be|was|been|are)\s+(?:cancel(?:l?ed)?|withdrawn?|dropped|lifted|called\s+off|void(?:ed)?)(?:\s+now)?\s*(?:[.!?,;]|$)|^\W*(?:[A-Za-z'-]+,\s*)?forget\s+(?:about\s+)?the\s+(?:warrant|arrest)\b/i;

/**
 * TRUE if these words take a warrant back: CANCEL_WORDS, and not said not to or asked about
 * ("Don't cancel the warrant on Pun Pun", "Did you withdraw the warrant?").
 */
export function cancelAsked(text: string): boolean {
  const found = text.match(CANCEL_WORDS);
  return !!found && !heldBack(text, found.index ?? 0);
}
/** The words by which the Captain has security make arrests again after its staff were hurt. */
export const TRY_AGAIN_WORDS = /\btry again\b/i;

/** One of these names, if these words are that name, in full or a letter or two out. */
function nameOf(words: string[], names: string[]): string | undefined {
  const said = words.join(' ').toLowerCase();
  if (!said) {
    return undefined;
  }
  return (
    names.find((name) => nameWords(name).join(' ') === said) ??
    closeName(said, names)
  );
}

/**
 * Who of these names a pardon is for: the name has to come right after the word ("Pardon Pun
 * Pun", "Release Dana", "Set free Pun Pun"), or between the words ("Let Pun Pun go", "Set Dana
 * Reyes free"). Null if no pardon word has one of these names by it, or if the one it has is
 * said not to be let go or asked about ("Don't release Pun Pun", "Did you free Pun Pun?"). "Pun
 * Pun broke free of the cuffs" names nobody after "free", so it is no pardon.
 */
export function readPardon(text: string, names: string[]): string | null {
  for (const verb of text.matchAll(
    /\b(?:pardon|release|set\s+free|free|let|set)\b/gi,
  )) {
    const at = verb.index ?? 0;
    if (heldBack(text, at)) {
      continue;
    }
    // The words after it, up to the end of the clause.
    const after = text.slice(at + verb[0].length);
    const stop = after.search(/[,.;:!?]/);
    const words = nameWords(stop === -1 ? after : after.slice(0, stop)).slice(
      0,
      6,
    );
    const word = verb[0].toLowerCase();
    if (word === 'let' || word === 'set') {
      // "Let Pun Pun go", "set Dana Reyes free": the name is what comes between.
      const end = words.indexOf(word === 'let' ? 'go' : 'free');
      const meant = end > 0 ? nameOf(words.slice(0, end), names) : undefined;
      if (meant) {
        return meant;
      }
      continue;
    }
    // "Pardon Pun Pun", "release the Pun Pun": the name, with one word at most before it.
    for (let start = 0; start <= 1; start++) {
      for (let size = Math.min(4, words.length - start); size > 0; size--) {
        const meant = nameOf(words.slice(start, start + size), names);
        if (meant) {
          return meant;
        }
      }
    }
  }
  return null;
}

/** TRUE if these words use the word "pardon" as an ask, not to say no to one or to ask about one. */
export function pardonAsked(text: string): boolean {
  return [...text.matchAll(/\bpardon\b/gi)].some(
    (word) => !heldBack(text, word.index ?? 0),
  );
}

/** Who a pardon names when they are nobody security has anything against: the words after "pardon". */
export function pardonNamed(text: string): string {
  return tidyName(
    text.match(
      /\b(?:[Pp]ardon|[Rr]elease|[Ss]et free|[Ff]ree)\s+((?:[A-Z][\w'-]*\s*){1,4})/,
    )?.[1] ??
      // Written without capitals: the words after the verb, up to where the sentence stops.
      text.match(
        /\b(?:pardon|release|set free|free)\s+((?:[a-z][\w'-]*\s*){1,3})/i,
      )?.[1] ??
      '',
  );
}

// ---- asking to be let in to where someone wanted is

/** What security writes to someone whose ID opens a room it cannot get into, with someone wanted inside. */
export function letInLine(
  to: string,
  which: string,
  place: string,
  name: string,
): string {
  return `${to}, I am at the ${which}door of the ${place} with a warrant for ${name}. Could you let me in, please?`;
}
/** The same, from somewhere it could not get to the door from: it says so, and does not claim to be standing there. */
export function letInFarLine(to: string, place: string, name: string): string {
  return `${to}, I have a warrant for ${name}, who is in the ${place}. I cannot get to its door. Could you let me in, please?`;
}
export const LET_IN_WORDS = /\ba warrant for\b.*\bCould you let me in\b/i;

// ---- an order that code could make nothing of, put to the LLM

/** What the LLM made of an order: what it is, who it names as the order wrote them, and for how long. */
export type Reading = {
  kind: 'warrant' | 'pardon' | 'withdraw' | 'neither';
  name: string;
  minutes: number;
};

/** The longest message put to the LLM to read. A longer one is cut: an order is short. */
const READING_MAX = 240;

/**
 * The one small question the LLM is asked about an order code could not read. It is asked by
 * itself: the message and nothing else. No room, no crew list, no history. A long prompt is what
 * a small model chokes on, and none of that is needed to say what a sentence asks for.
 */
export function buildReading(text: string): {
  system: string;
  user: string;
  schema: object;
} {
  return {
    system:
      'You read one message sent to the security office of a space station and say what it asks for. Reply with one JSON object and nothing else.',
    user: [
      `Message: "${text.replace(/"/g, "'").slice(0, READING_MAX)}"`,
      'Does it ask for someone to be arrested, locked up or put on the wanted list ("warrant")? Does it ask for someone to be let go, freed or forgiven ("pardon")? Does it take back a warrant, or call off an arrest, asked for before ("withdraw")? Or is it something else ("neither")?',
      '"kind": warrant, pardon, withdraw or neither.',
      '"name": the name of that person, spelt as the message spells it. "" if it names nobody.',
      '"minutes": how many minutes in a cell the message says. 0 if it does not say.',
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['warrant', 'pardon', 'withdraw', 'neither'],
        },
        name: { type: 'string', maxLength: NAME_MAX },
        minutes: { type: 'integer' },
      },
      required: ['kind', 'name', 'minutes'],
    },
  };
}

/**
 * Reads the LLM's answer. Null if it is no answer, says "neither", or names someone the message
 * does not: every word of the name has to be in the message, so that the LLM can pick a name out
 * and cannot make one up.
 */
export function readReading(reply: string, text: string): Reading | null {
  let body: { kind?: unknown; name?: unknown; minutes?: unknown };
  try {
    body = JSON.parse(reply);
  } catch {
    return null;
  }
  if (
    body.kind !== 'warrant' &&
    body.kind !== 'pardon' &&
    body.kind !== 'withdraw'
  ) {
    return null;
  }
  const name = tidyName(typeof body.name === 'string' ? body.name : '');
  const written = nameWords(text);
  const words = nameWords(name);
  if (words.length === 0 || !words.every((word) => written.includes(word))) {
    return null;
  }
  const minutes = Number(body.minutes);
  return {
    kind: body.kind,
    name,
    minutes:
      Number.isFinite(minutes) && minutes >= 1
        ? Math.min(MINUTES_MOST, Math.round(minutes))
        : 0,
  };
}

/** A reading put into the words code reads, so that it is taken exactly as an order in those words would be. */
export function readingAsOrder(reading: Reading): string {
  if (reading.kind === 'withdraw') {
    return `Cancel the warrant on ${reading.name}.`;
  }
  return reading.kind === 'pardon'
    ? `Pardon ${reading.name}.`
    : `Warrant for ${reading.name}${reading.minutes ? `, ${reading.minutes} minutes` : ''}.`;
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
