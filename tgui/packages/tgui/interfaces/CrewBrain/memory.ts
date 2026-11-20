/**
 * What an NPC remembers of the station: the rooms it has been in, what it saw there, and where it
 * last saw each person. It is built only from what the NPC's own body has seen, so an NPC knows
 * nothing about a room until it has been there.
 */
import { describeFeelingWithReason } from './relationships';
import type {
  Npc,
  NpcBrain,
  SenseEvent,
  StorageMemory,
  ThingInView,
} from './types';

// Everything an NPC remembers is sent with every decision, so each of these is a slice of a fixed
// budget. The prompt has to fit the model's context window with room to spare, and the bigger
// it is the longer every decision takes. Raise one only by lowering another.
/** Most rooms offered as places to go, most recently visited first. */
const PLACES_SHOWN = 12;
/** Most rooms described in full, with what was seen and kept there. */
const PLACES_DESCRIBED = 8;
/** Most things listed per room. */
const THINGS_PER_PLACE = 6;
/** Most people listed, most recently seen first. */
const PEOPLE_SHOWN = 8;
/** Most containers listed per room. */
const CONTAINERS_PER_PLACE = 3;
/** Most items listed per container. */
const ITEMS_PER_CONTAINER = 6;
/** Most notes an NPC keeps. The oldest is dropped to make room. */
const NOTES_MAX = 12;
const NOTE_MAX_LENGTH = 200;

/** Reduces a note to its letters and digits, so near-identical notes compare equal. */
function noteKey(note: string): string {
  return note.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** How much of the shorter of two notes' wording has to be in the other for them to be the same note. */
const SAME_NOTE_SHARE = 0.6;
/** Most notes sent with one call. */
const NOTES_SHOWN = 6;

/** The words of a piece of text that carry what it says: the longer ones, without their plural. */
function tellingWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3)
      .map((word) => word.replace(/s$/, '')),
  );
}

/** TRUE if two notes say the same thing: one holds the other, or most of their wording is shared. */
function sameNote(a: string, b: string): boolean {
  const [keyA, keyB] = [noteKey(a), noteKey(b)];
  if (keyA.includes(keyB) || keyB.includes(keyA)) {
    return true;
  }
  const [wordsA, wordsB] = [tellingWords(a), tellingWords(b)];
  const smaller = Math.min(wordsA.size, wordsB.size);
  if (smaller === 0) {
    return false;
  }
  const shared = [...wordsA].filter((word) => wordsB.has(word)).length;
  return shared / smaller >= SAME_NOTE_SHARE;
}

/** TRUE if any word of a name is among these words. */
function namedIn(words: Set<string>, name: string): boolean {
  return [...tellingWords(name)].some((part) => words.has(part));
}

/**
 * TRUE if a note only says where someone is, or that the NPC has met them. That is passing state,
 * and the NPC has it already: where it last saw each person is kept for it, up to date, and a note
 * of it is out of date the moment they walk off.
 */
function isSighting(brain: NpcBrain, note: string): boolean {
  const words = tellingWords(note);
  const people = [
    ...brain.people.keys(),
    ...brain.peopleInView.map((person) => person.name),
  ];
  if (!people.some((name) => namedIn(words, name))) {
    return false;
  }
  const said = note.toLowerCase();
  if (/\b(met|meet|meeting|introduced)\b/.test(said)) {
    return true;
  }
  return (
    /\b(is|was|are|were|stands?|standing|saw|seen|spotted)\b/.test(said) &&
    allPlaces(brain).some((place) => said.includes(place.toLowerCase()))
  );
}

/**
 * Saves a note unless the NPC already has one saying the same thing, or it is only a record of who
 * was where. Returns the note as saved, or '' if it was not kept.
 */
export function addNote(brain: NpcBrain, note: string): string {
  const trimmed = note.trim().slice(0, NOTE_MAX_LENGTH);
  if (!noteKey(trimmed) || isSighting(brain, trimmed)) {
    return '';
  }
  const same = brain.notes.filter((existing) => sameNote(existing, trimmed));
  // A note it has already, or a shorter copy of one, is not kept: the full note stays.
  const key = noteKey(trimmed);
  if (same.some((existing) => noteKey(existing).includes(key))) {
    return '';
  }
  // Any other note on the same thing is what was said last, and corrects the older: "Pun Pun is
  // no longer wanted" after "Pun Pun is wanted for theft". The older ones go.
  for (const old of same) {
    brain.notes.splice(brain.notes.indexOf(old), 1);
  }
  brain.notes.push(trimmed);
  if (brain.notes.length > NOTES_MAX) {
    brain.notes.shift();
  }
  return trimmed;
}

