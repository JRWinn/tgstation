/**
 * Answering to a head: telling them what you need, and going to their meetings.
 *
 * This is not any one job's work. Everyone who is not a head has one, and takes what they need for
 * their work to that head, not to cargo: cargo takes orders from heads of department only.
 *
 * When the head calls a staff meeting, by PDA, each of them:
 * - sends word back that it is coming, and drops what it is doing to go;
 * - waits in the room, saying nothing, until the head calls on it by name;
 * - gives its report: how much work it has done since the last one, and what it is short of;
 * - stays until the head says the meeting is over.
 *
 * Someone who cannot get into the room, or who is told the meeting went ahead without them, sends
 * the same report by PDA. The report is written by code, numbers and all (see reports.ts): the
 * LLM only adds a remark of its own to it.
 *
 * Being there is not a matter of which side of a line its feet are on. A body standing near the
 * door is pushed a tile out by everyone who comes through. So it walks up to its head once it
 * is in the room, it never waits in a doorway, a push out of the room is not leaving it, and
 * told it has arrived with its head in view it is at the meeting. A walk that keeps arriving
 * and keeps leaving it outside is given up after three goes: it stays where it stands.
 *
 * What a job needs is the job's to say (see Job.needs). How it is asked for is the same for all.
 */
import { answersTo, departmentHeadedBy } from '../hierarchy';
import { addTask, finishTask, placeNamedIn, stillIn } from '../tasks';
import type {
  Action,
  NpcBrain,
  PersonInView,
  Plan,
  SenseEvent,
  Task,
} from '../types';
import { jobFor } from './index';
import { KEPT_AWAY } from './security';
import {
  needWords,
  noteReported,
  readReport,
  reportWords,
  WORDINGS,
  workSince,
  workWords,
} from './reports';

/** Being at a staff meeting its head has called. The task's place is the room. */
const MEETING = 'meeting';
/** How long (deciseconds) a call to a meeting stands. After that it is over, whoever came. */
const SUMMONS_STANDS_DS = 4200;
/** How many walks to the room may come to nothing before it takes it that it cannot get in. */
const WALK_TRIES = 2;
/** How long (deciseconds) after giving its report it stays in a room its head has left, the end of the meeting unheard. */
const HEAD_GONE_DS = 450;
/** How far off (tiles) its head has to be standing before it walks up to them. */
const WALK_UP_BEYOND = 2;
/** How many times it walks up to its head at one meeting, and how long (deciseconds) between. */
const WALK_UPS_MAX = 2;
const WALK_UP_AGAIN_DS = 150;
/** How long (deciseconds) after telling its head what it needs before it tells them again. */
const TELL_AGAIN_DS = 4800;
/** How the server words what a body is doing while it has hold of a crate. That is finished before it goes to a meeting. */
const HAULING = /^hauling\b/i;
/** The words that mark a PDA message as a call to a meeting: how a head's call begins, and nothing said in passing. */
const CALL_WORDS = /^staff meeting in the\b/i;
/** How a head tells someone by PDA that a meeting it was called to is over: see endMeeting in jobs/head.ts. */
const OVER_BY_PDA_WORDS = /\bthe staff meeting is over\. Send me your report\b/i;
/**
 * How a head calls a meeting aloud, to its staff's faces, where nothing between them goes by PDA.
 * Said word for word, and known by how it begins: nothing a head might say in passing begins so.
 */
export function aloudCall(room: string): string {
  return `Staff meeting in the ${room} now, please. Gather round and have your reports ready.`;
}
export const ALOUD_CALL_WORDS = /^staff meeting in the .+? now, please\b/i;
/** The words by which a head calls on one of its staff, by name, for their report. */
const CALLED_ON_WORDS = /\breport\b/i;
/** The words by which a head says the meeting is over, out loud or by PDA. */
export const OVER_WORDS = /\bmeeting is over\b/i;
/**
 * The words by which someone tells a head to call its staff together: "hold a meeting", "find out
 * how your section is doing". Not the same order as being sent to look at a room, though both may
 * begin "find out": this one names no room, and is about people.
 */
