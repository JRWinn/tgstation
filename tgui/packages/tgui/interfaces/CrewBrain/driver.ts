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
import { headOf } from './hierarchy';
import { jobFor } from './jobs';
import { ASIDE_HOLD_MS, ASIDE_STEP_KEY, asideStep } from './jobs/aside';
import { barred, leavingStep } from './jobs/guarding';
import { doorCalled } from './jobs/janitor';
import { meetingsAfterActing } from './jobs/meetings';
import { ordersAfterActing } from './jobs/orders';
import { pickupsAfterActing } from './jobs/pickups';
import { wantedAfterActing } from './jobs/wanted';
import { knownPlaces } from './memory';
import { describeShutIn, SHUT_IN_KEY, whoToAskForTheDoor } from './situation';
import { wordOwed, workInOrder } from './tasks';
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
/** How often one that was let in by someone, and is waiting at the door it came in by, leaves that door to try another way. */
const TRY_LEAVING_LET_IN_MS = 120000;
/** How long the body stays where it is after saying something, before it sets off anywhere. */
const AFTER_SAYING_MS = 2500;
/** How long someone who was in the way of a crate is remembered as being in the way. */
const IN_THE_WAY_MS = 30000;
/** The steps record under which asking someone to step aside is kept. */
const ASIDE_KEY = 'step-aside';
/**
 * What the body does without going anywhere. Everything else takes it off across the room, or out of it.
 * A step aside is a tile or three in the same room, and is done there and then: being asked for it
 * is being spoken to, and holding it for the talk left it standing in the way six seconds more.
 */
const STAYS = new Set([
  'step_aside',
  'clean',
  'message',
  'search',
  'find_supplies',
  'grenade',
  'note',
  'word_passed',
]);
/** TRUE if this tool takes the body off where it stands: anything that is not done on the spot. */
export function isWalk(tool: string): boolean {
  return !STAYS.has(tool);
}
/** How long the driver waits to hear how a step went before it takes it to have come to nothing. */
const LOST_ACT_MS = 12000;
/** How long the body waits for the LLM to say which job comes first before the code's own order is taken. */
const CHOICE_WAIT_MS = 8000;
/** The LLM is asked which job comes first no more often than this. In between, the code's own order is taken. */
const CHOICE_GAP_MS = 20000;
/** Names the steps of knocking at the door it is shut in by, and sending word to whoever let it in. */
const KNOCK_OUT_KEY = 'knock-out';
const WORD_OUT_KEY = 'word-out';
/** Names the step of sending word further afield when nobody has come: the name written to follows it. */
const WRITE_OUT_KEY = 'write-out';
/** How long (milliseconds) it waits for someone to come to the door before it sends word to the next person. */
const NOBODY_CAME_MS = 60000;
/** The most people whose ID opens the door that it writes to, besides whoever let it in, before it writes to its head. */
const KEEPERS_WRITTEN_TO = 1;
/** How long (milliseconds) fire doors that stopped it are worth acting on. After that it has to meet them again. */
const FIRE_DOORS_SEEN_MS = 60000;
/** One NPC resets the fire alarm of the same room no more often than this. */
const RESET_AGAIN_MS = 300000;
/** How long (milliseconds) something it means to tell someone is kept before it is dropped unsaid. */
const TELL_KEPT_MS = 120000;
/** Names the step of deciding between jobs. */
const CHOOSE_KEY = 'choose';
/** Names the step of moving out of a doorway it would otherwise be waiting in. */
const STEP_INSIDE_KEY = 'step-inside';
/** How many times it steps clear in one room before it takes it that there is nowhere clear to stand, and waits where it is. */
const STEP_INSIDE_MAX = 2;
/** How many times each NPC has stepped clear to wait, and in which room, by its id. */
const stepInsideTries = new Map<string, { place: string; count: number }>();

/** How many times the NPC has stepped clear in the room it is in now. */
function stepInsideCount(brain: NpcBrain): number {
  const tries = stepInsideTries.get(brain.id);
  return tries && tries.place === brain.location ? tries.count : 0;
}

/**
 * TRUE if the NPC may step clear once more in the room it is in. Stepping clear and finding itself
 * still by a door, a janitor did it eight times in three minutes at a staff meeting: some rooms
 * have a door by every tile it can stand on. Only reads: the try is counted when the step is sent
 * (noteSteppedInside, from noteDone), since nextStep is asked on every update and most of those
 * take no step.
 */
