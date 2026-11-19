/**
 * The station engineer: one of the Chief Engineer's staff. The engine is its to light.
 *
 * - The Chief Engineer gives it the engine at the first staff meeting, to its face: "Sam, the
 *   engine is yours. Light it now, please." It says it has it, and goes. If it has heard nothing
 *   two minutes into the shift it starts anyway: the station's batteries will not wait for a
 *   meeting that was never held.
 * - It lights the engine one machine at a time, in the order jobs/engine.ts gives. Each step is
 *   something its body does at the machine, as a player would. A step that does not take is tried
 *   once more. If it still does not take, the job stops there, the emitters are not touched, and
 *   it tells the Chief Engineer which step it was.
 * - When every step is done and the emitters are on, it tells the Chief Engineer the engine is
 *   lit, and goes back to its post. It does not stand about in the engine room.
 * - Told "Emitters off, now", it drops whatever it is doing and switches them off. Nothing comes
 *   before that. Having shut the engine off on that order, it does not light it again unasked.
 * - Told the emitters have stopped, it goes and switches them on again.
 * - Said is not told. What it has to tell the Chief Engineer it says to its face, and it is not
 *   told until it hears "I have that" back. With nothing back in 25 seconds it walks up and says
 *   it again. After two tries, or if the Chief Engineer is not to be found at its post, it sends
 *   it by PDA.
 * - At a staff meeting it reports the machines it has set, from the server's count.
 *
 * All of that is code. The LLM answers people in its voice.
 */
import { addTask, findTask, finishTask } from '../tasks';
import type {
  EngineWord,
  EngineWork,
  NpcBrain,
  Plan,
  SenseEvent,
  Task,
} from '../types';
import {
  type EngineAction,
  emitterSteps,
  lightingSteps,
  nextLightingStep,
} from './engine';
import {
  chiefAboard,
  ENGINE_TAKEN,
  ENGINE_TAKEN_WORDS,
  HEARD_WORDS,
  isChiefEngineer,
  isEngineer,
  LIGHT_WORDS,
  litLine,
  notOffLine,
  notOnLine,
  offLine,
  onAgainLine,
  RELIGHT_WORDS,
  SHUT_WORDS,
  saidTo,
  stuckLine,
  switchFailReason,
  UNKNOWN_ENGINE,
} from './engineering';
import {
  describeForcing,
  forcingAfterActing,
  forcingCues,
  forcingReads,
  planForcing,
  syncForcing,
} from './forcing';
import type { Job } from './job';
import { describeRounds, planRounds, roundsInHand, syncRounds } from './rounds';

/** Lighting the engine: working down the steps, the emitters last. */
const LIGHT = 'light_engine';
/** Switching the emitters off, on the Chief Engineer's order. The one thing it drops everything for. */
const SHUT = 'emitters_off';
/** Switching the emitters on again, when they have stopped. */
const RELIGHT = 'emitters_on';
/** Telling the Chief Engineer something about the engine. The task's item is what it is word of. */
const WORD = 'word_for_chief';
/** Going back to its post when there is nothing else to see to. */
const POST = 'engineer_post';

/** How long (deciseconds) into its shift it waits to be given the engine before it starts by itself. */
const STANDING_DS = 1200;
/** How many times a step is tried before the job stops there. */
const STEP_TRIES = 2;
/** How long (deciseconds) after saying a thing to the Chief Engineer it waits to hear that it was heard. */
const HEARD_WAIT_DS = 250;
/** How many times it says a thing to the Chief Engineer with no word back before it sends it by PDA. */
const TELL_TRIES = 2;
/** How near (tiles) it stands to the Chief Engineer to say again what was not heard the first time. */
const TELL_DISTANCE = 2;
/** How long (deciseconds) it waits at its post for the Chief Engineer to come into sight before it sends word by PDA. */
const SOUGHT_DS = 200;

/** Where it has got to with the engine. Made the first time it is asked for. */
function engineOf(brain: NpcBrain): EngineWork {
  brain.engine ??= {
    told: false,
    by: null,
    done: [],
    tries: {},
    stuck: null,
    lit: false,
    shutting: false,
    shut: false,
    relighting: false,
    switched: [],
    switchTries: {},
    wouldNot: null,
    words: [],
  };
  return brain.engine;
}

