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
  CALL,
  describeOrders,
  noteOrdered,
  orderIn,
  ORDER_SOUNDS,
  ORDERS,
  orderTakesHere,
  planOrders,
  syncOrders,
} from './jobs/orders';
import {
  describeMeetings,
  withoutMeetingOrder,
  planMeetings,
  syncMeetings,
} from './jobs/meetings';
import {
  describePickups,
  planPickups,
  syncPickups,
} from './jobs/pickups';
import { syncWanted } from './jobs/wanted';
import { allPlaces, knowsPlace } from './memory';
import type { NpcBrain, Plan, SenseEvent, Task, Urgency } from './types';

/** How long (deciseconds of server time) a finished task is kept, so whoever asked can be told. */
const KEEP_DONE_DS = 6000;
/** How long (deciseconds) a task may sit before it is given up on as forgotten business. */
const GIVE_UP_DS = 18000;
/** How long (deciseconds) work may wait blocked before it is given up on: an hour. */
const BLOCKED_GIVE_UP_DS = 36000;
/** Most tasks listed to the LLM. */
const TASKS_SHOWN = 4;
/** How many of the latest lines of whoever told it of work are read for that work. */
const ORDER_LINES = 2;
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
  // And saying where someone security is looking for is, when it sees them.
  syncWanted(brain);
  brain.tasks = brain.tasks.filter((task) => {
    if (task.state === 'done') {
      // A finished task is only kept while someone has yet to hear of it.
      const owedWord = task.askedBy && !task.reported;
      return owedWord && brain.now - (task.doneAt ?? 0) < KEEP_DONE_DS;
    }
    const kept = keepsGoing(brain, task);
    if (!kept && task.askedBy) {
      // Work someone asked for and never got: the window shows it was given up on, and whoever
      // asked is sent word, once (MEM-11, JOBS-02, CARGO-13: the owner's answer A).
      brain.lastJob = {
        time: new Date().toLocaleTimeString(),
        what: `Gave up on, not done: ${describeTask(brain, task)}`,
      };
      tellGivenUp(brain, task);
    }
    return kept;
  });
}

/**
 * What it could not do, as it tells whoever asked for it: "get to the mess in the Bar". Worded
 * for the kinds of work people ask for, and any other plainly by its room.
 */
function givenUpWhat(task: Task): string {
  const room = task.place ? ` in the ${task.place}` : '';
  switch (task.kind) {
    case 'clean':
      return `get to the mess${room}`;
    case 'collect':
      return `collect crate #${task.item} from cargo`;
    case 'handover':
      return `bring crate #${task.item} out to the lobby`;
    case 'force_door':
      return `get the door of the ${task.item} open`;
    case 'look':
      return `get to the ${task.place} to look at it`;
    case CALL:
      return `send for a janitor to the ${task.place}`;
    default:
      return task.place
        ? `get to the work in the ${task.place}`
        : 'get to what you asked of me';
  }
}

/**
 * Sends word to whoever asked for a piece of work that it has been given up on, not done: said
 * face to face if they are in view, else by PDA (if it has none, said when they are next seen).
 */
function tellGivenUp(brain: NpcBrain, task: Task): void {
  const to = task.askedBy;
  if (!to || to === brain.name) {
    return;
  }
  const line = `${to.split(' ')[0]}, I could not ${givenUpWhat(task)}.`;
  if (brain.toTell.some((tell) => tell.to === to && tell.line === line)) {
    return;
  }
  const here = brain.peopleInView.some((person) => person.name === to);
  brain.toTell.push({
    to,
    line,
    why: `You have given up on what ${to} ${task.source === 'told' ? 'told you of' : 'asked for'} (${describeTask(brain, task)}): it could not be done for too long. You are telling ${to} so.`,
    byPda: !here && brain.hasPda,
    exact: true,
    at: Date.now(),
  });
}

/**
 * FALSE once a task that is not done has sat too long and is given up on as forgotten business.
 * Blocked work is kept while it waits, up to a limit of its own. Open work is given up on only once
 * it has been open that long, so work that was blocked a long while and can go on at last is not
 * dropped the moment it can (MEM-11). A job may keep open work longer with keepUntil, as a crate
 * errand does from when the crate is out (JOBS-02).
 */
