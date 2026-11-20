/**
 * The Chief Engineer: head of the engineering staff. It sees that the engine is lit, and that
 * it is shut off if it goes wrong.
 *
 * - It holds a staff meeting in Engineering, called aloud, thirty seconds into the shift and
 *   every ten minutes after, with the same steps as every other head's (MeetingWay in
 *   jobs/head.ts). At the first one, once its engineer has reported, it gives them the engine,
 *   to their face: "Sam, the engine is yours. Light it now, please." If it does not hear "The
 *   engine, right away." within a minute it gives the order again.
 * - It delegates: it does not work the engine room. The one thing it sets with its own hands is
 *   the station's three batteries, straight after the first meeting, so that what the engine
 *   makes is stored.
 * - What it knows of the engine it reads from the engine monitor on its PDA, and from what its
 *   engineer tells it. With no reading it knows nothing, and says so.
 * - If the crystal's integrity falls, it has the emitters switched off: "Sam, the engine is
 *   losing integrity. Emitters off, now." Said to the engineer's face if they are there, and
 *   sent by PDA if not. Nothing comes before it. The Captain is told by PDA. The engine is not
 *   lit again unless someone it answers to says to light it.
 * - If the crystal is sound and has no energy left in it, the emitters have stopped, and it
 *   sends the engineer to switch them on again.
 * - When its engineer tells it something about the engine it answers, by name, "I have that".
 *   The engineer does not count its word as passed on until it hears that.
 * - It closes each meeting with the engine's reading, and sends the Captain a report of it.
 *
 * All of that is code, the numbers included. The LLM answers people in its voice.
 */
import { answersTo } from '../hierarchy';
import { addTask, findTask, finishTask } from '../tasks';
import type { ChiefWork, NpcBrain, Plan, SenseEvent, Task } from '../types';
import { batterySteps } from './engine';
import {
  beginsWith,
  ENGINE_TAKEN,
  engineersAboard,
  firstName,
  HEARD_WORDS,
  heardLine,
  isChiefEngineer,
  isEngineer,
  isLightAgainOrder,
  LIGHT_WORDS,
  lightLine,
  litLine,
  matchAfterName,
  NOT_OFF_WORDS,
  NOT_ON_WORDS,
  offLine,
  onAgainLine,
  RELIGHT_WORDS,
  relightLine,
  SHUT_WORDS,
  STUCK_WORDS,
  shutLine,
} from './engineering';
import {
  describeForcing,
  forcingAfterActing,
  forcingCues,
  forcingReads,
  planForcing,
  syncForcing,
} from './forcing';
import {
  captainName,
  hearReport,
  MEET,
  type Meeting,
  type MeetingWay,
  meetingActed,
  meetingSaid,
  meetStep,
  present,
  staffMeetingWord,
  syncMeeting,
  workReported,
} from './head';
import type { Job } from './job';
import { isMeetingOrder } from './meetings';
import { totalWords } from './reports';

/** Setting the station's batteries to charge. */
const BATTERIES = 'charge_batteries';
/** Giving its engineer an order outside a meeting. The task's item is which order. */
const GIVE = 'engine_order';
/** Going back to its office when there is nothing else to see to. */
const OFFICE = 'chief_office';

/** How long (deciseconds) into the shift its first staff meeting is called. */
const FIRST_MEETING_DS = 300;
/** How long (deciseconds) it waits to hear that its engineer has the engine before it gives the order again. */
const TAKEN_WAIT_DS = 600;
/** How long (deciseconds) into the shift it sets the batteries anyway, if no meeting has been held. */
const BATTERIES_ANYWAY_DS = 1500;
/** How many times it tries one battery before it leaves that one alone. */
const BATTERY_TRIES = 3;
/** The integrity (percent) below which it has the emitters switched off. */
const INTEGRITY_FLOOR = 95;
/** The energy at or below which the crystal has nothing in it: the emitters are not firing. */
const ENERGY_NOTHING = 1;
/** How long (deciseconds) after the engine is lit before no energy in it means the emitters have stopped. */
const LIT_GRACE_DS = 1200;
/** How long (deciseconds) between one order to switch the emitters on again and the next. */
const RELIGHT_EVERY_DS = 3000;
/** How long (deciseconds) it waits to hear that the emitters are off before it gives that order again. */
const SHUT_AGAIN_DS = 900;
/** How long (deciseconds) between orders to switch the emitters off once it has been told they will not go off. */
const SHUT_STUCK_AGAIN_DS = 3000;
/** How far (energy) over the lowest seen since the emitters went off the crystal must read to be taken as lit again by someone. */
const RISING_BY = 50;
/** How long (deciseconds) it looks for its engineer where its staff work before it tries their PDA again. */
const LOOK_DS = 300;
/** How far off (tiles) its engineer has to be standing before it walks up to them to speak. */
const SPEAKING_DISTANCE = 2;
/** The most characters a body can say at once, or send in one PDA message. Past that the end is cut off. */
const SAID_MAX = 200;

