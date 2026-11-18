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
  /** The room this person is standing in. Seeing someone does not put them in the room with you: there are windows. */
  place?: string;
  /** How many tiles off they are standing. */
  distance?: number;
  /** For an observer with a post: TRUE if this person is standing inside it. */
  in_post?: BooleanLike;
  /** For an observer with a post: TRUE if a door into it opens for this person, so they have a right to be in it. */
  belongs?: BooleanLike;
  /** TRUE if this person is the Captain or a head of staff, going by their ID. */
  command?: BooleanLike;
  /** TRUE if the observer answers to this person: the Captain, or the head of its own department. */
  superior?: BooleanLike;
};

/**
 * Someone in an NPC's post who has no right of their own to be there, and where things stand with
 * them. All times are server time.
 */
export type Stranger = {
  /** When they were first, and last, seen in there. */
  seenAt: number;
  lastSeenAt: number;
  /** When they were last asked why they are there, and how many times they have been. */
  askedAt?: number;
  asks: number;
  /** Who they say sent for them, if they named someone who works there. */
  voucher?: string;
  /** When that person was last asked whether they did, and how many times they have been. */
  verifyAskedAt?: number;
  verifyAsks: number;
  /** How it came out: they may stay, or they have to go. */
  verdict?: 'stay' | 'go';
  /** When they were told they were being walked out. */
  toldOutAt?: number;
  /** The workmate who is seeing to them, and when that was last heard. */
  handledBy?: string;
  handledAt?: number;
  /** TRUE if they may stay because the department sent for them, which lasts only as long as what they were sent for. */
  sent?: boolean;
  /** When what they were sent for was first seen to be done with, if it is: their welcome is over from then. */
  overAt?: number;
  /** TRUE if they are being seen out because their welcome is over, not turned out for having no business there. */
  seenOut?: boolean;
  /** Whoever the NPC answers to who ordered them put out, if anyone did. That settles it, sent for or not. */
  orderedBy?: string;
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

/** One kind of thing a body has on it, for the window to show. The LLM is not told of these. */
export type CarriedItem = {
  name: string;
  count: number;
  /** In a hand; put away on the belt, the back, in a pocket or a bag; or worn as clothing. */
  where: 'hand' | 'stowed' | 'worn';
  /** TRUE if it is a tool of the body's trade. */
  trade: BooleanLike;
};

export type Npc = {
  id: string;
  name: string;
  job: string;
  /** Everything the body has on it. */
  inventory?: CarriedItem[];
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
  /** TRUE if all the body has to clean with is a rag, which shifts little. */
  poor_tool?: BooleanLike;
  /** How much of its work the body has done so far this shift: messes cleaned up, and things put away. */
  work_done?: {
    cleaned: number;
    put_away: number;
    /** Crates hauled in off the supply shuttle, and crates sent out: to whoever came for one, or back aboard the shuttle. */
    crates_in?: number;
    crates_out?: number;
    /** Machines an engineer has set: a pump turned on, a canister connected, an emitter switched. */
    machines_set?: number;
  } | null;
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
  /** TRUE from when the body finds it cannot get out by itself until it is back where it was last out. */
  wants_out?: BooleanLike;
  /** The room it was last out in, which it is trying to get back to, or null if it came in by no way it remembers. */
  way_out_to?: string | null;
  /** Those on its PDA whose own ID opens the door it came in by. Empty unless it is shut in. */
  door_keepers?: string[];
  /** The room whose door it is standing at, wanting through, or null. */
  at_door_of: string | null;
  /** TRUE if it is standing in a doorway or right beside a door, where it is in the way of anyone coming through. */
  in_doorway?: BooleanLike;
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
  /** TRUE if the body carries a PDA it can send messages with. */
  has_pda: BooleanLike;
  /** PDA messages it owes about crates: an order that has come in, or crates still waiting to be collected. */
  notices?: Notice[] | null;
  /**
   * The crates cargo is holding for collection, as far as this body knows: all of them for cargo
   * staff, and for everyone else only those put out in the lobby.
   */
  held_crates?:
    | {
        number: number;
        for: string | null;
        what: string | null;
        place: string;
        out: BooleanLike;
        taken_by: string | null;
        waited: number;
      }[]
    | null;
  /** For cargo staff: TRUE if it is this body's moment to go and look over the crates still waiting. */
  held_check_due?: BooleanLike;
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
    /** Crates left within a tile of a door, where they are in the way. */
    misplaced?: number;
  } | null;
  /** Messes it remembers in the rooms that are its to keep fit to work in: room name -> what they are. */
  work_area_messes: Record<string, string[]> | null;
  /** Names of the janitors its PDA lists. */
  pda_janitors: string[] | null;
  /** The room that is its office, if its job gives it one to go back to between errands. */
  office?: string | null;
  /** For a head: the room it calls its staff together in, one that is open to all of them. */
  meeting_room?: string | null;
  /** Everyone its PDA lists, with the job the PDA shows for each. */
  pda_people?: { name: string; job: string }[] | null;
  /** TRUE if a crate it unpacked has yet to be taken back to cargo. */
  crate_to_return?: BooleanLike;
  /** The rooms of its department, beyond its post and where it serves, that its own ID opens. */
  look_in_rooms?: string[] | null;
  /** Those of its rooms, its post among them, that every door into is locked to the crew at large. */
  closed_rooms?: string[] | null;
  /** Those of its rooms that lie inside another of them, each with the room it is got into through. */
  rooms_through?: Record<string, string> | null;
  /** TRUE if someone else at its post has lately sent for a janitor. */
  workmate_called?: BooleanLike;
  /** TRUE while someone has it by the arm and is walking it out of a room. */
  in_hand?: BooleanLike;
  /** TRUE if the room it is in is locked to it: none of its doors open for it. */
  out_of_bounds?: BooleanLike;
  /** Names of the rooms it lately found no way into. */
  blocked_places: string[] | null;
  /**
   * For a Quartermaster: the lines written in its order book, oldest first. Null while it has
   * nothing on it to write on.
   */
  book?: string[] | null;
  /** For a Quartermaster: how many credits are in cargo's budget, which every order is paid from. */
  budget?: number | null;
  /** For a Quartermaster: what one crate of each kind cargo can order costs, in credits. */
  crate_costs?: Record<string, number> | null;
  /** For a head: the room its staff work from, which is where it goes to find them. */
  staff_post?: string | null;
  /** The office of the head this body answers to, if that head has one: where to knock for them. */
  head_office?: string | null;
  /**
   * For engineering staff: the machines of the engine room and the station's batteries, and what
   * its PDA's engine monitor reads. Null for everyone else.
   */
  engineering?: {
    machines: EngineMachine[];
    reading: EngineReading | null;
  } | null;
  /** Highest event number this window has already told the server it dealt with. */
  acked_seq: number;
  events: SenseEvent[];
};

