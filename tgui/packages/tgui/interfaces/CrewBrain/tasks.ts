/**
 * An NPC's task list: the work it has to do.
 *
 * Everything an NPC works on is a task: a mess to clean, something to fetch, an order to see
 * through. A task says what, where, how pressing, and who asked. Keeping work as tasks, not as
 * free-text notes, is what lets an NPC put work down when something more pressing comes up and pick
 * it back up after, wait on something without forgetting it, and tell whoever asked when it is done.
 *
 * The code keeps the list honest. Tasks are opened and closed from what the body senses: a mess
 * task is done when the body stands in the room and sees none, not when the LLM says so. The code
 * also works out which task comes next and what its next step is. The LLM is told that, and chooses.
 *
 * What a kind of task takes to do is known by the job that owns that kind (see jobs/).
 */
import { jobFor } from './jobs';
import {
  describeGuarding,
  planGuarding,
  syncGuarding,
} from './jobs/guarding';
import {
  describeOrders,
  noteOrdered,
  ORDER_SOUNDS,
  ORDERS,
  planOrders,
  syncOrders,
} from './jobs/orders';
import {
  describeMeetings,
  isMeetingOrder,
  planMeetings,
  syncMeetings,
} from './jobs/meetings';
import {
  describePickups,
  planPickups,
  syncPickups,
} from './jobs/pickups';
import { allPlaces, knowsPlace } from './memory';
import type { NpcBrain, Plan, Task, Urgency } from './types';

/** How long (deciseconds of server time) a finished task is kept, so whoever asked can be told. */
const KEEP_DONE_DS = 6000;
/** How long (deciseconds) a task may sit before it is given up on as forgotten business. */
const GIVE_UP_DS = 18000;
/** Most tasks listed to the LLM. */
const TASKS_SHOWN = 4;
/** What "work" says when the NPC was told of no work. */
export const WORK_NOTHING = 'nothing';
/** Where "work" says the work is when there is none, or it cannot tell which room was meant. */
export const WORK_NOWHERE = 'nowhere you know';

const URGENCY_ORDER: Record<Urgency, number> = {
  emergency: 0,
  asked: 1,
  routine: 2,
};

/** The task an NPC has open of this kind, in this place and about this item, if any. */
export function findTask(
  brain: NpcBrain,
  kind: string,
  match: { place?: string; item?: string } = {},
): Task | undefined {
  return brain.tasks.find(
    (task) =>
      task.state !== 'done' &&
      task.kind === kind &&
      task.place === match.place &&
      task.item === match.item,
  );
}

/**
 * Takes on a task, unless the NPC already has the same one open. Being asked to do something it
 * had only noticed for itself makes that task pressing, and records who is waiting on it.
 */
export function addTask(
  brain: NpcBrain,
  task: Pick<Task, 'kind' | 'urgency' | 'source'> &
    Partial<Pick<Task, 'place' | 'item' | 'askedBy'>>,
): Task {
  const existing = findTask(brain, task.kind, task);
  if (existing) {
    if (URGENCY_ORDER[task.urgency] < URGENCY_ORDER[existing.urgency]) {
      existing.urgency = task.urgency;
    }
    existing.askedBy ??= task.askedBy;
    // Work it had noticed for itself and is then told of or asked for is remembered as that.
    if (existing.source === 'noticed' || existing.source === 'own') {
      existing.source = task.source;
    }
    return existing;
  }
  const added: Task = {
    ...task,
    id: brain.nextTaskId++,
    state: 'open',
    createdAt: brain.now,
  };
  brain.tasks.push(added);
  return added;
}

/** Marks a task finished. It is kept a while if someone is waiting to hear of it. */
export function finishTask(brain: NpcBrain, task: Task): void {
  task.state = 'done';
  task.doneAt = brain.now;
  task.blockedOn = undefined;
  brain.lastJob = {
    time: new Date().toLocaleTimeString(),
    what: describeTask(brain, task),
  };
}

/** Marks a task as unable to go on, or able to again. */
export function blockTask(task: Task, blockedOn: string | null): void {
  if (task.state === 'done') {
    return;
  }
  task.state = blockedOn ? 'blocked' : 'open';
  task.blockedOn = blockedOn ?? undefined;
}

/** Drops a task without it counting as done. */
export function dropTask(brain: NpcBrain, task: Task): void {
  brain.tasks = brain.tasks.filter((other) => other !== task);
}

