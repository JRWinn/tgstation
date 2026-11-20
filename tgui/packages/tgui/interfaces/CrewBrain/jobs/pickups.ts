/**
 * Collecting a crate from cargo.
 *
 * This is not any one job's work. Cargo staff cannot get into the rooms the rest of the crew work
 * in, so nothing is delivered: a crate that comes in on an order is held in the bay, and whoever
 * ordered it sends one of their staff for it, with the number on its manifest. Whoever is sent
 * goes to the counter in the Cargo Lobby and gives the number, takes the crate when it is brought
 * out, hauls it to the room it is wanted in, unpacks it there, tells their head so, and brings
 * the empty crate back to the lobby.
 *
 * The number is carried by code from one message to the next. No LLM is asked to remember it.
 */
import { answersTo } from '../hierarchy';
import { CARGO_LOBBY, knowsPlace } from '../memory';
import { addTask, blockTask, finishTask, placeNamedIn } from '../tasks';
import type { Action, NpcBrain, Plan, SenseEvent, Task } from '../types';
import { isCargo } from './cargo';
import { isTechnician } from './supply';

/** A crate to collect from cargo. The task's item is its manifest number, and its place the room it is to go to. */
const COLLECT = 'collect';

/** How long (deciseconds) it waits at the counter for someone from cargo before it leaves it for a while. */
const COUNTER_WAIT_DS = 600;
/** How long (deciseconds) it then leaves it before it goes back to the counter. */
const TRY_AGAIN_DS = 1200;
/** How long (deciseconds) it waits for the crate to be brought out after asking, before it asks again. */
const BROUGHT_OUT_WAIT_DS = 600;
/** How many times it asks at the counter with nothing brought out before it tells its head and puts the errand off a while (CARGO-13). */
const ASKS_BEFORE_TELLING = 3;
/**
 * How long (deciseconds) the errand is kept from the moment the crate is in its hands: the haul,
 * the unpacking, the word to its head and the walk back with the empty each get a full half hour,
 * not what is left of the half hour from when it was sent (JOBS-02).
 */
const KEEP_HAULING_DS = 18000;

/** The words by which a head sends someone for a crate, which is how such a message is known. */
const WAITING_AT_CARGO = 'is waiting at cargo';
/** The plain words it asks at the counter in, by which that line is known afterwards. */
const ASKING = 'here to collect crate';
/** The words by which it tells its head the crate is unpacked. The head knows the message by them. */
const UNPACKED = 'is unpacked in';

/**
 * The words that mark what someone says at the counter as coming for a crate. "Get", "grab",
 * "take" and "have" count only before "my crate" or a crate's number: "can I have a crate of
 * soap" is an order (CARGO-08).
 */
