/**
 * The thinking half of crew NPCs. It runs entirely in the owning player's window: it turns sense
 * events from the server into prompts for the player's local Ollama, and turns the LLM's tool
 * calls into requests to the server. The server never contacts the LLM itself.
 */
import { drive, LEAD_PAUSE_MS, noteResult, type Step } from './driver';
import { jobFor } from './jobs';
import {
  addNote,
  describeMemory,
  observe,
  recordKnownPlaces,
  recordLocator,
  recordStorage,
} from './memory';
import { availableOptions, describeOptions } from './options';
import { pickPersonCard } from './person';
import {
  buildReplySchema,
  buildSystemPrompt,
  parseReply,
  replyForHistory,
  serverToolName,
} from './prompt';
import { describeFeeling, shiftFeeling } from './relationships';
import { describeSituation, describeView } from './situation';
import {
  afterSaying,
  describeTask,
  describeWorkTold,
  syncTasks,
  takeToldWork,
  workInWords,
  workTold,
} from './tasks';
import type {
  Action,
  ChatMessage,
  Decision,
  Npc,
  NpcBrain,
  SenseEvent,
} from './types';

/** The player's own Ollama. */
export const OLLAMA_URL = 'http://127.0.0.1:11434';
const PREFERRED_MODEL = 'qwen3.5:9b';
/** How long one LLM call may take before it is abandoned. */
const THINK_TIMEOUT_MS = 60000;
/** Shortest pause between two LLM calls for the same NPC. */
const MIN_THINK_GAP_MS = 1500;
/** Events older than this (in deciseconds of server time) are remembered but do not wake the LLM. */
const STALE_EVENT_DS = 150;
const NEWLINE = String.fromCharCode(10);
/** How long after one brain log message the next is sent. */
const LOG_SEND_GAP_MS = 300;
/** An NPC with company passes a remark of its own accord no sooner than this, and up to this much later. */
const REMARK_GAP_MIN_MS = 60000;
const REMARK_GAP_SPREAD_MS = 90000;
/** It does not pass a remark if it has said anything at all this recently. */
const REMARK_QUIET_MS = 30000;
/** How many of the things an NPC has said are kept, and for how long they count as said lately. */
const SAID_LATELY_KEPT = 8;
const SAID_LATELY_MS = 600000;
/** How much of a line's wording has to match an earlier one for it to be the same line over again. */
const SAME_LINE_SHARE = 0.6;
/** The most lines of events kept waiting for the next time the LLM is asked. */
const PENDING_MAX_LINES = 30;
/**
 * How many times an NPC will speak in reply to the same speaker before it stops being woken by them.
 * The LLM is told to stay quiet unless it has something to add; this is the backstop for when it does not,
 * so two NPCs cannot talk in circles forever.
 */
const MAX_REPLIES_PER_TALK = 6;
/** A speaker who has been quiet this long (deciseconds of server time) starts a fresh conversation. */
const TALK_RESET_DS = 300;
/** The server refuses speech sooner than this after the last, so wait it out before thinking again. */
const SAY_COOLDOWN_MS = 4200;
const HISTORY_MAX_MESSAGES = 24;
/** Higher is more varied; much above this the model starts leaving its own name out of greetings. */
const TEMPERATURE = 0.7;
/** Most tokens the LLM may spend on one reply. */
const REPLY_MAX_TOKENS = 600;
/**
 * How many tokens of prompt and reply the model is given room for. Ollama's own default is 4096,
 * which an NPC's rules, memory, history and report outgrow. Past it the reply is cut off after a
 * few words, the NPC does nothing, and it shows as an NPC standing about.
 */
const CONTEXT_TOKENS = 8192;
/** The most lines of events sent in one report. Older ones are left out: they are stale by then. */
const REPORT_MAX_LINES = 10;
/** The most an NPC's kept history may come to, in characters. The oldest exchanges go first. */
const HISTORY_MAX_CHARS = 2500;

type Act = (action: string, payload?: object) => void;

const brains = new Map<string, NpcBrain>();
/** Ids of NPCs waiting for the LLM. One GPU serves one request at a time, so they take turns. */
const queue: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
let act: Act | null = null;
let model = PREFERRED_MODEL;
let running = false;
/** Goes up each time the window closes, so replies that arrive afterwards are thrown away. */
let session = 0;
let inFlight: AbortController | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// --- Hooks for the window ---------------------------------------------------

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersion(): number {
  return version;
}

function notify(): void {
  version++;
  for (const listener of listeners) {
    listener();
  }
}

export function setAct(nextAct: Act): void {
  act = nextAct;
}

export function getBrain(id: string): NpcBrain | undefined {
  return brains.get(id);
}