/** Notes something to tell the Chief Engineer, in place of any word of the same kind it has not passed on yet. */
function owe(
  brain: NpcBrain,
  engine: EngineWork,
  what: EngineWord['what'],
  line: (to: string) => string,
): void {
  const chief = chiefAboard(brain);
  engine.words = engine.words.filter((word) => word.what !== what);
  if (chief) {
    engine.words.push({ what, line: line(chief.name), unheard: 0 });
  }
}

/** The job stops here. The emitters are left as they are, and the Chief Engineer is told what stopped it. */
function stick(brain: NpcBrain, engine: EngineWork, what: string): void {
  engine.stuck = what;
  owe(brain, engine, 'stuck', (to) => stuckLine(to, what));
}

/** The engine is its to light, from now: whatever it had done or been stopped by before is put aside. */
function startLighting(engine: EngineWork, by: string | null): void {
  engine.told = true;
  engine.by = by;
  engine.done = [];
  engine.tries = {};
  engine.stuck = null;
  engine.lit = false;
  engine.shut = false;
  engine.shutting = false;
  engine.relighting = false;
  engine.words = engine.words.filter((word) => word.what === 'off');
}

/** TRUE while the engine is its to light and it is getting on with it. */
function lighting(engine: EngineWork): boolean {
  return (
    engine.told &&
    !engine.lit &&
    !engine.stuck &&
    !engine.shut &&
    !engine.shutting
  );
}

/** Opens or closes one of its tasks to match whether there is that work to do. */
function keep(
  brain: NpcBrain,
  kind: string,
  wanted: boolean,
  urgency: Task['urgency'],
  item?: string,
): void {
  const task = findTask(brain, kind, { item });
  if (wanted && !task) {
    addTask(brain, { kind, urgency, source: 'own', item });
  } else if (!wanted && task) {
    finishTask(brain, task);
  }
}

/** Keeps the engineer's tasks true to what it has been told, what it has done and what it has yet to say. */
function syncTasks(brain: NpcBrain): void {
  // A door to force for security.
  syncForcing(brain);
  const engine = engineOf(brain);
  // Nobody has given it the engine. The batteries are running down all the same, so it starts.
  if (
    !engine.told &&
    !engine.shut &&
    !engine.shutting &&
    brain.now - brain.bornAt > STANDING_DS
  ) {
    startLighting(engine, null);
  }
  // An engine room it has no steps for is not one it lights by guesswork.
  if (lighting(engine) && !lightingSteps(brain.machines)) {
    stick(brain, engine, UNKNOWN_ENGINE);
  }
  // With no Chief Engineer aboard there is nobody to tell.
  if (!chiefAboard(brain)) {
    engine.words = [];
  }

  keep(brain, SHUT, engine.shutting, 'emergency');
  keep(brain, LIGHT, lighting(engine), 'asked');
  keep(brain, RELIGHT, engine.relighting && !engine.shutting, 'asked');
  for (const what of ['lit', 'stuck', 'off', 'on', 'notoff', 'noton']) {
    keep(
      brain,
      WORD,
      engine.words.some((word) => word.what === what),
      // The engine still firing with the crystal coming apart is word that cannot wait.
      what === 'notoff' ? 'emergency' : 'asked',
      what,
    );
  }

  const inHand =
    engine.shutting ||
    lighting(engine) ||
    engine.relighting ||
    engine.words.length > 0;
  // With nothing in hand it looks in on the rest of its department now and then.
  syncRounds(brain, !inHand);
  // Away from its post with nothing to see through, it goes back. A lit engine is watched from
  // the Chief Engineer's PDA, not by standing next to it.
  keep(
    brain,
    POST,
    !!brain.post &&
      brain.location !== brain.post &&
      !inHand &&
      !roundsInHand(brain) &&
      !brain.shutIn,
    'routine',
  );
}

/** A step of the engine's work, as something for the body to do at a machine. */
function work(action: EngineAction, step: string): Plan {
  return {
    ready: true,
    step,
    act: {
      tool: 'work_machine',
      machine: action.machine.id,
      how: action.how,
    },
  };
}

/**
 * Telling the Chief Engineer something about the engine, face to face. Said is not told: it is
 * passed on only when the Chief Engineer says it has it. With no word back it walks up and says
 * it again, and after that, or if the Chief Engineer is not to be found, it goes by PDA.
 */
