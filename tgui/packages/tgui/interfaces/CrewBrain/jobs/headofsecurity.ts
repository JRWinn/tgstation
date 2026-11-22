/**
 * The Head of Security: head of the security staff. It keeps the list of who is wanted.
 *
 * - The Captain and the heads of department declare warrants to it, by PDA or to its face. It
 *   keeps the list, sends every other head the notice, gives each warrant to its officer, takes
 *   word of sightings and passes the newest on, and tells the Captain how each warrant went. All
 *   of that is jobs/desk.ts.
 * - It delegates. It makes no arrest itself while it has an officer fit to send. With no officer
 *   aboard, or its officer hurt, it serves the warrants with its own hands (jobs/arrests.ts).
 * - It holds a staff meeting in the Security Office, called aloud, thirty seconds into the shift
 *   and every ten minutes after, with the same steps as every other head's (MeetingWay in
 *   jobs/head.ts). It closes with who is still wanted, and sends the Captain a report of it.
 * - When its officer tells it how a warrant went it answers, by name, "I have that". The officer
 *   does not count its word as passed on until it hears that.
 *
 * All of that is code. The LLM answers people in its voice.
 */
import { answersTo } from '../hierarchy';
import { addTask, findTask, finishTask } from '../tasks';
import type { NpcBrain, Plan, SenseEvent, Task } from '../types';
import {
  beatAfterActing,
  beatAfterSaying,
  beatCues,
  beatOf,
  describeBeat,
  planBeat,
  stuckInCuffsAsk,
  syncBeat,
  warrantTalk,
} from './arrests';
import {
  describeDesk,
  deskAfterActing,
  deskAfterSaying,
  deskCues,
  deskHears,
  deskOf,
  deskUnread,
  deskTakes,
  inTheCells,
  leadIsFresh,
  planDesk,
  stillWanted,
  syncDesk,
} from './desk';
import {
  answerSentAsk,
  hearReport,
  MEET,
  type Meeting,
  type MeetingWay,
  meetingActed,
  meetingSaid,
  meetStep,
  noteSaidSending,
  noteSending,
  staffMeetingWord,
  syncMeeting,
  workReported,
} from './head';
import { forcingReads } from './forcing';
import type { Job } from './job';
import { isMeetingOrder } from './meetings';
import { addCounts, readReport, totalWords } from './reports';
import { isHeadOfSecurity, isOfficer, KEPT_AWAY } from './security';

/**
 * How a report begins that an officer sends by PDA because it was after someone and could not be
 * at the meeting. The other reports by PDA are read by staffMeetingWord (KNB-09).
 */
const REPORT_BY_PDA = new RegExp(`^${KEPT_AWAY}`, 'i');

/** Going back to its office when there is nothing else to see to. */
const OFFICE = 'security_office';
/** How long (deciseconds) into the shift its first staff meeting is called. */
const FIRST_MEETING_DS = 300;
/** The most characters a body can say at once, or send in one PDA message. */
const SAID_MAX = 200;

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** What it says to end a staff meeting: the arrests made, who is still wanted, and that the meeting is over. */
function closing(brain: NpcBrain, meeting: Meeting): string {
  const work = totalWords(workReported(brain, meeting));
  const wanted = stillWanted(brain) || 'Nobody is wanted.';
  const over = 'The meeting is over, thank you.';
  return (
    [
      `${work ? `That is ${work}. ` : ''}${wanted} ${over}`,
      `${wanted} ${over}`,
    ].find((line) => line.length <= SAID_MAX) ?? over
  );
}

/** Its report to the Captain of a staff meeting that is over: who came, the arrests made, who is wanted and who is in the cells. */
function report(brain: NpcBrain, meeting: Meeting): string {
  const work = totalWords(workReported(brain, meeting));
  const came = `Security staff meeting: ${meeting.turns.length} of ${meeting.invited.length} there.`;
  const wanted = stillWanted(brain) || 'Nobody is wanted.';
  const cells = inTheCells(brain);
  return (
    [
      `${came}${work ? ` Since the last one: ${work}.` : ''} ${wanted}${cells ? ` ${cells}` : ''}`,
      `${came} ${wanted}${cells ? ` ${cells}` : ''}`,
      `${came} ${wanted}`,
    ].find((line) => line.length <= SAID_MAX) ?? came
  );
}

