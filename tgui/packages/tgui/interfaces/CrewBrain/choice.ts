/**
 * Choosing which job comes next.
 *
 * When an NPC has more than one piece of routine work it could be getting on with, which it takes
 * up first is the one decision about its work that is left to the LLM. It is a small question and
 * it is asked by itself: who the NPC is, and the two to four jobs it is between. No rules, notes
 * or history go with it, and the answer is one letter and a few words of why.
 *
 * Every job offered is one the code already knows can be done this moment, so there is no wrong
 * answer, only one that is more or less like the NPC. What will not wait is never offered: an order
 * from someone over it, and work someone is waiting on, come first whatever the NPC would sooner
 * do. And if the LLM gives no answer, the code's own order stands, so a slow or dead LLM cannot
 * hold the work up.
 *
 * How a job is done once it is chosen is not the LLM's to decide: see driver.ts.
 */
import { jobFor } from './jobs';
import { describeFeeling } from './relationships';
import { describeTask } from './tasks';
import type { NpcBrain, Plan, Task } from './types';

/** A piece of work, and what doing it comes down to right now. */
export type Work = { task: Task; plan: Plan };

/** Most jobs put to the LLM at once. More than a few and a small model stops weighing them. */
export const CHOICE_MAX_OPTIONS = 4;
/** The longest reason kept for a choice, in characters. */
const WHY_MAX_LENGTH = 80;
const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * The work an NPC may choose between, out of what it could get on with this moment, most pressing
 * first. That is its routine work, and only when nothing more pressing is ready to be done.
 */
export function choosable<T extends Work>(ready: T[]): T[] {
  return ready[0]?.task.urgency === 'routine'
    ? ready.filter(({ task }) => task.urgency === 'routine')
    : [];
}

/** The work the NPC has already chosen to do next, if it is still among what it could choose. */
export function standingChoice<T extends Work>(
  brain: NpcBrain,
  peers: T[],
): T | undefined {
  const chosen = brain.choice?.task;
  return chosen === undefined
    ? undefined
    : peers.find(({ task }) => task.id === chosen);
}

/** Says how long something has been on the list, or '' if it has only just gone on it. */
function waited(deciseconds: number): string {
  const minutes = Math.floor(deciseconds / 600);
  if (minutes < 1) {
    return '';
  }
  return `It has been on your list ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`;
}

/** What an NPC knows of one job that bears on whether to do it first, as a line it can weigh. */
function describeOption(brain: NpcBrain, { task }: Work): string {
  const facts: string[] = [];
  if (task.place && task.place === brain.location) {
    facts.push('It is right here, where you are standing.');
  } else if (task.place && /maintenance/i.test(task.place)) {
    facts.push('That is a maintenance tunnel, where few people go.');
  } else if (task.place && /hallway|corridor/i.test(task.place)) {
    facts.push('That is a hallway the crew walk through all day.');
  }
  const more = jobFor(brain.job).weighs?.(brain, task);
  if (more) {
    facts.push(more);
  }
  if (task.askedBy) {
    const feeling = describeFeeling(brain, task.askedBy);
    facts.push(
      `${task.askedBy} is waiting on it${feeling ? ` (${feeling})` : ''}.`,
    );
  }
  const since = waited(brain.now - task.createdAt);
  if (since) {
    facts.push(since);
  }
  return `${describeTask(brain, task)}.${facts.length > 0 ? ` ${facts.join(' ')}` : ''}`;
}

/** Everything one choice is asked with: the two messages, the shape of the answer, and which letter is which job. */
export type ChoiceCall = {
  system: string;
  user: string;
  schema: object;
  /** The id of the task each letter stands for. */
  letters: Record<string, number>;
};

/**
 * Builds the question put to the LLM. The jobs are listed in a different order every time: a small
 * model leans towards whatever comes first, and listed in the code's own order it would only ever
 * agree with the code.
 */
export function buildChoice(
  brain: NpcBrain,
  options: Work[],
  random: () => number = Math.random,
): ChoiceCall {
  const listed = options.slice(0, CHOICE_MAX_OPTIONS);
  for (let i = listed.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [listed[i], listed[j]] = [listed[j], listed[i]];
  }
  const letters: Record<string, number> = {};
  const lines = listed.map((work, index) => {
    letters[LETTERS[index]] = work.task.id;
    return `${LETTERS[index]}: ${describeOption(brain, work)}`;
  });
  const system = [
    `You are ${brain.name}, ${brain.job || 'a crew member'} aboard Space Station 13.`,
    brain.card.persona,
  ].join('\n');
  const user = [
    `You are in ${brain.location || 'the station'}${brain.holding.length > 0 ? `, holding ${brain.holding.join(' and ')}` : ''}.`,
    'You have more than one job you could get on with. Every one of them is yours and all of them will get done: this is only which you do first.',
    ...lines,
    'Pick as the person you are. "why" is your reason, in a few words of your own. "pick" is the letter.',
  ].join('\n');
  return {
    system,
    user,
    letters,
    schema: {
      type: 'object',
      properties: {
        // The reason comes first, so that the pick follows from it.
        why: { type: 'string', maxLength: WHY_MAX_LENGTH },
        pick: { type: 'string', enum: Object.keys(letters) },
      },
      required: ['why', 'pick'],
    },
  };
}

/** Reads the LLM's answer: the task it picked and why, or null if it named none of them. */
export function readChoice(
  reply: string,
  letters: Record<string, number>,
): { task: number; why: string } | null {
  let body: { why?: unknown; pick?: unknown };
  try {
    body = JSON.parse(reply);
  } catch {
    return null;
  }
  const task = typeof body.pick === 'string' ? letters[body.pick] : undefined;
  if (task === undefined) {
    return null;
  }
  return {
    task,
    why:
      typeof body.why === 'string'
        ? body.why.trim().slice(0, WHY_MAX_LENGTH)
        : '',
  };
}

/**
 * What an NPC is told, when it talks, about the choice it made: so that asked why one job is not
 * done yet, it can give its own reason. '' if it made no choice, or the job is finished.
 */
export function describeChoice(brain: NpcBrain): string {
  const choice = brain.choice;
  const task = choice
    ? brain.tasks.find((it) => it.id === choice.task && it.state !== 'done')
    : undefined;
  if (!choice?.why || !task) {
    return '';
  }
  return `Of the work on your list, you chose to ${describeTask(brain, task)} first. Your reason: "${choice.why}"`;
}
