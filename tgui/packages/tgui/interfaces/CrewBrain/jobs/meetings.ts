/**
 * Answering to a head: telling them what you need, and going to their meetings.
 *
 * This is not any one job's work. Everyone who is not a head has one, and takes what they need for
 * their work to that head, not to cargo: cargo takes orders from heads of department only. And when
 * the head calls a staff meeting, they go, and say what they need when they are asked.
 *
 * What a job needs is the job's to say (see Job.needs). How it is asked for is the same for all.
 */
import { answersTo } from '../hierarchy';
import { addTask, finishTask, placeNamedIn } from '../tasks';
import type { Action, NpcBrain, PersonInView, Plan, SenseEvent, Task } from '../types';
import { jobFor } from './index';

/** Being at a staff meeting its head has called. The task's place is the room. */
const MEETING = 'meeting';
/** How long (deciseconds) a call to a meeting stands. After that it is over, whoever came. */
const SUMMONS_STANDS_DS = 3000;
/** How long (deciseconds) it stands with its head at a meeting before it speaks up without being asked. */
const SPEAK_UP_DS = 300;
/** How long (deciseconds) after telling its head what it needs before it tells them again. */
const TELL_AGAIN_DS = 4800;
/** The words that mark a PDA message as a call to a meeting. */
const MEETING_WORDS = /\bmeeting\b/i;
/** The words by which a head asks the room what it needs. */
const ASKING_WORDS = /\bneed\b|\banything\b/i;
/** The plain words it asks its head for something in, by which that line is known afterwards. */
const ASKING_HEAD = 'could you get it ordered';
/** How a message begins that says it could not come to a meeting. */
const SHUT_OUT = 'I could not get into';

/** The head this NPC answers to who is in view, if one is. */
function headInView(brain: NpcBrain): PersonInView | undefined {
  return brain.peopleInView.find(
    (person) => !!person.superior || answersTo(brain.job, person.job),
  );
}

/** The name of the head this NPC answers to, if it knows of one aboard: in view, or on its PDA. */
export function headName(brain: NpcBrain): string | null {
  const seen = headInView(brain);
  if (seen) {
    return seen.name;
  }
  // Its own head before the Captain: the Captain has a station to run.
  const listed = brain.pdaPeople
    .filter((person) => answersTo(brain.job, person.job))
    .sort(
      (a, b) =>
        Number(/captain/i.test(a.job)) - Number(/captain/i.test(b.job)),
    );
  return listed[0]?.name ?? null;
}

/**
 * Telling its head what it needs for its work: out loud if the head is there, by PDA if not. Told
 * once, and then it waits to hear, and tells them again only after a good while.
 */
export function needStep(brain: NpcBrain, need: string): Plan {
  const head = headName(brain);
  if (!head) {
    return {
      ready: false,
      step: `You need ${need}, and there is nobody over you aboard to ask for it.`,
    };
  }
  if (
    brain.toldHeadAt !== null &&
    brain.now - brain.toldHeadAt < TELL_AGAIN_DS
  ) {
    return {
      ready: false,
      step: `You need ${need}. You have told ${head}, and are waiting to hear that it has come.`,
    };
  }
  const first = head.split(' ')[0];
  if (headInView(brain)?.name === head) {
    return {
      ready: true,
      step: `You need ${need}. ${head}, who you answer to, is here: in "say", tell ${head} what you need and ask them to get it ordered. Cargo only takes orders from heads of department.`,
      say: `${first}, I need ${need} for my work. C${ASKING_HEAD.slice(1)}, please?`,
      needs: new RegExp(`\\b${first}\\b`, 'i'),
    };
  }
  if (!brain.hasPda) {
    return {
      ready: false,
      step: `You need ${need}. ${head} is who to ask, and they are not here.`,
    };
  }
  return {
    ready: true,
    step: `You need ${need}. Cargo only takes orders from heads of department, so you are sending ${head}, who you answer to, a PDA message asking for it.`,
    act: {
      tool: 'message',
      person: head,
      text: `I need ${need} for my work. C${ASKING_HEAD.slice(1)}, please?`,
    },
  };
}

/** Reads a PDA message as a call to a meeting from its head, if that is what it is. Returns TRUE if it was. */
export function readSummons(
  brain: NpcBrain,
  from: string,
  text: string,
  at: number,
  job: string,
): boolean {
  if (!MEETING_WORDS.test(text) || !answersTo(brain.job, job)) {
    return false;
  }
  const room = placeNamedIn(brain, text.toLowerCase());
  if (!room) {
    return false;
  }
  brain.summons = { by: from, room, at, askedAt: null, said: false };
  return true;
}

/** Keeps the meeting task true to whether it has been called to one and has yet to say its piece. */
export function syncMeetings(brain: NpcBrain): void {
  const summons = brain.summons;
  const due =
    !!summons && !summons.said && brain.now - summons.at < SUMMONS_STANDS_DS;
  const task = brain.tasks.find(
    (it) => it.kind === MEETING && it.state !== 'done',
  );
  if (due && summons && !task) {
    addTask(brain, {
      kind: MEETING,
      place: summons.room,
      urgency: 'asked',
      source: 'told',
    });
  } else if (!due && task) {
    finishTask(brain, task);
    brain.summons = null;
  }
}

