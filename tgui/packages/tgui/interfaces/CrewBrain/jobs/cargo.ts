/**
 * Cargo staff: stay at their post and order supplies for crew who come and ask.
 *
 * They see to what the supply shuttle brings and takes away (see freight.ts), and they keep their
 * own work area fit to work in. Cleaning is not their job, so that means
 * sending a janitor a PDA message when there is a mess in it.
 *
 * The LLM hears the request and decides whether it was one. Everything after that is code: going
 * to the console, waiting on the shuttle, hauling the crate out, sending the PDA message, and
 * getting back to the post.
 */
import { addTask, blockTask, findTask, finishTask } from '../tasks';
import type {
  NpcBrain,
  Option,
  PersonInView,
  Plan,
  Task,
} from '../types';
import {
  afterFreight,
  describeFreight,
  freightCues,
  freightInHand,
  planFreight,
  syncFreight,
} from './freight';
import { isJanitor } from './janitor';
import type { Job } from './job';
import {
  describeTidying,
  planTidying,
  syncTidying,
  tidyingInHand,
} from './tidying';

/** TRUE if this job title is in cargo, whose work is ordering supplies for the crew. */
export function isCargo(title: string): boolean {
  return /cargo|quartermaster/i.test(title);
}

/** What comes in each crate cargo staff can order, so they can tell what a request calls for. */
const CRATE_HOLDS: Record<string, string> = {
  'Janitorial Supplies Crate':
    'what a janitor cleans with: a mop, space cleaner, buckets, a rag and cleaner grenades. It is the crate to order when a janitor asks for cleaning supplies, soap, cleaner or a mop, whatever they call it',
};

/** The kinds of task cargo staff have: an order to see through, and getting back to their post. */
const ORDER = 'order';
const POST = 'post';
/** A mess in a room that is theirs to keep fit to work in, which a janitor has to be called to. */
const TIDY = 'tidy';
/**
 * The words someone asking for supplies would use. An order the LLM agrees to when nothing of the
 * kind was said is not placed: it costs the budget a crate nobody wanted.
 */
const SUPPLY_WORDS =
  /order|crate|suppl|soap|cleaner|\bmops?\b|bucket|janitorial|broom|\brags?\b|grenade|purchase|\bbuy|stuff|gear|equipment/i;
/** Someone who is to be let through the door of the post. The task's item is their name. */
const DOOR = 'door';
/** The words that mark what someone says as asking for a door to be opened. */
const DOOR_WORDS = /\bdoor\b|let (me|us) (in|out|through)|open up/i;
/** How long (deciseconds) a request for the door stands. */
const DOOR_ASK_DS = 300;
/** How long (deciseconds) a mess is left before a janitor is called to it: one may be on the way already. */
const NOTICE_DS = 600;
/** How long (deciseconds) after calling a janitor to a room before calling again about it. */
const CALL_AGAIN_DS = 6000;

/**
 * What cargo staff are told about their job. The post is named from what the server found, because
 * stations call that room different things.
 */
function rules(post: string | null): string[] {
  const where = post
    ? `the ${post}, at the counter`
    : 'the counter in the cargo department';
  return [
    `Your job is ordering supplies for the crew. Your post is ${where}. Crew come to the Cargo Lobby, on the other side of the counter, and ask you face to face for what they need.`,
    'When someone asks you for supplies that come in a crate you can order, tell them you will see to it and choose order. Your body does the rest by itself: it goes to the console, brings the crate out to the Cargo Lobby when the shuttle docks, and sends them a PDA message. Getting crew what they ask for is your job, whatever theirs is.',
    'You wait to be asked before you order. Never offer or suggest an order, and never order anything nobody asked you for. That is only about orders: anyone who speaks to you still gets an answer, whatever it is about.',
    'If someone asks for something you cannot order, say so.',
    'You do not clean, fetch things or show people around: that would take you from your post. If someone asks you to, say it is not your job. Cleaning is for the janitors.',
    'What the supply shuttle brings is yours to see to, and your body does it by itself: it unloads the shuttle, takes the mail out of its crate, sends a PDA message to whoever each piece is for, hands it over when they come to the counter, and sends empty crates back with the shuttle.',
    'The door to your post is locked to everyone but cargo, and it stays that way: nobody is let in to wander about. There are two exceptions, and your body sees to both by itself. It opens the door for a janitor who has come to clean up a mess in there, and it opens the door for anyone inside who asks to be let out.',
    'What is left lying on the floor of your work area, your body puts away by itself when it has nothing more pressing to do: rubbish in the bin, the rest on a table or back in its crate.',
    'Keeping your own work area fit to work in is still down to you. When there is a mess in it, your body sends a janitor a PDA message by itself, asking them to come and clean it.',
  ];
}