/**
 * The notes worth sending with a call: those about someone in view, or about what was just said,
 * before the rest, and the newest before the oldest. They come back in the order they were written.
 */
export function notesFor(brain: NpcBrain, heard = ''): string[] {
  const said = tellingWords(heard);
  const ranked = brain.notes.map((note, index) => {
    const words = tellingWords(note);
    const aboutCompany = brain.peopleInView.some((person) =>
      namedIn(words, person.name),
    );
    const aboutTalk = [...words].some((word) => said.has(word));
    return { note, index, rank: (aboutCompany ? 2 : 0) + (aboutTalk ? 1 : 0) };
  });
  return ranked
    .sort((a, b) => b.rank - a.rank || b.index - a.index)
    .slice(0, NOTES_SHOWN)
    .sort((a, b) => a.index - b.index)
    .map(({ note }) => note);
}

/** Records what the body can see right now. Costs no LLM call. */
export function observe(brain: NpcBrain, npc: Npc, now: number): void {
  if (!npc.awake || !npc.location) {
    return;
  }
  let place = brain.places.get(npc.location);
  if (!place) {
    place = { lastVisit: now, things: new Map(), storage: new Map() };
    brain.places.set(npc.location, place);
  }
  place.lastVisit = now;
  // A mess remembered here that is no longer in sight has been cleaned up.
  const messesInView = new Set(
    (npc.things_in_view ?? [])
      .filter((thing) => thing.kind === 'mess')
      .map((thing) => thing.name),
  );
  for (const [name, seen] of place.things) {
    if (seen.kind === 'mess' && !messesInView.has(name)) {
      place.things.delete(name);
    }
  }
  for (const thing of npc.things_in_view ?? []) {
    place.things.set(thing.name, { at: now, kind: thing.kind });
  }
  for (const person of npc.people_in_view ?? []) {
    brain.people.set(person.name, { place: npc.location, at: now });
  }
}

/**
 * Every room aboard, by name. Crew know their way around the station they work on: what they learn
 * by walking it is what is in each room, not where the rooms are.
 */
let stationPlaces = new Set<string>();

/** Takes the list of the station's rooms from the server. */
export function setStationPlaces(names: string[]): void {
  if (names.length !== stationPlaces.size) {
    stationPlaces = new Set(names);
  }
}

/** TRUE if this is a room the NPC knows the way to: any room aboard, or one it has stood in. */
export function knowsPlace(brain: NpcBrain, name: string): boolean {
  return stationPlaces.has(name) || brain.places.has(name);
}

/** Every room the NPC knows of by name. */
export function allPlaces(brain: NpcBrain): string[] {
  return [...new Set([...brain.places.keys(), ...stationPlaces])];
}

/** The room crew go to when they want supplies ordered. */
export const CARGO_LOBBY = 'Cargo Lobby';

/** Records where the custodial locator showed cleaning gear. */
export function recordLocator(brain: NpcBrain, event: SenseEvent): void {
  brain.locatorUsed = true;
  brain.supplyPlaces = (event.details.places ?? []).map((found) => found.place);
}

/** Records rooms the NPC has learned the way to without walking there: from its PDA, or because any crew member would know. */
export function recordKnownPlaces(brain: NpcBrain, event: SenseEvent): void {
  for (const found of event.details.places ?? []) {
    let place = brain.places.get(found.place);
    if (!place) {
      place = { lastVisit: event.at, things: new Map(), storage: new Map() };
      brain.places.set(found.place, place);
    }
    for (const thing of found.things) {
      place.things.set(thing, { at: event.at, kind: 'item' });
    }
  }
}

/** Records what the body found on looking at a container. */
export function recordStorage(brain: NpcBrain, event: SenseEvent): void {
  const { place: placeName, container, state, contents } = event.details;
  if (!placeName || !container || !state) {
    return;
  }
  let place = brain.places.get(placeName);
  if (!place) {
    place = { lastVisit: event.at, things: new Map(), storage: new Map() };
    brain.places.set(placeName, place);
  }
  let memory = place.storage.get(container);
  if (!memory) {
    memory = { locked: false, items: new Map() };
    place.storage.set(container, memory);
  }
  memory.locked = state === 'locked';
  if (state === 'locked') {
    return;
  }
  // Whatever was here before and is not now has been taken out, but this is still where it goes.
  // Not on a look at one standing open: most often a workmate has it open, and shuts it again
  // with all of that inside, so only what was seen is added (MULTI-04).
  if (state !== 'open') {
    for (const item of memory.items.keys()) {
      memory.items.set(item, false);
    }
  }
  for (const item of contents ?? []) {
    memory.items.set(item.name, true);
  }
}

