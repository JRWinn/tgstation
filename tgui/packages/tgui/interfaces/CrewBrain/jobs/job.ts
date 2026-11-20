/**
 * What a job is, as far as an NPC's brain is concerned.
 *
 * A job knows its own work. It keeps the NPC's task list true to what the body senses, and for each
 * task it says what the next step is, as an action the body can simply be told to take. The work is
 * done by code from those steps (see driver.ts): no LLM is asked whether to pick up the mop.
 *
 * What a job leaves to the LLM is talk: what the NPC says, and what it agrees to when someone asks
 * it for something its job lets it do.
 *
 * Everything a job contributes is in its own file in this folder. Nothing outside this folder should
 * ask "is this a janitor?"; it should ask the job.
 *
 * The server decides what a body is really allowed to do, whoever asks.
 */
import type {
  Action,
  NpcBrain,
  Option,
  PersonInView,
  Plan,
  SenseEvent,
  Task,
} from '../types';

export type Job = {
  /** TRUE if this is the job for the title written on an ID. */
  is: (title: string) => boolean;
  /** TRUE if the job is done at a post, so the NPC does not go wandering when it has nothing to do. */
  keepsPost: boolean;
  /** TRUE if messes are this job's to deal with. Everyone else only mentions them to someone who cleans. */
  cleans: boolean;
  /**
   * What the job is, in a sentence or two, for the part of the prompt that goes with every call.
   * '' if there is nothing to say. What the body does by itself is not listed here: it is told in
   * `cues` when it is happening.
   */
  about: (post: string | null) => string;
  /**
   * What the NPC should bear in mind when someone has just spoken to it, and only then: what it
   * agrees to and what it turns down. Sent with that call and no other. `heard` is what was said,
   * so that what has nothing to do with it can be left out.
   */
  whenAsked?: (brain: NpcBrain, heard: string) => string[];
  /** What the LLM should know about the work in front of the NPC, for the end of a report. */
  cues: (brain: NpcBrain) => string[];
  /** Opens, blocks and closes this job's tasks from what the body senses. */
  syncTasks?: (brain: NpcBrain) => void;
  /** What doing one of this job's tasks comes down to right now, or null if the task is not this job's. */
  plan?: (brain: NpcBrain, task: Task) => Plan | null;
  /** Says one of this job's tasks in a few words, or null if the task is not this job's. */
  describeTask?: (task: Task) => string | null;
  /**
   * What the NPC is short of for its work right now, in the words it would ask for it in, or null.
   * It takes that to the head it answers to: see jobs/meetings.ts.
   */
  needs?: (brain: NpcBrain) => string | null;
  /**
   * What the NPC is short of that is not for cargo to bring: it says so in its report, and asks
   * nobody to order it. A security officer with no stun baton says "I need a stun baton".
   */
  lacks?: (brain: NpcBrain) => string | null;
  /**
   * The kinds of counted work this job reports to its head at a staff meeting, by the name the
   * server counts each under: see jobs/reports.ts. Left out, it reports every kind it has done.
   */
  reports?: string[];
  /**
   * Fills in the rest of something the LLM has agreed to do, from what was said: how many, and
   * where to. The LLM says yes or no. The particulars are read off the words, not left to it.
   */
  fills?: (brain: NpcBrain, action: Action, heard: string) => void;
  /**
   * What the NPC knows of one of this job's tasks that bears on whether to do it before its other
   * work, as a sentence, or null. For when it is choosing between jobs: see choice.ts.
   */
  weighs?: (brain: NpcBrain, task: Task) => string | null;
  /** Something the body should do at once, ahead of its task list, or null. */
  reflex?: (brain: NpcBrain) => { act: Action; text: string } | null;
  /**
   * What the NPC can agree to do when someone has just asked it, for the LLM to choose from. The LLM
   * hears the request and decides whether it was one; the body then does it.
   */
  offers?: (brain: NpcBrain, askers: PersonInView[]) => Option[];
  /**
   * The kinds of work this job takes on when someone tells the NPC of it, each with the words the
   * LLM is given for it.
   */
  takes?: Record<string, string>;
  /** For each of those kinds, the words that mark speech as telling of it. A net for when the LLM does not say. */
  soundsLike?: Record<string, RegExp>;
  /**
   * Makes out a request in what was just said to the NPC, without an LLM: the action to take, or
   * null. Only used when the LLM could not be asked, so that a dead LLM does not leave the crew deaf.
   */
  hears?: (brain: NpcBrain, heard: string) => Action | null;
  /**
   * Checks something the LLM has agreed to do against what was actually said to the NPC. FALSE if
   * nothing said called for it, in which case it is not done.
   */
  agrees?: (brain: NpcBrain, action: Action, heard: string) => boolean;
  /**
   * Called when the body has heard how something it was told to do for a task went, to note what
   * that means for its work. `ok` says whether it went through. `looped` is TRUE if it was a walk
   * that got there, for the third time running: it is getting the body nowhere. `details` is what
   * the body said of how it went, for the jobs that go by more than whether it did.
   */
  afterActing?: (
    brain: NpcBrain,
    act: Action,
    task: Task | undefined,
    ok: boolean,
    looped?: boolean,
    details?: SenseEvent['details'],
    /** What the body was told of how it went, word for word. */
    text?: string,
  ) => void;
  /** Reads a PDA message the NPC has been sent, to note what it means for its work. No LLM is asked. */
  readsMessage?: (
    brain: NpcBrain,
    from: string,
    text: string,
    at: number,
    /** The sender's job, as the PDA shows it. */
    job: string,
  ) => void;
  /**
   * Called when someone comes into the NPC's view, with their name and job, to note what that means
   * for its work. Someone new turning up is the one reason to ask again for what nobody answered.
   */
  meets?: (brain: NpcBrain, name: string, job: string) => void;
  /**
   * Called for everything a person says in the NPC's hearing, whoever it was said to, to note what
   * it means for its work. No LLM is asked.
   */
  overhears?: (brain: NpcBrain, event: SenseEvent) => void;
  /**
   * Called after the NPC has said something, to note what that means for its work. `called` is the
   * plain line its work called for, if the work called for one: what it said may be in other words.
   */
  afterSaying?: (brain: NpcBrain, called: string | null) => void;
  /**
   * Looks over a line the LLM wrote before it is said, for what this job must not say aloud.
   * `to` is whoever the line is said to, if that is known. Gives back the line to say in its
   * place, or null to say it as it is. Never called for the job's own fixed lines.
   */
  vetsSay?: (brain: NpcBrain, text: string, to: string | null) => string | null;
  /**
   * What keeps the NPC from a staff meeting its head has called, in a few words, or null if it can
   * go. It then sends its report by PDA and stays at its work: see jobs/meetings.ts.
   */
  keptFromMeeting?: (brain: NpcBrain) => string | null;
  /** How the NPC says, in plain words, that one of this job's tasks someone was waiting on is done. */
  sayDone?: (task: Task) => string | null;
};