/**
 * Brings the task list up to date with what the body senses. Called every time the server sends
 * the NPC's state, so it costs no LLM call.
 */
export function syncTasks(brain: NpcBrain): void {
  jobFor(brain.job).syncTasks?.(brain);
  // Keeping a locked room, and answering for being in one, is everyone's, whatever their job.
  syncGuarding(brain);
  // So is carrying out what those over it have ordered.
  syncOrders(brain);
  // And going to a staff meeting its head has called.
  syncMeetings(brain);
  // And collecting a crate from cargo that its head has sent it for.
  syncPickups(brain);
  brain.tasks = brain.tasks.filter((task) => {
    if (task.state === 'done') {
      // A finished task is only kept while someone has yet to hear of it.
      const owedWord = task.askedBy && !task.reported;
      return owedWord && brain.now - (task.doneAt ?? 0) < KEEP_DONE_DS;
    }
    return brain.now - task.createdAt < GIVE_UP_DS || task.state === 'blocked';
  });
}

/**
 * The kinds of work this NPC takes on when someone tells it of some, in the words the LLM is given
 * for them, and the rooms such work could be in. Null if its job takes no work that way.
 */
export function workTold(
  brain: NpcBrain,
  /** TRUE if whoever has just spoken is someone the NPC answers to, who can give it orders as well. */
  fromSuperior = false,
): { kinds: string[]; places: string[] } | null {
  const kinds = [
    ...Object.values(jobFor(brain.job).takes ?? {}),
    ...(fromSuperior ? Object.values(ORDERS) : []),
  ];
  if (kinds.length === 0) {
    return null;
  }
  const places = allPlaces(brain);
  if (brain.location && !places.includes(brain.location)) {
    places.push(brain.location);
  }
  return { kinds, places: [...places, WORK_NOWHERE] };
}

/**
 * Takes on work the LLM says the NPC has just been told of. Returns the task, or null if it is not
 * a kind of work this job takes, or is not in a room aboard.
 */
export function takeToldWork(
  brain: NpcBrain,
  what: unknown,
  where: unknown,
  toldBy: string | undefined,
  /** TRUE if whoever told it is someone the NPC answers to. */
  fromSuperior = false,
): Task | null {
  const takes = jobFor(brain.job).takes ?? {};
  const own = Object.keys(takes).find((key) => takes[key] === what);
  // An order is only an order from someone it answers to.
  const order = fromSuperior
    ? Object.keys(ORDERS).find((key) => ORDERS[key] === what)
    : undefined;
  const kind = own ?? order;
  if (!kind || typeof where !== 'string' || !knowsPlace(brain, where)) {
    return null;
  }
  // Work in the room it is standing in is work it can see for itself. If it sees none, there is
  // none to take on; if it does, it has the task already, and this only says who is waiting on it.
  if (
    own &&
    where === brain.location &&
    !findTask(brain, kind, { place: where })
  ) {
    return null;
  }
  // What someone over it tells it to do comes before everything else it has to do.
  const task = addTask(brain, {
    kind,
    place: where,
    urgency: fromSuperior ? 'emergency' : 'asked',
    source: 'told',
    askedBy: toldBy,
  });
  if (order) {
    noteOrdered(brain, task);
  }
  return task;
}

/**
 * Catches work an NPC was plainly told of when the LLM did not say so, which it tends not to when
 * the NPC is busy or cannot act on it yet: the very times the list matters. Speech counts if it
 * uses the job's words for that kind of trouble and names a room the NPC knows.
 *
 * It errs towards taking the work on. A task taken on by mistake costs one walk: the NPC goes,
 * sees nothing to do, and the task closes.
 */