/** TRUE while there is an order somewhere between being placed and whoever asked being told. */
function orderInHand(brain: NpcBrain): boolean {
  return (
    brain.orderPending ||
    !!brain.crateWaiting ||
    (!!brain.messageOwed && brain.hasPda)
  );
}

/**
 * Keeps the tasks true to where the server says things stand. The server is what knows: it placed
 * the order, watches the shuttle, and remembers who is owed a message.
 */
function syncTasks(brain: NpcBrain): void {
  const order = findTask(brain, ORDER);
  if (orderInHand(brain)) {
    const task =
      order ??
      addTask(brain, { kind: ORDER, urgency: 'asked', source: 'asked' });
    task.askedBy ??= brain.messageOwed ?? undefined;
    blockTask(
      task,
      brain.orderPending
        ? 'the supply shuttle has not come back with it yet'
        : null,
    );
  } else if (order) {
    // The PDA message was the telling, so nobody is left waiting to hear.
    order.reported = true;
    finishTask(brain, order);
  }

  // A mess in its work area is its business until it is gone, though not its to clean.
  for (const place of Object.keys(brain.areaMesses)) {
    if (!findTask(brain, TIDY, { place })) {
      addTask(brain, { kind: TIDY, place, urgency: 'routine', source: 'noticed' });
    }
  }
  for (const task of brain.tasks) {
    if (task.kind !== TIDY || task.state === 'done' || !task.place) {
      continue;
    }
    if (!brain.areaMesses[task.place]) {
      finishTask(brain, task);
      delete brain.janitorCalls[task.place];
      continue;
    }
    const call = brain.janitorCalls[task.place];
    blockTask(
      task,
      call && brain.now - call.at < CALL_AGAIN_DS
        ? `you have sent ${call.to}, a janitor, a PDA message about it`
        : null,
    );
  }

  syncFreight(brain);
  syncTidying(brain);

  // Whoever is to be let through the door has a task until the door has been opened for them.
  const wants = doorWanted(brain);
  if (wants && !findTask(brain, DOOR, { item: wants.name })) {
    addTask(brain, {
      kind: DOOR,
      item: wants.name,
      urgency: 'asked',
      source: 'own',
    });
  }
  for (const task of brain.tasks) {
    if (task.kind === DOOR && task.state !== 'done' && task.item !== wants?.name) {
      finishTask(brain, task);
    }
  }

  // Away from its post with nothing to see through, it goes back.
  const away =
    !!brain.post &&
    brain.location !== brain.post &&
    !orderInHand(brain) &&
    !freightInHand(brain) &&
    !tidyingInHand(brain) &&
    !wants;
  const post = findTask(brain, POST);
  if (away && !post) {
    addTask(brain, { kind: POST, urgency: 'routine', source: 'own' });
  } else if (!away && post) {
    finishTask(brain, post);
  }
}

/** What one of cargo's tasks comes down to right now. */
function plan(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === POST) {
    return brain.post
      ? {
          ready: true,
          step: `You are away from your post, the ${brain.post}, and are on your way back to it.`,
          act: { tool: 'go_to', place: brain.post },
        }
      : { ready: false, step: 'You do not know where your post is.' };
  }
  if (task.kind === TIDY) {
    return tidyStep(brain, task);
  }
  if (task.kind === DOOR) {
    const person = brain.peopleInView.find((seen) => seen.name === task.item);
    return person
      ? {
          ready: true,
          step: `${doorCue(brain, person)} You are going to open the door for them.`,
          act: { tool: 'open_door', person: person.handle },
        }
      : { ready: false, step: `${task.item} has gone.` };
  }
  if (task.kind !== ORDER) {
    // Tidying is for when the orders and the shuttle have been seen to.
    return (
      planFreight(brain, task) ??
      planTidying(brain, task, orderInHand(brain) || freightInHand(brain))
    );
  }
  if (brain.crateWaiting) {
    return {
      ready: true,
      step: `The ${brain.crateWaiting} you ordered is aboard the supply shuttle, and you are fetching it out to the Cargo Lobby.`,
      act: { tool: 'bring_out' },
    };
  }
  if (brain.messageOwed) {
    return {
      ready: true,
      step: `The crate is out in the Cargo Lobby, and you are sending ${brain.messageOwed} a PDA message to say so.`,
      act: {
        tool: 'message',
        person: brain.messageOwed,
        text: 'The supplies you asked for are waiting in a crate in the Cargo Lobby.',
      },
    };
  }
  return { ready: false, step: 'There is nothing to do on it yet.' };
}

