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
  lastLetOutAt,
  noteLetIn,
  noteLetOut,
  stillInside,
  takeOrder,
} from '../expected';
import { isHead } from '../hierarchy';
import { CARGO_LOBBY } from '../memory';
import { addTask, blockTask, findTask, finishTask } from '../tasks';
import type {
  Action,
  DoorAsk,
  HeldCrate,
  NpcBrain,
  Option,
  PersonInView,
  Plan,
  SenseEvent,
  Task,
} from '../types';
import {
  afterFreight,
  describeFreight,
  freightCues,
  freightDuty,
  isFreight,
  planFreight,
  syncFreight,
} from './freight';
import { noteSentFor, stagger } from './guarding';
import { beyondRoom, doorNamed, isJanitor, NEEDS_SCRUBBING } from './janitor';
import type { Job } from './job';
import { CALL } from './orders';
import { comeForCrate, crateNumberIn } from './pickups';
import { isSecurity } from './security';
import {
  describeRounds,
  isRounds,
  planRounds,
  roundsInHand,
  syncRounds,
} from './rounds';
import {
  calledIn,
  calledMe,
  DOCKED,
  dutiesIn,
  GIVEN_WORDS,
  isQuartermaster,
  isTechnician,
  LOST_AT_CARGO,
  NOT_PLACED,
  nameCalled,
  orderSpoken,
  orderWritten,
  PLACED_WORDS,
  placedLine,
  QM_SILENT_WORDS,
  quartermasterAboard,
  SEE_TO_WORDS,
  SEND_TO_LET_OUT_WORDS,
  TAKEN,
  THROUGH_QM,
  TRY_CRATE_AGAIN_WORDS,
  WAITING_TOLD,
  WORD_HEARD_WORDS,
  wontComeHow,
  wontComeLine,
} from './supply';
import {
  describeTidying,
  isTidying,
  planTidying,
  syncTidying,
} from './tidying';

/** TRUE if this job title is in cargo, whose work is ordering supplies for the crew. */
export function isCargo(title: string): boolean {
  return /cargo|quartermaster/i.test(title);
}

/** What comes in each crate cargo staff can order, so they can tell what a request calls for. */
const CRATE_HOLDS: Record<string, string> = {
  'Janitorial Supplies Crate':
    'what a janitor cleans with: a mop, space cleaner, buckets, a rag and cleaner grenades. It is the crate to order when a janitor asks for cleaning supplies, soap, cleaner or a mop, whatever they call it',
  'Replacement Lights': 'light tubes and light bulbs, for lights that have gone out',
};

/**
 * The words the paper crate is asked for by (PARSE-06). Exported so that the Quartermaster's own
 * reading of its order book can go by the same words.
 */
export const PAPER_WORDS =
  /bureaucra|paper|stationery|\bpens?\b|clipboards?|office supplies|folders?/i;

/**
 * The words each kind of crate is asked for by. An order may be for several kinds at once ("two
 * crates of janitorial supplies and a crate of light bulbs"), and which kinds, and how many of
 * each, are read off what was said, not left to the LLM.
 */
