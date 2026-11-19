/**
 * Builds what the LLM is sent and reads what it sends back: the prompt that makes an NPC who it
 * is, and the shape its replies must take.
 *
 * The prompt is put together from two layers: the person (see person.ts), which every NPC has,
 * and its job (see jobs/).
 */
import { jobFor } from './jobs';
import { describePerson, type PersonCard, SPEAKING } from './person';
import { WORK_NOTHING } from './tasks';
import type { Action, Option } from './types';

/**
 * Builds the part of the prompt that is the same every time an NPC talks: who it is, what its job
 * is, and how it speaks. It is kept to that, and kept short. A small model loses track of a long
 * list of standing rules, so what only matters at one kind of moment is sent at that moment and
 * not otherwise (see talk.ts), and what the body does without being asked is told in the report
 * when it is happening.
 */
export function buildSystemPrompt(
  name: string,
  job: string,
  card: PersonCard,
  post: string | null = null,
): string {
  const about = jobFor(job).about(post);
  const lines = [
    `You are ${name}, ${job || 'a crew member'} aboard Space Station 13. You are a person living and working there, not an assistant.`,
    ...describePerson(card),
    ...(about ? [about] : []),
    '',
    'How you speak:',
    ...SPEAKING.map((rule) => `- ${rule}`),
  ];
  return lines.join('\n');
}

/**
 * What one call asks the LLM for. Only the parts that apply to the moment are asked for: a part it
 * has to fill in when there is nothing to put in it is one more thing for it to get wrong.
 */
export type ReplyParts = {
  /**
   * TRUE to ask for a sentence of reasoning first. It steadies what a small model says and does
   * next, so it is asked for when someone has spoken to it and there is something to weigh.
   */
  think: boolean;
  /** Handles of the people who have just spoken to it: the people it is asked how it feels about. */
  feelAbout: string[];
  /** The kinds of work it takes on when told of it, and the rooms such work could be in, or null. */
  workTold: { kinds: string[]; places: string[] } | null;
  /** How "work" is to be filled in, if it is asked for. */
  workIs: string;
  /** What "say" is at this moment: an answer, a greeting, a line its work calls for, a remark. */
  sayIs: string;
  /** TRUE if saying nothing is a fair answer this time. Silence is then a value of its own, not an empty line. */
  maySaySilent: boolean;
  /** What it can take on for whoever spoke. With nothing but "take nothing on" on offer, it is not asked. */
  options: Option[];
  /** TRUE if it may keep a note of what it was told. */
  note: boolean;
};

/** TRUE if there is more than one thing the NPC could take on, so that there is a choice to put to the LLM. */
function hasMoves(options: Option[]): boolean {
  return options.length > 1;
}

/**
 * Says, part by part, what the reply is to hold. The parts are fixed slots in a fixed order, not a
 * free list: a free list let the model say "I'll head over" without ever taking the move on.
 * Speech comes before the move so that the move follows from it.
 */
export function describeReply(parts: ReplyParts): string[] {
  const lines = ['Reply with one JSON object, with these parts in this order:'];
  if (parts.think) {
    lines.push(
      '- "think": one short sentence to yourself, heard by nobody: what was said to you, and what you make of it.',
    );
  }
  if (parts.feelAbout.length > 0) {
    lines.push(
      '- "feel": how what they have just said, and the way they said it, sits with someone like you: "cooler" if it wears on you, "warmer" if you warm to it, "same" if neither. Judge only what was just said. Give their handle, and why in a few words.',
    );
  }
  if (parts.workTold) {
    lines.push(`- "work": ${parts.workIs}`);
  }
  lines.push(
    `- "say": ${parts.sayIs}${parts.maySaySilent ? ' To say nothing, give null.' : ''}`,
  );
  if (hasMoves(parts.options)) {
    lines.push(
      '- "move": what you take on for them. Choose exactly one from the list below and copy it. Most of the time it is the first. It must match what you say: if you say you will order something or lead someone somewhere, "move" must be that, and if it is not, do not say you will.',
    );
  }
  if (parts.note) {
    lines.push(
      '- "note" (optional): something you have just been told that you will want later and could not have seen for yourself: news, gossip, trouble, a promise. Not where people are or what is in a room, which you remember anyway. Leave it out otherwise.',
    );
  }
  return lines;
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
  message: 'message',
  grenade: 'grenade',
  // Freight work, which only the driver asks for (see jobs/freight.ts).
  unload: 'unload',
  collect_mail: 'collect_mail',
  hand_mail: 'hand_mail',
  recycle: 'recycle',
  send_shuttle: 'send_shuttle',
  // Hauling a crate clear of a door it was left by, and getting out of someone's way when asked.
  stow_crate: 'stow_crate',
  step_aside: 'step_aside',
  // Stopping to talk, and opening a door for someone: also only ever asked for by code.
  hold: 'hold',
  open_door: 'open_door',
  tidy: 'tidy',
  go_to_door: 'go_to_door',
  // Knocking at a door, and resetting a fire alarm someone pulled: also only ever asked for by code.
  knock: 'knock',
  // Crates cargo holds for collection: looking over what is still waiting, bringing one out to
  // whoever came for it, hauling it away to unpack, and taking the empty crate back.
  check_held: 'check_held',
  release: 'release',
  collect_crate: 'collect_crate',
  take_back: 'take_back',
  reset_alarm: 'reset_alarm',
  throw_out: 'throw_out',
  // The Quartermaster's order book: writing in it, and fetching paper to write on. And a
  // technician noting that word of an order has been passed on face to face.
  note: 'note',
  get_paper: 'get_paper',
  word_passed: 'word_passed',
  // The Quartermaster opening a crate of its own that has come in.
  open_own_crate: 'open_own_crate',
  // Engineering staff working a machine: a pump, a canister, an emitter, a battery.
  work_machine: 'work_machine',
  // Security staff: fetching a baton and cuffs, arresting someone, putting them in a cell, and
  // letting them go. Only ever asked for by code.
  get_kit: 'get_kit',
  arrest: 'arrest',
  jail: 'jail',
  free: 'free',
  // An engineer forcing a door that security cannot get through. Only ever asked for by code.
  force_door: 'force_door',
};