export function getModel(): string {
  return model;
}

/** Picks which installed model to use. */
export function chooseModel(installed: string[]): void {
  if (installed.length > 0 && !installed.includes(PREFERRED_MODEL)) {
    model = installed[0];
  } else {
    model = PREFERRED_MODEL;
  }
}

/** Forgets everything and stops any call in progress. Called when the window closes. */
export function stopSession(): void {
  session++;
  act = null;
  inFlight?.abort();
  inFlight = null;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  queue.length = 0;
  brains.clear();
  running = false;
}

// --- Sense events in --------------------------------------------------------

/** Folds new sense events from the server into each NPC's brain and wakes the LLM where needed. */
export function ingest(npcs: Npc[], now: number): void {
  let changed = false;
  for (const npc of npcs) {
    let brain = brains.get(npc.id);
    if (!brain) {
      brain = {
        id: npc.id,
        name: npc.name,
        job: npc.job,
        card: pickPersonCard(npc.name),
        awake: !!npc.awake,
        location: npc.location,
        peopleInView: [],
        thingsInView: [],
        holding: [],
        places: new Map(),
        people: new Map(),
        feelings: new Map(),
        tasks: [],
        nextTaskId: 1,
        now,
        // Anything the server says was already dealt with is history, not news.
        lastSeq: npc.acked_seq,
        history: [],
        notes: [],
        seenHandles: new Set(),
        pending: [],
        wake: false,
        chained: 0,
        talks: new Map(),
        pendingSpeakers: new Set(),
        lastSayAt: 0,
        status: 'idle',
        lastThinkEnd: 0,
        placeKind: npc.place_kind,
        walking: false,
        resting: false,
        exploredEverything: false,
        storageHere: 0,
        cleaningTool: null,
        cleanableMesses: [],
        messPlaces: [],
        workablePlaces: [],
        mopNeedsWater: false,
        sinkInView: false,
        shutIn: false,
        doorOpen: false,
        doorHeld: false,
        doorHeldOut: false,
        cameFrom: null,
        letInBy: null,
        inTheWay: null,
        doorAsked: null,
        letInAsks: {},
        saidLately: [],
        tryLeavingAt: 0,
        nextRemarkAt: 0,
        askedCargoAt: 0,
        suppliesSentAt: null,
        driveAfter: 0,
        lastAct: null,
        failures: new Map(),
        mustSay: null,
        sayingNow: false,
        heldSince: 0,
        lastSpokenToAt: 0,
        grenadeMesses: 0,
        dryMop: false,
        post: null,
        orderable: [],
        orderPending: false,
        crateWaiting: null,
        hasPda: false,
        messageOwed: null,
        tidyTodo: 0,
        freight: null,
        mailTold: {},
        areaMesses: {},
        janitorsOnPda: [],
        blockedPlaces: [],
        janitorCalls: {},
        askedCargo: false,
        doing: null,
        toldOfMess: new Map(),
        hasLocator: false,
        locatorUsed: false,
        supplyPlaces: [],
        supplyPlacesSearched: new Set(),
        loggedCard: '',
        inPlaceSince: now,
        lastActiveAt: Date.now(),
      };
      brains.set(npc.id, brain);
      changed = true;
    }
    brain.name = npc.name;
    brain.job = npc.job;
    brain.awake = !!npc.awake;
    if (brain.location !== npc.location) {
      brain.inPlaceSince = now;
      brain.cameFrom = brain.location || brain.cameFrom;
    }
    brain.location = npc.location;
    brain.peopleInView = npc.people_in_view ?? [];
    brain.thingsInView = npc.things_in_view ?? [];
    brain.holding = npc.holding ?? [];
    brain.placeKind = npc.place_kind;
    brain.walking = !!npc.walking;
    brain.resting = !!npc.resting;
    brain.exploredEverything = !!npc.explored_everything;
    brain.storageHere = npc.storage_here ?? 0;
    brain.cleaningTool = npc.cleaning_tool ?? null;
    brain.cleanableMesses = npc.cleanable_messes ?? [];
    brain.messPlaces = npc.mess_places ?? [];
    brain.workablePlaces = npc.workable_mess_places ?? [];
    brain.mopNeedsWater = !!npc.mop_needs_water;
    brain.sinkInView = !!npc.sink_in_view;
    brain.shutIn = !!npc.shut_in;
    brain.doorOpen = !!npc.door_open;
    brain.doorHeld = !!npc.door_held;
    brain.doorHeldOut = !!npc.door_held_out;
    brain.letInBy = npc.let_in_by ?? null;
    brain.grenadeMesses = npc.grenade_messes ?? 0;
    brain.doing = npc.doing ?? null;
    brain.dryMop = !!npc.dry_mop;
    brain.post = npc.post ?? null;
    brain.orderable = npc.orderable ?? [];
    brain.orderPending = !!npc.order_pending;
    brain.crateWaiting = npc.crate_waiting ?? null;
    brain.hasPda = !!npc.has_pda;
    brain.messageOwed = npc.message_owed ?? null;
    brain.tidyTodo = npc.tidy?.todo ?? 0;
    brain.freight = npc.freight
      ? {
          shuttleDocked: !!npc.freight.shuttle_docked,
          toUnload: npc.freight.to_unload ?? 0,
          emptiesAboard: npc.freight.empties_aboard ?? 0,
          mailCrate: !!npc.freight.mail_crate,
          mailFor: npc.freight.mail_for ?? [],
          emptyCrates: npc.freight.empty_crates ?? 0,
        }
      : null;
    brain.areaMesses = npc.work_area_messes ?? {};
    brain.janitorsOnPda = npc.pda_janitors ?? [];
    brain.blockedPlaces = npc.blocked_places ?? [];
    if (brain.cleaningTool) {
      brain.askedCargo = false;
      brain.suppliesSentAt = null;
    }
    brain.hasLocator = !!npc.has_locator;
    brain.now = now;
    observe(brain, npc, now);

    const startSeq = brain.lastSeq;
    for (const event of npc.events) {
      if (event.seq <= brain.lastSeq) {
        continue;
      }
      brain.lastSeq = event.seq;
      if (event.kind === 'storage_seen') {
        recordStorage(brain, event);
      }
      if (event.details.places) {
        recordKnownPlaces(brain, event);
      }
      if (event.details.tool === 'locate') {
        recordLocator(brain, event);
      }
      if (event.kind === 'pda_message') {
        // What a message means depends on whose PDA it is.
        jobFor(brain.job).readsMessage?.(
          brain,
          String(event.details.speaker ?? ''),
          String(event.details.message ?? ''),
          event.at,
          String(event.details.job ?? ''),
        );
      }
      if (event.kind === 'speech_heard' && event.details.source === 'person') {
        jobFor(brain.job).overhears?.(brain, event);
      }
      // A door is being held open for it: whatever it had given up on is worth trying this instant.
      if (event.details.door_held) {
        brain.failures.clear();
        brain.tryLeavingAt = 0;
      }
      if (event.details.in_the_way) {
        brain.inTheWay = {
          handle: String(event.details.in_the_way),
          at: Date.now(),
        };
      }
      noteResult(brain, event);
      const line = describeEvent(event, brain);
      brain.pending.push(line);
      // What nobody has been told about by the time more has happened is old news.
      if (brain.pending.length > PENDING_MAX_LINES) {
        brain.pending.splice(0, brain.pending.length - PENDING_MAX_LINES);
      }
      const stale = now - event.at > STALE_EVENT_DS;
      if (!stale && shouldWake(event, brain, line)) {
        brain.wake = true;
      }
    }
    if (brain.lastSeq > startSeq) {
      changed = true;
      act?.('ack', { npc: brain.id, seq: brain.lastSeq });
    }
    // With the body's state and the latest events folded in, the task list is brought up to date.
    syncTasks(brain);
    // The body gets on with its work. Nothing here waits on the LLM.
    const step = drive(
      brain,
      (action) => runTool(brain, action),
      (fallback) => {
        brain.mustSay = fallback;
        brain.wake = true;
      },
    );
    if (step) {
      logRoutine(brain, step);
      changed = true;
    }
    passRemark(brain);
    if (brain.wake && brain.awake && brain.status === 'idle') {
      brain.status = 'queued';
      queue.push(brain.id);
      stopToTalk(brain);
      changed = true;
    }
  }
  if (changed) {
    notify();
    pump();
  }
}

