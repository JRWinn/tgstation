/**
 * The Head of Personnel: sees that the service staff have what they need, and knows how they are
 * getting on.
 *
 * Cargo takes orders from heads of department only, so the staff bring what they need to their
 * head, and the head puts one order in for all of it. To find out what is needed, and what has been
 * done, it holds a staff meeting: two minutes into the shift, every ten minutes after, and whenever
 * the Captain tells it to. A meeting goes like this:
 *
 * - it calls each of its staff by PDA, and sends the Captain word that it is holding one;
 * - each of them sends word back that they are coming, and it goes to the room and waits for them
 *   all, up to three minutes from the call, since someone may be lost on the way;
 * - it calls on each of those there by name, one at a time, and hears their report: the work they
 *   have done since the last meeting, and what they are short of;
 * - it sums up, says the meeting is over, and only then do they go;
 * - anyone who did not come is told so by PDA and sends their report the same way;
 * - the Captain is sent the whole of it.
 *
 * If anything is needed it then goes to the cargo counter, calls a technician by name, and asks
 * for all of it in one order. It never places an order itself: only cargo can.
 *
 * Cargo delivers nothing: its staff cannot get into the rooms the service staff work from. When
 * the order comes in, cargo sends the number on each crate's manifest, and the head sends one of
 * its staff for each crate, each in turn, with that number: to collect it at the counter, take it
 * to the room they work from, unpack it and bring the crate back. If cargo sends word that a crate
 * is still waiting, the next of them is sent for it. When a crate is unpacked, whoever asked is
 * told by PDA where their things are.
 *
 * All of that is code, the numbers included. The LLM puts the head's lines in its own voice, adds
 * a remark of its own to the ones that carry numbers, and answers people.
 */
import { answersTo, departmentHeadedBy } from '../hierarchy';
import { CARGO_LOBBY, knowsPlace } from '../memory';
import {
  addTask,
  findTask,
  finishTask,
  placeNamedIn,
  stillIn,
} from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';
import { isCargo } from './cargo';
import { isJanitor } from './janitor';
import type { Job } from './job';
import { COMING_WORDS, isMeetingOrder, OVER_WORDS } from './meetings';
import { sendForLine, UNPACKED_WORDS } from './pickups';
import { addCounts, capital, listed, readReport, totalWords } from './reports';

type Meeting = NonNullable<NpcBrain['meeting']>;
type Requisition = NonNullable<NpcBrain['requisition']>;

/** Calling the staff together, hearing their reports and what they need. */
const MEET = 'hold_meeting';
/** Putting the order in at the cargo counter, and seeing that those who asked hear when it comes. */
const REQUISITION = 'requisition';
/** Going back to its office when there is nothing else to see to. */
const OFFICE = 'back_to_office';

/** How long (deciseconds) into its shift the first meeting is called, and how long between meetings after. */
const FIRST_MEETING_DS = 1200;
const MEETING_EVERY_DS = 6000;
/** How long (deciseconds) after the call it counts on someone who has sent no word back. */
const WORD_BACK_DS = 900;
/** How long (deciseconds) after the call it waits for everyone before it begins with whoever is there. Someone may be lost on the way. */
const GATHER_MAX_DS = 1800;
/** How long (deciseconds) it waits for someone it has called on to give their report before it goes on to the next. */
const TURN_WAIT_DS = 450;
/** How long (deciseconds) a meeting may run in all before it is given up on. */
const MEETING_MAX_DS = 4200;
/** How long (deciseconds) something asked for outside a meeting waits, in case more is asked for, before it is ordered. */
const BATCH_DS = 1200;
/** How long (deciseconds) it waits at the counter for someone from cargo, and for word that an order has come. */
const COUNTER_WAIT_DS = 600;
const ORDER_OVERDUE_DS = 6000;
/** How long (deciseconds) it waits at the counter for cargo to answer an order before it asks again. */
const ANSWER_WAIT_DS = 300;
/** How many people one crate of supplies is good for. */
const PER_CRATE = 3;
/** The most crates of one kind it asks for at once. Cargo will not order more than this in one go. */
const CRATES_MAX = 4;
/** The most characters the server lets a body say at once, or send in one PDA message. Past that the end is cut off. */
const SAID_MAX = 200;

/** The plain words it calls on someone in, orders in, and tells the Captain of a meeting in, by which those lines are known afterwards. */
const CALLING_ON = 'your report, please';
const ORDERING = 'I need to order';
const HOLDING = 'holding a staff meeting';
/** The words that mark what one of its staff says or writes as asking for something for their work. */
const NEED_WORDS =
  /\bi need\b|\bwe need\b|nothing to clean with|could you get|get it ordered|\bsuppl(y|ies)\b|\bout of\b/i;
/** The words of someone saying they need nothing. */
const NO_NEED_WORDS =
  /nothing from me|need nothing|don'?t need|do not need|no,? thank/i;
