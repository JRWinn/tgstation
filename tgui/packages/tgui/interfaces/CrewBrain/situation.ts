/**
 * What an NPC is told about the moment it is in: what it can see, and what matters right now.
 *
 * The person layer says what is true for anyone. The NPC's job adds what matters about its work.
 */
import { isJanitor, jobFor } from './jobs';
import { recentlyToldOfMess, withKind } from './memory';
import { describeFeeling } from './relationships';
import { describeWork } from './tasks';
import type { NpcBrain, ThingInView } from './types';

/** Most kinds of thing listed as in view right now. */
const THINGS_IN_VIEW_SHOWN = 12;

/** How each kind of place is described to the LLM, so it can judge whether it is somewhere to linger. */
const PLACE_KIND_TEXT = {
  hallway: 'a hallway that people walk through',
  maintenance: 'a maintenance tunnel',
  room: 'a room',
} as const;

/** Describes what is in view right now, for the top of a report. */
export function describeView(brain: NpcBrain): string[] {
  const lines: string[] = [];
  if (brain.location) {
    lines.push(
      `You are in: ${brain.location} (${PLACE_KIND_TEXT[brain.placeKind] ?? 'a room'}).${brain.resting ? ' You are resting here.' : ''}`,
    );
  }
  const things = brain.thingsInView.slice(0, THINGS_IN_VIEW_SHOWN);
  if (things.length > 0) {
    lines.push(`You can see: ${things.map(describeThing).join(', ')}.`);
  } else {
    lines.push('You can see nothing of note.');
  }
  lines.push(
    brain.holding.length > 0
      ? `You are holding: ${brain.holding.join(', ')}.`
      : 'Your hands are empty.',
  );
  if (brain.peopleInView.length > 0) {
    // How the NPC feels about each of them goes right beside the name, where it will be read.
    const people = brain.peopleInView.map((person) => {
      const feeling = describeFeeling(brain, person.name);
      return `${person.name}${person.job ? `, ${person.job}` : ''} (${person.handle}${feeling ? `; ${feeling}` : ''})`;
    });
    lines.push(`People in view: ${people.join(', ')}.`);
  }
  return lines;
}

function describeThing(thing: ThingInView): string {
  const name = withKind(thing.name, thing.kind);
  return thing.count > 1 ? `${name} x${thing.count}` : name;
}

/** The steps record under which asking for the door is kept, so that it is not asked too often. */
export const SHUT_IN_KEY = 'shut-in';

/**
 * Who a shut-in NPC asks for the door: each person in view in turn, one at a time. Asking the whole
 * room in a row is what a machine would do.
 */
export function whoToAskForTheDoor(brain: NpcBrain): string | null {
  const people = brain.peopleInView;
  if (people.length === 0) {
    return null;
  }
  // Whoever let it in can let it out again, so they are asked before anyone.
  if (brain.letInBy && people.some((person) => person.name === brain.letInBy)) {
    return brain.letInBy;
  }
  const asked = brain.failures.get(SHUT_IN_KEY)?.count ?? 0;
  return people[asked % people.length].name;
}

/**
 * Says that the NPC cannot get out of the room it is in, and who is there to ask about it. It
 * does not know why: only that it has tried to leave more than once and found no way out.
 */
export function describeShutIn(brain: NpcBrain): string {
  const helper = whoToAskForTheDoor(brain);
  return `You are shut in ${brain.location}: you have tried to leave and cannot find a way out.${helper ? ` ${helper} is here: in "say", ask ${helper} outright to open the door for you.` : ' There is nobody here to ask.'}`;
}

/**
 * Says what matters right now: work to be done, and what stands in the way of doing it.
 * These lines go last in the report, just above the list of options, where a small model
 * pays them the most attention.
 */
export function describeSituation(brain: NpcBrain): string[] {
  const job = jobFor(brain.job);
  const lines: string[] = [];
  if (brain.doing) {
    lines.push(`You are in the middle of ${brain.doing}.`);
  }
  lines.push(...job.cues(brain));
  if (brain.shutIn) {
    lines.push(describeShutIn(brain));
  }

  // Anyone who does not clean is only told of a mess when there is a janitor right there to tell.
  if (!job.cleans) {
    const messes = brain.thingsInView.filter((thing) => thing.kind === 'mess');
    const janitors = brain.peopleInView
      .filter((person) => isJanitor(person.job))
      .map((person) => person.name);
    if (messes.length > 0 && janitors.length > 0 && !recentlyToldOfMess(brain)) {
      lines.push(
        `There is a mess here (${messes.map((mess) => mess.name).join(', ')}). Cleaning is not your job, but ${janitors.join(' and ')} ${janitors.length === 1 ? 'is a janitor' : 'are janitors'}: you could use "say" to mention it to them.`,
      );
    }
  }
  // Looking through storage and exploring are for those free to walk about.
  if (!job.keepsPost) {
    if (brain.storageHere > 0) {
      lines.push(
        `There ${brain.storageHere === 1 ? 'is 1 closet, locker or crate' : `are ${brain.storageHere} closets, lockers or crates`} in this room that you have not looked inside lately.`,
      );
    }
    if (brain.exploredEverything) {
      lines.push('You have seen every part of the station you can reach.');
    }
  }
  // The work comes last of all, nearest the options, so that it is what the choice is made from.
  lines.push(...describeWork(brain));
  return lines;
}