/**
 * Tells the body to stand still, because it is about to talk with someone. The words take the LLM
 * a few seconds, and a body that keeps walking meanwhile says them over its shoulder from the far
 * end of the hallway. It turns to whoever spoke to it, or failing that whoever is there.
 */
function stopToTalk(brain: NpcBrain): void {
  const person =
    brain.peopleInView.find((seen) => brain.pendingSpeakers.has(seen.handle)) ??
    brain.peopleInView[0];
  if (person) {
    act?.('tool_call', {
      npc: brain.id,
      tool: 'hold',
      args: { person: person.handle },
    });
  }
}

/** The words of a line that carry what it says, for telling whether two lines say the same thing. */
function gist(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((word) => word.length > 3),
  );
}

/** TRUE if the NPC has said much the same thing lately. People do not say the same line twice. */
function saidBefore(brain: NpcBrain, text: string): boolean {
  const words = gist(text);
  if (words.size === 0) {
    return false;
  }
  return brain.saidLately.some((said) => {
    if (Date.now() - said.at > SAID_LATELY_MS) {
      return false;
    }
    const before = gist(said.text);
    const shared = [...words].filter((word) => before.has(word)).length;
    return shared / Math.min(words.size, before.size || 1) >= SAME_LINE_SHARE;
  });
}

