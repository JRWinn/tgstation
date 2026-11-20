/**
 * Getting security through a door nobody will open: an engineer forces it.
 *
 * It is the last step, and only that. An officer shut out of a room with someone wanted in it
 * asks whoever's ID opens the door (jobs/arrests.ts). When none of them has, word goes up to the
 * Head of Security, across to the Chief Engineer and down to an engineer, and the Captain is
 * sent a copy. The engineer goes to the door, opens its panel, takes its power away and pries
 * it open with a crowbar, as a player engineer would: no ID is used. Word that the door is open
 * comes back the same way, and the officer goes in.
 *
 * - With no Chief Engineer aboard, security asks an engineer itself. With no engineer aboard,
 *   the Chief Engineer does it. With neither, nobody is asked.
 * - A door that is bolted or welded is not opened this way. The engineer says so, and the
 *   Captain is told.
 * - The door is left standing open, so that the officer can get back out with its prisoner.
 *
 * Every line here is sent by PDA, word for word, and read by code. The LLM passes on no room and
 * no name.
 */
import { addTask, findTask, finishTask } from '../tasks';
import type {
  Action,
  ForcingWork,
  NpcBrain,
  Plan,
  SenseEvent,
  Task,
} from '../types';
import { doorOpened } from './arrests';
import {
  chiefAboard,
  engineersAboard,
  isChiefEngineer,
  isEngineer,
} from './engineering';
import { captainName } from './head';
import { addressOf, firstName, isSecurity } from './security';

/** Forcing one door. The task's item is the room. */
const FORCE = 'force_door';

/** How long (deciseconds) before engineering is asked about the same room again. */
const ASK_AGAIN_DS = 6000;
/**
 * How long (deciseconds) the Chief Engineer waits on word from the engineer it sent before it
 * tells whoever asked that the door has not been opened: a walk across the station, two goes at
 * the door, and the word back. The order or the word back may never have gone, or the engineer
 * may be dead or a player.
 */
const SENT_WAIT_DS = 3000;
/** How long (deciseconds) one given up on is kept, so that a late word that it is open is still passed on. */
const SENT_KEPT_DS = 9000;
/** Why, as it is passed on to security and the Captain: no "I" in it (see whyNot). */
const NO_WORD_BACK = 'nobody from engineering has said it is open';
/** How many times an engineer goes at one door before it says it could not open it. */
const FORCE_TRIES = 2;

// ---- the lines

/** Security to the Chief Engineer, or to an engineer where there is no chief. */
export function forceAskLine(to: string, room: string, name: string): string {
  return `${to}, security needs the door of the ${room} opened: ${name} is inside on a warrant. Could you send an engineer, please?`;
}
const ASK_WORDS =
  /\bsecurity needs the door of the (.+?) opened: (.+?) is inside on a warrant\b/i;

/** The Captain's copy of that. */
export function forceCopyLine(room: string, name: string): string {
  return `Captain, I have asked engineering to open the ${room}: ${name} is inside on a warrant.`;
}

/** The Chief Engineer to the engineer it sends. */
export function forceOrderLine(to: string, room: string): string {
  return `${to}, security needs the door of the ${room} opened. Go and open it, please.`;
}
const ORDER_WORDS =
  /\bsecurity needs the door of the (.+?) opened\. Go and open it\b/i;

/** The Chief Engineer to security, so that security knows someone is coming. */
export function forceSentLine(to: string, engineer: string, room: string): string {
  return `${to}, I am sending ${firstName(engineer)} to open the ${room}.`;
}
const SENT_WORDS = /\bI am sending (.+?) to open the (.+?)\./i;

/** Whoever forced the door to whoever sent them, and that one on to whoever asked. */
export function forceDoneLine(to: string, room: string): string {
  return `${to}, the door of the ${room} is open.`;
}
const DONE_WORDS = /\bthe door of the (.+?) is open\./i;

export function forceFailedLine(to: string, room: string, why: string): string {
  return `${to}, I could not open the door of the ${room}: ${why}.`;
}
const FAILED_WORDS = /\bcould not open the door of the (.+?): (.+?)\./i;