const MEETING_ORDER_WORDS =
  /\b(hold|call|have|run|convene|get)\b[^.?!]*\bmeeting\b|\bhow\b[^.?!]*\b(section|department|staff|team|people|janitors|lot)\b[^.?!]*\b(doing|getting on|going|coping|managing)\b|\b(check|check in|look in) (on|with) your (section|department|staff|team|people|janitors)\b/i;
/** The plain words it asks its head for something in, by which that line is known afterwards. */
const ASKING_HEAD = 'could you get it ordered';
/** How a message begins that says it is coming to a meeting, or will when it can. A head knows the message by them. */
const COMING = 'On my way to the';
const HELD_UP = 'I am shut in the';
const HERE = 'I am in the';
export const COMING_WORDS =
  /^on my way to the|\bwill come to the\b|^i am in the .* already\b/i;
/** How a message begins that gives its report because it could not come to the meeting, or missed it. */
const SHUT_OUT = 'I could not get into';
const MISSED = 'Sorry I missed the meeting.';

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** The head this NPC answers to who is in view, if one is. */
function headInView(brain: NpcBrain): PersonInView | undefined {
  return brain.peopleInView.find(
    (person) => !!person.superior || answersTo(brain.job, person.job),
  );
}

/** The name of the head this NPC answers to, if it knows of one aboard: in view, or on its PDA. */
export function headName(brain: NpcBrain): string | null {
  const seen = headInView(brain);
  if (seen) {
    return seen.name;
  }
  // Its own head before the Captain: the Captain has a station to run.
  const listed = brain.pdaPeople
    .filter((person) => answersTo(brain.job, person.job))
    .sort(
      (a, b) => Number(/captain/i.test(a.job)) - Number(/captain/i.test(b.job)),
    );
  return listed[0]?.name ?? null;
}

/** TRUE if someone with that job is this NPC's own head: one it answers to that is not the Captain. */
function isOwnHead(brain: NpcBrain, job: string): boolean {
  return answersTo(brain.job, job) && !/captain/i.test(job);
}

/**
 * Who to ask for what it needs: its own head, in view and then on its PDA, and only with no head
 * of its own aboard whoever else it answers to (the Captain), as headName finds them.
 */
function ownHeadName(brain: NpcBrain): string | null {
  return (
    brain.peopleInView.find((person) => isOwnHead(brain, person.job))?.name ??
    brain.pdaPeople.find((person) => isOwnHead(brain, person.job))?.name ??
    headName(brain)
  );
}

/**
 * TRUE if these words, said or sent to a head by someone it answers to, tell it to call its staff
 * together. Only a head with staff can be told to.
 */
export function isMeetingOrder(brain: NpcBrain, heard: string): boolean {
  return (
    (departmentHeadedBy(brain.job)?.jobs.length ?? 0) > 0 &&
    !/captain/i.test(brain.job) &&
    MEETING_ORDER_WORDS.test(heard)
  );
}

/**
 * TRUE if it has got to the meeting it was called to. It is in the room, or was until a moment
 * ago. Or the server has told it that it arrived and its head is in view: it can hear and be
 * heard from there, whichever side of the doorway its feet are. Or it has given up walking in.
 */
function atMeeting(
  brain: NpcBrain,
  summons: NonNullable<NpcBrain['summons']>,
): boolean {
  return (
    stillIn(brain, summons.room) ||
    !!summons.fromHere ||
    (summons.toldArrivedAt !== null &&
      brain.peopleInView.some((person) => person.name === summons.by))
  );
}

/**
 * TRUE while an NPC is at a staff meeting that is under way: it is there with the head who
 * called it, or it is that head. Talk there is kept to the meeting: one at a time, and to the point.
 */
