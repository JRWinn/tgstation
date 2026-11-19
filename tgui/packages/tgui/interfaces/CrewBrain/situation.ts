/**
 * What an NPC is told about the moment it is in: what it can see, and what matters right now.
 *
 * The person layer says what is true for anyone. The NPC's job adds what matters about its work.
 */
import { describeChoice } from './choice';
import { asideCues } from './jobs/aside';
import { guardCues } from './jobs/guarding';
import { meetingCues } from './jobs/meetings';
import { wantedCues } from './jobs/wanted';
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
      // What anyone could see of them at a glance: down and not getting up, or in cuffs.
      const state = [
        person.down ? 'lying still' : '',
        person.cuffed ? 'in cuffs' : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `${person.name}${person.job ? `, ${person.job}` : ''} (${person.handle}${feeling ? `; ${feeling}` : ''})${state ? ` (${state})` : ''}`;
    });
    lines.push(`People in view: ${people.join(', ')}.`);
  }
  return lines;
}

function describeThing(thing: ThingInView): string {
  const name = withKind(thing.name, thing.kind);
  return thing.count > 1 ? `${name} x${thing.count}` : name;
}

/** How long (milliseconds) fire doors that stopped it, or an alarm it reset, are still worth telling the LLM of. */
const FIRE_DOORS_TOLD_MS = 120000;

/** The steps record under which asking for the door is kept, so that it is not asked too often. */
export const SHUT_IN_KEY = 'shut-in';

/**
 * Who a shut-in NPC asks for the door next: someone in view it has not asked yet, one at a time.
 * Each person is asked once. Asked again and again, they would be right to call it nagging, so it
 * asks again only when someone new turns up. Null if there is nobody left to ask.
 */
export function whoToAskForTheDoor(brain: NpcBrain): string | null {
  const asked = brain.outAsks?.asked ?? [];
  const people = brain.peopleInView.filter(
    (person) => !asked.includes(person.name),
  );
  if (people.length === 0) {
    return null;
  }
  // Whoever let it in can let it out again, so they are asked before anyone.
  if (brain.letInBy && people.some((person) => person.name === brain.letInBy)) {
    return brain.letInBy;
  }
  return people[0].name;
}

/**
 * Says that the NPC cannot get out of the room it is in, and who is there to ask about it. It
 * does not know why: only that it has tried to leave more than once and found no way out.
 */
export function describeShutIn(brain: NpcBrain): string {
  const helper = whoToAskForTheDoor(brain);
  // Where it came in from, if it remembers: that is where it is trying to get back to.
  const outTo =
    brain.wayOutTo && brain.wayOutTo !== brain.location
      ? ` You came in from the ${brain.wayOutTo} and are trying to get back out to it.`
      : '';
  return `You are shut in ${brain.location}: you have tried to leave and cannot find a way out.${outTo}${helper ? ` ${helper} is here: in "say", ask ${helper} outright to ${outTo ? `let you out to the ${brain.wayOutTo}` : 'open the door for you'}.` : ' There is nobody here to ask.'}`;
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
  lines.push(...guardCues(brain));
  lines.push(...asideCues(brain));
  lines.push(...meetingCues(brain));
  lines.push(...wantedCues(brain));
  if (brain.shutIn) {
    lines.push(describeShutIn(brain));
  } else if (brain.wantsOut && brain.wayOutTo) {
    lines.push(
      `You are in rooms that are locked to you and are on your way back out to the ${brain.wayOutTo}, where you came in from. Nobody is keeping you in: you are let out when you ask.`,
    );
  }
  // Fire doors in its way, and what it has done about them, so that it can say why it is held up.
  const fire = brain.fireDoors;
  if (fire && Date.now() - fire.at < FIRE_DOORS_TOLD_MS) {
    lines.push(
      fire.pulled
        ? `The fire doors are shut in ${fire.place} and are in your way. Someone pulled the fire alarm there, and nothing is wrong with the air.`
        : `The fire doors are shut in ${fire.place} because something is wrong with the air there. You are keeping out until they open.`,
    );
  }
  for (const [place, at] of Object.entries(brain.alarmResets)) {
    if (Date.now() - at < FIRE_DOORS_TOLD_MS) {
      lines.push(
        `You have just reset the fire alarm in ${place}, which someone had pulled for no reason you could see.`,
      );
    }
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
  // Its own reason for doing one job before another, so that it can give it if asked.
  const choice = describeChoice(brain);
  if (choice) {
    lines.push(choice);
  }
  // The work comes last of all, nearest the options, so that it is what the choice is made from.
  lines.push(...describeWork(brain));
  return lines;
}