/** TRUE if this person may be let through the door of the post: out if they are in, in if they are a janitor with a mess to see to. */
function allowedThrough(brain: NpcBrain, person: PersonInView): boolean {
  if (person.in_post) {
    return !isCargo(person.job);
  }
  return isJanitor(person.job) && !!brain.post && !!brain.areaMesses[brain.post];
}

/**
 * Who the door of the post is to be opened for right now, if anyone: someone who has just asked
 * and may be let through, or the janitor it called to a mess in there, come to the lobby.
 */
function doorWanted(brain: NpcBrain): PersonInView | null {
  if (!brain.post) {
    return null;
  }
  const asked = brain.doorAsked;
  if (asked && brain.now - asked.at < DOOR_ASK_DS) {
    const person = brain.peopleInView.find((seen) => seen.name === asked.name);
    if (person && allowedThrough(brain, person)) {
      return person;
    }
  }
  const call = brain.janitorCalls[brain.post];
  if (call && !call.letIn && brain.areaMesses[brain.post]) {
    return (
      brain.peopleInView.find(
        (seen) => seen.name === call.to && !seen.in_post,
      ) ?? null
    );
  }
  return null;
}

/** Says why someone is being let through the door, for the step and for what the LLM is told. */
function doorCue(brain: NpcBrain, person: PersonInView): string {
  return person.in_post
    ? `${person.name} is inside the ${brain.post} and cannot get out by themselves: the door is locked to them.`
    : `${person.name} has come to clean up the mess in the ${brain.post}, and the door is locked to them.`;
}

