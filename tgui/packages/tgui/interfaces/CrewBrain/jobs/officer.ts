/**
 * The security officer: one of the Head of Security's staff. It serves the warrants.
 *
 * - Its first job is its kit: it fetches a stun baton from the security lockers.
 * - The Head of Security gives it a warrant, to its face or by PDA: "Hale, warrant: Pun Pun, for
 *   trespass. Bring them in, 5 minutes." Said to its face, it answers "The warrant, right away."
 * - It finds them, arrests them and puts them in a cell: all of that is jobs/arrests.ts.
 * - It is told where they were last seen, and told to let someone go, the same way.
 * - Said is not told. How a warrant went it tells the Head of Security to its face, and it is not
 *   told until it hears "I have that" back. With nothing back in 25 seconds it walks up and says
 *   it again. After two tries, or if the Head of Security is not to be found at its post, it
 *   sends it by PDA.
 * - With no Head of Security aboard it keeps the list itself (jobs/desk.ts), and takes warrants
 *   from the Captain and the heads of department directly.
 * - With one aboard, a warrant declared to the officer is sent on its way: "Captain, warrants go
 *   to Joan, the Head of Security."
 * - At a staff meeting it reports the arrests it has made, from the server's count.
 * - With nothing in hand it keeps its post in the Security Office, and looks in on the rest of
 *   its department now and then.
 *
 * All of that is code. The LLM answers people in its voice.
 */
import { isHead } from '../hierarchy';
import { addTask, findTask, finishTask, placeNamedIn } from '../tasks';
import type {
  BeatWord,
  NpcBrain,
  Plan,
  SecurityOutcome,
  SenseEvent,
  Task,
} from '../types';
import {
  arrestAgain,
  beatAfterActing,
  beatAfterSaying,
  beatCues,
  beatOf,
  describeBeat,
  dropWarrant,
  forgetWarrant,
  giveWarrant,
  noteSeen,
  onLead,
  planBeat,
  syncBeat,
  takeOutcomes,
  warrantTalk,
} from './arrests';
import {
  describeDesk,
  deskAfterActing,
  deskAfterSaying,
  deskCues,
  deskHears,
  deskTakes,
  deskUnread,
  planDesk,
  syncDesk,
} from './desk';
import { forcingReads } from './forcing';
import type { Job } from './job';
import { describeRounds, planRounds, roundsInHand, syncRounds } from './rounds';
import {
  AGAIN_WORDS,
  addressOf,
  cancelAsked,
  closeIn,
  firstName,
  HEARD_WORDS,
  isHeadOfSecurity,
  isOfficer,
  LET_GO_WORDS,
  nameIn,
  outcomeLine,
  PARDON_WORDS,
  REFUSALS,
  readGiven,
  readWarrant,
  SEEN_WORDS,
  SERVED_WORDS,
  SIGHTING_WORDS,
  saidTo,
  sameName,
  sightLine,
  WARRANT_ACK,
  WARRANT_ACK_WORDS,
} from './security';

/** Telling the Head of Security how a warrant went. The task's item is the line. */
const WORD = 'word_for_security_head';
/** Going back to its post when there is nothing else to see to. */
const POST = 'officer_post';

/** How long (deciseconds) after saying a thing to the Head of Security it waits to hear that it was heard. */
const HEARD_WAIT_DS = 250;
/** How many times it says a thing to the Head of Security with no word back before it sends it by PDA. */
const TELL_TRIES = 2;
/** How near (tiles) it stands to the Head of Security to say again what was not heard the first time. */
const TELL_DISTANCE = 2;
/** How long (deciseconds) it waits at its post for the Head of Security to come into sight before it sends word by PDA. */
const SOUGHT_DS = 200;

/**
 * What a new word on someone makes untrue of the words on them not yet sent. Being hurt,
 * attacked or robbed of its baton stays true whatever comes after, and so does having had
 * them in cuffs once they are in a cell or let go: the Captain is told of the cuffs.
 */
const STALE_AFTER: Partial<
  Record<SecurityOutcome['what'], SecurityOutcome['what'][]>
> = {
  jailed: ['cannot', 'lost'],
  freed: ['cannot', 'lost'],
  lost: ['cuffed', 'cannot'],
  cuffed: ['cannot', 'lost'],
  cannot: ['cannot'],
};

