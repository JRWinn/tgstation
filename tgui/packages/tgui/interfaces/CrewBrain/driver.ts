/**
 * The driver: works an NPC's task list. How a job is done is never asked of an LLM. The one thing
 * that is asked is which job comes first, when the NPC has several pieces of routine work it could
 * be getting on with: see choice.ts. That is asked between jobs, never in the middle of one, and
 * if no answer comes within a few seconds the code's own order is taken.
 *
 * Each time the server sends an NPC's state, the driver looks at what the body is doing. If it is
 * free, the driver takes the next step of its work: the step its job says comes next for the task
 * at the top of its list. Walking to the closet, taking the mop, wetting it, cleaning the mess,
 * hauling the crate: none of that is a judgement, so none of it goes to the LLM.
 *
 * A small LLM is right most of the time, and a job is a long run of steps. Most of the time, many
 * times over, comes out as an NPC standing in a hallway. So the LLM is kept for what only it can
 * do: talk. When a step is something to say ("ask the cargo technician for supplies"), the driver
 * asks the LLM to say it in the NPC's own voice, and says a plain line itself if the LLM does not.
 */
import {
  CHOICE_MAX_OPTIONS,
  choosable,
  standingChoice,
  type Work,
} from './choice';
import { jobFor } from './jobs';
import {
  describeShutIn,
  SHUT_IN_KEY,
  whoToAskForTheDoor,
} from './situation';
import { meetingsAfterActing } from './jobs/meetings';
import { ordersAfterActing } from './jobs/orders';
import { pickupsAfterActing } from './jobs/pickups';
import { knownPlaces } from './memory';
import { workInOrder, wordOwed } from './tasks';
import type { Action, NpcBrain, SenseEvent, Task } from './types';

/** How long after telling the body to do something before the driver looks again, in milliseconds. */
const SETTLE_MS = 2500;
/** How long the body stays put after someone has spoken to it, so it does not walk off mid-talk. */
const TALK_PAUSE_MS = 6000;
/** The longest it holds still for talk in one go, however much is said to it. */
const TALK_HOLD_MAX_MS = 15000;
/** How long the body waits after leading someone somewhere before it goes back to its own work. */
export const LEAD_PAUSE_MS = 20000;
/** How long between one idle wander and the next. */
const IDLE_GAP_MS = 5000;
/** How long a step that failed is left alone before it is tried again, for each time it has failed. */
const RETRY_MS = 20000;
const RETRY_MAX_MS = 120000;
/** The pause between finishing one thing and starting the next: at least this long, and up to this much longer. */
const BREATH_MIN_MS = 1000;
const BREATH_SPREAD_MS = 3000;
/** How often a body that is shut in tries the way out again. */
const TRY_LEAVING_MS = 20000;
/** How long the body stays where it is after saying something, before it sets off anywhere. */
const AFTER_SAYING_MS = 2500;
/** How long someone who was in the way of a crate is remembered as being in the way. */
const IN_THE_WAY_MS = 30000;
/** The steps record under which asking someone to step aside is kept. */
const ASIDE_KEY = 'step-aside';
/** What the body does without going anywhere. Everything else takes it off across the room, or out of it. */
const STAYS = new Set(['clean', 'message', 'search', 'find_supplies', 'grenade']);
/** How long the driver waits to hear how a step went before it takes it to have come to nothing. */
const LOST_ACT_MS = 12000;
/** How long the body waits for the LLM to say which job comes first before the code's own order is taken. */
const CHOICE_WAIT_MS = 8000;
/** The LLM is asked which job comes first no more often than this. In between, the code's own order is taken. */
const CHOICE_GAP_MS = 20000;
/** Names the steps of knocking at the door it is shut in by, and sending word to whoever let it in. */
const KNOCK_OUT_KEY = 'knock-out';
const WORD_OUT_KEY = 'word-out';
/** How long (milliseconds) fire doors that stopped it are worth acting on. After that it has to meet them again. */
const FIRE_DOORS_SEEN_MS = 60000;
/** One NPC resets the fire alarm of the same room no more often than this. */
const RESET_AGAIN_MS = 300000;
/** How long (milliseconds) something it means to tell someone is kept before it is dropped unsaid. */
const TELL_KEPT_MS = 120000;
/** Names the step of deciding between jobs. */
const CHOOSE_KEY = 'choose';

