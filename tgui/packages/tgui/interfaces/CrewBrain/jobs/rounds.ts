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
 *
 * Where several keep one post, they take it in turns and never go together: someone stays to see
 * to whoever comes. Whoever goes says so aloud, in so many words, which is what tells the others
 * that the job is taken, and a room one of them has looked in on is not due a look from the next.
 */
import { addTask, dropTask, finishTask } from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';
import { stagger } from './guarding';

/** One room of its department to go and look in on. The task's place is the room. */
const LOOK_IN = 'look_in';
/** How long (deciseconds) before the same room is looked in on again, by whoever of those at the post goes. */
const LOOK_IN_EVERY_DS = 3000;
/** How long (deciseconds) it stays at its post between one look round and the next. */
const BETWEEN_LOOKS_DS = 450;
/** How long (deciseconds) one of those at a post saying it is off to look round keeps the others at the post. */
const TURN_TAKEN_DS = 600;
/** How long (deciseconds) it stands in a room to count as having looked round it. */
const LOOK_ABOUT_DS = 50;
/** How long (deciseconds) it keeps trying to get to a room before it lets that look go. */
const GIVE_UP_DS = 1800;
/** How long (milliseconds) after someone comes into view it stays put, in case they have come to ask for something. */
const JUST_ARRIVED_MS = 20000;
/** How long (milliseconds) after someone last spoke to it before it will walk off to look round. */
const LEFT_ALONE_MS = 30000;
/** The plain words it says, to those it works with, as it sets off. The name of the room follows. */
const GOING_TO_LOOK = 'I am going to look in on the';

/**
 * What those who keep each post know between them, by the name of the post: who last set off to
 * look round and when, and when each room was last looked in on by any of them. Times are server
 * time. It is shared by every NPC in this window, the way a word said across the counter would be.
 */
const turns: Record<string, { by: string; at: number }> = {};
const looked: Record<string, Record<string, number>> = {};

/** TRUE if the task is a look round. */
export function isRounds(task: Task): boolean {
  return task.kind === LOOK_IN;
}

/** Forgets whose turn it was and what has been looked in on. Called when the window closes. */
export function clearRounds(): void {
  for (const post of Object.keys(turns)) {
    delete turns[post];
  }
  for (const post of Object.keys(looked)) {
    delete looked[post];
  }
}

/** When a room was last looked in on, by this NPC or by anyone it shares its post with. */
function lastLooked(brain: NpcBrain, room: string): number | undefined {
  const own = brain.lookedIn[room];
  const shared = brain.post ? looked[brain.post]?.[room] : undefined;
  return own === undefined && shared === undefined
    ? undefined
    : Math.max(own ?? 0, shared ?? 0);
}

/** Notes that a room has been looked in on, or cannot be for now, for everyone who keeps the post. */
function noteLooked(brain: NpcBrain, room: string): void {
  brain.lookedIn[room] = brain.now;
  if (brain.post) {
    looked[brain.post] ??= {};
    looked[brain.post][room] = brain.now;
  }
}

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
      noteLooked(brain, task.place);
      finishTask(brain, task);
    } else if (
      brain.blockedPlaces.includes(task.place) ||
      brain.now - task.createdAt > GIVE_UP_DS
    ) {
      // No way in today. It is left alone as long as a room it had looked in on would be.
      noteLooked(brain, task.place);
      dropTask(brain, task);
    }
    return;
  }
  // Nobody has just come up to the counter, nobody has just been talking to it, and it has been
  // back at its post a while since the last look. Someone who has only been standing about for
  // a while is not waiting on it. Two at one post do not set off at the same moment.
  const lastLook = Math.max(0, ...Object.values(brain.lookedIn));
  const settled = BETWEEN_LOOKS_DS + stagger(brain, BETWEEN_LOOKS_DS);
  // A workmate has set off to look round, and said so. This one stays at the post meanwhile.
  const turn = brain.post ? turns[brain.post] : undefined;
  const theirTurn =
    !!turn && turn.by !== brain.name && brain.now - turn.at < TURN_TAKEN_DS;
  const quiet =
    free &&
    !theirTurn &&
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
    .filter((room) => {
      const last = lastLooked(brain, room);
      return (
        room !== brain.location &&
        (last === undefined || brain.now - last > LOOK_IN_EVERY_DS)
      );
    })
    .sort(
      (a, b) => (lastLooked(brain, a) ?? 0) - (lastLooked(brain, b) ?? 0),
    )[0];
  if (due && brain.post) {
    addTask(brain, {
      kind: LOOK_IN,
      place: due,
      urgency: 'routine',
      source: 'own',
    });
    // Its turn from this moment, before it has so much as opened its mouth: two who decide in
    // the same second would otherwise both go.
    turns[brain.post] = { by: brain.name, at: brain.now };
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
  // With someone at the post to hear it, it says where it is off to before it goes: that is what
  // tells them the job is taken, and to stay.
  const workmate = brain.peopleInView.some(
    (person) => person.in_post && person.belongs && person.name !== brain.name,
  );
  if (workmate && !task.announced && brain.location === brain.post) {
    return {
      ready: true,
      step: `Things are quiet, so you are going to look in on the ${task.place}, which is part of your department. You are saying so first, so that whoever is at the post with you knows to stay.`,
      say: `${GOING_TO_LOOK} ${task.place}.`,
      exact: true,
    };
  }
  return {
    ready: true,
    step: `Things are quiet, so you are going to look in on the ${task.place}, which is part of your department.`,
    act: { tool: 'go_to', place: task.place },
  };
}

/** Notes that the NPC has said it is off to look in on a room: it has, and need not say so again. */
export function roundsAfterSaying(brain: NpcBrain, called: string | null): void {
  if (!called?.startsWith(GOING_TO_LOOK)) {
    return;
  }
  const task = current(brain);
  if (task) {
    task.announced = true;
  }
  if (brain.post) {
    turns[brain.post] = { by: brain.name, at: brain.now };
  }
}

/** Says a look round in a few words, or null if the task is not one. */
export function describeRounds(task: Task): string | null {
  return task.kind === LOOK_IN ? `look in on the ${task.place}` : null;
}