export const COLLECT_WORDS =
  /\b(collect|collecting|pick(ing)? ([\w']+ ){0,2}up|pickup|here for|come for|came for|fetch|(get|grab|take|have)( [\w']+){0,2} (my crate|crate (number |no\.? |num |#)?#?\d+|#\d+))\b/i;
/**
 * The words of an ask for something to be ordered. A line with these and no crate's number is an
 * order, whatever it says of who will come for it: "order a crate of soap, I'll send someone to
 * pick it up" (CARGO-15).
 */
export const ORDER_ASK_WORDS =
  /\b(order|requisition|buy|purchase|(get|fetch|bring) (me|us) (some|a|an)|can (i|we) (get|have) (some|a|an|two|three|four|\d+))\b/i;

/**
 * TRUE if a line said at the counter is someone come for a crate that is here: words of
 * collecting, and a crate's number, or "crate" and no ask for one to be ordered (CARGO-15).
 */
export function comeForCrate(heard: string, number: number | null): boolean {
  return (
    COLLECT_WORDS.test(heard) &&
    (number !== null ||
      (/\bcrates?\b/i.test(heard) && !ORDER_ASK_WORDS.test(heard)))
  );
}
/** Numbers as they are said for a crate's number, one to twenty. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
/** The words by which a head hears that a crate has been unpacked, with its number. */
export const UNPACKED_WORDS = /crate #(\d+) is unpacked in/i;
/** The words by which it tells its head it has given up hauling a crate. The head knows the message by them. */
const GAVE_UP = 'I could not get crate #';
/** The words by which a head hears that whoever it sent has given up hauling a crate, with its number (PLAY-12). */
export const GAVE_UP_WORDS = /\bI could not get crate #(\d+) to the\b/i;
/** The words by which it tells its head it has given up taking the empty crate back. Not GAVE_UP_WORDS: nobody need be sent. */
const EMPTY_GAVE_UP = 'I could not get the empty crate from #';

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** The PDA message a head sends one of its staff to go and collect a crate. */
export function sendForLine(
  to: string,
  number: number,
  what: string,
  room: string,
): string {
  // What cannot be done without comes first: a PDA message that runs long is cut off at the end.
  return `${firstName(to)}, crate #${number} of ${what} ${WAITING_AT_CARGO}. Take it to the ${room}: give them the number at the Cargo Lobby counter, unpack it there and bring the crate back.`;
}

/** The manifest number someone named in what they said or wrote, or null if they named none. */
export function crateNumberIn(text: string): number | null {
  // "crate 12", "number is 12", "crate no. 12", "num 12", "#12", "crate twelve" (CARGO-08).
  // A number in words only after "crate" or "number": "no one" is nobody.
  const named =
    text.match(
      /(?:\bcrate|\bnumber(?:\s+is)?|\bnum\b|\bno\b\.?|\bmanifest|#)\s*(?:number(?:\s+is)?\s*|no\b\.?\s*|num\b\s*)?#?\s*(\d{1,6})\b/i,
    ) ??
    text.match(
      /(?:\bcrate|\bnumber(?:\s+is)?)\s+(?:number(?:\s+is)?\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i,
    );
  if (!named) {
    return null;
  }
  return NUMBER_WORDS[named[1].toLowerCase()] ?? Number(named[1]);
}

/**
 * Reads a PDA message as its head sending it to collect a crate, if that is what it is. Returns
 * TRUE if it was. Only someone it answers to can send it.
 */
export function readPickup(
  brain: NpcBrain,
  from: string,
  text: string,
  job: string,
): boolean {
  if (!text.includes(WAITING_AT_CARGO)) {
    return false;
  }
  const number = text.match(/crate #(\d+)/i)?.[1];
  const room = placeNamedIn(
    brain,
    (text.match(/take it to the ([^,.:]+)/i)?.[1] ?? '').toLowerCase(),
  );
  // It is that kind of message whoever sent it, and means nothing else. It is only acted on if it
  // came from someone the NPC answers to and says which crate and where to.
  if (!answersTo(brain.job, job) || !number || !room) {
    return true;
  }
  addTask(brain, {
    kind: COLLECT,
    item: number,
    place: room,
    urgency: 'asked',
    source: 'asked',
    askedBy: from || undefined,
  });
  return true;
}

/** The crate a task is about, as far as it can be seen: put out in the lobby, or not yet. */
function crateOf(brain: NpcBrain, task: Task) {
  return brain.heldCrates.find((crate) => crate.number === Number(task.item));
}

/** Keeps each crate to collect true to how far it has got. */
export function syncPickups(brain: NpcBrain): void {
  for (const task of brain.tasks) {
    if (task.kind !== COLLECT || task.state === 'done') {
      continue;
    }
    if (task.unpacked) {
      // Unpacked, its head told, and the empty crate back at cargo: that is all of it. The message
      // was the telling, so nobody is owed word of it.
      const told = task.toldUnpacked || !brain.hasPda || !task.askedBy;
      if (told && !brain.crateToReturn) {
        task.reported = true;
        finishTask(brain, task);
      }
      continue;
    }
    // Someone else has taken it away. It is not this NPC's to fetch any more.
    const crate = crateOf(brain, task);
    if (crate?.takenBy && crate.takenBy !== brain.name) {
      task.reported = true;
      finishTask(brain, task);
      continue;
    }
    // Put out for it: the rest of the errand has its own half hour from now (JOBS-02).
    if (crate?.out && task.keepUntil === undefined) {
      task.keepUntil = brain.now + KEEP_HAULING_DS;
    }
    blockTask(
      task,
      task.retryAt !== undefined && brain.now < task.retryAt
        ? task.notBroughtOut
          ? 'cargo has not brought it out when you asked, and you will go back and try again later'
          : 'nobody from cargo was at the counter, and you will go back and try again shortly'
        : null,
    );
  }
}

/** What collecting a crate comes down to right now, or null if the task is not that. */
export function planPickups(brain: NpcBrain, task: Task): Plan | null {
  if (task.kind !== COLLECT) {
    return null;
  }
  const number = task.item ?? '';
  const room = task.place ?? '';
  const by = task.askedBy ?? 'your head';
  if (task.unpacked) {
    if (!task.toldUnpacked && brain.hasPda && task.askedBy) {
      return {
        ready: true,
        step: `You have unpacked crate #${number} in the ${room}, as ${by} sent you to. You are sending ${by} a PDA message to say so.`,
        act: {
          tool: 'message',
          person: task.askedBy,
          text: `Crate #${number} ${UNPACKED} the ${room}. I am taking the empty crate back to cargo.`,
        },
      };
    }
    return brain.crateToReturn
      ? {
          ready: true,
          step: `You have unpacked crate #${number} in the ${room}. You are taking the empty crate back to the Cargo Lobby, for cargo to send away.`,
          act: { tool: 'take_back' },
        }
      : { ready: false, step: 'The crate is unpacked and back with cargo.' };
  }
  // Cargo has put it out in the lobby: it is there for the taking, once the body is in the room
  // with it. From anywhere else it has not seen it, and goes to the counter as before (JOBS-05).
  const crate = crateOf(brain, task);
  if (crate?.out && crate.place === brain.location) {
    return {
      ready: true,
      step: `Cargo has put crate #${number} out for you. You are hauling it to the ${room}, where ${by} wants it, to unpack it there.`,
      act: { tool: 'collect_crate', number: Number(number), place: room },
    };
  }
  if (brain.location !== CARGO_LOBBY) {
    return knowsPlace(brain, CARGO_LOBBY)
      ? {
          ready: true,
          step: `${by} has sent you to collect crate #${number} from cargo and take it to the ${room}. You are going to the counter in the Cargo Lobby to ask for it.`,
          act: { tool: 'go_to', place: CARGO_LOBBY },
        }
      : { ready: false, step: 'You do not know the way to the cargo counter.' };
  }
  // A technician on its feet and free: the Quartermaster does not work the counter, and one lying
  // there or in cuffs cannot answer. One not asked last time comes first (CARGO-13).
  const able = brain.peopleInView.filter(
    (person) => isTechnician(person.job) && !person.down && !person.cuffed,
  );
  const technician =
    able.find((person) => person.name !== task.askedOf) ?? able[0];
  if (!technician) {
    if (brain.now - brain.inPlaceSince > COUNTER_WAIT_DS) {
      task.retryAt = brain.now + TRY_AGAIN_DS;
      return {
        ready: false,
        step: 'Nobody from cargo came to the counter. You will try again shortly.',
      };
    }
    return {
      ready: false,
      wait: true,
      step: `You are at the cargo counter to collect crate #${number}, waiting for someone from cargo.`,
    };
  }
  // Asked, and it is being fetched: it waits by the counter. If nothing comes of it, it asks again.
  if (
    task.askedAt !== undefined &&
    brain.now - task.askedAt < BROUGHT_OUT_WAIT_DS
  ) {
    return {
      ready: false,
      wait: true,
      step: `You have asked cargo for crate #${number}, and are waiting at the counter for it to be brought out.`,
    };
  }
  // Asked three times and nothing brought out: whoever sent it is told, and it is left a while,
  // so the body is free for its other work (CARGO-13).
  if ((task.asks ?? 0) >= ASKS_BEFORE_TELLING) {
    task.asks = 0;
    task.askedAt = undefined;
    task.notBroughtOut = true;
    task.retryAt = brain.now + TRY_AGAIN_DS * 3;
    if (task.askedBy && brain.hasPda) {
      brain.toTell.push({
        to: task.askedBy,
        line: `Cargo has not brought out crate #${number}: I asked ${ASKS_BEFORE_TELLING} times at the counter. I will try again later.`,
        why: `You have asked at the cargo counter ${ASKS_BEFORE_TELLING} times for crate #${number} and it has not been brought out. You are sending ${task.askedBy}, who sent you for it, a PDA message to say so.`,
        byPda: true,
        at: Date.now(),
      });
    }
    return {
      ready: false,
      step: `Cargo has not brought out crate #${number} after you asked ${ASKS_BEFORE_TELLING} times. You will go back and try again later.`,
    };
  }
  const first = firstName(technician.name);
  return {
    ready: true,
    step: `${by} has sent you to collect crate #${number}. ${technician.name}, who works in cargo, is here: in "say", ask ${technician.name} for crate ${number} by its number.`,
    say: `${first}, I am ${ASKING} ${number} for ${by}, please.`,
    // Cargo has to hear who is asked, that it is a crate being collected, and which: all in the plain line.
    needs: new RegExp(`\\b${first}\\b.*\\bcollect.*\\b${number}\\b`, 'i'),
    // The words take a few seconds to find. If the crate has been put out meanwhile, it is not asked for again.
    sayIf: () => !crateOf(brain, task)?.out,
  };
}

/** The words by which cargo says there is no crate to be had by the number it was asked for. */
const NO_SUCH_CRATE = /not holding a crate|(has|have) been lost|is lost\b/i;
/** The words by which cargo says someone else has the crate already, with who (JOBS-05). */
const TAKEN_ALREADY = /^(?:[^,]+, )?(.+?) has taken crate #?\d+ already\b/i;

/**
 * Hears cargo say, at the counter, that there is no crate by the number it asked for: the crate
 * has been lost, or the number is wrong. That is the end of the errand. It does not stand at the
 * counter asking for something that is not there: it tells whoever sent it, and gets on.
 */
export function pickupsOverhear(brain: NpcBrain, event: SenseEvent): void {
  const speaker = String(event.details.speaker ?? '');
  const heard = String(event.details.message ?? '');
  const theirJob =
    brain.peopleInView.find((person) => person.name === speaker)?.job ?? '';
  // Someone else asking at the counter after it: an answer that names no crate may be theirs (TRA-03).
  if (
    !isCargo(theirJob) &&
    speaker !== brain.name &&
    heard.includes(ASKING) &&
    crateNumberIn(heard) !== null
  ) {
    for (const task of brain.tasks) {
      if (task.kind === COLLECT && task.askedAt !== undefined) {
        task.otherAskedAt = brain.now;
      }
    }
    return;
  }
  // "Jan, Mo has taken crate 12 already.": someone else has it, so the errand is over (JOBS-05).
  const takenBy = heard.match(TAKEN_ALREADY)?.[1];
  if (
    !isCargo(theirJob) ||
    event.details.said_to === 'other' ||
    (!NO_SUCH_CRATE.test(heard) && !takenBy) ||
    takenBy === brain.name
  ) {
    return;
  }
  // A line that names the crate is about that crate alone: "Crate 12 for Hop Kins is lost" ends
  // no errand for crate 13. One that names none is taken only if it was said to this body, and
  // nobody else has asked at the counter since it did (TRA-03).
  const named = crateNumberIn(heard);
  for (const task of brain.tasks) {
    // Only one it has asked for, and not long since: the answer is to that asking.
    if (
      task.kind !== COLLECT ||
      task.state === 'done' ||
      task.unpacked ||
      task.askedAt === undefined ||
      brain.now - task.askedAt > BROUGHT_OUT_WAIT_DS ||
      (named !== null && Number(task.item) !== named) ||
      (named === null &&
        (event.details.said_to !== 'me' ||
          (task.otherAskedAt ?? -Infinity) > task.askedAt))
    ) {
      continue;
    }
    task.reported = true;
    finishTask(brain, task);
    if (task.askedBy && brain.hasPda && takenBy) {
      brain.toTell.push({
        to: task.askedBy,
        line: `Cargo says ${takenBy} has taken crate #${task.item} already. I have not got it.`,
        why: `${speaker}, at the cargo counter, has told you that ${takenBy} has already taken crate #${task.item}, which ${task.askedBy} sent you for. You are sending ${task.askedBy} a PDA message to say so.`,
        byPda: true,
        at: Date.now(),
      });
    } else if (task.askedBy && brain.hasPda) {
      brain.toTell.push({
        to: task.askedBy,
        line: `Cargo says there is no crate #${task.item} to collect: it has been lost, or the number is wrong. I have not got it.`,
        why: `${speaker}, at the cargo counter, has told you there is no crate #${task.item} to be had. You are sending ${task.askedBy}, who sent you for it, a PDA message to say so.`,
        byPda: true,
        at: Date.now(),
      });
    }
  }
}

/** Says the task of collecting a crate in a few words, or null if the task is not that. */
export function describePickups(task: Task): string | null {
  return task.kind === COLLECT
    ? task.unpacked
      ? `take the empty crate back to cargo`
      : `collect crate #${task.item} from cargo and take it to the ${task.place}`
    : null;
}

/** Notes that it has asked at the counter for the crate it came for. */
export function pickupsAfterSaying(
  brain: NpcBrain,
  called: string | null,
): void {
  if (!called?.includes(ASKING)) {
    return;
  }
  const number = crateNumberIn(called);
  // The line opens with the first name of the technician it was said to.
  const first = called.match(/^(\w+),/)?.[1];
  const asked = brain.peopleInView.find(
    (person) => isTechnician(person.job) && firstName(person.name) === first,
  );
  for (const task of brain.tasks) {
    if (
      task.kind === COLLECT &&
      task.state !== 'done' &&
      Number(task.item) === number
    ) {
      task.askedAt = brain.now;
      task.asks = (task.asks ?? 0) + 1;
      task.askedOf = asked?.name ?? task.askedOf;
      task.notBroughtOut = false;
    }
  }
}

/** Notes how a step of collecting a crate went: hauling it away, and telling its head. */
export function pickupsAfterActing(
  brain: NpcBrain,
  act: Action,
  task: Task | undefined,
  ok: boolean,
  details?: Record<string, unknown>,
  text?: string,
): void {
  if (task?.kind !== COLLECT) {
    return;
  }
  // Someone else has hold of the crate: they are taking it, and it is not this one's to pull out
  // of their hands. The errand is over, with no word to anyone: whoever has it tells the head
  // when it is unpacked (MULTI-07).
  if (
    act.tool === 'collect_crate' &&
    !ok &&
    (details?.held_by ||
      /\b(already has hold of|has taken hold of)\b/i.test(text ?? ''))
  ) {
    task.reported = true;
    finishTask(brain, task);
    return;
  }
  // The haul given up on the way: the crate got away too often, or there was no way through
  // with it. Whoever sent it is told which crate, and where it lies, so that someone else can be
  // sent for it, and the errand is over: going back for it on top of them is two after one crate
  // (PLAY-12). With nobody to tell, it is left to try again, as before.
  const gaveUp = brain.gaveUp;
  if (
    act.tool === 'collect_crate' &&
    !ok &&
    gaveUp?.tool === 'collect_crate' &&
    task.askedBy &&
    brain.hasPda
  ) {
    // Where the crate lies, not where the body is, when the server says (lies_in).
    const lies = gaveUp.leftIn ?? gaveUp.liesIn ?? brain.location;
    brain.toTell.push({
      to: task.askedBy,
      line: `${GAVE_UP}${task.item} to the ${task.place}. It is left in the ${lies}${gaveUp.leftIn ? ', clear of the doors' : ''}. Could you send someone else for it, please?`,
      why: `You have given up hauling crate #${task.item}, which ${task.askedBy} sent you to collect and take to the ${task.place}: you could not get it there. You are sending ${task.askedBy} a PDA message to say where it is.`,
      byPda: true,
      at: Date.now(),
    });
    brain.gaveUp = null;
    task.reported = true;
    finishTask(brain, task);
    return;
  }
  // The empty crate given up on the way back to cargo. It is still this errand's to bring back,
  // and it is tried again as before, but whoever sent it is told once where it lies (PLAY-12).
  if (
    act.tool === 'take_back' &&
    !ok &&
    gaveUp?.tool === 'take_back' &&
    task.askedBy &&
    brain.hasPda
  ) {
    brain.gaveUp = null;
    if (task.toldAt === undefined) {
      task.toldAt = brain.now;
      const lies = gaveUp.leftIn ?? gaveUp.liesIn ?? brain.location;
      brain.toTell.push({
        to: task.askedBy,
        line: `${EMPTY_GAVE_UP}${task.item} back to cargo. It is left in the ${lies}${gaveUp.leftIn ? ', clear of the doors' : ''}. I will try again.`,
        why: `You could not get the empty crate from crate #${task.item} back to the Cargo Lobby: it kept getting away from you. You are sending ${task.askedBy}, who sent you for it, a PDA message to say where it is.`,
        byPda: true,
        at: Date.now(),
      });
    }
    return;
  }
  if (act.tool === 'collect_crate' && ok) {
    task.unpacked = true;
    // The word to its head and the walk back with the empty have a half hour of their own (JOBS-02).
    task.keepUntil = brain.now + KEEP_HAULING_DS;
    // Whoever unpacked it knows where the things are, with nobody having to tell them. If it is
    // short of something for its own work, that is where it goes once the crate is back.
    brain.suppliesSentAt = brain.now;
    brain.suppliesAt = task.place ?? null;
  }
  // Sent or not, it is told once: someone with no PDA cannot be told this way.
  if (act.tool === 'message' && String(act.text ?? '').includes(UNPACKED)) {
    task.toldUnpacked = true;
  }
}