/** Remembers something the NPC has just said. */
function noteSaid(brain: NpcBrain, text: string): void {
  brain.saidLately.push({ text, at: Date.now() });
  if (brain.saidLately.length > SAID_LATELY_KEPT) {
    brain.saidLately.shift();
  }
}

/**
 * Lets an NPC with company say something of its own accord now and then: a remark on its work, on
 * what it has noticed, or to whoever is there. People working near each other talk. Without this
 * the crew only ever speak when spoken to, which is what makes them machines.
 *
 * It is offered, not required: the LLM may say nothing. And it is paced, a minute or two apart at
 * the least, so that it never becomes narration.
 */
function passRemark(brain: NpcBrain): void {
  const now = Date.now();
  if (brain.peopleInView.length === 0) {
    brain.nextRemarkAt = 0;
    return;
  }
  if (brain.nextRemarkAt === 0) {
    brain.nextRemarkAt = now + remarkGap();
    return;
  }
  if (
    now < brain.nextRemarkAt ||
    !brain.awake ||
    brain.wake ||
    brain.status !== 'idle' ||
    now - brain.lastSayAt < REMARK_QUIET_MS
  ) {
    return;
  }
  brain.nextRemarkAt = now + remarkGap();
  brain.pending.push(
    `You have company and a quiet moment. If you feel like it, say something to someone here in your own voice: a remark on what you are doing, on something you have noticed, or a question about them. It is small talk between people who work near each other: do not tell them to leave, to hurry up, or to ask you for something. Do not introduce yourself to anyone you have already met.${
      brain.saidLately.length > 0
        ? ` You have already said: ${brain.saidLately
            .slice(-3)
            .map((said) => `"${said.text}"`)
            .join(' ')} Say nothing like any of that again.`
        : ''
    } If you would sooner get on with things, say nothing.`,
  );
  brain.wake = true;
}

/** How long until an NPC may next speak of its own accord: a different wait each time. */
function remarkGap(): number {
  return REMARK_GAP_MIN_MS + Math.random() * REMARK_GAP_SPREAD_MS;
}

/** Writes a sense event as one line of the report the LLM reads. */
function describeEvent(event: SenseEvent, brain: NpcBrain): string {
  const handle = event.details.handle;
  let line = `[${event.time}] ${event.text}`;
  if (event.kind === 'person_in_view' && handle) {
    const seenBefore = brain.seenHandles.has(handle);
    brain.seenHandles.add(handle);
    line += seenBefore
      ? ` (person ${handle}; you have seen them before)`
      : ` (person ${handle}; you have not seen them before)`;
  } else if (event.kind === 'speech_heard') {
    const distance = event.details.distance;
    const where =
      typeof distance === 'number' ? `${distance} tiles away` : 'nearby';
    if (event.details.source === 'device') {
      line += ` (a machine, ${where})`;
    } else if (handle) {
      line += ` (person ${handle}, ${where})`;
    } else {
      line += ` (someone you cannot see, ${where})`;
    }
  }
  return line;
}

/**
 * Decides whether an event is worth an LLM call. The LLM is the NPC's voice, so it is called when
 * there is someone to talk to: a person seen for the first time, or someone speaking to the NPC.
 * How the body's own actions went, and what its PDA says, is for the driver.
 */
function shouldWake(event: SenseEvent, brain: NpcBrain, line: string): boolean {
  switch (event.kind) {
    case 'person_in_view':
      return line.includes('you have not seen them before');
    case 'speech_heard':
      // Machines chatter constantly; their words are kept for context only.
      if (event.details.source !== 'person') {
        return false;
      }
      // Speech wakes the LLM when it is plainly meant for this NPC: its name was used, the speaker
      // is right beside it, or the speaker is the only other person there. In a group, unnamed
      // talk is heard and remembered but not answered. Without this a roomful of NPCs never
      // stops talking.
      if (!mentionsName(brain, event) && brain.peopleInView.length > 1) {
        return false;
      }
      brain.lastSpokenToAt = Date.now();
      return hearSpeaker(brain, event);
    default:
      return false;
  }
}

/** The words of a name or job title that are long enough to pick out in speech. */
function nameParts(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length > 2);
}