function canStepInside(brain: NpcBrain): boolean {
  return stepInsideCount(brain) < STEP_INSIDE_MAX;
}

/** Counts a step clear that has just been sent. */
function noteSteppedInside(brain: NpcBrain): void {
  stepInsideTries.set(brain.id, {
    place: brain.location,
    count: stepInsideCount(brain) + 1,
  });
}
/**
 * How many times running the same walk may be said to have got there before it is taken to be
 * getting the body nowhere, and how close together (milliseconds) those have to come to count.
 */
const LOOP_AFTER = 3;
const LOOP_WINDOW_MS = 120000;
/**
 * The steps that are watched for that. Done once and gone well, neither is wanted again at once:
 * the body is in the room, or has the thing. A janitor that took its own empty bottle out of its
 * bag was told each time that it had picked up a space cleaner, and asked for one again.
 */
const LOOP_WATCHED = new Set(['go_to', 'pick_up']);

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
  /** TRUE if that line is said word for word, with only a remark from the LLM after it: see Plan. */
  exact?: boolean;
  /** The task the step is for, if it is for one. */
  task?: number;
  /** TRUE if this is only passing the time, not work. */
  idle?: boolean;
  /** If the step is asking to be let out: who is being asked, so that they are not asked twice. */
  asks?: string;
  /** If the step is sending word that it is shut in, to someone further afield: who, so that they are written to once. */
  writes?: string;
  /** If the step is telling someone something it meant to: the line, so that it is told once. */
  tells?: string;
  /**
   * If the step is deciding which job comes first: the jobs it is between, in the code's own
   * order. Nothing is done until that is settled: see settleChoice.
   */
  choose?: Work[];
};

function keyOf(
  task: Task | null,
  act: Action | undefined,
  say?: string,
): string {
  return `${task?.id ?? 'none'}:${act ? JSON.stringify(act) : `say:${say}`}`;
}

/**
 * The key a whole job is left alone under, whatever its next step would be. A clean that came to
 * nothing holds back the walk to that room as well: with only the clean held back, the walk was
 * ready the moment the body was anywhere else, and it went back and forth between two rooms.
 */
function jobKey(taskId: string | number): string {
  return `job:${taskId}`;
}

/** How many walks to the door out may fail before a shut-in NPC sends word from where it stands. */
const DOOR_TRIES_BEFORE_WORD = 2;

/** How many walks out may fail with a door standing open before the door is taken to be no way out. */
const OPEN_DOOR_TRIES = 2;

/**
 * Who a shut-in NPC sends word to next, when it has knocked (or cannot get to the door to knock)
 * and sent word to whoever let it in, and nobody has come: someone else whose own ID opens the
 * door, and after them its own head. Null if it is not yet time, or there is nobody left it has
 * not written to.
 */
function nextToWrite(
  brain: NpcBrain,
  cannotReachDoor: boolean,
): { name: string; head: boolean } | null {
  const asks = brain.outAsks;
  if (
    !(asks?.knocked || asks?.messaged || cannotReachDoor) ||
    !brain.hasPda ||
    // Whoever let it in is written to first, where there is such a person.
    (!!brain.letInBy && !asks?.messaged) ||
    Date.now() - (asks?.wroteAt ?? 0) < NOBODY_CAME_MS
  ) {
    return null;
  }
  const wrote = asks?.wrote ?? [];
  const written = (name: string) =>
    name === brain.letInBy || wrote.includes(name);
  const keepers = brain.doorKeepers.filter((name) => name !== brain.name);
  const keeper = keepers.find((name) => !written(name));
  if (
    keeper &&
    keepers.filter((name) => wrote.includes(name)).length < KEEPERS_WRITTEN_TO
  ) {
    return { name: keeper, head: false };
  }
  const headJob = headOf(brain.job);
  const head = headJob
    ? brain.pdaPeople.find((person) =>
        person.job.toLowerCase().includes(headJob.toLowerCase()),
      )
    : undefined;
  return head && !written(head.name) ? { name: head.name, head: true } : null;
}

/**
 * TRUE if the NPC is shut in and can see a door standing open that may yet be a way out. One it
 * has walked at more than once and still not got out by leads nowhere it can go.
 */