/** How "my body" and "your body" are put right when they turn up in something said out loud. */
const BODY_TALK: [RegExp, string][] = [
  [/\bmy body (is|was)\b/gi, 'I am'],
  [/\bmy body has\b/gi, 'I have'],
  [/\bmy body does\b/gi, 'I do'],
  [/\bmy body goes\b/gi, 'I go'],
  [/\bmy body (will|can|shall|must|would|could|should|may|might)\b/gi, 'I $1'],
  [/\bmy body ([a-z]{3,})s\b/gi, 'I $1'],
  [/\bmy body\b/gi, 'I'],
  [/\byour body is\b/gi, 'you are'],
  [/\byour body has\b/gi, 'you have'],
  [/\byour body does\b/gi, 'you do'],
  [/\byour body goes\b/gi, 'you go'],
  [/\byour body ([a-z]{3,})s\b/gi, 'you $1'],
  [/\byour body\b/gi, 'you'],
];

/**
 * Puts something the LLM wants said into the words of one person. The reports it reads speak of
 * "your body", because that is how it is told what it is doing, and it sometimes says "my body"
 * back out loud. Nobody talks like that.
 */
export function inOwnVoice(text: string): string {
  let said = text;
  for (const [pattern, plain] of BODY_TALK) {
    said = said.replace(pattern, plain);
  }
  // A sentence that now starts with "you" still starts with a capital.
  return said.replace(/(^|[.!?] )you\b/g, '$1You');
}

/**
 * Takes handles out of something the LLM wants said. They are in the report so that it can say in
 * its reply who it means, and now and then one comes out in its speech: "Hello, p1". A handle in
 * brackets after a name is dropped, and one standing for a name is put right if that person is in view.
 */
export function withoutHandles(
  text: string,
  people: { handle: string; name: string }[],
): string {
  return text
    .replace(/\s*\((?:person\s+)?p\d+\)/gi, '')
    .replace(/\b(?:person\s+)?(p\d+)\b/gi, (_whole, handle: string) => {
      const person = people.find(
        (seen) => seen.handle === handle.toLowerCase(),
      );
      return person ? person.name.split(' ')[0] : '';
    })
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
export function buildReplySchema(parts: ReplyParts) {
  const { options, feelAbout, workTold } = parts;
  const withThink = parts.think;
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
      // Silence is a value of its own where it is allowed. Left to an empty line, the model wrote
      // "Nothing." and the NPC said it out loud.
      say: parts.maySaySilent
        ? { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] }
        : { type: 'string', minLength: 1 },
      // With one thing on offer there is nothing to choose, so the question is not put.
      ...(hasMoves(options) ? { move: { anyOf: moves } } : {}),
      ...(parts.note ? { note: { type: 'string' } } : {}),
    },
    // A required note made the model write one every turn, usually a copy of its last.
    required: [
      ...(withThink ? ['think'] : []),
      ...Object.keys(feel),
      ...Object.keys(work),
      'say',
      ...(hasMoves(options) ? ['move'] : []),
    ],
  };
}

/**
 * TRUE if a line is the model's way of saying it has nothing to say, not something a person would
 * say out loud: "Nothing.", "...", "(stays silent)". Only for lines nobody asked for: "Nothing." is
 * a fair answer to "what is wrong?".
 */
export function isFiller(text: string): boolean {
  return /^[\W_]*(nothing|none|null|n\/a|no (reply|response|answer|comment|remark)|silence|silent|quiet|\(.*\)|\*.*\*)?[\W_]*$/i.test(
    text.trim(),
  );
}

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
  // Silence comes as null. A line of nothing but dots or dashes is silence as well.
  if (typeof body.say === 'string' && /[a-z0-9]/i.test(body.say)) {
    actions.push({ tool: 'say', text: inOwnVoice(body.say.trim()) });
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