export function inMeeting(brain: NpcBrain): boolean {
  const summons = brain.summons;
  // Called on for its report, it is in the meeting as far as talk goes, even if it is still
  // coming in at the door: what it says next is its report, not a hello to whoever called on it.
  if (summons && summons.askedAt !== null && !summons.said) {
    return true;
  }
  if (
    summons &&
    atMeeting(brain, summons) &&
    brain.peopleInView.some((person) => person.name === summons.by)
  ) {
    return true;
  }
  return (
    !!brain.meeting &&
    (stillIn(brain, brain.meeting.room) || !!brain.meeting.fromHere)
  );
}

/**
 * What the LLM should know about a meeting it has been called to, so that what it says is true:
 * it is on its way, or it is standing there waiting, and either way it is not at its other work.
 */
export function meetingCues(brain: NpcBrain): string[] {
  const summons = brain.summons;
  if (!summons || summons.shutOut || summons.missed) {
    return [];
  }
  return [
    atMeeting(brain, summons)
      ? `You are at ${summons.by}'s staff meeting in the ${summons.room}. You are standing still and waiting, not working: you are not cleaning, tidying or carrying anything just now, and your other work waits until the meeting is over.`
      : `${summons.by} has called a staff meeting in the ${summons.room}, and you are going to it. Your other work waits until the meeting is over.`,
  ];
}

/**
 * Telling its head what it needs for its work: out loud if the head is there, by PDA if not. Told
 * once, and then it waits to hear, and tells them again only after a good while.
 */
export function needStep(brain: NpcBrain, need: string): Plan {
  const head = ownHeadName(brain);
  if (!head) {
    return {
      ready: false,
      step: `You need ${need}, and there is nobody over you aboard to ask for it.`,
    };
  }
  if (
    brain.toldHeadAt !== null &&
    brain.now - brain.toldHeadAt < TELL_AGAIN_DS
  ) {
    return {
      ready: false,
      step: `You need ${need}. You have told ${head}, and are waiting to hear that it has come.`,
    };
  }
  const first = firstName(head);
  if (brain.peopleInView.some((person) => person.name === head)) {
    return {
      ready: true,
      step: `You need ${need}. ${head}, who you answer to, is here: in "say", tell ${head} what you need and ask them to get it ordered. Cargo only takes orders from heads of department.`,
      say: `${first}, I need ${need} for my work. C${ASKING_HEAD.slice(1)}, please?`,
      needs: new RegExp(`\\b${first}\\b`, 'i'),
    };
  }
  if (!brain.hasPda) {
    return {
      ready: false,
      step: `You need ${need}. ${head} is who to ask, and they are not here.`,
    };
  }
  return {
    ready: true,
    step: `You need ${need}. Cargo only takes orders from heads of department, so you are sending ${head}, who you answer to, a PDA message asking for it.`,
    act: {
      tool: 'message',
      person: head,
      text: `I need ${need} for my work. C${ASKING_HEAD.slice(1)}, please?`,
    },
  };
}

/** A call to a meeting, as it stands the moment it is read. */
function called(
  by: string,
  room: string,
  at: number,
): NonNullable<NpcBrain['summons']> {
  return {
    by,
    room,
    at,
    answered: false,
    arrivedAt: null,
    toldArrivedAt: null,
    walkUps: 0,
    walkedUpAt: null,
    headSeenAt: null,
    askedAt: null,
    said: false,
    tries: 0,
    wording: Math.floor(Math.random() * WORDINGS),
  };
}

/**
 * Reads a PDA message as word from its head about a staff meeting, if that is what it is: a call
 * to one, or word that one went ahead without it. Returns TRUE if it was.
 */
