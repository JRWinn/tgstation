/**
 * The driver: works an NPC's task list without asking an LLM.
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
import { jobFor } from './jobs';
import {
  describeShutIn,
  SHUT_IN_KEY,
  whoToAskForTheDoor,
} from './situation';
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
  /** The task the step is for, if it is for one. */
  task?: number;
  /** TRUE if this is only passing the time, not work. */
  idle?: boolean;
};

function keyOf(task: Task | null, act: Action | undefined, say?: string): string {
  return `${task?.id ?? 'none'}:${act ? JSON.stringify(act) : `say:${say}`}`;
}

/** TRUE if this step failed lately and is being left alone for now. */
function inBackoff(brain: NpcBrain, key: string): boolean {
  // Shut in and seeing a door stand open, everything is worth trying again this instant.
  if (brain.shutIn && brain.doorOpen) {
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

  // Someone is holding the door to let it out. It goes, now, back the way it came if it knows the
  // way: the door will not be held for long, and standing there finishing a thought wastes it.
  if (brain.doorHeldOut) {
    const others = knownPlaces(brain).filter((place) => place !== brain.location);
    const out =
      brain.cameFrom && others.includes(brain.cameFrom) ? brain.cameFrom : others[0];
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

  // Shut in, with someone there: asking for the door comes before anything else. One person is
  // asked, and then it waits a good while before asking the next.
  const helper = brain.shutIn && !brain.doorOpen ? whoToAskForTheDoor(brain) : null;
  if (helper && !inBackoff(brain, SHUT_IN_KEY)) {
    return {
      key: SHUT_IN_KEY,
      text: describeShutIn(brain),
      say: `${helper.split(' ')[0]}, could you open the door for me, please? I cannot get out of here.`,
    };
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
  for (const { task, plan } of work) {
    if (!plan.ready || (!plan.act && !plan.say)) {
      continue;
    }
    const key = keyOf(task, plan.act, plan.say);
    if (inBackoff(brain, key)) {
      continue;
    }
    return {
      key,
      text: plan.step,
      act: plan.act,
      say: plan.say,
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
  return {
    key,
    text:
      idle.tool === 'search'
        ? 'You have no work waiting, so you are seeing what is kept in the storage here.'
        : 'You have no work waiting, so you are walking the station to see what needs doing.',
    act: idle,
    idle: true,
  };
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
  speak: (fallback: string) => void,
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
  if (
    !brain.awake ||
    brain.walking ||
    brain.doing ||
    brain.lastAct ||
    now < brain.driveAfter ||
    // It has something to say first, and is still finding the words.
    brain.mustSay !== null ||
    brain.sayingNow
  ) {
    return null;
  }
  const step = nextStep(brain);
  if (!step) {
    return null;
  }
  // Someone is talking to it. A person answers while they work, so work on the spot goes on, but
  // walking off mid-sentence is what a machine would do. It holds still for a moment, though
  // never for long: a room full of talk must not stop the work.
  const leaves = !!step.act && !STAYS.has(step.act.tool);
  // Shut in, walking at the door again and again gets it nowhere. It tries now and then, in case
  // someone has let it out, and at once when it sees a door standing open.
  if (leaves && brain.shutIn && !brain.doorOpen) {
    if (now < brain.tryLeavingAt) {
      return null;
    }
    brain.tryLeavingAt = now + TRY_LEAVING_MS;
  }
  // Talk comes before setting off: someone has just spoken to it, it has just met someone, or it
  // has something to say and is still finding the words. Leaving first is how a greeting ends up
  // said to an empty hallway.
  const talking =
    now - brain.lastSpokenToAt < TALK_PAUSE_MS ||
    // Nor does it turn on its heel the moment it has said its piece.
    now - brain.lastSayAt < AFTER_SAYING_MS ||
    brain.wake ||
    brain.status !== 'idle';
  if (leaves && talking) {
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
    speak(step.say);
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
  brain.lastAct = {
    key: step.key,
    tool: serverTool,
    at: now,
    act: step.act,
    task: step.task,
  };
  brain.driveAfter = now + (step.idle ? IDLE_GAP_MS : SETTLE_MS);
  return step;
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
  if (event.details.ok) {
    brain.failures.delete(last.key);
  } else {
    fail(brain, last.key);
  }
  brain.lastAct = null;
  // Nobody goes from one job to the next without a breath. It takes a moment, and not the same
  // moment every time.
  brain.driveAfter = Math.max(
    brain.driveAfter,
    Date.now() + BREATH_MIN_MS + Math.random() * BREATH_SPREAD_MS,
  );
}
