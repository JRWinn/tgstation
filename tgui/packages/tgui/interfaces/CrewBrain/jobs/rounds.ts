/**
 * Rounds: looking in on the rest of one's department when there is nothing else to do.
 *
 * Crew who keep a post would otherwise never leave it, and so never see the state of the rooms
 * behind them. Those rooms are often locked to everyone else, so if whoever works there does not
 * look, nobody does: a mess in the delivery office stays there because the only people who could
 * report it never go in. So when things are quiet, the NPC walks to one of those rooms, stands in
 * it long enough to see what is there, and goes back to its post.
 *
 * This is not any one job's work. It belongs to anyone with a post and a department round it, so
 * every such job calls on it. The server says which rooms those are: the ones of the same
 * department that the NPC's own ID opens.
 */
import { addTask, dropTask, finishTask } from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';
import { stagger } from './guarding';

/** One room of its department to go and look in on. The task's place is the room. */
const LOOK_IN = 'look_in';
/** How long (deciseconds) before the same room is looked in on again. */
const LOOK_IN_EVERY_DS = 6000;
/** How long (deciseconds) it stays at its post between one look round and the next. */
const BETWEEN_LOOKS_DS = 1200;
/** How long (deciseconds) it stands in a room to count as having looked round it. */
const LOOK_ABOUT_DS = 50;
/** How long (deciseconds) it keeps trying to get to a room before it lets that look go. */
const GIVE_UP_DS = 1800;
/** How long (milliseconds) after someone comes into view it stays put, in case they have come to ask for something. */
const JUST_ARRIVED_MS = 30000;
/** How long (milliseconds) after someone last spoke to it before it will walk off to look round. */
const LEFT_ALONE_MS = 60000;

/** The look round it is on, if it is on one. */
function current(brain: NpcBrain): Task | undefined {
  return brain.tasks.find(
    (task) => task.kind === LOOK_IN && task.state !== 'done',
  );
}

/** TRUE while it is on its way to look in on a room, or standing in one looking. */
export function roundsInHand(brain: NpcBrain): boolean {
  return !!current(brain);
}

/**
 * Starts a look round when one is due and the NPC is free, and ends it when the room has been
 * seen or cannot be reached. `free` says the NPC has no other work of its own in hand.
 */
export function syncRounds(brain: NpcBrain, free: boolean): void {
  const task = current(brain);
  if (task?.place) {
    const seen =
      brain.location === task.place &&
      brain.now - brain.inPlaceSince >= LOOK_ABOUT_DS;
    if (seen) {
      brain.lookedIn[task.place] = brain.now;
      finishTask(brain, task);
    } else if (
      brain.blockedPlaces.includes(task.place) ||
      brain.now - task.createdAt > GIVE_UP_DS
    ) {
      // No way in today. It is left alone as long as a room it had looked in on would be.
      brain.lookedIn[task.place] = brain.now;
      dropTask(brain, task);
    }
    return;
  }
  // Nobody has just come up to the counter, nobody has just been talking to it, and it has been
  // back at its post a while since the last look. Someone who has only been standing about for
  // a while is not waiting on it. Two at one post do not set off at the same moment.
  const lastLook = Math.max(0, ...Object.values(brain.lookedIn));
  const settled = BETWEEN_LOOKS_DS + stagger(brain, BETWEEN_LOOKS_DS);
  const quiet =
    free &&
    !!brain.post &&
    brain.location === brain.post &&
    Date.now() - brain.lastArrivalAt > JUST_ARRIVED_MS &&
    Date.now() - brain.lastSpokenToAt > LEFT_ALONE_MS &&
    brain.now - brain.inPlaceSince > settled &&
    (lastLook === 0 || brain.now - lastLook > settled);
  if (!quiet) {
    return;
  }
  // The room that has gone longest without a look, if any has gone long enough.
  const due = brain.lookInRooms
    .filter(
      (room) =>
        room !== brain.location &&
        (brain.lookedIn[room] === undefined ||
          brain.now - brain.lookedIn[room] > LOOK_IN_EVERY_DS),
    )
    .sort((a, b) => (brain.lookedIn[a] ?? 0) - (brain.lookedIn[b] ?? 0))[0];
  if (due) {
    addTask(brain, {
      kind: LOOK_IN,
      place: due,
      urgency: 'routine',
      source: 'own',
    });
  }
}

/** What a look round comes down to right now, or null if the task is not one. */
export function planRounds(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind !== LOOK_IN || !task.place) {
    return null;
  }
  if (brain.location === task.place) {
    return {
      ready: false,
      step: `You are looking round the ${task.place} to see that all is as it should be.`,
    };
  }
  return {
    ready: true,
    step: `Things are quiet, so you are going to look in on the ${task.place}, which is part of your department.`,
    act: { tool: 'go_to', place: task.place },
  };
}

/** Says a look round in a few words, or null if the task is not one. */
export function describeRounds(task: Task): string | null {
  return task.kind === LOOK_IN ? `look in on the ${task.place}` : null;
}
