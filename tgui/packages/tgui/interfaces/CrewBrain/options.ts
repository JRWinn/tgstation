/**
 * What an NPC can agree to when someone asks it for something.
 *
 * The body's work is driven by code (see driver.ts), so the LLM is not asked what to do next. It
 * is only given a choice when someone has just spoken to it, and then only between answering and
 * the few things its job lets it take on for them. The reply is restricted to this list.
 */
import { jobFor } from './jobs';
import { allPlaces, knownPlaces } from './memory';
import type { NpcBrain, Option, PersonInView } from './types';

/** Most rooms offered as somewhere to lead someone. */
const PLACES_OFFERED = 14;
/** The words of someone asking to be shown or taken somewhere. */
const ASKS_TO_BE_LED =
  /\b(show|take|lead|guide|walk|escort|come with|way|how do i get|get to|lost|directions?)\b/i;
/** The words of someone asking where something is, which is asking the way only if it is a room. */
const ASKS_WHERE = /\b(where|find)\b/i;

/** Lists what the NPC can agree to right now. Just answering always comes first. */
export function availableOptions(
  brain: NpcBrain,
  spokenTo: boolean,
  /** What was just said to the NPC, so that a room someone asked to be taken to is on offer. */
  heard = '',
  /** Whoever has just spoken to it: what it will take on depends on who is asking. */
  askers: PersonInView[] = [],
): Option[] {
  const job = jobFor(brain.job);
  const options: Option[] = [
    {
      tool: 'stay',
      text: spokenTo
        ? 'take nothing on: just say what you have to say. Choose this unless they asked you for one of the things below.'
        : 'take nothing on.',
    },
  ];
  // Nobody has asked for anything, so there is nothing to agree to.
  if (!spokenTo) {
    return options;
  }
  options.push(...(job.offers?.(brain, askers) ?? []));

  // Crew who keep to a post do not leave it to show people round. Nor can anyone who is shut in.
  // And it is only on offer when what was said could be asking for it: put to the LLM with every
  // "how are you?", it is one more thing to get wrong.
  const said = heard.toLowerCase();
  const named = allPlaces(brain)
    .filter((place) =>
      new RegExp(
        `\\b${place.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`,
      ).test(said),
    )
    .sort((a, b) => b.length - a.length);
  // Asking to be shown or taken somewhere is asking for it. Asking where a room is may be.
  // Asking where a thing is kept is not: offered the walk, the model took it, and a janitor asked
  // where the mops are set off for the closet instead of saying so.
  const wantsLeading =
    ASKS_TO_BE_LED.test(heard) || (ASKS_WHERE.test(heard) && named.length > 0);
  if (!job.keepsPost && !brain.shutIn && wantsLeading) {
    // It knows the way to every room aboard, but a list of them all is too long to choose from.
    // On offer are the rooms that were named in what was just said, and the ones it was last in.
    // There is no leading someone to the room they are already standing in.
    const places = [...new Set([...named, ...knownPlaces(brain)])]
      .filter(
        (place) =>
          place !== brain.location &&
          // Nor to one it cannot get into itself.
          !brain.blockedPlaces.includes(place) &&
          !brain.tasks.some((task) => !!task.via && task.place === place),
      )
      .slice(0, PLACES_OFFERED);
    if (places.length > 0) {
      options.push({
        tool: 'go_to',
        parameter: { name: 'place', choices: places },
        text: 'lead them to one of these places. Only when they have asked to be shown or taken there.',
      });
    }
  }
  return options;
}

/** Writes the list of options as the last lines of a report. */
export function describeOptions(options: Option[]): string[] {
  return [
    'What you can take on for them. Choose exactly one of these as "move":',
    ...options.map((option) => {
      const parameter = option.parameter
        ? `, "${option.parameter.name}": one of ${option.parameter.choices.map((choice) => `"${choice}"`).join(', ')}`
        : '';
      return `- {"tool": "${option.tool}"${parameter}} - ${option.text}`;
    }),
  ];
}