function tellChief(brain: NpcBrain, word: EngineWord): Plan {
  const chief = chiefAboard(brain);
  if (!chief) {
    return { ready: false, step: 'There is no Chief Engineer aboard to tell.' };
  }
  const byPda = (): Plan =>
    brain.hasPda
      ? {
          ready: true,
          step: `You have word for ${chief.name}, the Chief Engineer, and cannot tell them to their face. You are sending it by PDA: "${word.line}"`,
          act: { tool: 'message', person: chief.name, text: word.line },
        }
      : {
          ready: false,
          step: `You have word for ${chief.name}, the Chief Engineer, and no way to get it to them.`,
        };
  if (word.byPda) {
    return byPda();
  }
  // Said, and not yet answered. Being in sight is not being in earshot.
  if (word.toldAt !== undefined) {
    if (brain.now - word.toldAt < HEARD_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `You have told ${chief.name} about the engine, and are waiting to hear that they have it.`,
      };
    }
    word.toldAt = undefined;
    word.unheard += 1;
    word.walkedUp = false;
  }
  if (word.unheard >= TELL_TRIES) {
    word.byPda = true;
    return byPda();
  }
  const seen = brain.peopleInView.find((person) => person.name === chief.name);
  if (
    seen &&
    word.unheard > 0 &&
    (seen.distance ?? 0) > TELL_DISTANCE &&
    !word.walkedUp
  ) {
    return {
      ready: true,
      step: `You told ${chief.name} about the engine and they did not hear. You are walking up to them to say it again.`,
      act: { tool: 'approach', person: seen.handle },
    };
  }
  if (seen) {
    return {
      ready: true,
      step: `You have word for ${chief.name}, the Chief Engineer, and they are here. Your body is telling them, in these words: "${word.line}"`,
      say: word.line,
      exact: true,
    };
  }
  // Not in sight. Its post is where the Chief Engineer looks for it, so it goes there first.
  if (
    brain.post &&
    brain.location !== brain.post &&
    word.soughtAt === undefined
  ) {
    return {
      ready: true,
      step: `You have word for ${chief.name}, the Chief Engineer, and they are not in sight. You are going to the ${brain.post} to find them.`,
      act: { tool: 'go_to', place: brain.post },
    };
  }
  word.soughtAt ??= brain.now;
  if (brain.now - word.soughtAt > SOUGHT_DS) {
    word.byPda = true;
    return byPda();
  }
  return {
    ready: false,
    wait: true,
    step: `You have word for ${chief.name}, the Chief Engineer, and are looking for them.`,
  };
}

function plan(brain: NpcBrain, task: Task): Plan | null {
  const forcing = planForcing(brain, task);
  if (forcing) {
    return forcing;
  }
  const engine = engineOf(brain);
  if (task.kind === SHUT) {
    const next = emitterSteps(brain.machines, 'switch_off').find(
      (action) => !engine.switched.includes(action.key),
    );
    return next
      ? work(
          next,
          'The Chief Engineer has ordered the emitters off: the engine is losing integrity. Nothing comes before this. You are switching off an emitter.',
        )
      : { ready: false, step: 'The emitters are off.' };
  }
  if (task.kind === LIGHT) {
    const steps = lightingSteps(brain.machines);
    const next = steps ? nextLightingStep(steps, engine.done) : null;
    if (!steps || !next) {
      return {
        ready: false,
        step: 'There is no step of lighting the engine left to do.',
      };
    }
    const count = steps.filter((step) => engine.done.includes(step.key)).length;
    return work(
      next,
      `You are lighting the engine${engine.by ? `, as ${engine.by} told you to` : ''}: step ${count + 1} of ${steps.length}, ${next.doing}.${next.kind === 'emitter' ? ' Every step before the emitters is done.' : ' The emitters come last.'}`,
    );
  }
  if (task.kind === RELIGHT) {
    const next = emitterSteps(brain.machines, 'switch_on').find(
      (action) => !engine.switched.includes(action.key),
    );
    return next
      ? work(
          next,
          'The emitters have stopped, and the Chief Engineer has sent you to switch them on again. You are switching on an emitter.',
        )
      : { ready: false, step: 'The emitters are on again.' };
  }
  if (task.kind === WORD) {
    const word = engine.words.find((it) => it.what === task.item);
    return word
      ? tellChief(brain, word)
      : { ready: false, step: 'That has been passed on.' };
  }
  if (task.kind === POST) {
    return brain.post
      ? {
          ready: true,
          step: `You have nothing to see to at the engine just now, and are going back to your post, the ${brain.post}.`,
          act: { tool: 'go_to', place: brain.post },
        }
      : { ready: false, step: 'You are staying where you are for now.' };
  }
  return planRounds(brain, task);
}

