/**
 * Freight: what cargo staff do about the supply shuttle beyond seeing one order through.
 *
 * A shuttle that has docked is not left sitting there. What came on it is hauled off into the bay.
 * Mail is taken out of its crate, whoever it is for is sent a PDA message, and it is handed over
 * when they come to the counter. Crates with nothing left in them go back aboard, and the shuttle
 * is sent away with them.
 *
 * None of that is a judgement, so none of it goes to the LLM: the server says what is waiting, and
 * these tasks say what to do about it.
 */
import { addTask, blockTask, findTask, finishTask } from '../tasks';
import type { Action, NpcBrain, Plan, Task } from '../types';

/** Crates with something in them that are still aboard the docked shuttle. */
const UNLOAD = 'unload';
/** A mail crate in the bay with mail still in it. */
const MAIL = 'mail';
/** Mail the NPC is holding for one person. The task's item is their name. */
const DELIVER = 'deliver';
/** Empty crates in cargo's rooms, to go back on the shuttle. */
const RECYCLE = 'recycle';
/** A shuttle with nothing left to come off it, to be sent back. */
const SEND = 'send';
/** A crate left where it does not belong: within a tile of a door, loose in the bay off the marked squares, or an empty brought back to the lobby. */
const STOW = 'stow';
/** Empties waiting to go back with the shuttle away: it is called in for them. */
const CALL = 'call_shuttle';

const KINDS = new Set([UNLOAD, MAIL, DELIVER, RECYCLE, SEND, STOW, CALL]);
/** The freight steps put off a while when they keep failing (JOBS-04). */
const RETRIED = new Set([UNLOAD, MAIL, RECYCLE, STOW, CALL, SEND]);
/** How many failures running put a freight step off. */
const FAILS_TO_PUT_OFF = 3;
/** How long (deciseconds) a freight step that keeps failing is put off. */
const FREIGHT_RETRY_DS = 1800;

/** How many empties have to be waiting before the shuttle is called in for them. */
const EMPTIES_TO_CALL = 3;
/** How long (deciseconds) even one empty waits before the shuttle is called in for it. */
const EMPTY_WAITS_DS = 6000;
/** When each NPC first saw an empty waiting with the shuttle away (server time), by its id. */
const emptiesSince = new Map<string, number>();

/** TRUE if the task is one of these. */
export function isFreight(task: Task): boolean {
  return KINDS.has(task.kind);
}

/**
 * Which piece of the standing work a freight task is part of, where a Quartermaster has divided
 * it: the shuttle, the rooms, or neither. Mail in hand is whoever holds it's to hand over.
 */
export function freightDuty(task: Task): 'shuttle' | 'rooms' | null {
  switch (task.kind) {
    case UNLOAD:
    case MAIL:
    case RECYCLE:
    case SEND:
    case CALL:
      return 'shuttle';
    case STOW:
      return 'rooms';
    default:
      return null;
  }
}

/** TRUE while there is freight work the NPC could be getting on with. */
export function freightInHand(brain: NpcBrain): boolean {
  return brain.tasks.some((task) => isFreight(task) && task.state === 'open');
}

/** Opens a task of this kind while there is cause for one, and closes it when there is not. */
function keep(brain: NpcBrain, kind: string, wanted: boolean): void {
  const task = findTask(brain, kind);
  if (wanted && !task) {
    addTask(brain, { kind, urgency: 'routine', source: 'own' });
  } else if (!wanted && task) {
    finishTask(brain, task);
  }
}