export function readSummons(
  brain: NpcBrain,
  from: string,
  text: string,
  at: number,
  job: string,
): boolean {
  if (!answersTo(brain.job, job)) {
    return false;
  }
  // The meeting is over and it was not there, or was not heard: its report goes by PDA instead.
  // Only as an answer to a call from them, or in a head's own words for it: anything else with
  // "meeting is over" in it is not about a meeting it was called to.
  if (
    OVER_WORDS.test(text) &&
    (brain.summons?.by === from || OVER_BY_PDA_WORDS.test(text))
  ) {
    const summons =
      brain.summons?.by === from
        ? brain.summons
        : called(from, placeNamedIn(brain, text.toLowerCase()) ?? '', at);
    if (summons.said) {
      summons.over = true;
    } else {
      summons.missed = true;
    }
    brain.summons = summons;
    return true;
  }
  // A head told by the Captain to hold a meeting is being given an order, not called to one.
  if (!CALL_WORDS.test(text.trim()) || isMeetingOrder(brain, text)) {
    return false;
  }
  const room = placeNamedIn(brain, text.toLowerCase());
  if (!room) {
    return false;
  }
  brain.summons = called(from, room, at);
  return true;
}

/** Keeps the meeting task true to whether it has been called to one, and whether that one is over for it. */
export function syncMeetings(brain: NpcBrain): void {
  const summons = brain.summons;
  // Its own work may be something it cannot leave: an officer with the person it is after in
  // sight does not walk off to a meeting. It sends its report by PDA and stays at its work.
  const kept =
    summons && !summons.said
      ? (jobFor(brain.job).keptFromMeeting?.(brain) ?? null)
      : null;
  if (summons && kept) {
    summons.shutOut = true;
    summons.kept = kept;
  }
  if (summons) {
    const there = atMeeting(brain, summons);
    if (there) {
      summons.arrivedAt ??= brain.now;
      if (brain.peopleInView.some((person) => person.name === summons.by)) {
        summons.headSeenAt = brain.now;
      }
    }
    // Its report has gone by PDA: there is nothing left to stay for. A meeting that was called
    // aloud has no report by PDA: one it could not get to is simply missed.
    const sentWord =
      (summons.said || !!summons.aloud) &&
      (!!summons.shutOut || !!summons.missed);
    // Its head has heard it and left, and it did not hear the meeting ended.
    const headGone =
      summons.said &&
      there &&
      summons.headSeenAt !== null &&
      brain.now - summons.headSeenAt > HEAD_GONE_DS;
    if (
      summons.over ||
      sentWord ||
      headGone ||
      brain.now - summons.at > SUMMONS_STANDS_DS
    ) {
      brain.summons = null;
    }
  }
  const task = brain.tasks.find(
    (it) => it.kind === MEETING && it.state !== 'done',
  );
  if (brain.summons && !task) {
    // A call from its head is an order: it comes before whatever else it was doing.
    addTask(brain, {
      kind: MEETING,
      place: brain.summons.room || undefined,
      urgency: 'emergency',
      source: 'told',
    });
  } else if (!brain.summons && task) {
    finishTask(brain, task);
  }
}

/** Its report as it gives it at the meeting, to its head by name. */
function spokenReport(
  brain: NpcBrain,
  summons: NonNullable<NpcBrain['summons']>,
): string {
  const job = jobFor(brain.job);
  const need = job.needs?.(brain) ?? job.lacks?.(brain) ?? null;
  return `${firstName(summons.by)}, ${workWords(workSince(brain, job.reports), summons.wording)}. ${needWords(need)}`;
}

