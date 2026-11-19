/**
 * Orders from those over an NPC: the Captain, who is over everyone, and the head of its own
 * department.
 *
 * This is not any one job's work. Whoever an NPC answers to can tell it to do its own job's work
 * somewhere, which then comes before everything else it has to do, and can give it the orders
 * here, which anyone can carry out whatever their job.
 *
 * The server says who an NPC answers to, from the ID that person carries: nothing anyone says
 * makes them a superior. The LLM hears what was said and says which order it was, if it was one.
 * Taking the order on, carrying it out and reporting back is all code.
 */
import { knowsPlace } from '../memory';
import { finishTask } from '../tasks';
import type { Action, NpcBrain, Plan, Task } from '../types';
import { has } from './guarding';

/** Go to a room, look at what is there, and tell whoever gave the order. */
const LOOK = 'look';

/** The orders anyone can be given, each in the words the LLM is given for it. */
export const ORDERS: Record<string, string> = {
  [LOOK]: 'an order to go and look at a room and report back',
};

/** For each order, the words that mark speech as giving it. A net for when the LLM does not say. */
export const ORDER_SOUNDS: Record<string, RegExp> = {
  [LOOK]:
    /\b(look|check|inspect|see what|see if|see how|find out|report back|go and see|go see)\b/,
};

/** How long (deciseconds) it looks about a room before it has seen what there is to see. */
const LOOK_ABOUT_DS = 50;
/** How long (deciseconds) it waits where it was given the order for whoever gave it, before sending word instead. */
const WAIT_FOR_THEM_DS = 100;
/** Most things of one sort named in a report. */
const NAMED = 3;

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** Writes a short list the way it is said: "oil", "oil and ashes", "oil, ashes and dirt". */
function listed(names: string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Notes where an NPC was when it was given an order, which is where it goes back to report. */
export function noteOrdered(brain: NpcBrain, task: Task): void {
  task.from ??= brain.location;
}

/** What the NPC can see of the room it is standing in, as it would report it. */
function whatIsThere(brain: NpcBrain): string {
  const messes = brain.thingsInView
    .filter((thing) => thing.kind === 'mess')
    .map((thing) => thing.name);
  const people = brain.peopleInView.map((person) => person.name);
  const parts: string[] = [];
  if (messes.length > 0) {
    parts.push(`There is a mess there: ${listed(messes.slice(0, NAMED))}.`);
  }
  if (people.length > 0) {
    parts.push(
      `${listed(people.slice(0, NAMED))}${people.length > NAMED ? ' and others' : ''} ${people.length === 1 ? 'is' : 'are'} in there.`,
    );
  } else {
    parts.push('There is nobody in there.');
  }
  if (messes.length === 0) {
    parts.push('Nothing looks out of order.');
  }
  return parts.join(' ');
}

/** The plain words of a report on a room, to whoever gave the order. */
function reportLine(task: Task): string {
  return `${task.askedBy ? `${firstName(task.askedBy)}, ` : ''}about the ${task.place}. ${task.found}`;
}

/** Keeps each order true to how far it has got: what was found, and whether it has been reported. */
export function syncOrders(brain: NpcBrain): void {
  for (const task of brain.tasks) {
    if (task.kind !== LOOK || task.state === 'done' || !task.place) {
      continue;
    }
    if (!task.found) {
      if (
        brain.location === task.place &&
        brain.now - brain.inPlaceSince >= LOOK_ABOUT_DS
      ) {
        task.found = whatIsThere(brain);
      } else if (
        brain.location !== task.place &&
        brain.blockedPlaces.includes(task.place)
      ) {
        // Not being able to get in is a finding too, and whoever gave the order wants to hear it.
        task.found = 'I could not get in: there is no way in for me.';
      }
    }
    if (task.reported) {
      finishTask(brain, task);
    }
  }
}

/** What carrying out an order comes down to right now, or null if the task is not an order. */
export function planOrders(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind !== LOOK) {
    return null;
  }
  const place = task.place ?? '';
  const by = task.askedBy ?? 'whoever sent you';
  if (!task.found) {
    if (brain.location === place) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${place}, having a look round, as ${by} ordered.`,
      };
    }
    return {
      ready: true,
      step: `${by} ordered you to go and look at the ${place} and report back. That comes before everything else, and you are on your way there.`,
      act: { tool: 'go_to', place },
    };
  }
  const line = reportLine(task);
  if (brain.peopleInView.some((person) => person.name === task.askedBy)) {
    return {
      ready: true,
      step: `You have been to look at the ${place}, as ${by} ordered. What you found: ${task.found} ${by} is here: in "say", report that to ${by}, and add nothing you did not see.`,
      say: line,
      // Whatever else it says, it has to be about the room it was sent to.
      needs: has(place),
    };
  }
  if (task.from && brain.location !== task.from && knowsPlace(brain, task.from)) {
    return {
      ready: true,
      step: `You have been to look at the ${place}. You are going back to ${task.from} to report to ${by}.`,
      act: { tool: 'go_to', place: task.from },
    };
  }
  if (brain.now - brain.inPlaceSince < WAIT_FOR_THEM_DS) {
    return {
      ready: false,
      wait: true,
      step: `You are back to report on the ${place}, and ${by} is not here. You are giving them a moment to turn up.`,
    };
  }
  if (brain.hasPda && task.askedBy && !task.pdaFailed) {
    return {
      ready: true,
      step: `${by} is not where they were when they sent you to look at the ${place}. You are sending them a PDA message with what you found.`,
      act: {
        tool: 'message',
        person: task.askedBy,
        text: `About the ${place}. ${task.found}`,
      },
    };
  }
  return {
    ready: false,
    step: `You will tell ${by} what you found in the ${place} when you next see them.`,
  };
}

/** Says an order in a few words, or null if the task is not an order. */
export function describeOrders(task: Task): string | null {
  return task.kind === LOOK
    ? `look at the ${task.place} and report back`
    : null;
}

/** Notes that the NPC has said its report: whoever gave the order has heard it. */
export function ordersAfterSaying(brain: NpcBrain, called: string | null): void {
  for (const task of brain.tasks) {
    if (task.kind === LOOK && task.found && called === reportLine(task)) {
      task.reported = true;
    }
  }
}

/** Notes how sending a report by PDA went. */
export function ordersAfterActing(
  act: Action,
  task: Task | undefined,
  ok: boolean,
): void {
  if (task?.kind !== LOOK || act.tool !== 'message') {
    return;
  }
  if (ok) {
    task.reported = true;
  } else {
    // They cannot be reached that way. They are told when they are next seen.
    task.pdaFailed = true;
  }
}