/** The words by which cargo sends word that an order has come in, with the number of each crate. */
const ARRIVED_WORDS = /order has come in/i;
/** The words by which cargo sends word that crates of an order are still waiting to be collected. */
const STILL_WAITING_WORDS = /still waiting at cargo/i;
/** How a report begins that one of its staff sends by PDA because they were not at the meeting. */
const REPORT_BY_PDA = /^(I could not get into|Sorry I missed the meeting)/i;

/** What each kind of staff is sent when they are short, and the room they take it to when it comes: where they work from. */
const SUPPLIES = [
  {
    for: isJanitor,
    what: 'something to clean with',
    crate: 'Janitorial Supplies Crate',
    ordered: 'janitorial supplies',
    room: 'Custodial Closet',
  },
];

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** TRUE if this job title is the Head of Personnel. */
export function isHeadOfPersonnel(title: string): boolean {
  return /head of personnel/i.test(title);
}

/** The names of this head's staff, as far as its PDA lists them. */
function staff(brain: NpcBrain): { name: string; job: string }[] {
  const department = departmentHeadedBy(brain.job);
  if (!department) {
    return [];
  }
  return brain.pdaPeople.filter((person) =>
    department.jobs.some((job) =>
      person.job.toLowerCase().includes(job.toLowerCase()),
    ),
  );
}

/** The job of one of its staff, by name, as far as it can tell: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** The Captain's name, if there is one aboard that it knows of: in view, or on its PDA. */
function captainName(brain: NpcBrain): string | null {
  const isCaptain = (person: { job: string }) => /captain/i.test(person.job);
  return (
    brain.peopleInView.find(isCaptain)?.name ??
    brain.pdaPeople.find(isCaptain)?.name ??
    null
  );
}

/** Notes that one of its staff has asked for something, unless it has that noted already. */
function noteAsk(brain: NpcBrain, who: string, at: number): void {
  if (!staff(brain).some((person) => person.name === who)) {
    return;
  }
  if (brain.asks.some((ask) => ask.who === who && !ask.told)) {
    return;
  }
  const supply = SUPPLIES.find((it) => it.for(jobOf(brain, who)));
  if (supply) {
    brain.asks.push({
      who,
      what: supply.what,
      at,
      ordered: false,
      told: false,
    });
  }
}

/**
 * What is asked for and not yet ordered, as one order: for each kind of thing, the crate, how
 * many, where it is to go, and for whom. Everything goes in the one order.
 */
function orderFor(brain: NpcBrain): Requisition | null {
  const waiting = brain.asks.filter((ask) => !ask.ordered);
  const lines: Requisition['lines'] = [];
  for (const supply of SUPPLIES) {
    const people = waiting
      .filter((ask) => supply.for(jobOf(brain, ask.who)))
      .map((ask) => ask.who);
    if (people.length > 0) {
      lines.push({
        crate: supply.crate,
        what: supply.ordered,
        count: Math.min(CRATES_MAX, Math.ceil(people.length / PER_CRATE)),
        room: supply.room,
        people,
      });
    }
  }
  return lines.length > 0
    ? { lines, askedAt: null, heardBack: false, startedAt: brain.now }
    : null;
}

/** An order as it is said: "a crate of janitorial supplies", "2 crates of janitorial supplies and a crate of light bulbs". */
function orderWords(order: Requisition): string {
  return listed(
    order.lines.map(
      (line) =>
        `${line.count === 1 ? 'a crate' : `${line.count} crates`} of ${line.what}`,
    ),
  );
}

/** Everyone an order is for. */
function orderedFor(order: Requisition): string[] {
  return [...new Set(order.lines.flatMap((line) => line.people))];
}

/** The manifest numbers written in a message from cargo: "#12 and #13". */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/#(\d+)/g)].map((found) => Number(found[1]));
}

/**
 * The crates a message from cargo tells of: the manifest number of each, and what kind it is, if
 * the message says. An order of several kinds comes as "crates #12 and #13 (Janitorial Supplies
 * Crate); crate #14 (Replacement Lights)": each lot ends with what it is.
 */
function cratesIn(text: string): { number: number; kind?: string }[] {
  return text.split(';').flatMap((part) => {
    const kind = part.match(/\(([^)]+)\)/)?.[1];
    return numbersIn(part).map((number) => ({ number, kind }));
  });
}

/**
 * Sends one of its staff for a crate cargo is holding. Each takes a turn: those who asked for what
 * is in it first, then the rest of those it is for, and round again. Sent for a crate a second
 * time, because it is still waiting, it goes to the next of them and not the one who did not come.
 */