/** Writes a short list the way it is said: "oil", "oil and ashes", "oil, ashes and dirt". */
function listed(names: string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What getting a mess in the work area seen to comes down to: a PDA message to a janitor. A
 * janitor who is standing there can see it for themselves, so nothing is sent while one is.
 */
function tidyStep(brain: NpcBrain, task: Task): Plan {
  const place = task.place ?? '';
  // A janitor standing in the room with the mess can see it. One at the counter cannot see into
  // the post, and could not get in to it if they did.
  const inPost = place === brain.post;
  const here = brain.peopleInView.find(
    (person) => isJanitor(person.job) && !!person.in_post === inPost,
  );
  if (here) {
    return {
      ready: false,
      step: `${here.name}, a janitor, is here and can see the mess in the ${place}.`,
    };
  }
  if (!brain.hasPda || brain.janitorsOnPda.length === 0) {
    return {
      ready: false,
      step: `There is a mess in the ${place}, and no janitor on your PDA to call to it.`,
    };
  }
  if (brain.now - task.createdAt < NOTICE_DS) {
    return {
      ready: false,
      step: `There is a mess in the ${place}. If no janitor comes by soon, you will call one.`,
    };
  }
  // If the last call came to nothing, the next goes to another janitor.
  // A janitor who is standing at the counter is the one to call: they are nearest, and can be
  // let in at once.
  const calls = brain.janitorCalls[place]?.count ?? 0;
  const janitor =
    brain.peopleInView.find(
      (person) =>
        isJanitor(person.job) && brain.janitorsOnPda.includes(person.name),
    )?.name ?? brain.janitorsOnPda[calls % brain.janitorsOnPda.length];
  const what = listed(brain.areaMesses[place] ?? []);
  return {
    ready: true,
    step: `There is a mess in the ${place}, which is yours to keep fit to work in, and you are sending ${janitor}, a janitor, a PDA message asking them to come and clean it.`,
    act: {
      tool: 'message',
      person: janitor,
      text: `There is a mess in the ${place}${what ? `: ${what}` : ''}. Could you come and clean it up, please?${place === brain.post ? ' Come to the Cargo Lobby and I will let you in.' : ''}`,
    },
  };
}

function describeTask(task: Task): string | null {
  if (task.kind === TIDY) {
    return `get the mess in the ${task.place} cleaned up`;
  }
  if (task.kind === DOOR) {
    return `open the door for ${task.item}`;
  }
  if (task.kind === POST) {
    return 'get back to your post';
  }
  return task.kind === ORDER
    ? 'see the crate you ordered through'
    : (describeFreight(task) ?? describeTidying(task));
}

/** What the LLM should know about where things stand, so that what it says is true. */
function cues(brain: NpcBrain): string[] {
  const lines: string[] = [];
  if (brain.orderPending) {
    lines.push(
      'You have a crate on order. The supply shuttle has not come back with it yet.',
    );
  } else if (
    brain.post &&
    brain.location === brain.post &&
    !orderInHand(brain)
  ) {
    lines.push(`You are at your post, the ${brain.post}.`);
  }
  for (const [place, call] of Object.entries(brain.janitorCalls)) {
    if (brain.areaMesses[place]) {
      lines.push(
        `There is a mess in the ${place}. You have sent ${call.to}, a janitor, a PDA message asking them to clean it up.`,
      );
    }
  }
  lines.push(...freightCues(brain));
  const wants = doorWanted(brain);
  if (wants) {
    lines.push(
      `${doorCue(brain, wants)} You are opening the door for them now: say so if you speak of it.`,
    );
  } else if (brain.doorAsked && brain.now - brain.doorAsked.at < DOOR_ASK_DS) {
    // Someone has asked who is not being let in. What it says has to match what it does.
    lines.push(
      `${brain.doorAsked.name} has asked you about the door. You are not opening it for them: it is only opened for a janitor with a mess to clean in the ${brain.post}, or to let out someone who is inside.`,
    );
  }
  return lines;
}

/** Ordering is what cargo staff can agree to, one order at a time. */
function offers(brain: NpcBrain): Option[] {
  if (
    brain.orderable.length === 0 ||
    brain.orderPending ||
    brain.crateWaiting ||
    // Someone at the door wants the door. Offered an order as well, the LLM sometimes takes it.
    doorWanted(brain)
  ) {
    return [];
  }
  return [
    {
      tool: 'order',
      parameter: { name: 'crate', choices: brain.orderable },
      text: `order a crate at the supply console, for whoever has just asked you for what comes in it. Asking means putting it to you: "can you order...", "could I get...", "have you got any...", or telling you, by name, what they need. Someone only saying what they are off to do themselves ("I'll get some from the closet") has not asked. ${brain.orderable.map((crate) => `The ${crate} holds ${CRATE_HOLDS[crate] ?? 'what its name says'}.`).join(' ')} Not for anything else. The shuttle brings it in a minute or two.`,
    },
  ];
}

export const CARGO: Job = {
  is: isCargo,
  keepsPost: true,
  cleans: false,
  rules,
  cues,
  syncTasks,
  plan,
  describeTask,
  // A message sent about a mess is a janitor called to it.
  afterActing: (brain, act, task, ok) => {
    afterFreight(brain, act, task);
    // The door has been opened for them, or could not be. Either way that request is dealt with.
    if (task?.kind === DOOR) {
      if (brain.doorAsked?.name === task.item) {
        brain.doorAsked = null;
      }
      const call = brain.post ? brain.janitorCalls[brain.post] : undefined;
      if (call && call.to === task.item) {
        call.letIn = true;
      }
    }
    if (ok && task?.kind === TIDY && task.place && act.tool === 'message') {
      brain.janitorCalls[task.place] = {
        to: String(act.person),
        at: brain.now,
        count: (brain.janitorCalls[task.place]?.count ?? 0) + 1,
      };
    }
  },
  agrees: (_brain, action, heard) =>
    action.tool !== 'order' || SUPPLY_WORDS.test(heard),
  // Anyone asking for a door in its hearing is noted. Whether they get it is decided from who
  // they are and where they stand, not from how they ask.
  overhears: (brain, event) => {
    const speaker = String(event.details.speaker ?? '');
    if (speaker && DOOR_WORDS.test(String(event.details.message ?? ''))) {
      brain.doorAsked = { name: speaker, at: brain.now };
    }
  },
  offers,
  // Plain words for supplies, said to it, are an order for the crate, if it can take one.
  hears: (brain, heard) =>
    offers(brain).length > 0 &&
    /\b(order|crate|suppl\w*|soap|cleaner|mop)\b/i.test(heard)
      ? { tool: 'order', crate: brain.orderable[0] }
      : null,
};