export function workInWords(
  brain: NpcBrain,
  /** The report lines the LLM was given, among them anything it heard said. */
  report: string[],
  toldBy: string | undefined,
  /** TRUE if whoever said it is someone the NPC answers to. */
  fromSuperior = false,
): Task | null {
  const job = jobFor(brain.job);
  // Only what people said, which the report gives in double quotes. And where it is known who
  // told it of the work, only what they said: a room someone else named in the same breath is not
  // the room it was sent to.
  const spoken = report.filter((line) => line.includes('(person '));
  const theirs = toldBy
    ? spoken.filter((line) => line.includes(`] ${toldBy} says: `))
    : [];
  const heard = (theirs.length > 0 ? theirs : spoken)
    .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
    .join(' ')
    .toLowerCase();
  const place = placeNamedIn(brain, heard);
  // A head told to find out how its staff are doing calls a meeting for it: see jobs/head.ts.
  // That is not an order to go and look at a room, even if one is named.
  if (!place || (fromSuperior && isMeetingOrder(brain, heard))) {
    return null;
  }
  // The job's own work first: "check the Bar, there is blood everywhere" is a mess to a janitor.
  for (const [kind, words] of Object.entries(job.soundsLike ?? {})) {
    if (job.takes?.[kind] && words.test(heard)) {
      return takeToldWork(brain, job.takes[kind], place, toldBy, fromSuperior);
    }
  }
  if (fromSuperior) {
    for (const [kind, words] of Object.entries(ORDER_SOUNDS)) {
      if (words.test(heard)) {
        return takeToldWork(brain, ORDERS[kind], place, toldBy, true);
      }
    }
  }
  return null;
}

/** The room the NPC knows that these words name, if they name one. The words must be in lower case. */
export function placeNamedIn(brain: NpcBrain, heard: string): string | undefined {
  // Longest names first, so "Medbay Central" is not taken for "Medbay".
  return allPlaces(brain)
    .sort((a, b) => b.length - a.length)
    .find((name) =>
      new RegExp(
        `\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`,
      ).test(heard),
    );
}

/** What doing a task comes down to right now, from whoever knows how that kind of work is done. */
export function planTask(brain: NpcBrain, task: Task): Plan {
  return (
    planGuarding(brain, task) ??
    planOrders(brain, task) ??
    planMeetings(brain, task) ??
    planPickups(brain, task) ??
    jobFor(brain.job).plan?.(brain, task) ?? {
      ready: false,
      step: 'You do not know how to go about it.',
    }
  );
}

/** Says a task in a few words, as the NPC would think of it. */
export function describeTask(brain: NpcBrain, task: Task): string {
  const what =
    describeGuarding(task) ??
    describeOrders(task) ??
    describeMeetings(task) ??
    describePickups(task) ??
    jobFor(brain.job).describeTask?.(task) ??
    task.kind;
  return `${what}${task.askedBy ? ` (${task.source === 'told' ? `${task.askedBy} told you of it` : `for ${task.askedBy}`})` : ''}`;
}

/**
 * The NPC's unfinished work, in the order it should be seen to: what is most pressing first, and
 * among equals what can be got on with now before what cannot, then what has waited longest.
 */
export function workInOrder(
  brain: NpcBrain,
): { task: Task; plan: Plan }[] {
  return brain.tasks
    .filter((task) => task.state !== 'done')
    .map((task) => ({
      task,
      plan:
        task.state === 'blocked'
          ? { ready: false, step: `It is waiting: ${task.blockedOn}.` }
          : planTask(brain, task),
    }))
    .sort(
      (a, b) =>
        // An emergency comes before everything.
        Number(b.task.urgency === 'emergency') -
          Number(a.task.urgency === 'emergency') ||
        // Then what someone is waiting on, if it can be got on with: a person who has been called
        // to a mess goes to it, and does not finish sweeping the hallway first.
        Number(isCalledFor(b)) - Number(isCalledFor(a)) ||
        // Then whatever can be done right where the NPC stands. Walking off to routine work
        // elsewhere and back again costs more than doing what is underfoot first, and an NPC sent
        // away from work in front of it by a list will be sent straight back by the same list.
        Number(isRightHere(brain, b)) - Number(isRightHere(brain, a)) ||
        URGENCY_ORDER[a.task.urgency] - URGENCY_ORDER[b.task.urgency] ||
        Number(b.plan.ready) - Number(a.plan.ready) ||
        // Work where the crew live and walk comes before work in the maintenance tunnels.
        Number(isBackwater(a.task)) - Number(isBackwater(b.task)) ||
        a.task.createdAt - b.task.createdAt,
    );
}

/** TRUE if someone asked for a piece of work, or called the NPC to it, and it can be got on with now. */
function isCalledFor(work: { task: Task; plan: Plan }): boolean {
  return work.plan.ready && work.task.urgency === 'asked';
}

/** TRUE if a piece of work is in the room the NPC is standing in and can be got on with now. */
function isRightHere(
  brain: NpcBrain,
  work: { task: Task; plan: Plan },
): boolean {
  return work.plan.ready && work.task.place === brain.location;
}