function sendFor(brain: NpcBrain, number: number, kind?: string): void {
  const before = brain.pickups.find((pickup) => pickup.number === number);
  const order = brain.requisition;
  const line =
    order?.lines.find((it) => it.crate === kind) ??
    (kind ? undefined : order?.lines[0]);
  const supply =
    SUPPLIES.find((it) => it.crate === kind) ??
    SUPPLIES.find((it) => it.ordered === (before?.what ?? line?.what)) ??
    SUPPLIES[0];
  // Those who are waiting on what is in it, in the order they asked.
  const askers = brain.asks
    .filter((ask) => ask.ordered && !ask.told)
    .map((ask) => ask.who);
  const able = staff(brain)
    .filter((person) => supply.for(person.job))
    .map((person) => person.name);
  const turns = [
    ...askers.filter((name) => able.includes(name)),
    ...able.filter((name) => !askers.includes(name)),
  ];
  if (turns.length === 0) {
    return;
  }
  let to = turns[brain.pickupTurn % turns.length];
  brain.pickupTurn++;
  if (before && to === before.to && turns.length > 1) {
    to = turns[brain.pickupTurn % turns.length];
    brain.pickupTurn++;
  }
  const room = before?.room ?? line?.room ?? supply.room;
  const what = before?.what ?? line?.what ?? supply.ordered;
  brain.pickups = brain.pickups.filter((pickup) => pickup.number !== number);
  brain.pickups.push({ number, to, room, what, at: brain.now });
  brain.toTell.push({
    to,
    line: sendForLine(to, number, what, room),
    why: before
      ? `Cargo says crate #${number} of ${what} is still waiting: ${before.to} has not collected it. You are sending ${to} a PDA message to go and collect it instead.`
      : `Cargo is holding crate #${number} of ${what} for you. You are sending ${to} a PDA message to go and collect it, take it to the ${room} and unpack it.`,
    byPda: true,
    at: Date.now(),
  });
}

/** TRUE if the head is where it holds this meeting: in the room, or pushed out of it a moment ago, or as near as it could get. */
function inPlace(brain: NpcBrain, meeting: Meeting): boolean {
  return stillIn(brain, meeting.room) || !!meeting.fromHere;
}

/**
 * Those of its staff who are at the meeting with it: in the room, or in its sight having sent
 * word that they were coming. Someone standing in the doorway is at the meeting, whichever side
 * of the line their feet are. Someone seen through a window who never said they would come is not.
 */
function present(brain: NpcBrain, meeting: Meeting): string[] {
  return staff(brain)
    .filter((person) =>
      brain.peopleInView.some(
        (seen) =>
          seen.name === person.name &&
          (seen.place === undefined ||
            seen.place === meeting.room ||
            meeting.answers[person.name] === 'coming'),
      ),
    )
    .map((person) => person.name);
}

/**
 * TRUE if it is still waiting for this one of its staff to come: they have said they are coming,
 * or they have said nothing yet and there has hardly been time.
 */
function awaited(brain: NpcBrain, meeting: Meeting, name: string): boolean {
  const answer = meeting.answers[name];
  if (answer === 'cannot' || meeting.reports[name]) {
    return false;
  }
  return answer === 'coming' || brain.now - meeting.calledAt < WORD_BACK_DS;
}

/** Who it calls on next: the first of those there it has not called on yet. Someone who comes in late gets their turn. */
function nextTurn(brain: NpcBrain, meeting: Meeting): string | undefined {
  return present(brain, meeting).find(
    (name) => !meeting.turns.some((turn) => turn.who === name),
  );
}

/** TRUE while it is still listening for the report of whoever it last called on. */
function listening(brain: NpcBrain, meeting: Meeting): boolean {
  const turn = meeting.turns.at(-1);
  return !!turn && !turn.heard && brain.now - turn.askedAt < TURN_WAIT_DS;
}

/** The work its staff have reported this meeting, added up, with anything sent in by PDA since the last. */
function workReported(
  brain: NpcBrain,
  meeting: Meeting,
): Record<string, number> {
  const totals = { ...brain.lateWork };
  for (const report of Object.values(meeting.reports)) {
    addCounts(totals, report.counts);
  }
  return totals;
}

/** How many of its staff are short of something it has yet to order. */
function needing(brain: NpcBrain): number {
  return new Set(brain.asks.filter((ask) => !ask.ordered).map((ask) => ask.who))
    .size;
}

/**
 * What it says to end the meeting: the work done between them, how many are short of something
 * and what it will order, and that the meeting is over. Said word for word: its staff go by the
 * last of it, and the numbers are not the LLM's to put in its own words.
 */
