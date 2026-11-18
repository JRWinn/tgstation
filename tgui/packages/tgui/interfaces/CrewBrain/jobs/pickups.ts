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

/** The words by which a head sends someone for a crate, which is how such a message is known. */
const WAITING_AT_CARGO = 'is waiting at cargo';
/** The plain words it asks at the counter in, by which that line is known afterwards. */
const ASKING = 'here to collect crate';
/** The words by which it tells its head the crate is unpacked. The head knows the message by them. */
const UNPACKED = 'is unpacked in';

/** The words that mark what someone says at the counter as coming for a crate. */
export const COLLECT_WORDS =
  /\b(collect|collecting|pick(ing)? (it |that |one )?up|pickup|here for|come for|came for|fetch)\b/i;
/** The words by which a head hears that a crate has been unpacked, with its number. */
export const UNPACKED_WORDS = /crate #(\d+) is unpacked in/i;

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
  const named = text.match(
    /(?:\bcrate|\bnumber|\bmanifest|#)\s*(?:number\s*)?#?\s*(\d{1,6})\b/i,
  );
  return named ? Number(named[1]) : null;
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
    blockTask(
      task,
      task.retryAt !== undefined && brain.now < task.retryAt
        ? 'nobody from cargo was at the counter, and you will go back and try again shortly'
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
  // Cargo has put it out in the lobby: it is there for the taking.
  if (crateOf(brain, task)?.out) {
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
  // A technician: the Quartermaster does not work the counter.
  const technician = brain.peopleInView.find((person) =>
    isTechnician(person.job),
  );
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
  if (
    !isCargo(theirJob) ||
    event.details.said_to === 'other' ||
    !NO_SUCH_CRATE.test(heard)
  ) {
    return;
  }
  for (const task of brain.tasks) {
    // Only one it has asked for, and not long since: the answer is to that asking.
    if (
      task.kind !== COLLECT ||
      task.state === 'done' ||
      task.unpacked ||
      task.askedAt === undefined ||
      brain.now - task.askedAt > BROUGHT_OUT_WAIT_DS
    ) {
      continue;
    }
    task.reported = true;
    finishTask(brain, task);
    if (task.askedBy && brain.hasPda) {
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
  for (const task of brain.tasks) {
    if (
      task.kind === COLLECT &&
      task.state !== 'done' &&
      Number(task.item) === number
    ) {
      task.askedAt = brain.now;
    }
  }
}

/** Notes how a step of collecting a crate went: hauling it away, and telling its head. */
export function pickupsAfterActing(
  brain: NpcBrain,
  act: Action,
  task: Task | undefined,
  ok: boolean,
): void {
  if (task?.kind !== COLLECT) {
    return;
  }
  if (act.tool === 'collect_crate' && ok) {
    task.unpacked = true;
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