/** One thing for the body to do next. */
export type Step = {
  /** Names the step, so that one which keeps failing can be told from the next. */
  key: string;
  /** The step in words, as the NPC would think of it. */
  text: string;
  /** What the body is told to do, if the step is something to do. */
  act?: Action;
  /** The line to fall back on, if the step is something to say. */
  say?: string;
  /** What that line has to have in it, and whether it still needs saying: see Plan. */
  needs?: RegExp;
  sayIf?: () => boolean;
  /** The task the step is for, if it is for one. */
  task?: number;
  /** TRUE if this is only passing the time, not work. */
  idle?: boolean;
  /** If the step is asking to be let out: who is being asked, so that they are not asked twice. */
  asks?: string;
  /** If the step is telling someone something it meant to: the line, so that it is told once. */
  tells?: string;
  /**
   * If the step is deciding which job comes first: the jobs it is between, in the code's own
   * order. Nothing is done until that is settled: see settleChoice.
   */
  choose?: Work[];
};

function keyOf(task: Task | null, act: Action | undefined, say?: string): string {
  return `${task?.id ?? 'none'}:${act ? JSON.stringify(act) : `say:${say}`}`;
}

/** How many walks out may fail with a door standing open before the door is taken to be no way out. */
const OPEN_DOOR_TRIES = 2;

/**
 * TRUE if the NPC is shut in and can see a door standing open that may yet be a way out. One it
 * has walked at more than once and still not got out by leads nowhere it can go.
 */
function wayOutOpen(brain: NpcBrain): boolean {
  return (
    brain.shutIn && brain.doorOpen && brain.openDoorTries < OPEN_DOOR_TRIES
  );
}

/** TRUE if this step failed lately and is being left alone for now. */
function inBackoff(brain: NpcBrain, key: string): boolean {
  // Shut in and seeing a door stand open, everything is worth trying again this instant.
  if (wayOutOpen(brain)) {
    return false;
  }
  // Likewise while someone is holding a door for it: that will not last, and a walk that failed
  // a moment before the door opened says nothing about one made now.
  if (brain.doorHeld) {
    return false;
  }
  const failure = brain.failures.get(key);
  return !!failure && Date.now() < failure.until;
}

/**
 * Works out the next thing for the body to do: something that will not wait, then someone owed
 * word that their job is done, then the first task on the list that can be got on with, and
 * failing all that, how to pass the time.
 */