function closingLine(brain: NpcBrain, meeting: Meeting): string {
  const work = totalWords(workReported(brain, meeting));
  const order = orderFor(brain);
  const short = needing(brain);
  const done = work
    ? `Between you, that is ${work}.`
    : 'There is no work to count yet.';
  const needs = order
    ? `${short === 1 ? 'One of you needs' : `${short} of you need`} supplies: I will order ${orderWords(order)}.`
    : 'Nobody needs anything.';
  const over = 'The meeting is over, thank you.';
  // A body can only say so much at once, and what is cut off is the end, which is the part its
  // staff go by. So if it will not all fit, the work done is left for the Captain's report, and
  // failing that, what will be ordered.
  return (
    [
      `${done} ${needs} ${over}`,
      `${needs} ${over}`,
      `${short === 1 ? 'One of you needs' : `${short} of you need`} supplies, and I will see to it. ${over}`,
    ].find((line) => line.length <= SAID_MAX) ?? over
  );
}

/**
 * Its report to the Captain of a meeting that is over: who came, the work done, and what is being
 * ordered. A PDA message that runs long is cut off, so if it will not all fit, the least of it goes.
 */
function reportToCaptain(brain: NpcBrain, meeting: Meeting): string {
  const there = meeting.turns.length;
  const byPda = Object.keys(meeting.reports).filter(
    (name) => !meeting.turns.some((turn) => turn.who === name),
  ).length;
  const work = totalWords(workReported(brain, meeting));
  const order = orderFor(brain);
  const short = needing(brain);
  const came = `Staff meeting in the ${meeting.room}: ${there} of ${meeting.invited.length} there${byPda > 0 ? `, ${byPda} reported by PDA` : ''}.`;
  const done = work ? `${work}.` : 'No work to count yet.';
  const needs = order
    ? `${short} short of supplies: I am ordering ${orderWords(order)}.`
    : 'Nothing needed.';
  return (
    [
      `${came} ${work ? `Since the last one: ${done}` : done} ${needs}`,
      `${came} ${capital(done)} ${needs}`,
      `Staff meeting held, ${there} of ${meeting.invited.length} there. ${capital(done)} ${needs}`,
    ].find((line) => line.length <= SAID_MAX) ?? `${came} ${needs}`
  );
}

/**
 * Ends the meeting: whoever did not come is told to send their report, the Captain is sent the
 * whole of it, and the next one is ten minutes off.
 */
