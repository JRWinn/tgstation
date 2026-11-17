import type { BooleanLike } from 'tgui-core/react';

import type { PersonCard } from './person';

/** One thing an NPC's body perceived, as sent by the server. */
export type SenseEvent = {
  seq: number;
  /** Clock time for display. */
  time: string;
  /** Server world time in deciseconds, for telling how old the event is. */
  at: number;
  kind:
    | 'person_in_view'
    | 'speech_heard'
    | 'action_result'
    | 'storage_seen'
    | 'pda_message'
    | 'knowledge';
  text: string;
  details: {
    handle?: string;
    tool?: string | null;
    ok?: BooleanLike;
    /** For heard speech: the voice's name, and whether it came from a living thing or a machine. */
    speaker?: string;
    source?: 'person' | 'device';
    distance?: number;
    /** For storage: the room, the container, what the body found, and what was inside. */
    place?: string;
    container?: string;
    state?: 'looked' | 'open' | 'locked';
    contents?: { name: string; count: number }[];
    /** For the custodial locator: where cleaning gear is. */
    places?: { place: string; things: string[] }[];
    [key: string]: unknown;
  };
};

export type PlaceKind = 'hallway' | 'maintenance' | 'room';

/** A person the body can see right now. */
export type PersonInView = {
  handle: string;
  name: string;
  /** The job shown on their ID, or '' if none can be seen. */
  job: string;
  /** For an observer with a post: TRUE if this person is standing inside it. */
  in_post?: BooleanLike;
};

/** A kind of thing the body can see right now, grouped by name. */
export type ThingInView = {
  name: string;
  count: number;
  kind: 'mess' | 'item' | 'vehicle' | 'structure' | 'machine';
};

/** What an NPC remembers of one room. */
export type PlaceMemory = {
  /** Server world time (deciseconds) the NPC was last there. */
  lastVisit: number;
  /** Things seen from there, by name, with what they are and the server world time each was last seen. */
  things: Map<string, { at: number; kind: ThingInView['kind'] }>;
  /** Containers looked at there, by name. */
  storage: Map<string, StorageMemory>;
};

/** What an NPC remembers of one container, or of several in a room that share a name. */
export type StorageMemory = {
  locked: boolean;
  /**
   * Everything ever seen inside, by name. TRUE if it was there at the last look, FALSE if it has
   * gone since. Things that have gone are kept, because this is still where they belong.
   */
  items: Map<string, boolean>;
};

/** Where and when an NPC last saw someone. */
export type PersonSighting = {
  place: string;
  at: number;
};

export type Npc = {
  id: string;
  name: string;
  job: string;
  awake: BooleanLike;
  /** Name of the room or area the body is standing in. */
  location: string;
  people_in_view: PersonInView[];
  things_in_view: ThingInView[];
  /** Names of the items in the body's hands. */
  holding: string[];
  /** What sort of place the body is standing in. */
  place_kind: PlaceKind;
  /** TRUE while the body is walking somewhere it was told to go. */
  walking: BooleanLike;
  /** TRUE while the body is taking a break and staying put. */
  resting: BooleanLike;
  /** TRUE once the body has found there is nowhere new left that it can reach. */
  explored_everything: BooleanLike;
  /** How many containers in the body's room it has not looked inside lately. */
  storage_here: number;
  /** Name of something in the body's hands that can clean right now, or null. */
  cleaning_tool: string | null;
  /** TRUE if the body carries a PDA with the custodial locator. */
  has_locator: BooleanLike;
  /** Names of the messes in view that the body could clean with what it holds. */
  cleanable_messes: string[];
  /** Names of the rooms the body remembers a mess in: seen, and not yet seen to be gone. */
  mess_places: string[];
  /** Those of them where what the body holds would shift at least one of the messes it remembers. */
  workable_mess_places: string[];
  /** TRUE if all the body has to clean with is a mop with no water on it, sink in sight or not. */
  mop_needs_water: BooleanLike;
  /** TRUE if the body can see a sink. */
  sink_in_view: BooleanLike;
  /** TRUE if the body has tried more than once to leave the room it is in and found no way out. */
  shut_in: BooleanLike;
  /** TRUE if the body is shut in and can see a door standing open. */
  door_open: BooleanLike;
  /** TRUE while someone is holding a door open for it. */
  door_held: BooleanLike;
  /** TRUE while a door is being held open to let it out of the room it is in. */
  door_held_out: BooleanLike;
  /** Name of whoever let it into the room it is in, through a door it cannot open, or null. */
  let_in_by: string | null;
  /** How many messes a cleaner grenade would reach if thrown now. 0 if it holds none, or it would be a waste. */
  grenade_messes: number;
  /** What the body is in the middle of, in words, or null if it is free. */
  doing: string | null;
  /** TRUE if the body holds a mop that is dry, with no sink in sight to wet it at. */
  dry_mop: BooleanLike;
  /** Name of the room that is this NPC's post, or null if its job has none. */
  post: string | null;
  /** Names of the crates this NPC may order. Empty unless it works in cargo. */
  orderable: string[];
  /** TRUE while a crate it ordered is on its way. */
  order_pending: BooleanLike;
  /** Name of a crate it ordered that has arrived and not yet been brought out, or null. */
  crate_waiting: string | null;
  /** TRUE if the body carries a PDA it can send messages with. */
  has_pda: BooleanLike;
  /** Name of whoever is still to be told by PDA that the crate they asked for is out, or null. */
  message_owed: string | null;
  /** How much is lying about in its work area that it could put away. Null if it has no work area. */
  tidy: { todo: number } | null;
  /** What is waiting on the supply shuttle and in the bay, for cargo staff. Null for everyone else. */
  freight: {
    shuttle_docked: BooleanLike;
    to_unload: number;
    empties_aboard: number;
    mail_crate: BooleanLike;
    mail_for: string[];
    empty_crates: number;
  } | null;
  /** Messes it remembers in the rooms that are its to keep fit to work in: room name -> what they are. */
  work_area_messes: Record<string, string[]> | null;
  /** Names of the janitors its PDA lists. */
  pda_janitors: string[] | null;
  /** Names of the rooms it lately found no way into. */
  blocked_places: string[] | null;
  /** Highest event number this window has already told the server it dealt with. */
  acked_seq: number;
  events: SenseEvent[];
};