/** Describes what one room's containers hold, for the list of places the NPC remembers. */
function describeStorage(storage: Map<string, StorageMemory>): string[] {
  const lines: string[] = [];
  for (const [name, memory] of [...storage.entries()].slice(0, CONTAINERS_PER_PLACE)) {
    const items = [...memory.items.entries()];
    const inside = items.filter(([, present]) => present).map(([item]) => item);
    const gone = items.filter(([, present]) => !present).map(([item]) => item);
    const parts: string[] = [];
    if (memory.locked) {
      parts.push('locked');
    }
    if (inside.length > 0) {
      parts.push(`holds ${inside.slice(0, ITEMS_PER_CONTAINER).join(', ')}`);
    } else if (!memory.locked) {
      parts.push('empty');
    }
    if (gone.length > 0) {
      parts.push(
        `also the place for ${gone.slice(0, ITEMS_PER_CONTAINER).join(', ')}, not there at last look`,
      );
    }
    lines.push(`    in the ${name}: ${parts.join('; ')}`);
  }
  return lines;
}

/** The rooms the NPC remembers, most recently visited first. These are the only places it can go_to. */
export function knownPlaces(brain: NpcBrain): string[] {
  return [...brain.places.entries()]
    .sort((a, b) => b[1].lastVisit - a[1].lastVisit)
    .slice(0, PLACES_SHOWN)
    .map(([name]) => name);
}

/** Most items offered as things to pick up. */
const ITEMS_OFFERED = 24;

/**
 * The items the NPC could go and get: loose ones in view, then ones it remembers being in a
 * container. These are the only things it can pick_up.
 */
export function knownItems(brain: NpcBrain): string[] {
  return allKnownItems(brain).slice(0, ITEMS_OFFERED);
}

/**
 * Every item the NPC can see or remembers seeing in storage. For code that looks for something in
 * particular: a list cut short for the LLM's sake would hide the mop in the crate it has just opened.
 */
export function allKnownItems(brain: NpcBrain): string[] {
  const names = new Set<string>();
  for (const thing of brain.thingsInView) {
    if (thing.kind === 'item') {
      names.add(thing.name);
    }
  }
  for (const place of brain.places.values()) {
    for (const memory of place.storage.values()) {
      // What it last saw in a locker it has since found locked or welded is not to be had: a
      // janitor whose only known mop was in one went for it again and again, and never told its
      // head it had nothing to clean with (HAND-05). It is still remembered, for when it opens.
      if (memory.locked) {
        continue;
      }
      for (const [item, present] of memory.items) {
        if (present) {
          names.add(item);
        }
      }
    }
  }
  return [...names];
}

/** The rooms where the NPC remembers a mess, other than the one it is standing in. */
export function placesWithMess(brain: NpcBrain): string[] {
  const places: string[] = [];
  for (const [name, place] of brain.places) {
    if (name === brain.location) {
      continue;
    }
    for (const seen of place.things.values()) {
      if (seen.kind === 'mess') {
        places.push(name);
        break;
      }
    }
  }
  return places;
}

/** How long (deciseconds of server time) before an NPC is prompted again to speak up about a mess in the same room. */
const TELL_OF_MESS_AGAIN_DS = 3000;

/** How long (deciseconds) before an NPC is prompted to speak up about a mess anywhere, having just done so. */
const TELL_OF_ANY_MESS_AGAIN_DS = 1200;

/**
 * TRUE if this NPC has lately told someone about the mess in the room it is in, or about a mess
 * anywhere in the last couple of minutes. Walking through one dirty room after another, it would
 * otherwise announce every one of them.
 */
export function recentlyToldOfMess(brain: NpcBrain): boolean {
  const here = brain.toldOfMess.get(brain.location);
  if (here !== undefined && brain.now - here < TELL_OF_MESS_AGAIN_DS) {
    return true;
  }
  return [...brain.toldOfMess.values()].some(
    (told) => brain.now - told < TELL_OF_ANY_MESS_AGAIN_DS,
  );
}