function endMeeting(brain: NpcBrain): void {
  const meeting = brain.meeting;
  if (!meeting) {
    return;
  }
  // Called and not heard from: they send their report by PDA, and are told so the same way.
  for (const name of meeting.invited) {
    if (!meeting.reports[name]) {
      brain.toTell.push({
        to: name,
        line: `${firstName(name)}, the staff meeting is over. Send me your report by PDA, please.`,
        why: `${name} was called to the staff meeting and you have not had their report. You are sending ${name} a PDA message to say the meeting is over and to send it.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }
  const captain = captainName(brain);
  if (captain) {
    brain.toTell.push({
      to: captain,
      line: reportToCaptain(brain, meeting),
      why: `The staff meeting is over. You are sending ${captain}, the Captain, a PDA message with your report of it.`,
      byPda: true,
      at: Date.now(),
    });
  }
  brain.lateWork = {};
  brain.meeting = null;
  brain.metOnce = true;
  brain.nextMeetingAt = brain.now + MEETING_EVERY_DS;
}

/** Keeps the head's meetings and orders true to the time, to what has been asked for, and to what has come. */
function syncTasks(brain: NpcBrain): void {
  const people = staff(brain);
  if (brain.nextMeetingAt === 0) {
    brain.nextMeetingAt = brain.bornAt + FIRST_MEETING_DS;
  }
  // Told to hold one by someone it answers to, it is due now.
  if (brain.meetingOrderedBy && !brain.meeting) {
    brain.nextMeetingAt = Math.min(brain.nextMeetingAt, brain.now);
  }
  // A meeting is called when one is due and there are staff to call. Not while it is on its way
  // to the counter with an order, or at it waiting for cargo's answer: that is seen through first.
  const ordering =
    !!brain.requisition &&
    (brain.requisition.askedAt === null || !brain.requisition.heardBack);
  if (
    !brain.meeting &&
    !ordering &&
    people.length > 0 &&
    brain.now >= brain.nextMeetingAt
  ) {
    // The server names a room all its staff can walk into. Failing that, the department's own.
    const room = brain.meetingRoom ?? departmentHeadedBy(brain.job)?.meetsIn;
    if (room && knowsPlace(brain, room)) {
      brain.meeting = {
        calledAt: brain.now,
        room,
        invited: [],
        copied: false,
        answers: {},
        startedAt: null,
        turns: [],
        reports: {},
        closedAt: null,
        orderedBy: brain.meetingOrderedBy,
      };
      brain.meetingOrderedBy = null;
    }
  }
  const meeting = brain.meeting;
  if (meeting) {
    const here = present(brain, meeting);
    const everyoneCalled = people.every((person) =>
      meeting.invited.includes(person.name),
    );
    const expected = people.filter((person) =>
      awaited(brain, meeting, person.name),
    );
    // Every one of them has sent word that they cannot come, with their report.
    const noneCan = people.every(
      (person) =>
        meeting.answers[person.name] === 'cannot' ||
        !!meeting.reports[person.name],
    );
    const waited = brain.now - meeting.calledAt > GATHER_MAX_DS;
    if (meeting.startedAt === null && everyoneCalled) {
      const inRoom = inPlace(brain, meeting);
      // Everyone it is still counting on is there, or it has waited as long as it will.
      const gathered =
        waited || expected.every((person) => here.includes(person.name));
      if (inRoom && here.length > 0 && gathered) {
        meeting.startedAt = brain.now;
      } else if (here.length === 0 && (noneCan || (inRoom && waited))) {
        // Nobody is coming: they have all sent word that they cannot, or none of them has turned
        // up. What they have to report reaches it by PDA instead.
        meeting.closedAt = brain.now;
      }
    }
    // Everyone has been heard, and there is nobody left in the room to tell that it is over.
    if (
      meeting.startedAt !== null &&
      here.length === 0 &&
      !listening(brain, meeting)
    ) {
      meeting.closedAt ??= brain.now;
    }
    if (
      meeting.closedAt !== null ||
      brain.now - meeting.calledAt > MEETING_MAX_DS
    ) {
      endMeeting(brain);
    }
  }
  const meet = findTask(brain, MEET);
  if (brain.meeting && !meet) {
    addTask(brain, { kind: MEET, urgency: 'asked', source: 'own' });
  } else if (!brain.meeting && meet) {
    finishTask(brain, meet);
  }

  // What has been asked for is ordered together: after a meeting, or once the first of it has
  // waited long enough that nobody else is likely to add to it.
  const waiting = brain.asks.filter((ask) => !ask.ordered);
  const oldest = Math.min(...waiting.map((ask) => ask.at));
  const meetingSoon =
    !brain.metOnce && brain.nextMeetingAt - brain.now < BATCH_DS;
  if (
    !brain.requisition &&
    !brain.meeting &&
    waiting.length > 0 &&
    !meetingSoon &&
    (brain.metOnce || brain.now - oldest > BATCH_DS)
  ) {
    brain.requisition = orderFor(brain);
  }
  // An order nothing has been heard of in a long while is asked for again.
  const order = brain.requisition;
  if (
    order?.askedAt !== null &&
    order?.askedAt !== undefined &&
    brain.now - order.askedAt > ORDER_OVERDUE_DS
  ) {
    order.askedAt = null;
    order.heardBack = false;
    order.startedAt = brain.now;
  }
  const task = findTask(brain, REQUISITION);
  // While a meeting is on, an order already put to cargo is left to cargo.
  const toSee = !!brain.requisition && !(brain.meeting && !ordering);
  if (toSee && !task) {
    addTask(brain, { kind: REQUISITION, urgency: 'asked', source: 'own' });
  } else if (!toSee && task) {
    finishTask(brain, task);
  }
  brain.asks = brain.asks.filter(
    (ask) => !ask.told || brain.now - ask.at < MEETING_EVERY_DS,
  );

  // Between errands it goes back to its office. That is where people expect to find it.
  const away =
    !!brain.office && brain.location !== brain.office && !brain.shutIn;
  const back = findTask(brain, OFFICE);
  if (away && !back) {
    addTask(brain, {
      kind: OFFICE,
      urgency: 'routine',
      source: 'own',
    });
  } else if (!away && back) {
    finishTask(brain, back);
  }
}

/** What going back to its office comes down to right now. */
function officeStep(brain: NpcBrain): Plan {
  // Not while it has people to tell that their things have come: that is said from where it stands.
  return brain.office && brain.toTell.length === 0
    ? {
        ready: true,
        step: `You have nothing to see to just now, and are going back to your office, the ${brain.office}.`,
        act: { tool: 'go_to', place: brain.office },
      }
    : { ready: false, step: 'You are staying where you are for now.' };
}

/** What holding a meeting comes down to right now. */
function meetStep(brain: NpcBrain): Plan {
  const meeting = brain.meeting;
  if (!meeting) {
    return { ready: false, step: 'The meeting is over.' };
  }
  const room = meeting.room;
  const people = staff(brain);
  const uninvited = people.find(
    (person) => !meeting.invited.includes(person.name),
  );
  if (uninvited && brain.hasPda) {
    return {
      ready: true,
      step: `It is time for a staff meeting${meeting.orderedBy ? `, as ${meeting.orderedBy} ordered` : ''}. You are sending ${uninvited.name} a PDA message to come to the ${room}.`,
      act: {
        tool: 'message',
        person: uninvited.name,
        text: `Staff meeting in the ${room} now, please. Send word that you are coming, and bring your report.`,
      },
    };
  }
  // The Captain is kept in the know: told when one is held, and sent the report of it after.
  const captain = captainName(brain);
  if (!meeting.copied && captain && brain.hasPda) {
    return {
      ready: true,
      step: `You are sending ${captain}, the Captain, a PDA message to say you are holding a staff meeting in the ${room}.`,
      act: {
        tool: 'message',
        person: captain,
        text: `${meeting.orderedBy === captain ? 'As you ordered, I' : 'I'} am ${HOLDING} in the ${room} now. My report will follow it.`,
      },
    };
  }
  // A push out of the room is not leaving it, and a walk there that keeps arriving and keeps
  // leaving it outside is not made a fourth time: the meeting is held from where it stands.
  if (!inPlace(brain, meeting)) {
    return {
      ready: true,
      step: `You have called your staff to a meeting in the ${room}, and are going there.`,
      act: { tool: 'go_to', place: room },
    };
  }
  if (meeting.startedAt === null) {
    const coming = people
      .filter((person) => awaited(brain, meeting, person.name))
      .map((person) => person.name)
      .filter((name) => !present(brain, meeting).includes(name));
    return {
      ready: false,
      wait: true,
      // Only once it is in the room: stepping clear of the door on the far side of it is stepping away.
      inside: brain.location === room,
      step: `You are in the ${room}, waiting for your staff to come to the meeting${coming.length > 0 ? `: ${listed(coming)} ${coming.length === 1 ? 'is' : 'are'} not here yet` : ''}. You do not begin until they are all here, or you have waited long enough.`,
    };
  }
  if (listening(brain, meeting)) {
    return {
      ready: false,
      wait: true,
      // Only once it is in the room: stepping clear of the door on the far side of it is stepping away.
      inside: brain.location === room,
      step: `You have called on ${meeting.turns.at(-1)?.who} for their report, and are listening to it.`,
    };
  }
  // One at a time, by name. Nobody else speaks until they are called on.
  const next = nextTurn(brain, meeting);
  if (next) {
    const first = firstName(next);
    const opening = meeting.turns.length === 0;
    return {
      ready: true,
      step: `${opening ? 'Your staff are here and the meeting begins' : 'The meeting goes on'}. It is ${next}'s turn: in "say", ${opening ? 'thank them all for coming and ' : ''}call on ${next}, by name, for their report. Ask for nothing else.`,
      say: `${opening ? 'Thank you for coming, everyone. ' : ''}${first}, ${CALLING_ON}.`,
      // Whoever is called on has to hear their own name, and that it is their report that is wanted.
      needs: new RegExp(`\\b${first}\\b.*\\breport\\b`, 'i'),
    };
  }
  const line = closingLine(brain, meeting);
  return {
    ready: true,
    step: `Everyone here has given their report. Your body is summing up and ending the meeting, in these words: "${line}"`,
    say: line,
    exact: true,
  };
}

/** What putting an order in comes down to right now. */
function requisitionStep(brain: NpcBrain): Plan {
  const order = brain.requisition;
  if (!order) {
    return { ready: false, step: 'There is nothing to order.' };
  }
  const wanted = orderWords(order);
  const people = orderedFor(order).join(', ');
  // Asked, and nobody from cargo has answered: whoever it asked may not have heard. It waits at
  // the counter a little, and then asks again, of whoever is there now.
  if (order.askedAt !== null && !order.heardBack) {
    if (brain.now - order.askedAt < ANSWER_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `You have asked cargo for ${wanted}, and are waiting at the counter for an answer.`,
      };
    }
    order.askedAt = null;
  }
  if (order.askedAt !== null) {
    return {
      ready: false,
      step: `You have asked cargo to order ${wanted}. They will send word, with the manifest numbers, when it has come in.`,
    };
  }
  if (brain.location !== CARGO_LOBBY) {
    return knowsPlace(brain, CARGO_LOBBY)
      ? {
          ready: true,
          step: `Your staff need supplies (${people}). You are going to the Cargo Lobby to ask a cargo technician, face to face, to order ${wanted}.`,
          act: { tool: 'go_to', place: CARGO_LOBBY },
        }
      : { ready: false, step: 'You do not know the way to the cargo counter.' };
  }
  const technician = brain.peopleInView.find((person) => isCargo(person.job));
  if (!technician) {
    // Nobody at the counter. It waits a while, and then tries again later.
    if (brain.now - brain.inPlaceSince > COUNTER_WAIT_DS) {
      order.startedAt = brain.now;
      return {
        ready: false,
        step: 'Nobody from cargo came to the counter. You will try again shortly.',
      };
    }
    return {
      ready: false,
      wait: true,
      step: 'You are at the cargo counter, waiting for someone from cargo to take your order.',
    };
  }
  const first = firstName(technician.name);
  const several = order.lines.length > 1 || order.lines[0].count > 1;
  return {
    ready: true,
    step: `Your staff need supplies (${people}). ${technician.name}, who works in cargo, is here: in "say", ask ${technician.name}, by name, to order ${wanted}, all in the one order, and to send you the manifest numbers when it comes in. Only cargo can place an order: you are asking, not doing it yourself.`,
    say: `${first}, ${ORDERING} ${wanted} for my staff, please. Send me the manifest number${several ? 's' : ''} when ${several ? 'they come' : 'it comes'} in.`,
    // Cargo has to hear who is asked, what for and how many: all of that is in the plain line.
    needs: new RegExp(
      `\\b${first}\\b.*\\border\\b.*${order.lines.map((line) => `\\bcrates?\\b.*${line.what.split(' ')[0]}`).join('.*')}`,
      'i',
    ),
  };
}

function plan(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === MEET) {
    return meetStep(brain);
  }
  if (task.kind === OFFICE) {
    return officeStep(brain);
  }
  return task.kind === REQUISITION ? requisitionStep(brain) : null;
}