export function nextStep(brain: NpcBrain): Step | null {
  const job = jobFor(brain.job);

  const reflex = job.reflex?.(brain);
  if (reflex) {
    const key = keyOf(null, reflex.act);
    if (!inBackoff(brain, key)) {
      return { key, text: reflex.text, act: reflex.act };
    }
  }

  // Fire doors shut across its way by an alarm someone pulled, with nothing wrong with the air:
  // it goes and resets the alarm, as anyone would. Never an alarm the air set off. Not the same
  // room twice in a few minutes, and not one it has had cause to leave alone: an alarm that comes
  // straight back is either real or being pulled again, and opening and shutting it is no help.
  const fire = brain.fireDoors;
  if (fire?.pulled && Date.now() - fire.at < FIRE_DOORS_SEEN_MS) {
    const leftAlone = Date.now() < (brain.fireClosed[fire.place] ?? 0);
    const lately =
      Date.now() - (brain.alarmResets[fire.place] ?? 0) < RESET_AGAIN_MS;
    const act = { tool: 'reset_alarm', place: fire.place };
    const key = keyOf(null, act);
    if (!leftAlone && !lately && !inBackoff(brain, key)) {
      return {
        key,
        text: `The fire doors are shut in ${fire.place} and are in your way. Someone pulled the fire alarm there, and nothing is wrong with the air. You are going to the alarm to reset it.`,
        act,
      };
    }
  }

  // Someone is holding the door to let it out. It goes, now, back the way it came if it knows the
  // way: the door will not be held for long, and standing there finishing a thought wastes it.
  if (brain.doorHeldOut) {
    const others = knownPlaces(brain).filter((place) => place !== brain.location);
    // Out through the door that is being held, to wherever it leads. The way it came in may
    // have been by another door, from another room it cannot get out of either.
    const out =
      brain.doorOutTo && brain.doorOutTo !== brain.location
        ? brain.doorOutTo
        : brain.cameFrom && others.includes(brain.cameFrom)
          ? brain.cameFrom
          : others[0];
    if (out) {
      const act = { tool: 'go_to', place: out };
      const key = keyOf(null, act);
      if (!inBackoff(brain, key)) {
        return {
          key,
          text: `The door is being held open to let you out of ${brain.location}, and you are going out to ${out} while it is.`,
          act,
        };
      }
    }
  }

  // Shut in, it goes and stands at the door first. Whoever can open it then knows which door is
  // wanted, and it is there to go through when it opens.
  if (brain.shutIn && !wayOutOpen(brain) && !brain.atDoorOf) {
    const act = { tool: 'go_to_door' };
    const key = keyOf(null, act);
    if (!inBackoff(brain, key)) {
      return {
        key,
        text: `You are shut in ${brain.location}. You are going to stand at the door out, so that whoever can open it knows which one you want.`,
        act,
      };
    }
  }

  // Shut in, with someone there: asking for the door comes before anything else. Each person is
  // asked once, one at a time. It asks again only when someone new turns up.
  const stuck = brain.shutIn && !wayOutOpen(brain);
  const helper = stuck ? whoToAskForTheDoor(brain) : null;
  if (helper && !inBackoff(brain, SHUT_IN_KEY)) {
    return {
      key: SHUT_IN_KEY,
      text: describeShutIn(brain),
      say: `${helper.split(' ')[0]}, could you open the door for me, please? I cannot get out of here.`,
      // Whoever it is asked of has to hear their own name in it, or the wrong person is asked.
      needs: new RegExp(`\\b${helper.split(' ')[0]}\\b`, 'i'),
      asks: helper,
    };
  }
  // Nobody in sight to ask, or nobody left it has not asked. A voice does not carry through a
  // shut door, so it knocks, once, and sends word, once, to whoever let it in.
  if (stuck && !helper && brain.atDoorOf) {
    if (!brain.outAsks?.knocked && !inBackoff(brain, KNOCK_OUT_KEY)) {
      return {
        key: KNOCK_OUT_KEY,
        text: `You are shut in ${brain.location} with nobody in sight to ask. You are knocking at the door, for anyone on the other side of it.`,
        act: { tool: 'knock' },
      };
    }
    if (
      brain.outAsks?.knocked &&
      !brain.outAsks.messaged &&
      brain.letInBy &&
      brain.hasPda &&
      !inBackoff(brain, WORD_OUT_KEY)
    ) {
      return {
        key: WORD_OUT_KEY,
        text: `Nobody has come to the door of ${brain.location}. You are sending ${brain.letInBy}, who let you in, a PDA message asking to be let out.`,
        act: {
          tool: 'message',
          person: brain.letInBy,
          text: `I am done in the ${brain.location} and am at the door. Could you let me out, please?`,
        },
      };
    }
  }

  // Something it means to tell someone: said when they are in view, or sent by PDA if it is that
  // kind of word. Told once, and dropped if the moment for it has passed.
  brain.toTell = brain.toTell.filter(
    (tell) => Date.now() - tell.at < TELL_KEPT_MS,
  );
  const tell = brain.toTell.find((it) =>
    it.byPda
      ? brain.hasPda
      : brain.peopleInView.some((person) => person.name === it.to),
  );
  if (tell) {
    const key = `tell:${tell.to}:${tell.line}`;
    if (!inBackoff(brain, key)) {
      return tell.byPda
        ? {
            key,
            text: tell.why,
            act: { tool: 'message', person: tell.to, text: tell.line },
            tells: tell.line,
          }
        : {
            key,
            text: tell.why,
            say: tell.line,
            needs: tell.needs,
            tells: tell.line,
          };
    }
  }

  // Someone was standing where a crate could not get past them. They are asked to step aside.
  const blocker =
    brain.inTheWay && Date.now() - brain.inTheWay.at < IN_THE_WAY_MS
      ? brain.peopleInView.find(
          (person) => person.handle === brain.inTheWay?.handle,
        )
      : undefined;
  if (blocker && !inBackoff(brain, ASIDE_KEY)) {
    return {
      key: ASIDE_KEY,
      text: `${blocker.name} is standing in the way, and you could not get past them with what you were hauling. In "say", ask ${blocker.name} politely to step aside.`,
      say: `Excuse me, ${blocker.name.split(' ')[0]}, could you step aside, please? I need to get this past you.`,
    };
  }

  // Whoever asked for something is told when it is done, the next time they are in view.
  const owed = wordOwed(brain)[0];
  if (owed?.askedBy) {
    const what = job.describeTask?.(owed) ?? owed.kind;
    const say = `${owed.askedBy.split(' ')[0]}, ${job.sayDone?.(owed) ?? 'that is done'}.`;
    const key = keyOf(owed, undefined, say);
    if (!inBackoff(brain, key)) {
      return {
        key,
        text: `You have finished what ${owed.askedBy} ${owed.source === 'told' ? 'told you of' : 'asked for'} (${what}), and ${owed.askedBy} is here: tell them it is done.`,
        say,
      };
    }
  }

  const work = workInOrder(brain);
  // Whether a step of its work failed lately and is being left alone a while.
  let heldBack = false;
  // The work it could get on with this moment, most pressing first.
  const ready: (Work & { key: string })[] = [];
  for (const { task, plan } of work) {
    // Waiting on something for someone who asked, at a door say, it stays and waits. Going off
    // to routine work elsewhere would only bring it straight back again.
    // The same goes for an order it is in the middle of: sent to look at a room, it looks.
    if (!plan.ready && plan.wait && task.urgency !== 'routine') {
      if (ready.length === 0) {
        return null;
      }
      break;
    }
    if (!plan.ready || (!plan.act && !plan.say)) {
      continue;
    }
    const key = keyOf(task, plan.act, plan.say);
    if (inBackoff(brain, key)) {
      heldBack = true;
      continue;
    }
    ready.push({ task, plan, key });
  }
  // A door being held open for it will not stay open. Whatever it was let in for comes first.
  const through = brain.doorHeld
    ? ready.findIndex(({ task }) => task.place === brain.doorHeldFor)
    : -1;
  if (through > 0) {
    ready.unshift(...ready.splice(through, 1));
  }
  if (ready.length > 0) {
    // What will not wait is done in the code's own order. Which of its routine work comes first
    // is the NPC's to choose, and a choice once made stands until that job is done.
    const peers = choosable(ready);
    const chosen = standingChoice(brain, peers);
    if (peers.length > 1 && !chosen) {
      return {
        key: CHOOSE_KEY,
        text: 'You have more than one job you could get on with, and are deciding which to do first.',
        choose: peers.slice(0, CHOICE_MAX_OPTIONS),
      };
    }
    const { task, plan, key } = chosen ?? ready[0];
    return {
      key,
      text: plan.step,
      act: plan.act,
      say: plan.say,
      needs: plan.needs,
      sayIf: plan.sayIf,
      task: task.id,
    };
  }

  // Nothing to do. Crew at a post stay there, and so does anyone whose work has them waiting where
  // they stand. The rest learn the station and what is kept where.
  if (job.keepsPost || work.some(({ plan }) => plan.wait)) {
    return null;
  }
  const idle: Action | null =
    brain.storageHere > 0
      ? { tool: 'search' }
      : brain.resting
        ? null
        : { tool: 'explore' };
  if (!idle) {
    return null;
  }
  const key = keyOf(null, idle);
  if (inBackoff(brain, key)) {
    return null;
  }
  // Why it is passing the time, said truly: work that failed and is being left a while, work that
  // cannot be got on with, or no work at all.
  const why = heldBack
    ? 'What you last tried for your work came to nothing, so you are leaving it a little while before you try again. Meanwhile'
    : work.length > 0
      ? 'None of your work can be got on with just now, so'
      : 'You have no work waiting, so';
  return {
    key,
    text:
      idle.tool === 'search'
        ? `${why} you are seeing what is kept in the storage here.`
        : `${why} you are walking the station to see what needs doing.`,
    act: idle,
    idle: true,
  };
}