/** What being called to a meeting comes down to right now, or null if the task is not that. */
export function planMeetings(brain: NpcBrain, task: Task): Plan | null {
  const summons = brain.summons;
  if (task.kind !== MEETING || !summons) {
    return null;
  }
  const by = summons.by;
  const room = summons.room;
  // It could not get into the room, or the meeting went ahead without it. Its head still hears
  // its report: by PDA.
  if ((summons.shutOut || summons.missed) && !summons.said) {
    if (!brain.hasPda) {
      return {
        ready: false,
        step: `You could not be at ${by}'s staff meeting, and have no PDA to send your report by.`,
      };
    }
    const job = jobFor(brain.job);
    const need = job.needs?.(brain) ?? job.lacks?.(brain) ?? null;
    const report = reportWords(brain, need, summons.wording, job.reports);
    return {
      ready: true,
      step: summons.missed
        ? `${by}'s staff meeting went ahead without you. You are sending ${by} your report by PDA instead: what you have done, and what you need.`
        : summons.kept
          ? `${by} has called a staff meeting in the ${room}, and you cannot leave what you are doing: ${summons.kept}. You are sending ${by} your report by PDA instead, and staying at your work.`
          : `${by} has called a staff meeting in the ${room}, and you cannot get in there. You are sending ${by} your report by PDA instead: what you have done, and what you need.`,
      act: {
        tool: 'message',
        person: by,
        text: summons.missed
          ? `${MISSED} ${report}`
          : summons.kept
            ? `${KEPT_AWAY}: ${summons.kept}. ${report}`
            : `${SHUT_OUT} the ${room} for the meeting. ${report}`,
      },
    };
  }
  // First of all it sends word back, so that its head knows who to wait for.
  if (!summons.answered && brain.hasPda) {
    return {
      ready: true,
      step: `${by} has called a staff meeting in the ${room}. You are sending ${by} a PDA message to say you are coming.`,
      act: {
        tool: 'message',
        person: by,
        text: brain.shutIn
          ? `${HELD_UP} ${brain.location}. I will come to the ${room} as soon as I am let out.`
          : brain.location === room
            ? `${HERE} ${room} already.`
            : `${COMING} ${room}.`,
      },
    };
  }
  if (!atMeeting(brain, summons)) {
    // A crate let go of halfway is a crate left in a hallway. It is set down where it is going first.
    if (brain.doing && HAULING.test(brain.doing)) {
      return {
        ready: false,
        step: `${by} has called a staff meeting in the ${room}. You will go the moment you have set down what you are hauling.`,
      };
    }
    return {
      ready: true,
      step: `${by} has called a staff meeting in the ${room}. That comes before everything else, and you are on your way there.`,
      act: { tool: 'go_to', place: room },
    };
  }
  if (summons.said) {
    return {
      ready: false,
      wait: true,
      // Only once it is in the room: stepping clear of the door on the far side of it is stepping away.
      inside: brain.location === room,
      step: `You have given ${by} your report, and are staying at the staff meeting until ${by} says it is over.`,
    };
  }
  // One at a time: it speaks when its head calls on it by name, and not before. Called on, it
  // answers whether or not it can pick its head out: a voice is known even when a face is hidden.
  if (summons.askedAt !== null) {
    const line = spokenReport(brain, summons);
    return {
      ready: true,
      step: `${by} has called on you for your report. Your body is giving it now, in these words: "${line}"`,
      say: line,
      exact: true,
    };
  }
  // People at a meeting stand round whoever called it, not strung out from the door. Its head
  // has a place to stand that is well inside the room, so walking up to them ends there too.
  const head = brain.peopleInView.find((person) => person.name === by);
  if (
    head &&
    head.place === room &&
    (head.distance ?? 0) > WALK_UP_BEYOND &&
    summons.walkUps < WALK_UPS_MAX &&
    (summons.walkedUpAt === null ||
      brain.now - summons.walkedUpAt > WALK_UP_AGAIN_DS)
  ) {
    return {
      ready: true,
      step: `You are at the staff meeting in the ${room}, and ${by} is here. You are walking up to ${by}, to stand with the others.`,
      act: { tool: 'approach', person: head.handle },
    };
  }
  // In the room already when it was called, and its head nowhere in sight: it goes to the middle
  // of the room, which is where its head goes to stand. Two technicians at their counter and a
  // Quartermaster by its office door stood in one bay for three minutes, out of each other's sight.
  // Once only: a walk there that came to nothing, or that nothing was heard of, is not asked for
  // again. Held back by the driver, it would leave the body free to go off to its other work.
  const triedMiddle = brain.failures.has(
    `${task.id}:${JSON.stringify({ tool: 'go_to', place: room, middle: true })}`,
  );
  if (
    !head &&
    brain.location === room &&
    !summons.wentIn &&
    !summons.said &&
    !triedMiddle
  ) {
    return {
      ready: true,
      step: `You are in the ${room} for the staff meeting and cannot see ${by} from where you stand. You are going to the middle of the room to find them.`,
      act: { tool: 'go_to', place: room, middle: true },
    };
  }
  // In the room and its head nowhere in sight: a big room, and it has stopped just inside the
  // door. The others of its own trade it can see are standing round whoever called the meeting,
  // so it goes and stands with them. A janitor that stayed by the door of the Bar Lounge, seven
  // tiles from the rest, was never seen by its head and was put down as absent.
  const fellow = head
    ? undefined
    : brain.peopleInView.find(
        (person) =>
          person.place === room &&
          person.job === brain.job &&
          (person.distance ?? 0) > WALK_UP_BEYOND,
      );
  if (
    fellow &&
    brain.location === room &&
    summons.walkUps < WALK_UPS_MAX &&
    (summons.walkedUpAt === null ||
      brain.now - summons.walkedUpAt > WALK_UP_AGAIN_DS)
  ) {
    return {
      ready: true,
      step: `You are in the ${room} for the staff meeting and cannot see ${by} from where you stand, but ${fellow.name} is here. You are walking up to ${fellow.name}, to stand with the others.`,
      act: { tool: 'approach', person: fellow.handle },
    };
  }
  return {
    ready: false,
    wait: true,
    // Only once it is in the room: stepping clear of the door on the far side of it is stepping away.
    inside: brain.location === room,
    step: head
      ? `You are at the staff meeting in the ${room}, waiting for ${by} to call on you for your report. Until then you say nothing.`
      : `You are in the ${room} for the staff meeting, waiting for ${by}.`,
  };
}