/** How the Head of Security holds its staff meeting: in the Security Office, where its staff work, called aloud. */
const SECURITY_WAY: MeetingWay = {
  room: (brain) => brain.staffPost,
  aloud: true,
  firstAt: FIRST_MEETING_DS,
  closing,
  report,
};

/** Keeps the Head of Security's tasks true to the list, to its own legwork and to the time. */
function syncTasks(brain: NpcBrain): void {
  syncDesk(brain);
  // Its own hands: only when it has a warrant with nobody to give it to.
  const legwork = syncBeat(brain, false);
  const pressing = brain.tasks.some(
    (task) => task.state !== 'done' && task.urgency === 'emergency',
  );
  // Its staff meeting. Not called while it has someone by the arm, or in sight to arrest, and
  // not while its officer is out on a fresh lead: a call to a meeting would bring it back in.
  syncMeeting(brain, SECURITY_WAY, pressing || leadIsFresh(brain));
  // Between errands it goes back to its office. That is where people expect to find it.
  const away =
    !!brain.office &&
    brain.location !== brain.office &&
    !brain.shutIn &&
    !legwork;
  const back = findTask(brain, OFFICE);
  if (away && !back) {
    addTask(brain, { kind: OFFICE, urgency: 'routine', source: 'own' });
  } else if (!away && back) {
    finishTask(brain, back);
  }
}

function plan(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === MEET) {
    return meetStep(brain, SECURITY_WAY);
  }
  if (task.kind === OFFICE) {
    return brain.office && brain.toTell.length === 0
      ? {
          ready: true,
          step: `You have nothing to see to just now, and are going back to your office, the ${brain.office}.`,
          act: { tool: 'go_to', place: brain.office },
        }
      : { ready: false, step: 'You are staying where you are for now.' };
  }
  return planDesk(brain, task) ?? planBeat(brain, task);
}

function describeTask(task: Task): string | null {
  if (task.kind === MEET) {
    return 'hold the security staff meeting';
  }
  if (task.kind === OFFICE) {
    return 'go back to your office';
  }
  return describeDesk(task) ?? describeBeat(task);
}

/** What the LLM should know about where things stand, so that what it says about them is true. */
function cues(brain: NpcBrain): string[] {
  const lines: string[] = [];
  const meeting = brain.meeting;
  if (meeting) {
    lines.push(
      meeting.startedAt === null
        ? `You have called a staff meeting in the ${meeting.room}, and it has not begun yet.`
        : `You are holding a staff meeting in the ${meeting.room}. Your staff speak one at a time, when you call on them by name.`,
    );
  }
  lines.push(...deskCues(brain));
  if (beatOf(brain).warrants.length > 0) {
    lines.push(...beatCues(brain));
  }
  return lines;
}

