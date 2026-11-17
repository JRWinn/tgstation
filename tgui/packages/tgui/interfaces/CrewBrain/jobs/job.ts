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
  /** The job's standing rules, for the prompt. They are about talk: the work needs no rules. */
  rules: (post: string | null) => string[];
  /** What the LLM should know about the work in front of the NPC, for the end of a report. */
  cues: (brain: NpcBrain) => string[];
  /** Opens, blocks and closes this job's tasks from what the body senses. */
  syncTasks?: (brain: NpcBrain) => void;
  /** What doing one of this job's tasks comes down to right now, or null if the task is not this job's. */
  plan?: (brain: NpcBrain, task: Task) => Plan | null;
  /** Says one of this job's tasks in a few words, or null if the task is not this job's. */
  describeTask?: (task: Task) => string | null;
  /** Something the body should do at once, ahead of its task list, or null. */
  reflex?: (brain: NpcBrain) => { act: Action; text: string } | null;
  /**
   * What the NPC can agree to do when someone has just asked it, for the LLM to choose from. The LLM
   * hears the request and decides whether it was one; the body then does it.
   */
  offers?: (brain: NpcBrain) => Option[];
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
   * that means for its work. `ok` says whether it went through.
   */
  afterActing?: (
    brain: NpcBrain,
    act: Action,
    task: Task | undefined,
    ok: boolean,
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
   * Called for everything a person says in the NPC's hearing, whoever it was said to, to note what
   * it means for its work. No LLM is asked.
   */
  overhears?: (brain: NpcBrain, event: SenseEvent) => void;
  /**
   * Called after the NPC has said something, to note what that means for its work. `called` is the
   * plain line its work called for, if the work called for one: what it said may be in other words.
   */
  afterSaying?: (brain: NpcBrain, called: string | null) => void;
  /** How the NPC says, in plain words, that one of this job's tasks someone was waiting on is done. */
  sayDone?: (task: Task) => string | null;
};