/**
 * An order from someone the NPC answers to that it could be getting on with and is not: the one
 * thing it drops what it is doing for. Null if there is none, or it is already about it.
 */
function orderToDrop(brain: NpcBrain): Task | null {
  const order = workInOrder(brain).find(
    ({ task, plan }) =>
      task.urgency === 'emergency' && plan.ready && !!plan.act,
  );
  if (!order || brain.lastAct?.task === order.task.id) {
    return null;
  }
  return inBackoff(brain, keyOf(order.task, order.plan.act)) ? null : order.task;
}

/**
 * Takes the next step of an NPC's work, if its body is free to. Returns the step it took, or
 * null if this was not the moment for one.
 *
 * `issue` tells the body to do something. `speak` asks for something to be said.
 */
export function drive(
  brain: NpcBrain,
  issue: (action: Action) => string | null,
  speak: (
    fallback: string,
    needs?: RegExp,
    sayIf?: () => boolean,
  ) => void,
  /** Asks the LLM which of the jobs in `brain.choosing` comes first. Nothing waits on it for long. */
  choose: () => void = () => {},
): Step | null {
  const now = Date.now();
  // A step the body was told to take and nothing was heard of has come to nothing.
  if (
    brain.lastAct &&
    now - brain.lastAct.at > LOST_ACT_MS &&
    !brain.walking &&
    !brain.doing
  ) {
    fail(brain, brain.lastAct.key);
    brain.lastAct = null;
  }
  // An answer someone is waiting on is given whatever the hands are doing. Talking takes no
  // hands, and "why are you in here?" does not wait until the floor is clean.
  if (brain.awake && brain.mustSay === null && !brain.sayingNow) {
    const owed = workInOrder(brain).find(
      ({ task, plan }) =>
        task.urgency === 'emergency' && plan.ready && !!plan.say,
    );
    const key = owed ? keyOf(owed.task, undefined, owed.plan.say) : '';
    if (owed?.plan.say && !inBackoff(brain, key)) {
      fail(brain, key);
      speak(owed.plan.say, owed.plan.needs, owed.plan.sayIf);
      return {
        key,
        text: owed.plan.step,
        say: owed.plan.say,
        task: owed.task.id,
      };
    }
  }
  // In the middle of something, it carries on, unless someone it answers to has ordered otherwise.
  const busy = brain.walking || !!brain.doing || !!brain.lastAct;
  const dropFor = busy ? orderToDrop(brain) : null;
  if (
    !brain.awake ||
    (busy && !dropFor) ||
    // Someone has it by the arm. It goes where it is taken.
    brain.inHand ||
    // It has something to say first, and is still finding the words.
    brain.mustSay !== null ||
    brain.sayingNow
  ) {
    return null;
  }
  let step = nextStep(brain);
  // Which job comes first is settled in the breath between one job and the next, so that the
  // answer is there by the time the body is ready to move.
  if (step?.choose) {
    if (!settleChoice(brain, step.choose, choose, now)) {
      return null;
    }
    step = nextStep(brain);
  }
  if (now < brain.driveAfter) {
    return null;
  }
  // What it drops its work for is the order, and nothing else that happens to come up.
  if (!step || step.choose || (dropFor && step.task !== dropFor.id)) {
    return null;
  }
  // Someone is talking to it. A person answers while they work, so work on the spot goes on, but
  // walking off mid-sentence is what a machine would do. It holds still for a moment, though
  // never for long: a room full of talk must not stop the work.
  const leaves = !!step.act && !STAYS.has(step.act.tool);
  // Shut in, walking at the door again and again gets it nowhere. It tries now and then, in case
  // someone has let it out, and at once when it sees a door standing open.
  // Setting off for the door of some other room is leaving as well: from inside a room it
  // cannot get out of, that walk only ends at the same shut door.
  const walksOut =
    step.act?.tool === 'go_to' ||
    step.act?.tool === 'explore' ||
    (step.act?.tool === 'go_to_door' && typeof step.act.place === 'string');
  if (walksOut && brain.shutIn && !wayOutOpen(brain)) {
    if (now < brain.tryLeavingAt) {
      return null;
    }
    brain.tryLeavingAt = now + TRY_LEAVING_MS;
  }
  // Talk comes before setting off: someone has just spoken to it, it has just met someone, or it
  // has something to say and is still finding the words. Leaving first is how a greeting ends up
  // said to an empty hallway.
  // It never turns on its heel the moment it has said its piece, however long it has been held.
  if (leaves && now - brain.lastSayAt < AFTER_SAYING_MS) {
    return null;
  }
  const talking =
    now - brain.lastSpokenToAt < TALK_PAUSE_MS ||
    brain.wake ||
    brain.status !== 'idle';
  // A door someone is holding open for it will not stay open while the room finishes talking.
  const doorWaiting = brain.doorHeld || brain.doorHeldOut;
  if (leaves && talking && !doorWaiting) {
    brain.heldSince ||= now;
    if (now - brain.heldSince < TALK_HOLD_MAX_MS) {
      return null;
    }
  } else {
    brain.heldSince = 0;
  }
  if (step.say) {
    // Asked once; if nothing comes of it, it is left a while before being asked again.
    fail(brain, step.key);
    speak(step.say, step.needs, step.sayIf);
    noteDone(brain, step);
    return step;
  }
  if (!step.act) {
    return null;
  }
  const serverTool = issue(step.act);
  if (!serverTool) {
    fail(brain, step.key);
    return null;
  }
  noteDone(brain, step);
  brain.lastAct = {
    key: step.key,
    tool: serverTool,
    at: now,
    act: step.act,
    task: step.task,
  };
  brain.driveAfter = now + (step.idle ? IDLE_GAP_MS : SETTLE_MS);
  commitTo(brain, step.task, now);
  return step;
}