const CRATE_ASKED_AS: Record<string, RegExp> = {
  // The supplies, not the person: "the janitor says the bar is dark" asks for no soap (CARGO-14).
  // Run-together and short words count: "jani supplies" (PARSE-06).
  'Janitorial Supplies Crate':
    /janitorial|\bjani\b|\bjanitor'?s? (supplies|kit|gear|stuff)|custodial|cleaning|cleaner\b(?! (says|said|wants|needs))|\bmops?\b|\bsoap\b|\bbuckets?\b|\bbrooms?\b|\brags?\b/i,
  // "lightbulbs" as well as "light bulbs" (PARSE-06).
  'Replacement Lights':
    /\blight\s*(bulb|tube)s?\b|\blights?\b|\bbulbs?\b|\btubes?\b/i,
  'Bureaucracy Crate': PAPER_WORDS,
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
/**
 * The words of an ask, and the words of a line about an order already made, or of one called off
 * (CARGO-07). "Has my order come in yet?", "Where is my crate?" and "Cancel that order." name an
 * order and ask for none. A bare "in" or "not" is no sign: "a crate of lights in for the bar" and
 * "soap, not lights" are asks.
 */
const ASK_WORDS =
  /\b(order|need|want|get|send|bring|could|can|please|requisition)\b/i;
const NOT_AN_ASK =
  /\b(my|the|that|this|your|an?) (order|crate)\b.*\b(come in|arrived|ready|yet|here)\b|\b(cancel|do not|don't|never mind)\b|\bwhere\b/i;
/** TRUE if these words ask for something to be ordered, and are not about an order already made. */
function asksToOrder(words: string): boolean {
  return ASK_WORDS.test(words) && !NOT_AN_ASK.test(words);
}
/** A held crate to bring out to the lobby for whoever has come for it. The task's item is its manifest number. */
const HANDOVER = 'handover';
/** Going to see which crates are still waiting in the bay to be collected. */
const CHECK = 'check_held';
/** A reminder owed to someone whose crates are still waiting. The task's item is their name. */
const REMIND = 'remind';
/** Word owed to someone that a crate of theirs has been lost. The task's item is their name. */
const LOST = 'lost_crate';
const HELD_KINDS = new Set([HANDOVER, CHECK, REMIND, LOST]);
/** An order the Quartermaster has given it, to place at the console. The task's item is the order's number in the Quartermaster's book. */
const GIVEN = 'given_order';
/** Word owed to the Quartermaster that a crate would not go where it was meant to. The task's item is what the crate is called. */
const WONT_COME = 'wont_come';
/** A hand-over the Quartermaster sent it to, not one someone asked it for at the counter: the task's `via`. */
const SEE_TO = 'see_to';
/** For each NPC, the held crate the Quartermaster has sent it to bring out to the lobby, and when (CARGO-18). */
const seeToCrates = new Map<string, { number: number; at: number }>();
/**
 * Word owed to the Quartermaster that an order it gave could not be placed (CARGO-03). The task's
 * item is the order's number, `from` the Quartermaster who gave it, `found` why it could not be.
 */
const NOT_PLACED_TASK = 'not_placed';
/** How long (deciseconds) it leaves word of an order not placed, having not found the Quartermaster, before it goes to tell it again. */
const NOT_PLACED_AGAIN_DS = 1200;
/** How long (deciseconds) word of an order not placed is kept, all told, before it is let go. */
const NOT_PLACED_KEPT_DS = 18000;
/** How many times running the walk to the Quartermaster's office door may fail before word for it is left a while (KNB-15). */
const DOOR_MISSES = 2;
/** For each NPC and task (`id:task`), how many times running the walk to the Quartermaster's office door has failed. */
const doorMisses = new Map<string, number>();
/** How long (deciseconds) a haul it gave up on is worth telling the Quartermaster of. */
const WONT_COME_DS = 3000;
/** How long (deciseconds) the shuttle and the rooms are its to see to as well, once the Quartermaster has sent it to help a workmate. */
const SEE_TO_DS = 3000;
/** How long (deciseconds) a head's word at the counter that the Quartermaster has not answered stands. */
const QM_SILENT_DS = 1200;
/** How long (deciseconds) before a head is told a second time that orders go through the Quartermaster. */
const SENT_TO_QM_DS = 3000;
/** How long (deciseconds) it waits at the Quartermaster's door, having knocked, before it sends word on by PDA itself. */
const AT_QM_DOOR_DS = 900;
/** How long (deciseconds) it waits, having told the Quartermaster something, to hear that it was heard. */
const HEARD_WAIT_DS = 250;
/** How many times it says a thing to the Quartermaster with no word back before it sends it on by PDA itself. */
const TELL_TRIES = 2;
/** How near (tiles) it stands to the Quartermaster to say again what was not heard the first time. */
const TELL_DISTANCE = 2;
/** How long (deciseconds) after opening a door for someone before it will open that door for them again. The door is held that long. */
const DOOR_OPENED_DS = 150;
/** How long (deciseconds) a workmate who was given a piece of the standing work can be out of sight before it is seen to for them. */
const HOLDER_ABOUT_DS = 600;
/** The words that mark what a head says at the counter as an order, for telling them who takes it. */
const ORDERING_WORDS = /\b(order|ordering|requisition)\b/i;
/** How long (deciseconds) someone's asking for a crate at the counter stands. */
const PICKUP_ASK_DS = 1200;
/** Someone who is to be let through the door of the post. The task's item is their name. */
const DOOR = 'door';
/**
 * Standing by a door it has just opened for someone, until they are through (KNB-04, step 7). The
 * server holds the door from beside it, opening it again if it shuts too soon; a walk given now
 * would take the body off and leave the door to shut on them. The task's item is their name, its
 * place the room, its `out` which way.
 */
const DOOR_WATCH = 'door_watch';
/** How long (deciseconds), at most, it stands by a door it opened: the server's hold, 15 s held on up to three times by 5 s, and a little over, so that a lost word cannot keep it there. */
const DOOR_WATCH_DS = 350;
/** How long (deciseconds) after seeing them through it stays, for the door to be shut behind them. */
const DOOR_WATCH_SETTLE_DS = 20;
/** The words that mark what someone says as asking for a door to be opened. */
const DOOR_WORDS =
  /\bdoor\b|let (me|us) (in|out|through|leave)|get (me|us) out|i want out|open up/i;
/**
 * The words that mark a request for a door as wanting out, not in. Not the bare word "out": "I'm
 * locked out" and "I'm out here at the door" want in (PARSE-08).
 */
const LET_OUT_WORDS =
  /let (me|us) out|\bleave\b|get (me |us )?out|outta here|\bdone in\b|\b(i'?m|i am) (done|finished)\b|\b(shut|locked|stuck) in\b|\bi want out\b|\b(need|have|got) to go\b/i;
/** The words that mark a request for a door as wanting in, which win over the words for out. */
const LET_IN_WORDS =
  /let (me|us) in\b|locked out|\b(i'?m|i am) (out here|outside)|\bcome in\b|\bget in\b/i;

/** TRUE if the words of an ask for a door want out: words for out, and none for in (PARSE-08). */
function wantsOutByWords(text: string): boolean {
  return LET_OUT_WORDS.test(text) && !LET_IN_WORDS.test(text);
}
/** How long (deciseconds) after a door is opened for someone before seeing them outside it means they are out. */
const GONE_THROUGH_DS = 300;
/** How long (deciseconds) a request to be let out stands. Longer: they ask once, and cannot leave until it is answered. */
const LET_OUT_ASK_DS = 3000;
/** How long (deciseconds) a request for the door stands. */
const DOOR_ASK_DS = 600;
/** How long (deciseconds) the technician who has the rooms is given to answer a door, when they are out of sight, before the other goes. */
const KEEPER_WAIT_DS = 450;
/** How long (deciseconds) someone must have been inside a room, with the mess there gone and no word from them, before the door is opened for them unasked. */
const LEFT_INSIDE_DS = 1800;
/** How long (deciseconds) a mess is left before a janitor is called to it: one may be on the way already. */
const NOTICE_DS = 600;
/** How long (deciseconds) after calling a janitor to a room before calling again about it. */
const CALL_AGAIN_DS = 6000;
/** How long (deciseconds) a mess that two janitors have said they cannot shift is left before anyone is called to it again. Ten minutes had the same cobweb called for all round. */
const DECLINED_AGAIN_DS = 18000;
/** How many janitors may send word that they cannot shift a mess before it is left alone for that long. */
const JANITORS_TRIED = 2;
/** How long (deciseconds) after letting someone out of an inner room it leaves it before it opens the next door for them. */
const NEXT_DOOR_DS = 40;
/** How long "your crate is out in the lobby" is worth saying for, in milliseconds. */
const LOBBY_LINE_KEPT_MS = 20000;
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
function whenAsked(brain: NpcBrain, heard: string): string[] {
  const quartermaster = quartermasterAboard(brain);
  return [
    quartermaster
      ? `Every order for supplies goes through the Quartermaster, ${quartermaster.name}, who is the head of your department. You take an order only from ${quartermaster.name}, face to face, and your body places it. Anyone else who asks you to order something, a head of department included, is told kindly to send their order to ${quartermaster.name} by PDA. When an order comes in, your body tells ${quartermaster.name} so, holds the crate in the bay, and brings it out to whoever comes to the counter with its number.`
      : 'You take orders for supplies only from the Captain and the heads of department. Anyone else who asks is told, kindly, to take it to the head of their own department: for the janitors and the rest of the service staff, that is the Head of Personnel. When a head does order, tell them you will see to it: your body places the order, holds the crate in the bay when it comes, and sends them a PDA message with its manifest number, for whoever they send to give at the counter. If they ask for something you cannot order, say so.',
    'You do not clean, fetch things or show people around: that would take you from your post. Asked to, say it is not your job. Cleaning is for the janitors: if someone you answer to tells you to send for one, your body does.',
    // Only when what was said touches on it. It is a lot to read for "how is your day going?".
    ...(OWN_WORK_WORDS.test(heard)
      ? [
          'The rest of your work your body does by itself: it unloads the supply shuttle and hands out the mail, puts away what is left lying about, and, if you have the rooms this shift or nobody does, sends a janitor a PDA message when there is a mess. The door to your post stays locked to everyone but cargo. Your body opens it only for a janitor come to clean in there, or to let out someone who is inside, and anyone else found in there is asked why and walked out if they have no good reason. Never the Captain or a head of staff.',
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
  return (
    brain.orderPending ||
    (!!arrivedNotice(brain) && brain.hasPda) ||
    (!!brain.givenOrder && !brain.givenOrder.placed)
  );
}

/**
 * The Quartermaster an order's arrival is to be told to, face to face: whoever gave this NPC the
 * order, if that was the Quartermaster and it is still aboard. Null if word goes straight to
 * whoever ordered, by PDA, as it does with no Quartermaster.
 */
function toldThrough(
  brain: NpcBrain,
  via: string | null | undefined,
): { name: string; job: string } | null {
  const quartermaster = quartermasterAboard(brain);
  return quartermaster && via === quartermaster.name ? quartermaster : null;
}

/**
 * Which piece of the standing work a task is part of, where the Quartermaster has divided it
 * among those at the post: the shuttle (what comes in on it and goes back on it) or the rooms
 * (looking in on the department, keeping it tidy, the crates left waiting). Null for work that
 * is whoever's it falls to: the counter is worked by whoever is asked.
 */
function dutyOf(task: Task): string | null {
  if (task.kind === CHECK || isRounds(task) || isTidying(task)) {
    return 'rooms';
  }
  return freightDuty(task);
}

/**
 * The workmate a piece of the standing work has been given to, if it is not this NPC's and
 * that workmate is about: in sight, or seen not long since. Null if it is this NPC's own, if
 * nobody has divided the work, or if whoever has it is nowhere to be seen: then it is seen to
 * by whoever is there, the way it was before.
 */
function leftTo(brain: NpcBrain, duty: string | null): string | null {
  if (!duty) {
    return null;
  }
  // Sent by the Quartermaster to help a workmate with a crate, the shuttle and the rooms are its
  // to see to as well for a while, whoever they were given to.
  if (
    brain.now < brain.seeToUntil &&
    (duty === 'shuttle' || duty === 'rooms')
  ) {
    return null;
  }
  const holders = Object.entries(brain.duties)
    .filter(([, theirs]) => theirs.includes(duty))
    .map(([name]) => name);
  if (holders.length === 0 || holders.includes(brain.name)) {
    return null;
  }
  // Seen on their feet and free: a workmate lying in view, or in cuffs, is not about to do it,
  // and being seen like that does not count as seen (CARGO-12).
  return (
    holders.find(
      (name) =>
        ableInView(brain, name) ||
        brain.now - (brain.ableAt?.[name] ?? -Infinity) < HOLDER_ABOUT_DS,
    ) ?? null
  );
}

/** How near (tiles) someone stands to be at the counter with it, as addressing.ts's FACING_RANGE. */
const COUNTER_REACH = 3;

/**
 * TRUE if a line was put to this technician, or to nobody in particular by someone standing at its
 * counter (KNB-10). The Captain in the Quartermaster's Office, speaking to the Quartermaster, is
 * heard across the bay as speaking to nobody, and is not at the counter.
 */
function atMyCounter(
  brain: NpcBrain,
  event: SenseEvent,
  speaker: string,
): boolean {
  const to = event.details.said_to;
  if (to === 'me') {
    return true;
  }
  if (to === 'other') {
    return false;
  }
  const seen = brain.peopleInView.find((person) => person.name === speaker);
  return (
    !!seen &&
    (seen.place === CARGO_LOBBY || (seen.distance ?? 99) <= COUNTER_REACH)
  );
}

/** TRUE if it can see this person on their feet and free to work: not down, not in cuffs. */
function ableInView(brain: NpcBrain, name: string): boolean {
  return brain.peopleInView.some(
    (person) => person.name === name && !person.down && !person.cuffed,
  );
}

/** Notes when each person in view was last seen on their feet and free (CARGO-12). */
function noteAble(brain: NpcBrain): void {
  brain.ableAt ??= {};
  for (const person of brain.peopleInView) {
    if (!person.down && !person.cuffed) {
      brain.ableAt[person.name] = brain.now;
    }
  }
}

/** TRUE while there is work of this sort that is this NPC's own to be getting on with. */
function inHand(brain: NpcBrain, is: (task: Task) => boolean): boolean {
  return brain.tasks.some(
    (task) =>
      is(task) && task.state === 'open' && !leftTo(brain, dutyOf(task)),
  );
}

/** TRUE while there is freight work that is this NPC's to be getting on with. */
function freightInHand(brain: NpcBrain): boolean {
  return inHand(brain, isFreight);
}

/** TRUE while there are things lying about that are this NPC's to put away. */
function tidyingInHand(brain: NpcBrain): boolean {
  return inHand(brain, isTidying);
}

/** TRUE while there is work on the crates being held that it could be getting on with. */
function heldInHand(brain: NpcBrain): boolean {
  return inHand(brain, (task) => HELD_KINDS.has(task.kind));
}

/**
 * Word this NPC owes someone about their crates, taken to the Quartermaster face to face where
 * there is one: that an order has come in, that crates are still waiting, or that one is lost.
 * Nothing between a technician and the Quartermaster goes by PDA. If the Quartermaster is in
 * sight it is told, in so many words. If not, the technician goes to its office door, knocks, and
 * waits. Said is not told: the Quartermaster answers by name that it has it, and only then is the
 * server told that word has been passed on, and the Quartermaster sends it to whoever the crates
 * are for. With no answer, it walks up and says it once more. Returns the step, or null if word
 * goes by PDA as it always did: there is no Quartermaster, it is not to be found, or it has twice
 * not answered.
 */
function tellQuartermaster(
  brain: NpcBrain,
  task: Task,
  quartermaster: { name: string } | null,
  line: string,
  about: string,
  passed: Action,
): Plan | null {
  if (!quartermaster || task.byPda) {
    return null;
  }
  if (task.passedOn) {
    return {
      ready: true,
      step: `You have told ${quartermaster.name} ${about}, and they have said they have it. They will send word to whoever it concerns.`,
      act: passed,
    };
  }
  // Said, and not yet answered. Being in sight is not being in earshot, so word is only passed on
  // once the Quartermaster says it has it. With nothing back in a little while, it was not heard.
  if (task.toldAt !== undefined) {
    if (brain.now - task.toldAt < HEARD_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `You have told ${quartermaster.name} ${about}, and are waiting to hear that they have it.`,
      };
    }
    task.toldAt = undefined;
    task.unheard = (task.unheard ?? 0) + 1;
    task.walkedUp = false;
    task.knockedAt = undefined;
  }
  // Said more than once with no word back: it stops trying to say it, and sends it on by PDA.
  if ((task.unheard ?? 0) >= TELL_TRIES) {
    task.byPda = true;
    return null;
  }
  const seen = brain.peopleInView.find(
    (person) => person.name === quartermaster.name,
  );
  // Not heard the first time, it does not call across the bay again: it walks up to them.
  if (seen && task.unheard && (seen.distance ?? 0) > TELL_DISTANCE && !task.walkedUp) {
    return {
      ready: true,
      step: `You told ${quartermaster.name} ${about} and they did not hear. You are walking up to them to say it again.`,
      act: { tool: 'approach', person: seen.handle },
    };
  }
  if (seen) {
    task.telling = line;
    return {
      ready: true,
      step: `You have word for ${quartermaster.name}, the Quartermaster, ${about}, and they are here. Your body is telling them, in these words: "${line}"`,
      say: line,
      exact: true,
    };
  }
  const office = brain.headOffice;
  const waitedAtDoor =
    task.knockedAt !== undefined && brain.now - task.knockedAt > AT_QM_DOOR_DS;
  // A body that cannot get to the office door, shut aboard the shuttle or in a room, does not hold
  // the word until it is stale: it gives up on the door as it would after knocking (KNB-15).
  const cannotReach =
    (doorMisses.get(`${brain.id}:${task.id}`) ?? 0) >= DOOR_MISSES;
  if (!office || waitedAtDoor || cannotReach) {
    task.byPda = true;
    return null;
  }
  if (brain.atDoorOf !== office) {
    return {
      ready: true,
      step: `You have word for ${quartermaster.name}, the Quartermaster, ${about}. It goes to them face to face, and they are not in sight, so you are going to the door of the ${office}.`,
      act: { tool: 'go_to_door', place: office },
    };
  }
  if (task.knockedAt === undefined) {
    return {
      ready: true,
      step: `You are at the door of the ${office} with word for ${quartermaster.name} ${about}. You are knocking.`,
      act: { tool: 'knock' },
    };
  }
  return {
    ready: false,
    wait: true,
    step: `You have knocked at the door of the ${office}, and are waiting for ${quartermaster.name} to come out: you have word ${about}.`,
  };
}

/** Writes manifest numbers the way they are written down: "crate #12", "crates #12 and #13". */
function cratesWritten(numbers: number[]): string {
  return `crate${numbers.length === 1 ? '' : 's'} ${listed(numbers.map((number) => `#${number}`))}`;
}

/**
 * The held crate someone at the counter means. It goes by the number they gave. With no number, or
 * one that is no crate's, it goes by who the crate is for, if they said: the crate is marked with
 * that name, and the name alone: not their job. With no number given, the one crate held
 * for whoever is asking comes first: "I'm here for my crate" from the one it is for (CARGO-08).
 * With several held for them and no number, it does not pick: they are asked which.
 */
function crateMeant(
  brain: NpcBrain,
  number: number | null,
  heard: string,
  speaker = '',
): HeldCrate | undefined {
  const named =
    number === null
      ? undefined
      : brain.heldCrates.find((crate) => crate.number === number);
  if (named) {
    return named;
  }
  // Only when no number was given: one who gave a wrong number is told so, not handed another.
  const theirs = number === null ? heldFor(brain, speaker) : [];
  if (theirs.length === 1) {
    return theirs[0];
  }
  const said = heard.toLowerCase();
  const says = (words: string) =>
    !!words &&
    new RegExp(`\\b${words.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(
      said,
    );
  // By the name on it, not by a job: a job is not written on the label, and anyone at all can say
  // "for the Head of Personnel" (TRUST-04).
  return brain.heldCrates.find((crate) => {
    if (!crate.for || crate.out || crate.takenBy) {
      return false;
    }
    return says(crate.for) || says(firstName(crate.for));
  });
}

/** The held crates for this person that are still in the bay, not brought out or taken. */
function heldFor(brain: NpcBrain, name: string): HeldCrate[] {
  return name
    ? brain.heldCrates.filter(
        (crate) => crate.for === name && !crate.out && !crate.takenBy,
      )
    : [];
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
  let item =
    crate && !crate.out && !crate.takenBy ? String(crate.number) : null;
  // Or the Quartermaster has sent it to bring out a crate a workmate could not, or told it to try
  // its own again (CARGO-18). That lasts until the crate is out or taken, or a while has gone by.
  const sent = seeToCrates.get(brain.id);
  const sentCrate =
    sent && brain.now - sent.at < SEE_TO_DS
      ? brain.heldCrates.find((held) => held.number === sent.number)
      : undefined;
  const sentItem =
    sentCrate && !sentCrate.out && !sentCrate.takenBy
      ? String(sentCrate.number)
      : null;
  if (sent && !sentItem) {
    seeToCrates.delete(brain.id);
  }
  const bySeeTo = !item && !!sentItem;
  item ??= sentItem;
  for (const task of brain.tasks) {
    if (task.kind === HANDOVER && task.state !== 'done' && task.item !== item) {
      // They are told when it is out, in so many words. Nobody is owed more word than that.
      task.reported = true;
      finishTask(brain, task);
    }
  }
  if (item && !findTask(brain, HANDOVER, { item })) {
    if (bySeeTo) {
      // Whoever came for it is not in the Quartermaster's words: the lobby line says "Someone".
      const task = addTask(brain, {
        kind: HANDOVER,
        item,
        urgency: 'asked',
        source: 'asked',
      });
      task.via = SEE_TO;
    } else if (asked) {
      addTask(brain, {
        kind: HANDOVER,
        item,
        urgency: 'asked',
        source: 'asked',
        askedBy: asked.name,
      });
    }
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

  // Whoever ordered a crate that has been lost is told so, once. The body has already said it
  // aloud at the post: this is the word that reaches whoever is not there to hear.
  const lost = brain.hasPda
    ? brain.notices.filter((notice) => notice.kind === 'lost')
    : [];
  for (const notice of lost) {
    if (!findTask(brain, LOST, { item: notice.to })) {
      addTask(brain, {
        kind: LOST,
        item: notice.to,
        urgency: 'asked',
        source: 'own',
      });
    }
  }
  for (const task of brain.tasks) {
    if (
      task.kind === LOST &&
      task.state !== 'done' &&
      !lost.some((notice) => notice.to === task.item)
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
    if (crate && task.via === SEE_TO) {
      return {
        ready: true,
        step: `The Quartermaster has sent you to bring crate #${crate.number} out to the Cargo Lobby, as it would not come out before. You are fetching it out.`,
        act: { tool: 'release', number: crate.number },
      };
    }
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
  if (task.kind === LOST) {
    const notice = brain.notices.find(
      (owed) => owed.kind === 'lost' && owed.to === task.item,
    );
    if (!notice) {
      return { ready: false, step: 'There is nobody left to tell.' };
    }
    const written = cratesWritten(notice.numbers);
    const why = notice.why ?? 'it cannot be found';
    const quartermaster = quartermasterAboard(brain);
    const toQuartermaster = tellQuartermaster(
      brain,
      task,
      quartermaster,
      `${firstName(quartermaster?.name ?? '')}, ${written} for ${notice.to} ${notice.numbers.length === 1 ? 'is' : 'are'} lost: ${why}.`,
      `that ${written}, which ${notice.to} ordered, ${notice.numbers.length === 1 ? 'has' : 'have'} been lost`,
      { tool: 'word_passed', person: notice.to, kind: 'lost' },
    );
    if (toQuartermaster) {
      return toQuartermaster;
    }
    return {
      ready: true,
      step: `${written}, which ${notice.to} ordered, ${notice.numbers.length === 1 ? 'has' : 'have'} been lost: ${why}. Nobody can be handed ${notice.numbers.length === 1 ? 'it' : 'them'} now. You are sending ${notice.to} a PDA message to say so.`,
      act: {
        tool: 'message',
        person: notice.to,
        // What cannot be done without comes first: a PDA message that runs long is cut off at the end.
        text: `${LOST_AT_CARGO} ${written}${notice.what ? ` (${notice.what})` : ''} from your order. ${why[0].toUpperCase()}${why.slice(1)}. It will have to be ordered again, and nobody need come for it.`,
      },
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
    const quartermaster = quartermasterAboard(brain);
    const toQuartermaster = tellQuartermaster(
      brain,
      task,
      quartermaster,
      `${firstName(quartermaster?.name ?? '')}, ${WAITING_TOLD} ${written} for ${notice.to}.`,
      `that ${written}, which ${notice.to} ordered, ${notice.numbers.length === 1 ? 'is' : 'are'} still waiting to be collected`,
      { tool: 'word_passed', person: notice.to, kind: 'waiting' },
    );
    if (toQuartermaster) {
      return toQuartermaster;
    }
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

/**
 * Keeps the word owed to the Quartermaster about a crate that would not come. A technician who
 * gave a haul up, and put the crate clear of the doors, tells the Quartermaster, who is the one
 * to say what is done about it. With no Quartermaster aboard there is nobody to tell, and the
 * crate is tried again in its turn like any other.
 */
function syncWontCome(brain: NpcBrain): void {
  const gaveUp = brain.gaveUp;
  const how = gaveUp ? wontComeHow(gaveUp.tool) : null;
  const telling = brain.tasks.find(
    (task) => task.kind === WONT_COME && task.state !== 'done',
  );
  // The Quartermaster is told of one crate once in a while, not each time the same haul fails.
  const owed =
    !!gaveUp &&
    !!how &&
    brain.now - gaveUp.at < WONT_COME_DS &&
    brain.now - (brain.wontComeTold[gaveUp.what] ?? -Infinity) > WONT_COME_DS &&
    !!quartermasterAboard(brain);
  // Told and heard, or no longer worth telling: done with. Not found, or not answered, it is not
  // dropped: wontComeStep leaves it a while and takes it to the Quartermaster again, while it is
  // still owed. Whether it may go by PDA instead is the owner's to say (KNB-15, CARGO-02).
  if (telling && (telling.passedOn || !owed)) {
    if (telling.passedOn && telling.item) {
      brain.wontComeTold[telling.item] = brain.now;
      // A crate it could not bring out to the lobby is the Quartermaster's to see to now: it
      // stands down from it, and brings it out again only if told to (CARGO-18).
      const number = Number(telling.item.match(/#(\d+)/)?.[1]);
      if (gaveUp?.tool === 'release' && brain.pickupAsked?.number === number) {
        brain.pickupAsked = null;
        const handover = findTask(brain, HANDOVER, { item: String(number) });
        if (handover) {
          handover.reported = true;
          finishTask(brain, handover);
        }
      }
    }
    telling.reported = true;
    finishTask(brain, telling);
    brain.gaveUp = null;
    return;
  }
  if (gaveUp && !owed) {
    brain.gaveUp = null;
    return;
  }
  if (owed && gaveUp && !telling) {
    addTask(brain, {
      kind: WONT_COME,
      item: gaveUp.what,
      urgency: 'asked',
      source: 'own',
    });
  }
  if (telling) {
    blockTask(
      telling,
      telling.retryAt !== undefined && brain.now < telling.retryAt
        ? 'you could not find the Quartermaster to tell them, and will try again shortly'
        : null,
    );
  }
}

/**
 * Word for the Quartermaster that could not be got to it this time: not found, not at its office,
 * or not answering. It is left a while (NOT_PLACED_AGAIN_DS) and then taken to it afresh: the
 * counts that sent it away are started again (KNB-15, CARGO-03).
 */
function tellAgainLater(brain: NpcBrain, task: Task): void {
  task.byPda = false;
  task.unheard = 0;
  task.walkedUp = false;
  task.knockedAt = undefined;
  task.toldAt = undefined;
  doorMisses.delete(`${brain.id}:${task.id}`);
  task.retryAt = brain.now + NOT_PLACED_AGAIN_DS;
}

/** What telling the Quartermaster of a crate that would not come comes down to right now. */
function wontComeStep(brain: NpcBrain, task: Task): Plan {
  const gaveUp = brain.gaveUp;
  const how = gaveUp ? wontComeHow(gaveUp.tool) : null;
  const quartermaster = quartermasterAboard(brain);
  if (!gaveUp || !how || !quartermaster || task.passedOn) {
    return { ready: false, step: 'There is nothing left to tell of it.' };
  }
  const step = tellQuartermaster(
    brain,
    task,
    quartermaster,
    wontComeLine(
      firstName(quartermaster.name),
      gaveUp.what,
      how,
      gaveUp.leftIn,
    ),
    `that you could not get ${gaveUp.what} ${how}`,
    // Never taken: once the Quartermaster has it, the task is closed and nothing more is done.
    { tool: 'rest' },
  );
  if (step) {
    return step;
  }
  tellAgainLater(brain, task);
  return {
    ready: false,
    step: `You could not find ${quartermaster.name} to tell them that you could not get ${gaveUp.what} ${how}. You will try again shortly.`,
  };
}

/** Why the console would not take an order, in the technician's words, from what the server said. */
function notPlacedWhy(text: string): string {
  if (/not enough money/i.test(text)) {
    return 'There is not enough money in the cargo budget for it.';
  }
  if (/supply console/i.test(text)) {
    return 'I could not find a supply console to order from.';
  }
  if (/could not get to/i.test(text)) {
    return 'I could not get to the console.';
  }
  return 'The console would not take it.';
}

/**
 * Keeps the word owed to the Quartermaster that an order could not be placed. It is told face to
 * face, the way the other words are, and is done with once the Quartermaster says it has it. Not
 * found, or not heard twice, it is left a while and taken to it again: nothing between the two of
 * them goes by PDA, and a lost word leaves the order given in the book for the round (CARGO-03).
 */
function syncNotPlaced(brain: NpcBrain): void {
  const quartermaster = quartermasterAboard(brain);
  for (const task of brain.tasks) {
    if (task.kind !== NOT_PLACED_TASK || task.state === 'done') {
      continue;
    }
    if (
      task.passedOn ||
      !quartermaster ||
      quartermaster.name !== task.from ||
      brain.now - task.createdAt > NOT_PLACED_KEPT_DS
    ) {
      task.reported = true;
      finishTask(brain, task);
      continue;
    }
    blockTask(
      task,
      task.retryAt !== undefined && brain.now < task.retryAt
        ? `you could not find ${task.from} to tell them, and will try again shortly`
        : null,
    );
  }
}

/** What telling the Quartermaster that an order could not be placed comes down to right now. */
function notPlacedStep(brain: NpcBrain, task: Task): Plan {
  const by = task.from ?? '';
  const line = `${firstName(by)}, order ${task.item} ${NOT_PLACED}. ${task.found ?? 'The console would not take it.'}`;
  const step = tellQuartermaster(
    brain,
    task,
    { name: by },
    line,
    `that order ${task.item}, which they gave you, could not be placed`,
    // Never taken: once the Quartermaster has it, the task is closed and nothing more is done.
    { tool: 'rest' },
  );
  if (step) {
    return step;
  }
  // Not found, or twice not heard: left a while, then taken to it afresh.
  tellAgainLater(brain, task);
  return {
    ready: false,
    step: `You could not find ${by} to tell them that order ${task.item} could not be placed. You will try again shortly.`,
  };
}

/** Says one of the tasks about held crates in a few words, or null if the task is not one. */
function describeHeld(task: Task): string | null {
  if (task.kind === HANDOVER) {
    return `bring crate #${task.item} out to the lobby`;
  }
  if (task.kind === CHECK) {
    return 'see which crates are still waiting to be collected';
  }
  if (task.kind === LOST) {
    return `tell ${task.item} that a crate of theirs has been lost`;
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
  noteAble(brain);
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
  // An order the Quartermaster gave it is its to place until it has been.
  const given = brain.givenOrder;
  const giving = findTask(
    brain,
    GIVEN,
    given ? { item: String(given.n) } : undefined,
  );
  if (given && !given.placed && !giving) {
    addTask(brain, {
      kind: GIVEN,
      item: String(given.n),
      urgency: 'asked',
      source: 'asked',
    });
  }
  for (const task of brain.tasks) {
    if (
      task.kind === GIVEN &&
      task.state !== 'done' &&
      (!given || given.placed || task.item !== String(given.n))
    ) {
      // Whoever gave it hears when it comes in. Nobody is owed word that it is placed.
      task.reported = true;
      finishTask(brain, task);
    }
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
    // A call stands for a good while. One that was answered with "I cannot shift it" does not:
    // someone else is sent for straight away.
    blockTask(
      task,
      call &&
        brain.now - call.at < CALL_AGAIN_DS &&
        !(call.declined ?? []).includes(call.to)
        ? `you have sent ${call.to}, a janitor, a PDA message about it`
        : null,
    );
  }

  syncFreight(brain);
  syncHeld(brain);
  syncWontCome(brain);
  syncNotPlaced(brain);
  syncTidying(brain);

  // Whoever is to be let through the door has a task until the door has been opened for them.
  // Opening a door for someone is not the same as their going through it. Anyone it took to be
  // inside one of its rooms and can see is somewhere else, is not inside.
  if (brain.post) {
    const post = brain.post;
    for (const person of brain.peopleInView) {
      // Every room it takes them to be in. A door may have been opened for them that they never
      // went through, so there can be more than one.
      const believed = ownRooms(brain)
        .flatMap((room) => stillInside(post, room, brain.now))
        .filter((entry) => entry.name === person.name);
      if (believed.length === 0) {
        continue;
      }
      // Seen standing in another of its locked rooms than any it had them down for: that is where
      // they are, and it is noted, so that they are let out of that one.
      const seenIn = seenInside(brain, person);
      if (seenIn && !believed.some((entry) => entry.room === seenIn)) {
        noteLetIn(post, person.name, seenIn, believed[0].by, brain.now);
      }
      for (const entry of believed) {
        // Where they stand, if the server says. Failing that, for its post, whether they are in it.
        const elsewhere =
          person.place !== undefined
            ? person.place !== entry.room
            : entry.room === post && !person.in_post;
        // Not straight away: for a moment after the door opens they are still on the way in. And
        // out of that room only: seen in the room beyond it, they are still in that one.
        if (elsewhere && brain.now - entry.at > GONE_THROUGH_DS) {
          noteLetOut(post, person.name, entry.room);
        }
      }
    }
  }
  const wants = doorWanted(brain);
  // The ask of whoever the door is being opened for, if they asked.
  const asked = askFrom(brain, wants?.name);
  if (wants && !findTask(brain, DOOR, { item: wants.name, place: wants.room })) {
    // Which way they are going through it is kept with the task: someone standing in the post
    // may be asking to be let into a room that lies inside it.
    addTask(brain, {
      kind: DOOR,
      item: wants.name,
      place: wants.room,
      urgency: 'asked',
      source: 'own',
    }).out = wants.out;
    // Asked by PDA, by someone a door hides, the answer goes back the same way, by name. Once:
    // their turn may come round a second time, and they have been told already.
    if (asked?.byPda && !asked.answered) {
      asked.answered = true;
      // The door they named is named back, so that both know it is the same one.
      const which = asked.door && asked.room === wants.room ? `${asked.door} ` : '';
      brain.toTell.push({
        to: wants.name,
        line: `${firstName(wants.name)}, I am coming to the ${which}door of the ${wants.room} to let you ${wants.out ? 'out' : 'in'}.`,
        why: `${wants.name} has sent word that they are at the door of the ${wants.room}. You are sending back that you are on your way to let them ${wants.out ? 'out' : 'in'}.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }
  // Not one whose door the body is on its way to open now: the server opens it whatever is said
  // meanwhile, and only the result, finding the task, books the let-in, drops the ask and keeps
  // it by the door (PLAY-05). The driver forgets a step that never comes back, so this ends.
  for (const task of brain.tasks) {
    if (
      task.kind === DOOR &&
      task.state !== 'done' &&
      (task.item !== wants?.name || task.place !== wants?.room) &&
      !(brain.lastAct?.task === task.id && brain.lastAct.tool === 'open_door')
    ) {
      finishTask(brain, task);
    }
  }
  // The door it is standing by is done with once they are seen through it, and a moment after
  // for it to be shut behind them; or once the hold would be over in any case.
  for (const task of brain.tasks) {
    if (task.kind === DOOR_WATCH && task.state !== 'done') {
      if (
        brain.now - task.createdAt > DOOR_WATCH_DS ||
        brain.now < task.createdAt
      ) {
        finishTask(brain, task);
        continue;
      }
      const key = `${brain.id}:${task.id}`;
      const since = seenThroughAt.get(key);
      if (!throughDoor(brain, task)) {
        seenThroughAt.delete(key);
      } else if (since === undefined) {
        seenThroughAt.set(key, brain.now);
      } else if (brain.now - since >= DOOR_WATCH_SETTLE_DS) {
        seenThroughAt.delete(key);
        finishTask(brain, task);
      }
    }
  }
  // Someone who asked by PDA and is not being let in is told so, by name, once. Nobody sent for
  // them, and a door locked to the crew does not open for the asking. Not someone who may come
  // in and is only waiting behind whoever the door is being opened for first, and never someone
  // who has just been told that it is on its way to them. Each ask is looked at, not only the last.
  for (const ask of doorAsks(brain)) {
    if (
      ask.byPda &&
      !ask.refused &&
      !ask.answered &&
      !ask.out &&
      brain.now - ask.at < DOOR_ASK_DS &&
      wants?.name !== ask.name &&
      !mayPass(brain, ask.name, ask.room, ask.out)
    ) {
      ask.refused = true;
      brain.toTell.push({
        to: ask.name,
        line: `Sorry, ${firstName(ask.name)}, nobody here sent for you${ask.room ? ` to the ${ask.room}` : ''}, so I cannot let you in.`,
        why: `${ask.name} has asked by PDA to be let in${ask.room ? ` to the ${ask.room}` : ''}. Nobody who works here sent for them, so you are sending back that you cannot.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }

  // With nothing else in hand and nobody wanting it, it looks in on the rest of its department
  // now and then. Nobody else may ever see inside those rooms.
  syncRounds(
    brain,
    !leftTo(brain, 'rooms') &&
      !orderInHand(brain) &&
      !freightInHand(brain) &&
      !heldInHand(brain) &&
      !tidyingInHand(brain) &&
      !wants &&
      !visitorToMind(brain),
  );

  // Away from its post with nothing to see through, it goes back. An order placed and waiting on
  // the shuttle is nothing to stand about for: it goes back to its post meanwhile (MULTI-02).
  const away =
    !!brain.post &&
    brain.location !== brain.post &&
    !(orderInHand(brain) && !brain.orderPending) &&
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
  // Standing work the Quartermaster gave to a workmate who is about is theirs to do.
  const duty = dutyOf(task);
  const theirs = leftTo(brain, duty);
  if (theirs) {
    return {
      ready: false,
      step: `That is ${theirs}'s to see to: the Quartermaster gave them the ${duty} this shift.`,
    };
  }
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
  if (task.kind === WONT_COME) {
    return wontComeStep(brain, task);
  }
  if (task.kind === NOT_PLACED_TASK) {
    return notPlacedStep(brain, task);
  }
  if (task.kind === DOOR_WATCH) {
    // Waiting, and asked for: it ranks ahead of the rest of its work, so no walk takes it off.
    return {
      ready: false,
      wait: true,
      asked: true,
      step: `You have opened the door of the ${task.place} for ${task.item} and are standing by it until they are through.`,
    };
  }
  if (task.kind === DOOR) {
    // Whoever it is may be on the far side of the door, out of sight. The body still knows them.
    // The body knows by a handle anyone it has seen. Someone a door has always hidden it knows
    // only by name, and that will do: the server finds whoever of that name is at the door.
    const wants = doorWanted(brain);
    // Which of the room's doors, if they said, or if the knock that brought it here told it.
    // An ask that names no room: the door they named is taken to be one of the room they are
    // being let through.
    const ask = askFrom(brain, wants?.name);
    const which =
      (ask && (ask.room ?? wants?.room) === wants?.room
        ? ask.door
        : undefined) ??
      (brain.knockAt?.room === wants?.room ? brain.knockAt?.door : undefined);
    return wants && wants.name === task.item
      ? {
          ready: true,
          step: `${doorCue(wants)} You are going to open the ${which ? `${which} ` : ''}door for them.`,
          act: {
            tool: 'open_door',
            ...(brain.handles[wants.name]
              ? { person: brain.handles[wants.name] }
              : {}),
            name: wants.name,
            place: wants.room,
            ...(which ? { door: which } : {}),
          },
        }
      : { ready: false, step: `${task.item} has gone.` };
  }
  if (task.kind === GIVEN) {
    const given = brain.givenOrder;
    if (!given || given.placed) {
      return { ready: false, step: 'That order is placed.' };
    }
    const wanted = orderWritten(given.items);
    // The console takes one order of its at a time. The one on the go is seen through first.
    if (brain.orderPending) {
      return {
        ready: false,
        step: `${given.by} has given you order ${given.n} (${wanted}) to place. You have an order on the go already, and place this one when that has come in.`,
      };
    }
    return {
      ready: true,
      step: `${given.by}, the Quartermaster, has given you order ${given.n} to place: ${wanted}, for ${given.for}. You are going to the supply console to place it.`,
      act: {
        tool: 'order',
        crate: given.items[0].crate,
        count: given.items[0].count,
        items: given.items,
        for_name: given.for,
        via: given.by,
        ref: given.n,
      },
    };
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
    // An order of several kinds says which crate is which: each lot of numbers, then what it is.
    const kinds = [...new Set(arrived.kinds ?? [])];
    const itemised =
      kinds.length > 1
        ? kinds
            .map(
              (kind) =>
                `${cratesWritten(arrived.numbers.filter((_, index) => arrived.kinds?.[index] === kind))} (${kind})`,
            )
            .join('; ')
        : `${written}${(arrived.what ?? kinds[0]) ? ` (${arrived.what ?? kinds[0]})` : ''}`;
    // An order the Quartermaster gave it: word that it has come goes back to the Quartermaster,
    // face to face, and the Quartermaster tells whoever ordered. If the Quartermaster is not to
    // be found, in the bay or behind its office door, word is sent on by PDA as it always was.
    const quartermaster = toldThrough(brain, arrived.via);
    const order =
      typeof arrived.ref === 'number' ? `order ${arrived.ref}` : 'the order';
    const toQuartermaster = tellQuartermaster(
      brain,
      task,
      quartermaster,
      `${firstName(quartermaster?.name ?? '')}, ${order} ${DOCKED} ${itemised}.`,
      `that ${order}, for ${arrived.to}, has come in`,
      { tool: 'word_passed', person: arrived.to, kind: 'arrived' },
    );
    if (toQuartermaster) {
      return toQuartermaster;
    }
    // The Quartermaster's own order, and the Quartermaster not to be found. The PDA says what would
    // have been said to its face, in the same words: those are the words its order book goes by.
    // Sent the line meant for whoever ordered, it never took its own crate to have come in.
    if (
      quartermaster &&
      arrived.to === quartermaster.name &&
      typeof arrived.ref === 'number'
    ) {
      return {
        ready: true,
        step: `Order ${arrived.ref}, which ${quartermaster.name} ordered for themselves, has come in: ${itemised}. You could not find ${quartermaster.name} to tell them, so you are sending them a PDA message.`,
        act: {
          tool: 'message',
          person: quartermaster.name,
          text: `${firstName(quartermaster.name)}, ${order} ${DOCKED} ${itemised}.`,
        },
      };
    }
    return {
      ready: true,
      step: `What ${arrived.to} ordered has come in: ${itemised}. ${several ? 'They are' : 'It is'} held in the bay until someone comes to the counter for ${several ? 'them' : 'it'}, and you are sending ${arrived.to} a PDA message with the number${several ? 's' : ''}.`,
      act: {
        tool: 'message',
        person: arrived.to,
        // What cannot be done without comes first: a PDA message that runs long is cut off at the end.
        text: `Your order has come in: ${itemised}. Send someone to the Cargo Lobby counter with the number to collect ${several ? 'each one' : 'it'}.`,
      },
    };
  }
  return { ready: false, step: 'There is nothing to do on it yet.' };
}

/**
 * Someone a door of the department is to be opened for: who, which room, and whether it is to let
 * them out. `beyond` is the room further in that they were sent for to, if this one is only on the way.
 * `security` is set when they are let in as security, come about a warrant, not sent for to a mess.
 */
type DoorWant = {
  name: string;
  room: string;
  out: boolean;
  beyond?: string;
  security?: boolean;
  /**
   * TRUE for the long stop: someone the department's list has inside a room a good while, who has
   * not asked. Nobody is at the door, so it does not stop an order being taken (CARGO-09).
   */
  unasked?: boolean;
};
/**
 * What the body is told when a door is opened to let out someone who is not in that room: not in
 * sight and not at its door, or not inside it at all. Whatever the department's list says, they
 * are not in there (CARGO-09). The server will mark these `not_inside`; the words are read too.
 */
const NOT_INSIDE_WORDS =
  /you cannot see that person, and they are not at the door|you have no call to let .+ into|you do not know who that is/i;
/** Who a door is opened for when all that is known is that someone is knocking from inside: the body finds who is standing there. */
const SOMEONE_INSIDE = 'whoever is knocking';

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** The other technicians this NPC knows of: in view, or on its PDA list. */
function workmatesKnown(brain: NpcBrain): string[] {
  return [
    ...new Set(
      [...brain.peopleInView, ...brain.pdaPeople]
        .filter(
          (person) => isTechnician(person.job) && person.name !== brain.name,
        )
        .map((person) => person.name),
    ),
  ];
}

/**
 * Whether a line the Quartermaster said is said to this NPC by name: it begins with its whole
 * name, or with its first name and no workmate it knows of shares that. "Sam Cole, order 3" is
 * not Sam Bell's, though both are Sam (QM-03).
 */
function saidToMe(brain: NpcBrain, line: string): boolean {
  return calledMe(calledIn(line), brain.name, workmatesKnown(brain));
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
 * A janitor who is inside the department's locked rooms right now, by name: one it can see in
 * there, or one that was let in and has not been let out. Undefined if there is none.
 */
function janitorWithin(brain: NpcBrain): string | undefined {
  const post = brain.post;
  if (!post) {
    return undefined;
  }
  const seen = brain.peopleInView.find(
    (person) => isJanitor(person.job) && !!seenInside(brain, person),
  );
  return (
    seen?.name ??
    ownRooms(brain).flatMap((room) => stillInside(post, room, brain.now))[0]?.name
  );
}

/**
 * TRUE while someone who does not work in the department is inside one of its locked rooms and
 * there is no workmate at the post to see to them. Whoever let them in sees them out again, so it
 * does not go off on its rounds and leave them behind a door they cannot open.
 */
function visitorToMind(brain: NpcBrain): boolean {
  const post = brain.post;
  if (!post) {
    return false;
  }
  const inside =
    brain.peopleInView.some((person) => !!seenInside(brain, person)) ||
    ownRooms(brain).some((room) => stillInside(post, room, brain.now).length > 0);
  // A technician on its feet: one lying there, in cuffs, or the Quartermaster (who does not open
  // the department's doors) does not see to them (CARGO-12).
  const workmateAtPost = brain.peopleInView.some(
    (person) =>
      person.in_post &&
      isTechnician(person.job) &&
      !person.down &&
      !person.cuffed,
  );
  return inside && !workmateAtPost;
}

/**
 * A room of the department with a mess in it that this person was sent for to, and that can only
 * be got into through this room: a locked room inside a locked room. Whoever is bound for it has
 * to be let through this one first. Undefined if there is none.
 */
function boundBeyond(
  brain: NpcBrain,
  name: string,
  room: string,
): string | undefined {
  const post = brain.post;
  if (!post) {
    return undefined;
  }
  return Object.keys(brain.roomsThrough).find((inner) => {
    if (!brain.areaMesses[inner] || !expectedCall(post, name, brain.now, inner)) {
      return false;
    }
    // Followed outwards from the inner room, until it comes to this one or runs out.
    let outer: string | undefined = brain.roomsThrough[inner];
    for (let depth = 0; outer && outer !== room && depth < 4; depth++) {
      outer = brain.roomsThrough[outer];
    }
    return outer === room;
  });
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
 * The room of the department's that someone asking about a door means, or undefined if they name
 * none. It is the one they name first. They may name another after it: where someone who is shut
 * in is trying to get out to, or the mess further in that they have come about. What follows
 * "door of the" or "let me into the" is the room, if they put it that way: a door goes by a name
 * of its own, and that name may be another of the department's rooms.
 */
function roomAskedIn(brain: NpcBrain, text: string): string | undefined {
  const said = text.toLowerCase();
  const after = said.match(
    /\b(?:door (?:of|out of|into|to)|(?:let|get) (?:me|us) (?:into|in to|out of)) the ([^.,!?]+)/,
  )?.[1];
  const named = (own: string) =>
    after ? after.startsWith(own.toLowerCase()) : false;
  return ownRooms(brain)
    .filter((own) => said.includes(own.toLowerCase()))
    .sort(
      (a, b) =>
        Number(named(b)) - Number(named(a)) ||
        said.indexOf(a.toLowerCase()) - said.indexOf(b.toLowerCase()) ||
        b.length - a.length,
    )[0];
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
  // The room it has them down as being in: the one they named, if it has them down for that one.
  const insides = ownRooms(brain)
    .flatMap((own) => stillInside(post, own, brain.now))
    .filter((entry) => entry.name === name);
  let inside: (typeof insides)[number] | undefined =
    insides.find((entry) => entry.room === room) ?? insides[0];
  // Someone who sends word that they are at the door and asks to be let in is not inside, whatever
  // the record says. A door opened for a janitor who had walked off, or who stood at another door
  // of the room, left them down as let in: when they came back to it they were told that nobody
  // had sent for them. The call that brought them stands again. Only for an ask that names the
  // room, though: one that names none was taken for the post, and wiped the record of someone who
  // was inside it and had only said the word "door".
  if (out === false && inside && !person && room && inside.room === room) {
    inside.inside = false;
    inside = undefined;
  }
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
  const wanted = room ?? post;
  // Standing in the room they ask to be let into, there is nothing to open. Standing in another
  // of its rooms is no bar: a room inside the post is got to from the post.
  const already =
    !!person &&
    (wanted === post ? !!person.in_post : seenInside(brain, person) === wanted);
  const there = already || (!!inside && !person && inside.room === wanted);
  // Security at the door, asking to be let in: it has a warrant on someone inside, and the
  // warrant is the permission. It was left standing in the lobby calling an arrest through the
  // counter until the Captain came and opened the door. Whatever words it asked in: one not seen
  // inside is let in (PARSE-08).
  if (
    !there &&
    isSecurity(
      person?.job ??
        brain.pdaPeople.find((known) => known.name === name)?.job ??
        '',
    )
  ) {
    return { name, room: wanted, out: false, security: true };
  }
  if (out || there) {
    return null;
  }
  // Sent for to a room further in, which has no way to it but through this one.
  const beyond = boundBeyond(brain, name, wanted);
  if (!brain.areaMesses[wanted] && !beyond) {
    return null;
  }
  const sentFor =
    !!brain.areaMesses[wanted] && !!expectedCall(post, name, brain.now, wanted);
  const cameAbout =
    !!brain.areaMesses[wanted] &&
    wanted === post &&
    !!person &&
    isJanitor(person.job) &&
    !person.in_post;
  return sentFor || cameAbout
    ? { name, room: wanted, out: false }
    : beyond
      ? { name, room: wanted, out: false, beyond }
      : null;
}

/**
 * Who a door of the department is to be opened for right now, if anyone: someone who has asked and
 * may be let through, someone expected who has knocked, or someone it let in whose work in there
 * is done. Seeing the janitor it sent for walk into the lobby is not enough: they may only be
 * passing through, and a door opened for nobody lets in whoever is nearest it.
 */
function doorWanted(brain: NpcBrain): DoorWant | null {
  const want = doorSought(brain);
  // A door it has only just opened for them is still being held: the server holds it until they
  // are through, or for a quarter of a minute. Opening it again meanwhile is the same door opened
  // over and over, for someone who is standing talking or has been taken by the arm.
  const opened = lastOpened.get(brain.id);
  if (
    want &&
    opened &&
    opened.name === want.name &&
    opened.room === want.room &&
    // The same way through it, that is. Let in a moment ago and now wanting out is another matter.
    opened.out === want.out &&
    brain.now >= opened.at &&
    brain.now - opened.at < DOOR_OPENED_DS
  ) {
    return null;
  }
  return want;
}

/** When whoever a door is being held for was first seen through it, by the technician's id and the task's. */
const seenThroughAt = new Map<string, number>();

/**
 * TRUE if whoever a door is being held for is seen through it: let in, standing in the room it
 * was opened into; let out, seen outside that room. Not seen at all, it cannot tell, and waits on.
 */
function throughDoor(brain: NpcBrain, task: Task): boolean {
  const person = brain.peopleInView.find((seen) => seen.name === task.item);
  if (!person) {
    return false;
  }
  const inside =
    task.place === brain.post ? !!person.in_post : person.place === task.place;
  return task.out ? !inside : inside;
}

/**
 * The server says the hold on a door is over ("You are done holding the door of X for Y."): the
 * watch on it ends, so the body is free to walk on at once and does not stand there until the
 * time limit when they went through out of its sight (KNB-04, step 7). Matched by whom the door
 * was held for, else by the room; a watch for someone else is left alone.
 */
export function doorHoldOver(
  brain: NpcBrain,
  room: string,
  person: string,
): void {
  for (const task of brain.tasks) {
    if (task.kind !== DOOR_WATCH || task.state === 'done') {
      continue;
    }
    if (person ? task.item === person : !room || task.place === room) {
      finishTask(brain, task);
    }
  }
}

/** The warrant named by security asking at the door ("with a warrant for X"): by the technician's id, then by who asked. */
const warrantAsks = new Map<string, Map<string, string>>();
/** Whom a warrant is for, in the words of an ask for a door: "a warrant for Pun Pun, who is in the ...". */
const WARRANT_FOR = /\bwarrant (?:for|on) (.+?)(?=,|\.|\?|!| who | in the |$)/i;

/** Notes the warrant someone named in asking for a door, or forgets it if they named none. */
function noteWarrantAsk(brain: NpcBrain, name: string, words: string): void {
  const mine = warrantAsks.get(brain.id) ?? new Map<string, string>();
  warrantAsks.set(brain.id, mine);
  const on = words.match(WARRANT_FOR)?.[1]?.trim();
  if (on) {
    mine.set(name, on);
  } else {
    mine.delete(name);
  }
}

/**
 * Why someone the technician has just let in was let in, if it was on a warrant: security are let
 * in because a warrant is the permission (mayPass). Whom it is on, if they said at the door.
 */
function letInOnWarrant(
  brain: NpcBrain,
  name: string,
): { warrant?: string | true } | undefined {
  const job =
    brain.peopleInView.find((seen) => seen.name === name)?.job ??
    brain.pdaPeople.find((known) => known.name === name)?.job ??
    '';
  if (!isSecurity(job)) {
    return undefined;
  }
  return { warrant: warrantAsks.get(brain.id)?.get(name) ?? true };
}

/** The door each technician last opened, for whom, which way, and when (server time), by the technician's id. */
const lastOpened = new Map<
  string,
  { name: string; room: string; out: boolean; at: number }
>();

/** The technician who has the rooms this shift, if the Quartermaster has divided the standing work: the department's doors are theirs. */
function roomsKeeper(brain: NpcBrain): string | undefined {
  return Object.entries(brain.duties).find(([, parts]) =>
    parts.includes('rooms'),
  )?.[0];
}

/**
 * TRUE if a door someone has asked for aloud, or knocked at, is this technician's to open. With
 * the standing work divided, the doors go with the rooms: whoever has those answers, and the
 * other leaves it to them. Two who both heard one ask both went to the door, and one of them was
 * told it would not open. The other answers only when the keeper is out of sight and has had a
 * little while to come, or when the ask was sent to it by name: a PDA message is.
 */
function doorIsMine(brain: NpcBrain, at: number, toMe: boolean): boolean {
  const keeper = roomsKeeper(brain);
  if (toMe || !keeper || keeper === brain.name) {
    return true;
  }
  if (ableInView(brain, keeper)) {
    return false;
  }
  return brain.now - at > KEEPER_WAIT_DS;
}

/** Every ask for a door it has, oldest first. */
function doorAsks(brain: NpcBrain): DoorAsk[] {
  brain.doorAsks ??= brain.doorAsked ? [brain.doorAsked] : [];
  return brain.doorAsks;
}

/** TRUE while an ask for a door still stands: one to be let out stands longer. */
function askLive(brain: NpcBrain, ask: DoorAsk): boolean {
  return brain.now - ask.at < (ask.out ? LET_OUT_ASK_DS : DOOR_ASK_DS);
}

/** The ask of this person, if they have one in. */
function askFrom(brain: NpcBrain, name?: string): DoorAsk | undefined {
  return name ? doorAsks(brain).find((ask) => ask.name === name) : undefined;
}

/**
 * Takes an ask for a door. It goes behind those already in, and wipes none of them: two janitors
 * done in two rooms a few seconds apart are both let out. A second ask from the same person is
 * their newer word and takes the place of their first, keeping its turn; if it is for the same
 * door the same way, what they have been told already stands. Asks that have run out are dropped.
 * A newer ask that names no room, the same way, while their first still stands, is the first said
 * again ("open that door", from a janitor who had sent word of which room): it keeps the room,
 * the door and how they asked, unless it names another door (PLAY-05).
 */
function putAsk(brain: NpcBrain, ask: DoorAsk): void {
  const before = askFrom(brain, ask.name);
  if (
    before &&
    ask.room === undefined &&
    before.room !== undefined &&
    !!before.out === !!ask.out &&
    askLive(brain, before) &&
    !(ask.door && before.door && ask.door !== before.door)
  ) {
    ask.room = before.room;
    ask.door ??= before.door;
    ask.byPda ||= before.byPda;
    ask.after ??= before.after;
  }
  if (before && before.room === ask.room && !!before.out === !!ask.out) {
    ask.answered ||= before.answered;
    ask.refused ||= before.refused;
  }
  const list = doorAsks(brain).map((it) => (it === before ? ask : it));
  if (!before) {
    list.push(ask);
  }
  brain.doorAsks = list.filter((it) => it === ask || askLive(brain, it));
  brain.doorAsked = ask;
}

/** How long (deciseconds) before a door it could not get to, to let someone out, is tried again. */
const DOOR_RETRY_DS = 100;
/** How many times a door it could not get to is gone to, to let someone out, before they are told. */
const DOOR_TRIES = 2;
/** For each NPC and person (`id:name`), how many times a door to let them out could not be got to. */
const letOutTries = new Map<string, number>();

/**
 * A door to let someone out of the department's rooms could not be opened. TRUE if their ask is
 * kept for another try: the body could not get to the door, the first time, and they are still
 * seen shut inside. Otherwise, if they are still inside, they are told why it did not open, by
 * the way they asked, and FALSE: the ask goes, and they are seen out another way. A door that
 * will not open is not gone back to (PLAY-06).
 */
function letOutFailed(
  brain: NpcBrain,
  name: string,
  text: string | undefined,
): boolean {
  const ask = askFrom(brain, name);
  const person = brain.peopleInView.find((seen) => seen.name === name);
  const unreached = /could not get to it/i.test(text ?? '');
  const key = `${brain.id}:${name}`;
  const tries = (letOutTries.get(key) ?? 0) + 1;
  // A door to let them in that the body could not get to, the first time: someone in the way, or
  // a crate. Their ask is kept for one more try, as one to let them out is (CARGO-04).
  if (ask && !ask.out && unreached && tries < DOOR_TRIES) {
    letOutTries.set(key, tries);
    ask.after = brain.now + DOOR_RETRY_DS;
    return true;
  }
  if (!ask?.out || !person || !seenInside(brain, person)) {
    return false;
  }
  if (unreached && tries < DOOR_TRIES) {
    letOutTries.set(key, tries);
    ask.after = brain.now + DOOR_RETRY_DS;
    return true;
  }
  const why = /will not open/i.test(text ?? '')
    ? 'that door will not open for me'
    : unreached
      ? 'I could not get to the door to let you out'
      : null;
  if (why) {
    brain.toTell.push({
      to: name,
      line: `${firstName(name)}, ${why}.`,
      why: `You could not open the door to let ${name} out. You are telling them why, to their face: they are in sight.`,
      at: Date.now(),
    });
  }
  return false;
}

/** Strikes out someone's ask: their door has been opened for them, or could not be. */
function dropAsk(brain: NpcBrain, name: string): void {
  letOutTries.delete(`${brain.id}:${name}`);
  brain.doorAsks = doorAsks(brain).filter((ask) => ask.name !== name);
  if (brain.doorAsked?.name === name) {
    brain.doorAsked = brain.doorAsks.at(-1) ?? null;
  }
}

/** Who a door is wanted for, leaving aside whether it has only just been opened for them: see doorWanted. */
function doorSought(brain: NpcBrain): DoorWant | null {
  const post = brain.post;
  if (!post) {
    return null;
  }
  // Every ask it has, oldest first: whoever asked first is let through first, and someone who
  // asked a moment later waits their turn.
  for (const asked of doorAsks(brain)) {
    if (brain.now < (asked.after ?? 0) || !askLive(brain, asked)) {
      continue;
    }
    const want = mayPass(brain, asked.name, asked.room, asked.out);
    if (want && doorIsMine(brain, asked.at, !!asked.byPda)) {
      return want;
    }
    // Word by PDA from someone who says they are shut in one of its locked rooms, and names it.
    // It has no note of letting them in and cannot see them, but it goes by what it is told and
    // goes to that door. The door is only opened if they are found standing inside it.
    if (
      asked.out &&
      asked.byPda &&
      asked.room &&
      brain.closedRooms.includes(asked.room)
    ) {
      return { name: asked.name, room: asked.room, out: true };
    }
  }
  // A knock from before anyone at the post last let someone out of that room is spent: a
  // workmate has answered it already (LOGA-04). A knock after that still stands.
  if (
    brain.knockAt &&
    lastLetOutAt(post, brain.knockAt.room) > brain.knockAt.at
  ) {
    brain.knockAt = null;
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
    // Once the Quartermaster has divided the work, the doors go with the rooms.
    const mine = (by?: string) =>
      roomsKeeper(brain)
        ? doorIsMine(brain, knock.at, false)
        : by
          ? by === brain.name || !ableInView(brain, by)
          : !brain.peopleInView.some(
              (seen) =>
                isTechnician(seen.job) &&
                !seen.down &&
                !seen.cuffed &&
                seen.name < brain.name,
            );
    if (knock.inside) {
      // From inside: someone it let in there. Failing that, in its post, which it can see into,
      // whoever is in there who does not work there.
      // Only someone let in before the knock can have knocked: one let out and let back in since
      // is not knocking again, and a stale knock let a janitor out mid-scrub (LOGA-04).
      const inThere = stillInside(post, knock.room, brain.now);
      const letIn = inThere.find((entry) => entry.at < knock.at);
      const lateIn = inThere
        .filter((entry) => entry.at >= knock.at)
        .map((entry) => entry.name);
      const seen = brain.peopleInView.find(
        (person) =>
          seenInside(brain, person) === knock.room &&
          !lateIn.includes(person.name),
      );
      const inside = letIn ?? seen;
      if (inside && mine(letIn?.by)) {
        return { name: inside.name, room: knock.room, out: true };
      }
      // Nobody it has down as being in there, and somebody is knocking from inside a room that
      // is locked. Whoever it is cannot get out, and that is reason enough to go and open it:
      // the body finds who is standing at the door. A janitor that had walked back into a room
      // it had been let out of knocked, and was left there, because the record said it was out.
      // Not a knock older than someone let in since: that knock was answered (LOGA-04).
      if (
        !inside &&
        lateIn.length === 0 &&
        brain.closedRooms.includes(knock.room) &&
        mine(undefined)
      ) {
        return { name: SOMEONE_INSIDE, room: knock.room, out: true };
      }
    } else {
      // From outside: only someone the department sent for, while the mess is still there.
      const due = expectedAt(post, knock.room, brain.now).find((entry) =>
        mine(entry.by),
      );
      if (due && brain.areaMesses[knock.room]) {
        return { name: due.name, room: knock.room, out: false };
      }
      // Or someone sent for to a room that lies inside this one, who has to come through it. Not
      // someone who is through it already: the knock is not theirs.
      const inThere = stillInside(post, knock.room, brain.now);
      for (const inner of Object.keys(brain.roomsThrough)) {
        const bound = expectedAt(post, inner, brain.now).find(
          (entry) =>
            mine(entry.by) &&
            !inThere.some((there) => there.name === entry.name) &&
            boundBeyond(brain, entry.name, knock.room) === inner,
        );
        if (bound) {
          return {
            name: bound.name,
            room: knock.room,
            out: false,
            beyond: inner,
          };
        }
      }
    }
  }
  // Someone it let into a room where the mess is now gone has nothing left to do in there, and
  // cannot get out alone. Nobody is left behind a door they cannot open. But nobody is let out
  // who has only just gone in: whoever wants out asks, by a knock, a word or a PDA message, and
  // is let out at once. Opened unasked the moment the mess was not in this technician's sight,
  // the door was held for a janitor who had been let in half a minute before and was scrubbing.
  // This is the long stop, for someone who has been in there a good while and has not asked.
  for (const room of ownRooms(brain)) {
    if (room === post || brain.areaMesses[room]) {
      continue;
    }
    const left = stillInside(post, room, brain.now).find(
      (entry) => brain.now - entry.at > LEFT_INSIDE_DS,
    );
    if (left) {
      return { name: left.name, room, out: true, unasked: true };
    }
  }
  return null;
}

/** Says why someone is being let through a door, for the step and for what the LLM is told. */
function doorCue(want: DoorWant): string {
  return want.out
    ? `${want.name} is inside the ${want.room} and cannot get out by themselves: the door is locked to them.`
    : want.security
      ? `${want.name} is security, at the door of the ${want.room} about a warrant, and the door is locked to them.`
      : want.beyond
      ? `${want.name} was sent for to clean up the mess in the ${want.beyond}, which is reached through the ${want.room}, and the door is locked to them.`
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
  // One let in is taken to be in there seeing to it only for as long as a call stands, and not
  // once they have said it is beyond them: a janitor who left unseen kept the room from ever being
  // called about again (CARGO-09).
  const letIn = brain.post
    ? stillInside(brain.post, place, brain.now).find(
        (entry) =>
          brain.now - entry.at < CALL_AGAIN_DS &&
          !brain.janitorCalls[place]?.declined?.includes(entry.name),
      )
    : null;
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
  // Once the Quartermaster has divided the work, sending for a janitor goes with the rooms. Each
  // technician keeps its own note of who it called and who said they could not shift it, so two
  // who both called sent the same janitor the same five calls four times over, and one called
  // again to a mess two janitors had already told the other was beyond them. That holds while the
  // keeper is about, as every other piece of the standing work does: a keeper in the Brig, shut
  // in, or dead leaves the calling to whoever is here (CARGO-11).
  const keeper = leftTo(brain, 'rooms');
  if (keeper) {
    return {
      ready: false,
      step: `There is a mess in the ${place}. ${keeper} has the rooms this shift, and sends for a janitor when one is wanted.`,
    };
  }
  // Stepping in for a keeper who is away, it does not know whom they sent for: the department's
  // list does. A janitor they sent for here not long since is not sent for on top of.
  const away = roomsKeeper(brain);
  const sentFor =
    away && away !== brain.name && brain.post
      ? expectedAt(brain.post, place, brain.now).find(
          (it) => it.by !== brain.name && brain.now - it.at < CALL_AGAIN_DS,
        )
      : undefined;
  if (sentFor) {
    return {
      ready: false,
      step: `There is a mess in the ${place}. ${sentFor.by} sent for ${sentFor.name}, a janitor, not long ago.`,
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
  // While the supply shuttle is in, crates are being hauled through the bay. A janitor let in to
  // scrub the floor there would only be in the way of them, so that call waits.
  if (inPost && brain.freight?.shuttleDocked) {
    return {
      ready: false,
      step: `There is a mess in the ${place}. You will send for a janitor once the supply shuttle has been seen to and sent back.`,
    };
  }
  const call = brain.janitorCalls[place];
  const declined = call?.declined ?? [];
  // Whoever it last called to this mess is in the department now. They know of it, and nobody
  // else is sent for on top of them.
  const within = janitorWithin(brain);
  if (call && !declined.includes(call.to) && within === call.to) {
    return {
      ready: false,
      step: `${call.to}, the janitor you sent for, is in the department now and knows of the mess in the ${place}.`,
    };
  }
  // A janitor who has sent word that they cannot shift it is not called to it again for a while.
  // One more is asked, and told what the mess wants, so that they come only if they have it. After
  // that it is left: calling every janitor aboard in turn to a mess that wants soap had each of
  // them walk the length of the station to find that out at the door.
  const willing = brain.janitorsOnPda.filter((name) => !declined.includes(name));
  if (willing.length === 0 || declined.length >= JANITORS_TRIED) {
    if (call?.declinedAt !== undefined && brain.now - call.declinedAt > DECLINED_AGAIN_DS) {
      call.declined = [];
    }
    return {
      ready: false,
      step:
        willing.length === 0
          ? `Every janitor you can call has sent word that they cannot shift the mess in the ${place}. You will try them again later.`
          : `${listed(declined)} have sent word that they cannot shift the mess in the ${place}${call?.wantsScrub ? `: ${NEEDS_SCRUBBING}` : ''}. You are leaving it until later.`,
    };
  }
  // A janitor who is in the department already is the one to tell: sending for a second on top
  // of them puts two people behind the locked doors where one will do. Failing that, one who is
  // standing at the counter: they are nearest, and can be let in at once. Failing that, if the
  // last call came to nothing, the next goes to another janitor.
  const calls = call?.count ?? 0;
  const janitor =
    (within && willing.includes(within) ? within : undefined) ??
    brain.peopleInView.find(
      (person) => isJanitor(person.job) && willing.includes(person.name),
    )?.name ??
    willing[calls % willing.length];
  const what = listed(brain.areaMesses[place] ?? []);
  // A room that lies inside the post has no door of its own to come to from outside: the way to
  // it is through the post, by the lobby.
  let outermost = place;
  for (let depth = 0; brain.roomsThrough[outermost] && depth < 4; depth++) {
    outermost = brain.roomsThrough[outermost];
  }
  const byLobby = place === brain.post || outermost === brain.post;
  const wayIn = byLobby
    ? ' Come to the Cargo Lobby and I will let you in.'
    : lockedAway
      ? ' Come to its door and knock, and I will let you in.'
      : '';
  // Someone has tried it and could not shift it. Whoever is asked next is told so, and what it
  // wants, and is asked to come only if they have that.
  const tried = declined[declined.length - 1];
  return {
    ready: true,
    step: tried
      ? `${tried} could not shift the mess in the ${place}. You are sending ${janitor}, another janitor, a PDA message saying what it needs and asking them to come if they have it.`
      : `There is a mess in the ${place}, which is yours to keep fit to work in, and you are sending ${janitor}, a janitor, a PDA message asking them to come and clean it.`,
    act: {
      tool: 'message',
      person: janitor,
      // What it wants is passed on only if whoever tried it said so. Otherwise the next janitor is
      // asked to come and try: what beat the first may have been only what it had in its hand.
      text: !tried
        ? `There is a mess in the ${place}${what ? `: ${what}` : ''}. Could you come and clean it up, please?${wayIn}`
        : call?.wantsScrub
          ? `There is a mess in the ${place}${what ? `: ${what}` : ''}. ${tried.split(' ')[0]} could not shift it: ${NEEDS_SCRUBBING}. Could you come and clean it up if you have one, please?${wayIn}`
          : `There is a mess in the ${place}${what ? `: ${what}` : ''}. ${tried.split(' ')[0]} could not shift it with what they had. Could you come and try, please?${wayIn}`,
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
  if (task.kind === DOOR_WATCH) {
    return `hold the door of the ${task.place} for ${task.item}`;
  }
  if (task.kind === POST) {
    return 'get back to your post';
  }
  if (task.kind === GIVEN) {
    return `place order ${task.item} for the Quartermaster`;
  }
  if (task.kind === WONT_COME) {
    return `tell the Quartermaster that ${task.item} would not come`;
  }
  if (task.kind === NOT_PLACED_TASK) {
    return `tell the Quartermaster that order ${task.item} could not be placed`;
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
  // How the Quartermaster has divided the standing work, so that what it says of it is true.
  const own = brain.duties[brain.name];
  if (own) {
    const others = Object.entries(brain.duties).filter(
      ([name]) => name !== brain.name,
    );
    lines.push(
      `The Quartermaster has divided the standing work this shift. Yours: ${listed(own.map((part) => `the ${part}`))}.${others.length > 0 ? ` ${others.map(([name, theirs]) => `${name} has ${listed(theirs.map((part) => `the ${part}`))}`).join('; ')}.` : ''} The shuttle is unloading it, loading the empties and sending it back; the rooms is looking in on the department, putting things away and checking on crates left waiting. The counter is worked by whoever is asked.`,
    );
  }
  lines.push(...freightCues(brain));
  // What is being held, so that what it says about a crate someone has come for is true.
  const waiting = brain.heldCrates.filter((crate) => !crate.takenBy);
  if (waiting.length > 0) {
    lines.push(
      // Whose each one is, by name. Told only the numbers, two technicians spent a shift saying
      // they were holding the Quartermaster's crate for the Captain.
      `You are holding for collection: ${listed(waiting.map((crate) => `crate #${crate.number}${crate.for ? ` for ${crate.for}` : ''}`))}. Each is for the person named and nobody else: you are holding no crate for anyone not named here, and you never say that you are. Whoever comes to the counter and gives a crate's number is brought it in the lobby, by your body. A crate is never kept back from anyone for any other reason: not until a floor is clean, and not until someone has left.`,
    );
  } else {
    lines.push(
      'You are holding no crate for anyone just now. Do not say that you are.',
    );
  }
  // A crate that would not come, so that nobody is told it is on its way.
  const gaveUp = brain.gaveUp;
  const how = gaveUp ? wontComeHow(gaveUp.tool) : null;
  if (gaveUp && how) {
    lines.push(
      `You could not get ${gaveUp.what} ${how}: it kept catching and getting away from you. ${gaveUp.leftIn ? `Your body has left it in the ${gaveUp.leftIn}, clear of the doors.` : 'It is still lying by a door.'} It is not where it was going, and you do not say that it is or that it is on its way.${quartermasterAboard(brain) ? ' Your body is telling the Quartermaster, who will say what is done about it.' : ' It will be tried again.'}`,
    );
  }
  // A crate that has been lost, so that nobody is promised it.
  for (const notice of brain.notices) {
    if (notice.kind === 'lost') {
      lines.push(
        `${cratesWritten(notice.numbers)}, which ${notice.to} ordered, ${notice.numbers.length === 1 ? 'has' : 'have'} been lost: ${notice.why ?? 'it cannot be found'}. Nobody can be handed ${notice.numbers.length === 1 ? 'it' : 'them'}, and you say so if asked.`,
      );
    }
  }
  // Someone who does not work here is inside one of its rooms. They are not being kept in, and
  // nothing is being held up until they have finished: what it says of them has to be that.
  const post = brain.post;
  const visitors = post
    ? [
        ...new Set([
          ...brain.peopleInView
            .filter((person) => !!seenInside(brain, person))
            .map((person) => person.name),
          ...ownRooms(brain).flatMap((room) =>
            stillInside(post, room, brain.now).map((entry) => entry.name),
          ),
        ]),
      ]
    : [];
  if (visitors.length > 0) {
    lines.push(
      `${listed(visitors)} ${visitors.length === 1 ? 'is' : 'are'} inside your department's locked rooms because someone who works here let them in. Nobody is keeping them in: your body opens the door the moment they ask to be let out, whether or not they have finished, and your own work does not wait on them.`,
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
  } else if (
    brain.doorAsked &&
    brain.now - brain.doorAsked.at < DOOR_ASK_DS &&
    !brain.doorAsked.byPda &&
    roomsKeeper(brain) &&
    roomsKeeper(brain) !== brain.name &&
    mayPass(
      brain,
      brain.doorAsked.name,
      brain.doorAsked.room,
      brain.doorAsked.out,
    )
  ) {
    // Someone who may be let through, and the door is the other technician's to open.
    lines.push(
      `${brain.doorAsked.name} has asked about the door. ${roomsKeeper(brain)} has the rooms this shift, so the door is theirs to open, and you are leaving it to them. If you answer, say that ${firstName(roomsKeeper(brain) ?? '')} is seeing to it. Do not say that nobody sent for them.`,
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
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  both: 2,
  couple: 2,
  pair: 2,
  few: 3,
};
/** The most crates of one kind the console takes in one order (the server's CREW_NPC_ORDER_MAX). */
const ORDER_MAX = 4;
/**
 * Numbers in an order that are not how many: a crate's manifest number ("#12", "crate 12"), an
 * order's number ("order 3:", "order #3"), and anything of three digits or more.
 */
const NOT_A_COUNT =
  /#\s*\d+|\b(crate|number|no\.?|num)\s*#?\s*\d+|\border\s*(#|no\.?|number)\s*\d+|\border \d+\s*:|\b\d{3,}\b/g;
/** How many is said: "x2" or "2x", else the first number in the clause, or "a" or "an" just before "crate". */
const COUNT_WORDS =
  /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|both|couple|pair|few|an?(?= crates?\b))\b/;

/**
 * How many crates a clause of an order asks for, or null if it gives no number: "two crates",
 * "2 janitorial crates", "three lots of", "a couple of", "x2" (CARGO-05). No more than the console
 * takes of one kind at once.
 */
function countIn(said: string): number | null {
  const words = said.replace(NOT_A_COUNT, ' ');
  const times = words.match(/\bx\s?(\d{1,2})\b|\b(\d{1,2})\s?x\b/);
  const asked = times ? (times[1] ?? times[2]) : words.match(COUNT_WORDS)?.[1];
  if (!asked) {
    return null;
  }
  const count = NUMBER_WORDS[asked] ?? Number(asked);
  return count > 0 ? Math.min(ORDER_MAX, count) : null;
}

/** TRUE if these words ask for this kind of crate, by the words it goes by or by its own name. */
function asksFor(crate: string, said: string): boolean {
  const words =
    CRATE_ASKED_AS[crate] ??
    new RegExp(
      crate
        .toLowerCase()
        .replace(/\bcrate\b/, '')
        .trim()
        .replace(/[^a-z0-9 ]/g, '.'),
    );
  return words.test(said);
}

/**
 * Everything an order asks for: each kind of crate named, and how many of it. "Two crates of
 * janitorial supplies and a crate of light bulbs" is two kinds, in one order. The words must be
 * in lower case. A kind that is only named again ("soap and mops") is not ordered twice.
 * Who it is for is no kind: "light bulbs for the janitors" is lights (CARGO-14). The names of
 * those it knows, if given, are taken out the same way ("for Jan Mopp").
 */
export function itemsAskedFor(
  said: string,
  orderable: string[],
  names: string[] = [],
): { crate: string; count: number }[] {
  let words = said.replace(
    /\bfor (the |my |our |a |your )?(janitors?|cleaners?|custodians?|staff|crew|department)\b/g,
    ' ',
  );
  for (const name of names) {
    const escaped = name.toLowerCase().replace(/[^a-z0-9 ]/g, '.');
    const first = escaped.split(' ')[0];
    words = words.replace(
      new RegExp(`\\bfor (${escaped}|${first})\\b`, 'g'),
      ' ',
    );
  }
  const items: { crate: string; count: number }[] = [];
  // "Two crates each of soap and lights": the count said with "each" goes with the kinds after it
  // that have none of their own.
  let each: number | null = null;
  for (const part of words.split(
    /[,;.?!]|\band\b|\bplus\b|\balso\b|\bas well as\b/,
  )) {
    const said = countIn(part);
    if (said !== null) {
      each = /\beach\b/.test(part) ? said : null;
    }
    const count = said ?? each;
    // Every kind the clause names, not only the first on the list.
    for (const crate of orderable.filter((kind) => asksFor(kind, part))) {
      const item = items.find((it) => it.crate === crate);
      if (!item) {
        items.push({ crate, count: count ?? 1 });
      } else if (said !== null) {
        item.count = Math.min(ORDER_MAX, item.count + said);
      }
    }
  }
  return items;
}

/**
 * Ordering is what cargo staff can agree to, one order at a time, and only for a head of
 * department. Anyone else is not offered it at all, so the LLM cannot take their order by mistake:
 * they take what they need to their own head, who orders for the whole of their staff at once.
 */
/**
 * TRUE if the technician takes an order from this person: the Captain or a head of department,
 * and with a Quartermaster aboard only the head who has just said that the Quartermaster did not
 * answer. The one place the rule is kept: what is offered (offers) and what is agreed to (agrees)
 * both go by it (CARGO-06).
 */
function mayOrderFrom(
  brain: NpcBrain,
  person: { name: string; job: string; command?: unknown },
): boolean {
  if (!person.command && !isHead(person.job)) {
    return false;
  }
  if (quartermasterAboard(brain)) {
    const silent = brain.qmSilent;
    return (
      !!silent &&
      brain.now - silent.at <= QM_SILENT_DS &&
      person.name === silent.by
    );
  }
  return true;
}

/**
 * Who said a line of a report, as the body knows them: by the handle in the line, as whoever the
 * order is for is found (brain.ts), and failing that, out of sight now, by the name among those it
 * knows from the PDA list. Null if it cannot say.
 */
function sayerOf(
  brain: NpcBrain,
  line: string,
): { name: string; job: string; command?: unknown } | null {
  const handle = line.match(/\(person (\w+)/)?.[1];
  const seen = handle
    ? brain.peopleInView.find((person) => person.handle === handle)
    : undefined;
  if (seen) {
    return seen;
  }
  const name = speakerOf(line);
  return (
    (name && brain.pdaPeople.find((known) => known.name === name)) || null
  );
}

/** Of the crates held for this person in the bay (heldFor), the ones of a kind asked for in these words. A crate whose kind it does not know counts. */
function heldAskedFor(brain: NpcBrain, name: string, said: string): HeldCrate[] {
  const kinds = itemsAskedFor(
    said.toLowerCase(),
    brain.orderable,
    brain.pdaPeople.map((person) => person.name),
  ).map((item) => item.crate);
  return heldFor(brain, name).filter(
    (crate) => !crate.what || kinds.includes(crate.what),
  );
}

/** The words a crate held for someone is told of: "crate #12 (Janitorial Supplies Crate); crates #13 and #14 (Replacement Lights)". */
function heldWritten(crates: HeldCrate[]): string {
  const kinds = [...new Set(crates.map((crate) => crate.what))];
  return kinds
    .map((kind) => {
      const numbers = crates
        .filter((crate) => crate.what === kind)
        .map((crate) => crate.number);
      return `${cratesWritten(numbers)}${kind ? ` (${kind})` : ''}`;
    })
    .join('; ');
}

/**
 * Who has just asked at the counter for a kind it is holding for them, and when (server time), by
 * this NPC's id. No order is offered for them meanwhile: they are told it has come in (TRA-02).
 */
const askedForHeld = new Map<string, { name: string; at: number }>();

function offers(brain: NpcBrain, askers: PersonInView[] = []): Option[] {
  // With a Quartermaster aboard, an order is taken from the Quartermaster and nobody else, and
  // that is done by code from its own words (see overhears). The one way round it is a head who
  // has said that the Quartermaster did not answer.
  if (
    !askers.some((person) => mayOrderFrom(brain, person)) ||
    brain.orderable.length === 0 ||
    brain.orderPending ||
    // Someone at the door wants the door. Offered an order as well, the LLM sometimes takes it.
    // Not the long stop for someone let in a while ago: nobody is at the door, and one who left
    // unseen stopped every order at the post for the rest of the round (CARGO-09).
    (doorWanted(brain) && !doorWanted(brain)?.unasked) ||
    // Likewise someone come to collect a crate: "I am here for crate 12" is not an order for one.
    (!!brain.pickupAsked && brain.now - brain.pickupAsked.at < PICKUP_ASK_DS) ||
    // Or a head asking again for what has come in for them and is waiting in the bay: a second
    // crate was bought each time its PDA word was lost (TRA-02).
    askers.some((person) => {
      const held = askedForHeld.get(brain.id);
      return (
        !!held &&
        held.name === person.name &&
        brain.now - held.at < PICKUP_ASK_DS
      );
    })
  ) {
    return [];
  }
  return [
    {
      tool: 'order',
      parameter: { name: 'crate', choices: brain.orderable },
      text: `order at the supply console what a head of department has just asked you for, for them or their staff. If they ask for more than one kind of thing at once, it all goes in the one order: which kinds, and how many crates of each, your body takes from what was said. Asking means putting it to you: "can you order...", "could I get...", "have you got any...", or telling you, by name, what they need. Someone only saying what they are off to do themselves ("I'll get some from the closet") has not asked. ${brain.orderable.map((crate) => `The ${crate} holds ${CRATE_HOLDS[crate] ?? 'what its name says'}.`).join(' ')} Not for anything else. The shuttle brings it in a minute or two.`,
    },
  ];
}

export const CARGO: Job = {
  is: isCargo,
  keepsPost: true,
  cleans: false,
  // What cargo staff report at their staff meeting, for now: crates in and crates out.
  reports: ['crates_in', 'crates_out'],
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
  afterActing: (brain, act, task, ok, _looped, details, text) => {
    afterFreight(brain, act, task, ok, text);
    // The order the Quartermaster gave it is placed, or could not be. Either way it is done with
    // here: one that could not be placed goes back to the Quartermaster, who gives it again.
    const given = brain.givenOrder;
    if (task?.kind === GIVEN && act.tool === 'order' && given) {
      if (ok) {
        given.placed = true;
      } else {
        brain.givenOrder = null;
        // Taken to the Quartermaster face to face, and said again until it says it has it: a line
        // said once, or lost unsaid, leaves the order given in its book for the round (CARGO-03).
        const telling = addTask(brain, {
          kind: NOT_PLACED_TASK,
          item: String(given.n),
          urgency: 'asked',
          source: 'own',
        });
        telling.from = given.by;
        telling.found = notPlacedWhy(String(text ?? ''));
      }
    }
    // An order placed at the counter for whoever asked: they are told so, in so many words, and
    // that is what the head goes by as its order taken. Any word from cargo in its hearing was
    // taken for it before, and an order nobody took was not asked for again for ten minutes
    // (TRA-04). Only the placing ("You order ..."), not the shuttle docking with it later, and not
    // an order the Quartermaster gave, whose word goes back to the Quartermaster.
    if (
      ok &&
      act.tool === 'order' &&
      task?.kind !== GIVEN &&
      !act.via &&
      /^you order /i.test(text ?? '')
    ) {
      const asker =
        brain.peopleInView.find((person) => person.handle === act.for)?.name ??
        String(text ?? '')
          .match(/^you order .+ for (.+?) at the supply console/i)?.[1]
          ?.trim();
      if (asker && asker !== brain.name) {
        const items =
          Array.isArray(act.items) && act.items.length > 0
            ? (act.items as { crate: string; count: number }[])
            : [{ crate: String(act.crate ?? ''), count: Number(act.count ?? 1) }];
        const line = placedLine(firstName(asker), orderSpoken(items));
        brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
        brain.toTell.push({
          to: asker,
          line,
          why: `You have placed the order ${asker} asked you for at the counter: ${orderWritten(items)}. You are telling them it is in.`,
          needs: PLACED_WORDS,
          exact: true,
          whileBusy: true,
          at: Date.now(),
        });
      }
    }
    // Word of an order that has come in is passed on, or it knocked for the Quartermaster.
    if (task && act.tool === 'knock' && ok) {
      task.knockedAt = brain.now;
    }
    // The walk to the Quartermaster's office door, counted while it keeps failing (KNB-15).
    if (task && act.tool === 'go_to_door') {
      const key = `${brain.id}:${task.id}`;
      if (ok) {
        doorMisses.delete(key);
      } else {
        doorMisses.set(key, (doorMisses.get(key) ?? 0) + 1);
      }
    }
    if (task && act.tool === 'word_passed') {
      task.passedOn = false;
      task.knockedAt = undefined;
      task.byPda = false;
      task.telling = undefined;
      task.toldAt = undefined;
      task.unheard = undefined;
      task.walkedUp = undefined;
    }
    // Having walked up to the Quartermaster to say again what was not heard, near enough or not, it speaks.
    if (task && act.tool === 'approach' && task.telling) {
      task.walkedUp = true;
    }
    // The crate is out in the lobby for whoever came for it, and they are told so by name.
    if (task?.kind === HANDOVER && ok && task.askedBy) {
      brain.toTell.push({
        to: task.askedBy,
        line: `${firstName(task.askedBy)}, crate ${task.item} is out in the lobby for you.`,
        why: `You have brought crate #${task.item} out to the Cargo Lobby for ${task.askedBy}, who came for it. You are telling ${task.askedBy} it is there to take.`,
        // Which crate, and where it is: they have to hear both.
        needs: new RegExp(`\\b${task.item}\\b.*\\blobby\\b`, 'i'),
        at: Date.now(),
        // Said while they are still standing there, or not at all. Whoever came for it can see
        // the crate come out, and may be off with it before a word is said: kept the usual two
        // minutes, the line was said to a janitor walking back in with the crate empty.
        keepMs: LOBBY_LINE_KEPT_MS,
      });
      if (brain.pickupAsked?.name === task.askedBy) {
        brain.pickupAsked = null;
      }
    }
    // The door has been opened for them, or could not be. Either way that request is dealt with,
    // apart from someone shut inside asking out, whose door it could not get to the first time:
    // that is tried once more before they are told and left to be seen out another way (PLAY-06).
    if (task?.kind === DOOR) {
      if (task.item && (ok || !letOutFailed(brain, task.item, text))) {
        dropAsk(brain, task.item);
      }
      if (brain.knockAt?.room === task.place) {
        brain.knockAt = null;
      }
      // A let-out the body is told is for someone not in that room: they are not in there, though
      // the department's list has them inside. Struck, so that the door is not tried for them every
      // two minutes for the rest of the round (CARGO-09).
      if (
        !ok &&
        task.out &&
        task.item &&
        task.place &&
        brain.post &&
        (details?.not_inside || NOT_INSIDE_WORDS.test(text ?? ''))
      ) {
        noteLetOut(brain.post, task.item, task.place);
      }
      // Whoever it opened the door for went through it by its leave. The department keeps track
      // of who is in which of its rooms, so that they are let out again.
      if (ok && task.item && task.place && brain.post) {
        const person = brain.peopleInView.find(
          (seen) => seen.name === task.item,
        );
        // Which way the door was opened for them, if the task says. Standing in the post is not
        // being let out of it when the door was that of a room inside the post.
        const wasInside =
          task.out ??
          (!!person?.in_post ||
            stillInside(brain.post, task.place, brain.now).some(
              (entry) => entry.name === task.item,
            ));
        // Security let in come on a warrant, and are left to serve it, not seen out after a
        // minute as a janitor with no mess left is (ARR-02).
        noteSentFor(
          brain,
          task.item,
          wasInside ? undefined : letInOnWarrant(brain, task.item),
        );
        // The door is being held for them now. It is not opened again, the same way, until that is over.
        lastOpened.set(brain.id, {
          name: task.item,
          room: task.place,
          out: !!wasInside,
          at: brain.now,
        });
        if (wasInside) {
          // Out of a room that lies inside another, they are still in the outer one.
          const outer = brain.roomsThrough[task.place];
          noteLetOut(brain.post, task.item, undefined, brain.now, task.place);
          if (outer) {
            noteLetIn(brain.post, task.item, outer, brain.name, brain.now);
            // One asking takes them all the way out. The outer room is locked to them as well:
            // let out of the Delivery Office into the Cargo Bay, a janitor was shut in a second
            // time, and had to find that out, go to a door, knock and send word all over again.
            // So the next door is opened for them unasked, as if they had asked for it. Not if
            // there is a mess in the outer room that they have not said is beyond them: then
            // they have work there, and ask when they are done with it.
            const workThere =
              !!brain.areaMesses[outer] &&
              !brain.janitorCalls[outer]?.declined?.includes(task.item);
            if (!workThere) {
              putAsk(brain, {
                name: task.item,
                at: brain.now,
                room: outer,
                out: true,
                byPda: true,
                answered: true,
                // Once they are through the door being held now, and not before: asked for while
                // they were still on its threshold, the nearest door of the outer room was the
                // one they were coming out of.
                after: brain.now + NEXT_DOOR_DS,
              });
            }
          }
        } else {
          noteLetIn(brain.post, task.item, task.place, brain.name, brain.now);
        }
      }
      // It stands by the door while it is held, and takes no new walk until they are through.
      if (ok && task.item && task.place) {
        // Which way, as worked out above when the door was noted as opened.
        const opened = lastOpened.get(brain.id);
        const out =
          opened?.name === task.item ? opened.out : (task.out ?? false);
        for (const old of brain.tasks) {
          if (old.kind === DOOR_WATCH && old.state !== 'done') {
            finishTask(brain, old);
          }
        }
        addTask(brain, {
          kind: DOOR_WATCH,
          item: task.item,
          place: task.place,
          urgency: 'asked',
          source: 'own',
        }).out = !!out;
      }
      const call = brain.post ? brain.janitorCalls[brain.post] : undefined;
      if (call && call.to === task.item) {
        call.letIn = true;
      }
    }
    // A janitor sent for on an order (PLAY-10), to a mess it knows of in its department, is noted
    // as a call of its own is, so that the janitor is let in and nobody else is sent on top of
    // them. A mess it knows nothing of is left off the note: nothing would ever strike it out.
    if (
      ok &&
      task?.kind === CALL &&
      task.place &&
      !task.found &&
      act.tool === 'message' &&
      brain.areaMesses[task.place]
    ) {
      const before = brain.janitorCalls[task.place];
      brain.janitorCalls[task.place] = {
        to: String(act.person),
        at: brain.now,
        count: (before?.count ?? 0) + 1,
        declined: before?.declined,
        declinedAt: before?.declinedAt,
      };
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
    if (ok && task?.kind === TIDY && task.place && act.tool === 'message') {
      const before = brain.janitorCalls[task.place];
      brain.janitorCalls[task.place] = {
        to: String(act.person),
        at: brain.now,
        count: (before?.count ?? 0) + 1,
        // Who has already said they cannot shift it is kept, so that they are not called again at once.
        declined: before?.declined,
        declinedAt: before?.declinedAt,
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
  // An order is agreed to only from a line said to it by someone it takes orders from: with a
  // head and a janitor both just speaking, the janitor's "could you order me soap?" was ordered,
  // for the janitor (CARGO-06). The words alone are tested, not the speaker's name in the line.
  // The order is claimed last, so a line that fails the rest claims nothing.
  agrees: (brain, action, heard) => {
    if (action.tool !== 'order') {
      return true;
    }
    const sayer = sayerOf(brain, heard);
    const words = spokenIn(heard);
    return (
      !!sayer &&
      mayOrderFrom(brain, sayer) &&
      !/, speaking to (?!you\b|everyone\b)/.test(heard) &&
      SUPPLY_WORDS.test(words) &&
      asksToOrder(words) &&
      // Coming for a crate that is here is not asking for one to be ordered.
      !comeForCrate(words, crateNumberIn(words)) &&
      // Nor asking for a kind that has come in for them already (TRA-02).
      heldAskedFor(brain, sayer.name, words).length === 0 &&
      takeOrder(brain.post ?? '', speakerOf(heard), brain.name, brain.now)
    );
  },
  // Which kinds of crate, and how many of each, as they were asked for: one order may be for
  // several kinds. Where they go is for whoever collects them.
  fills: (brain, action, heard) => {
    if (action.tool !== 'order') {
      return;
    }
    const said = spokenIn(heard).toLowerCase();
    const items = itemsAskedFor(
      said,
      brain.orderable,
      brain.pdaPeople.map((person) => person.name),
    );
    if (items.length > 0) {
      action.items = items;
      action.crate = items[0].crate;
      action.count = items[0].count;
    } else {
      action.count = countIn(said) ?? 1;
    }
  },
  // Anyone asking for a door in its hearing is noted. Whether they get it is decided from who
  // they are and where they stand, not from how they ask.
  overhears: (brain, event) => {
    const speaker = String(event.details.speaker ?? '');
    const heard = String(event.details.message ?? '');
    const speakerJob =
      brain.peopleInView.find((person) => person.name === speaker)?.job ??
      brain.pdaPeople.find((person) => person.name === speaker)?.job ??
      '';
    // The Quartermaster saying it has what this NPC told it, by name: "Sam, I have that." Until
    // then word of a crate has only been said, not passed on.
    if (
      isQuartermaster(speakerJob) &&
      WORD_HEARD_WORDS.test(heard) &&
      saidToMe(brain, heard)
    ) {
      for (const task of brain.tasks) {
        if (task.telling && task.toldAt !== undefined && task.state !== 'done') {
          task.passedOn = true;
          task.toldAt = undefined;
        }
      }
      return;
    }
    // The Quartermaster dividing the standing work, at its staff meeting: "Cora, the counter is
    // yours this shift." Everyone there hears who has what, and goes by it.
    const duty = isQuartermaster(speakerJob) ? dutiesIn(heard) : null;
    if (duty) {
      const name = calledMe(duty.to, brain.name, workmatesKnown(brain))
        ? brain.name
        : nameCalled(duty.to, workmatesKnown(brain));
      if (name) {
        brain.duties[name] = duty.duties;
      }
      return;
    }
    // The Quartermaster sending it to let out a workmate who is shut in: "Sam, Cora is shut in the
    // Warehouse. Could you let them out, please?" It is noted as a let-out ask by PDA from Cora
    // for that room, so it walks to that door, and opens it only if Cora is found inside (QM-05).
    // Read before the see-to line and before any talk of a door, which it would otherwise be.
    const sendToLetOut = isQuartermaster(speakerJob)
      ? heard.trim().match(SEND_TO_LET_OUT_WORDS)
      : null;
    if (sendToLetOut) {
      if (calledMe(sendToLetOut[1], brain.name, workmatesKnown(brain))) {
        const who =
          nameCalled(
            sendToLetOut[2],
            [...brain.peopleInView, ...brain.pdaPeople]
              .map((person) => person.name)
              .filter((name) => name !== brain.name),
          ) ?? sendToLetOut[2].trim();
        const said = sendToLetOut[3].trim();
        const room =
          ownRooms(brain).find(
            (own) => own.toLowerCase() === said.toLowerCase(),
          ) ?? said;
        putAsk(brain, {
          name: who,
          room,
          out: true,
          byPda: true,
          at: brain.now,
        });
      }
      return;
    }
    // The Quartermaster sending it to see to something a workmate could not: "Sam, crate #12 is
    // in the Supply Shuttle and Maria could not get it off the shuttle. See to it, please." The
    // shuttle and the rooms are its as well for a while, whoever they were given to.
    const seeTo = isQuartermaster(speakerJob)
      ? heard.trim().match(SEE_TO_WORDS)
      : null;
    if (seeTo) {
      if (calledMe(seeTo[1], brain.name, workmatesKnown(brain))) {
        brain.seeToUntil = brain.now + SEE_TO_DS;
        // A held crate that would not come out to the lobby is not shuttle or rooms work: it is a
        // hand-over, and it is this one's to bring out now (CARGO-18).
        const number = seeTo[2].match(/\bcrate #(\d+)\b.*\bout to the lobby\b/i)?.[1];
        if (number) {
          seeToCrates.set(brain.id, { number: Number(number), at: brain.now });
        }
      }
      return;
    }
    // The Quartermaster, with nobody else to send, telling it to try again a crate that would not
    // come out to the lobby: it brings it out again, whether or not whoever came for it is still
    // asking (CARGO-18).
    const tryAgain = isQuartermaster(speakerJob)
      ? heard.trim().match(TRY_CRATE_AGAIN_WORDS)
      : null;
    if (tryAgain) {
      const number = tryAgain[2].match(/\bcrate #(\d+)\b/i)?.[1];
      if (
        number &&
        calledMe(tryAgain[1], brain.name, workmatesKnown(brain)) &&
        brain.heldCrates.some((held) => held.number === Number(number))
      ) {
        seeToCrates.set(brain.id, { number: Number(number), at: brain.now });
      }
      return;
    }
    // The Quartermaster giving it an order, to its face and by name: "Sam, order 3: I need to
    // order 2 crates of janitorial supplies, for Hop Kins." What to order, how many, who for and
    // the number it goes by are read off those words. No LLM is asked whether it was an order.
    const given = heard.match(GIVEN_WORDS);
    if (
      given &&
      isQuartermaster(speakerJob) &&
      saidToMe(brain, heard)
    ) {
      const n = Number(given[1]);
      const items = itemsAskedFor(given[2].toLowerCase(), brain.orderable);
      const whoFor = given[3].trim();
      if (items.length > 0 && brain.givenOrder?.n !== n) {
        brain.givenOrder = {
          n,
          items,
          for: whoFor,
          by: speaker,
          at: brain.now,
          placed: false,
        };
      }
      // It says that it has the order, so the Quartermaster knows it was heard. Given the same
      // order again, it says so again: the first word of it was missed.
      if (items.length > 0) {
        brain.toTell = brain.toTell.filter(
          (tell) => !tell.line.startsWith(`Order ${n},`),
        );
        brain.toTell.push({
          to: speaker,
          line: `Order ${n}, ${TAKEN}.`,
          why: `${speaker}, the Quartermaster, has given you order ${n} to place: ${orderWritten(items)}, for ${whoFor}. You are saying that you have it.`,
          needs: new RegExp(`\\border ${n}\\b.*\\b${TAKEN}\\b`, 'i'),
          // Said at once and word for word, whatever it is doing: the Quartermaster is standing
          // there waiting to hear it, and gives the order to someone else if it does not. Left to
          // its turn, it was said eighty seconds late, after the order was placed, and the same
          // order was bought a second time by the other technician.
          exact: true,
          whileBusy: true,
          at: Date.now(),
        });
      }
      return;
    }
    // A head asking at the counter for a kind of crate that has come in for them and is waiting in
    // the bay: told so, in the words of the PDA it was sent, and nothing is ordered. Its PDA word
    // lost, the head came back every ten minutes and a crate was bought each time (TRA-02).
    const askingSeen = brain.peopleInView.find(
      (person) => person.name === speaker,
    );
    const heldAsked =
      askingSeen &&
      !isCargo(speakerJob) &&
      (!!askingSeen.command || isHead(speakerJob)) &&
      atMyCounter(brain, event, speaker) &&
      ORDERING_WORDS.test(heard) &&
      !comeForCrate(heard, crateNumberIn(heard))
        ? heldAskedFor(brain, speaker, heard)
        : [];
    if (heldAsked.length > 0) {
      askedForHeld.set(brain.id, { name: speaker, at: brain.now });
      if (
        takeOrder(brain.post ?? '', `${speaker}, held for them`, brain.name, brain.now)
      ) {
        const line = `${firstName(speaker)}, your order has come in: ${heldWritten(heldAsked)}. Send someone to the Cargo Lobby counter with the number to collect ${heldAsked.length > 1 ? 'each one' : 'it'}.`;
        brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
        brain.toTell.push({
          to: speaker,
          line,
          why: `${speaker} is asking you to order what has already come in for them and is waiting in the bay. You are telling them the number, so that they can send someone for it.`,
          needs: /\border has come in\b/i,
          exact: true,
          whileBusy: true,
          at: Date.now(),
        });
      }
      return;
    }
    // A head of department trying to order at the counter while there is a Quartermaster to send
    // it to. One who says the Quartermaster did not answer is served as before. Anyone else is
    // told, once, by one of those at the post, where orders go.
    const quartermaster = quartermasterAboard(brain);
    const speakerSeen = brain.peopleInView.find(
      (person) => person.name === speaker,
    );
    if (
      quartermaster &&
      speakerSeen &&
      !isCargo(speakerJob) &&
      (!!speakerSeen.command || isHead(speakerJob)) &&
      // Said to it, or at its counter: not the Captain across the bay telling the Quartermaster (KNB-10).
      atMyCounter(brain, event, speaker) &&
      ORDERING_WORDS.test(heard) &&
      !comeForCrate(heard, crateNumberIn(heard))
    ) {
      if (QM_SILENT_WORDS.test(heard)) {
        brain.qmSilent = { by: speaker, at: brain.now };
      } else if (
        brain.now - (brain.sentToQm[speaker] ?? -Infinity) > SENT_TO_QM_DS &&
        takeOrder(
          brain.post ?? '',
          `${speaker}, sent to the Quartermaster`,
          brain.name,
          brain.now,
        )
      ) {
        brain.sentToQm[speaker] = brain.now;
        brain.toTell.push({
          to: speaker,
          line: `${firstName(speaker)}, ${THROUGH_QM}, ${quartermaster.name}. Send it by PDA, please.`,
          why: `${speaker} is trying to order supplies from you. Every order goes through the Quartermaster, ${quartermaster.name}: you are telling ${speaker} to send it there by PDA.`,
          needs: /\bquartermaster\b/i,
          at: Date.now(),
        });
      }
    }
    // Someone come to the counter for a crate that is being held. Which crate is read off the
    // number they give, and failing that off who they say it is for. One of those at the post
    // takes any one asking.
    const number = crateNumberIn(heard);
    const theirJob =
      brain.peopleInView.find((person) => person.name === speaker)?.job ?? '';
    // Said to a workmate who cannot answer (lying there, in cuffs, or gone), it is this one's to
    // answer (CARGO-13).
    const saidToName = String(event.details.said_to_name ?? '');
    const toUnableWorkmate =
      !!saidToName &&
      saidToName !== brain.name &&
      [...brain.peopleInView, ...brain.pdaPeople].some(
        (person) => person.name === saidToName && isTechnician(person.job),
      ) &&
      !ableInView(brain, saidToName);
    if (
      speaker &&
      !isCargo(theirJob) &&
      (atMyCounter(brain, event, speaker) || toUnableWorkmate) &&
      // An order that says who will come for it is an order, not someone come for one (CARGO-15).
      comeForCrate(heard, number) &&
      takeOrder(
        brain.post ?? '',
        `${speaker}, for a crate`,
        brain.name,
        brain.now,
      )
    ) {
      const crate = crateMeant(brain, number, heard, speaker);
      brain.pickupAsked = {
        name: speaker,
        number: crate?.number ?? null,
        at: brain.now,
      };
      const first = firstName(speaker);
      const theirs = heldFor(brain, speaker);
      if (!crate && number === null) {
        // No number given: "by that number" would be untrue. Ask which (CARGO-08).
        brain.toTell.push({
          to: speaker,
          line:
            theirs.length > 1
              ? `${first}, I am holding ${cratesWritten(theirs.map((held) => held.number))} for you. Which number is it?`
              : `Sorry, ${first}, I am holding no crate for you. Which number is it?`,
          why: `${speaker} has come to collect a crate and gave no number. ${theirs.length > 1 ? `You are holding ${theirs.length} for them, and are asking which one.` : 'You are holding none for them, nor one for anyone they named, and are asking for the number.'}`,
          needs: /\b(which|number)\b/i,
          at: Date.now(),
        });
      } else if (!crate) {
        brain.toTell.push({
          to: speaker,
          // The number is in it, so that another collector at the counter knows it is not theirs (TRA-03).
          line: `Sorry, ${first}, I am not holding a crate by that number: crate ${number}.`,
          why: `${speaker} has come to collect crate ${number}. You are holding none by that number, nor one for anyone they named, and are telling them so.`,
          // A plain no, and the number, whatever else is said: they are standing there waiting for a crate.
          needs: new RegExp(
            `^(?=.*\\b(not|no|none|cannot|can't|don't|isn't)\\b)(?=.*\\b${number}\\b)`,
            'i',
          ),
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
    const askedRoom = roomAskedIn(brain, heard);
    const asker = brain.peopleInView.find((person) => person.name === speaker);
    // Someone it can see standing in one of its rooms, who says "door" and names no room and does
    // not ask to be let out, is not asking to be let into the post. A janitor just let into the
    // Mining Office said "I'm already at the door; step aside", and the door behind it was opened
    // again "to let it into the Cargo Bay": a second door opened after every one that was wanted.
    const idleWord =
      !askedRoom &&
      !LET_OUT_WORDS.test(heard) &&
      !!asker &&
      !!seenInside(brain, asker);
    // A workmate talking of the door ("Maria is seeing to the door, Jan") is not asking for it,
    // unless they ask to be let out.
    const workmateTalk =
      isCargo(asker?.job ?? '') && !LET_OUT_WORDS.test(heard);
    // In or out goes by where the asker stands, when it can see them: inside one of its rooms is
    // out, unless they name a room further in, reached through the one they stand in. Out of
    // sight, by the words (PARSE-08).
    const standsIn = asker ? seenInside(brain, asker) : undefined;
    const out = asker
      ? !!standsIn &&
        !(
          askedRoom &&
          askedRoom !== standsIn &&
          brain.roomsThrough[askedRoom] === standsIn
        )
      : wantsOutByWords(heard);
    if (
      speaker &&
      event.details.said_to !== 'other' &&
      DOOR_WORDS.test(heard) &&
      !idleWord &&
      !workmateTalk
    ) {
      noteWarrantAsk(brain, speaker, heard);
      putAsk(brain, {
        name: speaker,
        at: brain.now,
        // The room they named, if they named one of the department's. Said aloud, an ask used to
        // carry no room, and was taken for the post whatever room it named.
        room: askedRoom,
        out,
        // The door they named, or failing that the door they were standing at when they said it.
        door:
          doorNamed(heard) ??
          (typeof event.details.near_door === 'string'
            ? event.details.near_door
            : undefined),
      });
    }
  },
  // Someone a door hides sends word that they are at it. The room is the one they name.
  readsMessage: (brain, from, text, at, job) => {
    // A janitor it called sends word that what they have will not shift the mess, or has shifted
    // some of it and not the rest. That call is done with, and someone else can be sent for.
    const beyond = beyondRoom(text);
    if (from && beyond) {
      const room = Object.keys(brain.janitorCalls).find(
        (place) => place.toLowerCase() === beyond.toLowerCase(),
      );
      const call = room ? brain.janitorCalls[room] : undefined;
      if (call) {
        call.declined = [...new Set([...(call.declined ?? []), from])];
        call.declinedAt = at;
        // What they said it wants, if they said: only then is the next janitor told so. A
        // janitor whose mop had only run dry was once passed on as "it needs soap".
        call.wantsScrub = /soap or a rag/i.test(text);
      }
      return;
    }
    if (!from || !DOOR_WORDS.test(text)) {
      return;
    }
    // A workmate writing of a door is not asking for one, unless they ask to be let out.
    if (isCargo(job ?? '') && !LET_OUT_WORDS.test(text)) {
      return;
    }
    noteWarrantAsk(brain, from, text);
    putAsk(brain, {
      name: from,
      at,
      room: roomAskedIn(brain, text),
      byPda: true,
      // By PDA, only the words say which way (PARSE-08).
      out: wantsOutByWords(text),
      door: doorNamed(text),
    });
  },
  offers,
  // Having said to the Quartermaster what it had to tell it, in so many words, it waits to hear
  // that it was heard. Said is not told: the Quartermaster may be behind a window.
  afterSaying: (brain, called) => {
    for (const task of brain.tasks) {
      if (
        called &&
        task.telling === called &&
        task.state !== 'done' &&
        !task.passedOn
      ) {
        task.toldAt = brain.now;
      }
    }
  },
  // Plain words asking for a kind of crate it can order, said to it, are an order for that crate,
  // if it can take one. Words that name no kind, or ask for nothing ("Has my order come in yet?"),
  // order nothing: never the first crate on the list (CARGO-07).
  hears: (brain, heard) => {
    const handle = heard.match(/\(person (\w+)/)?.[1];
    const asker =
      brain.peopleInView.find((person) => person.handle === handle) ??
      brain.peopleInView.find((person) => person.name === speakerOf(heard));
    const said = spokenIn(heard).toLowerCase();
    const items = itemsAskedFor(
      said,
      brain.orderable,
      brain.pdaPeople.map((person) => person.name),
    );
    return asker &&
      items.length > 0 &&
      asksToOrder(said) &&
      !comeForCrate(said, crateNumberIn(said)) &&
      heldAskedFor(brain, asker.name, said).length === 0 &&
      !/, speaking to (?!you\b|everyone\b)/.test(heard) &&
      offers(brain, [asker]).length > 0 &&
      takeOrder(brain.post ?? '', asker.name, brain.name, brain.now)
      ? { tool: 'order', crate: items[0].crate }
      : null;
  },
};