/** The Head of Security aboard, as far as it can tell: one in view, or one its PDA lists. Null if there is none. */
function headAboard(brain: NpcBrain): { name: string; job: string } | null {
  return (
    brain.peopleInView.find((person) => isHeadOfSecurity(person.job)) ??
    brain.pdaPeople.find((person) => isHeadOfSecurity(person.job)) ??
    null
  );
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** Opens or closes one of its tasks to match whether there is that work to do. */
function keep(
  brain: NpcBrain,
  kind: string,
  wanted: boolean,
  urgency: Task['urgency'],
  item?: string,
): void {
  const task = findTask(brain, kind, { item });
  if (wanted && !task) {
    addTask(brain, { kind, urgency, source: 'own', item });
  } else if (wanted && task) {
    task.urgency = urgency;
  } else if (!wanted && task) {
    finishTask(brain, task);
  }
}

/** Keeps the officer's tasks true to its warrants, to what it has yet to say, and to the time. */
function syncTasks(brain: NpcBrain): void {
  const beat = beatOf(brain);
  const head = headAboard(brain);
  if (head) {
    // How its warrants have gone is word for the Head of Security.
    for (const outcome of takeOutcomes(brain)) {
      // A word not yet sent that this one makes untrue is not sent (PLAY-02): "cannot get them
      // into a cell" after they are in one, or "I have them in cuffs" after they got away.
      const untrue = STALE_AFTER[outcome.what] ?? [];
      beat.words = beat.words.filter(
        (word) =>
          !untrue.includes(word.outcome.what) ||
          !sameName(word.outcome.name, outcome.name),
      );
      beat.words.push({
        outcome,
        line: outcomeLine(firstName(head.name), outcome),
        unheard: 0,
      });
    }
  } else {
    // With no Head of Security aboard it keeps the list itself, and there is nobody to tell.
    beat.words = [];
    syncDesk(brain);
  }
  const legwork = syncBeat(brain);
  for (const task of brain.tasks) {
    if (
      task.kind === WORD &&
      task.state !== 'done' &&
      !beat.words.some((word) => word.line === task.item)
    ) {
      finishTask(brain, task);
    }
  }
  for (const word of beat.words) {
    // That it is hurt, or has been attacked, or has lost its baton, is said at once and by PDA
    // unless the Head of Security is standing there: it may not be on its feet much longer.
    // So is why it cannot get someone it has by the arm into a cell: else it waits in the brig
    // behind the arrest, and goes out after they are in one (PLAY-02).
    const holding = brain.security?.holding;
    const urgent =
      ['hurt', 'attacked', 'baton'].includes(word.outcome.what) ||
      (word.outcome.what === 'cannot' &&
        !!holding &&
        sameName(word.outcome.name, holding));
    if (
      urgent &&
      !brain.peopleInView.some((person) => person.name === head?.name)
    ) {
      word.byPda = true;
    }
    keep(brain, WORD, true, urgent ? 'emergency' : 'asked', word.line);
  }
  const inHand =
    legwork ||
    beat.words.length > 0 ||
    brain.tasks.some((task) => task.state !== 'done' && !!describeDesk(task));
  // With nothing in hand it looks in on the rest of its department now and then.
  syncRounds(brain, !inHand);
  keep(
    brain,
    POST,
    !!brain.post &&
      brain.location !== brain.post &&
      !roundsInHand(brain) &&
      !brain.shutIn,
    'routine',
  );
}

/**
 * Telling the Head of Security how a warrant went, face to face. Said is not told: it is passed
 * on only when the Head of Security says it has it. With no word back it walks up and says it
 * again, and after that, or if the Head of Security is not to be found, it goes by PDA.
 */
function tellHead(brain: NpcBrain, word: BeatWord): Plan {
  const head = headAboard(brain);
  if (!head) {
    return {
      ready: false,
      step: 'There is no Head of Security aboard to tell.',
    };
  }
  const byPda = (): Plan =>
    brain.hasPda
      ? {
          ready: true,
          step: `You have word for ${head.name}, the Head of Security, and cannot tell them to their face. You are sending it by PDA: "${word.line}"`,
          act: { tool: 'message', person: head.name, text: word.line },
        }
      : {
          ready: false,
          step: `You have word for ${head.name}, the Head of Security, and no way to get it to them.`,
        };
  if (word.byPda) {
    return byPda();
  }
  // Said, and not yet answered. Being in sight is not being in earshot.
  if (word.toldAt !== undefined) {
    if (brain.now - word.toldAt < HEARD_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `You have told ${head.name} how the warrant went, and are waiting to hear that they have it.`,
      };
    }
    word.toldAt = undefined;
    word.unheard += 1;
    word.walkedUp = false;
  }
  if (word.unheard >= TELL_TRIES) {
    word.byPda = true;
    return byPda();
  }
  const seen = brain.peopleInView.find((person) => person.name === head.name);
  if (
    seen &&
    word.unheard > 0 &&
    (seen.distance ?? 0) > TELL_DISTANCE &&
    !word.walkedUp
  ) {
    return {
      ready: true,
      step: `You told ${head.name} how the warrant went and they did not hear. You are walking up to them to say it again.`,
      act: { tool: 'approach', person: seen.handle },
    };
  }
  if (seen) {
    return {
      ready: true,
      step: `You have word for ${head.name}, the Head of Security, and they are here. Your body is telling them, in these words: "${word.line}"`,
      say: word.line,
      exact: true,
    };
  }
  // Not in sight, and it is out on the station more often than not. It does not walk back to
  // tell: word goes by PDA unless it is at its post already, where it gives them a moment.
  if (brain.post && brain.location === brain.post) {
    word.soughtAt ??= brain.now;
    if (brain.now - word.soughtAt <= SOUGHT_DS) {
      return {
        ready: false,
        wait: true,
        step: `You have word for ${head.name}, the Head of Security, and are looking for them.`,
      };
    }
  }
  word.byPda = true;
  return byPda();
}