/** How close (in tiles) a speaker must be for unnamed talk to count as said to this NPC. */
const SPOKEN_TO_DISTANCE = 1;

/**
 * TRUE if what was said is addressed to this NPC. It is if it includes the NPC's first or last
 * name. Failing that, and provided nobody else in view is named, it is if the speaker is standing
 * right beside the NPC, or, for crew who serve at a post, if it uses their job ("Hey, cargo
 * technician").
 */
function mentionsName(brain: NpcBrain, event: SenseEvent): boolean {
  const heard = String(event.details.message ?? '').toLowerCase();
  if (nameParts(brain.name).some((part) => heard.includes(part))) {
    return true;
  }
  if (namesSomeoneElse(brain, event)) {
    return false;
  }
  // Someone standing right beside the NPC and talking, with nobody else named, is talking to it.
  // Left unanswered because a third person happened to be in view, they would be right to feel ignored.
  const distance = event.details.distance;
  if (typeof distance === 'number' && distance <= SPOKEN_TO_DISTANCE) {
    return true;
  }
  return (
    !!brain.post && nameParts(brain.job).some((part) => heard.includes(part))
  );
}

/** TRUE if what was said names someone in view other than this NPC and the speaker. */
function namesSomeoneElse(brain: NpcBrain, event: SenseEvent): boolean {
  const heard = String(event.details.message ?? '').toLowerCase();
  return brain.peopleInView.some(
    (person) =>
      person.name !== event.details.speaker &&
      nameParts(person.name).some((part) => heard.includes(part)),
  );
}

/** Notes that a person spoke and returns whether this NPC is still willing to be woken by them. */
function hearSpeaker(brain: NpcBrain, event: SenseEvent): boolean {
  const speaker = event.details.handle ?? event.details.speaker ?? 'someone';
  let talk = brain.talks.get(speaker);
  if (!talk || event.at - talk.lastHeardAt > TALK_RESET_DS) {
    talk = { replies: 0, lastHeardAt: event.at };
    brain.talks.set(speaker, talk);
  }
  talk.lastHeardAt = event.at;
  // Two NPCs will answer each other for as long as they are let. One reply each is a conversation;
  // more is a loop. A player gets a proper back-and-forth.
  const fellow = [...brains.values()].some(
    (other) => other !== brain && other.name === event.details.speaker,
  );
  if (talk.replies >= (fellow ? 1 : MAX_REPLIES_PER_TALK)) {
    return false;
  }
  brain.pendingSpeakers.add(speaker);
  return true;
}

// --- LLM calls out ----------------------------------------------------------

/** Starts the next waiting NPC's LLM call, if the LLM is free. */
function pump(): void {
  if (running || queue.length === 0) {
    return;
  }
  const brain = brains.get(queue[0]);
  if (!brain) {
    queue.shift();
    pump();
    return;
  }
  const wait =
    Math.max(
      brain.lastThinkEnd + MIN_THINK_GAP_MS,
      brain.lastSayAt + SAY_COOLDOWN_MS,
    ) - Date.now();
  if (wait > 0) {
    if (retryTimer === null) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        pump();
      }, wait);
    }
    return;
  }
  queue.shift();
  running = true;
  void think(brain);
}

