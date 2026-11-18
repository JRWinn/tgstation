/**
 * Tidying: keeping the floor of one's own work area clear.
 *
 * This is not any one job's work. It belongs to anyone who has a place of their own to keep in
 * order, so every job that has one calls on it. The server knows what is lying about and where each
 * thing goes: rubbish in a bin, what spilled from a crate back in it, the rest on a table. All that
 * is decided here is when to get on with it.
 */
import { addTask, findTask, finishTask } from '../tasks';
import type { NpcBrain, Plan, Task } from '../types';

/** Things lying about in the NPC's work area, to be put away. */
const PUT_AWAY = 'put_away';

/** TRUE if the task is putting things away. */
export function isTidying(task: Task): boolean {
  return task.kind === PUT_AWAY;
}

/** Opens the task while there is something lying about, and closes it when there is not. */
export function syncTidying(brain: NpcBrain): void {
  const task = findTask(brain, PUT_AWAY);
  if (brain.tidyTodo > 0 && !task) {
    addTask(brain, { kind: PUT_AWAY, urgency: 'routine', source: 'own' });
  } else if (brain.tidyTodo === 0 && task) {
    finishTask(brain, task);
  }
}

/** TRUE while there is tidying the NPC could be getting on with. */
export function tidyingInHand(brain: NpcBrain): boolean {
  return brain.tasks.some(
    (task) => task.kind === PUT_AWAY && task.state === 'open',
  );
}

/**
 * What the tidying comes down to right now, or null if the task is not this. Tidying is what gets
 * done when there is nothing else to do: `busy` says the NPC has other work of its own in hand.
 */
export function planTidying(
  brain: NpcBrain,
  task: Task,
  busy: boolean,
): Plan | null {
  if (task.kind !== PUT_AWAY) {
    return null;
  }
  if (busy) {
    return {
      ready: false,
      step: 'It can wait until your other work is seen to.',
    };
  }
  const count = brain.tidyTodo;
  return {
    ready: true,
    step: `There ${count === 1 ? 'is something' : 'are things'} lying about on the floor of your work area. You are putting ${count === 1 ? 'it' : 'them'} away: rubbish in the bin, what spilled out of a crate back in it, and the rest on a table.`,
    act: { tool: 'tidy' },
  };
}

/** Says the tidying task in a few words, or null if the task is not this. */
export function describeTidying(task: Task): string | null {
  return task.kind === PUT_AWAY
    ? 'put away what is lying about in your work area'
    : null;
}