/** Keeps the freight tasks true to what the server says is on the shuttle, in the bay and in the bag. */
export function syncFreight(brain: NpcBrain): void {
  const freight = brain.freight;
  const docked = !!freight?.shuttleDocked;
  keep(brain, UNLOAD, docked && (freight?.toUnload ?? 0) > 0);
  keep(brain, MAIL, !!freight?.mailCrate);
  keep(brain, RECYCLE, docked && (freight?.emptyCrates ?? 0) > 0);
  // A crate is never left by a door. One that is there, dropped on the way somewhere or put down
  // by anyone, is in the way of whoever comes through, and moving it comes before the routine.
  const misplaced = (freight?.misplaced ?? 0) > 0;
  const stow = findTask(brain, STOW);
  if (misplaced && !stow) {
    addTask(brain, { kind: STOW, urgency: 'asked', source: 'own' });
  } else if (!misplaced && stow) {
    finishTask(brain, stow);
  }
  // Empties are not left waiting for the next order to bring the shuttle. Three of them, or one
  // that has waited ten minutes, and it is called in to take them back.
  const empties = freight?.emptyCrates ?? 0;
  if (docked || empties === 0) {
    emptiesSince.delete(brain.id);
  } else if (!emptiesSince.has(brain.id)) {
    emptiesSince.set(brain.id, brain.now);
  }
  const waited = brain.now - (emptiesSince.get(brain.id) ?? brain.now);
  keep(
    brain,
    CALL,
    !docked &&
      !brain.orderPending &&
      (empties >= EMPTIES_TO_CALL || (empties > 0 && waited > EMPTY_WAITS_DS)),
  );
  // A step that kept failing is left until its time to try again is up (JOBS-04). A blocked task
  // is not in hand, so the rounds, tidying and the walk back to the post go on meanwhile.
  for (const task of brain.tasks) {
    if (RETRIED.has(task.kind) && task.state !== 'done') {
      blockTask(
        task,
        task.retryAt !== undefined && brain.now < task.retryAt
          ? `it has failed three times running (${task.failedOn ?? 'it would not go'}), and you will try again in a few minutes`
          : null,
      );
    }
  }
  // The shuttle goes back once there is nothing left to come off it or go on it. A mail crate
  // that cannot be emptied just now is in the bay, not aboard, and does not keep it (JOBS-04).
  const mailStuck = findTask(brain, MAIL)?.state === 'blocked';
  keep(
    brain,
    SEND,
    docked &&
      freight?.toUnload === 0 &&
      freight.emptyCrates === 0 &&
      (!freight.mailCrate || mailStuck) &&
      !brain.orderPending,
  );

  // Mail is held for each person until it is in their hands.
  const holding = new Set(freight?.mailFor ?? []);
  for (const name of holding) {
    if (!findTask(brain, DELIVER, { item: name })) {
      // Someone's mail is theirs to have: it comes before the routine of the bay.
      addTask(brain, { kind: DELIVER, item: name, urgency: 'asked', source: 'own' });
    }
  }
  for (const task of brain.tasks) {
    if (task.kind !== DELIVER || task.state === 'done' || !task.item) {
      continue;
    }
    if (!holding.has(task.item)) {
      finishTask(brain, task);
      delete brain.mailTold[task.item];
      continue;
    }
    const here = brain.peopleInView.some((person) => person.name === task.item);
    const told = task.item in brain.mailTold || !brain.hasPda;
    blockTask(
      task,
      here || !told
        ? null
        : `${task.item} has been told, and has not come to the counter for it yet`,
    );
  }
}