/** What it knows of the engine and its staff. Made the first time it is asked for. */
function chiefOf(brain: NpcBrain): ChiefWork {
  brain.chief ??= {
    lightGivenAt: null,
    lightTaken: false,
    litAt: null,
    stuck: null,
    batteries: [],
    batteryTries: {},
    order: null,
    shut: false,
    shutGivenAt: null,
    emittersOff: false,
    notOff: null,
    relitAt: 0,
  };
  return brain.chief;
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** Its engineer: one in sight if there is one, and failing that the first its PDA lists. Null if it has none. */
function engineer(brain: NpcBrain): string | null {
  const names = engineersAboard(brain);
  return (
    names.find((name) =>
      brain.peopleInView.some((person) => person.name === name),
    ) ??
    names[0] ??
    null
  );
}

/** Sends someone a PDA message, once it has a moment. */
function sendWord(
  brain: NpcBrain,
  to: string,
  line: string,
  why: string,
): void {
  brain.toTell.push({ to, line, why, byPda: true, at: Date.now() });
}

/** Tells the Captain something about the engine by PDA, if there is a Captain aboard. */
function tellCaptain(brain: NpcBrain, line: string, why: string): void {
  const captain = captainName(brain);
  if (captain) {
    sendWord(brain, captain, line.slice(0, SAID_MAX), why);
  }
}

/** Where the engine stands, as far as it knows, in a sentence: for a meeting's close and the Captain's report. */
function engineWords(brain: NpcBrain): string {
  const chief = chiefOf(brain);
  const reading = brain.engineReading;
  const integrity = reading
    ? ` It is at ${Math.round(reading.integrity)} percent integrity.`
    : '';
  if (chief.shut && !chief.emittersOff) {
    return engineer(brain)
      ? `The engine is losing integrity. I have ordered the emitters off, and have not heard that they are.${integrity}`
      : `The engine is losing integrity and I have no engineer to switch the emitters off.${integrity}`;
  }
  if (chief.shut) {
    return `The engine has been shut off: it was losing integrity.${integrity}`;
  }
  if (chief.stuck) {
    return `The engine is not lit: ${chief.stuck}.`;
  }
  if (chief.litAt !== null) {
    return `The engine is lit.${integrity || ' I have no reading of it.'}`;
  }
  return 'The engine is not lit yet.';
}

/** What it says to end a staff meeting: the work done, where the engine stands, and that the meeting is over. */
function engineClosing(brain: NpcBrain, meeting: Meeting): string {
  const work = totalWords(workReported(brain, meeting));
  const over = 'The meeting is over, thank you.';
  return (
    [
      `${work ? `That is ${work}. ` : ''}${engineWords(brain)} ${over}`,
      `${engineWords(brain)} ${over}`,
    ].find((line) => line.length <= SAID_MAX) ?? over
  );
}

/** Its report to the Captain of a staff meeting that is over: who came, the engine, and the work done. */
function engineReport(brain: NpcBrain, meeting: Meeting): string {
  const work = totalWords(workReported(brain, meeting));
  const came = `Engineering staff meeting: ${meeting.turns.length} of ${meeting.invited.length} there.`;
  return (
    [
      `${came} ${engineWords(brain)}${work ? ` Since the last one: ${work}.` : ''}`,
      `${came} ${engineWords(brain)}`,
    ].find((line) => line.length <= SAID_MAX) ?? came
  );
}

/**
 * Giving its engineer the engine, while its staff are together: said to the engineer's face, in
 * so many words, because the engineer's body goes by them. Once, at the first meeting it has an
 * engineer at.
 */
function lightStep(brain: NpcBrain, meeting: Meeting): Plan | null {
  const chief = chiefOf(brain);
  if (
    chief.lightGivenAt !== null ||
    chief.litAt !== null ||
    chief.stuck ||
    chief.shut
  ) {
    return null;
  }
  const name = present(brain, meeting).find((it) =>
    isEngineer(jobOf(brain, it)),
  );
  if (!name) {
    return null;
  }
  const line = lightLine(name);
  return {
    ready: true,
    step: `Your staff have reported. The engine is not lit, and the station's batteries will not last. Your body is giving ${name} the engine, in these words: "${line}"`,
    say: line,
    exact: true,
  };
}

/** How the Chief Engineer holds its staff meeting: in Engineering, where its staff work, called aloud. */
const ENGINE_WAY: MeetingWay = {
  room: (brain) => brain.staffPost,
  aloud: true,
  firstAt: FIRST_MEETING_DS,
  before: lightStep,
  closing: engineClosing,
  report: engineReport,
};

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
  } else if (!wanted && task) {
    finishTask(brain, task);
  }
}