function keepsGoing(brain: NpcBrain, task: Task): boolean {
  if (task.state === 'blocked') {
    task.blockedSince ??= brain.now;
    task.openSince = brain.now;
    return brain.now - task.blockedSince < BLOCKED_GIVE_UP_DS;
  }
  task.blockedSince = undefined;
  const openLimit = (task.openSince ?? task.createdAt) + GIVE_UP_DS;
  return brain.now < Math.max(openLimit, task.keepUntil ?? 0);
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
 * The room someone who has just spoken to the NPC stands in, if it can see them and knows the
 * room; else the room the NPC stands in itself. For an order given with no room named (PLAY-10).
 */
export function speakerRoom(brain: NpcBrain, speaker: string | undefined): string {
  const seen = speaker
    ? brain.peopleInView.find((person) => person.name === speaker)?.place
    : undefined;
  return seen && knowsPlace(brain, seen) ? seen : brain.location;
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
  // An order that may be given with no room named is for the room whoever gave it is standing in,
  // if it can see where that is, else the room it stands in itself: "Then ask for a janitor"
  // (PLAY-10). Spoken across the counter from the Cargo Bay, it is for the Cargo Bay.
  const here =
    !own &&
    !!order &&
    orderTakesHere(order) &&
    !!brain.location &&
    (typeof where !== 'string' ||
      where === WORK_NOWHERE ||
      !knowsPlace(brain, where));
  const room = here ? speakerRoom(brain, toldBy) : where;
  if (!kind || typeof room !== 'string' || !knowsPlace(brain, room)) {
    return null;
  }
  // Work its job's code has just turned down is not taken on by the model's say-so, nor from the
  // words of the line: a call to a mess it said it cannot shift (LOGA-07). The job says so
  // through refusesWork, if it has one; who told it is passed too, since a call turned down is
  // turned down for whoever made it.
  const refuses = jobFor(brain.job).refusesWork;
  if (own && refuses?.(brain, kind, room, toldBy)) {
    return null;
  }
  // Work in the room it is standing in is work it can see for itself. If it sees none, there is
  // none to take on; if it does, it has the task already, and this only says who is waiting on it.
  // Not for a job that cleans: a mess told of in a long hallway may be out of its sight, and the
  // janitor walks the room to look before it closes the task (MEM-07, DESK-08).
  if (
    !jobFor(brain.job).cleans &&
    own &&
    room === brain.location &&
    !findTask(brain, kind, { place: room })
  ) {
    return null;
  }
  // What someone over it tells it to do comes before everything else it has to do.
  const task = addTask(brain, {
    kind,
    place: room,
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
  /**
   * The report lines that were said to this NPC, if known. Only those are read: an order the
   * Captain gave someone else, heard a minute before he spoke to this one, is not its order.
   */
  forMe?: ReadonlySet<string>,
): Task | null {
  const job = jobFor(brain.job);
  // Only what people said, which the report gives in double quotes. And where it is known who
  // told it of the work, only what they said: a room someone else named in the same breath is not
  // the room it was sent to.
  const spoken = report.filter(
    (line) => line.includes('(person ') && (!forMe || forMe.has(line)),
  );
  // Of what they said, only the latest: an order is what was just said, not something said a
  // minute ago and let pass.
  const theirs = toldBy
    ? spoken
        .filter((line) => line.includes(`] ${toldBy} says: `))
        .slice(-ORDER_LINES)
    : [];
  const lines = (theirs.length > 0 ? theirs : spoken).map((line) =>
    (line.match(/"[^"]*"/g) ?? []).join(' ').toLowerCase(),
  );
  // The work is read from the last line that names a room and sounds like work or an order, so
  // a room named in a remark before it ("The Kitchen looks great.") is not where it is sent
  // (MEM-04). With no such line, all of it is read together, as before.
  const sounds = [
    ...Object.values(job.soundsLike ?? {}),
    ...(fromSuperior ? Object.values(ORDER_SOUNDS) : []),
  ];
  // A head told to find out how its staff are doing calls a meeting for it: see jobs/head.ts.
  // That is not an order to go and look at a room, even if one is named, so the clauses that
  // call the meeting are left out. An order in another clause still stands (PARSE-15).
  const read = (line: string) =>
    fromSuperior ? withoutMeetingOrder(brain, line) : line;
  const heard = read(
    lines
      .filter(
        (line) =>
          !!placeNamedIn(brain, read(line)) &&
          sounds.some((words) => words.test(read(line))),
      )
      .pop() ?? lines.join(' '),
  );
  const place = placeNamedIn(brain, heard);
  // An order that needs no room named, given with none, is for the room the speaker stands in, if
  // it can see that, else the one it stands in (PLAY-10).
  if (!place) {
    if (!fromSuperior || !brain.location) {
      return null;
    }
    const asOrder = orderClauses(heard);
    for (const [kind, words] of Object.entries(ORDER_SOUNDS)) {
      if (orderTakesHere(kind) && words.test(asOrder)) {
        // No room named: takeToldWork takes the speaker's room, or its own.
        return takeToldWork(brain, ORDERS[kind], WORK_NOWHERE, toldBy, true);
      }
    }
    return null;
  }
  // The job's own work first: "check the Bar, there is blood everywhere" is a mess to a janitor.
  // From someone it answers to, that is an order it cannot turn down, so a question about the
  // work, being told not to bother, or that it is done already, is not one: those are left to
  // the model. The room may be named in another part of the line.
  const asWork = fromSuperior ? orderClauses(heard) : heard;
  for (const [kind, words] of Object.entries(job.soundsLike ?? {})) {
    if (job.takes?.[kind] && words.test(asWork)) {
      return takeToldWork(brain, job.takes[kind], place, toldBy, fromSuperior);
    }
  }
  if (fromSuperior) {
    // Orders are read, as the job's own work is, from the clauses that are orders: "don't call a
    // janitor for the bar" sends for nobody. A look needs the look word right before the room
    // (orderIn): any other line with "check" or "look" in it is left to the model (MEM-08).
    for (const kind of Object.keys(ORDER_SOUNDS)) {
      if (orderIn(kind, asWork, place, heard)) {
        return takeToldWork(brain, ORDERS[kind], place, toldBy, true);
      }
    }
  }
  return null;
}

/**
 * Work of its own job in a line it heard that was put to nobody in particular, or to everyone
 * there, taken on whoever answers it (PARSE-17): "someone threw up in the bar", said in front of
 * a janitor and a technician nearer the speaker, is the janitor's mess. Only the job's own words
 * and a room named; never an order (that is for whoever it was said to), never a line said to
 * someone else by name, and not a line said to it, which its answer deals with. A question, being
 * told not to bother, or word that it is done already is not work (orderClauses).
 */
export function workOverheard(
  brain: NpcBrain,
  event: SenseEvent,
): Task | null {
  const to = event.details.said_to;
  if (to !== 'group' && to !== 'nobody') {
    return null;
  }
  const job = jobFor(brain.job);
  const heard = orderClauses(String(event.details.message ?? '').toLowerCase());
  const place = placeNamedIn(brain, heard);
  if (!place) {
    return null;
  }
  const speaker = String(event.details.speaker ?? '') || undefined;
  for (const [kind, words] of Object.entries(job.soundsLike ?? {})) {
    if (job.takes?.[kind] && words.test(heard)) {
      return takeToldWork(brain, job.takes[kind], place, speaker, false);
    }
  }
  return null;
}

/** A clause that asks, even typed with no question mark: "is there any blood in the bar". */
const QUESTION_START = /^(is|are|was|were|did|do|does|have|has|any)\b/;
/** A clause that says not to: "no need to clean the bar". Not a bare "not": "it is not cleaned up yet" is still an order. */
const NOT_WANTED = /\b(no need|don'?t|do not|never mind|no more|forget)\b/;
/** A clause that says the work is done: "the bar was a mess but its fine now". */
const DONE_ALREADY =
  /\b(cleaned|clean now|gone|fine now|got it|dealt with|sorted|took care|taken care)\b/;
/** What keeps a clause an order though it has a done word in it: "not cleaned up yet", "still not gone". */
const NOT_YET = /\b(not|isn'?t|wasn'?t|hasn'?t|yet|still)\b/;

/**
 * The parts of what a superior said that can be orders, run together: every clause that is a
 * question, says not to, or says the work is done already, is left out.
 */
export function orderClauses(heard: string): string {
  const clauses = heard
    .split(/(?<=[?])|[.!,;]| but | and then /)
    .map((clause) => clause.replace(/^[\s"]+|[\s"]+$/g, ''))
    .filter((clause) => clause.length > 0);
  // Word that it is done already speaks for the whole line: "the bar was a mess but its fine now".
  if (
    clauses.some(
      (clause) => DONE_ALREADY.test(clause) && !NOT_YET.test(clause),
    )
  ) {
    return '';
  }
  return clauses
    .filter(
      (clause) =>
        !clause.endsWith('?') &&
        !QUESTION_START.test(clause) &&
        !NOT_WANTED.test(clause),
    )
    .join('. ');
}

/** How long (milliseconds) a body that was in a room still counts as in it after it is found outside. */
const NUDGED_OUT_MS = 10000;

/**
 * TRUE if the NPC is in this room, or was until a moment ago. People walk into each other, and a
 * body standing near a door is pushed a tile out of the room and is back in it the next second.
 * That is not leaving: whoever is waiting there stays where it is, and does not set off for the
 * room all over again.
 */
export function stillIn(brain: NpcBrain, place: string): boolean {
  return (
    brain.location === place ||
    (brain.leftPlace?.place === place &&
      Date.now() - brain.leftPlace.at < NUDGED_OUT_MS)
  );
}

/**
 * Words that, among the three before a room's name, set that room aside: it is the room not
 * meant ("Forget the Kitchen", "the Bar, not the Chapel", "ran from the Bar into the Kitchen").
 */
const SET_ASIDE = /\b(not|forget|leave|instead of|from)\b/;

/**
 * The room the NPC knows that these words name, if they name one. The words must be in lower case.
 *
 * Of two rooms named, the one meant is the first that is not set aside (MEM-04): "Check the Bar,
 * then come back to the Library" is the Bar, and "Forget the Kitchen, there is blood all over
 * the Bar" is the Bar. A name inside a longer one is not a room of its own: "Medbay Central" is
 * not "Medbay". If every room named is set aside, the first is taken all the same: "I came from
 * the Bar, there is blood there" names the Bar.
 */
export function placeNamedIn(brain: NpcBrain, heard: string): string | undefined {
  const found: { name: string; start: number; end: number }[] = [];
  for (const name of allPlaces(brain)) {
    const pattern = new RegExp(
      `\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`,
      'g',
    );
    for (const match of heard.matchAll(pattern)) {
      const start = match.index ?? 0;
      found.push({ name, start, end: start + match[0].length });
    }
  }
  const named = found
    .filter(
      (one) =>
        !found.some(
          (other) =>
            other.end - other.start > one.end - one.start &&
            other.start <= one.start &&
            other.end >= one.end,
        ),
    )
    .sort((a, b) => a.start - b.start);
  const meant = named.find(
    (one) =>
      !SET_ASIDE.test(
        heard
          .slice(0, one.start)
          .split(/[^a-z']+/)
          .filter(Boolean)
          .slice(-3)
          .join(' '),
      ),
  );
  return (meant ?? named[0])?.name;
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
        // Then a wait it has asked for: it has knocked at a door and sent word that it is there,
        // and whoever comes to open it has to find it standing there. Ranked with its other
        // calls, the wait lost to every one of them that it could walk to, so a janitor with
        // two calls asked at each door in turn and was never at either when it was opened.
        Number(isAskedWait(b)) - Number(isAskedWait(a)) ||
        // Then what someone is waiting on, if it can be got on with: a person who has been called
        // to a mess goes to it, and does not finish sweeping the hallway first.
        Number(isCalledFor(b)) - Number(isCalledFor(a)) ||
        // Of those, a crate its head has sent it to collect comes first. Its whole section is
        // waiting on what is in that crate, likely as not what it needs for the mess it was
        // called to, and cargo goes on holding it until someone comes.
        Number(isCollecting(b)) - Number(isCollecting(a)) ||
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

/** TRUE if a piece of work has the NPC waiting where it asked someone to come to it: see Plan. */
function isAskedWait(work: { task: Task; plan: Plan }): boolean {
  return !work.plan.ready && !!work.plan.wait && !!work.plan.asked;
}

/** TRUE if someone asked for a piece of work, or called the NPC to it, and it can be got on with now. */
function isCalledFor(work: { task: Task; plan: Plan }): boolean {
  return work.plan.ready && work.task.urgency === 'asked';
}

/** TRUE if a piece of work is collecting a crate from cargo for its head (see jobs/pickups.ts), and can be got on with now. */
function isCollecting(work: { task: Task; plan: Plan }): boolean {
  return work.plan.ready && work.task.kind === 'collect';
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

/** Words that say a piece of work is done, whoever words it. */
const DONE_WORDS = /\b(done|finished|clean|cleaned|sorted|taken care)\b/;

/**
 * Notes what the NPC has just said, which tells whoever was waiting to hear a task was done, if a
 * line was to them and said it was done. Any other line, or a done line to someone else, leaves
 * them still to be told.
 */
export function afterSaying(brain: NpcBrain, said: string[]): void {
  const job = jobFor(brain.job);
  for (const task of wordOwed(brain)) {
    const asker = task.askedBy ?? '';
    const first = asker.split(' ')[0];
    const doneLine = `${first}, ${job.sayDone?.(task) ?? 'that is done'}.`;
    const own = job.sayDone?.(task)?.toLowerCase();
    // The model is apt to say "Captain, ..." to the Captain or a head, not their name.
    const title = brain.peopleInView
      .find((person) => person.name === asker)
      ?.job.toLowerCase();
    const told = said.some((line) => {
      if (line === doneLine) {
        return true;
      }
      const lower = line.toLowerCase();
      const words = lower.split(/[^a-z']+/);
      const toThem =
        words.includes(first.toLowerCase()) ||
        (!!title && lower.includes(title));
      return (
        toThem && ((!!own && lower.includes(own)) || DONE_WORDS.test(lower))
      );
    });
    if (told) {
      task.reported = true;
    }
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
