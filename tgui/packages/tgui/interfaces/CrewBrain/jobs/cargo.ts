/**
 * Cargo staff: stay at their post and order supplies for crew who come and ask.
 *
 * They see to what the supply shuttle brings and takes away (see freight.ts), and they keep their
 * own work area fit to work in. Cleaning is not their job, so that means
 * sending a janitor a PDA message when there is a mess in it.
 *
 * The LLM hears the request and decides whether it was one. Everything after that is code: going
 * to the console, waiting on the shuttle, sending the PDA message, and getting back to the post.
 *
 * Nothing is delivered: cargo staff cannot get into the rooms the rest of the crew work in. A
 * crate that comes in on an order is held in the bay, and whoever ordered it is sent the number on
 * its manifest. Whoever comes to the counter with that number is brought the crate in the lobby.
 * A crate nobody comes for is chased: every few minutes one of those at the post says it is going
 * to see what is still there, looks, and reminds whoever ordered it.
 */
import {
  expectedAt,
  expectedCall,
  expectSomeone,
  noteLetIn,
  noteLetOut,
  stillInside,
  takeOrder,
} from '../expected';
import { isHead } from '../hierarchy';
import { addTask, blockTask, findTask, finishTask } from '../tasks';
import type {
  HeldCrate,
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
import { noteSentFor, stagger } from './guarding';
import { isJanitor } from './janitor';
import type { Job } from './job';
import { COLLECT_WORDS, crateNumberIn } from './pickups';
import {
  describeRounds,
  planRounds,
  roundsInHand,
  syncRounds,
} from './rounds';
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
/** A held crate to bring out to the lobby for whoever has come for it. The task's item is its manifest number. */
const HANDOVER = 'handover';
/** Going to see which crates are still waiting in the bay to be collected. */
const CHECK = 'check_held';
/** A reminder owed to someone whose crates are still waiting. The task's item is their name. */
const REMIND = 'remind';
const HELD_KINDS = new Set([HANDOVER, CHECK, REMIND]);
/** How long (deciseconds) someone's asking for a crate at the counter stands. */
const PICKUP_ASK_DS = 1200;
/** Someone who is to be let through the door of the post. The task's item is their name. */
const DOOR = 'door';
/** The words that mark what someone says as asking for a door to be opened. */
const DOOR_WORDS = /\bdoor\b|let (me|us) (in|out|through)|open up/i;
/** The words that mark a request for a door as wanting out, not in. */
const LET_OUT_WORDS = /\bout\b|\bdone in\b/i;
/** How long (deciseconds) after a door is opened for someone before seeing them outside it means they are out. */
const GONE_THROUGH_DS = 300;
/** How long (deciseconds) a request to be let out stands. Longer: they ask once, and cannot leave until it is answered. */
const LET_OUT_ASK_DS = 3000;
/** How long (deciseconds) a request for the door stands. */
const DOOR_ASK_DS = 600;
/** How long (deciseconds) a mess is left before a janitor is called to it: one may be on the way already. */
const NOTICE_DS = 600;
/** How long (deciseconds) after calling a janitor to a room before calling again about it. */
const CALL_AGAIN_DS = 6000;
/** The most (deciseconds) one of them waits longer than another before calling, so that two do not call at once. */
const CALL_STAGGER_DS = 300;

/**
 * What cargo staff are told about their job. The post is named from what the server found, because
 * stations call that room different things.
 */
function about(post: string | null): string {
  const where = post
    ? `the ${post}, at the counter`
    : 'the counter in the cargo department';
  return `Your job is ordering supplies for the crew. Your post is ${where}. Crew come to the Cargo Lobby, on the other side of the counter, and ask you face to face for what they need.`;
}

/**
 * What cargo staff bear in mind when someone has just spoken to them. What the body does by itself
 * is one sentence here, enough to speak truly of it: the particulars are in the report whenever
 * one of those things is going on (see cues, and jobs/guarding.ts).
 */
function whenAsked(_brain: NpcBrain, heard: string): string[] {
  return [
    'You take orders for supplies only from the Captain and the heads of department. Anyone else who asks is told, kindly, to take it to the head of their own department: for the janitors and the rest of the service staff, that is the Head of Personnel. When a head does order, tell them you will see to it: your body places the order, holds the crate in the bay when it comes, and sends them a PDA message with its manifest number, for whoever they send to give at the counter. If they ask for something you cannot order, say so.',
    'You do not clean, fetch things or show people around: that would take you from your post. Asked to, say it is not your job. Cleaning is for the janitors.',
    // Only when what was said touches on it. It is a lot to read for "how is your day going?".
    ...(OWN_WORK_WORDS.test(heard)
      ? [
          'The rest of your work your body does by itself: it unloads the supply shuttle and hands out the mail, puts away what is left lying about, and sends a janitor a PDA message when there is a mess. The door to your post stays locked to everyone but cargo. Your body opens it only for a janitor come to clean in there, or to let out someone who is inside, and anyone else found in there is asked why and walked out if they have no good reason. Never the Captain or a head of staff.',
        ]
      : []),
  ];
}

/** Words that mark what someone said as touching on the work cargo's body does by itself. */
const OWN_WORK_WORDS =
  /\b(door|let (me|us|him|her|them) (in|out)|come in|get in|locked|open|mail|post|parcel|package|letter|shuttle|crates?|unload|mess|messy|tidy|floor|janitor|your job|your work|you do|doing|busy|up to)\b/i;

/** The PDA message it owes about an order that has come in, if it owes one. */
function arrivedNotice(brain: NpcBrain) {
  return brain.notices.find((notice) => notice.kind === 'arrived');
}

/** TRUE while there is an order somewhere between being placed and whoever asked being told it has come. */
function orderInHand(brain: NpcBrain): boolean {
  return brain.orderPending || (!!arrivedNotice(brain) && brain.hasPda);
}

/** TRUE while there is work on the crates being held that it could be getting on with. */
function heldInHand(brain: NpcBrain): boolean {
  return brain.tasks.some(
    (task) => HELD_KINDS.has(task.kind) && task.state === 'open',
  );
}

/** Writes manifest numbers the way they are written down: "crate #12", "crates #12 and #13". */
function cratesWritten(numbers: number[]): string {
  return `crate${numbers.length === 1 ? '' : 's'} ${listed(numbers.map((number) => `#${number}`))}`;
}

/**
 * The held crate someone at the counter means. It goes by the number they gave. With no number, or
 * one that is no crate's, it goes by who the crate is for, if they said: the crate is marked with
 * that name, and for a head their job will do as well.
 */
function crateMeant(
  brain: NpcBrain,
  number: number | null,
  heard: string,
): HeldCrate | undefined {
  const named =
    number === null
      ? undefined
      : brain.heldCrates.find((crate) => crate.number === number);
  if (named) {
    return named;
  }
  const said = heard.toLowerCase();
  const says = (words: string) =>
    !!words &&
    new RegExp(`\\b${words.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(
      said,
    );
  return brain.heldCrates.find((crate) => {
    if (!crate.for || crate.out || crate.takenBy) {
      return false;
    }
    const job =
      brain.pdaPeople.find((person) => person.name === crate.for)?.job ?? '';
    return says(crate.for) || says(firstName(crate.for)) || says(job);
  });
}

/**
 * Keeps the work on held crates true to what the server says is waiting, who has come for one, and
 * who is owed a reminder.
 */
function syncHeld(brain: NpcBrain): void {
  // Whoever came to the counter for a crate has a task until it is out in the lobby for them.
  const asked = brain.pickupAsked;
  const crate =
    asked && asked.number !== null && brain.now - asked.at < PICKUP_ASK_DS
      ? brain.heldCrates.find((held) => held.number === asked.number)
      : undefined;
  const item =
    crate && !crate.out && !crate.takenBy ? String(crate.number) : null;
  for (const task of brain.tasks) {
    if (task.kind === HANDOVER && task.state !== 'done' && task.item !== item) {
      // They are told when it is out, in so many words. Nobody is owed more word than that.
      task.reported = true;
      finishTask(brain, task);
    }
  }
  if (item && asked && !findTask(brain, HANDOVER, { item })) {
    addTask(brain, {
      kind: HANDOVER,
      item,
      urgency: 'asked',
      source: 'asked',
      askedBy: asked.name,
    });
  }

  // Its turn to see what is still waiting. The server keeps the count, and says when it is up.
  const check = findTask(brain, CHECK);
  if (brain.heldCheckDue && !check) {
    addTask(brain, { kind: CHECK, urgency: 'asked', source: 'own' });
  } else if (!brain.heldCheckDue && check) {
    finishTask(brain, check);
  }

  // Whoever ordered crates that are still waiting is reminded, once for each look.
  const owed = brain.hasPda
    ? brain.notices.filter((notice) => notice.kind === 'waiting')
    : [];
  for (const notice of owed) {
    if (!findTask(brain, REMIND, { item: notice.to })) {
      addTask(brain, {
        kind: REMIND,
        item: notice.to,
        urgency: 'asked',
        source: 'own',
      });
    }
  }
  for (const task of brain.tasks) {
    if (
      task.kind === REMIND &&
      task.state !== 'done' &&
      !owed.some((notice) => notice.to === task.item)
    ) {
      finishTask(brain, task);
    }
  }
}

/** What one of the tasks about held crates comes down to right now, or null if the task is not one. */
function planHeld(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind === HANDOVER) {
    const crate = brain.heldCrates.find(
      (held) => String(held.number) === task.item,
    );
    const who = task.askedBy ?? 'Someone';
    const handle = task.askedBy ? brain.handles[task.askedBy] : undefined;
    return crate
      ? {
          ready: true,
          step: `${who} has come to the counter for crate #${crate.number}${crate.for && crate.for !== who ? `, which ${crate.for} ordered` : ''}. You are fetching it out to the Cargo Lobby for them.`,
          act: {
            tool: 'release',
            number: crate.number,
            ...(handle ? { person: handle } : {}),
          },
        }
      : { ready: false, step: 'That crate has gone.' };
  }
  if (task.kind === CHECK) {
    return {
      ready: true,
      step: 'Crates that came in on orders are still waiting in the bay to be collected, and it is your turn to look them over. You are saying so, and going to see which are still there.',
      act: { tool: 'check_held' },
    };
  }
  if (task.kind === REMIND) {
    const notice = brain.notices.find(
      (owed) => owed.kind === 'waiting' && owed.to === task.item,
    );
    if (!notice) {
      return { ready: false, step: 'There is nobody left to remind.' };
    }
    const written = cratesWritten(notice.numbers);
    return {
      ready: true,
      step: `You have looked over the bay: ${written}, which ${notice.to} ordered, ${notice.numbers.length === 1 ? 'is' : 'are'} still waiting to be collected. You are sending ${notice.to} a PDA message to remind them.`,
      act: {
        tool: 'message',
        person: notice.to,
        text: `Still waiting at cargo: ${written} from your order. Send someone to the Cargo Lobby counter with the number, please.`,
      },
    };
  }
  return null;
}

