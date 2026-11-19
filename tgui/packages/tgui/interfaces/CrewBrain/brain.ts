/**
 * The thinking half of crew NPCs. It runs entirely in the owning player's window: it turns sense
 * events from the server into prompts for the player's local Ollama, and turns the LLM's tool
 * calls into requests to the server. The server never contacts the LLM itself.
 */
import { saidTo } from './addressing';
import { buildChoice, readChoice } from './choice';
import { clearExpected } from './expected';
import { clearRounds, roundsAfterSaying } from './jobs/rounds';
import { asideOverhears } from './jobs/aside';
import { guardAfterSaying, guardOverhears } from './jobs/guarding';
import {
  inMeeting,
  isMeetingOrder,
  meetingsAfterSaying,
  meetingsOverhear,
  readSummons,
} from './jobs/meetings';
import { ordersAfterSaying } from './jobs/orders';
import {
  pickupsAfterSaying,
  pickupsOverhear,
  readPickup,
} from './jobs/pickups';
import { isWarrantOn, securityFeels } from './jobs/arrests';
import { doorHoldOver } from './jobs/cargo';
import { deskRead } from './jobs/desk';
import { buildReading, type Reading, readReading } from './jobs/security';
import { newWanted, readWanted, wantedOverhears } from './jobs/wanted';
import { withRemark } from './jobs/reports';
import { drive, LEAD_PAUSE_MS, noteResult, type Step } from './driver';
import { jobFor } from './jobs';
import {
  addNote,
  observe,
  recordKnownPlaces,
  recordLocator,
  recordStorage,
} from './memory';
import { pickPersonCard } from './person';
import {
  buildReplySchema,
  buildSystemPrompt,
  isFiller,
  parseReply,
  serverToolName,
  withoutHandles,
} from './prompt';
import { describeFeeling, shiftFeeling } from './relationships';
import { buildTalk, type Speaker, soundsLikeOrder, speakerHeard } from './talk';
import {
  afterSaying,
  describeTask,
  syncTasks,
  takeToldWork,
  workInOrder,
  workInWords,
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
/** How long (deciseconds of server time) after answering a fellow NPC before it answers them again, unless they ask it something. */
const FELLOW_REPLY_EVERY_DS = 1800;
/** The server refuses speech sooner than this after the last, so wait it out before thinking again. */
const SAY_COOLDOWN_MS = 4200;
/** How long a room is left alone because of its fire doors, when its alarm is not one to reset or cannot be got to. */
const FIRE_CLOSED_MS = 600000;
/** How soon (milliseconds) after a reset fire doors must shut again for it to count as the alarm coming straight back. */
const ALARM_CAME_BACK_MS = 60000;
/** How far apart (deciseconds) two NPCs may hear the same line and it still be the same line. */
const SAME_LINE_DS = 20;
/** How long a body that has reported reaching a door is taken to be standing at it, the server not having said so. */
const DOOR_REACHED_MS = 30000;
/** How long (milliseconds) one newly shut in behind a door it was let through waits at that door before it tries any other way out. */
const LET_IN_FIRST_TRY_MS = 120000;
/** How long (milliseconds) an NPC keeps out of a room it was walked out of by the arm. */
const PUT_OUT_KEEPS_MS = 600000;
/** How many lines of talk, heard and said, an NPC keeps. */
const TALK_LOG_KEPT = 16;
/** How many remarks an NPC passes of its own accord before it waits for someone to say something back. */
const REMARKS_UNANSWERED_MAX = 2;
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
/** Most tokens the LLM may spend saying which job comes first: a letter and a few words of why. */
const CHOICE_MAX_TOKENS = 80;
/** How long a call asking which job comes first may take. The body has stopped waiting well before. */
const CHOICE_TIMEOUT_MS = 15000;
/** Most tokens the LLM may spend reading an order code could not: three short fields. And how long that call may take. */
const READING_MAX_TOKENS = 60;
const READING_TIMEOUT_MS = 15000;

type Act = (action: string, payload?: object) => void;

const brains = new Map<string, NpcBrain>();
/**
 * Who each of an NPC's pending speakers was, as its body saw them when the line was heard. Its
 * turn with the LLM may come seconds later, by when the Captain who gave the order has walked on
 * out of sight; who spoke, and whether the NPC answers to them, is not to be lost with the view.
 * Cleared with pendingSpeakers in "think".
 */
const heardFrom = new WeakMap<NpcBrain, Map<string, Speaker>>();
/**
 * The lines of an NPC's pending report that were said to it: to it by name, or to several people
 * of whom it was the nearest (the same test that wakes it). A line said to someone else stays in
 * the report for the LLM to know of, but nothing is taken on, agreed to or ordered from it.
 */
const linesForMe = new WeakMap<NpcBrain, Set<string>>();
/** NPCs waiting on or with the LLM that have been told to stand still for it. */
const heldToTalk = new WeakSet<NpcBrain>();
/** Ids of NPCs waiting for the LLM. One GPU serves one request at a time, so they take turns. */
const queue: string[] = [];
/** Ids of NPCs waiting to be asked which job comes first. Talk goes ahead of these: someone is waiting on it. */
const choiceQueue: string[] = [];
/** Ids of NPCs with an order code could not read, waiting for the LLM to read it. These go first: whoever sent it is waiting. */
const readingQueue: string[] = [];
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
  choiceQueue.length = 0;
  readingQueue.length = 0;
  brains.clear();
  clearExpected();
  clearRounds();
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
        stowed: [],
        places: new Map(),
        people: new Map(),
        feelings: new Map(),
        tasks: [],
        nextTaskId: 1,
        now,
        // Anything the server says was already dealt with is history, not news.
        lastSeq: npc.acked_seq,
        talkLog: [],
        remarkDue: false,
        remarksUnanswered: 0,
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
        poorTool: false,
        workDone: {},
        workReported: {},
        cleanableMesses: [],
        beyondKinds: [],
        messPlaces: [],
        workablePlaces: [],
        mopNeedsWater: false,
        sinkInView: false,
        waterFrom: null,
        bucketToFill: false,
        wantsBucket: false,
        shutIn: false,
        doorOpen: false,
        doorHeld: false,
        doorHeldFor: null,
        doorHeldOut: false,
        doorOutTo: null,
        cameFrom: null,
        leftPlace: null,
        inDoorway: false,
        repeats: null,
        letInBy: null,
        wantsOut: false,
        wayOutTo: null,
        doorKeepers: [],
        atDoorOf: null,
        atDoorLabel: null,
        doorReached: null,
        lookInRooms: [],
        roomsThrough: {},
        reachedThrough: {},
        closedRooms: [],
        lookedIn: {},
        lastArrivalAt: 0,
        inTheWay: null,
        gaveUp: null,
        seeToUntil: 0,
        wontComeTold: {},
        doorAsked: null,
        toldToLeave: null,
        keptOut: {},
        asideAsked: null,
        knockAt: null,
        handles: {},
        inTalkWith: null,
        toTell: [],
        outAsks: null,
        fireDoors: null,
        alarmResets: {},
        fireClosed: {},
        letInAsks: {},
        strangers: {},
        workmates: new Set(),
        sentFor: {},
        challenged: null,
        vouchAsked: null,
        verifyHeard: null,
        workmateCalled: false,
        inHand: false,
        outOfBounds: false,
        openDoorTries: 0,
        saidLately: [],
        tryLeavingAt: 0,
        nextRemarkAt: 0,
        askedCargoAt: 0,
        suppliesSentAt: null,
        driveAfter: 0,
        lastAct: null,
        choice: null,
        choosing: null,
        lastChoiceAt: 0,
        failures: new Map(),
        mustSay: null,
        mustSayNeeds: null,
        mustSayIf: null,
        mustSayExact: false,
        sayingNow: false,
        heldSince: 0,
        lastSpokenToAt: 0,
        grenadeMesses: 0,
        dryMop: false,
        post: null,
        orderable: [],
        orderPending: false,
        hasPda: false,
        notices: [],
        heldCrates: [],
        heldCheckDue: false,
        pickupAsked: null,
        pickups: [],
        pickupTurn: 0,
        tidyTodo: 0,
        freight: null,
        mailTold: {},
        areaMesses: {},
        janitorsOnPda: [],
        office: null,
        meetingRoom: null,
        pdaPeople: [],
        crateToReturn: false,
        bornAt: now,
        toldHeadAt: null,
        suppliesAt: null,
        summons: null,
        asks: [],
        meeting: null,
        nextMeetingAt: 0,
        metOnce: false,
        meetingOrderedBy: null,
        lateWork: {},
        requisition: null,
        book: null,
        budget: null,
        crateCosts: {},
        staffPost: null,
        headOffice: null,
        machines: [],
        engineReading: null,
        engine: null,
        chief: null,
        security: null,
        custody: null,
        wanted: newWanted(),
        desk: null,
        beat: null,
        ledger: null,
        givenOrder: null,
        qmSilent: null,
        sentToQm: {},
        duties: {},
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
    // It knows its own job. A body the server cannot put a job to for a moment, because its ID
    // cannot be read, has not stopped being what it was: a head with no job drops its meeting.
    brain.job = npc.job || brain.job;
    brain.awake = !!npc.awake;
    if (brain.location !== npc.location) {
      brain.inPlaceSince = now;
      brain.outAsks = null;
      brain.cameFrom = brain.location || brain.cameFrom;
      // Where it was a moment ago, and when it left. Someone pushed a tile out of a room has not left it.
      if (brain.location) {
        brain.leftPlace = { place: brain.location, at: Date.now() };
      }
    }
    brain.location = npc.location;
    brain.inDoorway = !!npc.in_doorway;
    brain.peopleInView = npc.people_in_view ?? [];
    // Kept by name, so that someone a door now hides can still be pointed at.
    for (const person of brain.peopleInView) {
      brain.handles[person.name] = person.handle;
    }
    brain.thingsInView = npc.things_in_view ?? [];
    brain.holding = npc.holding ?? [];
    brain.stowed = (npc.inventory ?? [])
      .filter((item) => item.where === 'stowed')
      .map((item) => item.name);
    brain.placeKind = npc.place_kind;
    brain.walking = !!npc.walking;
    brain.resting = !!npc.resting;
    brain.exploredEverything = !!npc.explored_everything;
    brain.storageHere = npc.storage_here ?? 0;
    brain.cleaningTool = npc.cleaning_tool ?? null;
    brain.poorTool = !!npc.poor_tool;
    // The server's own count of the work done. Nothing here adds to it.
    brain.workDone = {
      cleaned: npc.work_done?.cleaned ?? 0,
      put_away: npc.work_done?.put_away ?? 0,
      crates_in: npc.work_done?.crates_in ?? 0,
      crates_out: npc.work_done?.crates_out ?? 0,
      machines_set: npc.work_done?.machines_set ?? 0,
      arrests: npc.work_done?.arrests ?? 0,
    };
    brain.cleanableMesses = npc.cleanable_messes ?? [];
    brain.beyondKinds = npc.beyond_kinds ?? [];
    brain.messPlaces = npc.mess_places ?? [];
    brain.workablePlaces = npc.workable_mess_places ?? [];
    brain.mopNeedsWater = !!npc.mop_needs_water;
    brain.sinkInView = !!npc.sink_in_view;
    brain.waterFrom = npc.water_from ?? null;
    brain.bucketToFill = !!npc.bucket_to_fill;
    brain.wantsBucket = !!npc.wants_bucket;
    // Shut in, every step that meant going somewhere came to nothing. Once it is out, none of
    // that says anything about what it can do now, so nothing is held back on account of it.
    if (brain.shutIn && !npc.shut_in) {
      brain.failures.clear();
    }
    // A door that has only just come open has not been tried yet.
    if (!npc.shut_in || !npc.door_open) {
      brain.openDoorTries = 0;
    }
    // Newly shut in behind a door someone let it through: the walk that has just come to nothing
    // was its try at leaving. It goes to that door and asks, and does not set off at once on
    // another walk out by some other way.
    if (npc.shut_in && !brain.shutIn && npc.wants_out) {
      brain.tryLeavingAt = Date.now() + LET_IN_FIRST_TRY_MS;
    }
    brain.shutIn = !!npc.shut_in;
    brain.doorOpen = !!npc.door_open;
    brain.doorHeld = !!npc.door_held;
    if (!brain.doorHeld) {
      brain.doorHeldFor = null;
    }
    brain.doorHeldOut = !!npc.door_held_out;
    brain.letInBy = npc.let_in_by ?? null;
    brain.wantsOut = !!npc.wants_out;
    brain.wayOutTo = npc.way_out_to ?? null;
    brain.doorKeepers = npc.door_keepers ?? [];
    // The server says which door it is standing at. If it has just reported reaching one and the
    // server does not yet say so, the report is taken at its word for a little while: sent back to
    // the same door, it would be told it had arrived, over and over, and never get round to asking.
    const reached = brain.doorReached;
    const stillThere =
      !!reached &&
      reached.from === npc.location &&
      Date.now() - reached.at < DOOR_REACHED_MS;
    if (!stillThere) {
      brain.doorReached = null;
    }
    brain.atDoorOf =
      npc.at_door_of ?? (stillThere && reached ? reached.place : null);
    brain.atDoorLabel = npc.at_door_of ? (npc.at_door_label ?? null) : null;
    brain.lookInRooms = npc.look_in_rooms ?? [];
    brain.closedRooms = npc.closed_rooms ?? [];
    brain.roomsThrough = npc.rooms_through ?? {};
    brain.grenadeMesses = npc.grenade_messes ?? 0;
    brain.doing = npc.doing ?? null;
    brain.dryMop = !!npc.dry_mop;
    brain.post = npc.post ?? null;
    brain.orderable = npc.orderable ?? [];
    brain.orderPending = !!npc.order_pending;
    brain.hasPda = !!npc.has_pda;
    brain.notices = npc.notices ?? [];
    brain.heldCrates = (npc.held_crates ?? []).map((crate) => ({
      number: crate.number,
      for: crate.for ?? null,
      what: crate.what ?? null,
      place: crate.place,
      out: !!crate.out,
      takenBy: crate.taken_by ?? null,
      waited: crate.waited ?? 0,
    }));
    brain.heldCheckDue = !!npc.held_check_due;
    brain.tidyTodo = npc.tidy?.todo ?? 0;
    brain.freight = npc.freight
      ? {
          shuttleDocked: !!npc.freight.shuttle_docked,
          toUnload: npc.freight.to_unload ?? 0,
          emptiesAboard: npc.freight.empties_aboard ?? 0,
          mailCrate: !!npc.freight.mail_crate,
          mailFor: npc.freight.mail_for ?? [],
          emptyCrates: npc.freight.empty_crates ?? 0,
          misplaced: npc.freight.misplaced ?? 0,
        }
      : null;
    brain.areaMesses = npc.work_area_messes ?? {};
    brain.janitorsOnPda = npc.pda_janitors ?? [];
    brain.office = npc.office ?? null;
    brain.meetingRoom = npc.meeting_room ?? null;
    brain.pdaPeople = npc.pda_people ?? [];
    brain.crateToReturn = !!npc.crate_to_return;
    brain.workmateCalled = !!npc.workmate_called;
    brain.inHand = !!npc.in_hand;
    brain.outOfBounds = !!npc.out_of_bounds;
    brain.blockedPlaces = npc.blocked_places ?? [];
    // What a Quartermaster has written in its order book, and the money every order is paid from.
    brain.book = npc.book ?? null;
    brain.budget = typeof npc.budget === 'number' ? npc.budget : null;
    brain.crateCosts = npc.crate_costs ?? {};
    brain.staffPost = npc.staff_post ?? null;
    brain.headOffice = npc.head_office ?? null;
    // What engineering staff know of the machines they work, and what the PDA reads of the engine.
    brain.machines = npc.engineering?.machines ?? [];
    brain.engineReading = npc.engineering?.reading ?? null;
    // What security staff are told of themselves and the brig, and the cell this body is held in, if it is.
    brain.security = npc.security ?? null;
    brain.custody = npc.custody ?? null;
    // With something proper to clean with it is no longer waiting on supplies. A rag does not count.
    if (brain.cleaningTool && !brain.poorTool) {
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
        const from = String(event.details.speaker ?? '');
        const text = String(event.details.message ?? '');
        const theirJob = String(event.details.job ?? '');
        // A call to a staff meeting from its head is read the same by everyone. Anything else
        // means what it means to whoever's PDA it is.
        // So is being sent by its head to collect a crate from cargo.
        if (
          !readSummons(brain, from, text, event.at, theirJob) &&
          !readPickup(brain, from, text, theirJob) &&
          // So is word of who security is looking for.
          !readWanted(brain, from, text, theirJob)
        ) {
          jobFor(brain.job).readsMessage?.(
            brain,
            from,
            text,
            event.at,
            theirJob,
          );
        }
      }
      // Who a line was said to is worked out once, here, before anything acts on it or answers it.
      if (event.kind === 'speech_heard' && event.details.source === 'person') {
        const others = [...brains.values()].map((other) => other.name);
        const said = saidTo(
          brain,
          event,
          others,
          nearestToSpeaker(npc, event, npcs),
        );
        event.details.said_to = said.to;
        event.details.nearest_bot = nearestToSpeaker(npc, event, npcs);
        event.details.said_to_name = said.name;
      }
      // A knock at the door of one of its rooms. It says where, and from which side, and not who.
      if (typeof event.details.knock === 'string') {
        brain.knockAt = {
          room: event.details.knock,
          at: event.at,
          inside: !!event.details.knock_from_inside,
          door:
            typeof event.details.knock_door === 'string'
              ? event.details.knock_door
              : undefined,
        };
      }
      // Fire doors that stopped it, and whether the alarm that shut them was only pulled by hand.
      if (typeof event.details.fire_doors === 'string') {
        brain.fireDoors = {
          place: event.details.fire_doors,
          pulled: !!event.details.alarm_pulled,
          at: Date.now(),
        };
        // Shut again straight after it reset the alarm: it is real, or someone is pulling it again.
        // Either way that room is left alone for a good while.
        const resetAt = brain.alarmResets[event.details.fire_doors] ?? 0;
        if (Date.now() - resetAt < ALARM_CAME_BACK_MS) {
          brain.fireClosed[event.details.fire_doors] =
            Date.now() + FIRE_CLOSED_MS;
        }
      }
      // An alarm that is not its to reset, or that it cannot get to: that room is left alone a while.
      for (const closed of [
        event.details.real_alarm,
        event.details.alarm_out_of_reach,
      ]) {
        if (typeof closed === 'string') {
          brain.fireClosed[closed] = Date.now() + FIRE_CLOSED_MS;
        }
      }
      // The server let go of a door it was holding open for someone: stop standing by it.
      if (typeof event.details.door_hold_over === 'string') {
        doorHoldOver(
          brain,
          event.details.door_hold_over,
          typeof event.details.door_held_for === 'string'
            ? event.details.door_held_for
            : '',
        );
      }
      if (event.kind === 'person_in_view') {
        brain.lastArrivalAt = Date.now();
        const name = String(event.details.name ?? '');
        if (name && typeof event.details.handle === 'string') {
          brain.handles[name] = event.details.handle;
        }
        // Someone new turning up is the one reason to ask again for something nobody answered.
        jobFor(brain.job).meets?.(brain, name, String(event.details.job ?? ''));
      }
      if (event.kind === 'speech_heard' && event.details.source === 'person') {
        jobFor(brain.job).overhears?.(brain, event);
        guardOverhears(brain, event);
        asideOverhears(brain, event);
        pickupsOverhear(brain, event);
        wantedOverhears(brain, event);
        meetingsOverhear(brain, event);
        logTalk(
          brain,
          String(event.details.speaker ?? 'Someone'),
          String(event.details.message ?? ''),
          false,
        );
      }
      // Someone new to talk to is a reason to speak up again.
      if (event.kind === 'person_in_view') {
        brain.remarksUnanswered = 0;
      }
      // A door is being held open for it: whatever it had given up on is worth trying this instant.
      if (event.details.door_held) {
        // All but work in the room it is standing in: a clean that came to nothing a moment ago
        // underfoot is no more worth trying because a door has opened, and tried again it keeps
        // the body from going through the door it asked to have opened.
        forgetFailuresForDoor(brain);
        brain.tryLeavingAt = 0;
        // Which room the door is the door of, so that it goes through that one and no other. A
        // door held to let it out of the room it is in is not a way into anywhere: where that
        // one leads is where it goes.
        const room = event.details.places?.[0]?.place ?? null;
        const lettingOut = room === brain.location;
        brain.doorHeldFor = lettingOut ? null : room;
        brain.doorOutTo =
          lettingOut && typeof event.details.out_to === 'string'
            ? event.details.out_to
            : null;
      }
      // The door it wanted opens from a room that is locked to it as well: a locked room inside a
      // locked room. It remembers which, and asks to be let into that one first.
      if (
        typeof event.details.door_of === 'string' &&
        typeof event.details.door_through === 'string'
      ) {
        brain.reachedThrough[event.details.door_of] = event.details.door_through;
      }
      // Walked out of a room by the arm: it was not wanted in there, and keeps out of it a while
      // whatever work it still has there.
      if (typeof event.details.put_out_of === 'string') {
        brain.keptOut[event.details.put_out_of] = Date.now() + PUT_OUT_KEEPS_MS;
        brain.toldToLeave = null;
      }
      if (event.details.in_the_way) {
        brain.inTheWay = {
          handle: String(event.details.in_the_way),
          at: Date.now(),
        };
      }
      // A haul it gave up on: the crate got away too often, or there was no way through with it.
      // What its job makes of that, such as telling its head, is for the job.
      if (event.details.gave_up && typeof event.details.tool === 'string') {
        const number = Number(event.details.number);
        const named = String(event.details.crate ?? 'crate').replace(/\./g, '');
        brain.gaveUp = {
          tool: event.details.tool,
          what: number ? `crate #${number}` : `the ${named}`,
          leftIn:
            typeof event.details.left_in === 'string'
              ? event.details.left_in
              : null,
          at: event.at,
        };
      }
      // Someone has hit it, shoved it or taken hold of it. Only security staff are told, for now.
      securityFeels(brain, event);
      noteResult(brain, event);
      const line = describeEvent(event, brain);
      brain.pending.push(line);
      if (
        event.kind === 'speech_heard' &&
        event.details.source === 'person' &&
        (event.details.said_to === 'me' ||
          (event.details.said_to === 'group' && event.details.nearest_bot))
      ) {
        let forMe = linesForMe.get(brain);
        if (!forMe) {
          forMe = new Set();
          linesForMe.set(brain, forMe);
        }
        forMe.add(line);
      }
      // What nobody has been told about by the time more has happened is old news.
      if (brain.pending.length > PENDING_MAX_LINES) {
        const dropped = brain.pending.splice(
          0,
          brain.pending.length - PENDING_MAX_LINES,
        );
        for (const old of dropped) {
          linesForMe.get(brain)?.delete(old);
        }
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
    // The body gets on with its work. The one thing it asks the LLM is which job comes first, when
    // there is more than one, and it does not wait long for the answer.
    const chooser = brain.id;
    const step = drive(
      brain,
      (action) => runTool(brain, action),
      (fallback, needs, sayIf, exact) => {
        brain.mustSay = fallback;
        brain.mustSayNeeds = needs ?? null;
        brain.mustSayIf = sayIf ?? null;
        brain.mustSayExact = !!exact;
        brain.wake = true;
      },
      () => {
        choiceQueue.push(chooser);
        changed = true;
      },
    );
    if (step) {
      logRoutine(brain, step);
      changed = true;
    }
    // An order from the Captain or a head that code could make nothing of goes to the LLM to read.
    if (
      brain.desk?.unread?.some((it) => !it.asked) &&
      !readingQueue.includes(brain.id)
    ) {
      readingQueue.push(brain.id);
      changed = true;
    }
    passRemark(brain);
    if (brain.wake && brain.awake && brain.status === 'idle') {
      brain.status = 'queued';
      queue.push(brain.id);
      // A remark it may or may not make is no reason to stop: it stands still once it has a line.
      if (!remarkOnly(brain)) {
        stopToTalk(brain);
      }
      changed = true;
    } else if (
      brain.status === 'queued' &&
      !heldToTalk.has(brain) &&
      !remarkOnly(brain)
    ) {
      // Queued only to remark, it has since been spoken to or given a line to say.
      stopToTalk(brain);
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
  heldToTalk.add(brain);
  // A step aside it was asked for is taken first, and talked over: holding it would stop the walk
  // with the asker still waiting to get by.
  if (brain.lastAct?.act.tool === 'step_aside') {
    return;
  }
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

/**
 * TRUE when all an NPC is queued for is a remark of its own accord: nobody waits on an answer and
 * no line is called for. Worked out when needed, as a speaker can join while it waits its turn.
 */
export function remarkOnly(brain: NpcBrain): boolean {
  return (
    brain.remarkDue &&
    brain.pendingSpeakers.size === 0 &&
    brain.mustSay === null
  );
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
  // Nobody passes remarks at a staff meeting: there, people speak when they are called on.
  if (brain.peopleInView.length === 0 || inMeeting(brain)) {
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
  // Whether the moment is worth asking the LLM about at all is decided here. Small talk is for
  // company it does not mind: left to find something to say to someone it dislikes, it told them
  // what was wrong with the room. And having spoken up twice with nothing said back, it lets the
  // quiet be until someone speaks to it or someone new comes in.
  const company = brain.peopleInView.some(
    (person) => (brain.feelings.get(person.name)?.score ?? 0) >= 0,
  );
  if (!company || brain.remarksUnanswered >= REMARKS_UNANSWERED_MAX) {
    return;
  }
  // What it is asked, and what it has said lately, go with the call: see talk.ts.
  brain.remarkDue = true;
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
    } else if (event.details.source === 'animal') {
      line += ` (an animal or a robot, not one of the crew, ${where})`;
    } else if (handle) {
      const to = event.details.said_to;
      const toWhom =
        to === 'me'
          ? ', speaking to you'
          : to === 'other'
            ? `, speaking to ${String(event.details.said_to_name)}`
            : to === 'group'
              ? ', speaking to everyone there'
              : '';
      line += ` (person ${handle}, ${where}${toWhom})`;
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
  // At a staff meeting people speak one at a time, when their head calls on them, and keep to
  // the point. So the crew there do not greet each other or answer each other: what the meeting
  // calls for is said by their work (see jobs/meetings.ts). Someone who is not one of the crew
  // NPCs, the Captain walking in, say, is still answered.
  const fellow = [...brains.values()].some(
    (other) =>
      other !== brain &&
      other.name === (event.details.speaker ?? event.details.name),
  );
  if (inMeeting(brain) && fellow) {
    return false;
  }
  switch (event.kind) {
    case 'person_in_view':
      // Someone security has a warrant on is not greeted. The first thing they hear is that
      // they are under arrest: see jobs/arrests.ts.
      return (
        line.includes('you have not seen them before') &&
        !isWarrantOn(brain, String(event.details.name ?? ''))
      );
    case 'knowledge':
      // Being walked out of a room by the arm is something to have a word about.
      return !!event.details.put_out_of && brain.peopleInView.length > 0;
    case 'speech_heard':
      // Machines chatter constantly; their words are kept for context only.
      if (event.details.source !== 'person') {
        return false;
      }
      // Speech wakes the LLM when it was said to this NPC, or put to several people of whom it is
      // the nearest. What was said to someone else, or to nobody in particular, is heard and
      // remembered but not answered: see addressing.ts. Without this a roomful of NPCs never
      // stops talking, and answers for each other.
      if (
        event.details.said_to !== 'me' &&
        !(event.details.said_to === 'group' && event.details.nearest_bot)
      ) {
        return false;
      }
      brain.lastSpokenToAt = Date.now();
      brain.remarksUnanswered = 0;
      return hearSpeaker(brain, event);
    default:
      return false;
  }
}

/** TRUE if no other NPC that heard this line is nearer whoever said it. Of two as near, the first goes. */
function nearestToSpeaker(npc: Npc, event: SenseEvent, npcs: Npc[]): boolean {
  const distanceOf = (heard: SenseEvent) =>
    typeof heard.details.distance === 'number' ? heard.details.distance : 99;
  const mine = distanceOf(event);
  for (const other of npcs) {
    if (other.id === npc.id) {
      continue;
    }
    const same = other.events.find(
      (heard) =>
        heard.kind === 'speech_heard' &&
        heard.details.speaker === event.details.speaker &&
        heard.details.message === event.details.message &&
        Math.abs(heard.at - event.at) <= SAME_LINE_DS,
    );
    if (!same) {
      continue;
    }
    const theirs = distanceOf(same);
    if (theirs < mine || (theirs === mine && other.id < npc.id)) {
      return false;
    }
  }
  return true;
}

/**
 * Forgets what it had given up on, now that a door is being held open for it, apart from work in
 * the room it stands in that does not take it anywhere. The keys are the driver's: "job:<task>"
 * for a whole job, "<task>:<action as JSON>" for one step of it, and names for the rest.
 */
function forgetFailuresForDoor(brain: NpcBrain): void {
  const here = new Set(
    brain.tasks
      .filter((task) => task.place === brain.location)
      .map((task) => String(task.id)),
  );
  for (const key of [...brain.failures.keys()]) {
    const job = key.match(/^job:(.+)$/);
    if (job) {
      if (!here.has(job[1])) {
        brain.failures.delete(key);
      }
      continue;
    }
    const step = key.match(/^([^:]+):(\{.*\})$/);
    if (step && here.has(step[1])) {
      let tool = '';
      try {
        tool = String(JSON.parse(step[2]).tool ?? '');
      } catch {
        // Not an action after all: forgotten, as before.
      }
      if (tool && !['go_to', 'go_to_door', 'explore'].includes(tool)) {
        continue;
      }
    }
    brain.failures.delete(key);
  }
}

/** Notes that a person spoke and returns whether this NPC is still willing to be woken by them. */
function hearSpeaker(brain: NpcBrain, event: SenseEvent): boolean {
  const speaker = event.details.handle ?? event.details.speaker ?? 'someone';
  let talk = brain.talks.get(speaker);
  if (!talk || event.at - talk.lastHeardAt > TALK_RESET_DS) {
    talk = { replies: 0, lastHeardAt: event.at, repliedAt: talk?.repliedAt };
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
  // Two NPCs who work side by side each say what they are off to do, every minute or so, and each
  // such line started the two of them off again: the same few sentences, back and forth, for the
  // whole of a shift. Having answered a fellow NPC, it does not answer them again for a while
  // unless they ask it something. What they say is still heard, and still acted on by its body.
  if (
    fellow &&
    talk.repliedAt !== undefined &&
    event.at - talk.repliedAt < FELLOW_REPLY_EVERY_DS &&
    !String(event.details.message ?? '').includes('?')
  ) {
    return false;
  }
  brain.pendingSpeakers.add(speaker);
  // Who they are is kept now, from the view this line came with, in case they walk out of it
  // before the NPC's turn comes. One never in view as they spoke is known by what the server put
  // on the line: see speakerHeard.
  const seen = speakerHeard(brain, event.details);
  if (seen) {
    let known = heardFrom.get(brain);
    if (!known) {
      known = new Map();
      heardFrom.set(brain, known);
    }
    known.set(speaker, seen);
  }
  // What they say next, with no name in it, is still for this NPC.
  brain.inTalkWith = {
    name: String(event.details.speaker ?? ''),
    at: Date.now(),
  };
  return true;
}

// --- LLM calls out ----------------------------------------------------------

/**
 * Starts the next LLM call, if the LLM is free. Talk comes first, because someone is waiting on an
 * answer. A choice between jobs goes when no talk is ready to.
 */
function pump(): void {
  if (running) {
    return;
  }
  if (!startReading() && !startTalk()) {
    startChoice();
  }
}

/** Starts the next reading of an order that some NPC is still waiting on. Returns TRUE if a call was started. */
function startReading(): boolean {
  while (readingQueue.length > 0) {
    const brain = brains.get(readingQueue.shift() ?? '');
    const asked = brain?.desk?.unread?.find((it) => !it.asked);
    if (brain && asked) {
      asked.asked = true;
      running = true;
      void readOrder(brain, asked);
      return true;
    }
  }
  return false;
}

/**
 * Puts one order that code could not read to the LLM, as the reader of last resort, and hands
 * what it made of it back to the code that keeps the list. The question is the message and
 * nothing else: see buildReading. Whatever the LLM answers is checked and read back to whoever
 * sent the order, in the fixed words. With no answer that can be used, they are told it was not
 * followed, as they were before there was a reader of last resort.
 */
async function readOrder(
  brain: NpcBrain,
  asked: NonNullable<NonNullable<NpcBrain['desk']>['unread']>[number],
): Promise<void> {
  const mySession = session;
  const call = buildReading(asked.text);
  const started = Date.now();
  let raw = '';
  let error = '';
  let promptTokens = 0;
  let reading: Reading | null = null;
  try {
    const answer = await callOllama(
      [
        { role: 'system', content: call.system },
        { role: 'user', content: call.user },
      ],
      call.schema,
      READING_MAX_TOKENS,
      READING_TIMEOUT_MS,
    );
    if (mySession !== session) {
      return;
    }
    raw = answer.text;
    promptTokens = answer.promptTokens;
    reading = readReading(raw, asked.text);
    if (!reading) {
      error = 'The reply was no warrant or pardon on anyone the message names.';
    }
  } catch (caught) {
    if (mySession !== session) {
      return;
    }
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const outcome = deskRead(brain, asked, reading);
  const ms = Date.now() - started;
  const send = act;
  const record = {
    npc: brain.id,
    kind: 'decision',
    trigger: `READING (LLM) of an order code could not read, from ${asked.from}:${NEWLINE}${call.user}`,
    context: '',
    reply: `${raw}${NEWLINE}${outcome}`,
    error,
    ms,
    tokens: promptTokens,
  };
  setTimeout(() => send?.('brain_log', record), LOG_SEND_GAP_MS);
  running = false;
  notify();
  pump();
}

/** Starts the next waiting NPC's talk, if it is time for it. Returns TRUE if a call was started. */
function startTalk(): boolean {
  while (queue.length > 0 && !brains.get(queue[0])) {
    queue.shift();
  }
  const brain = brains.get(queue[0]);
  if (!brain) {
    return false;
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
    return false;
  }
  queue.shift();
  running = true;
  void think(brain);
  return true;
}

/** Starts the next choice between jobs that some NPC is still waiting on. */
function startChoice(): void {
  while (choiceQueue.length > 0) {
    const brain = brains.get(choiceQueue.shift() ?? '');
    // The body may have stopped waiting and gone on with the code's own order.
    if (brain?.choosing) {
      running = true;
      void chooseJob(brain);
      return;
    }
  }
}

/**
 * Asks the LLM which of an NPC's jobs it does first, and keeps the answer as its choice. The
 * question is small and stands by itself: see choice.ts. If the LLM gives no answer that can be
 * used, the code's own order is taken, and if the body has stopped waiting the answer is dropped.
 */
async function chooseJob(brain: NpcBrain): Promise<void> {
  const mySession = session;
  const asked = brain.choosing;
  // The jobs as they stand now, in the code's own order: some may have gone while it waited its turn.
  const options = workInOrder(brain).filter(
    ({ task, plan }) => plan.ready && !!asked?.options.includes(task.id),
  );
  const settle = (task: number | undefined, why: string): boolean => {
    if (brain.choosing !== asked) {
      return false;
    }
    brain.choosing = null;
    if (task !== undefined) {
      brain.choice = { task, why, at: Date.now() };
    }
    return true;
  };
  if (options.length < 2) {
    settle(options[0]?.task.id, '');
    running = false;
    pump();
    return;
  }
  const call = buildChoice(brain, options);
  const started = Date.now();
  let raw = '';
  let error = '';
  let promptTokens = 0;
  let picked: { task: number; why: string } | null = null;
  try {
    const answer = await callOllama(
      [
        { role: 'system', content: call.system },
        { role: 'user', content: call.user },
      ],
      call.schema,
      CHOICE_MAX_TOKENS,
      CHOICE_TIMEOUT_MS,
    );
    if (mySession !== session) {
      return;
    }
    raw = answer.text;
    promptTokens = answer.promptTokens;
    picked = readChoice(raw, call.letters);
    if (!picked) {
      error = 'The reply named none of the jobs.';
    }
  } catch (caught) {
    if (mySession !== session) {
      return;
    }
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const own = options[0].task;
  const chosen = options.find(({ task }) => task.id === picked?.task)?.task;
  const inTime = settle((chosen ?? own).id, chosen ? (picked?.why ?? '') : '');
  const outcome = !inTime
    ? `Too late: the body had already gone on with its work.${chosen ? ` The answer was to ${describeTask(brain, chosen)}.` : ''}`
    : chosen
      ? `Chose to ${describeTask(brain, chosen)}${picked?.why ? `: "${picked.why}"` : ''}${chosen === own ? '' : ` (the code's own order had ${describeTask(brain, own)} first)`}`
      : `No answer, so the code's own order stands: ${describeTask(brain, own)}.`;
  const ms = Date.now() - started;
  brain.lastChoice = {
    time: new Date().toLocaleTimeString(),
    asked: call.user,
    outcome,
    ms,
    promptTokens,
    error: error || undefined,
  };
  const send = act;
  const record = {
    npc: brain.id,
    kind: 'decision',
    trigger: `CHOICE (LLM) between jobs:${NEWLINE}${call.user}`,
    context: '',
    reply: `${raw}${NEWLINE}${outcome}`,
    error,
    ms,
    tokens: promptTokens,
  };
  setTimeout(() => send?.('brain_log', record), LOG_SEND_GAP_MS);
  running = false;
  notify();
  pump();
}

/** Asks the LLM what one NPC does about its pending sense reports, then carries out its tool calls. */
async function think(brain: NpcBrain): Promise<void> {
  const mySession = session;
  // A line its work called for may have stopped needing to be said while it waited its turn: a
  // workmate asked the question first, say. With nothing else to answer, it says nothing at all.
  if (brain.mustSay !== null && brain.mustSayIf && !brain.mustSayIf()) {
    brain.mustSay = null;
    if (brain.pending.length === 0 && brain.pendingSpeakers.size === 0) {
      brain.wake = false;
      brain.status = 'idle';
      heldToTalk.delete(brain);
      running = false;
      notify();
      pump();
      return;
    }
  }
  const everything = brain.pending.splice(0);
  // Which of what it heard was said to it. Nothing is left in "pending" now, and what goes back
  // into it after a failed call is never a line said aloud, so the set is done with.
  const forMe: ReadonlySet<string> = linesForMe.get(brain) ?? new Set();
  linesForMe.delete(brain);
  // A long backlog is mostly things that no longer matter. Only the latest of it is sent.
  const report =
    everything.length > REPORT_MAX_LINES
      ? [
          '(Earlier events are left out.)',
          ...everything.slice(-REPORT_MAX_LINES),
        ]
      : everything;
  const speakers = [...brain.pendingSpeakers];
  // A line the driver needs said this turn. If the LLM gives none, this is said as it stands.
  let mustSay = brain.mustSay;
  const mustSayNeeds = brain.mustSayNeeds;
  const mustSayIf = brain.mustSayIf;
  // A line that carries numbers is said word for word. The LLM is asked only for a remark to follow it.
  const exact = brain.mustSayExact && mustSay !== null;
  // A remark of its own is only for when nobody is waiting on an answer and no line is called for.
  const remark = brain.remarkDue && speakers.length === 0 && mustSay === null;
  brain.remarkDue = false;
  // What it is sent depends on what kind of moment this is: see talk.ts.
  const call = buildTalk(brain, {
    report,
    speakers,
    mustSay,
    remark,
    exact,
    heardFrom: heardFrom.get(brain),
    forMe,
  });
  const { messages, trigger, superior, toldBy, ordered } = call;
  const { feelAbout, workTold: told } = call.parts;
  // What it heard and is now being told of becomes part of the talk so far.
  for (const said of brain.talkLog) {
    said.reported = true;
  }
  brain.pendingSpeakers.clear();
  heardFrom.delete(brain);
  brain.wake = false;
  brain.mustSay = null;
  brain.mustSayNeeds = null;
  brain.mustSayIf = null;
  brain.mustSayExact = false;
  brain.sayingNow = mustSay !== null;
  brain.status = 'thinking';
  brain.remarking = remark;
  // It may have waited its turn for the LLM a good while. It stands still from here until it has
  // spoken, unless all it is asked for is a remark it may not make: the line stops it when said.
  if (!remark) {
    stopToTalk(brain);
  }
  notify();

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
    let answer = await callOllama(messages, call.schema);
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
        buildReplySchema({ ...call.parts, think: false }),
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
    // The same goes for the seconds the LLM took: if the line no longer needs saying, it is not
    // said, and nor is whatever the LLM made of it.
    const dropped = mustSay !== null && !!mustSayIf && !mustSayIf();
    if (dropped) {
      mustSay = null;
    }
    // Nor is a line said that is only the model's way of saying it has nothing to say.
    const unprompted = speakers.length === 0 && !mustSay;
    const replied = parseReply(reply);
    for (const action of replied) {
      if (action.tool === 'say') {
        action.text = withoutHandles(
          String(action.text ?? ''),
          brain.peopleInView,
        );
      }
    }
    const actions = replied.filter((action) => {
      if (action.tool !== 'say') {
        return true;
      }
      const text = String(action.text ?? '');
      // What other crew act on when they hear it is said only when the body's own work calls for
      // it, in its own fixed words. The LLM's line is the voice, not the work: a head it has
      // talked into saying "arrest Bob Hale" has not declared a warrant. The plain line its work
      // calls for, if any, is said instead below; and as a remark to an exact line, it is left off.
      if (soundsLikeOrder(text, brain)) {
        decision.calls.push(
          `say(${JSON.stringify(text)}) [sounded like an order: not said]`,
        );
        return false;
      }
      return !(
        alone ||
        (dropped && speakers.length === 0) ||
        (unprompted && (isFiller(text) || saidBefore(brain, text)))
      );
    });
    if (mustSay && exact) {
      // The line is said as it stands: the numbers in it are the server's, and whoever hears it
      // goes by its words. Whatever the LLM gave is a remark to follow it, if it is fit to be one.
      const given = actions.find((action) => action.tool === 'say');
      const rest = actions.filter((action) => action.tool !== 'say');
      actions.length = 0;
      if (!alone) {
        actions.push({ tool: 'say', text: withRemark(mustSay, given?.text) });
      }
      actions.push(...rest);
    } else if (
      mustSay &&
      !alone &&
      !actions.some((action) => action.tool === 'say')
    ) {
      actions.unshift({ tool: 'say', text: mustSay });
    }
    // Someone else's next step hangs on hearing a name, or a plain yes, in this line. If the LLM
    // left it out, the plain line is said in its place.
    if (mustSay && mustSayNeeds && !exact) {
      for (const action of actions) {
        if (
          action.tool === 'say' &&
          !mustSayNeeds.test(String(action.text ?? ''))
        ) {
          action.text = mustSay;
        }
      }
    }
    let tookWork = !!ordered;
    if (ordered) {
      decision.calls.push(
        `work(${describeTask(brain, ordered)}) [an order, made out from what was said]`,
      );
    }
    let ledSomeone = false;
    for (const action of actions) {
      if (action.tool === 'remember') {
        // A note that repeats one the NPC already has, or only says who was where, is dropped,
        // and not shown as a decision.
        if (!addNote(brain, String(action.note ?? ''))) {
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
        decision.calls.push(
          `feel(${person.name}: ${action.change}, now "${describeFeeling(brain, person.name)}"; ${feeling.why})`,
        );
        continue;
      } else if (action.tool === 'work') {
        // A head told to find out how its staff are doing calls a meeting for it. It has not been
        // sent to look at a room, whatever the LLM makes of "find out".
        if (
          isMeetingOrder(
            brain,
            report.filter((line) => line.includes(' says: ')).join(' '),
          )
        ) {
          continue;
        }
        const task = takeToldWork(
          brain,
          action.what,
          action.where,
          toldBy,
          !!superior,
        );
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
        // What it agrees to has to be something that was asked for: by the last thing said in
        // its hearing, or failing that by something said just before it. Two people speak at
        // once often enough, and whoever spoke last may only have talked over the one who asked.
        // Only what was said to it: a line to someone else asks nothing of it.
        const heardLines = report.filter(
          (line) =>
            line.includes('(person ') &&
            line.includes(' says: ') &&
            forMe.has(line),
        );
        const job = jobFor(brain.job);
        const calledFor = job.agrees
          ? [...heardLines]
              .reverse()
              .find((line) => job.agrees?.(brain, action, line) !== false)
          : (heardLines.at(-1) ?? '');
        // Speaking is not agreeing to anything. A line its work calls for is said whether or not
        // anyone has just spoken: with nothing heard lately there is no line to have called for it.
        if (calledFor === undefined && action.tool !== 'say') {
          decision.calls.push(
            `${formatAction(action)} [nothing said called for it: not done]`,
          );
          continue;
        }
        // An order is for whoever asked for it: whoever said the line that called for it. The
        // body would otherwise take it to be for whoever it last heard, who may be someone else.
        if (action.tool === 'order' && calledFor !== undefined) {
          const saidBy = calledFor.match(/\(person (\w+)/)?.[1];
          const asker =
            brain.peopleInView.find((seen) => seen.handle === saidBy) ??
            brain.peopleInView.find((seen) => feelAbout.includes(seen.handle));
          if (asker) {
            action.for = asker.handle;
          }
          // How many, and of what, are read off what was said. The LLM only says yes or no.
          job.fills?.(brain, action, calledFor);
        }
        runTool(brain, action);
      }
      decision.calls.push(formatAction(action));
    }
    // If it was told of work in so many words and did not say so, the work goes on its list anyway.
    if (told && !tookWork) {
      const caught = workInWords(brain, report, toldBy, !!superior, forMe);
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
    if (actions.some((action) => action.tool === 'say')) {
      brain.lastSayAt = Date.now();
      // A remark nobody asked for counts against the next one, until someone answers.
      if (unprompted) {
        brain.remarksUnanswered++;
      }
      for (const action of actions) {
        if (action.tool === 'say') {
          const text = String(action.text ?? '');
          noteSaid(brain, text);
          // Whoever it has just spoken to by name is who it is talking with: what they say next,
          // with no name in it, is meant for this NPC.
          const spokeTo = brain.peopleInView.find((person) =>
            new RegExp(`\\b${person.name.split(' ')[0]}\\b`, 'i').test(text),
          );
          if (spokeTo) {
            brain.inTalkWith = { name: spokeTo.name, at: Date.now() };
          }
        }
      }
      jobFor(brain.job).afterSaying?.(brain, mustSay);
      guardAfterSaying(brain, mustSay);
      meetingsAfterSaying(brain, mustSay);
      ordersAfterSaying(brain, mustSay);
      roundsAfterSaying(brain, mustSay);
      pickupsAfterSaying(brain, mustSay);
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
          talk.repliedAt = brain.now;
        }
      }
    }
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
        .filter(
          (line) =>
            line.includes('(person ') &&
            line.includes(' says: ') &&
            forMe.has(line),
        )
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
      // How many, and where to, are read off what was said, as they are when the LLM agrees.
      if (request.tool === 'order') {
        jobFor(brain.job).fills?.(brain, request, heard);
      }
      runTool(brain, request);
      runTool(brain, { tool: 'say', text: 'I will see to it.' });
      decision.calls.push(`${formatAction(request)} [made out without the LLM]`);
      brain.lastSayAt = Date.now();
    }
    // Likewise work it was plainly told of, or ordered to do, still goes on its list.
    if (speakers.length > 0 && !ordered) {
      const caught = workInWords(brain, report, toldBy, !!superior, forMe);
      if (caught) {
        decision.calls.push(
          `work(${describeTask(brain, caught)}) [made out without the LLM]`,
        );
      }
    }
    // The LLM being down must not leave the body dumb: what had to be said is said plainly.
    if (mustSay && brain.peopleInView.length > 0) {
      runTool(brain, { tool: 'say', text: mustSay });
      decision.calls.push(`say(${JSON.stringify(mustSay)}) [the LLM gave none]`);
      brain.lastSayAt = Date.now();
      jobFor(brain.job).afterSaying?.(brain, mustSay);
      guardAfterSaying(brain, mustSay);
      meetingsAfterSaying(brain, mustSay);
      ordersAfterSaying(brain, mustSay);
      roundsAfterSaying(brain, mustSay);
      pickupsAfterSaying(brain, mustSay);
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
  brain.remarking = false;
  heldToTalk.delete(brain);
  running = false;
  // More may have happened while the LLM was busy.
  if (brain.wake && brain.awake) {
    brain.status = 'queued';
    queue.push(brain.id);
    if (!remarkOnly(brain)) {
      stopToTalk(brain);
    }
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
  // The fixed part of the prompt rarely changes, so it is logged only when it does.
  const card = buildSystemPrompt(
    brain.name,
    brain.job,
    brain.card,
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
    // What went with the fixed part this time: the notes, memory and earlier talk it was sent.
    context: (decision.sent[0]?.content ?? '').slice(card.length).trim(),
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
  /** Most tokens the reply may run to, and how long the call may take. */
  maxTokens = REPLY_MAX_TOKENS,
  timeoutMs = THINK_TIMEOUT_MS,
): Promise<{ text: string; promptTokens: number }> {
  const controller = new AbortController();
  inFlight = controller;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          num_predict: maxTokens,
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
      (body.eval_count ?? 0) < maxTokens
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
  if (tool === 'say') {
    const text = String(action.text ?? '');
    logTalk(brain, brain.name, text, true);
    brain.lastSaid = { time: new Date().toLocaleTimeString(), text };
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

/**
 * Keeps something that was said, by the NPC or in its hearing. The talk so far is sent to the LLM
 * as plain lines of who said what. Its own earlier replies are not sent back to it as they were
 * written: a small model copies the shape of what it wrote before, mistakes and all.
 */
function logTalk(brain: NpcBrain, who: string, text: string, own: boolean): void {
  brain.talkLog.push({ who, text, own, reported: own, at: Date.now() });
  if (brain.talkLog.length > TALK_LOG_KEPT) {
    brain.talkLog.shift();
  }
}