export const HEAD_OF_SECURITY: Job = {
  is: isHeadOfSecurity,
  // It has an office and its staff to see to. It does not wander the station.
  keepsPost: true,
  cleans: false,
  about: () =>
    'You are the Head of Security, the head of the security staff: the security officers answer to you, and you answer to the Captain. You keep the list of who is wanted. The Captain and the heads of department declare warrants to you, you give each one to your officer to serve, and you tell the Captain how it went. Only the Captain can pardon anyone. You hold a short staff meeting with your officers now and then. You delegate: you make an arrest yourself only when you have no officer fit to send.',
  whenAsked: (brain, heard) => [
    'A warrant, a pardon, or word of where someone wanted is: your body takes it and answers it in so many words, at once. Add nothing of your own about who is wanted, what for, or how long: that is told to you here, and you never say more about it than that.',
    'There are no written laws yet. You act on warrants the Captain or a head of department declares, and on nothing else: asked to arrest someone by anyone else, say that it is for their head to declare.',
    'You cannot follow anyone about. Told to follow someone, say plainly that you cannot.',
    ...(isMeetingOrder(brain, heard)
      ? [
          brain.meeting && !brain.meeting.orderedBy
            ? 'You have just been told to find out how your staff are doing. You have a staff meeting on already: say so, and that your report will follow it.'
            : 'You have just been told to find out how your staff are doing. Your body is calling a staff meeting for that now: say that you are calling one, and that your report will follow it.',
        ]
      : []),
  ],
  cues,
  syncTasks,
  plan,
  describeTask,
  // A warrant, a pardon or a sighting sent by PDA, word from its officer, or the Captain telling
  // it to find out how its staff are doing.
  readsMessage: (brain, from, text, at, job) => {
    // A keeper asking whether it sent someone to a room: a yes or a no, never "noted" (SECT-08 B).
    if (answerSentAsk(brain, from, text, true)) {
      return;
    }
    // Word from engineering about a door it asked to have forced.
    if (forcingReads(brain, from, job, text)) {
      return;
    }
    // A crew member stuck in handcuffs: security takes them off (SEC-07).
    if (stuckInCuffsAsk(brain, from, text)) {
      return;
    }
    // An officer's "On my way" to its meeting, or its report sent by PDA because it could not be
    // there (shut out of the room, or missed it), read as every head reads them (KNB-09).
    if (staffMeetingWord(brain, from, text, at)) {
      return;
    }
    if (deskTakes(brain, from, job, text, false)) {
      return;
    }
    // Its officer's report sent because it was after someone and not to be called off (KEPT_AWAY,
    // which only security staff send). During a meeting it counts as given. After one, the work
    // in it goes into the next one's count.
    if (isOfficer(job)) {
      const report = REPORT_BY_PDA.test(text) ? readReport(text) : null;
      if (report && brain.meeting) {
        brain.meeting.reports[from] = report;
        brain.meeting.answers[from] = 'cannot';
      } else if (report) {
        addCounts(brain.lateWork, report.counts);
      }
      return;
    }
    if (answersTo(brain.job, job) && isMeetingOrder(brain, text)) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = from;
      }
      return;
    }
    // Something from the Captain or a head that code can make nothing of goes to the LLM to
    // read, as the reader of last resort. If that comes to nothing it says so, with the words
    // that would have worked: nobody is left guessing.
    deskUnread(brain, from, job, text);
  },
  overhears: (brain, event: SenseEvent) => {
    const heard = String(event.details.message ?? '');
    const speaker = String(event.details.speaker ?? '');
    if (!speaker) {
      return;
    }
    // A keeper asking whether it sent someone to a room (SECT-08 B).
    if (
      event.details.said_to !== 'other' &&
      answerSentAsk(brain, speaker, heard, false)
    ) {
      return;
    }
    if (stuckInCuffsAsk(brain, speaker, heard)) {
      return;
    }
    // At its meeting, a report is a report, whoever's turn it is.
    if (isOfficer(jobOf(brain, speaker)) && hearReport(brain, speaker, heard)) {
      return;
    }
    if (deskHears(brain, event)) {
      return;
    }
    // Someone it answers to telling it to find out how its staff are doing: a meeting is called.
    if (
      event.details.said_to === 'me' &&
      brain.peopleInView.find((person) => person.name === speaker)?.superior &&
      isMeetingOrder(brain, heard) &&
      !brain.meeting
    ) {
      brain.meetingOrderedBy = speaker;
    }
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    meetingSaid(brain, called);
    // Whom a line of its sends where (SECT-08 B).
    noteSaidSending(brain, called);
    deskAfterSaying(brain, called);
    beatAfterSaying(brain, called);
  },
  // Nor does it talk of who is on its list with people it meets (KNA-32).
  vetsSay: (brain, text, to) =>
    warrantTalk(
      brain,
      text,
      to,
      deskOf(brain).warrants.map((warrant) => warrant.name),
    ),
  afterActing: (brain, act, task, ok, looped, details) => {
    meetingActed(brain, act, ok, looped);
    // Whom a PDA message of its sends where (SECT-08 B).
    if (ok && act.tool === 'message') {
      noteSending(brain, String(act.person ?? ''), String(act.text ?? ''));
    }
    deskAfterActing(brain, act, task, ok);
    beatAfterActing(brain, act, task, ok, details);
  },
};
