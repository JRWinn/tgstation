/**
 * The Head of Personnel: sees that the service staff have what they need.
 *
 * Cargo takes orders from heads of department only, so the staff bring what they need to their
 * head, and the head puts one order in for all of it. To find out what is needed it calls a short
 * staff meeting by PDA, two minutes into the shift and every so often after, asks the room, and
 * notes what is said. Then it goes to the cargo counter and orders enough for everyone at once.
 *
 * Cargo delivers nothing: its staff cannot get into the rooms the service staff work from. When
 * the order comes in, cargo sends the number on each crate's manifest, and the head sends one of
 * its staff for each crate, each in turn, with that number: to collect it at the counter, take it
 * to the room they work from, unpack it and bring the crate back. If cargo sends word that a crate
 * is still waiting, the next of them is sent for it. When a crate is unpacked, whoever asked is
 * told by PDA where their things are.
 *
 * All of that is code. The LLM puts the head's lines in its own voice and answers people.
 */
import { departmentHeadedBy } from '../hierarchy';
import { CARGO_LOBBY, knowsPlace } from '../memory';
import { addTask, findTask, finishTask, placeNamedIn } from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';
import { isCargo } from './cargo';
import { isJanitor } from './janitor';
import type { Job } from './job';
import { sendForLine, UNPACKED_WORDS } from './pickups';

/** Calling the staff together and asking what they need. */
const MEET = 'hold_meeting';
/** Putting the order in at the cargo counter, and seeing that those who asked hear when it comes. */
const REQUISITION = 'requisition';
/** Going back to its office when there is nothing else to see to. */
const OFFICE = 'back_to_office';

/** How long (deciseconds) into its shift the first meeting is called, and how long between meetings after. */
const FIRST_MEETING_DS = 1200;
const MEETING_EVERY_DS = 9000;
/** How long (deciseconds) it waits in the room for its staff before it starts without the stragglers. */
const WAIT_FOR_STAFF_DS = 600;
/** How long (deciseconds) it listens for answers after asking the room. */
const LISTEN_DS = 450;
/** How long (deciseconds) a meeting may run in all before it is given up on. */
const MEETING_MAX_DS = 3000;
/** How long (deciseconds) something asked for outside a meeting waits, in case more is asked for, before it is ordered. */
const BATCH_DS = 1200;
/** How long (deciseconds) it waits at the counter for someone from cargo, and for word that an order has come. */
const COUNTER_WAIT_DS = 600;
const ORDER_OVERDUE_DS = 6000;
/** How long (deciseconds) it waits at the counter for cargo to answer an order before it asks again. */
const ANSWER_WAIT_DS = 300;
/** How many people one crate of supplies is good for. */
const PER_CRATE = 3;
/** The most crates it asks for at once. Cargo will not order more than this in one go. */
const CRATES_MAX = 4;

/** The plain words it asks the room in, and orders in, by which those lines are known afterwards. */
const ASKING_ROOM = 'does anyone need anything for their work';
const ORDERING = 'I need to order';
/** The words that mark what one of its staff says or writes as asking for something for their work. */
const NEED_WORDS =
  /\bi need\b|\bwe need\b|nothing to clean with|could you get|get it ordered|\bsuppl(y|ies)\b|\bout of\b/i;
/** The words of someone saying they need nothing. */
const NO_NEED_WORDS = /nothing from me|need nothing|don'?t need|do not need|no,? thank/i;
/** The words by which cargo sends word that an order has come in, with the number of each crate. */
const ARRIVED_WORDS = /order has come in/i;
/** The words by which cargo sends word that crates of an order are still waiting to be collected. */
const STILL_WAITING_WORDS = /still waiting at cargo/i;

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
    brain.asks.push({ who, what: supply.what, at, ordered: false, told: false });
  }
}

/** What is asked for and not yet ordered, as one order: the crate, how many, where to, and for whom. */
function orderFor(brain: NpcBrain): NonNullable<NpcBrain['requisition']> | null {
  const waiting = brain.asks.filter((ask) => !ask.ordered);
  const supply = SUPPLIES.find((it) =>
    waiting.some((ask) => it.for(jobOf(brain, ask.who))),
  );
  if (!supply) {
    return null;
  }
  const people = waiting.filter((ask) => supply.for(jobOf(brain, ask.who)));
  return {
    crate: supply.crate,
    what: supply.ordered,
    count: Math.min(CRATES_MAX, Math.ceil(people.length / PER_CRATE)),
    room: supply.room,
    people: people.map((ask) => ask.who),
    askedAt: null,
    heardBack: false,
    startedAt: brain.now,
  };
}