/** Asks the LLM what one NPC does about its pending sense reports, then carries out its tool calls. */
async function think(brain: NpcBrain): Promise<void> {
  const mySession = session;
  const everything = brain.pending.splice(0);
  // A long backlog is mostly things that no longer matter. Only the latest of it is sent.
  const report =
    everything.length > REPORT_MAX_LINES
      ? [
          '(Earlier events are left out.)',
          ...everything.slice(-REPORT_MAX_LINES),
        ]
      : everything;
  const speakers = [...brain.pendingSpeakers];
  // Every report opens with where the body is and what it can see, and ends with what it can do.
  const options = availableOptions(
    brain,
    speakers.length > 0,
    report.filter((line) => line.includes(' says: ')).join(' '),
  );
  const trigger = [
    ...describeView(brain),
    ...report,
    ...describeSituation(brain),
    ...(speakers.length > 0
      ? [
          'Someone has just spoken near you. If it was to you, answer in "say".',
          ...[describeWorkTold(brain)].filter(Boolean),
        ]
      : []),
    ...describeOptions(options),
  ].join(NEWLINE);
  brain.pendingSpeakers.clear();
  brain.wake = false;
  // A line the driver needs said this turn. If the LLM gives none, this is said as it stands.
  const mustSay = brain.mustSay;
  brain.mustSay = null;
  brain.sayingNow = mustSay !== null;
  brain.status = 'thinking';
  // It may have waited its turn for the LLM a good while. It stands still from here until it has spoken.
  stopToTalk(brain);
  notify();

  const userMessage: ChatMessage = { role: 'user', content: trigger };
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(
        brain.name,
        brain.job,
        brain.card,
        brain.notes,
        describeMemory(brain, brain.now),
        brain.post,
      ),
    },
    ...brain.history,
    userMessage,
  ];
  const started = Date.now();
  const decision: Decision = {
    time: new Date().toLocaleTimeString(),
    trigger,
    calls: [],
    sent: messages,
    ms: 0,
  };

  let rawReply = '';
  try {
    // How it feels is asked about whoever has just spoken to it, and nobody else: someone merely
    // walking into view has done nothing to like or dislike.
    const feelAbout = brain.peopleInView
      .map((person) => person.handle)
      .filter((handle) => speakers.includes(handle));
    // Likewise it is asked whether it has been told of work only when someone has spoken to it.
    const told = feelAbout.length > 0 ? workTold(brain) : null;
    let answer = await callOllama(
      messages,
      buildReplySchema(options, true, feelAbout, told),
    );
    let reply = answer.text;
    decision.promptTokens = answer.promptTokens;
    if (mySession !== session) {
      return;
    }
    // A reply cut off by the length limit is not valid JSON, and it is nearly always the "think"
    // part that ran on. Ask once more without it.
    if (!isCompleteReply(reply)) {
      answer = await callOllama(
        messages,
        buildReplySchema(options, false, feelAbout, told),
      );
      reply = answer.text;
      if (mySession !== session) {
        return;
      }
    }
    decision.ms = Date.now() - started;
    rawReply = reply;
    // With nobody in view and nobody just heard, speech would be talking to an empty room.
    const alone = brain.peopleInView.length === 0 && speakers.length === 0;
    // Nor is anything said of its own accord that it has said before: a remark made twice is a
    // broken record. An answer to someone, or a line its work calls for, is said regardless.
    const unprompted = speakers.length === 0 && !mustSay;
    const actions = parseReply(reply).filter(
      (action) =>
        action.tool !== 'say' ||
        !(alone || (unprompted && saidBefore(brain, String(action.text ?? '')))),
    );
    if (mustSay && !alone && !actions.some((action) => action.tool === 'say')) {
      actions.unshift({ tool: 'say', text: mustSay });
    }
    let savedNote = '';
    let feltChange: Action | null = null;
    // Whoever spoke is who told it of any work, and who will want to hear when it is done.
    const toldBy = brain.peopleInView.find((seen) =>
      feelAbout.includes(seen.handle),
    )?.name;
    let tookWork = false;
    let ledSomeone = false;
    for (const action of actions) {
      if (action.tool === 'remember') {
        // A note that repeats one the NPC already has is dropped, and not shown as a decision.
        savedNote = addNote(brain.notes, String(action.note ?? ''));
        if (!savedNote) {
          continue;
        }
      } else if (action.tool === 'feel') {
        // A feeling is kept by name, since handles are only good for as long as this window is open.
        const person = brain.peopleInView.find(
          (seen) => seen.handle === action.person,
        );
        const feeling =
          person &&
          shiftFeeling(brain, person.name, action.change, action.why);
        // A change that did not count is dropped, and not shown as a decision.
        if (!person || !feeling) {
          continue;
        }
        feltChange = action;
        decision.calls.push(
          `feel(${person.name}: ${action.change}, now "${describeFeeling(brain, person.name)}"; ${feeling.why})`,
        );
        continue;
      } else if (action.tool === 'work') {
        const task = takeToldWork(brain, action.what, action.where, toldBy);
        // Work that is not this job's, or is not in any room aboard, is not taken on.
        if (task) {
          tookWork = true;
          decision.calls.push(`work(${describeTask(brain, task)})`);
        }
        continue;
      } else {
        // Having agreed to lead someone, the body does not turn round and go back to work the
        // moment it arrives.
        if (action.tool === 'go_to') {
          ledSomeone = true;
        }
        // What it agrees to has to be something that was asked for.
        const lastHeard =
          report
            .filter(
              (line) => line.includes('(person ') && line.includes(' says: '),
            )
            .at(-1) ?? '';
        if (jobFor(brain.job).agrees?.(brain, action, lastHeard) === false) {
          decision.calls.push(
            `${formatAction(action)} [nothing said called for it: not done]`,
          );
          continue;
        }
        // An order is for whoever asked. The body would otherwise take it to be for whoever it
        // last heard, who may be someone else talking across the room.
        if (action.tool === 'order') {
          const asker = brain.peopleInView.find((seen) =>
            feelAbout.includes(seen.handle),
          );
          if (asker) {
            action.for = asker.handle;
          }
        }
        runTool(brain, action);
      }
      decision.calls.push(formatAction(action));
    }
    // If it was told of work in so many words and did not say so, the work goes on its list anyway.
    if (told && !tookWork) {
      const caught = workInWords(brain, report, toldBy);
      if (caught) {
        tookWork = true;
        decision.calls.push(
          `work(${describeTask(brain, caught)}) [caught from what was said]`,
        );
      }
    }
    // Leading someone, it waits with them a while on arrival. Going somewhere because it was told
    // of work there is not leading anyone, and it gets straight on.
    if (ledSomeone && !tookWork) {
      brain.driveAfter = Date.now() + LEAD_PAUSE_MS;
    }
    // History keeps what happened, not the snapshot of surroundings, which is stale by the next turn.
    brain.history.push(
      { role: 'user', content: report.join('\n') },
      {
        role: 'assistant',
        content: replyForHistory(actions, savedNote, feltChange),
      },
    );
    if (actions.some((action) => action.tool === 'say')) {
      brain.lastSayAt = Date.now();
      for (const action of actions) {
        if (action.tool === 'say') {
          noteSaid(brain, String(action.text ?? ''));
        }
      }
      jobFor(brain.job).afterSaying?.(brain, mustSay);
      // Anyone in view who was waiting to hear that a task was done has now been told.
      afterSaying(brain);
      // Having spoken up about a mess here, it need not be prompted to again for a while.
      if (brain.thingsInView.some((thing) => thing.kind === 'mess')) {
        brain.toldOfMess.set(brain.location, brain.now);
      }
      // Speaking after hearing someone counts as a reply to them.
      for (const speaker of speakers) {
        const talk = brain.talks.get(speaker);
        if (talk) {
          talk.replies++;
        }
      }
    }
    trimHistory(brain);
  } catch (error) {
    if (mySession !== session) {
      return;
    }
    decision.ms = Date.now() - started;
    decision.error = error instanceof Error ? error.message : String(error);
    // Nor must it leave the body deaf: a plain request for what its job provides is still taken.
    // Only the last thing said counts. Anything before it was either dealt with or let pass.
    const heard =
      report
        .filter((line) => line.includes('(person ') && line.includes(' says: '))
        .at(-1) ?? '';
    const request =
      speakers.length > 0 ? jobFor(brain.job).hears?.(brain, heard) : null;
    if (request) {
      const asker = brain.peopleInView.find((seen) =>
        speakers.includes(seen.handle),
      );
      if (request.tool === 'order' && asker) {
        request.for = asker.handle;
      }
      runTool(brain, request);
      runTool(brain, { tool: 'say', text: 'I will see to it.' });
      decision.calls.push(`${formatAction(request)} [made out without the LLM]`);
      brain.lastSayAt = Date.now();
    }
    // The LLM being down must not leave the body dumb: what had to be said is said plainly.
    if (mustSay && brain.peopleInView.length > 0) {
      runTool(brain, { tool: 'say', text: mustSay });
      decision.calls.push(`say(${JSON.stringify(mustSay)}) [the LLM gave none]`);
      brain.lastSayAt = Date.now();
      jobFor(brain.job).afterSaying?.(brain, mustSay);
      afterSaying(brain);
    }
    // Keep what happened, so the LLM still learns of it next time, but not what was said: the moment
    // to answer that has gone, and left in, it would be heard as said again every time after.
    brain.pending.unshift(...report.filter((line) => !line.includes(' says: ')));
  }

  brain.sayingNow = false;
  logDecision(brain, decision, rawReply);
  brain.lastDecision = decision;
  brain.lastThinkEnd = Date.now();
  brain.lastActiveAt = Date.now();
  brain.status = 'idle';
  running = false;
  // More may have happened while the LLM was busy.
  if (brain.wake && brain.awake) {
    brain.status = 'queued';
    queue.push(brain.id);
    stopToTalk(brain);
  }
  notify();
  pump();
}