/** Says the meeting task in a few words, or null if the task is not that. */
export function describeMeetings(task: Task): string | null {
  return task.kind === MEETING
    ? task.place
      ? `go to the staff meeting in the ${task.place}`
      : 'send your head the report you owe them'
    : null;
}

/** Follows what its head says at a meeting: being called on by name, and being told the meeting is over. */
export function meetingsOverhear(brain: NpcBrain, event: SenseEvent): void {
  const heard = String(event.details.message ?? '');
  const speaker = String(event.details.speaker ?? '');
  // Its head calling a meeting aloud, where it stands. It has heard the call, so it sends no word
  // back: it goes and stands with the rest.
  if (
    ALOUD_CALL_WORDS.test(heard.trim()) &&
    brain.summons?.by !== speaker
  ) {
    const theirJob =
      brain.peopleInView.find((person) => person.name === speaker)?.job ??
      brain.pdaPeople.find((person) => person.name === speaker)?.job ??
      '';
    const room = placeNamedIn(brain, heard.toLowerCase());
    if (room && answersTo(brain.job, theirJob)) {
      brain.summons = {
        ...called(speaker, room, brain.now),
        answered: true,
        aloud: true,
      };
    }
    return;
  }
  // Called on by name for its report, by a head it answers to, with no meeting it knows of. The
  // call went unheard: it was said across a room, or before it came in. Being called on is word
  // enough that there is a meeting and it is at it. It gives its report from where it stands.
  // Left to the call alone, two technicians stood through a whole meeting and reported nothing.
  if (
    !brain.summons &&
    new RegExp(`\\b${firstName(brain.name)}\\b.*\\byour report\\b`, 'i').test(heard)
  ) {
    const head = brain.peopleInView.find((person) => person.name === speaker);
    const theirJob =
      head?.job ??
      brain.pdaPeople.find((person) => person.name === speaker)?.job ??
      '';
    if (answersTo(brain.job, theirJob)) {
      brain.summons = {
        ...called(speaker, head?.place ?? brain.location, brain.now),
        answered: true,
        aloud: true,
        fromHere: true,
        askedAt: brain.now,
      };
    }
    return;
  }
  const summons = brain.summons;
  // Whatever it hears its head say about the meeting counts, wherever it is standing when it
  // hears it: called on while still coming through the door, it has still been called on.
  if (!summons || speaker !== summons.by) {
    return;
  }
  if (OVER_WORDS.test(heard)) {
    summons.over = true;
    return;
  }
  if (
    summons.askedAt === null &&
    CALLED_ON_WORDS.test(heard) &&
    new RegExp(`\\b${firstName(brain.name)}\\b`, 'i').test(heard)
  ) {
    summons.askedAt = brain.now;
  }
}