/** Describes what the NPC remembers, for the system prompt. */
export function describeMemory(brain: NpcBrain, now: number): string[] {
  const lines: string[] = ['Places you have been and what you saw there:'];
  const places = [...brain.places.entries()]
    .sort((a, b) => b[1].lastVisit - a[1].lastVisit)
    .slice(0, PLACES_DESCRIBED);
  if (places.length === 0) {
    lines.push('- (nowhere yet)');
  }
  for (const [name, place] of places) {
    const things = [...place.things.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, THINGS_PER_PLACE)
      .map(([thing, seen]) => withKind(thing, seen.kind));
    const seen = things.length > 0 ? things.join(', ') : 'nothing of note';
    lines.push(`- ${name} (${ago(now - place.lastVisit)}): ${seen}`);
    lines.push(...describeStorage(place.storage));
  }

  const people = [...brain.people.entries()]
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, PEOPLE_SHOWN);
  if (people.length > 0) {
    lines.push('', 'Where you last saw people, and how you feel about them:');
    for (const [name, sighting] of people) {
      const feeling = describeFeelingWithReason(brain, name);
      lines.push(
        `- ${name}: ${sighting.place}, ${ago(now - sighting.at)}${feeling ? `. As for ${name}, ${feeling}.` : ''}`,
      );
    }
  }
  return lines;
}

/** Most rooms described when nothing that was said points at one. */
const PLACES_WHEN_UNSURE = 3;
/** The words of a question about what the NPC has seen or where things are, as against any other question. */
const ASKS_WHAT_IT_KNOWS =
  /\b(where|seen|saw|see|been|find|found|anything|anyone|anybody|noticed|notice|look(ed)? like|going on|happen(ed|ing)?)\b/i;

/**
 * Describes what the NPC remembers that bears on what has just been said to it: the rooms that
 * were named, or that hold something that was named, and where it last saw anyone who was named.
 * Everything it remembers is a long list, and most of it has nothing to do with the question. If
 * it was asked something and nothing it remembers was named, the last few rooms it was in are
 * given in brief, so that it can still say where it has been.
 */
export function describeMemoryFor(
  brain: NpcBrain,
  now: number,
  heard: string,
): string[] {
  const said = tellingWords(heard);
  // Short names count here too: a mop is three letters.
  for (const word of heard.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length === 3) {
      said.add(word);
    }
  }
  const names = (name: string) =>
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length > 2)
      .map((part) => (part.length > 3 ? part.replace(/s$/, '') : part));
  const named = (name: string) => names(name).some((part) => said.has(part));
  const byVisit = [...brain.places.entries()].sort(
    (a, b) => b[1].lastVisit - a[1].lastVisit,
  );
  const about = byVisit.filter(
    ([name, place]) =>
      named(name) ||
      [...place.things.keys()].some(named) ||
      [...place.storage.entries()].some(
        ([container, memory]) =>
          named(container) || [...memory.items.keys()].some(named),
      ),
  );
  const lines: string[] = [];
  const describe = (
    [name, place]: (typeof byVisit)[number],
    storage: boolean,
  ) => {
    const things = [...place.things.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, THINGS_PER_PLACE)
      .map(([thing, seen]) => withKind(thing, seen.kind));
    lines.push(
      `- ${name} (${ago(now - place.lastVisit)}): ${things.length > 0 ? things.join(', ') : 'nothing of note'}`,
    );
    if (storage) {
      lines.push(...describeStorage(place.storage));
    }
  };
  if (about.length > 0) {
    lines.push('What you remember that bears on what was said:');
    for (const place of about.slice(0, PLACES_DESCRIBED)) {
      describe(place, true);
    }
  } else if (ASKS_WHAT_IT_KNOWS.test(heard)) {
    // Rooms it saw nothing in tell the asker nothing.
    const seen = byVisit
      .filter(([, place]) => place.things.size > 0)
      .slice(0, PLACES_WHEN_UNSURE);
    if (seen.length > 0) {
      lines.push('Where you have been lately, and what you saw there:');
      for (const place of seen) {
        describe(place, false);
      }
    }
  }
  const inView = new Set(brain.peopleInView.map((person) => person.name));
  const people = [...brain.people.entries()]
    .filter(([name]) => !inView.has(name) && named(name))
    .slice(0, PEOPLE_SHOWN);
  if (people.length > 0) {
    lines.push('Where you last saw those who were named:');
    for (const [name, sighting] of people) {
      const feeling = describeFeelingWithReason(brain, name);
      lines.push(
        `- ${name}: ${sighting.place}, ${ago(now - sighting.at)}${feeling ? `. As for ${name}, ${feeling}.` : ''}`,
      );
    }
  }
  return lines;
}

/** Machines often carry brand names, so say what they are. */
export function withKind(name: string, kind: ThingInView['kind']): string {
  if (kind === 'machine') {
    return `${name} (a machine)`;
  }
  return kind === 'mess' ? `${name} (a mess)` : name;
}

/** Turns a span of server time (deciseconds) into rough words. */
function ago(deciseconds: number): string {
  const minutes = Math.round(deciseconds / 600);
  if (minutes < 1) {
    return 'just now';
  }
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}
