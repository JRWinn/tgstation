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
/**
 * Send a janitor a PDA message about a mess in a room, and tell whoever gave the order who was
 * sent for. Named with no room ("Then ask for a janitor"), the room is the one it stands in,
 * where whoever gave the order was (PLAY-10).
 */
export const CALL = 'call';

/** The orders anyone can be given, each in the words the LLM is given for it. */
export const ORDERS: Record<string, string> = {
  [LOOK]: 'an order to go and look at a room and report back',
  [CALL]: 'an order to send for a janitor to a room',
};

/**
 * For each order, the words that mark speech as giving it. A net for when the LLM does not say.
 * Sending for a janitor is tried first: "call a janitor to check the bar" is not a look.
 */
export const ORDER_SOUNDS: Record<string, RegExp> = {
  [CALL]:
    /\b(call|ask for|send for|fetch|get (?:a|us a|me a|one of the|someone|somebody))\b[^.?!]*\bjanitors?\b/,
  [LOOK]:
    /\b(look|check|inspect|see what|see if|see how|find out|report back|go and see|go see)\b/,
};

/** TRUE for an order that may be given with no room named: it is for the room it is standing in. */
export function orderTakesHere(kind: string): boolean {
  return kind === CALL;
}

/** Words that make a look order of a room named straight after them: "check the Bar", "look in on the Kitchen". */
const LOOK_AT =
  '(?:look at|look in(?: on)?|look into|look round|look around|look over|check(?: in)? on|check|inspect|go and see|go see|see what is in|see what\'s in|find out what is in|find out what\'s in|find out what is going on in|report on)';
/** In a clause, what makes a look word no order to this NPC: "I'll check the Bar myself", "no need to look at the Bar". */
const NOT_ITS_TO_DO =
  /\b(i'll|i will|i'm going to|i am going to|i'm gonna|myself|don'?t|do not|no need|never mind)\b/;

/**
 * A clause that is an order to send for a janitor in the imperative: "call a janitor", "then ask
 * for a janitor", "please get a janitor in here", "could you send for a janitor".
 */
const CALL_IMPERATIVE =
  /^(?:(?:ok|okay|right|now|then|so|just|please|go and|go|could you|can you|would you|will you|you need to|you should|you can)\s+)*(?:call|ask for|send for|fetch|get)\b[^.?!]*\bjanitors?\b/;

/**
 * TRUE if what a superior said gives the order to send for a janitor (PLAY-10 2, the owner's
 * answer B): a clause with the words for it that is in the imperative, or a line that names this
 * NPC. Never a clause where the speaker says they will do it, or that it is not to be done: "I'll
 * ask for a janitor myself" is no order, to this NPC or anyone.
 */