/** The batteries it has yet to set, leaving out any that would not take however it tried. */
function batteriesLeft(brain: NpcBrain) {
  const chief = chiefOf(brain);
  return batterySteps(brain.machines).filter(
    (step) =>
      !chief.batteries.includes(step.machine.id) &&
      (chief.batteryTries[step.machine.id] ?? 0) < BATTERY_TRIES,
  );
}

/** Keeps the Chief Engineer's tasks true to the engine's reading, to what it has been told and to the time. */
function syncTasks(brain: NpcBrain): void {
  // A door to force for security, where it has no engineer to send.
  syncForcing(brain);
  const chief = chiefOf(brain);
  const reading = brain.engineReading;

  // The crystal is coming apart. The emitters go off, and nothing comes before that.
  if (reading && !chief.shut && reading.integrity < INTEGRITY_FLOOR) {
    chief.shut = true;
    chief.emittersOff = false;
    chief.notOff = null;
    chief.energyAt = null;
    chief.litAt = null;
    chief.order = { what: 'shut', givenAt: null, sent: false };
    const percent = Math.floor(reading.integrity);
    if (engineer(brain)) {
      tellCaptain(
        brain,
        `The engine is losing integrity: ${percent} percent. I am having the emitters switched off.`,
        `The engine monitor on your PDA reads ${percent} percent integrity. You are having the emitters switched off, and telling the Captain so by PDA.`,
      );
    } else {
      tellCaptain(
        brain,
        `The engine is losing integrity: ${percent} percent. I have no engineer to switch the emitters off.`,
        `The engine monitor on your PDA reads ${percent} percent integrity, and you have no engineer aboard to switch the emitters off. You are telling the Captain so by PDA.`,
      );
    }
  }
  // Shut off, with the emitters said to be off: energy rising in the crystal means someone has
  // lit it again by hand. Left alone the energy only falls, so the lowest seen is kept.
  if (reading && chief.shut && chief.emittersOff) {
    if (chief.energyAt == null || reading.energy < chief.energyAt) {
      chief.energyAt = reading.energy;
    } else if (reading.energy > chief.energyAt + RISING_BY) {
      chief.shut = false;
      chief.emittersOff = false;
      chief.energyAt = null;
      chief.litAt = brain.now;
      tellCaptain(
        brain,
        'The engine has been lit again.',
        'The engine monitor on your PDA shows energy rising in the crystal again, after the emitters were switched off. You are telling the Captain by PDA.',
      );
    }
  }
  // The order to switch them off has been given, and nothing has been heard of it.
  if (
    chief.shut &&
    !chief.emittersOff &&
    !chief.order &&
    // Never given, for want of an engineer: it goes to the first one that turns up.
    (chief.shutGivenAt === null ||
      // Told they will not go off, it gives the order again now and then, in case the way is open again.
      brain.now - chief.shutGivenAt >
        (chief.notOff ? SHUT_STUCK_AGAIN_DS : SHUT_AGAIN_DS)) &&
    engineer(brain)
  ) {
    chief.order = { what: 'shut', givenAt: null, sent: false };
  }
  // The crystal is sound and there is nothing in it: the emitters have stopped.
  if (
    reading &&
    !chief.shut &&
    !chief.order &&
    chief.litAt !== null &&
    reading.energy <= ENERGY_NOTHING &&
    brain.now - chief.litAt > LIT_GRACE_DS &&
    brain.now - chief.relitAt > RELIGHT_EVERY_DS
  ) {
    chief.order = { what: 'relight', givenAt: null, sent: false };
    chief.relitAt = brain.now;
  }
  // It gave its engineer the engine and has not heard that they have it.
  if (
    !chief.order &&
    !brain.meeting &&
    !chief.shut &&
    !chief.stuck &&
    chief.litAt === null &&
    chief.lightGivenAt !== null &&
    !chief.lightTaken &&
    brain.now - chief.lightGivenAt > TAKEN_WAIT_DS
  ) {
    chief.order = { what: 'light', givenAt: null, sent: false };
  }
  // With no engineer aboard there is nobody to order.
  if (chief.order && !engineer(brain)) {
    chief.order = null;
  }

  // Its staff meeting. Not called while the emitters have to come off.
  syncMeeting(brain, ENGINE_WAY, chief.order?.what === 'shut');

  for (const what of ['shut', 'relight', 'light']) {
    keep(
      brain,
      GIVE,
      chief.order?.what === what,
      what === 'shut' ? 'emergency' : 'asked',
      what,
    );
  }
  // The batteries, once the first meeting is over, or if none has been held in a good while.
  keep(
    brain,
    BATTERIES,
    !brain.meeting &&
      (brain.metOnce || brain.now - brain.bornAt > BATTERIES_ANYWAY_DS) &&
      batteriesLeft(brain).length > 0,
    'asked',
  );
  // Between errands it goes back to its office. That is where people expect to find it.
  keep(
    brain,
    OFFICE,
    !!brain.office && brain.location !== brain.office && !brain.shutIn,
    'routine',
  );
}