function plan(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === WORD) {
    const word = beatOf(brain).words.find((it) => it.line === task.item);
    return word
      ? tellHead(brain, word)
      : { ready: false, step: 'That has been passed on.' };
  }
  if (task.kind === POST) {
    const idle =
      !!brain.post &&
      !brain.tasks.some(
        (other) =>
          other.state !== 'done' &&
          other !== task &&
          other.urgency !== 'routine',
      );
    return idle && brain.post
      ? {
          ready: true,
          step: `You have nothing to see to just now, and are going back to your post, the ${brain.post}.`,
          act: { tool: 'go_to', place: brain.post },
        }
      : { ready: false, step: 'You are staying out for now.' };
  }
  return (
    planBeat(brain, task) ?? planDesk(brain, task) ?? planRounds(brain, task)
  );
}

function describeTask(task: Task): string | null {
  if (task.kind === WORD) {
    return 'tell the Head of Security how a warrant went';
  }
  if (task.kind === POST) {
    return 'go back to your post';
  }
  return describeBeat(task) ?? describeDesk(task) ?? describeRounds(task);
}

/** What the LLM should know about where things stand, so that what it says about them is true. */
function cues(brain: NpcBrain): string[] {
  return headAboard(brain)
    ? beatCues(brain)
    : [...deskCues(brain), ...beatCues(brain)];
}

/**
 * Takes what the Head of Security has said to it, or sent it. `aloud` is TRUE if it was said in
 * its hearing: only then does it answer aloud that it has the warrant.
 */
function takeWord(
  brain: NpcBrain,
  from: string,
  text: string,
  aloud: boolean,
): void {
  const beat = beatOf(brain);
  // The Head of Security saying it has what it was told: that word is passed on.
  if (HEARD_WORDS.test(text) && saidTo(brain.name, text)) {
    const told = beat.words.find((word) => word.toldAt !== undefined);
    if (told) {
      beat.words = beat.words.filter((word) => word !== told);
    }
    return;
  }
  if (!saidTo(brain.name, text)) {
    return;
  }
  const given = readGiven(text);
  if (given) {
    giveWarrant(brain, given);
    if (aloud) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== WARRANT_ACK);
      brain.toTell.push({
        to: from,
        line: WARRANT_ACK,
        why: `${from}, the Head of Security, has given you a warrant to serve on ${given.name}. You are saying that you have it.`,
        needs: WARRANT_ACK_WORDS,
        // Word for word, and there and then: the Head of Security is standing waiting on it.
        exact: true,
        whileBusy: true,
        at: Date.now(),
      });
    }
    return;
  }
  const seen = text.match(SEEN_WORDS);
  if (seen) {
    const place = placeNamedIn(brain, text.toLowerCase());
    if (place) {
      noteSeen(brain, seen[1], place, brain.now);
    }
    return;
  }
  // Someone else has served a warrant it holds: it gives its copy up, and lets nobody go.
  const served = text.match(SERVED_WORDS);
  if (served) {
    forgetWarrant(brain, served[1]);
    return;
  }
  const letGo = text.match(LET_GO_WORDS);
  if (letGo) {
    dropWarrant(brain, letGo[1], /pardoned/i.test(text));
    return;
  }
  if (AGAIN_WORDS.test(text)) {
    arrestAgain(brain);
  }
}

