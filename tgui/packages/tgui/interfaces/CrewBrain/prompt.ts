/**
 * Builds what the LLM is sent and reads what it sends back: the prompt that makes an NPC who it
 * is, and the shape its replies must take.
 *
 * The prompt is put together from two layers: the person (see person.ts), which every NPC has,
 * and its job (see jobs/).
 */
import { jobFor } from './jobs';
import { describePerson, PERSON_RULES, type PersonCard } from './person';
import { WORK_NOTHING, WORK_NOWHERE } from './tasks';
import type { Action, Option } from './types';

/**
 * How the LLM is told to reply.
 *
 * Each part of the reply is a tool call. The parts are fixed slots, not a free list, because a
 * free list let the model say "I'll head over" without ever calling the tool that moves it. Having
 * to fill in "move" every time makes it choose. Speech comes first so the move follows from it.
 * The moves themselves are not listed here: each report carries the ones possible at that moment.
 */
const REPLY_FORMAT = [
  'Every reply is one JSON object with these parts, in this order:',
  '- "think": one short sentence to yourself, twenty words at most, heard by nobody: what has been said to you, and what you make of it.',
  '- "feel": asked for only when someone has just spoken to you. Judge what they said, and how they said it, against who you are: "cooler" if it is the kind of thing that wears on you, "warmer" if it is the kind of thing you warm to, "same" if it is neither. Judge only what they have just said, not how you already feel about them. Give their handle, and why in a few words. Let it show in what you say next.',
  `- "work": asked for only when someone has just spoken to you. It is what you have just been told of, not what you will do. If what they said tells you of work that is yours to do, give what it is and the room it is in, and your body will see to it when it can. For anything else, "what" is "${WORK_NOTHING}" and "where" is "${WORK_NOWHERE}".`,
  '- "say": what you say out loud, in your own voice. When someone has just spoken to you, this is your answer, and it must not be empty unless they only thanked you, agreed or said goodbye. When a report tells you to say or ask something, this is where you say it.',
  '- "move": what you take on for the person who spoke to you. Each report ends with the list of what you can take on. Choose exactly one of them and copy it. Most of the time it is the first: nothing, just an answer.',
  '- "note" (optional): a short note to keep. Include it when you have just heard news, gossip or trouble. Leave it out when you learned nothing new. Never repeat a note you already have.',
  'What you say and what you take on must match. If you say you will order something or lead someone somewhere, "move" must be that; if "move" is to take nothing on, do not say you will.',
];

/** Builds the system prompt sent with every LLM call for one NPC. */
export function buildSystemPrompt(
  name: string,
  job: string,
  card: PersonCard,
  notes: string[],
  memory: string[],
  post: string | null = null,
): string {
  const jobRules = jobFor(job);
  // Putting what every NPC shares first, so the model could reuse its working from one NPC to the
  // next, was tried and measured: it made no difference. Reading a 4000-token prompt takes about
  // two thirds of a second either way. What a decision costs is mostly the writing of the reply.
  const lines = [
    `You are ${name}, ${job || 'a crew member'} aboard Space Station 13. You are a person living and working there, not an assistant.`,
    '',
    ...describePerson(card),
    '',
    'How this works:',
    '- Your body gets on with your job by itself. It walks, fetches and works without you having to decide any of it, and each report tells you what it is doing.',
    '- You are its voice. You decide what to say, how you feel about the people you deal with, and what to take on when someone asks you for something.',
    '- You receive short reports of what your own body sees and hears. That is all you know.',
    '- People are identified by a handle such as p1.',
    '- When you speak, sound like yourself. Keep it to one or two short sentences.',
    ...[...PERSON_RULES, ...jobRules.rules(post)].map((rule) => `- ${rule}`),
    '',
    ...REPLY_FORMAT,
    '',
    'Your notes:',
    ...(notes.length > 0 ? notes.map((note) => `- ${note}`) : ['- (none yet)']),
    '',
    ...memory,
  ];
  return lines.join('\n');
}

/** Tools the server carries out through the body, by the name the server knows them by. It checks every call. */
const SERVER_TOOL_NAMES: Record<string, string> = {
  say: 'say',
  // Offered to the LLM as "approach" because it took "walk_to" to mean travelling somewhere.
  approach: 'walk_to',
  go_to: 'go_to',
  explore: 'explore',
  rest: 'rest',
  search: 'search',
  pick_up: 'pick_up',
  put_down: 'put_down',
  give: 'give',
  clean: 'clean',
  find_supplies: 'locate',
  order: 'order',
  bring_out: 'bring_out',
  message: 'message',
  grenade: 'grenade',
  // Freight work, which only the driver asks for (see jobs/freight.ts).
  unload: 'unload',
  collect_mail: 'collect_mail',
  hand_mail: 'hand_mail',
  recycle: 'recycle',
  send_shuttle: 'send_shuttle',
  // Stopping to talk, and opening a door for someone: also only ever asked for by code.
  hold: 'hold',
  open_door: 'open_door',
  tidy: 'tidy',
};

/** Returns the server's name for a tool the LLM chose, or null if the server has no such tool. */
export function serverToolName(name: string): string | null {
  return SERVER_TOOL_NAMES[name] ?? null;
}