function describeTask(task: Task): string | null {
  const forcing = describeForcing(task);
  if (forcing) {
    return forcing;
  }
  switch (task.kind) {
    case LIGHT:
      return 'light the engine';
    case SHUT:
      return 'switch the emitters off';
    case RELIGHT:
      return 'switch the emitters on again';
    case WORD:
      return 'tell the Chief Engineer about the engine';
    case POST:
      return 'go back to your post';
    default:
      return describeRounds(task);
  }
}

/** What the LLM should know about where the engine stands, so that what it says about it is true. */
function cues(brain: NpcBrain): string[] {
  const engine = engineOf(brain);
  const steps = lightingSteps(brain.machines);
  if (engine.shutting) {
    return [
      'The Chief Engineer has ordered the emitters off, because the engine is losing integrity. You are switching them off now, before anything else.',
    ];
  }
  if (engine.shut) {
    return [
      "You switched the engine's emitters off on the Chief Engineer's order. It is not lit, and you will not light it again unless you are told to.",
    ];
  }
  if (engine.stuck) {
    return [
      `You could not light the engine: ${engine.stuck}. You have not switched the emitters on. It is for the Chief Engineer to say what happens next.`,
    ];
  }
  if (engine.lit) {
    return [
      'You have lit the engine: its cooling is running and its emitters are on. The Chief Engineer watches it from their PDA.',
    ];
  }
  if (engine.told && steps) {
    const count = steps.filter((step) => engine.done.includes(step.key)).length;
    return [
      `You are lighting the engine. You have done ${count} of its ${steps.length} steps. The emitters come last, once its cooling is running.`,
    ];
  }
  return ['The engine is not lit yet. Nobody has given it to you to light.'];
}

/**
 * Takes what the Chief Engineer has said to it, or sent it, about the engine. `aloud` is TRUE if
 * it was said in its hearing: only then does it answer aloud that it has the engine.
 */
function takeWord(
  brain: NpcBrain,
  from: string,
  text: string,
  aloud: boolean,
): void {
  const engine = engineOf(brain);
  if (!saidTo(brain, text)) {
    return;
  }
  // Emitters off. It stops whatever it is about, lighting the engine included.
  if (SHUT_WORDS.test(text)) {
    engine.shutting = true;
    engine.relighting = false;
    engine.switched = [];
    engine.switchTries = {};
    engine.wouldNot = null;
    return;
  }
  if (RELIGHT_WORDS.test(text)) {
    if (!engine.shutting && !engine.shut) {
      engine.relighting = true;
      engine.switched = [];
      engine.switchTries = {};
      engine.wouldNot = null;
    }
    return;
  }
  if (LIGHT_WORDS.test(text)) {
    // Given the engine while it is already lighting it, it carries on from where it is.
    if (!lighting(engine) && !engine.lit) {
      startLighting(engine, from);
    } else {
      engine.by ??= from;
    }
    if (aloud) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== ENGINE_TAKEN);
      brain.toTell.push({
        to: from,
        line: ENGINE_TAKEN,
        why: `${from}, the Chief Engineer, has given you the engine to light. You are saying that you have it.`,
        needs: ENGINE_TAKEN_WORDS,
        // Word for word, and there and then: the Chief Engineer is standing waiting on it.
        exact: true,
        whileBusy: true,
        at: Date.now(),
      });
    }
    return;
  }
  // The Chief Engineer saying it has what it was told: that word is passed on.
  if (HEARD_WORDS.test(text)) {
    const told = engine.words.find((word) => word.toldAt !== undefined);
    if (told) {
      engine.words = engine.words.filter((word) => word !== told);
    }
  }
}