/** Says one of the tasks about held crates in a few words, or null if the task is not one. */
function describeHeld(task: Task): string | null {
  if (task.kind === HANDOVER) {
    return `bring crate #${task.item} out to the lobby`;
  }
  if (task.kind === CHECK) {
    return 'see which crates are still waiting to be collected';
  }
  return task.kind === REMIND
    ? `remind ${task.item} that their crates are waiting`
    : null;
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
    task.askedBy ??= arrivedNotice(brain)?.to;
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

  // Having sent for a janitor to a mess in its post, it expects one. Whichever janitor turns up
  // in there while the mess lasts has come about it, and is not asked their business.
  if (brain.post && brain.janitorCalls[brain.post]) {
    for (const person of brain.peopleInView) {
      if (person.in_post && isJanitor(person.job)) {
        noteSentFor(brain, person.name);
      }
    }
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
  syncHeld(brain);
  syncTidying(brain);

  // Whoever is to be let through the door has a task until the door has been opened for them.
  // Opening a door for someone is not the same as their going through it. Anyone it took to be
  // inside one of its rooms and can see is somewhere else, is not inside.
  if (brain.post) {
    for (const person of brain.peopleInView) {
      const believed = ownRooms(brain)
        .flatMap((room) => stillInside(brain.post ?? '', room, brain.now))
        .find((entry) => entry.name === person.name);
      // Where they stand, if the server says. Failing that, for its post, whether they are in it.
      const elsewhere = !believed
        ? false
        : person.place !== undefined
          ? person.place !== believed.room
          : believed.room === brain.post && !person.in_post;
      // Not straight away: for a moment after the door opens they are still on the way in.
      if (believed && elsewhere && brain.now - believed.at > GONE_THROUGH_DS) {
        noteLetOut(brain.post, person.name);
      }
    }
  }
  const wants = doorWanted(brain);
  const asked = brain.doorAsked;
  if (wants && !findTask(brain, DOOR, { item: wants.name, place: wants.room })) {
    addTask(brain, {
      kind: DOOR,
      item: wants.name,
      place: wants.room,
      urgency: 'asked',
      source: 'own',
    });
    // Asked by PDA, by someone a door hides, the answer goes back the same way, by name.
    if (asked?.byPda && asked.name === wants.name) {
      brain.toTell.push({
        to: wants.name,
        line: `${firstName(wants.name)}, I am coming to the door of the ${wants.room} to let you ${wants.out ? 'out' : 'in'}.`,
        why: `${wants.name} has sent word that they are at the door of the ${wants.room}. You are sending back that you are on your way to let them ${wants.out ? 'out' : 'in'}.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }
  for (const task of brain.tasks) {
    if (
      task.kind === DOOR &&
      task.state !== 'done' &&
      (task.item !== wants?.name || task.place !== wants?.room)
    ) {
      finishTask(brain, task);
    }
  }
  // Someone who asked by PDA and is not being let in is told so, by name, once. Nobody sent for
  // them, and a door locked to the crew does not open for the asking.
  if (
    asked?.byPda &&
    !asked.refused &&
    !asked.out &&
    brain.now - asked.at < DOOR_ASK_DS &&
    wants?.name !== asked.name
  ) {
    asked.refused = true;
    brain.toTell.push({
      to: asked.name,
      line: `Sorry, ${firstName(asked.name)}, nobody here sent for you${asked.room ? ` to the ${asked.room}` : ''}, so I cannot let you in.`,
      why: `${asked.name} has asked by PDA to be let in${asked.room ? ` to the ${asked.room}` : ''}. Nobody who works here sent for them, so you are sending back that you cannot.`,
      byPda: true,
      at: Date.now(),
    });
  }

  // With nothing else in hand and nobody wanting it, it looks in on the rest of its department
  // now and then. Nobody else may ever see inside those rooms.
  syncRounds(
    brain,
    !orderInHand(brain) &&
      !freightInHand(brain) &&
      !heldInHand(brain) &&
      !tidyingInHand(brain) &&
      !wants,
  );

  // Away from its post with nothing to see through, it goes back.
  const away =
    !!brain.post &&
    brain.location !== brain.post &&
    !orderInHand(brain) &&
    !freightInHand(brain) &&
    !heldInHand(brain) &&
    !tidyingInHand(brain) &&
    !roundsInHand(brain) &&
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
    // Whoever it is may be on the far side of the door, out of sight. The body still knows them.
    // The body knows by a handle anyone it has seen. Someone a door has always hidden it knows
    // only by name, and that will do: the server finds whoever of that name is at the door.
    const wants = doorWanted(brain);
    return wants && wants.name === task.item
      ? {
          ready: true,
          step: `${doorCue(wants)} You are going to open the door for them.`,
          act: {
            tool: 'open_door',
            ...(brain.handles[wants.name]
              ? { person: brain.handles[wants.name] }
              : {}),
            name: wants.name,
            place: wants.room,
          },
        }
      : { ready: false, step: `${task.item} has gone.` };
  }
  if (task.kind !== ORDER) {
    // Tidying is for when the orders and the shuttle have been seen to.
    return (
      planHeld(brain, task) ??
      planFreight(brain, task) ??
      planRounds(brain, task) ??
      planTidying(
        brain,
        task,
        orderInHand(brain) || freightInHand(brain) || heldInHand(brain),
      )
    );
  }
  // The order has come in. Whoever placed it is sent the number on each crate's manifest: that is
  // what whoever they send for it gives at the counter.
  const arrived = arrivedNotice(brain);
  if (arrived) {
    const written = cratesWritten(arrived.numbers);
    const several = arrived.numbers.length > 1;
    return {
      ready: true,
      step: `What ${arrived.to} ordered has come in: ${written}. ${several ? 'They are' : 'It is'} held in the bay until someone comes to the counter for ${several ? 'them' : 'it'}, and you are sending ${arrived.to} a PDA message with the number${several ? 's' : ''}.`,
      act: {
        tool: 'message',
        person: arrived.to,
        text: `Your order has come in: ${written}${arrived.what ? ` (${arrived.what})` : ''}. Send someone to the Cargo Lobby counter with the number to collect ${several ? 'each one' : 'it'}.`,
      },
    };
  }
  return { ready: false, step: 'There is nothing to do on it yet.' };
}

/** Someone a door of the department is to be opened for: who, which room, and whether it is to let them out. */
type DoorWant = { name: string; room: string; out: boolean };

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** The rooms whose doors are this NPC's to open: its post, and the rest of its department. */
function ownRooms(brain: NpcBrain): string[] {
  return [
    ...new Set([
      ...(brain.post ? [brain.post] : []),
      ...brain.lookInRooms,
      ...brain.closedRooms,
    ]),
  ];
}

/**
 * The room of its own that this person can be seen standing in and cannot let themselves out of, or
 * undefined. The server says which room each person in view is in: a window shows people who are
 * in the next room, so being able to see someone says nothing about where they are.
 */
function seenInside(brain: NpcBrain, person: PersonInView): string | undefined {
  if (person.belongs || isCargo(person.job)) {
    return undefined;
  }
  if (person.in_post && brain.post) {
    return brain.post;
  }
  return person.place !== undefined &&
    brain.closedRooms.includes(person.place)
    ? person.place
    : undefined;
}

/**
 * Whether someone who has asked for a door may be let through it, and which way. Out, for anyone
 * who is inside one of its rooms and cannot get out. In, only for someone the department sent for
 * to that room, while the mess they were sent for is still there: the call is the permission. A
 * janitor at the door of the post while the post has a mess in it has plainly come about that.
 */
function mayPass(
  brain: NpcBrain,
  name: string,
  room: string | undefined,
  out: boolean | undefined,
): DoorWant | null {
  const post = brain.post;
  if (!post) {
    return null;
  }
  const person = brain.peopleInView.find((seen) => seen.name === name);
  const inside = ownRooms(brain)
    .flatMap((own) => stillInside(post, own, brain.now))
    .find((entry) => entry.name === name);
  // Asking to be let out, or standing inside the post where it can be seen.
  if (out !== false) {
    // Someone it can see standing inside one of its rooms, who cannot let themselves out.
    const seenIn = person ? seenInside(brain, person) : undefined;
    if (seenIn) {
      return { name, room: seenIn, out: true };
    }
    // Someone it let in and cannot see. If it can see them, where they stand is what counts.
    if (inside && !person) {
      return { name, room: inside.room, out: true };
    }
    if (inside && person?.place === undefined) {
      return { name, room: inside.room, out: true };
    }
  }
  if (out || person?.in_post || (person && seenInside(brain, person))) {
    return null;
  }
  if (inside && !person) {
    return null;
  }
  const wanted = room ?? post;
  if (!brain.areaMesses[wanted]) {
    return null;
  }
  const sentFor = !!expectedCall(post, name, brain.now, wanted);
  const cameAbout =
    wanted === post && !!person && isJanitor(person.job) && !person.in_post;
  return sentFor || cameAbout ? { name, room: wanted, out: false } : null;
}

/**
 * Who a door of the department is to be opened for right now, if anyone: someone who has asked and
 * may be let through, someone expected who has knocked, or someone it let in whose work in there
 * is done. Seeing the janitor it sent for walk into the lobby is not enough: they may only be
 * passing through, and a door opened for nobody lets in whoever is nearest it.
 */
function doorWanted(brain: NpcBrain): DoorWant | null {
  const post = brain.post;
  if (!post) {
    return null;
  }
  const asked = brain.doorAsked;
  if (asked && brain.now - asked.at < (asked.out ? LET_OUT_ASK_DS : DOOR_ASK_DS)) {
    const want = mayPass(brain, asked.name, asked.room, asked.out);
    if (want) {
      return want;
    }
  }
  // A knock says which door, and not who. If someone is expected there, or was let in there and
  // is still inside, it is them.
  const knock = brain.knockAt;
  if (
    knock &&
    brain.now - knock.at < DOOR_ASK_DS &&
    ownRooms(brain).includes(knock.room)
  ) {
    // Two do not go to one door. Whoever sent for them, or let them in, sees to it if they are
    // here to. With nobody to say whose it is, the first of those at the post by name goes.
    const mine = (by?: string) =>
      by
        ? by === brain.name ||
          !brain.peopleInView.some((seen) => seen.name === by)
        : !brain.peopleInView.some(
            (seen) => isCargo(seen.job) && seen.name < brain.name,
          );
    if (knock.inside) {
      // From inside: someone it let in there. Failing that, in its post, which it can see into,
      // whoever is in there who does not work there.
      const letIn = stillInside(post, knock.room, brain.now)[0];
      const seen = brain.peopleInView.find(
        (person) => seenInside(brain, person) === knock.room,
      );
      const inside = letIn ?? seen;
      if (inside && mine(letIn?.by)) {
        return { name: inside.name, room: knock.room, out: true };
      }
    } else {
      // From outside: only someone the department sent for, while the mess is still there.
      const due = expectedAt(post, knock.room, brain.now).find((entry) =>
        mine(entry.by),
      );
      if (due && brain.areaMesses[knock.room]) {
        return { name: due.name, room: knock.room, out: false };
      }
    }
  }
  // Someone it let into a room where the mess is now gone has nothing left to do in there, and
  // cannot get out alone. Nobody is left behind a door they cannot open.
  for (const room of ownRooms(brain)) {
    if (room === post || brain.areaMesses[room]) {
      continue;
    }
    const left = stillInside(post, room, brain.now)[0];
    if (left) {
      return { name: left.name, room, out: true };
    }
  }
  return null;
}

/** Says why someone is being let through a door, for the step and for what the LLM is told. */
function doorCue(want: DoorWant): string {
  return want.out
    ? `${want.name} is inside the ${want.room} and cannot get out by themselves: the door is locked to them.`
    : `${want.name} was sent for to clean up the mess in the ${want.room}, and the door is locked to them.`;
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
  // A locked room of its department other than its post is out of everyone's sight. A janitor is
  // in there only if one was let in.
  const lockedAway = !inPost && brain.closedRooms.includes(place);
  const letIn = brain.post ? stillInside(brain.post, place, brain.now)[0] : null;
  const here = lockedAway
    ? letIn
      ? { name: letIn.name }
      : undefined
    : brain.peopleInView.find(
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
  // One call from a post is enough. Whoever is slower to it leaves it a while longer when a
  // workmate has sent for a janitor already.
  if (
    brain.workmateCalled ||
    brain.now - task.createdAt < NOTICE_DS + stagger(brain, CALL_STAGGER_DS)
  ) {
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
      text: `There is a mess in the ${place}${what ? `: ${what}` : ''}. Could you come and clean it up, please?${place === brain.post ? ' Come to the Cargo Lobby and I will let you in.' : lockedAway ? ' Come to its door and knock, and I will let you in.' : ''}`,
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
    : (describeHeld(task) ??
        describeFreight(task) ??
        describeRounds(task) ??
        describeTidying(task));
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
  // What is being held, so that what it says about a crate someone has come for is true.
  const waiting = brain.heldCrates.filter((crate) => !crate.takenBy);
  if (waiting.length > 0) {
    lines.push(
      `You are holding ${cratesWritten(waiting.map((crate) => crate.number))} for collection. Whoever comes to the counter and gives a crate's number is brought it in the lobby, by your body.`,
    );
  }
  const came = brain.pickupAsked;
  if (came && brain.now - came.at < PICKUP_ASK_DS) {
    lines.push(
      came.number === null
        ? `${came.name} has come to collect a crate, and you are holding none by the number they gave: tell ${came.name} so if you speak.`
        : `${came.name} has come to collect crate #${came.number}. Your body is seeing to it: say so if you speak of it.`,
    );
  }
  const wants = doorWanted(brain);
  if (wants) {
    lines.push(
      `${doorCue(wants)} You are opening the door for them now: say so if you speak of it.`,
    );
  } else if (brain.doorAsked && brain.now - brain.doorAsked.at < DOOR_ASK_DS) {
    // Someone has asked who is not being let in. What it says has to match what it does.
    lines.push(
      `${brain.doorAsked.name} has asked you about the door. You are not opening it for them: a door of your department is only opened for a janitor that you or a workmate sent for, while the mess they were sent for is still there, or to let out someone who is inside. If you answer, tell ${brain.doorAsked.name} so by name.`,
    );
  }
  return lines;
}

/** Who said a line of a report: "[time] Name says: ...". */
function speakerOf(line: string): string {
  return line.match(/\] (.+?) says: /)?.[1] ?? '';
}

/** What was said in a line of a report, without who said it or where from. */
function spokenIn(line: string): string {
  return line.match(/"([^"]*)"/)?.[1] ?? line;
}

/** Numbers as they are said when ordering. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  a: 1,
  an: 1,
  two: 2,
  three: 3,
  four: 4,
};

/** How many crates were asked for: "two crates", "3 crates", "a crate". One, if no number was given. */
function cratesAskedFor(said: string): number {
  const asked = said.match(/\b(\d+|one|two|three|four|an?)\s+crates?\b/);
  if (!asked) {
    return 1;
  }
  return NUMBER_WORDS[asked[1]] ?? Math.max(1, Number(asked[1]) || 1);
}

/**
 * Ordering is what cargo staff can agree to, one order at a time, and only for a head of
 * department. Anyone else is not offered it at all, so the LLM cannot take their order by mistake:
 * they take what they need to their own head, who orders for the whole of their staff at once.
 */
function offers(brain: NpcBrain, askers: PersonInView[] = []): Option[] {
  if (
    !askers.some((person) => !!person.command || isHead(person.job)) ||
    brain.orderable.length === 0 ||
    brain.orderPending ||
    // Someone at the door wants the door. Offered an order as well, the LLM sometimes takes it.
    doorWanted(brain) ||
    // Likewise someone come to collect a crate: "I am here for crate 12" is not an order for one.
    (!!brain.pickupAsked && brain.now - brain.pickupAsked.at < PICKUP_ASK_DS)
  ) {
    return [];
  }
  return [
    {
      tool: 'order',
      parameter: { name: 'crate', choices: brain.orderable },
      text: `order at the supply console what a head of department has just asked you for, for them or their staff. How many crates, your body takes from what was said. Asking means putting it to you: "can you order...", "could I get...", "have you got any...", or telling you, by name, what they need. Someone only saying what they are off to do themselves ("I'll get some from the closet") has not asked. ${brain.orderable.map((crate) => `The ${crate} holds ${CRATE_HOLDS[crate] ?? 'what its name says'}.`).join(' ')} Not for anything else. The shuttle brings it in a minute or two.`,
    },
  ];
}

export const CARGO: Job = {
  is: isCargo,
  keepsPost: true,
  cleans: false,
  about,
  whenAsked,
  cues,
  syncTasks,
  plan,
  describeTask,
  // Getting a mess seen to is quick, for cargo: it is a message, not a mop.
  weighs: (_brain, task) =>
    task.kind === TIDY
      ? 'All that takes is a PDA message to a janitor.'
      : null,
  // A message sent about a mess is a janitor called to it.
  afterActing: (brain, act, task, ok) => {
    afterFreight(brain, act, task);
    // The crate is out in the lobby for whoever came for it, and they are told so by name.
    if (task?.kind === HANDOVER && ok && task.askedBy) {
      brain.toTell.push({
        to: task.askedBy,
        line: `${firstName(task.askedBy)}, crate ${task.item} is out in the lobby for you.`,
        why: `You have brought crate #${task.item} out to the Cargo Lobby for ${task.askedBy}, who came for it. You are telling ${task.askedBy} it is there to take.`,
        // Which crate, and where it is: they have to hear both.
        needs: new RegExp(`\\b${task.item}\\b.*\\blobby\\b`, 'i'),
        at: Date.now(),
      });
      if (brain.pickupAsked?.name === task.askedBy) {
        brain.pickupAsked = null;
      }
    }
    // The door has been opened for them, or could not be. Either way that request is dealt with.
    if (task?.kind === DOOR) {
      if (brain.doorAsked?.name === task.item) {
        brain.doorAsked = null;
      }
      if (brain.knockAt?.room === task.place) {
        brain.knockAt = null;
      }
      // Whoever it opened the door for went through it by its leave. The department keeps track
      // of who is in which of its rooms, so that they are let out again.
      if (ok && task.item && task.place && brain.post) {
        noteSentFor(brain, task.item);
        const person = brain.peopleInView.find(
          (seen) => seen.name === task.item,
        );
        const wasInside =
          !!person?.in_post ||
          stillInside(brain.post, task.place, brain.now).some(
            (entry) => entry.name === task.item,
          );
        if (wasInside) {
          noteLetOut(brain.post, task.item);
        } else {
          noteLetIn(brain.post, task.item, task.place, brain.name, brain.now);
        }
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
      // A janitor it has called is one it sent for, whichever room the mess is in. The call goes
      // on the department's list, so that a workmate knows to let them in as well.
      noteSentFor(brain, String(act.person));
      if (brain.post) {
        expectSomeone(
          brain.post,
          String(act.person),
          task.place,
          brain.name,
          brain.now,
        );
      }
    }
  },
  // An order has to have been asked for, and only one of those at the post takes any one asking.
  agrees: (brain, action, heard) =>
    action.tool !== 'order' ||
    (SUPPLY_WORDS.test(heard) &&
      // Coming for a crate that is here is not asking for one to be ordered.
      !COLLECT_WORDS.test(spokenIn(heard)) &&
      takeOrder(brain.post ?? '', speakerOf(heard), brain.name, brain.now)),
  // How many crates, as they were asked for. Where they go is for whoever collects them.
  fills: (_brain, action, heard) => {
    if (action.tool !== 'order') {
      return;
    }
    action.count = cratesAskedFor(spokenIn(heard).toLowerCase());
  },
  // Anyone asking for a door in its hearing is noted. Whether they get it is decided from who
  // they are and where they stand, not from how they ask.
  overhears: (brain, event) => {
    const speaker = String(event.details.speaker ?? '');
    const heard = String(event.details.message ?? '');
    // Someone come to the counter for a crate that is being held. Which crate is read off the
    // number they give, and failing that off who they say it is for. One of those at the post
    // takes any one asking.
    const number = crateNumberIn(heard);
    const theirJob =
      brain.peopleInView.find((person) => person.name === speaker)?.job ?? '';
    if (
      speaker &&
      !isCargo(theirJob) &&
      event.details.said_to !== 'other' &&
      COLLECT_WORDS.test(heard) &&
      (number !== null || /\bcrates?\b/i.test(heard)) &&
      takeOrder(
        brain.post ?? '',
        `${speaker}, for a crate`,
        brain.name,
        brain.now,
      )
    ) {
      const crate = crateMeant(brain, number, heard);
      brain.pickupAsked = {
        name: speaker,
        number: crate?.number ?? null,
        at: brain.now,
      };
      const first = firstName(speaker);
      if (!crate) {
        brain.toTell.push({
          to: speaker,
          line: `Sorry, ${first}, I am not holding a crate by that number.`,
          why: `${speaker} has come to collect a crate. You are holding none by the number they gave, nor one for anyone they named, and are telling them so.`,
          // A plain no, whatever else is said: they are standing there waiting for a crate.
          needs: /\b(not|no|none|cannot|can't|don't|isn't)\b/i,
          at: Date.now(),
        });
      } else if (crate.out || crate.takenBy) {
        brain.toTell.push({
          to: speaker,
          line: crate.takenBy
            ? `${first}, ${crate.takenBy} has taken crate ${crate.number} already.`
            : `${first}, crate ${crate.number} is out in the lobby already.`,
          why: `${speaker} has come to collect crate #${crate.number}, which is ${crate.takenBy ? `already being taken away by ${crate.takenBy}` : 'out in the lobby already'}. You are telling them so.`,
          needs: new RegExp(`\\b${crate.number}\\b`),
          at: Date.now(),
        });
      }
    }
    // Asked of someone else by name, it is theirs to see to: a workmate, or anyone at all.
    if (
      speaker &&
      event.details.said_to !== 'other' &&
      DOOR_WORDS.test(heard)
    ) {
      brain.doorAsked = {
        name: speaker,
        at: brain.now,
        out: LET_OUT_WORDS.test(heard),
      };
    }
  },
  // Someone a door hides sends word that they are at it. The room is the one they name.
  readsMessage: (brain, from, text, at) => {
    if (!from || !DOOR_WORDS.test(text)) {
      return;
    }
    const said = text.toLowerCase();
    const room = ownRooms(brain)
      .sort((a, b) => b.length - a.length)
      .find((own) => said.includes(own.toLowerCase()));
    brain.doorAsked = {
      name: from,
      at,
      room,
      byPda: true,
      out: LET_OUT_WORDS.test(text),
    };
  },
  offers,
  // Plain words for supplies, said to it, are an order for the crate, if it can take one.
  hears: (brain, heard) => {
    const asker = brain.peopleInView.find(
      (person) => person.name === speakerOf(heard),
    );
    return asker &&
      offers(brain, [asker]).length > 0 &&
      /\b(order|crate|suppl\w*|soap|cleaner|mop)\b/i.test(heard) &&
      takeOrder(brain.post ?? '', asker.name, brain.name, brain.now)
      ? { tool: 'order', crate: brain.orderable[0] }
      : null;
  },
};