export function callOrderIn(npcName: string, heard: string): boolean {
  const text = heard.toLowerCase();
  const first = npcName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const named = !!first && new RegExp(`\\b${first}\\b`).test(text);
  return text
    .split(/[.!?;,"]| but | and then /)
    .map((clause) => clause.trim())
    .some(
      (clause) =>
        ORDER_SOUNDS[CALL].test(clause) &&
        !NOT_ITS_TO_DO.test(clause) &&
        (named || CALL_IMPERATIVE.test(clause)),
    );
}

/**
 * TRUE if these clauses of a superior's (orderClauses in tasks.ts: no questions, nothing said
 * not to do) give this order for this room. Sending for a janitor goes by its words anywhere in
 * them. A look is an order only with the look word right before the room, with nothing but "at",
 * "on", "in" or "the" between, in a clause that is not the speaker saying they will look (MEM-08):
 * "Tolly, go and check the Bar" is one; "I'll check the Bar myself" and "Look, Tolly, the Kitchen
 * staff are upset with you" are not, and are left to the model. So is a look asked as a question
 * ("Could you check on the Bar, Tolly?"): `heard`, all that was said, shows where one ends in "?".
 */
export function orderIn(
  kind: string,
  clauses: string,
  room: string,
  heard: string,
  /** The NPC's own name: an order to send for a janitor is taken only in the imperative or with it named (PLAY-10 2). */
  npcName = '',
): boolean {
  if (kind === CALL) {
    return (
      ORDER_SOUNDS[CALL].test(clauses) && callOrderIn(npcName, clauses)
    );
  }
  if (kind !== LOOK) {
    return ORDER_SOUNDS[kind]?.test(clauses) ?? false;
  }
  const name = room.toLowerCase().replace(/[^a-z0-9 ]/g, '.');
  const look = new RegExp(
    `\\b${LOOK_AT}\\s+(?:(?:at|on|in)\\s+)?(?:the\\s+)?${name}\\b`,
  );
  const sentences: string[] = heard.match(/[^.!?]+[.!?]*/g) ?? [];
  const said = sentences.some(
    (sentence) => look.test(sentence) && !sentence.trim().endsWith('?'),
  );
  return (
    said &&
    clauses
      .split(/[.!?;,]/)
      .some((clause) => look.test(clause) && !NOT_ITS_TO_DO.test(clause))
  );
}

/** How long (deciseconds) a janitor it sent for counts as still coming: it is not sent for again on an order. */
const CALL_STANDS_DS = 3000;

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

/** The janitors it could send a PDA message to: never itself. */
function janitorsToCall(brain: NpcBrain): string[] {
  return brain.hasPda
    ? brain.janitorsOnPda.filter((name) => name !== brain.name)
    : [];
}

/**
 * Why there is nobody to send for, to a mess in this room, in the words it tells whoever gave
 * the order: no PDA, no janitor on it, or one it sent for already who is still to come. Undefined
 * if it is to send a PDA message now.
 */
function callNeedless(brain: NpcBrain, place: string): string | undefined {
  if (!brain.hasPda) {
    return 'I have no PDA to send for a janitor with.';
  }
  if (janitorsToCall(brain).length === 0) {
    return 'There is no janitor on my PDA to send for.';
  }
  const call = brain.janitorCalls[place];
  if (
    call &&
    brain.now - call.at < CALL_STANDS_DS &&
    !call.declined?.includes(call.to)
  ) {
    return `I have sent for ${call.to}, a janitor, already. They know of it.`;
  }
  return undefined;
}

/** The janitor it sends for: one in sight first, then one who has not said a mess here is beyond them. */
function janitorToCall(brain: NpcBrain, place: string): string {
  const janitors = janitorsToCall(brain);
  const declined = brain.janitorCalls[place]?.declined ?? [];
  const willing = janitors.filter((name) => !declined.includes(name));
  const pool = willing.length > 0 ? willing : janitors;
  return (
    brain.peopleInView.find((person) => pool.includes(person.name))?.name ??
    pool[0]
  );
}

/** The kinds of mess it knows of in a room, as a janitor is told them, or ''. */
function messesIn(brain: NpcBrain, place: string): string {
  const seen =
    brain.location === place
      ? brain.thingsInView
          .filter((thing) => thing.kind === 'mess')
          .map((thing) => thing.name)
      : [];
  const kinds = [...new Set([...(brain.areaMesses[place] ?? []), ...seen])];
  return kinds.length > 0 ? `: ${listed(kinds.slice(0, NAMED))}` : '';
}

/** Keeps each order true to how far it has got: what was found, and whether it has been reported. */
export function syncOrders(brain: NpcBrain): void {
  for (const task of brain.tasks) {
    if (task.kind === CALL && task.state !== 'done') {
      if (task.reported) {
        finishTask(brain, task);
      } else if (!task.found) {
        task.found = callNeedless(brain, task.place ?? '');
      }
      continue;
    }
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

/**
 * What sending for a janitor on an order comes down to: the PDA message to the janitor, then word
 * to whoever gave the order of who was sent for, face to face if they are here, else by PDA.
 */
function planCall(brain: NpcBrain, task: Task): Plan {
  const place = task.place ?? '';
  const by = task.askedBy ?? 'whoever asked';
  if (!task.found) {
    const janitor = janitorToCall(brain, place);
    return {
      ready: true,
      step: `${by} ordered you to send for a janitor to the ${place}. That comes before everything else, and you are sending ${janitor}, a janitor, a PDA message asking them to come and clean it.`,
      act: {
        tool: 'message',
        person: janitor,
        // The room the call is for, so the server notes a janitor called to it (MULTI-06). It
        // counts for the department only when the room is one of its own.
        call_for: place,
        text: `There is a mess in the ${place}${messesIn(brain, place)}. ${task.askedBy ? `${task.askedBy} has asked for a janitor. ` : ''}Could you come and clean it up, please?`,
      },
    };
  }
  if (brain.peopleInView.some((person) => person.name === task.askedBy)) {
    return {
      ready: true,
      step: `${by} ordered you to send for a janitor to the ${place}. ${task.found} ${by} is here: in "say", tell ${by} so.`,
      say: reportLine(task),
      needs: has(place),
    };
  }
  if (brain.hasPda && task.askedBy && !task.pdaFailed) {
    return {
      ready: true,
      step: `${by} is not here to tell who you sent for to the ${place}. You are sending them a PDA message to say.`,
      act: {
        tool: 'message',
        person: task.askedBy,
        text: `About the ${place}. ${task.found}`,
      },
    };
  }
  return {
    ready: false,
    step: `You will tell ${by} about sending for a janitor to the ${place} when you next see them.`,
  };
}

/** What carrying out an order comes down to right now, or null if the task is not an order. */
export function planOrders(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === CALL) {
    return planCall(brain, task);
  }
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
  if (task.kind === CALL) {
    return `send for a janitor to the ${task.place}`;
  }
  return task.kind === LOOK
    ? `look at the ${task.place} and report back`
    : null;
}

/** Notes that the NPC has said its report: whoever gave the order has heard it. */
export function ordersAfterSaying(brain: NpcBrain, called: string | null): void {
  for (const task of brain.tasks) {
    if (
      (task.kind === LOOK || task.kind === CALL) &&
      task.found &&
      called === reportLine(task)
    ) {
      task.reported = true;
    }
  }
}

/** How long (deciseconds) a call made on an order is kept in calledOnOrder: an hour. */
const CALLED_KEPT_DS = 36000;

/**
 * Notes a janitor it has sent for on an order, in brain.calledOnOrder: one entry per room, the
 * latest. Its department's door keepers read it to let that janitor in, though no technician has
 * seen the mess (PLAY-10 3, the owner's answer A; read in jobs/cargo.ts).
 */
function noteCalledOnOrder(brain: NpcBrain, room: string, janitor: string): void {
  if (!room || !janitor) {
    return;
  }
  brain.calledOnOrder = [
    ...(brain.calledOnOrder ?? []).filter(
      (call) => call.room !== room && brain.now - call.at < CALLED_KEPT_DS,
    ),
    { room, janitor, at: brain.now },
  ];
}

/** Notes how sending a report by PDA went. */
export function ordersAfterActing(
  act: Action,
  task: Task | undefined,
  ok: boolean,
  /** The NPC, so that a janitor sent for on an order is noted for its department (PLAY-10 3). */
  brain?: NpcBrain,
): void {
  if (task?.kind === CALL && act.tool === 'message' && !task.found) {
    if (ok && brain) {
      noteCalledOnOrder(brain, task.place ?? '', String(act.person ?? ''));
    }
    // The message to the janitor: what whoever gave the order is told is how it went.
    task.found = ok
      ? `I have sent ${act.person}, a janitor, a PDA message to come and clean it.`
      : `I could not get a PDA message through to ${act.person}, a janitor.`;
    return;
  }
  if ((task?.kind !== LOOK && task?.kind !== CALL) || act.tool !== 'message') {
    return;
  }
  if (ok) {
    task.reported = true;
  } else {
    // They cannot be reached that way. They are told when they are next seen.
    task.pdaFailed = true;
  }
}