function describeTask(task: Task): string | null {
  if (task.kind === MEET) {
    return 'hold the staff meeting';
  }
  if (task.kind === OFFICE) {
    return 'go back to your office';
  }
  return task.kind === REQUISITION
    ? 'ask cargo to order what your staff need'
    : null;
}

/** What the LLM should know about where things stand, so that what it says about them is true. */
function cues(brain: NpcBrain): string[] {
  const lines: string[] = [];
  const meeting = brain.meeting;
  if (meeting) {
    lines.push(
      meeting.startedAt === null
        ? `You have called a staff meeting in the ${meeting.room}, and it has not begun yet. Any of your staff who are here came because you called them, and are waiting for you: you do not tell them to get back to work.`
        : `You are holding a staff meeting in the ${meeting.room}. Your staff speak one at a time, when you call on them by name.`,
    );
  }
  const waiting = brain.asks.filter((ask) => !ask.ordered);
  if (waiting.length > 0) {
    lines.push(
      `You have noted what your staff need and have yet to get it ordered: ${waiting.map((ask) => `${ask.who}, ${ask.what}`).join('; ')}.`,
    );
  }
  const order = brain.requisition;
  if (order?.askedAt !== null && order?.askedAt !== undefined) {
    lines.push(
      `You have asked cargo to order ${orderWords(order)} for ${orderedFor(order).join(', ')}. It has not come yet.`,
    );
  }
  if (brain.pickups.length > 0) {
    lines.push(
      `Cargo is holding crates of yours for collection, and you have sent for them: ${brain.pickups.map((pickup) => `${pickup.to} for crate #${pickup.number}`).join('; ')}. Each is to take it to the ${brain.pickups[0].room} and unpack it.`,
    );
  }
  return lines;
}