/** TRUE if a task is somewhere few people go, so it can wait for work that more people will notice. */
function isBackwater(task: Task): boolean {
  return /maintenance/i.test(task.place ?? '');
}

/** The task to get on with next, if there is one that can be. */
export function nextTask(brain: NpcBrain): { task: Task; plan: Plan } | null {
  return workInOrder(brain).find((work) => work.plan.ready) ?? null;
}

/** The finished tasks whose askers are in view and have not been told yet. */
export function wordOwed(brain: NpcBrain): Task[] {
  const inView = new Set(brain.peopleInView.map((person) => person.name));
  return brain.tasks.filter(
    (task) =>
      task.state === 'done' &&
      !task.reported &&
      !!task.askedBy &&
      inView.has(task.askedBy),
  );
}

/** Notes that the NPC has spoken, which tells anyone in view who was waiting to hear a task was done. */
export function afterSaying(brain: NpcBrain): void {
  for (const task of wordOwed(brain)) {
    task.reported = true;
  }
}

/**
 * Describes the NPC's work for the end of a report: what to get on with next and how, what else is
 * waiting, and who is owed word that something is done.
 */
export function describeWork(brain: NpcBrain): string[] {
  const lines: string[] = [];
  for (const task of wordOwed(brain)) {
    lines.push(
      `You have finished what ${task.askedBy} ${task.source === 'told' ? 'told you of' : 'asked for'}: ${jobFor(brain.job).describeTask?.(task) ?? task.kind}. ${task.askedBy} is here and does not know yet: tell them now, in "say", that it is done.`,
    );
  }
  const work = workInOrder(brain);
  if (work.length === 0) {
    return lines;
  }
  // While the body is busy it is told what it is doing already; the next task is for when it is free.
  const next = brain.doing
    ? null
    : (work.find((item) => item.plan.ready) ?? null);
  const rest = work.filter((item) => item !== next);
  if (rest.length > 0) {
    lines.push(next ? 'Other work on your list:' : 'Work on your list:');
    for (const item of rest.slice(0, TASKS_SHOWN)) {
      // Work that could be got on with needs no more said; work that cannot says what it waits on.
      lines.push(
        item.plan.ready
          ? `- waiting its turn: ${describeTask(brain, item.task)}.`
          : `- cannot go on yet: ${describeTask(brain, item.task)}. ${item.plan.step}`,
      );
    }
    if (rest.length > TASKS_SHOWN) {
      lines.push(`- and ${rest.length - TASKS_SHOWN} more after those.`);
    }
  }
  // What the body is seeing to next is said on its own, last of all, in the job's own words for it.
  if (next) {
    lines.push(next.plan.step);
  } else if (!brain.doing) {
    lines.push(
      'None of that can go on just now.',
    );
  }
  return lines;
}

/**
 * What the LLM is told when someone the NPC answers to has just given it an order that the code
 * has already made out and taken on. Whether it goes is not the LLM's to decide: only how it says so.
 */
export function describeOrdered(
  brain: NpcBrain,
  task: Task,
  superior: string,
): string {
  const what =
    describeGuarding(task) ??
    describeOrders(task) ??
    describeMeetings(task) ??
    describePickups(task) ??
    jobFor(brain.job).describeTask?.(task) ??
    task.kind;
  return `${superior} has just given you an order: ${what}. You answer to ${superior}, so you are doing it, now, ahead of everything else you have to do, your post included. Your body is already seeing to it. In "say", tell ${superior} you are on it. Do not refuse, and do not say it is not your job.`;
}

/**
 * What an NPC that takes work when told of it is reminded of when someone has just spoken to it.
 * '' if its job takes no work that way.
 */
export function describeWorkTold(
  brain: NpcBrain,
  /** The name of whoever has just spoken, if the NPC answers to them. */
  superior: string | null = null,
): string {
  const told = workTold(brain, !!superior);
  return told
    ? `${superior ? `You answer to ${superior}. What ${superior} orders, you do, and it comes before everything else you have to do, your post included: say so, and your body sees to it. ` : ''}If what was just said tells you of ${told.kinds.join(' or ')}, in any room, "work" must say so and name the room, whether or not you can see to it now: that is how it gets on your list. If you cannot tell which room was meant, the room is "${WORK_NOWHERE}". If you were told of no such thing, "work" is "${WORK_NOTHING}".`
    : '';
}