/**
 * One machine engineering staff work: a pump, filter, canister, air alarm or emitter of the engine
 * room, or one of the station's batteries. They arrive knowing each by name, as the crew know
 * every room by name. How it is set they know only by looking.
 */
export type EngineMachine = {
  /** What the server knows it by, for telling the body to work it. */
  id: string;
  /** Its name, as it is labelled aboard: "Gas to Chamber", "emitter". */
  name: string;
  kind: 'pump' | 'filter' | 'canister' | 'alarm' | 'emitter' | 'battery';
  /** Which one it is of those with the same name, counted from 1 in a fixed order. */
  nth: number;
  /** The room it is in. */
  place: string;
  /**
   * How it is set, while the body can see it, and null while it cannot. `on` is whatever the
   * machine has for on: a pump or filter running, a canister connected, an emitter firing, the
   * air alarm drawing everything out, a battery set to charge. `full` is a pump at full pressure.
   */
  seen?: { on: BooleanLike; full?: BooleanLike } | null;
};

/** What the engine monitor on a PDA reads of the engine. */
export type EngineReading = {
  /** How whole the crystal is, from 100 down. */
  integrity: number;
  /** The energy in it. Nothing, with the emitters off for a while. */
  energy: number;
};

/** One thing an engineer has to tell the Chief Engineer, and how far it has got with telling it. */
export type EngineWord = {
  /** What it is word of: the engine lit, a step that would not take, the emitters off, or on again. */
  what: 'lit' | 'stuck' | 'off' | 'on';
  /** The line it is told in, word for word. */
  line: string;
  /** Server time it said the line and began waiting to hear that it was heard. */
  toldAt?: number;
  /** How many times it has said the line and had no word back. */
  unheard: number;
  /** TRUE once it has walked up to the Chief Engineer to say it again. */
  walkedUp?: boolean;
  /** Server time it got to its post looking for the Chief Engineer, and did not find them. */
  soughtAt?: number;
  /** TRUE once it has given up telling them to their face, and sends it by PDA. */
  byPda?: boolean;
};

/** For an engineer: where it has got to with the engine. See jobs/engineer.ts. */
export type EngineWork = {
  /** TRUE once the engine is its to light: it was told so, or nobody told it anything. */
  told: boolean;
  /** Who told it, or null if it started by itself. */
  by: string | null;
  /** The steps of lighting it that it has seen done, each as "machine id:how". */
  done: string[];
  /** How many times each step has not taken. */
  tries: Record<string, number>;
  /** What stopped it, in the words it is reported in, or null. */
  stuck: string | null;
  /** TRUE once every step is done and the emitters are on. */
  lit: boolean;
  /** TRUE while it has been told to switch the emitters off, and has not finished. */
  shutting: boolean;
  /** TRUE once the emitters were switched off on the Chief Engineer's order. The engine is not lit again unasked. */
  shut: boolean;
  /** TRUE while it has been told to switch the emitters on again, and has not finished. */
  relighting: boolean;
  /** The emitters it has switched off, or on again, in the order it is about now. */
  switched: string[];
  /** What it has yet to tell the Chief Engineer. */
  words: EngineWord[];
};