export type Data = {
  npcs: Npc[];
  /** The name of every room aboard. Sent once, when the window opens. */
  places?: string[];
  /** Server world time in deciseconds. */
  now: number;
};

/** One tool call chosen by the LLM: the tool's name plus that tool's parameter. */
export type Action = {
  tool: string;
  [parameter: string]: unknown;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** A record of one time the LLM was asked what to do. */
export type Decision = {
  time: string;
  /** The sense report that was sent. */
  trigger: string;
  /** Tool calls the LLM made, written out for display. */
  calls: string[];
  /** Every message the LLM was sent for this decision, so an NPC's context can be inspected. */
  sent: ChatMessage[];
  /** How long the LLM took, in milliseconds. */
  ms: number;
  /** How many tokens the prompt came to, as counted by the LLM. */
  promptTokens?: number;
  error?: string;
};

/** One speaker's running conversation with an NPC. */
export type Talk = {
  /** Times the NPC has spoken in reply to this speaker since they last went quiet. */
  replies: number;
  /** Server world time (deciseconds) this speaker was last heard. */
  lastHeardAt: number;
};

/**
 * How pressing a task is. An emergency is dropped everything for; asked is work someone is waiting
 * on; routine is the NPC's own work. Nothing raises an emergency yet.
 */
export type Urgency = 'emergency' | 'asked' | 'routine';

/** One piece of work an NPC has to do. */
export type Task = {
  id: number;
  /** What sort of work it is. The NPC's job, or the person layer, knows how each kind is done. */
  kind: string;
  /** The room it is to be done in, if it has one. */
  place?: string;
  /** The thing it is about, if it has one: an item to fetch, a crate on order. */
  item?: string;
  urgency: Urgency;
  /** How the NPC came by it: it saw it, was told of it, was asked to do it, or it comes of its own job. */
  source: 'noticed' | 'told' | 'asked' | 'own';
  /** For work in a room locked to the NPC: the room to go to and ask to be let in from. */
  via?: string;
  /** Name of whoever asked for it or told the NPC of it, if anyone. */
  askedBy?: string;
  /** Open work is waiting to be done. Blocked work cannot go on until something changes. */
  state: 'open' | 'blocked' | 'done';
  /** What a blocked task is waiting on, in words. */
  blockedOn?: string;
  /** What the NPC had to work with when it found the task could not go on, so a change can be told. */
  blockedWith?: string | null;
  /** Server world time (deciseconds) it was taken on, and finished. */
  createdAt: number;
  doneAt?: number;
  /** TRUE once whoever asked has been told it is done. */
  reported?: boolean;
};

/** What cargo staff know of the freight: what the shuttle brought, and what is to go back on it. */
export type Freight = {
  /** TRUE while the supply shuttle is sitting docked at the station. */
  shuttleDocked: boolean;
  /** Crates aboard it with something in them, not counting one on order. */
  toUnload: number;
  /** Crates aboard it with nothing in them, waiting to go back. */
  emptiesAboard: number;
  /** TRUE if there is a mail crate in the bay with mail still in it. */
  mailCrate: boolean;
  /** Names of the people the NPC is holding mail for. */
  mailFor: string[];
  /** Crates in cargo's rooms with nothing left in them. */
  emptyCrates: number;
};

/** What doing a task comes down to right now. */
export type Plan = {
  /** TRUE if the NPC can get on with it now. FALSE if something else has to happen first. */
  ready: boolean;
  /**
   * If ready: what the work is and its next step, as a sentence that stands on its own.
   * If not: what stands in the way.
   */
  step: string;
  /** If ready and the step is something the body does: the action, for the driver to carry out. */
  act?: Action;
  /** If ready and the step is something to say: the plain line used if the LLM comes up with none. */
  say?: string;
  /** If not ready: TRUE if the thing to do meanwhile is stay put, not wander off and pass the time. */
  wait?: boolean;
};

/** How an NPC feels about one person it has met. */
export type Feeling = {
  /** From -3 (cannot stand them) to 3 (counts them a friend). Never 0: no feeling is no entry. */
  score: number;
  /** What last moved the feeling, in the NPC's own few words. */
  why: string;
  /** Server world time (deciseconds) the feeling last moved. */
  changedAt: number;
};

/** Everything this window remembers about one NPC. Each NPC's context is kept separate. */
export type NpcBrain = {
  id: string;
  name: string;
  job: string;
  /** The person this NPC is: its personality. */
  card: PersonCard;
  awake: boolean;
  /** Name of the room or area the body is standing in. */
  location: string;
  peopleInView: PersonInView[];
  thingsInView: ThingInView[];
  /** Names of the items in the body's hands. */
  holding: string[];
  /** Rooms this NPC has been in, by name. */
  places: Map<string, PlaceMemory>;
  /** Where this NPC last saw each person, by name. */
  people: Map<string, PersonSighting>;
  /** How this NPC feels about each person it has come to feel something about, by name. */
  feelings: Map<string, Feeling>;
  /** The work this NPC has to do, has put down, or has lately finished. */
  tasks: Task[];
  /** The id the next task taken on will get. */
  nextTaskId: number;
  /** Latest server world time (deciseconds) this brain has heard of. */
  now: number;
  /** Highest event number already folded into this brain. */
  lastSeq: number;
  history: ChatMessage[];
  notes: string[];
  /** Handles of people this NPC has seen come into view before. */
  seenHandles: Set<string>;
  /** Sense reports waiting to go out with the next LLM call. */
  pending: string[];
  /** TRUE when something has happened that the LLM should decide about. */
  wake: boolean;
  /** LLM calls made in a row since the last thing that happened in the world. */
  chained: number;
  /** How the current conversation with each speaker is going, keyed by handle or voice name. */
  talks: Map<string, Talk>;
  /** Speakers whose words are in the pending report, so a reply can be counted against them. */
  pendingSpeakers: Set<string>;
  /** When this NPC last spoke, in this window's clock (milliseconds). */
  lastSayAt: number;
  status: 'idle' | 'queued' | 'thinking';
  lastThinkEnd: number;
  placeKind: PlaceKind;
  walking: boolean;
  resting: boolean;
  exploredEverything: boolean;
  storageHere: number;
  cleaningTool: string | null;
  cleanableMesses: string[];
  /** Names of the rooms the body remembers a mess in. */
  messPlaces: string[];
  /** Those of them where what it holds would do some good. */
  workablePlaces: string[];
  /** TRUE if all it has to clean with is a dry mop. */
  mopNeedsWater: boolean;
  sinkInView: boolean;
  /** TRUE if it cannot find a way out of the room it is in. */
  shutIn: boolean;
  /** TRUE if it is shut in and can see a door standing open. */
  doorOpen: boolean;
  /** TRUE while someone is holding a door open for it. */
  doorHeld: boolean;
  /** TRUE while a door is being held open to let it out of the room it is in. */
  doorHeldOut: boolean;
  /** The room it was in before the one it is in now, or null. The way back out. */
  cameFrom: string | null;
  /** Name of whoever let it into the room it is in, through a door it cannot open, or null. */
  letInBy: string | null;
  /** Who was standing in the way of something it was hauling, and when (this window's clock). */
  inTheWay: { handle: string; at: number } | null;
  /** Who last asked, in its hearing, for a door to be opened, and when (server time). */
  doorAsked: { name: string; at: number } | null;
  /** When it last asked to be let into each room that is locked to it (server time), and how many times. */
  letInAsks: Record<string, { at: number; count: number }>;
  /** The last few things it said, so that it does not say them again. */
  saidLately: { text: string; at: number }[];
  /** While shut in, the driver does not try the door again before this time (milliseconds). */
  tryLeavingAt: number;
  /** When it may next pass a remark of its own accord, in this window's clock, or 0 if it has no company. */
  nextRemarkAt: number;
  /** Server world time (deciseconds) it last asked cargo for supplies. */
  askedCargoAt: number;
  /** Server world time (deciseconds) its PDA last said supplies were waiting for it, or null. */
  suppliesSentAt: number | null;
  /** The driver takes no step before this time, in this window's clock (milliseconds). */
  driveAfter: number;
  /** The step the driver last told the body to take and has not yet heard the outcome of. */
  lastAct: {
    key: string;
    tool: string;
    at: number;
    /** What the body was told to do, and the task it was for, if any. */
    act: Action;
    task?: number;
  } | null;
  /** Steps that came to nothing lately, by key, and when each may be tried again. */
  failures: Map<string, { count: number; until: number }>;
  /** A line the NPC has to say this turn: used as it stands if the LLM comes up with none. */
  mustSay: string | null;
  /** TRUE while the LLM is being asked to put that line in the NPC's own words. */
  sayingNow: boolean;
  /** When the body first held still for someone talking to it, or 0 if it is not doing so. */
  heldSince: number;
  /** When someone last spoke to it, in this window's clock (milliseconds). */
  lastSpokenToAt: number;
  /** The last step the driver took, for the window to show. */
  lastRoutine?: { time: string; text: string; act: string };
  /** How many messes a cleaner grenade would reach if thrown now. 0 if it holds none, or it would be a waste. */
  grenadeMesses: number;
  /** TRUE if the body holds a mop that is dry, with no sink in sight to wet it at. */
  dryMop: boolean;
  post: string | null;
  orderable: string[];
  orderPending: boolean;
  crateWaiting: string | null;
  hasPda: boolean;
  /** Name of whoever is still to be told by PDA that their crate is out, or null. */
  messageOwed: string | null;
  /** How many things are lying about in its work area that it could put away. */
  tidyTodo: number;
  /** What is waiting on the supply shuttle and in the bay, for cargo staff. Null for everyone else. */
  freight: Freight | null;
  /** Who has been sent a PDA message about mail waiting for them, and when (server time). */
  mailTold: Record<string, number>;
  /** Messes it remembers in the rooms that are its to keep fit to work in: room name -> what they are. */
  areaMesses: Record<string, string[]>;
  /** Names of the janitors its PDA lists. */
  janitorsOnPda: string[];
  /** Names of the rooms it lately found no way into. */
  blockedPlaces: string[];
  /** The janitor it last called to each room, when (server time), and how many times it has called. */
  janitorCalls: Record<
    string,
    { to: string; at: number; count: number; letIn?: boolean }
  >;
  /** TRUE once this NPC has gone to the Cargo Lobby and asked for supplies, until they come. */
  askedCargo: boolean;
  /** What the body is in the middle of, in words, or null if it is free. */
  doing: string | null;
  /** Server world time (deciseconds) this NPC last told someone about a mess, by room. */
  toldOfMess: Map<string, number>;
  hasLocator: boolean;
  /** TRUE once this NPC has checked its custodial locator. */
  locatorUsed: boolean;
  /** The rooms the custodial locator showed cleaning gear in. */
  supplyPlaces: string[];
  /** Those of them the NPC has been to and looked through. */
  supplyPlacesSearched: Set<string>;
  /** The fixed part of the prompt as last written to the server's brain log. */
  loggedCard: string;
  /** Server world time (deciseconds) the body entered the room it is in. */
  inPlaceSince: number;
  /** When this NPC last had something to do, in this window's clock (milliseconds). */
  lastActiveAt: number;
  lastDecision?: Decision;
};

/** One thing an NPC can do right now, as offered to the LLM. */
export type Option = {
  /** The tool's name, as the LLM writes it. */
  tool: string;
  /** The tool's one parameter and the values it may take, if it has one. */
  parameter?: { name: string; choices: string[] };
  /** The name of a second parameter the LLM writes freely, if the tool has one. */
  freeText?: string;
  /** What choosing it would do, here and now. */
  text: string;
};