/** Sends someone who has brought it a warrant or a pardon on to the Head of Security, who keeps the list. */
function sendOn(
  brain: NpcBrain,
  from: string,
  fromJob: string,
  text: string,
  aloud: boolean,
): void {
  const head = headAboard(brain);
  if (
    !head ||
    !isHead(fromJob) ||
    !(
      readWarrant(text, []) ||
      cancelAsked(text) ||
      /\bpardon\b/i.test(text) ||
      (PARDON_WORDS.test(text) &&
        beatOf(brain).warrants.some((it) =>
          text.toLowerCase().includes(it.name.toLowerCase()),
        ))
    )
  ) {
    return;
  }
  const line = REFUSALS.toDesk(addressOf(from, fromJob), head.name);
  brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
  brain.toTell.push({
    to: from,
    line,
    why: `${from} has brought you something that is for ${head.name}, the Head of Security, who keeps the list of who is wanted. You are telling them so.`,
    byPda: !aloud,
    exact: true,
    whileBusy: aloud,
    at: Date.now(),
  });
}

/** How long (milliseconds) before the same sighting, of one person in one room, is read back again. */
const SIGHTING_AGAIN_MS = 120000;
/** Who said where, and when it last read that back: so a word said twice is not answered twice. */
const sightingsReadBack = new WeakMap<NpcBrain, Record<string, number>>();
/** A word for whoever it is after, said to its face with one warrant in hand. */
const SOMEONE_WORDS = /\b(?:he|she|they|him|her|them)\b/i;
/** Words that say where someone is not, or ask where they are. */
const NOT_A_SIGHTING =
  /\b(?:not|no longer|isn't|aren't|wasn't|never)\b|\?\s*$/i;

/**
 * With a Head of Security aboard, takes word of where someone it has a warrant on is, said to
 * its face or sent it by anyone (PLAY-03). It goes there, says back in fixed words what it took,
 * and sends the Head of Security the sighting so that its list stays true. With one warrant in
 * hand, "he", "she" or "they" said to its face means that one. Returns TRUE if it took it.
 */
function takeSighting(
  brain: NpcBrain,
  from: string,
  fromJob: string,
  text: string,
  aloud: boolean,
): boolean {
  const head = headAboard(brain);
  if (!head || !SIGHTING_WORDS.test(text) || NOT_A_SIGHTING.test(text)) {
    return false;
  }
  const place = placeNamedIn(brain, text.toLowerCase());
  const warrants = beatOf(brain).warrants;
  if (!place || warrants.length === 0) {
    return false;
  }
  const names = warrants.map((it) => it.name);
  const name =
    nameIn(text, names) ??
    closeIn(text, names) ??
    (aloud && warrants.length === 1 && SOMEONE_WORDS.test(text)
      ? names[0]
      : undefined);
  const warrant = warrants.find((it) => it.name === name);
  if (!warrant || !name) {
    return false;
  }
  const newPlace = warrant.lastSeen?.place !== place;
  noteSeen(brain, name, place, brain.now);
  const said = sightingsReadBack.get(brain) ?? {};
  sightingsReadBack.set(brain, said);
  const key = `${name}|${place}`;
  if (said[key] === undefined || Date.now() - said[key] >= SIGHTING_AGAIN_MS) {
    said[key] = Date.now();
    const line = `${addressOf(from, fromJob)}, I have that: ${name}, the ${place}.`;
    brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
    brain.toTell.push({
      to: from,
      line,
      why: `${from} has told you where ${name}, whom you have a warrant on, is. You are saying back what you took, and going there.`,
      byPda: !aloud,
      exact: true,
      whileBusy: aloud,
      at: Date.now(),
    });
  }
  // The Head of Security keeps the list, and is told of a place new to it.
  if (newPlace && from !== head.name) {
    const line = sightLine(name, place);
    brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
    brain.toTell.push({
      to: head.name,
      line,
      why: `${from} has told you where ${name} is. You are sending it on to ${head.name}, the Head of Security, who keeps the list.`,
      byPda: true,
      exact: true,
      at: Date.now(),
    });
  }
  return true;
}

export const OFFICER: Job = {
  is: isOfficer,
  // It works from the Security Office. It leaves it on a warrant, not to wander.
  keepsPost: true,
  cleans: false,
  // What an officer reports at its staff meeting: the arrests it has made.
  reports: ['arrests'],
  // With no baton or no cuffs on it, it says so in its report. Nobody orders one: they are in
  // the security lockers.
  lacks: (brain) => {
    const security = brain.security;
    if (!security || (security.has_baton && security.has_cuffs)) {
      return null;
    }
    return [
      ...(security.has_baton ? [] : ['a stun baton']),
      ...(security.has_cuffs ? [] : ['a pair of cuffs']),
    ].join(' and ');
  },
  about: () =>
    'You are a Security Officer. You answer to the Head of Security, who answers to the Captain. You serve warrants: you find whoever a warrant is on, tell them they are under arrest, put the cuffs on them and take them to a cell in the brig. Someone who stands still for it you never hit. Someone who will not, or who hits you, gets your stun baton and nothing harder. You work from the Security Office.',
  whenAsked: () => [
    'You arrest people on a warrant and on nothing else. There are no written laws yet. Asked to arrest someone, say that a warrant is for the Captain or a head of department to declare to the Head of Security.',
    'Who you have a warrant on, where they were last seen, and who is in the cells is told to you here: never say more about it than that. What your body does about a warrant it does by itself.',
    'You cannot follow anyone about. Told to follow someone, say plainly that you cannot, and ask them to tell the Head of Security where the person you are after is.',
  ],
  cues,
  syncTasks,
  plan,
  describeTask,
  // The Head of Security's word reaches it by PDA when it is not said to its face.
  readsMessage: (brain, from, text, _at, job) => {
    // A door forced for it: the Head of Security saying so, or engineering where it keeps the
    // list itself.
    if (forcingReads(brain, from, job, text)) {
      return;
    }
    if (isHeadOfSecurity(job)) {
      takeWord(brain, from, text, false);
      return;
    }
    if (!headAboard(brain)) {
      // Keeping the list itself, it says so when the Captain or a head sends it something it
      // can make nothing of.
      if (!deskTakes(brain, from, job, text, false)) {
        deskUnread(brain, from, job, text);
      }
      return;
    }
    if (!takeSighting(brain, from, job, text, false)) {
      sendOn(brain, from, job, text, false);
    }
  },
  // With the person it is after in sight, by the arm, or seen in the last two minutes, it does
  // not leave for a staff meeting.
  keptFromMeeting: (brain) =>
    onLead(brain) ? 'I am after someone on a warrant' : null,
  overhears: (brain, event: SenseEvent) => {
    const heard = String(event.details.message ?? '');
    const speaker = String(event.details.speaker ?? '');
    if (!speaker) {
      return;
    }
    const job = jobOf(brain, speaker);
    if (isHeadOfSecurity(job)) {
      takeWord(brain, speaker, heard, true);
      return;
    }
    if (!headAboard(brain)) {
      deskHears(brain, event);
      return;
    }
    if (
      event.details.said_to === 'me' &&
      !takeSighting(brain, speaker, job, heard, true)
    ) {
      sendOn(brain, speaker, job, heard, true);
    }
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    beatAfterSaying(brain, called);
    deskAfterSaying(brain, called);
    // Having said its word to the Head of Security, it waits to hear that it was heard.
    const word = beatOf(brain).words.find((it) => it.line === called);
    if (word) {
      word.toldAt = brain.now;
    }
  },
  // A warrant is not talked about with people it meets (KNA-32).
  vetsSay: (brain, text, to) => warrantTalk(brain, text, to),
  afterActing: (brain, act, task, ok, _looped, details) => {
    const beat = beatOf(brain);
    beatAfterActing(brain, act, task, ok, details);
    if (!headAboard(brain)) {
      deskAfterActing(brain, act, task, ok);
    }
    const word =
      task?.kind === WORD
        ? beat.words.find((it) => it.line === task.item)
        : undefined;
    // Having walked up to the Head of Security, near enough or not, it speaks.
    if (word && act.tool === 'approach') {
      word.walkedUp = true;
    }
    // Sent by PDA, it is passed on. One that will not send is kept, and tried again later.
    if (word && act.tool === 'message' && ok) {
      beat.words = beat.words.filter((it) => it !== word);
    }
  },
};