/** Notes that a report has been given: what it told of is told, and its head knows what it needs. */
function noteGiven(brain: NpcBrain, report: string): void {
  if (brain.summons) {
    brain.summons.said = true;
  }
  noteReported(brain, report);
  if (readReport(report)?.need) {
    brain.toldHeadAt = brain.now;
  }
}

/** Notes what it has just said, when it was what a meeting or a need called for. */
export function meetingsAfterSaying(
  brain: NpcBrain,
  called: string | null,
): void {
  if (!called) {
    return;
  }
  const summons = brain.summons;
  if (
    summons &&
    !summons.said &&
    summons.askedAt !== null &&
    atMeeting(brain, summons) &&
    called.startsWith(`${firstName(summons.by)}, `) &&
    readReport(called)
  ) {
    noteGiven(brain, called);
  }
  if (called.toLowerCase().includes(ASKING_HEAD)) {
    brain.toldHeadAt = brain.now;
  }
}

/** Notes how a step of going to a meeting went, and any PDA message it has sent its head. */
export function meetingsAfterActing(
  brain: NpcBrain,
  act: Action,
  ok: boolean,
  looped = false,
): void {
  const summons = brain.summons;
  const text = act.tool === 'message' ? String(act.text ?? '') : '';
  // The server says the walk to the meeting got there. That stands, even if the body is found a
  // tile outside the room a moment later. And if that walk has now arrived three times running,
  // walking is not what is wrong: it stays where it stands and takes that for being there.
  if (summons && ok && act.tool === 'go_to' && act.place === summons.room) {
    summons.toldArrivedAt = brain.now;
    if (looped) {
      summons.fromHere = true;
    }
  }
  // It has been to the middle of the room, or tried to: once is all.
  if (summons && act.tool === 'go_to' && act.place === summons.room && act.middle) {
    summons.wentIn = true;
  }
  // It walks up to its head a time or two, and that is all, however that went.
  if (summons && act.tool === 'approach') {
    summons.walkUps++;
    summons.walkedUpAt = brain.now;
  }
  // The walk to the meeting came to nothing. Shut in where it stands, that says nothing about the
  // room it was going to. Otherwise it is tried once more before the room is taken to be shut to it.
  if (
    summons &&
    !ok &&
    act.tool === 'go_to' &&
    act.place === summons.room &&
    // In the room already, a walk to its middle that came to nothing does not mean it is shut out.
    brain.location !== summons.room &&
    !brain.shutIn
  ) {
    summons.tries++;
    if (summons.tries >= WALK_TRIES) {
      summons.shutOut = true;
    }
  }
  // Word that it is coming is sent once, whether or not it got through.
  if (
    summons &&
    [COMING, HELD_UP, HERE].some((words) => text.startsWith(words))
  ) {
    summons.answered = true;
  }
  // Its report, sent because it could not be there.
  if (
    summons &&
    ok &&
    (text.startsWith(SHUT_OUT) ||
      text.startsWith(MISSED) ||
      text.startsWith(KEPT_AWAY))
  ) {
    noteGiven(brain, text);
  }
  if (ok && text.toLowerCase().includes(ASKING_HEAD)) {
    brain.toldHeadAt = brain.now;
  }
}