/** The Head of Security to its officer. */
export function forceOpenedLine(to: string, room: string): string {
  return `${to}, engineering has opened the ${room}.`;
}
const OPENED_WORDS = /\bengineering has opened the (.+?)\./i;

/**
 * Why a door would not open, from what the engineer's body said. The words are passed on as they
 * stand by the Chief Engineer and the Head of Security, so there is no "I" in them: the Captain
 * was sent "engineering could not open the Bar Backroom: I cannot get to it". `through` is the
 * room in between that is locked to the engineer as well, if that is why there was no way.
 */
export function whyNot(reason: string, through?: string): string {
  switch (reason) {
    case 'bolted':
      return 'it is bolted';
    case 'welded':
      return 'it is welded shut';
    case 'no_tools':
      return 'the tools for it are not to hand';
    case 'no_knowledge':
      return 'its wires are not known';
    case 'no_way':
      return through
        ? `the way to it is through the ${through}, which is locked to engineering as well`
        : 'there is no way to it';
    case 'no_door':
      return 'no door to it can be found';
    default:
      return 'it would not open';
  }
}

// ---- what each of them keeps

function forcingOf(brain: NpcBrain): ForcingWork {
  brain.forcing ??= { asked: {}, jobs: [], sent: [] };
  return brain.forcing;
}