/**
 * Notes what a step that has just been taken settles: who has now been asked for the door, that
 * it has knocked or sent word, and what it has now told someone. Each of these is done once.
 */
function noteDone(brain: NpcBrain, step: Step): void {
  if (step.asks || step.key === KNOCK_OUT_KEY || step.key === WORD_OUT_KEY) {
    brain.outAsks ??= {
      room: brain.location,
      asked: [],
      knocked: false,
      messaged: false,
    };
    if (step.asks) {
      brain.outAsks.asked.push(step.asks);
    }
    if (step.key === KNOCK_OUT_KEY) {
      brain.outAsks.knocked = true;
    }
    if (step.key === WORD_OUT_KEY) {
      brain.outAsks.messaged = true;
    }
  }
  if (step.tells) {
    brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
  }
}

/**
 * Notes that the NPC has started on a piece of its routine work, which makes it the job it is
 * doing until it is done. Without this, a second job turning up halfway through the first would be
 * put to the LLM as a fresh choice, and a half-cleaned room left for one down the hall.
 */
function commitTo(brain: NpcBrain, id: number | undefined, now: number): void {
  if (id === undefined || brain.choice?.task === id) {
    return;
  }
  const task = brain.tasks.find((it) => it.id === id);
  if (task?.urgency === 'routine') {
    brain.choice = { task: id, why: '', at: now };
  }
}