/** What one of the freight tasks comes down to right now, or null if the task is not freight. */
export function planFreight(brain: NpcBrain, task: Task): Plan | null {
  const freight = brain.freight;
  switch (task.kind) {
    case UNLOAD: {
      const count = freight?.toUnload ?? 0;
      return {
        ready: true,
        step: `The supply shuttle has docked with ${count === 1 ? 'a crate' : `${count} crates`} still aboard, and you are hauling ${count === 1 ? 'it' : 'the next one'} off into the bay.`,
        act: { tool: 'unload' },
      };
    }
    case MAIL:
      return {
        ready: true,
        step: 'A crate of mail has come in. You are taking the mail out of it, to keep for whoever each piece is addressed to.',
        act: { tool: 'collect_mail' },
      };
    case RECYCLE:
      return {
        ready: true,
        step: 'There is an empty crate here, and the supply shuttle is in. You are putting the crate aboard to go back.',
        act: { tool: 'recycle' },
      };
    case STOW:
      return {
        ready: true,
        step: 'A crate has been left where it does not belong: right by a door, loose in the middle of the bay, or empty out in the lobby. You are hauling it to where crates are kept: a marked square on the bay floor if one is free.',
        act: { tool: 'stow_crate' },
      };
    case CALL: {
      const waiting = freight?.emptyCrates ?? 0;
      return {
        ready: true,
        step: `${waiting === 1 ? 'An empty crate is' : `${waiting} empty crates are`} waiting to go back and the supply shuttle is away. You are going to the supply console to call it in for ${waiting === 1 ? 'it' : 'them'}.`,
        act: { tool: 'send_shuttle' },
      };
    }
    case SEND: {
      const empties = freight?.emptiesAboard ?? 0;
      return {
        ready: true,
        step: `The supply shuttle is unloaded${empties ? ` and has ${empties === 1 ? 'an empty crate' : `${empties} empty crates`} aboard` : ''}. You are going to the supply console to send it back.`,
        act: { tool: 'send_shuttle' },
      };
    }
    case DELIVER: {
      const name = task.item ?? '';
      const person = brain.peopleInView.find((other) => other.name === name);
      if (person) {
        return {
          ready: true,
          step: `${name} is here, and you are holding mail for them. You are taking it over to them.`,
          act: { tool: 'hand_mail', person: person.handle },
        };
      }
      return {
        ready: true,
        step: `You are holding mail for ${name}, and are sending them a PDA message to say it is waiting at the counter.`,
        act: {
          tool: 'message',
          person: name,
          text: 'There is mail for you at cargo. Come by the counter in the Cargo Lobby when you can and I will hand it over.',
        },
      };
    }
    default:
      return null;
  }
}

/** Says one of the freight tasks in a few words, or null if the task is not freight. */
export function describeFreight(task: Task): string | null {
  switch (task.kind) {
    case UNLOAD:
      return 'unload the supply shuttle';
    case MAIL:
      return 'take the mail out of its crate';
    case DELIVER:
      return `get ${task.item} their mail`;
    case RECYCLE:
      return 'put the empty crates aboard the supply shuttle';
    case SEND:
      return 'send the supply shuttle back';
    case STOW:
      return 'move a crate that has been left where it does not belong';
    case CALL:
      return 'call the supply shuttle in for the empty crates';
    default:
      return null;
  }
}

/**
 * Notes that the message about someone's mail has gone, or could not be sent. Either way they are
 * not messaged again: someone with no PDA cannot be told this way, and trying again would not
 * change that. The mail waits for them.
 */
export function afterFreight(
  brain: NpcBrain,
  act: Action,
  task: Task | undefined,
  ok = true,
  text?: string,
): void {
  if (task?.kind === DELIVER && task.item && act.tool === 'message') {
    brain.mailTold[task.item] = brain.now;
  }
  // A step that keeps failing is put off a while, so the rest of the work goes on: a bag too full
  // for the mail kept the technician from its rounds and the shuttle in the dock all round. Not
  // on one failure: the driver's own back-off sees to a walk that fails once (JOBS-04).
  if (!task || !RETRIED.has(task.kind)) {
    return;
  }
  if (ok) {
    task.fails = 0;
    return;
  }
  task.fails = (task.fails ?? 0) + 1;
  if (task.fails >= FAILS_TO_PUT_OFF) {
    task.fails = 0;
    task.retryAt = brain.now + FREIGHT_RETRY_DS;
    task.failedOn = text?.trim() || 'it would not go';
  }
}

/** What the LLM should know about the freight, so that what it says about mail and the shuttle is true. */
export function freightCues(brain: NpcBrain): string[] {
  const names = brain.freight?.mailFor ?? [];
  if (names.length === 0) {
    return [];
  }
  const here = names.filter((name) =>
    brain.peopleInView.some((person) => person.name === name),
  );
  return [
    `You are holding mail for ${names.join(', ')}. Your body hands it over by itself when they come to the counter.${here.length > 0 ? ` ${here.join(' and ')} ${here.length === 1 ? 'is' : 'are'} here now.` : ''}`,
  ];
}