/**
 * Builds the shape an LLM reply must take. Ollama constrains the model's output to this schema, so
 * a reply cannot be a malformed tool call. The model's own tool-call format is not used: with more
 * than one tool on offer, qwen3.5:9b wrote calls that Ollama could not parse.
 *
 * The schema is built from the same list of options the report shows the LLM, so the only moves
 * it can write are the ones it was offered, with the only values that are real.
 */
export function buildReplySchema(
  options: Option[],
  withThink = true,
  /** Handles of the people who have just spoken to the NPC: the people it is asked how it feels about. */
  feelAbout: string[] = [],
  /**
   * The kinds of work the NPC takes on when told of it, and the rooms such work could be in.
   * Given only when someone has just spoken to an NPC whose job takes work that way.
   */
  workTold: { kinds: string[]; places: string[] } | null = null,
) {
  // Asked for every time, like "feel", so that being told of work reliably puts it on the list.
  // It is one flat question. Offered as a choice between "none" and a fuller answer, the model
  // took "none" nearly every time.
  const work =
    workTold && workTold.kinds.length > 0
      ? {
          work: {
            type: 'object',
            properties: {
              what: { type: 'string', enum: [...workTold.kinds, WORK_NOTHING] },
              where: { type: 'string', enum: workTold.places },
            },
            required: ['what', 'where'],
          },
        }
      : {};
  // Asked for every time someone speaks, with "same" as an answer. Left optional, the model skipped
  // it when it mattered and filled it in when nothing had happened.
  const feel =
    feelAbout.length > 0
      ? {
          feel: {
            type: 'object',
            properties: {
              person: { type: 'string', enum: feelAbout },
              change: { type: 'string', enum: ['same', 'warmer', 'cooler'] },
              why: { type: 'string', maxLength: 80 },
            },
            required: ['person', 'change', 'why'],
          },
        }
      : {};
  const moves = options.map((option) =>
    option.parameter
      ? {
          type: 'object',
          properties: {
            tool: { const: option.tool },
            [option.parameter.name]: {
              type: 'string',
              enum: option.parameter.choices,
            },
            ...(option.freeText ? { [option.freeText]: { type: 'string' } } : {}),
          },
          required: [
            'tool',
            option.parameter.name,
            ...(option.freeText ? [option.freeText] : []),
          ],
        }
      : {
          type: 'object',
          properties: { tool: { const: option.tool } },
          required: ['tool'],
        },
  );
  return {
    type: 'object',
    properties: {
      // A sentence of reasoning before it commits steadies what a small model says and does next.
      ...(withThink ? { think: { type: 'string', maxLength: 160 } } : {}),
      // Before "say", so that how it feels shapes what it says.
      ...feel,
      ...work,
      say: { type: 'string' },
      move: { anyOf: moves },
      note: { type: 'string' },
    },
    // A required note made the model write one every turn, usually a copy of its last.
    required: [
      ...(withThink ? ['think'] : []),
      ...Object.keys(feel),
      ...Object.keys(work),
      'say',
      'move',
    ],
  };
}

/**
 * Writes a reply the way it is kept in an NPC's history: what it said, how it moved, and a note
 * only if a new one was really saved. The model imitates its own past replies, so a note it wrote
 * once must not reappear in every later turn.
 */
export function replyForHistory(
  actions: Action[],
  savedNote: string,
  /** The change of feeling in this reply, if it was one that counted. */
  feel: Action | null = null,
): string {
  const say = actions.find((action) => action.tool === 'say');
  const move = actions.find((action) => !INWARD_TOOLS.includes(action.tool));
  return JSON.stringify({
    say: typeof say?.text === 'string' ? say.text : '',
    move: move ?? { tool: 'stay' },
    ...(savedNote ? { note: savedNote } : {}),
    ...(feel
      ? { feel: { person: feel.person, change: feel.change, why: feel.why } }
      : {}),
  });
}

/** Parts of a reply that are not something the body does: speech, and what the NPC keeps to itself. */
const INWARD_TOOLS = ['say', 'remember', 'feel', 'work'];

/** Reads the tool calls out of an LLM reply, in the order they should be carried out. */
export function parseReply(reply: string): Action[] {
  let body: {
    say?: unknown;
    move?: unknown;
    note?: unknown;
    feel?: unknown;
    work?: unknown;
  };
  try {
    body = JSON.parse(reply);
  } catch {
    throw new Error(
      `The LLM's reply was not valid JSON: ${reply.slice(0, 120)}`,
    );
  }
  const actions: Action[] = [];
  if (typeof body.say === 'string' && body.say.trim()) {
    actions.push({ tool: 'say', text: body.say.trim() });
  }
  const move = body.move as Action | null | undefined;
  if (move && typeof move.tool === 'string' && move.tool !== 'stay') {
    actions.push(move);
  }
  if (typeof body.note === 'string' && body.note.trim()) {
    actions.push({ tool: 'remember', note: body.note.trim() });
  }
  const work = body.work as Record<string, unknown> | null | undefined;
  if (
    work &&
    typeof work === 'object' &&
    typeof work.what === 'string' &&
    work.what !== WORK_NOTHING
  ) {
    actions.push({ tool: 'work', what: work.what, where: work.where });
  }
  const feel = body.feel as Record<string, unknown> | null | undefined;
  if (feel && typeof feel === 'object' && typeof feel.person === 'string') {
    actions.push({
      tool: 'feel',
      person: feel.person,
      change: feel.change,
      why: feel.why,
    });
  }
  return actions;
}
