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

const KINDS = new Set([UNLOAD, MAIL, DELIVER, RECYCLE, SEND]);

/** TRUE if the task is one of these. */
export function isFreight(task: Task): boolean {
  return KINDS.has(task.kind);
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
  // The shuttle goes back once there is nothing left to come off it or go on it.
  keep(
    brain,
    SEND,
    docked &&
      freight?.toUnload === 0 &&
      freight.emptyCrates === 0 &&
      !freight.mailCrate &&
      !brain.orderPending &&
      !brain.crateWaiting,
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
): void {
  if (task?.kind === DELIVER && task.item && act.tool === 'message') {
    brain.mailTold[task.item] = brain.now;
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