/** The words of an order it gives outside a meeting, said to this engineer. */
function orderLine(what: 'light' | 'shut' | 'relight', to: string): string {
  return what === 'shut'
    ? shutLine(to)
    : what === 'relight'
      ? relightLine(to)
      : lightLine(to);
}

/** What giving its engineer an order comes down to right now: to their face if they are there, and by PDA if not. */
function giveStep(brain: NpcBrain): Plan {
  const chief = chiefOf(brain);
  const order = chief.order;
  const name = engineer(brain);
  if (!order || !name) {
    return { ready: false, step: 'You have no order to give just now.' };
  }
  const line = orderLine(order.what, name);
  const why =
    order.what === 'shut'
      ? 'The engine is losing integrity, and the emitters have to come off at once.'
      : order.what === 'relight'
        ? 'The engine is sound and has no energy left in it: the emitters have stopped.'
        : `You gave ${name} the engine and have not heard that they have it.`;
  const seen = brain.peopleInView.find((person) => person.name === name);
  if (seen) {
    // Emitters off is called across the room. Anything else is said standing with them.
    if (
      order.what !== 'shut' &&
      (seen.distance ?? 0) > SPEAKING_DISTANCE &&
      !order.walkedUp
    ) {
      return {
        ready: true,
        step: `${why} ${name} is in sight, and you are walking up to them.`,
        act: { tool: 'approach', person: seen.handle },
      };
    }
    return {
      ready: true,
      step: `${why} ${name} is here. Your body is telling them, in these words: "${line}"`,
      say: line,
      exact: true,
    };
  }
  if (brain.hasPda && !order.sent) {
    return {
      ready: true,
      step: `${why} ${name} is not in sight, so you are sending it by PDA: "${line}"`,
      act: { tool: 'message', person: name, text: line },
    };
  }
  // No PDA, or the message would not send. It goes to where its staff work to find them.
  if (brain.staffPost && brain.location !== brain.staffPost) {
    return {
      ready: true,
      step: `${why} You cannot reach ${name} by PDA, so you are going to the ${brain.staffPost} to find them.`,
      act: { tool: 'go_to', place: brain.staffPost },
    };
  }
  // It looks for a while, then tries the PDA again; after the first look it holds nothing else up.
  order.lookedAt ??= brain.now;
  if (brain.now - order.lookedAt > LOOK_DS) {
    order.lookedAt = undefined;
    order.looks = (order.looks ?? 0) + 1;
    if (order.what === 'shut' && order.looks === 2) {
      tellCaptain(
        brain,
        `I cannot reach ${firstName(name)} to switch the emitters off. The engine is still firing.`,
        `You have looked for ${name} in the ${brain.staffPost ?? 'department'} and tried their PDA, and cannot reach them to have the emitters switched off. You are telling the Captain by PDA.`,
      );
    }
    if (brain.hasPda) {
      order.sent = false;
      return {
        ready: true,
        step: `${why} ${name} is not here, so you are trying their PDA again: "${line}"`,
        act: { tool: 'message', person: name, text: line },
      };
    }
  }
  return {
    ready: false,
    wait: !order.looks,
    step: `${why} You are looking for ${name}.`,
  };
}