/** Sends something by PDA, word for word. */
function send(brain: NpcBrain, to: string, line: string, why: string): void {
  if (
    !to ||
    brain.toTell.some((tell) => tell.to === to && tell.line === line)
  ) {
    return;
  }
  brain.toTell.push({ to, line, why, byPda: true, exact: true, at: Date.now() });
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

// ---- security: asking

/**
 * Asks engineering to open a room nobody would open for security. Called by whoever keeps
 * security's list when a warrant cannot be served for that reason. Once for a room, and not
 * again for ten minutes.
 */
export function askEngineering(
  brain: NpcBrain,
  room: string,
  name: string,
): void {
  const forcing = forcingOf(brain);
  const last = forcing.asked[room];
  if (last !== undefined && brain.now - last < ASK_AGAIN_DS) {
    return;
  }
  const chief = chiefAboard(brain)?.name;
  const whom = chief ?? engineersAboard(brain)[0];
  if (!whom) {
    return;
  }
  forcing.asked[room] = brain.now;
  send(
    brain,
    whom,
    forceAskLine(firstName(whom), room, name),
    `Nobody has opened the ${room} for security, and ${name} is inside on a warrant. You are asking ${whom} of engineering to have the door forced.`,
  );
  const captain = captainName(brain);
  if (captain) {
    send(
      brain,
      captain,
      forceCopyLine(room, name),
      `You have asked engineering to force the door of the ${room}. You are sending the Captain a copy.`,
    );
  }
}

// ---- everyone: reading the lines

/**
 * Takes a PDA message that is part of getting a door forced, whoever this NPC is: security
 * hearing how it went, the Chief Engineer being asked or hearing from its engineer, an engineer
 * being sent, an officer being told the door is open. Returns TRUE if it was one of those.
 */
export function forcingReads(
  brain: NpcBrain,
  from: string,
  fromJob: string,
  text: string,
): boolean {
  const forcing = forcingOf(brain);
  const security = isSecurity(brain.job);
  const engineering = isEngineer(brain.job) || isChiefEngineer(brain.job);

  // The Head of Security to its officer: the door is open.
  const opened = text.match(OPENED_WORDS)?.[1];
  if (opened && security && isSecurity(fromJob)) {
    doorOpened(brain, opened);
    return true;
  }
  // Security asking for a door to be forced.
  const ask = text.match(ASK_WORDS);
  if (ask && engineering && isSecurity(fromJob)) {
    const room = ask[1];
    const engineer = isChiefEngineer(brain.job)
      ? engineersAboard(brain)[0]
      : undefined;
    // Already with an engineer and not yet given up on: it is not sent again, nor security told twice.
    if (
      forcing.sent.some((it) => it.room === room) &&
      forcing.sentGivenUp?.[room] === undefined
    ) {
      return true;
    }
    if (engineer) {
      // It is given to an engineer, and security is told who is coming.
      forcing.sent = forcing.sent.filter((it) => it.room !== room);
      if (forcing.sentGivenUp) {
        delete forcing.sentGivenUp[room];
      }
      forcing.sent.push({ room, to: engineer, askedBy: from, at: brain.now });
      send(
        brain,
        engineer,
        forceOrderLine(firstName(engineer), room),
        `${from} of security has asked for the door of the ${room} to be forced. You are giving it to ${engineer}.`,
      );
      send(
        brain,
        from,
        forceSentLine(firstName(from), engineer, room),
        `You are telling ${from} that ${engineer} is on the way to the ${room}.`,
      );
    } else {
      // No engineer to send, or it is the engineer: it goes itself.
      takeJob(brain, room, from);
    }
    return true;
  }
  // Engineering telling security who is coming. There is nothing to do about it but know it,
  // and it is taken here so that it is not read as an order: the Head of Security answered it
  // with "I did not follow that. To declare a warrant, say...".
  if (
    SENT_WORDS.test(text) &&
    security &&
    (isEngineer(fromJob) || isChiefEngineer(fromJob))
  ) {
    return true;
  }
  // The Chief Engineer sending its engineer.
  const order = text.match(ORDER_WORDS)?.[1];
  if (order && isEngineer(brain.job) && isChiefEngineer(fromJob)) {
    takeJob(brain, order, from);
    return true;
  }
  // How it went, coming back.
  const done = text.match(DONE_WORDS)?.[1];
  const failed = done ? null : text.match(FAILED_WORDS);
  const room = done ?? failed?.[1];
  if (room && isChiefEngineer(brain.job) && isEngineer(fromJob)) {
    // Passed on to whoever asked.
    const sent = forcing.sent.find((it) => it.room === room);
    forcing.sent = forcing.sent.filter((it) => it !== sent);
    // Security was told already that it had not been opened: only an open door is news now.
    const toldNot =
      !!sent && forcing.sentGivenUp?.[room] !== undefined && !done;
    if (forcing.sentGivenUp) {
      delete forcing.sentGivenUp[room];
    }
    if (sent && !toldNot) {
      send(
        brain,
        sent.askedBy,
        done
          ? forceDoneLine(firstName(sent.askedBy), room)
          : forceFailedLine(firstName(sent.askedBy), room, failed?.[2] ?? ''),
        `${from} has ${done ? 'opened' : 'not been able to open'} the door of the ${room}. You are telling ${sent.askedBy} of security, who asked.`,
      );
    }
    return true;
  }
  if (room && security && (isEngineer(fromJob) || isChiefEngineer(fromJob))) {
    if (done) {
      // Whoever is serving the warrant is told: itself, or its officer.
      doorOpened(brain, room);
      const officer = brain.pdaPeople.find(
        (person) =>
          /security officer/i.test(person.job) && person.name !== brain.name,
      )?.name;
      if (officer) {
        send(
          brain,
          officer,
          forceOpenedLine(firstName(officer), room),
          `Engineering has opened the ${room}. You are telling ${officer}.`,
        );
      }
    } else {
      delete forcing.asked[room];
      const captain = captainName(brain);
      if (captain) {
        send(
          brain,
          captain,
          `Captain, engineering could not open the ${room}: ${failed?.[2] ?? 'it would not open'}.`,
          `Engineering could not open the ${room}. You are telling the Captain by PDA.`,
        );
      }
    }
    return true;
  }
  return false;
}

// ---- whoever forces the door

/** Takes a door to force, unless it has that one already. */
function takeJob(brain: NpcBrain, room: string, by: string): void {
  const forcing = forcingOf(brain);
  if (!forcing.jobs.some((job) => job.room === room)) {
    forcing.jobs.push({ room, by, tries: 0 });
  }
}

/**
 * For the Chief Engineer: a door sent to an engineer with no word back in five minutes. Whoever
 * asked is told it has not been opened, once; the entry is kept a while longer, so that a late
 * word that it is open is still passed on.
 */
function checkSent(brain: NpcBrain, forcing: ForcingWork): void {
  for (const it of forcing.sent) {
    if (
      forcing.sentGivenUp?.[it.room] === undefined &&
      brain.now - it.at >= SENT_WAIT_DS
    ) {
      forcing.sentGivenUp ??= {};
      forcing.sentGivenUp[it.room] = brain.now;
      send(
        brain,
        it.askedBy,
        forceFailedLine(firstName(it.askedBy), it.room, NO_WORD_BACK),
        `You sent ${it.to} to open the door of the ${it.room} and have heard nothing back. You are telling ${it.askedBy} of security, who asked.`,
      );
    }
  }
  forcing.sent = forcing.sent.filter((it) => {
    const kept = brain.now - it.at < SENT_KEPT_DS;
    if (!kept && forcing.sentGivenUp) {
      delete forcing.sentGivenUp[it.room];
    }
    return kept;
  });
}

/** Keeps a task open for each door it has been sent to force. Returns TRUE if it has one. */
export function syncForcing(brain: NpcBrain): boolean {
  const forcing = forcingOf(brain);
  if (isChiefEngineer(brain.job)) {
    checkSent(brain, forcing);
  }
  for (const task of brain.tasks) {
    if (
      task.kind === FORCE &&
      task.state !== 'done' &&
      !forcing.jobs.some((job) => job.room === task.item)
    ) {
      finishTask(brain, task);
    }
  }
  for (const job of forcing.jobs) {
    if (!findTask(brain, FORCE, { item: job.room })) {
      addTask(brain, {
        kind: FORCE,
        urgency: 'asked',
        source: 'own',
        item: job.room,
        askedBy: job.by,
      });
    }
  }
  return forcing.jobs.length > 0;
}

export function planForcing(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind !== FORCE) {
    return null;
  }
  const job = forcingOf(brain).jobs.find((it) => it.room === task.item);
  if (!job) {
    return { ready: false, step: 'That door is no longer yours to open.' };
  }
  return {
    ready: true,
    step: `Security needs the door of the ${job.room} opened, and nobody whose ID opens it has. You are going to it to open its panel, take its power away and pry it open with your crowbar.`,
    // Numbered, so that a second go is made at once and not held back as a step that keeps failing.
    act: { tool: 'force_door', place: job.room, attempt: job.tries + 1 },
  };
}

