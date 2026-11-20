/**
 * Who security is looking for: keeping the list, and saying where they are.
 *
 * This is not any one job's work. Everyone aboard does it, whatever their job.
 *
 * - A head of department is sent the list by security, by PDA, each time it changes, and sends
 *   word back that it has it. The new list takes the place of the old.
 * - At its next staff meeting, and at every one after while anyone is wanted, the head reads the
 *   whole list out, once everyone has reported. Staff who hear it keep it. Staff who were not
 *   there are sent it by PDA.
 * - Anyone who holds the list and sees someone on it sends security a PDA message saying where.
 *   Once for each person and each room in two minutes, and not while security is standing there
 *   to see for itself. It costs no walking, and no work is put down for it.
 * - A body that tries to put someone out of its room and cannot tells its head. The head declares
 *   a warrant on them for trespass.
 * - A crew NPC told it is under arrest stands still and goes along. Its body sees to that: here
 *   it is only remembered, so that what it says about it is true.
 *
 * The names are carried by code. The LLM is not asked who is wanted, or where anyone is.
 */
import { answersTo, isHead } from '../hierarchy';
import { placeNamedIn } from '../tasks';
import type {
  Action,
  NpcBrain,
  Plan,
  SenseEvent,
  WantedEntry,
  WantedKnown,
} from '../types';
import { headName } from './meetings';
import {
  ARREST_WORDS,
  COULD_NOT_WORDS,
  couldNotLine,
  hiddenLine,
  isHeadOfSecurity,
  isNoName,
  isOfficer,
  isSecurity,
  MEETING_LINE_WORDS,
  meetingLines,
  NOTICE_ACK,
  readMeetingLine,
  readNotice,
  sameName,
  sightLine,
  warrantLine,
} from './security';

/** How long (milliseconds) before word of the same person in the same room is sent again. */
const TELL_AGAIN_MS = 120000;
/** How long (deciseconds) before a head declares a second warrant for trespass on the same person. */
const DECLARE_AGAIN_DS = 6000;
/** How long (deciseconds) having failed to put someone out is worth telling of. */
const COULD_NOT_KEPT_DS = 1200;
/** How long (deciseconds) being told it is under arrest stands, if nothing comes of it. */
const ARREST_STANDS_DS = 600;
/**
 * What the server says when someone would not be walked out of the body's room: the hold was broken, or no
 * hold could be got. Not "You could not get to it." (the body never reached them) nor a reason that is the
 * body's own trouble, such as the walk taking too long.
 */
const WOULD_NOT_GO =
  /\bcould not get .+ out of .+: they got away from you\b|\bcannot get a hold of\b/i;

/** What an NPC knows of who is wanted, before it has been told anything. */
export function newWanted(): WantedKnown {
  return {
    entries: [],
    at: 0,
    told: {},
    readOut: null,
    couldNot: [],
    declared: {},
    arrestedBy: null,
  };
}