/**
 * Settles which of several jobs the NPC does first. The LLM is asked, and the body waits a few
 * seconds for its answer. If none comes, or it was asked only a moment ago, the code's own order is
 * taken, so the work never waits on the LLM for long. Returns TRUE once there is a choice to go on.
 */
function settleChoice(
  brain: NpcBrain,
  options: Work[],
  ask: () => void,
  now: number,
): boolean {
  const own = { task: options[0].task.id, why: '', at: now };
  if (brain.choosing) {
    if (now < brain.choosing.until) {
      return false;
    }
    brain.choosing = null;
    brain.choice = own;
    return true;
  }
  if (now - brain.lastChoiceAt < CHOICE_GAP_MS) {
    brain.choice = own;
    return true;
  }
  brain.lastChoiceAt = now;
  brain.choosing = {
    options: options.map(({ task }) => task.id),
    until: now + CHOICE_WAIT_MS,
  };
  ask();
  return false;
}

/** Notes that a step came to nothing, so that it is left alone for a while. */
function fail(brain: NpcBrain, key: string): void {
  const count = (brain.failures.get(key)?.count ?? 0) + 1;
  brain.failures.set(key, {
    count,
    until: Date.now() + Math.min(RETRY_MS * count, RETRY_MAX_MS),
  });
}