function wayOutOpen(brain: NpcBrain): boolean {
  return (
    brain.shutIn && brain.doorOpen && brain.openDoorTries < OPEN_DOOR_TRIES
  );
}

/** The tools that take the body out of the room it is in, or may. */
const WALKS = new Set(['go_to', 'go_to_door', 'explore']);

/**
 * TRUE if this step failed lately and is being left alone for now. `act` is what the step does,
 * where it is known: null for a step that only says something.
 */
function inBackoff(brain: NpcBrain, key: string, act?: Action | null): boolean {
  // Shut in and seeing a door stand open, everything is worth trying again this instant.
  if (wayOutOpen(brain)) {
    return false;
  }
  // Likewise while someone is holding a door for it: that will not last, and a walk that failed
  // a moment before the door opened says nothing about one made now. A clean that came to nothing
  // in the room it stands in is no more worth trying for a door being opened across the room.
  if (brain.doorHeld && (act === undefined || (!!act && WALKS.has(act.tool)))) {
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

  // Asked to step aside by someone it is in the way of. It moves, there and then.
  const aside = asideStep(brain);
  if (aside && !inBackoff(brain, aside.key)) {
    return aside;
  }

  // Told to leave the room by someone it answers to. It says that it is going before anything
  // else, and then goes: by the door it came in by, if it has to be let out.
  const leave = leavingStep(brain);
  if (leave?.say && !inBackoff(brain, leave.key)) {
    return leave;
  }

  // Someone is holding the door to let it out. It goes, now, back the way it came if it knows the
  // way: the door will not be held for long, and standing there finishing a thought wastes it.
  if (brain.doorHeldOut) {
    const others = knownPlaces(brain).filter(
      (place) => place !== brain.location,
    );
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
  // The door out, that is. Standing at some other door, one it had asked to be let in at, is not
  // standing at the way out: a knock there says "let me in" to whoever hears it.
  if (brain.shutIn && !wayOutOpen(brain) && brain.atDoorOf !== brain.location) {
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
  // Where it is trying to get back to, said in the asking, so that whoever opens the door can see
  // it the whole way and not only through the next door.
  const outTo =
    brain.wayOutTo && brain.wayOutTo !== brain.location
      ? ` to the ${brain.wayOutTo}`
      : '';
  if (helper && !inBackoff(brain, SHUT_IN_KEY)) {
    return {
      key: SHUT_IN_KEY,
      text: describeShutIn(brain),
      say: outTo
        ? `${helper.split(' ')[0]}, could you let me out${outTo}, please? I cannot get out of here by myself.`
        : `${helper.split(' ')[0]}, could you open the door for me, please? I cannot get out of here.`,
      // Whoever it is asked of has to hear their own name in it, or the wrong person is asked.
      needs: new RegExp(`\\b${helper.split(' ')[0]}\\b`, 'i'),
      asks: helper,
    };
  }
  // Nobody in sight to ask, or nobody left it has not asked. A voice does not carry through a
  // shut door, so it knocks, once, and sends word, once, to whoever let it in. A PDA needs no
  // door: one it has failed to get to twice (bad air beyond every door, crates in the doorway)
  // is no reason not to send word, worded for where it is.
  const atDoor = brain.atDoorOf === brain.location;
  const cannotReachDoor =
    !atDoor &&
    (brain.failures.get(keyOf(null, { tool: 'go_to_door' }))?.count ?? 0) >=
      DOOR_TRIES_BEFORE_WORD;
  const whereAt = atDoor
    ? `am at the ${doorCalled(brain, brain.location)}door`
    : 'cannot get to its door';
  if (stuck && !helper && (atDoor || cannotReachDoor)) {
    if (atDoor && !brain.outAsks?.knocked && !inBackoff(brain, KNOCK_OUT_KEY)) {
      return {
        key: KNOCK_OUT_KEY,
        text: `You are shut in ${brain.location} with nobody in sight to ask. You are knocking at the door, for anyone on the other side of it.`,
        act: { tool: 'knock' },
      };
    }
    if (
      (brain.outAsks?.knocked || !atDoor) &&
      !brain.outAsks?.messaged &&
      brain.letInBy &&
      brain.hasPda &&
      !inBackoff(brain, WORD_OUT_KEY)
    ) {
      return {
        key: WORD_OUT_KEY,
        text: atDoor
          ? `Nobody has come to the door of ${brain.location}. You are sending ${brain.letInBy}, who let you in, a PDA message asking to be let out.`
          : `You are shut in ${brain.location} and cannot get to its door. You are sending ${brain.letInBy}, who let you in, a PDA message asking to be let out.`,
        act: {
          tool: 'message',
          person: brain.letInBy,
          text: atDoor
            ? `I am done in the ${brain.location} and ${whereAt}. Could you let me out${outTo}, please?`
            : `I am shut in the ${brain.location} and ${whereAt}. Could you let me out${outTo}, please?`,
        },
      };
    }
    // Still nobody. Word goes further afield, to one person at a time and once each, with a wait
    // between: someone else whose own ID opens the door, and after them its own head.
    const next = nextToWrite(brain, cannotReachDoor);
    if (next && !inBackoff(brain, `${WRITE_OUT_KEY}:${next.name}`)) {
      return {
        key: `${WRITE_OUT_KEY}:${next.name}`,
        text: `Nobody has come to let you out of ${brain.location}. You are sending ${next.name}${next.head ? ', the head of your department,' : ', who can open the door,'} a PDA message about it.`,
        act: {
          tool: 'message',
          person: next.name,
          text: next.head
            ? `I am shut in the ${brain.location} and nobody has come to the door. Could you send someone to let me out${outTo}, please?`
            : `I am shut in the ${brain.location} and ${whereAt}. Could you let me out${outTo}, please?`,
        },
        writes: next.name,
      };
    }
  }

  // It means to get out and is not shut in where it stands: it has only just come through a door
  // on the way, or has not tried this room yet. It walks for where it was last out. If the way is
  // open, a wall blown through or a door left standing, it simply leaves. If not, that walk coming
  // to nothing is what tells it so, and it goes to the door it came in by and asks.
  // Not while there is work in this room that it can get on with. Having asked to be let out of
  // an inner room, it still meant to get out when it came into the outer one, and walked out on
  // a mess there that it had been called to: then asked straight back in. It leaves when what is
  // left here is done, or is beyond what it holds.
  if (
    brain.wantsOut &&
    !brain.shutIn &&
    brain.wayOutTo &&
    brain.wayOutTo !== brain.location &&
    !brain.doorHeld &&
    !workInOrder(brain).some(
      ({ task, plan }) => plan.ready && task.place === brain.location,
    )
  ) {
    const act = { tool: 'go_to', place: brain.wayOutTo };
    const key = keyOf(null, act);
    if (!inBackoff(brain, key)) {
      return {
        key,
        text: `You are on your way back out to the ${brain.wayOutTo}, where you came in from.`,
        act,
      };
    }
  }

  // Told to leave, and not shut in where it stands: it walks out. If the way is shut, that walk
  // coming to nothing is what sets it asking for the door.
  if (leave?.act && !brain.shutIn && !inBackoff(brain, leave.key)) {
    return leave;
  }

  // Something it means to tell someone: said when they are in view, or sent by PDA if it is that
  // kind of word. Told once, and dropped if the moment for it has passed.
  brain.toTell = brain.toTell.filter(
    (tell) => Date.now() - tell.at < (tell.keepMs ?? TELL_KEPT_MS),
  );
  // The first line it can give now: one held back does not hold up those behind it.
  const tell = brain.toTell.find(
    (it) =>
      (it.byPda
        ? brain.hasPda
        : brain.peopleInView.some((person) => person.name === it.to)) &&
      !inBackoff(brain, `tell:${it.to}:${it.line}`),
  );
  if (tell) {
    const key = `tell:${tell.to}:${tell.line}`;
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
          exact: tell.exact,
          tells: tell.line,
        };
  }

  // Someone was standing where a crate could not get past them. They are asked to step aside.
  // Most often this is asked while the body is still taking the crate up again: see "drive".
  const askedAside = askAside(brain);
  if (askedAside) {
    return askedAside;
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
    // A room it has been told to leave, or was walked out of, is one it does no work in for now.
    if (task.place && barred(brain, task.place)) {
      continue;
    }
    // Waiting on something for someone who asked, at a door say, it stays and waits. Going off
    // to routine work elsewhere would only bring it straight back again.
    // The same goes for an order it is in the middle of: sent to look at a room, it looks.
    if (!plan.ready && plan.wait && task.urgency !== 'routine') {
      if (ready.length === 0) {
        // Not in a doorway, though, where that is no place to wait: everyone who comes through
        // walks into it, and it is in and out of the room with each of them. It steps clear first.
        if (
          plan.inside &&
          brain.inDoorway &&
          !brain.shutIn &&
          !inBackoff(brain, STEP_INSIDE_KEY) &&
          canStepInside(brain)
        ) {
          return {
            key: STEP_INSIDE_KEY,
            text: `${plan.step} You are standing in a doorway or on top of someone, in the way, and are stepping clear to wait.`,
            act: { tool: 'step_aside' },
            task: task.id,
          };
        }
        return null;
      }
      break;
    }
    if (!plan.ready || (!plan.act && !plan.say)) {
      continue;
    }
    const key = keyOf(task, plan.act, plan.say);
    const act = plan.act ?? null;
    if (inBackoff(brain, key, act) || inBackoff(brain, jobKey(task.id), act)) {
      heldBack = true;
      continue;
    }
    ready.push({ task, plan, key });
  }
  // A door being held open for it will not stay open. Whatever it was let in for comes first:
  // work in the room the door is the door of, or the walk through it to a room beyond. It is not
  // put to the LLM as a choice, either: the door would shut while it made up its mind.
  const through = brain.doorHeld
    ? ready.findIndex(
        ({ task, plan }) =>
          task.place === brain.doorHeldFor ||
          (plan.act?.tool === 'go_to' && plan.act.place === brain.doorHeldFor),
      )
    : -1;
  if (through >= 0) {
    const { task, plan, key } = ready[through];
    return {
      key,
      text: plan.step,
      act: plan.act,
      say: plan.say,
      needs: plan.needs,
      sayIf: plan.sayIf,
      exact: plan.exact,
      task: task.id,
    };
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
      exact: plan.exact,
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
  // What stands in the way of each piece of work it has, for the log. A janitor walked the
  // station for minutes with "none of your work can be got on with" and nothing to say why.
  const notReady = [
    ...new Set(
      work
        .filter(({ plan }) => !plan.ready)
        .map(({ task, plan }) => `${task.place ?? task.kind}: ${plan.step}`),
    ),
  ].slice(0, 4);
  const inTheWay =
    notReady.length > 0
      ? ` What stands in the way: ${notReady.join(' | ')}`
      : '';
  return {
    key,
    text:
      (idle.tool === 'search'
        ? `${why} you are seeing what is kept in the storage here.`
        : `${why} you are walking the station to see what needs doing.`) +
      inTheWay,
    act: idle,
    idle: true,
  };
}

/**
 * Asking whoever a crate caught on to step aside, if someone did lately and is still in view, and
 * it has not just asked. Said word for word: the other body moves on hearing the words, and a
 * line of the LLM's own about something else asks nobody to move.
 */
function askAside(brain: NpcBrain): Step | null {
  const blocker =
    brain.inTheWay && Date.now() - brain.inTheWay.at < IN_THE_WAY_MS
      ? brain.peopleInView.find(
          (person) => person.handle === brain.inTheWay?.handle,
        )
      : undefined;
  if (!blocker || inBackoff(brain, ASIDE_KEY)) {
    return null;
  }
  return {
    key: ASIDE_KEY,
    text: `${blocker.name} is standing in the way, and you could not get past them with what you were hauling. You are asking ${blocker.name} to step aside.`,
    say: `Excuse me, ${blocker.name.split(' ')[0]}, could you step aside, please? I need to get this past you.`,
    exact: true,
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
  if (!order) {
    return null;
  }
  // Already about that job, as a rule, it carries on. The one case it does not: a walk somewhere
  // that is part of the job, when the job's next step is one worth breaking the walk off for. An
  // officer walking the hallways for someone drops the walk the moment they are in sight.
  if (
    brain.lastAct?.task === order.task.id &&
    !(order.plan.dropsWalk && brain.lastAct.act.tool === 'go_to')
  ) {
    return null;
  }
  return inBackoff(brain, keyOf(order.task, order.plan.act))
    ? null
    : order.task;
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
    exact?: boolean,
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
      speak(owed.plan.say, owed.plan.needs, owed.plan.sayIf, owed.plan.exact);
      return {
        key,
        text: owed.plan.step,
        say: owed.plan.say,
        task: owed.task.id,
      };
    }
  }
  // Likewise a word someone is standing waiting to hear, such as that what they said was heard:
  // it is said in passing, whatever the body is walking to or doing.
  if (brain.awake && brain.mustSay === null && !brain.sayingNow) {
    const quick = brain.toTell.find(
      (it) =>
        it.whileBusy &&
        !it.byPda &&
        now - it.at < (it.keepMs ?? TELL_KEPT_MS) &&
        brain.peopleInView.some((person) => person.name === it.to),
    );
    const key = quick ? `tell:${quick.to}:${quick.line}` : '';
    if (quick && !inBackoff(brain, key)) {
      const step: Step = {
        key,
        text: quick.why,
        say: quick.line,
        needs: quick.needs,
        exact: quick.exact,
        tells: quick.line,
      };
      saidLine(brain, key);
      speak(quick.line, quick.needs, undefined, quick.exact);
      noteDone(brain, step);
      return step;
    }
  }
  // Its crate caught on someone, and the body is already going back to take it up again: whoever
  // it caught on is asked to step aside now, while there is still a haul to get past them.
  if (brain.awake && brain.mustSay === null && !brain.sayingNow) {
    const aside = askAside(brain);
    if (aside?.say) {
      fail(brain, aside.key);
      speak(aside.say, undefined, undefined, true);
      noteDone(brain, aside);
      return aside;
    }
  }
  // In the middle of something, it carries on, unless someone it answers to has ordered otherwise.
  const busy = brain.walking || !!brain.doing || !!brain.lastAct;
  const dropFor = busy ? orderToDrop(brain) : null;
  // Told to leave the room by someone it answers to, it stops what it is in the middle of for
  // that as well: once to say that it is going, and once to go.
  const leaving = brain.toldToLeave;
  const dropToLeave = busy && !!leaving && !leaving.dropped;
  // Likewise asked to step aside: scrubbing on at the spot it was asked to move from is no answer.
  // Only when that step can be given: with it held back, the step the driver would send in its
  // place is the body's own work, sent again over what it is already doing.
  const asideNow = busy ? asideStep(brain) : null;
  const dropToMove = !!asideNow && !inBackoff(brain, asideNow.key);
  if (
    !brain.awake ||
    (busy && !dropFor && !dropToLeave && !dropToMove) ||
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
    // One that was let in through a door it cannot open knows which door it is waiting on, and
    // has gone to stand at it. Every try takes it away from that door, to walk at some other one
    // that is as shut, and whoever comes to let it out finds nobody there. So it tries far less
    // often: only enough to find a wall blown open, or a door left standing that it cannot see.
    brain.tryLeavingAt =
      now + (brain.wantsOut ? TRY_LEAVING_LET_IN_MS : TRY_LEAVING_MS);
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
    // Asked once; if nothing comes of it, it is left a while before being asked again. A line
    // from what it has to tell is taken off that list as it is said, so it is no failed step.
    if (step.tells) {
      saidLine(brain, step.key);
    } else {
      fail(brain, step.key);
    }
    speak(step.say, step.needs, step.sayIf, step.exact);
    noteDone(brain, step);
    return step;
  }
  if (!step.act) {
    return null;
  }
  // What it dropped its work to do, having been told to leave, it drops it for once.
  if (dropToLeave && leaving) {
    leaving.dropped = true;
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
  if (
    step.asks ||
    step.writes ||
    step.key === KNOCK_OUT_KEY ||
    step.key === WORD_OUT_KEY
  ) {
    brain.outAsks ??= {
      room: brain.location,
      asked: [],
      knocked: false,
      messaged: false,
      wrote: [],
      wroteAt: 0,
    };
    if (step.asks) {
      brain.outAsks.asked.push(step.asks);
    }
    if (step.key === KNOCK_OUT_KEY) {
      brain.outAsks.knocked = true;
      // The wait for someone to come runs from the knock, and again from each word sent after it.
      brain.outAsks.wroteAt = Date.now();
    }
    if (step.key === WORD_OUT_KEY) {
      brain.outAsks.messaged = true;
      brain.outAsks.wroteAt = Date.now();
    }
    if (step.writes) {
      brain.outAsks.wrote.push(step.writes);
      brain.outAsks.wroteAt = Date.now();
    }
  }
  if (step.tells) {
    brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
  }
  // Once asked to step aside, they have been asked. A new lost grip on them notes them again;
  // left standing, the note would be said again in the next haul, to someone in its way no more.
  if (step.key === ASIDE_KEY) {
    brain.inTheWay = null;
  }
  // It steps aside once for one asking, whether or not it found anywhere to step to.
  if (step.key.startsWith(ASIDE_STEP_KEY) && brain.asideAsked) {
    brain.asideAsked.done = true;
  }
  if (step.key === STEP_INSIDE_KEY) {
    noteSteppedInside(brain);
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
/** How long (milliseconds) a line it has just said is not said again, should it be queued again at once. */
const SAID_HOLD_MS = 5000;

/**
 * Notes a line from what it had to tell as said. That is no failure: the hold-back is a flat few
 * seconds, so the same line queued twice in a breath is said once, and it does not grow each time
 * the line is said. "Sam, I have that." grew till the technician gave up waiting for it.
 */
function saidLine(brain: NpcBrain, key: string): void {
  brain.failures.set(key, { count: 0, until: Date.now() + SAID_HOLD_MS });
}

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
  if (
    !last ||
    event.kind !== 'action_result' ||
    event.details.tool !== last.tool
  ) {
    return;
  }
  // A walk to a room that the server says got there, asked for again, and again: the body is
  // told it has arrived and each time is found not to have. Whatever the cause, a fourth walk
  // will not mend it. Whoever asked for the walk is told, and it is left alone a while.
  const now = Date.now();
  const again =
    brain.repeats?.key === last.key && now - brain.repeats.at < LOOP_WINDOW_MS;
  brain.repeats =
    event.details.ok && LOOP_WATCHED.has(last.act.tool)
      ? {
          key: last.key,
          count: again ? (brain.repeats?.count ?? 0) + 1 : 1,
          at: now,
        }
      : null;
  const looped = (brain.repeats?.count ?? 0) >= LOOP_AFTER;
  jobFor(brain.job).afterActing?.(
    brain,
    last.act,
    brain.tasks.find((task) => task.id === last.task),
    !!event.details.ok,
    looped,
    event.details,
    event.text,
  );
  wantedAfterActing(brain, last.act, !!event.details.ok, event.text);
  ordersAfterActing(
    last.act,
    brain.tasks.find((task) => task.id === last.task),
    !!event.details.ok,
  );
  meetingsAfterActing(brain, last.act, !!event.details.ok, looped);
  pickupsAfterActing(
    brain,
    last.act,
    brain.tasks.find((task) => task.id === last.task),
    !!event.details.ok,
  );
  if (event.details.ok && looped) {
    fail(brain, last.key);
  } else if (event.details.ok) {
    brain.failures.delete(last.key);
    if (last.act.tool === 'clean' && last.task !== undefined) {
      brain.failures.delete(jobKey(last.task));
    }
    // The alarm is reset and the fire doors are opening: whatever it gave up on because of them
    // is worth trying again at once.
    if (last.act.tool === 'reset_alarm' && typeof last.act.place === 'string') {
      brain.alarmResets[last.act.place] = Date.now();
      brain.fireDoors = null;
      brain.failures.clear();
    }
    // Having stepped out of someone's way, it stays there a little while. Going straight back to
    // what it was doing would put it straight back in the way.
    if (last.act.tool === 'step_aside') {
      brain.driveAfter = Math.max(brain.driveAfter, Date.now() + ASIDE_HOLD_MS);
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
    // A clean that came to nothing: the job is left alone, not only the scrubbing. The walk back
    // to the room is part of the job. Only a clean in the room the job is for, though. Wetting a
    // mop at a sink on the way to a mess elsewhere is the same tool, and reports that there was
    // nothing to clean where the sink is: that is no reason to put off going to the mess.
    const cleaned = brain.tasks.find((task) => task.id === last.task);
    if (last.act.tool === 'clean' && cleaned?.place === brain.location) {
      fail(brain, jobKey(cleaned.id));
    }
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