/** Writes a short list the way it is said: "a", "a and b", "a, b and c". */
function listed(parts: string[]): string {
  return parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/**
 * Whoever takes word for security, as far as this NPC can tell: the Head of Security if there is
 * one aboard, and failing that an officer. Null if there is nobody.
 */
export function securityDesk(brain: NpcBrain): string | null {
  const everyone = [...brain.peopleInView, ...brain.pdaPeople].filter(
    (person) => person.name !== brain.name,
  );
  return (
    (
      everyone.find((person) => isHeadOfSecurity(person.job)) ??
      everyone.find((person) => isOfficer(person.job))
    )?.name ?? null
  );
}

/** Takes a list of who is wanted: in place of the one it had, or added to it. */
function takeList(
  brain: NpcBrain,
  entries: WantedEntry[],
  more: boolean,
): void {
  const known = brain.wanted;
  known.entries = more
    ? [
        ...known.entries,
        ...entries.filter(
          (entry) => !known.entries.some((it) => it.name === entry.name),
        ),
      ]
    : entries;
  known.at = brain.now;
}

/**
 * A head declaring a warrant for trespass on someone its staff could not put out. Sent to
 * security by PDA, in the words the Captain would use. One standing warrant for one person is
 * enough: it is not declared again while security is already looking for them.
 */
function declareTrespass(brain: NpcBrain, name: string, place: string): void {
  const known = brain.wanted;
  const desk = securityDesk(brain);
  const key = name.toLowerCase();
  // "Unknown" is how anyone with their face hidden is seen: no name a warrant could be on.
  if (
    isNoName(name) ||
    !desk ||
    !brain.hasPda ||
    known.entries.some((entry) => sameName(entry.name, name)) ||
    (known.declared[key] !== undefined &&
      brain.now - known.declared[key] < DECLARE_AGAIN_DS)
  ) {
    return;
  }
  known.declared[key] = brain.now;
  brain.toTell.push({
    to: desk,
    line: warrantLine(name, `trespass in the ${place}`),
    why: `${name} would not be put out of the ${place}. You are declaring a warrant on them for trespass, by PDA to ${desk} of security.`,
    byPda: true,
    at: Date.now(),
  });
}

/**
 * Reads a PDA message for what it says of who is wanted. Returns TRUE if it was that, and so
 * means nothing else to whoever's PDA it is.
 */
export function readWanted(
  brain: NpcBrain,
  from: string,
  text: string,
  job: string,
): boolean {
  // Security's notice to a head: the whole list. The head sends word back that it has it.
  const notice = isSecurity(job) ? readNotice(text) : null;
  if (notice) {
    takeList(brain, notice.entries, notice.more);
    if (isHead(brain.job) && !isSecurity(brain.job)) {
      brain.toTell = brain.toTell.filter(
        (tell) => !(tell.to === from && tell.line === NOTICE_ACK),
      );
      brain.toTell.push({
        to: from,
        line: NOTICE_ACK,
        why: `${from} of security has sent you the list of who is wanted. You are sending word back that you have it. You read it out at your next staff meeting.`,
        byPda: true,
        at: Date.now(),
      });
    }
    return true;
  }
  // What its head read out at a meeting it was not at, sent on by PDA.
  const told = isHead(job) ? readMeetingLine(text) : null;
  if (told) {
    takeList(
      brain,
      told.names.map((name) => ({ name })),
      told.more,
    );
    return true;
  }
  // One of its staff could not put someone out of their room.
  const couldNot = text.match(COULD_NOT_WORDS);
  if (
    couldNot &&
    isHead(brain.job) &&
    !isSecurity(brain.job) &&
    answersTo(job, brain.job)
  ) {
    const place = placeNamedIn(brain, text.toLowerCase());
    if (place) {
      declareTrespass(brain, couldNot[1], place);
    }
    return true;
  }
  return false;
}

/** Follows what is said in its hearing about who is wanted, and about its own arrest. */
export function wantedOverhears(brain: NpcBrain, event: SenseEvent): void {
  const heard = String(event.details.message ?? '');
  const speaker = String(event.details.speaker ?? '');
  if (!speaker || speaker === brain.name) {
    return;
  }
  const job = jobOf(brain, speaker);
  // A head reading the list out at a staff meeting. Whoever hears it has it, their own staff or not.
  const told = isHead(job) ? readMeetingLine(heard) : null;
  if (told) {
    takeList(
      brain,
      told.names.map((name) => ({ name })),
      told.more,
    );
    return;
  }
  // One of its staff telling it, to its face, that someone would not be put out.
  const couldNot = heard.match(COULD_NOT_WORDS);
  if (
    couldNot &&
    isHead(brain.job) &&
    !isSecurity(brain.job) &&
    answersTo(job, brain.job)
  ) {
    const place = placeNamedIn(brain, heard.toLowerCase());
    if (place) {
      declareTrespass(brain, couldNot[1], place);
    }
    return;
  }
  // Security telling it that it is under arrest.
  if (
    ARREST_WORDS.test(heard) &&
    isSecurity(job) &&
    sameName(heard.split(',')[0], brain.name)
  ) {
    brain.wanted.arrestedBy = { by: speaker, at: brain.now };
  }
}

/**
 * Keeps what it knows of who is wanted true to what it sees: sends security word of anyone on
 * the list who is in view, and passes up word of anyone it could not put out of its room.
 */
export function syncWanted(brain: NpcBrain): void {
  const known = brain.wanted;
  if (
    known.arrestedBy &&
    !brain.inHand &&
    !brain.custody &&
    brain.now - known.arrestedBy.at > ARREST_STANDS_DS
  ) {
    known.arrestedBy = null;
  }
  // Security sees to its own list. Everyone else says where they are.
  if (isSecurity(brain.job)) {
    return;
  }
  const desk = securityDesk(brain);
  const securityHere = brain.peopleInView.some((person) =>
    isSecurity(person.job),
  );
  if (
    desk &&
    brain.hasPda &&
    !securityHere &&
    !brain.custody &&
    known.entries.length > 0
  ) {
    for (const person of brain.peopleInView) {
      const entry = known.entries.find((it) => sameName(it.name, person.name));
      // Not itself, not someone security already has in cuffs, and not anyone seen as Unknown.
      if (
        !entry ||
        person.name === brain.name ||
        person.cuffed ||
        isNoName(person.name)
      ) {
        continue;
      }
      const place = person.place ?? brain.location;
      const key = `${entry.name}|${place}`;
      if (!place || Date.now() - (known.told[key] ?? 0) < TELL_AGAIN_MS) {
        continue;
      }
      known.told[key] = Date.now();
      brain.toTell.push({
        to: desk,
        line: sightLine(entry.name, place),
        why: `Security is looking for ${entry.name}, and you can see them in the ${place}. You are sending ${desk} of security a PDA message to say where.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }
  // Someone it could not put out of its room. A head declares a warrant. Anyone else tells their head.
  for (const failed of known.couldNot) {
    if (failed.done) {
      continue;
    }
    failed.done = true;
    if (isHead(brain.job)) {
      declareTrespass(brain, failed.name, failed.place);
      continue;
    }
    const head = headName(brain);
    if (!head) {
      continue;
    }
    // Someone seen as Unknown has no name to give: the head is told plainly, and declares nothing.
    const hidden = isNoName(failed.name);
    const line = hidden
      ? hiddenLine(head, failed.place)
      : couldNotLine(head, failed.name, failed.place);
    const here = brain.peopleInView.some((person) => person.name === head);
    brain.toTell.push({
      to: head,
      line,
      why: `You tried to put ${hidden ? 'someone with their face hidden' : failed.name} out of the ${failed.place} and could not. You are telling ${head}, who you answer to${here ? '' : ', by PDA'}.`,
      byPda: !here,
      exact: true,
      at: Date.now(),
    });
  }
  known.couldNot = known.couldNot.filter(
    (failed) => brain.now - failed.at < COULD_NOT_KEPT_DS,
  );
}

/**
 * Notes how putting someone out of its room went. One who would not go, as against one it had no
 * right to put out, is word for its head. `text` is what the body said of how it went.
 */
export function wantedAfterActing(
  brain: NpcBrain,
  act: Action,
  ok: boolean,
  text: string,
): void {
  if (
    act.tool !== 'throw_out' ||
    ok ||
    isSecurity(brain.job) ||
    !WOULD_NOT_GO.test(text)
  ) {
    return;
  }
  const name =
    brain.peopleInView.find((person) => person.handle === act.person)?.name ??
    Object.entries(brain.handles).find(
      ([, handle]) => handle === act.person,
    )?.[0];
  const place = brain.post ?? brain.location;
  const known = brain.wanted;
  if (!name || !place || known.couldNot.some((it) => it.name === name)) {
    return;
  }
  // Someone only being seen to the door when what they were sent for is done is no trespasser:
  // a walk out that fails is the NPC's own, and they are seen out again, never reported. Put out
  // on a superior's order, they are reported as before.
  const stranger = brain.strangers[name];
  if (stranger?.seenOut && !stranger.orderedBy) {
    return;
  }
  known.couldNot.push({ name, place, at: brain.now, done: false });
}

/**
 * What a head says at its staff meeting of who security is looking for, once its staff have
 * reported: the whole list, a line at a time. Null when there is nothing to say, or it is said.
 */
export function wantedMeetingStep(brain: NpcBrain, said: number): Plan | null {
  const known = brain.wanted;
  // Security's own head has no need to read its own list to its own staff: they have it.
  if (isSecurity(brain.job)) {
    return null;
  }
  const names = known.entries.map((entry) => entry.name);
  // Nobody wanted is only worth saying once, after a meeting at which somebody was.
  if (names.length === 0 && !(known.readOut && known.readOut.length > 0)) {
    return null;
  }
  const lines = meetingLines(names);
  const line = lines[said];
  if (!line) {
    return null;
  }
  return {
    ready: true,
    step: `Your staff have reported. Before the meeting ends your body is telling them who security is looking for, in these words: "${line}"`,
    say: line,
    exact: true,
  };
}

/**
 * Notes that a head has read a line of the list out at its meeting. Returns how many lines it
 * has now said, given how many it had.
 */
export function wantedSaid(
  brain: NpcBrain,
  called: string,
  said: number,
): number {
  if (!MEETING_LINE_WORDS.test(called)) {
    return said;
  }
  const names = brain.wanted.entries.map((entry) => entry.name);
  if (said + 1 >= meetingLines(names).length) {
    brain.wanted.readOut = names;
  }
  return said + 1;
}

/** Sends the list, by PDA, to those of a head's staff who were not at the meeting to hear it. */
export function wantedAbsent(brain: NpcBrain, absent: string[]): void {
  const known = brain.wanted;
  const names = known.entries.map((entry) => entry.name);
  if (
    isSecurity(brain.job) ||
    !brain.hasPda ||
    (names.length === 0 && !(known.readOut && known.readOut.length > 0))
  ) {
    return;
  }
  for (const name of absent) {
    // Someone who is on the list is sent the list without their own name on it: a head sent one
    // of its staff "security is looking for you, send word if you see yourself".
    const others = names.filter((wanted) => !sameName(wanted, name));
    if (others.length === 0 && others.length !== names.length) {
      continue;
    }
    for (const line of meetingLines(others)) {
      brain.toTell.push({
        to: name,
        line,
        why: `${name} was not at the staff meeting to hear who security is looking for. You are sending it to them by PDA.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }
}

/** What the LLM should know of who is wanted and of its own arrest, so that what it says is true. */
export function wantedCues(brain: NpcBrain): string[] {
  const known = brain.wanted;
  const lines: string[] = [];
  if (brain.custody) {
    lines.push(
      `Security has locked you in ${brain.custody} in the brig. You cannot leave, or work, until your time is up or the Captain pardons you. What you think of that is yours to say.`,
    );
  } else if (known.arrestedBy) {
    lines.push(
      `${known.arrestedBy.by} of security has told you that you are under arrest. You stand still and go along with it: you do not run, hide or fight. What you think of it is yours to say.`,
    );
  }
  if (isSecurity(brain.job) || known.entries.length === 0) {
    return lines;
  }
  const others = known.entries
    .filter((entry) => !sameName(entry.name, brain.name))
    .map((entry) => entry.name);
  if (others.length > 0) {
    lines.push(
      `Security is looking for ${listed(others)}. If you see ${others.length === 1 ? 'them' : 'one of them'}, your body sends security a PDA message saying where.`,
    );
  }
  if (others.length < known.entries.length) {
    lines.push('Security is looking for you, too.');
  }
  return lines;
}