/** For a Chief Engineer: what it knows of the engine and its staff. See jobs/chiefengineer.ts. */
export type ChiefWork = {
  /** Server time it gave the order to light the engine, or null. */
  lightGivenAt: number | null;
  /** TRUE once the engineer has said it has that order. */
  lightTaken: boolean;
  /** Server time it heard the engine was lit, or null. */
  litAt: number | null;
  /** What the engineer said stopped it, or null. */
  stuck: string | null;
  /** The batteries it has set to charge, by machine id, and how many times each has not taken. */
  batteries: string[];
  batteryTries: Record<string, number>;
  /**
   * An order it has for the engineer outside a meeting: light the engine again, emitters off,
   * emitters on again. Null if it has none.
   */
  order: {
    what: 'light' | 'shut' | 'relight';
    /** Server time it was last said or sent, or null if it has not been yet. */
    givenAt: number | null;
    /** TRUE once it has gone by PDA as well. */
    sent: boolean;
    walkedUp?: boolean;
  } | null;
  /** TRUE once it has ordered the emitters off. Nothing is lit again unless the Captain says so. */
  shut: boolean;
  /** Server time it last gave the order for the emitters to go off, or null. */
  shutGivenAt: number | null;
  /** TRUE once the engineer has said the emitters are off. */
  emittersOff: boolean;
  /** Server time it last ordered the emitters on again, or 0. */
  relitAt: number;
};

/** A PDA message cargo owes someone about their crates. */
export type Notice = {
  /** Who it goes to: whoever ordered them. */
  to: string;
  /** The order has come in, crates of it are still waiting to be collected, or a crate of it has been lost. */
  kind: 'arrived' | 'waiting' | 'lost';
  /** The manifest numbers of the crates it is about. */
  numbers: number[];
  /** For an order that has come in: what was ordered, if it was all one kind of crate. */
  what?: string | null;
  /** For an order that has come in: what kind each crate is, in the same order as the numbers. */
  kinds?: string[] | null;
  /** For a crate that has been lost: why it can no longer be handed over, in words. */
  why?: string | null;
  /** Who gave the order to whoever placed it, if it was not whoever it is for: the Quartermaster. Word goes back through them. */
  via?: string | null;
  /** The number the order goes by in the Quartermaster's book, if it was given one. */
  ref?: number | null;
};