/** What being called to a meeting comes down to right now, or null if the task is not that. */
export function planMeetings(brain: NpcBrain, task: Task): Plan | null {
  const summons = brain.summons;
  if (task.kind !== MEETING || !summons) {
    return null;
  }
  // It could not get into the room. The head still hears what it needs: by PDA.
  if (summons.shutOut && brain.location !== summons.room) {
    const need = jobFor(brain.job).needs?.(brain);
    return brain.hasPda
      ? {
          ready: true,
          step: `${summons.by} has called a staff meeting in the ${summons.room}, and you cannot get in there. You are sending ${summons.by} a PDA message to say so${need ? `, and that you need ${need}` : ''}.`,
          act: {
            tool: 'message',
            person: summons.by,
            text: need
              ? `${SHUT_OUT} the ${summons.room} for the meeting. I need ${need} for my work. C${ASKING_HEAD.slice(1)}, please?`
              : `${SHUT_OUT} the ${summons.room} for the meeting. Nothing from me, thank you.`,
          },
        }
      : { ready: false, step: `You cannot get into the ${summons.room} for the staff meeting.` };
  }
  if (brain.location !== summons.room) {
    return {
      ready: true,
      step: `${summons.by} has called a staff meeting in the ${summons.room}, and you are going to it.`,
      act: { tool: 'go_to', place: summons.room },
    };
  }
  const head = brain.peopleInView.find((person) => person.name === summons.by);
  if (!head) {
    return {
      ready: false,
      wait: true,
      step: `You are in the ${summons.room} for the staff meeting, waiting for ${summons.by}.`,
    };
  }
  // It says what it needs when it is asked, or after standing there a while if nobody asks.
  const asked =
    summons.askedAt !== null ||
    brain.now - brain.inPlaceSince > SPEAK_UP_DS;
  if (!asked) {
    return {
      ready: false,
      wait: true,
      step: `You are at the staff meeting in the ${summons.room}, waiting for ${summons.by} to begin.`,
    };
  }
  const need = jobFor(brain.job).needs?.(brain);
  const first = summons.by.split(' ')[0];
  return {
    ready: true,
    step: need
      ? `${summons.by} is asking what the staff need. You need ${need}: in "say", tell ${summons.by} so.`
      : `${summons.by} is asking what the staff need. You have what you need: in "say", tell ${summons.by} so.`,
    say: need
      ? `${first}, I need ${need} for my work.`
      : `Nothing from me, ${first}, thank you.`,
    needs: new RegExp(`\\b${first}\\b`, 'i'),
  };
}

/** Says the meeting task in a few words, or null if the task is not that. */
export function describeMeetings(task: Task): string | null {
  return task.kind === MEETING
    ? `go to the staff meeting in the ${task.place}`
    : null;
}

/** Follows what its head says at a meeting: the question that is its cue to speak. */
export function meetingsOverhear(brain: NpcBrain, event: SenseEvent): void {
  const summons = brain.summons;
  if (
    summons &&
    summons.askedAt === null &&
    event.details.speaker === summons.by &&
    brain.location === summons.room &&
    ASKING_WORDS.test(String(event.details.message ?? ''))
  ) {
    summons.askedAt = brain.now;
  }
}

/** Notes what it has just said, when it was what a meeting or a need called for. */
export function meetingsAfterSaying(
  brain: NpcBrain,
  called: string | null,
): void {
  if (!called) {
    return;
  }
  const summons = brain.summons;
  if (summons && brain.location === summons.room) {
    const first = summons.by.split(' ')[0];
    if (
      called.startsWith(`${first}, I need `) ||
      called.startsWith('Nothing from me')
    ) {
      summons.said = true;
      // Having said what it needs at the meeting, its head has been told.
      if (called.startsWith(`${first}, I need `)) {
        brain.toldHeadAt = brain.now;
      }
    }
  }
  if (called.toLowerCase().includes(ASKING_HEAD)) {
    brain.toldHeadAt = brain.now;
  }
}

/** Notes a PDA message it has sent, when it was telling its head what it needs. */
export function meetingsAfterActing(
  brain: NpcBrain,
  act: Action,
  ok: boolean,
): void {
  const summons = brain.summons;
  // The walk to the meeting came to nothing: the room is one it cannot get into.
  if (summons && !ok && act.tool === 'go_to' && act.place === summons.room) {
    summons.shutOut = true;
  }
  // Having sent word that it could not come, it has said its piece.
  if (
    summons &&
    ok &&
    act.tool === 'message' &&
    String(act.text ?? '').startsWith(SHUT_OUT)
  ) {
    summons.said = true;
  }
  if (
    ok &&
    act.tool === 'message' &&
    String(act.text ?? '').toLowerCase().includes(ASKING_HEAD)
  ) {
    brain.toldHeadAt = brain.now;
  }
}