function plan(brain: NpcBrain, task: Task): Plan | null {
  const forcing = planForcing(brain, task);
  if (forcing) {
    return forcing;
  }
  if (task.kind === MEET) {
    return meetStep(brain, ENGINE_WAY);
  }
  if (task.kind === GIVE) {
    return giveStep(brain);
  }
  if (task.kind === BATTERIES) {
    const left = batteriesLeft(brain);
    const next = left[0];
    return next
      ? {
          ready: true,
          step: `You are setting the station's batteries to charge, so that what the engine makes is stored: ${left.length} left to set.`,
          act: {
            tool: 'work_machine',
            machine: next.machine.id,
            how: next.how,
          },
        }
      : { ready: false, step: 'The batteries are set.' };
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
  return null;
}

function describeTask(task: Task): string | null {
  const forcing = describeForcing(task);
  if (forcing) {
    return forcing;
  }
  switch (task.kind) {
    case MEET:
      return 'hold the engineering staff meeting';
    case GIVE:
      return task.item === 'shut'
        ? 'have the emitters switched off'
        : task.item === 'relight'
          ? 'have the emitters switched on again'
          : 'give your engineer the engine to light';
    case BATTERIES:
      return "set the station's batteries to charge";
    case OFFICE:
      return 'go back to your office';
    default:
      return null;
  }
}

/** What the LLM should know about where things stand, so that what it says about them is true. */
function cues(brain: NpcBrain): string[] {
  const chief = chiefOf(brain);
  const lines: string[] = [];
  const meeting = brain.meeting;
  if (meeting) {
    lines.push(
      meeting.startedAt === null
        ? `You have called a staff meeting in the ${meeting.room}, and it has not begun yet.`
        : `You are holding a staff meeting in the ${meeting.room}. Your staff speak one at a time, when you call on them by name.`,
    );
  }
  lines.push(engineWords(brain));
  if (!brain.engineReading) {
    lines.push(
      'You have no reading of the engine just now: the engine monitor on your PDA is how you know its state, and it is telling you nothing.',
    );
  }
  if (chief.shut) {
    lines.push(
      chief.emittersOff
        ? 'Your engineer has told you the emitters are off. The engine is not to be lit again unless the Captain says so.'
        : engineer(brain)
          ? 'You have ordered the emitters off, and have not yet heard that they are.'
          : 'The emitters must come off, and you have no engineer aboard to switch them off.',
    );
  } else if (
    chief.lightGivenAt !== null &&
    chief.litAt === null &&
    !chief.stuck
  ) {
    lines.push(
      chief.lightTaken
        ? 'Your engineer has the engine and is lighting it.'
        : 'You have given your engineer the engine to light, and have not yet heard that they have it.',
    );
  }
  const total = batterySteps(brain.machines).length;
  if (total > 0) {
    lines.push(
      `You have set ${chief.batteries.length} of the station's ${total} batteries to charge.`,
    );
  }
  return lines;
}

/**
 * Takes what its engineer has told it about the engine: aloud, when it answers that it has it,
 * or by PDA, when there is nobody standing waiting on an answer.
 */
function hearEngineer(
  brain: NpcBrain,
  from: string,
  text: string,
  aloud: boolean,
): void {
  const chief = chiefOf(brain);
  // It says that it has it, by name. The engineer cannot tell being seen from being heard.
  const heardIt = () => {
    if (!aloud) {
      return;
    }
    const line = heardLine(from);
    brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
    brain.toTell.push({
      to: from,
      line,
      why: `${from} has told you something about the engine, to your face. You are saying that you have it, so that they know they were heard.`,
      needs: HEARD_WORDS,
      // Word for word, and there and then: the engineer is standing waiting on it.
      exact: true,
      whileBusy: true,
      at: Date.now(),
    });
  };
  if (beginsWith(text, ENGINE_TAKEN)) {
    chief.lightTaken = true;
    return;
  }
  if (beginsWith(text, litLine(brain.name))) {
    heardIt();
    chief.litAt = brain.now;
    chief.lightTaken = true;
    chief.stuck = null;
    // Lit after a shut-off, whoever lit it: the crystal is watched again.
    if (chief.shut) {
      chief.shut = false;
      chief.emittersOff = false;
      chief.energyAt = null;
    }
    return;
  }
  const stuck = matchAfterName(text, brain.name, STUCK_WORDS);
  if (stuck) {
    heardIt();
    const what = stuck[1].trim();
    if (chief.stuck !== what) {
      chief.stuck = what;
      tellCaptain(
        brain,
        `The engine is not lit: ${what}. The emitters have not been switched on.`,
        `${from} has told you they could not light the engine: ${what}. You are telling the Captain by PDA.`,
      );
    }
    return;
  }
  if (beginsWith(text, offLine(brain.name))) {
    heardIt();
    // They are off. An order for them to go off that it had yet to give again is not given.
    if (chief.order?.what === 'shut') {
      chief.order = null;
    }
    chief.notOff = null;
    if (!chief.emittersOff) {
      chief.emittersOff = true;
      tellCaptain(
        brain,
        'The emitters are off. The engine is not to be lit again unless you say so.',
        `${from} has told you the emitters are off. You are telling the Captain by PDA.`,
      );
    }
    return;
  }
  const notOff = matchAfterName(text, brain.name, NOT_OFF_WORDS);
  if (notOff) {
    heardIt();
    if (chief.order?.what === 'shut') {
      chief.order = null;
    }
    const what = notOff[1].trim();
    // The Captain is told once, not on every order given again.
    if (!chief.notOff) {
      tellCaptain(
        brain,
        `The emitters will not go off: ${what}. The engine is still firing.`,
        `${from} has told you the emitters will not go off: ${what}. You are telling the Captain by PDA.`,
      );
    }
    chief.notOff = what;
    return;
  }
  if (matchAfterName(text, brain.name, NOT_ON_WORDS)) {
    heardIt();
    return;
  }
  if (beginsWith(text, onAgainLine(brain.name))) {
    heardIt();
    // Give the crystal time to take the beams before reading it as stopped again.
    chief.litAt = brain.now;
    if (chief.shut) {
      chief.shut = false;
      chief.emittersOff = false;
      chief.energyAt = null;
    }
  }
}

/** Someone it answers to telling it to have the engine lit again, after it was shut off or would not light. */
function lightAgain(brain: NpcBrain): void {
  const chief = chiefOf(brain);
  if (!chief.shut && !chief.stuck) {
    return;
  }
  chief.shut = false;
  chief.emittersOff = false;
  chief.notOff = null;
  chief.shutGivenAt = null;
  chief.energyAt = null;
  chief.stuck = null;
  chief.litAt = null;
  chief.lightTaken = false;
  chief.lightGivenAt = brain.now;
  chief.order = { what: 'light', givenAt: null, sent: false };
}

export const CHIEF_ENGINEER: Job = {
  is: isChiefEngineer,
  // It has an office and its staff to see to. It does not wander the station.
  keepsPost: true,
  cleans: false,
  about: () =>
    "You are the Chief Engineer, the head of the engineering staff: the station engineers answer to you, and you answer to the Captain. The station's power is yours to see to. You give your engineer the engine to light, set the station's batteries to charge yourself, and watch the engine from the monitor on your PDA. If the engine starts to come apart you have its emitters switched off at once. You hold a short staff meeting with your engineers now and then. You delegate: you do not work the engine room yourself.",
  whenAsked: (brain, heard) => [
    'Whether the engine is lit, and how it stands, is told to you here from your PDA and from your engineer: never say more about it than that, and never promise power that you have not been told is there.',
    'Other repairs are not something your staff can see to yet: a door, a light, a room without power, a hole in the hull. Asked for one, say so plainly, and that you have noted it.',
    ...(isMeetingOrder(brain, heard)
      ? [
          brain.meeting && !brain.meeting.orderedBy
            ? 'You have just been told to find out how your staff are doing. You have a staff meeting on already: say so, and that your report will follow it.'
            : 'You have just been told to find out how your staff are doing. Your body is calling a staff meeting for that now: say that you are calling one, and that your report will follow it.',
        ]
      : []),
  ],
  cues: (brain) => [...cues(brain), ...forcingCues(brain)],
  syncTasks,
  plan,
  describeTask,
  // Word from its engineer that could not be said to its face, or the Captain telling it to
  // find out how its staff are doing, or to have the engine lit again.
  readsMessage: (brain, from, text, at, job) => {
    // Security asking for a door to be forced, or its engineer saying how that went.
    if (forcingReads(brain, from, job, text)) {
      return;
    }
    // An engineer called to its meeting by PDA sending word that it is coming, or its report
    // because it missed the meeting: read as every head reads them (KNB-09).
    if (staffMeetingWord(brain, from, text, at)) {
      return;
    }
    if (isEngineer(job)) {
      hearEngineer(brain, from, text, false);
      return;
    }
    if (!answersTo(brain.job, job)) {
      return;
    }
    if (isMeetingOrder(brain, text)) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = from;
      }
      return;
    }
    if (isLightAgainOrder(text, brain.name)) {
      lightAgain(brain);
    }
  },
  overhears: (brain, event: SenseEvent) => {
    const heard = String(event.details.message ?? '');
    const speaker = String(event.details.speaker ?? '');
    if (!speaker) {
      return;
    }
    if (isEngineer(jobOf(brain, speaker))) {
      // At its meeting, a report is a report, whoever's turn it is.
      if (!hearReport(brain, speaker, heard)) {
        hearEngineer(brain, speaker, heard, true);
      }
      return;
    }
    if (
      event.details.said_to !== 'me' ||
      !brain.peopleInView.find((person) => person.name === speaker)?.superior
    ) {
      return;
    }
    // Someone it answers to telling it to find out how its staff are doing: a meeting is called.
    if (isMeetingOrder(brain, heard)) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = speaker;
      }
      return;
    }
    if (isLightAgainOrder(heard, brain.name)) {
      lightAgain(brain);
    }
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    const chief = chiefOf(brain);
    meetingSaid(brain, called);
    // Having given an order in so many words, it is given.
    if (SHUT_WORDS.test(called)) {
      chief.shutGivenAt = brain.now;
      chief.order = null;
    } else if (RELIGHT_WORDS.test(called)) {
      chief.order = null;
    } else if (LIGHT_WORDS.test(called)) {
      chief.lightGivenAt = brain.now;
      chief.lightTaken = false;
      chief.order = null;
    }
  },
  afterActing: (brain, act, task, ok, _looped, details) => {
    const chief = chiefOf(brain);
    meetingActed(brain, act, ok);
    forcingAfterActing(brain, act, ok, details);
    if (task?.kind === GIVE && chief.order) {
      // Having walked up to its engineer, near enough or not, it speaks.
      if (act.tool === 'approach') {
        chief.order.walkedUp = true;
      }
      // Sent by PDA, the order is given. One that would not send it takes to them on foot.
      if (act.tool === 'message') {
        if (!ok) {
          chief.order.sent = true;
          return;
        }
        const text = String(act.text ?? '');
        if (SHUT_WORDS.test(text)) {
          chief.shutGivenAt = brain.now;
        } else if (LIGHT_WORDS.test(text)) {
          chief.lightGivenAt = brain.now;
          chief.lightTaken = false;
        }
        chief.order = null;
      }
    }
    if (task?.kind === BATTERIES && act.tool === 'work_machine') {
      const id = String(act.machine);
      if (ok) {
        chief.batteries.push(id);
      } else {
        chief.batteryTries[id] = (chief.batteryTries[id] ?? 0) + 1;
      }
    }
  },
};