/** One crate cargo is holding for collection. */
export type HeldCrate = {
  /** The number on its manifest, which whoever comes for it gives. */
  number: number;
  /** Who ordered it. */
  for: string | null;
  what: string | null;
  /** The room it is in. */
  place: string;
  /** TRUE once it has been brought out to the lobby for whoever came for it. */
  out: boolean;
  /** Who is hauling it away, if anyone is. */
  takenBy: string | null;
  /** How long (deciseconds) it has been off the shuttle. */
  waited: number;
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
  /** Server world time (deciseconds) the NPC last spoke in reply to this speaker, if it has. Kept when they go quiet. */
  repliedAt?: number;
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
  /** For an order: the room the NPC was in when it was given, which is where it goes back to report. */
  from?: string;
  /** For an order to go and look: what it found, in the words it will report it in. */
  found?: string;
  /** For an order: TRUE if a PDA message to whoever gave it could not be sent. */
  pdaFailed?: boolean;
  /** For a crate to collect from cargo: server time it last asked at the counter for it. */
  askedAt?: number;
  /** For a crate to collect: server time before which it does not go back to the counter to try again. */
  retryAt?: number;
  /** For a crate to collect: TRUE once it has hauled it to where it is wanted and unpacked it. */
  unpacked?: boolean;
  /** For a crate to collect: TRUE once whoever sent it has been told the crate is unpacked. */
  toldUnpacked?: boolean;
  /** For a door to be opened for someone: TRUE if it is to let them out of the room, not into it. */
  out?: boolean;
  /** For a mess it was called to: TRUE once whoever called has been told that what it holds will not shift it. */
  toldBeyond?: boolean;
  /** For a mess: TRUE once it has cleaned some of it. What it says of the rest then allows for that. */
  cleanedSome?: boolean;
  /** For a look round: TRUE once it has said aloud, to whoever shares its post, where it is off to. */
  announced?: boolean;
  /** For word owed to its head face to face: TRUE once it has been said to them. */
  passedOn?: boolean;
  /** For word owed to its head face to face: server time it knocked at their office door, if it has. */
  knockedAt?: number;
  /** For word owed to its head face to face: TRUE once it has given up finding them, and sends it on by PDA itself. */
  byPda?: boolean;
  /** For word owed to its head face to face: the line it is saying it in, so that it is known when it has been said. */
  telling?: string;
  /** For word owed to its head face to face: server time it said the line and began waiting to hear that it was heard. */
  toldAt?: number;
  /** For word owed to its head face to face: how many times it has said the line and had no word back. */
  unheard?: number;
  /** For word owed to its head face to face: TRUE once it has walked up to them to say it again. */
  walkedUp?: boolean;
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
  /** Crates in cargo's rooms left within a tile of a door, where they are in the way. */
  misplaced: number;
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
  /**
   * If the step is something to say: what the line has to have in it, a name or a plain yes, say,
   * because someone else's next step hangs on hearing it. A line from the LLM without it is not
   * used: the plain line is said.
   */
  needs?: RegExp;
  /**
   * If the step is something to say: TRUE if the plain line is said word for word, because it
   * carries numbers, or words someone else's next step is read from. The LLM is not asked to put
   * it in its own words: only for a short remark of its own to go after it. See jobs/reports.ts.
   */
  exact?: boolean;
  /** If the step is something to say: FALSE once it no longer needs saying, checked just before it is said. */
  sayIf?: () => boolean;
  /** If not ready: TRUE if the thing to do meanwhile is stay put, not wander off and pass the time. */
  wait?: boolean;
  /**
   * If it is waiting: TRUE if it should not do so in a doorway. A body standing in one is moved
   * by everyone who comes through, and is in and out of the room with each of them. Not every
   * wait is like that: someone waiting to be let through a door stands at it on purpose.
   */
  inside?: boolean;
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
  /**
   * What has been said lately in its hearing, and by it, oldest first. `reported` is FALSE for
   * something it heard that has yet to go to the LLM as news: that goes in the report, not here.
   */
  talkLog: {
    who: string;
    text: string;
    own: boolean;
    reported: boolean;
    /** When it was said, in this window's clock (milliseconds). */
    at: number;
  }[];
  /** TRUE when it has a quiet moment in company and may pass a remark, if it has one. */
  remarkDue: boolean;
  /** How many remarks it has passed of its own accord since anyone last spoke to it or came into view. */
  remarksUnanswered: number;
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
  /** TRUE if all it has to clean with is a rag, which shifts little. */
  poorTool: boolean;
  /** How much of each kind of counted work it has done this shift, by the kind's key: see jobs/reports.ts. */
  workDone: Record<string, number>;
  /** How much of each it had done when it last reported to its head. What it reports is what it has done since. */
  workReported: Record<string, number>;
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
  /** The room a door is being held open for it to go into, or null: a door held for one room is no way into another. */
  doorHeldFor: string | null;
  /** TRUE while a door is being held open to let it out of the room it is in. */
  doorHeldOut: boolean;
  /** Where the door being held to let it out leads, if the server said: that is where it goes. */
  doorOutTo: string | null;
  /** The room it was in before the one it is in now, or null. The way back out. */
  cameFrom: string | null;
  /** The room it was last in before this one, and when it left it (this window's clock): see stillIn in tasks.ts. */
  leftPlace: { place: string; at: number } | null;
  /** TRUE if it is standing in a doorway or right beside a door. */
  inDoorway: boolean;
  /**
   * The walk it last made that the server said had got there, how many times running it has made
   * that same one, and when (this window's clock). A walk that keeps arriving and keeps being
   * asked for again is getting it nowhere: see noteResult in driver.ts.
   */
  repeats: { key: string; count: number; at: number } | null;
  /** Name of whoever let it into the room it is in, through a door it cannot open, or null. */
  letInBy: string | null;
  /** TRUE from when it finds it cannot get out by itself until it is back where it was last out. */
  wantsOut: boolean;
  /** The room it was last out in, which it is trying to get back to, or null. */
  wayOutTo: string | null;
  /** Those on its PDA whose own ID opens the door it came in by. Empty unless it is shut in. */
  doorKeepers: string[];
  /** The room whose door it is standing at, wanting through, or null. */
  atDoorOf: string | null;
  /**
   * The door the body last reported reaching: the room it is the door of, the room the body was
   * in, and when (this window's clock). Kept so that a body told it has arrived is not sent to the
   * same door again because the server has yet to say it is standing there.
   */
  doorReached: { place: string; from: string; at: number } | null;
  /** The rooms of its department, beyond its post, that it looks in on when it has nothing to do. */
  lookInRooms: string[];
  /** Those of its own rooms that lie inside another of them, each with the room it is got into through. */
  roomsThrough: Record<string, string>;
  /**
   * Rooms it has found it cannot even get to the door of, each with the room that door opens from,
   * which is locked to it as well. It asks to be let into that one first.
   */
  reachedThrough: Record<string, string>;
  /** Those of its rooms that are behind doors the crew at large cannot open. */
  closedRooms: string[];
  /** When someone last came into its view, in this window's clock (milliseconds). */
  lastArrivalAt: number;
  /** When it last looked in on, or gave up on reaching, each of those rooms (server time). */
  lookedIn: Record<string, number>;
  /** Who was standing in the way of something it was hauling, and when (this window's clock). */
  inTheWay: { handle: string; at: number } | null;
  /**
   * The last haul it gave up on, after the crate got away from it too often or there was no way
   * through: the tool that began it, what the crate is called, the room it was left in clear of
   * the doors (null if it could not be got clear), and when (server time). Null once it is dealt with.
   */
  gaveUp: {
    tool: string;
    what: string;
    leftIn: string | null;
    at: number;
  } | null;
  /**
   * For a technician: server time until which the shuttle and the rooms are its to see to as
   * well as its own work, because the Quartermaster sent it to help a workmate. 0 if it has not been.
   */
  seeToUntil: number;
  /** For a technician: the crates it has told the Quartermaster would not come, by what each is called, and when (server time). It does not tell of the same one again for a while. */
  wontComeTold: Record<string, number>;
  /** Who last asked, in its hearing, for a door to be opened, and when (server time). */
  doorAsked: {
    name: string;
    at: number;
    /** The room whose door they mean, if they said: by PDA they do. */
    room?: string;
    /** TRUE if they asked to be let out, FALSE if in. */
    out?: boolean;
    /** TRUE if they asked by PDA, so that the answer goes back the same way. */
    byPda?: boolean;
    /** TRUE once they have been told no. */
    refused?: boolean;
    /** TRUE once they have been told, by PDA, that it is coming to the door for them. */
    answered?: boolean;
  } | null;
  /**
   * Someone it answers to has told it to leave the room it was in: who, which room, when (this
   * window's clock), and whether it has said it is going. It goes, whatever it was doing there.
   */
  toldToLeave: {
    by: string;
    room: string;
    at: number;
    said: boolean;
    /** TRUE once it has dropped what it was in the middle of to go. It does that once. */
    dropped?: boolean;
  } | null;
  /** Rooms it has been told to leave, and until when (this window's clock) it keeps out of each and does no work there. */
  keptOut: Record<string, number>;
  /**
   * Someone has asked it to step aside: who, the handle the server knows them by, when (this
   * window's clock), and whether it has. It gets out of their way before anything else.
   */
  asideAsked: { by: string; handle: string; at: number; done: boolean } | null;
  /** The door of one of its rooms that someone has knocked at, and when (server time). A knock does not say who. */
  knockAt: { room: string; at: number; inside: boolean } | null;
  /** The handle the server knows each person it has seen by, by name: a door hides someone it must still point at. */
  handles: Record<string, string>;
  /** Who it was last talking with, and when (this window's clock): what they say next is for it. */
  inTalkWith: { name: string; at: number } | null;
  /**
   * Things it means to tell someone, in order. Each is said out loud when they are in view, or
   * sent by PDA if it is marked for that, and then dropped.
   */
  toTell: {
    to: string;
    line: string;
    /** Why it is saying it, for the report. */
    why: string;
    /** If it is said out loud: what the line has to have in it. A line from the LLM without it is not used: see Plan. */
    needs?: RegExp;
    byPda?: boolean;
    /** If it is said out loud: TRUE if the line is said word for word, at once, with no wait for the LLM to word it: see Plan. */
    exact?: boolean;
    /** If it is said out loud: TRUE if it is said whatever the body is in the middle of. Someone is standing waiting on it. */
    whileBusy?: boolean;
    /** When it was thought of (this window's clock). Stale ones are dropped unsaid. */
    at: number;
  }[];
  /** TRUE if the line its work calls for is said word for word, with only a remark from the LLM after it: see Plan. */
  mustSayExact: boolean;
  /**
   * What it has done about being shut in the room it is in: who it has asked, and whether it has
   * knocked and sent word. It asks each person once, and again only when someone new turns up.
   * If nobody comes, it sends word further afield, once each: to someone else whose ID opens the
   * door, and then to its own head. `wroteAt` is when it last sent word (this window's clock).
   */
  outAsks: {
    room: string;
    asked: string[];
    knocked: boolean;
    messaged: boolean;
    wrote: string[];
    wroteAt: number;
  } | null;
  /** Fire doors that stopped it: the room whose alarm shut them, whether that alarm was only pulled, and when (this window's clock). */
  fireDoors: { place: string; pulled: boolean; at: number } | null;
  /** When it last reset the fire alarm of each room (this window's clock). */
  alarmResets: Record<string, number>;
  /** Rooms it is keeping out of because of their fire doors, and until when (this window's clock). */
  fireClosed: Record<string, number>;
  /** When it last asked to be let into each room that is locked to it (server time), and how many times. */
  letInAsks: Record<
    string,
    {
      at: number;
      count: number;
      /** What it has done to be let in: knocked, sent word, and said so to someone in sight. */
      knocked?: boolean;
      messaged?: boolean;
      said?: boolean;
    }
  >;
  /** People in its post with no right of their own to be there, by name. */
  strangers: Record<string, Stranger>;
  /** Names of the people it has seen who have a right to be in its post: those it works with, and its betters. */
  workmates: Set<string>;
  /** Who it has sent for or let into its post, by name, and when (server time). */
  sentFor: Record<string, number>;
  /** Who has asked it why it is in the room it is in, and when (server time). */
  challenged: { by: string; at: number } | null;
  /** Who has asked it whether it sent for someone, whom, and when (server time). */
  vouchAsked: { by: string; about: string; at: number } | null;
  /** A workmate's question it overheard, about whether someone sent for a stranger: whom, who was asked, and when. */
  verifyHeard: { about: string; voucher: string | null; at: number } | null;
  /** TRUE if someone else at its post has lately sent for a janitor. */
  workmateCalled: boolean;
  /** TRUE while someone has it by the arm and is walking it out of a room. */
  inHand: boolean;
  /** TRUE if the room it is in is locked to it: none of its doors open for it. */
  outOfBounds: boolean;
  /** How many walks out have failed while it was shut in and a door stood open. */
  openDoorTries: number;
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
  /**
   * The job it has chosen to do first out of its routine work, why, and when (this window's
   * clock). It stands until that job is done or can no longer be got on with. `why` is '' when the
   * LLM gave no answer and the code's own order was taken.
   */
  choice: { task: number; why: string; at: number } | null;
  /**
   * A choice the LLM has been asked for and has not yet answered: the tasks it is between, by id,
   * and when the body stops waiting for the answer (this window's clock).
   */
  choosing: { options: number[]; until: number } | null;
  /** When the LLM was last asked to choose between its jobs, in this window's clock (milliseconds). */
  lastChoiceAt: number;
  /** The last choice the LLM was asked for, for the window to show. */
  lastChoice?: {
    time: string;
    /** What it was asked. */
    asked: string;
    /** What came of it, in words. */
    outcome: string;
    ms: number;
    promptTokens: number;
    error?: string;
  };
  /** Steps that came to nothing lately, by key, and when each may be tried again. */
  failures: Map<string, { count: number; until: number }>;
  /** A line the NPC has to say this turn: used as it stands if the LLM comes up with none. */
  mustSay: string | null;
  /** What that line has to have in it, and whether it still needs saying: see Plan. */
  mustSayNeeds: RegExp | null;
  mustSayIf: (() => boolean) | null;
  /** TRUE while the LLM is being asked to put that line in the NPC's own words. */
  sayingNow: boolean;
  /** When the body first held still for someone talking to it, or 0 if it is not doing so. */
  heldSince: number;
  /** When someone last spoke to it, in this window's clock (milliseconds). */
  lastSpokenToAt: number;
  /** The last step the driver took, for the window to show. */
  lastRoutine?: { time: string; text: string; act: string };
  /** The last thing it said out loud, for the window to show. */
  lastSaid?: { time: string; text: string };
  /** The last piece of work it finished, for the window to show: a finished task is soon dropped from the list. */
  lastJob?: { time: string; what: string };
  /** How many messes a cleaner grenade would reach if thrown now. 0 if it holds none, or it would be a waste. */
  grenadeMesses: number;
  /** TRUE if the body holds a mop that is dry, with no sink in sight to wet it at. */
  dryMop: boolean;
  post: string | null;
  orderable: string[];
  orderPending: boolean;
  hasPda: boolean;
  /** PDA messages it owes about crates: an order that has come in, or crates still waiting to be collected. */
  notices: Notice[];
  /** The crates cargo is holding for collection, as far as this NPC knows of them. */
  heldCrates: HeldCrate[];
  /** For cargo staff: TRUE if it is this NPC's moment to go and look over the crates still waiting. */
  heldCheckDue: boolean;
  /**
   * For cargo staff: who last came to the counter for a crate, the manifest number they gave or
   * were taken to mean, and when (server time). Null number: no crate could be made out.
   */
  pickupAsked: { name: string; number: number | null; at: number } | null;
  /** For a head: the crates of its orders that cargo is holding, and who it has sent for each. */
  pickups: {
    number: number;
    to: string;
    /** The room it is to be taken to and unpacked in. */
    room: string;
    what: string;
    at: number;
  }[];
  /** For a head: how many of its staff it has sent for a crate so far, so that each takes a turn. */
  pickupTurn: number;
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
  /** The room that is its office, if its job gives it one to go back to between errands. */
  office: string | null;
  /** For a head: the room it calls its staff together in, as the server names it, or null to go by its department's. */
  meetingRoom: string | null;
  /** Everyone its PDA lists, with the job the PDA shows for each. */
  pdaPeople: { name: string; job: string }[];
  /** TRUE if a crate it unpacked has yet to be taken back to cargo. */
  crateToReturn: boolean;
  /** Server world time (deciseconds) this NPC was first heard of: the start of its shift. */
  bornAt: number;
  /** Server world time (deciseconds) it last told its head what it needs for its work, or null. */
  toldHeadAt: number | null;
  /** The room its PDA last said supplies had been left for it in, or null. */
  suppliesAt: string | null;
  /** A staff meeting its head has called it to, and how far it has got with it: see jobs/meetings.ts. */
  summons: {
    by: string;
    room: string;
    /** Server time it was called. */
    at: number;
    /** TRUE once it has sent word back that it is coming. */
    answered: boolean;
    /** Server time it got to the room, or null. */
    arrivedAt: number | null;
    /** Server time the server last told it that its walk to the room had got there, or null. */
    toldArrivedAt: number | null;
    /** How many times it has walked up to its head in the room, and the server time it last did. */
    walkUps: number;
    walkedUpAt: number | null;
    /** Server time its head was last seen there, or null. */
    headSeenAt: number | null;
    /** Server time its head called on it, by name, for its report, or null. */
    askedAt: number | null;
    /** TRUE once it has given its report: out loud at the meeting, or by PDA. */
    said: boolean;
    /** How many walks to the room have come to nothing. */
    tries: number;
    /** TRUE once it has found it cannot get into the room. It sends its report by PDA instead. */
    shutOut?: boolean;
    /** TRUE once its walk to the room has kept arriving and kept leaving it outside. It stays where it stands, and takes that for being there. */
    fromHere?: boolean;
    /** TRUE once its head has sent word that the meeting went ahead without it. It sends its report by PDA instead. */
    missed?: boolean;
    /** TRUE once its head has said the meeting is over. */
    over?: boolean;
    /** TRUE if its head called the meeting aloud, to its face. Nothing about it then goes by PDA. */
    aloud?: boolean;
    /** Which way of wording a report it uses, picked once so that the line does not change while it waits. */
    wording: number;
  } | null;
  /** For a head: what its staff have asked for, and how far each has got. */
  asks: {
    who: string;
    what: string;
    at: number;
    ordered: boolean;
    told: boolean;
  }[];
  /** For a head: the staff meeting it is holding, and how far it has got: see jobs/head.ts. */
  meeting: {
    calledAt: number;
    room: string;
    /** Who has been sent the call. */
    invited: string[];
    /** TRUE once the Captain has been sent word that it is being held. */
    copied: boolean;
    /** Who has sent word back, and whether they are coming or cannot. */
    answers: Record<string, 'coming' | 'cannot'>;
    /** Server time it began, with whoever was there. Null while it is still waiting for them. */
    startedAt: number | null;
    /** Who has been called on for their report, in order, when, and whether they have been heard. */
    turns: { who: string; askedAt: number; heard: boolean }[];
    /** What each of them has reported, out loud or by PDA: how much work of each kind, and whether they are short of anything. */
    reports: Record<string, { counts: Record<string, number>; need: boolean }>;
    /** Server time it said the meeting was over, or null. */
    closedAt: number | null;
    /** TRUE once its walk to the room has kept arriving and kept leaving it outside. It holds the meeting from where it stands. */
    fromHere?: boolean;
    /** For a meeting called aloud: how many times the call has been said. */
    calls?: number;
    /** Who it has walked up to so as to be heard: by name before the call, and as "turn:name" before calling on them. Each once. */
    walkedTo?: string[];
    /** Who ordered it held, if it was not called of its own accord. */
    orderedBy: string | null;
  } | null;
  /** For a head: server time the next staff meeting is due, and whether it has held one yet. */
  nextMeetingAt: number;
  metOnce: boolean;
  /** For a head: who has ordered it to hold a staff meeting now, if someone it answers to has. */
  meetingOrderedBy: string | null;
  /** For a head: work reported to it by PDA once a meeting was over, by kind. It goes into the next meeting's count. */
  lateWork: Record<string, number>;
  /** For a head: the order it is putting in with cargo for its staff. One order may be for several kinds of crate. */
  requisition: {
    lines: {
      /** The kind of crate, by the name cargo orders it under. */
      crate: string;
      /** What it is, as it is said. */
      what: string;
      count: number;
      /** The room its staff are to take it to when they collect it from cargo. */
      room: string;
      /** Who it is for. */
      people: string[];
    }[];
    /** Server time it was put to cargo, or null if it has yet to be. */
    askedAt: number | null;
    /** TRUE once someone from cargo has answered since it was put to them. */
    heardBack: boolean;
    startedAt: number;
    /** TRUE once it was sent to the Quartermaster and no word came back: it is taken to the counter instead. */
    viaCounter?: boolean;
  } | null;
  /** For a Quartermaster: the lines written in its order book, oldest first. Null while it has nothing to write on. */
  book: string[] | null;
  /** For a Quartermaster: the credits in cargo's budget, or null if the server has not said. */
  budget: number | null;
  /** For a Quartermaster: what one crate of each kind costs. */
  crateCosts: Record<string, number>;
  /** For a head: the room its staff work from. */
  staffPost: string | null;
  /** The office of the head it answers to, if that head has one. */
  headOffice: string | null;
  /** For engineering staff: the machines they work, by name, with how each is set while it is in view. */
  machines: EngineMachine[];
  /** For engineering staff: what the engine monitor on its PDA reads, or null if it has no reading. */
  engineReading: EngineReading | null;
  /** For an engineer: where it has got to with the engine: see jobs/engineer.ts. */
  engine: EngineWork | null;
  /** For a Chief Engineer: what it knows of the engine and its staff: see jobs/chiefengineer.ts. */
  chief: ChiefWork | null;
  /** For a Quartermaster: every order it has taken, and how far each has got: see jobs/quartermaster.ts. */
  ledger: Ledger | null;
  /**
   * For a technician: the order the Quartermaster last gave it, to its face: the number it has
   * in the Quartermaster's book, what to order, who it is for, and whether it has been placed.
   */
  givenOrder: {
    n: number;
    items: { crate: string; count: number }[];
    for: string;
    by: string;
    at: number;
    placed: boolean;
  } | null;
  /**
   * For a technician: a head who has said, at the counter, that the Quartermaster did not answer
   * their order, and when (server time). That head's order is taken as it was before there was a
   * Quartermaster to take it.
   */
  qmSilent: { by: string; at: number } | null;
  /** For a technician: the heads it has told to take their order to the Quartermaster, and when (server time). */
  sentToQm: Record<string, number>;
  /**
   * For a technician: the standing work the Quartermaster has given each of those at the post,
   * by name, as it heard it handed out: the counter, the shuttle, the rooms. Empty until then.
   */
  duties: Record<string, string[]>;
  /** Names of the rooms it lately found no way into. */
  blockedPlaces: string[];
  /** The janitor it last called to each room, when (server time), and how many times it has called. */
  janitorCalls: Record<
    string,
    {
      to: string;
      at: number;
      count: number;
      letIn?: boolean;
      /** The janitors who have sent word that they cannot shift it, and when the last of them did (server time). */
      declined?: string[];
      declinedAt?: number;
    }
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

/** One order in the Quartermaster's book. Times are server time. */
export type LedgerOrder = {
  /** Its number in the book. */
  n: number;
  /** Who ordered it, and their job. */
  from: string;
  fromJob: string;
  items: { crate: string; count: number }[];
  /** What it comes to, in credits. */
  cost: number;
  /**
   * How far it has got. New: taken, and not yet cleared to be placed. Asking: the Captain has
   * been asked about it. Cleared: it may be placed, and is to be given to a technician. Given: a
   * technician has it. Docked: it has come in and whoever ordered has been told. Refused: the
   * Captain said no.
   */
  state: 'new' | 'asking' | 'cleared' | 'given' | 'docked' | 'refused';
  /** Who cleared it, if it needed clearing: the Captain, or the Quartermaster with no Captain aboard. */
  approved: 'captain' | 'self' | null;
  /** When the Captain was last asked about it, and how many times. */
  askedAt: number | null;
  asks: number;
  /** TRUE once whoever ordered has been told it is waiting on the Captain, or on money. */
  waitingTold: boolean;
  /** How many times the Captain has been asked what they meant by something said about it that was no plain yes or no. */
  unclear?: number;
  shortTold: boolean;
  /** The technician it is to be given to, and whether the Quartermaster has walked up to them. */
  pick: string | null;
  walkedUp: boolean;
  /** Who it was given to, when, and whether they have said they have it. */
  givenTo: string | null;
  givenAt: number | null;
  taken: boolean;
  /** Not given again before this, after it could not be placed. */
  retryAt: number;
  /** The crates it came as, once it has come in: the manifest number of each, and what kind it is if that was said. */
  crates?: { number: number; kind?: string }[];
  /** TRUE once a crate of it has been lost and ordered again. That is done once. */
  reordered?: boolean;
  /** TRUE if it is the Quartermaster's own order, for something it needs itself. It unpacks that one itself. */
  own?: boolean;
  /** For its own order: TRUE once it has opened the crate. */
  unpacked?: boolean;
};

/** The Quartermaster's working copy of its order book, and what it has yet to write in it. */
export type Ledger = {
  orders: LedgerOrder[];
  /** The number the next order gets. */
  next: number;
  /** Lines it has yet to write in the book, in order. */
  toWrite: string[];
  /** TRUE once it has read the book it carries: an empty head and a full book means the book is what it knows. */
  read: boolean;
  /** Server time before which it does not go looking for paper again. */
  paperRetryAt: number;
  /** Server time it came out of its office to a knock, or 0. It stays out a little while to hear what is wanted. */
  cameOutAt: number;
  /** The standing work it has given each technician, by name, in so many words: the counter, the shuttle, the rooms. */
  duties: Record<string, string[]>;
  /** Crates a technician has told it would not come, by what each is called: who said so, how many times, and when last (server time). */
  heldUp: Record<string, { by: string; times: number; at: number }>;
  /**
   * Word it owes one of its technicians face to face, sending them to see to something: who, the
   * line, why (for what the LLM is told), when it came to owe it (server time), and whether it
   * has walked up to them. Null when it owes none.
   */
  sendFor: {
    to: string;
    line: string;
    why: string;
    at: number;
    walkedUp?: boolean;
  } | null;
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