export function describeForcing(task: Task): string | null {
  return task.kind === FORCE ? `force the door of the ${task.item}` : null;
}

/** Notes how forcing a door went, and sends word of it back to whoever sent it. */
export function forcingAfterActing(
  brain: NpcBrain,
  act: Action,
  ok: boolean,
  details: SenseEvent['details'] = {},
): void {
  if (act.tool !== 'force_door') {
    return;
  }
  const forcing = forcingOf(brain);
  const job = forcing.jobs.find((it) => it.room === act.place);
  if (!job) {
    return;
  }
  const reason = String(details.reason ?? '');
  // A door that is bolted or welded, or one it has not the tools or the knowledge for, is not
  // gone at twice. Anything else is tried once more.
  const final = ['bolted', 'welded', 'no_tools', 'no_knowledge', 'no_door'];
  if (!ok) {
    job.tries++;
    if (job.tries < FORCE_TRIES && !final.includes(reason)) {
      return;
    }
  }
  forcing.jobs = forcing.jobs.filter((it) => it !== job);
  const to = addressOf(job.by, jobOf(brain, job.by));
  send(
    brain,
    job.by,
    ok
      ? forceDoneLine(to, job.room)
      : forceFailedLine(
          to,
          job.room,
          whyNot(
            reason,
            typeof details.through === 'string' ? details.through : undefined,
          ),
        ),
    ok
      ? `You have forced the door of the ${job.room}. You are telling ${job.by}, who sent you.`
      : `You could not open the door of the ${job.room}. You are telling ${job.by}, who sent you, and why.`,
  );
}

/** What the LLM should know of a door it has been sent to force, so that what it says is true. */
export function forcingCues(brain: NpcBrain): string[] {
  return (brain.forcing?.jobs ?? []).map(
    (job) =>
      `${job.by} has sent you to force the door of the ${job.room} for security. Your body sees to it.`,
  );
}