/**
 * Hears from the server how something the body did went. If it was the step the driver last
 * asked for, a failure means leaving that step alone for a while and a success clears its record.
 */
export function noteResult(brain: NpcBrain, event: SenseEvent): void {
  const last = brain.lastAct;
  if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
    return;
  }
  jobFor(brain.job).afterActing?.(
    brain,
    last.act,
    brain.tasks.find((task) => task.id === last.task),
    !!event.details.ok,
  );
  ordersAfterActing(
    last.act,
    brain.tasks.find((task) => task.id === last.task),
    !!event.details.ok,
  );
  meetingsAfterActing(brain, last.act, !!event.details.ok);
  pickupsAfterActing(
    brain,
    last.act,
    brain.tasks.find((task) => task.id === last.task),
    !!event.details.ok,
  );
  if (event.details.ok) {
    brain.failures.delete(last.key);
    // The alarm is reset and the fire doors are opening: whatever it gave up on because of them
    // is worth trying again at once.
    if (last.act.tool === 'reset_alarm' && typeof last.act.place === 'string') {
      brain.alarmResets[last.act.place] = Date.now();
      brain.fireDoors = null;
      brain.failures.clear();
    }
    // It has been told it is at the door. That stands until the server says which door it is at.
    if (last.act.tool === 'go_to_door') {
      const place =
        typeof last.act.place === 'string' ? last.act.place : brain.location;
      brain.doorReached = { place, from: brain.location, at: Date.now() };
      brain.atDoorOf ??= place;
    }
  } else {
    fail(brain, last.key);
    // A knock that did not land, because the body was not at the door after all, is no knock.
    // It goes and stands at the door again, and knocks when it is there.
    if (last.act.tool === 'knock') {
      brain.doorReached = null;
      brain.atDoorOf = null;
      if (brain.outAsks) {
        brain.outAsks.knocked = false;
      }
    }
    // A walk that came to nothing with a door standing open: so much for that door.
    if (brain.shutIn && brain.doorOpen && !STAYS.has(last.act.tool)) {
      brain.openDoorTries++;
    }
  }
  brain.lastAct = null;
  // Nobody goes from one job to the next without a breath. It takes a moment, and not the same
  // moment every time.
  brain.driveAfter = Math.max(
    brain.driveAfter,
    Date.now() + BREATH_MIN_MS + Math.random() * BREATH_SPREAD_MS,
  );
}