export const HEAD_OF_PERSONNEL: Job = {
  is: isHeadOfPersonnel,
  // It has an office and errands of its own. It does not wander the station or show people round.
  keepsPost: true,
  cleans: false,
  about: () =>
    'You are the Head of Personnel. The service staff answer to you: the janitors, the bartender, the cook and the rest. You see that they have what they need for their work, and you answer to the Captain for how they are getting on. You hold a short staff meeting now and then, hear each of them report, and note what they are short of. Then you go to the cargo counter and ask a cargo technician, by name, to order it: cargo takes orders from heads of department only, and only cargo can place one. Cargo holds what comes, and you send one of your staff to collect it.',
  whenAsked: (brain, heard) => [
    'If one of your staff tells you they need something for their work, tell them you will see to it. Your body notes it and asks cargo to order it.',
    'You do not clean, you do not order supplies for anyone but your own staff, and you never place an order yourself: you ask a cargo technician to.',
    ...(isMeetingOrder(brain, heard)
      ? [
          brain.meeting && !brain.meeting.orderedBy
            ? 'You have just been told to find out how your staff are doing. You have a staff meeting on already: say so, and that your report will follow it.'
            : 'You have just been told to find out how your staff are doing. Your body is calling a staff meeting for that now, by PDA: say that you are calling one, and that your report will follow it.',
        ]
      : []),
  ],
  cues,
  syncTasks,
  plan,
  describeTask,
  // What is said in its hearing: a report at its meeting, an order to hold one, an answer from
  // cargo, and one of its staff saying what they need in passing.
  overhears: (brain, event) => {
    const heard = String(event.details.message ?? '');
    const speaker = String(event.details.speaker ?? '');
    // Anything said by someone from cargo once the order is put to them is its answer.
    const order = brain.requisition;
    if (order && order.askedAt !== null && isCargo(jobOf(brain, speaker))) {
      order.heardBack = true;
    }
    // At the meeting: a report from one of its staff is noted, whoever's turn it is.
    const meeting = brain.meeting;
    const report = meeting ? readReport(heard) : null;
    if (
      meeting &&
      report &&
      staff(brain).some((person) => person.name === speaker)
    ) {
      meeting.reports[speaker] = report;
      for (const turn of meeting.turns) {
        if (turn.who === speaker) {
          turn.heard = true;
        }
      }
      if (report.need) {
        noteAsk(brain, speaker, brain.now);
      }
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
      return;
    }
    if (
      event.details.said_to !== 'other' &&
      NEED_WORDS.test(heard) &&
      !NO_NEED_WORDS.test(heard)
    ) {
      noteAsk(brain, speaker, brain.now);
    }
  },
  // Word from its staff about a meeting or of what they need, an order to hold a meeting, word
  // from cargo about its crates, and word from whoever it sent for one that it is unpacked.
  readsMessage: (brain, from, text, at, job) => {
    // The order has come in. One of its staff is sent for each crate, by its number.
    if (isCargo(job) && ARRIVED_WORDS.test(text)) {
      for (const crate of cratesIn(text)) {
        sendFor(brain, crate.number, crate.kind);
      }
      brain.requisition = null;
      return;
    }
    // A crate nobody has come for. Someone else is sent.
    if (isCargo(job) && STILL_WAITING_WORDS.test(text)) {
      for (const number of numbersIn(text)) {
        sendFor(brain, number);
      }
      return;
    }
    // A crate is unpacked where the staff work. Whoever asked for what was in it is told where
    // it is. Whoever unpacked it knows already.
    const unpacked = text.match(UNPACKED_WORDS);
    if (unpacked) {
      const number = Number(unpacked[1]);
      const pickup = brain.pickups.find((it) => it.number === number);
      const room =
        placeNamedIn(brain, text.toLowerCase()) ??
        pickup?.room ??
        SUPPLIES[0].room;
      brain.pickups = brain.pickups.filter((it) => it.number !== number);
      for (const ask of brain.asks) {
        if (!ask.ordered || ask.told) {
          continue;
        }
        ask.told = true;
        if (ask.who === from) {
          continue;
        }
        brain.toTell.push({
          to: ask.who,
          line: `${ask.who.split(' ')[0]}, what you asked for has come. It is in the ${room}.`,
          why: `${from} has collected what ${ask.who} asked for from cargo and unpacked it in the ${room}. You are sending ${ask.who} a PDA message to say so.`,
          byPda: true,
          at: Date.now(),
        });
      }
      return;
    }
    // Someone it answers to telling it, by PDA, to find out how its staff are doing.
    if (answersTo(brain.job, job) && isMeetingOrder(brain, text)) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = from;
      }
      return;
    }
    const meeting = brain.meeting;
    if (staff(brain).some((person) => person.name === from)) {
      // One of its staff sending word that they are coming to the meeting.
      if (COMING_WORDS.test(text)) {
        if (meeting) {
          meeting.answers[from] = 'coming';
        }
        return;
      }
      // One of them sending their report because they could not be there. After the meeting is
      // over, the work in it goes into the next one's count.
      const report = REPORT_BY_PDA.test(text) ? readReport(text) : null;
      if (report) {
        if (meeting) {
          meeting.reports[from] = report;
          meeting.answers[from] = 'cannot';
        } else {
          addCounts(brain.lateWork, report.counts);
        }
        if (report.need) {
          noteAsk(brain, from, at);
        }
        return;
      }
    }
    if (NEED_WORDS.test(text) && !NO_NEED_WORDS.test(text)) {
      noteAsk(brain, from, at);
    }
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    const meeting = brain.meeting;
    // Having called on someone, it listens for their report.
    if (meeting && called.includes(CALLING_ON)) {
      const who = present(brain, meeting).find((name) =>
        called.includes(`${firstName(name)}, ${CALLING_ON}`),
      );
      if (who && !meeting.turns.some((turn) => turn.who === who)) {
        meeting.turns.push({ who, askedAt: brain.now, heard: false });
      }
    }
    // Having said the meeting is over, it is.
    if (meeting && OVER_WORDS.test(called)) {
      meeting.closedAt = brain.now;
    }
    const order = brain.requisition;
    if (order && called.includes(ORDERING)) {
      order.askedAt = brain.now;
      order.heardBack = false;
      const people = orderedFor(order);
      for (const ask of brain.asks) {
        if (people.includes(ask.who)) {
          ask.ordered = true;
        }
      }
    }
  },
  // Each of its staff is sent the call to the meeting once, and the Captain word of it once.
  afterActing: (brain, act, _task, ok, looped) => {
    const meeting = brain.meeting;
    if (!meeting) {
      return;
    }
    // Its walk to the meeting room has arrived three times running, and it is still being sent.
    // Walking is not what is wrong. It holds the meeting from where it stands.
    if (ok && looped && act.tool === 'go_to' && act.place === meeting.room) {
      meeting.fromHere = true;
    }
    if (act.tool !== 'message') {
      return;
    }
    const text = String(act.text ?? '');
    if (/^staff meeting in the/i.test(text)) {
      meeting.invited.push(String(act.person));
    }
    if (text.includes(HOLDING)) {
      meeting.copied = true;
    }
  },
};