/**
 * Sends the server a record of a decision for the round's crew brain log. Without this, what the
 * LLM was told and what it answered would exist only in this window.
 */
function logDecision(
  brain: NpcBrain,
  decision: Decision,
  rawReply: string,
): void {
  // The fixed part of the prompt is long and rarely changes, so it is logged only when it does.
  const card = buildSystemPrompt(
    brain.name,
    brain.job,
    brain.card,
    [],
    [],
    brain.post,
  );
  if (card !== brain.loggedCard) {
    brain.loggedCard = card;
    act?.('brain_log', { npc: brain.id, kind: 'card', text: card });
  }
  // Two large messages sent in the same millisecond collide on the way to the server.
  const send = act;
  const record = {
    npc: brain.id,
    kind: 'decision',
    trigger: decision.trigger,
    // What the NPC had in mind at the time: its notes and what it remembers of the station.
    context: [
      ...brain.notes.map((note) => `note: ${note}`),
      ...describeMemory(brain, brain.now),
    ].join(NEWLINE),
    reply: rawReply,
    error: decision.error ?? '',
    ms: decision.ms,
    tokens: decision.promptTokens ?? 0,
  };
  setTimeout(() => send?.('brain_log', record), LOG_SEND_GAP_MS);
}

/** TRUE if the reply is whole JSON, not one cut off partway through. */
function isCompleteReply(reply: string): boolean {
  try {
    JSON.parse(reply);
    return true;
  } catch {
    return false;
  }
}