export const ENGINEER: Job = {
  is: isEngineer,
  // It works from Engineering. It does not wander the station.
  keepsPost: true,
  cleans: false,
  // What an engineer reports at its staff meeting, for now: the machines it has set.
  reports: ['machines_set'],
  about: () =>
    "You are a Station Engineer. You answer to the Chief Engineer, who answers to the Captain. The station's engine is yours to light and to shut off: you set its pumps, filters and canisters one at a time, switch on the emitters last, and switch them off the moment the Chief Engineer says to. You work from Engineering.",
  whenAsked: () => [
    "You light the engine, and switch its emitters off or on, on the Chief Engineer's word and nobody else's. Whether it is lit, and how far you have got, is told to you here: never say more about it than that.",
    'Other repairs are not something you can see to yet: a door, a light, a room without power, a hole in the hull. Asked for one, say so plainly, and that they should tell the Chief Engineer.',
  ],
  cues: (brain) => [...cues(brain), ...forcingCues(brain)],
  syncTasks,
  plan,
  describeTask,
  // The Chief Engineer's orders reach it by PDA when they are not said to its face.
  readsMessage: (brain, from, text, _at, job) => {
    // Sent to force a door for security: by the Chief Engineer, or by security where there is
    // no chief.
    if (forcingReads(brain, from, job, text)) {
      return;
    }
    if (isChiefEngineer(job)) {
      takeWord(brain, from, text, false);
    }
  },
  overhears: (brain, event: SenseEvent) => {
    const heard = String(event.details.message ?? '');
    const speaker = String(event.details.speaker ?? '');
    const job =
      brain.peopleInView.find((person) => person.name === speaker)?.job ??
      brain.pdaPeople.find((person) => person.name === speaker)?.job ??
      '';
    if (speaker && isChiefEngineer(job)) {
      takeWord(brain, speaker, heard, true);
    }
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    // Having said its word to the Chief Engineer, it waits to hear that it was heard.
    const word = engineOf(brain).words.find((it) => it.line === called);
    if (word) {
      word.toldAt = brain.now;
    }
  },
  afterActing: (brain, act, task, ok, _looped, details, text) => {
    forcingAfterActing(brain, act, ok, details);
    const engine = engineOf(brain);
    const word =
      task?.kind === WORD
        ? engine.words.find((it) => it.what === task.item)
        : undefined;
    // Having walked up to the Chief Engineer, near enough or not, it speaks.
    if (word && act.tool === 'approach') {
      word.walkedUp = true;
    }
    // At its post, or as near as it could get: it looks for the Chief Engineer from here.
    if (word && act.tool === 'go_to') {
      word.soughtAt = brain.now;
    }
    // Sent by PDA, it is passed on.
    if (word && act.tool === 'message' && ok) {
      engine.words = engine.words.filter((it) => it !== word);
    }
    if (act.tool !== 'work_machine') {
      return;
    }
    const key = `${String(act.machine)}:${String(act.how)}`;
    if (task?.kind === LIGHT) {
      const steps = lightingSteps(brain.machines);
      const step = steps?.find((it) => it.key === key);
      if (!steps || !step) {
        return;
      }
      if (!ok) {
        // A step that does not take is tried once more. After that the job stops here.
        engine.tries[key] = (engine.tries[key] ?? 0) + 1;
        if (engine.tries[key] >= STEP_TRIES) {
          stick(brain, engine, step.fails);
        }
        return;
      }
      if (!engine.done.includes(key)) {
        engine.done.push(key);
      }
      if (!nextLightingStep(steps, engine.done)) {
        engine.lit = true;
        owe(brain, engine, 'lit', litLine);
      }
      return;
    }
    if (task?.kind !== SHUT && task?.kind !== RELIGHT) {
      return;
    }
    if (!ok) {
      // A switch that does not take is tried once more. After that the emitter is given up on and
      // the next one tried, so one locked emitter does not keep the others firing.
      const tries = engine.switchTries ?? {};
      engine.switchTries = tries;
      tries[key] = (tries[key] ?? 0) + 1;
      if (tries[key] < STEP_TRIES) {
        return;
      }
      engine.wouldNot ??= switchFailReason(text);
    }
    if (!engine.switched.includes(key)) {
      engine.switched.push(key);
    }
    const off = task.kind === SHUT;
    const all = emitterSteps(
      brain.machines,
      off ? 'switch_off' : 'switch_on',
    ).every((action) => engine.switched.includes(action.key));
    if (!all) {
      return;
    }
    const wouldNot = engine.wouldNot;
    if (wouldNot) {
      // Every emitter has been tried, and some would not switch. The Chief Engineer is told why.
      engine.wouldNot = null;
      engine.switchTries = {};
      if (off) {
        engine.shutting = false;
        owe(brain, engine, 'notoff', (to) => notOffLine(to, wouldNot));
      } else {
        engine.relighting = false;
        owe(brain, engine, 'noton', (to) => notOnLine(to, wouldNot));
      }
      return;
    }
    if (off) {
      // Shut off on the Chief Engineer's order. It is not lit again unasked.
      engine.shutting = false;
      engine.shut = true;
      engine.lit = false;
      engine.told = false;
      owe(brain, engine, 'off', offLine);
    } else {
      engine.relighting = false;
      owe(brain, engine, 'on', onAgainLine);
    }
  },
};