/** The manifest numbers written in a message from cargo: "#12 and #13". */
function numbersIn(text: string): number[] {
  return [...text.matchAll(/#(\d+)/g)].map((found) => Number(found[1]));
}

/**
 * Sends one of its staff for a crate cargo is holding. Each takes a turn: those who asked for what
 * is in it first, then the rest of those it is for, and round again. Sent for a crate a second
 * time, because it is still waiting, it goes to the next of them and not the one who did not come.
 */
function sendFor(brain: NpcBrain, number: number): void {
  const before = brain.pickups.find((pickup) => pickup.number === number);
  const order = brain.requisition;
  const supply =
    SUPPLIES.find((it) => it.ordered === (before?.what ?? order?.what)) ??
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
  const room = before?.room ?? order?.room ?? supply.room;
  const what = before?.what ?? order?.what ?? supply.ordered;
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

/** Keeps the head's meetings and orders true to the time, to what has been asked for, and to what has come. */
function syncTasks(brain: NpcBrain): void {
  const people = staff(brain);
  if (brain.nextMeetingAt === 0) {
    brain.nextMeetingAt = brain.bornAt + FIRST_MEETING_DS;
  }
  // A meeting is called when one is due, there are staff to call, and no order is being seen to.
  if (
    !brain.meeting &&
    !brain.requisition &&
    people.length > 0 &&
    brain.now >= brain.nextMeetingAt
  ) {
    // The server names a room all its staff can walk into. Failing that, the department's own.
    const room = brain.meetingRoom ?? departmentHeadedBy(brain.job)?.meetsIn;
    if (room && knowsPlace(brain, room)) {
      brain.meeting = { calledAt: brain.now, room, invited: [], askedAt: null };
    }
  }
  const meeting = brain.meeting;
  // Nobody has come, and it has waited: they could not get there, or are not coming. What they
  // need reaches it by PDA instead.
  const nobodyCame =
    !!meeting &&
    meeting.askedAt === null &&
    brain.location === meeting.room &&
    brain.now - brain.inPlaceSince > WAIT_FOR_STAFF_DS &&
    !people.some((person) =>
      brain.peopleInView.some((seen) => seen.name === person.name),
    );
  const over =
    !!meeting &&
    (nobodyCame ||
      (meeting.askedAt !== null && brain.now - meeting.askedAt > LISTEN_DS) ||
      brain.now - meeting.calledAt > MEETING_MAX_DS);
  if (over) {
    brain.meeting = null;
    brain.metOnce = true;
    brain.nextMeetingAt = brain.now + MEETING_EVERY_DS;
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
  if (brain.requisition && !task) {
    addTask(brain, { kind: REQUISITION, urgency: 'asked', source: 'own' });
  } else if (!brain.requisition && task) {
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
  const people = staff(brain);
  const uninvited = people.find(
    (person) => !meeting.invited.includes(person.name),
  );
  if (uninvited && brain.hasPda) {
    return {
      ready: true,
      step: `It is time for a staff meeting. You are sending ${uninvited.name} a PDA message to come to the ${meeting.room}.`,
      act: {
        tool: 'message',
        person: uninvited.name,
        text: `Staff meeting in the ${meeting.room} now, please. Come and tell me what you need for your work.`,
      },
    };
  }
  if (brain.location !== meeting.room) {
    return {
      ready: true,
      step: `You have called your staff to a meeting in the ${meeting.room}, and are going there.`,
      act: { tool: 'go_to', place: meeting.room },
    };
  }
  if (meeting.askedAt !== null) {
    return {
      ready: false,
      wait: true,
      step: 'You have asked your staff what they need, and are listening to what they say.',
    };
  }
  const here = people.filter((person) =>
    brain.peopleInView.some((seen) => seen.name === person.name),
  );
  const everyone = here.length === people.length;
  const waitedEnough = brain.now - brain.inPlaceSince > WAIT_FOR_STAFF_DS;
  if (here.length === 0 || (!everyone && !waitedEnough)) {
    return {
      ready: false,
      wait: true,
      step: `You are in the ${meeting.room}, waiting for your staff to come to the meeting.`,
    };
  }
  return {
    ready: true,
    step: `Your staff are here for the meeting (${here.map((person) => person.name).join(', ')}). In "say", thank them for coming and ask whether anyone needs anything for their work.`,
    say: `Thank you for coming, everyone. D${ASKING_ROOM.slice(1)}?`,
    needs: /\bneed\b/i,
  };
}

/** What putting an order in comes down to right now. */
function requisitionStep(brain: NpcBrain): Plan {
  const order = brain.requisition;
  if (!order) {
    return { ready: false, step: 'There is nothing to order.' };
  }
  const crates = order.count === 1 ? 'a crate' : `${order.count} crates`;
  // Asked, and nobody from cargo has answered: whoever it asked may not have heard. It waits at
  // the counter a little, and then asks again, of whoever is there now.
  if (order.askedAt !== null && !order.heardBack) {
    if (brain.now - order.askedAt < ANSWER_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `You have asked cargo for ${crates} of ${order.what}, and are waiting at the counter for an answer.`,
      };
    }
    order.askedAt = null;
  }
  if (order.askedAt !== null) {
    return {
      ready: false,
      step: `You have ordered ${crates} of ${order.what} from cargo. They will send word, with the manifest numbers, when it has come in.`,
    };
  }
  if (brain.location !== CARGO_LOBBY) {
    return knowsPlace(brain, CARGO_LOBBY)
      ? {
          ready: true,
          step: `Your staff need ${order.what} (${order.people.join(', ')}). You are going to the Cargo Lobby to put the order in yourself.`,
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
  const first = technician.name.split(' ')[0];
  return {
    ready: true,
    step: `Your staff need ${order.what} (${order.people.join(', ')}). ${technician.name}, who works in cargo, is here: in "say", order ${crates} of ${order.what} from ${technician.name}, and ask to be sent the manifest numbers when it comes in.`,
    say: `${first}, ${ORDERING} ${crates} of ${order.what} for my staff, please. Send me the manifest numbers when it comes in.`,
    // Cargo has to hear who is asked, what for and how many: all of that is in the plain line.
    needs: new RegExp(`\\b${first}\\b.*\\border\\b.*\\bcrates?\\b`, 'i'),
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
    ? 'put the order for your staff in with cargo'
    : null;
}

/** What the LLM should know about where things stand, so that what it says about them is true. */
function cues(brain: NpcBrain): string[] {
  const lines: string[] = [];
  const waiting = brain.asks.filter((ask) => !ask.ordered);
  if (waiting.length > 0) {
    lines.push(
      `You have noted what your staff need and have yet to order it: ${waiting.map((ask) => `${ask.who}, ${ask.what}`).join('; ')}.`,
    );
  }
  const order = brain.requisition;
  if (order?.askedAt !== null && order?.askedAt !== undefined) {
    lines.push(
      `You have an order in with cargo: ${order.count === 1 ? 'a crate' : `${order.count} crates`} of ${order.what} for ${order.people.join(', ')}. It has not come yet.`,
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
    'You are the Head of Personnel. The service staff answer to you: the janitors, the bartender, the cook and the rest. You see that they have what they need for their work: you call a short staff meeting in the Bar now and then, note what they ask for, and put the order in at the cargo counter yourself, because cargo takes orders from heads of department only. Cargo holds what comes, and you send one of your staff to collect it.',
  whenAsked: () => [
    'If one of your staff tells you they need something for their work, tell them you will see to it. Your body notes it and orders it from cargo.',
    'You do not clean, and you do not order supplies for anyone but your own staff.',
  ],
  cues,
  syncTasks,
  plan,
  describeTask,
  // One of its staff saying what they need, at a meeting or in passing, is noted.
  overhears: (brain, event) => {
    const heard = String(event.details.message ?? '');
    // Anything said by someone from cargo once the order is put to them is its answer.
    const order = brain.requisition;
    if (
      order &&
      order.askedAt !== null &&
      isCargo(jobOf(brain, String(event.details.speaker ?? '')))
    ) {
      order.heardBack = true;
    }
    if (
      event.details.said_to !== 'other' &&
      NEED_WORDS.test(heard) &&
      !NO_NEED_WORDS.test(heard)
    ) {
      noteAsk(brain, String(event.details.speaker ?? ''), brain.now);
    }
  },
  // Word from its staff of what they need, word from cargo about its crates, and word from
  // whoever it sent for one that it is unpacked.
  readsMessage: (brain, from, text, at, job) => {
    // The order has come in. One of its staff is sent for each crate, by its number.
    if (isCargo(job) && ARRIVED_WORDS.test(text)) {
      for (const number of numbersIn(text)) {
        sendFor(brain, number);
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
    if (NEED_WORDS.test(text) && !NO_NEED_WORDS.test(text)) {
      noteAsk(brain, from, at);
    }
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    if (brain.meeting && called.toLowerCase().includes(ASKING_ROOM)) {
      brain.meeting.askedAt = brain.now;
    }
    const order = brain.requisition;
    if (order && called.includes(ORDERING)) {
      order.askedAt = brain.now;
      order.heardBack = false;
      for (const ask of brain.asks) {
        if (order.people.includes(ask.who)) {
          ask.ordered = true;
        }
      }
    }
  },
  // Each of its staff is sent the call to the meeting once.
  afterActing: (brain, act) => {
    if (
      brain.meeting &&
      act.tool === 'message' &&
      /staff meeting/i.test(String(act.text ?? ''))
    ) {
      brain.meeting.invited.push(String(act.person));
    }
  },
};