/** Sends one chat request to Ollama. Returns the text of its reply and how many tokens the prompt came to. */
async function callOllama(
  messages: ChatMessage[],
  schema: object,
): Promise<{ text: string; promptTokens: number }> {
  const controller = new AbortController();
  inFlight = controller;
  const timeout = setTimeout(() => controller.abort(), THINK_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        // Thinking mode spends the whole reply budget on reasoning and adds seconds; decisions here are simple.
        think: false,
        keep_alive: '30m',
        options: {
          temperature: TEMPERATURE,
          num_predict: REPLY_MAX_TOKENS,
          num_ctx: CONTEXT_TOKENS,
        },
        messages,
        format: schema,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Ollama answered with HTTP ${response.status}: ${await readError(response)}`,
      );
    }
    const body: {
      message?: { content?: string };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    } = await response.json();
    const promptTokens = body.prompt_eval_count ?? 0;
    // A reply that stopped for length well short of its own budget ran out of context, not words.
    // Asking again would only do the same, so it is reported as what it is.
    if (
      body.done_reason === 'length' &&
      (body.eval_count ?? 0) < REPLY_MAX_TOKENS
    ) {
      throw new Error(
        `The reply was cut off after ${body.eval_count ?? 0} tokens: the prompt came to ${promptTokens} tokens, which leaves no room in the model's ${CONTEXT_TOKENS}-token context window.`,
      );
    }
    return { text: body.message?.content ?? '', promptTokens };
  } finally {
    clearTimeout(timeout);
    if (inFlight === controller) {
      inFlight = null;
    }
  }
}

/** Pulls Ollama's own explanation out of a failed response. */
async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const body: { error?: string } = JSON.parse(text);
    return body.error ?? text;
  } catch {
    return text || 'no details given';
  }
}

/** Sends one tool call chosen by the LLM to the server, which decides whether the body can really do it. */
function runTool(brain: NpcBrain, action: Action): string | null {
  const { tool, ...args } = action;
  const serverTool = serverToolName(tool);
  if (!serverTool || !act) {
    return null;
  }
  act('tool_call', { npc: brain.id, tool: serverTool, args });
  return serverTool;
}

/**
 * Records a step the driver took: for the window to show, and in the round's brain log, so that what
 * an NPC did and why can be read back afterwards without anyone having watched it.
 */
function logRoutine(brain: NpcBrain, step: Step): void {
  const acted = step.act ? formatAction(step.act) : `say(${JSON.stringify(step.say)})`;
  brain.lastRoutine = {
    time: new Date().toLocaleTimeString(),
    text: step.text,
    act: acted,
  };
  const send = act;
  const record = {
    npc: brain.id,
    kind: 'decision',
    trigger: `ROUTINE (no LLM) in ${brain.location}, holding ${brain.holding.join(', ') || 'nothing'}: ${step.text}`,
    context: '',
    reply: acted,
    error: '',
    ms: 0,
    tokens: 0,
  };
  setTimeout(() => send?.('brain_log', record), LOG_SEND_GAP_MS);
}

function formatAction(action: Action): string {
  const { tool, ...args } = action;
  const values = Object.values(args)
    .map((value) => JSON.stringify(value))
    .join(', ');
  return `${tool}(${values})`;
}

/** Drops the oldest exchanges, always cutting at the start of a sense report. */
function trimHistory(brain: NpcBrain): void {
  let start = brain.history.length - HISTORY_MAX_MESSAGES;
  if (start > 0) {
    while (
      start < brain.history.length &&
      brain.history[start].role !== 'user'
    ) {
      start++;
    }
    brain.history.splice(0, start);
  }
  // Long reports make for long history. Whole exchanges are dropped, oldest first, until it fits.
  const size = () =>
    brain.history.reduce((total, message) => total + message.content.length, 0);
  while (brain.history.length > 2 && size() > HISTORY_MAX_CHARS) {
    brain.history.splice(0, 2);
  }
}
