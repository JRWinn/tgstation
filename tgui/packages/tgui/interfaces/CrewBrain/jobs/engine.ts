/**
 * Lighting the engine: the steps, in order, for the engine rooms an engineer knows.
 *
 * An engine is lit by setting a dozen machines and then switching on the emitters that fire at
 * the crystal. The order matters. The crystal makes heat the moment it is hit, and the gas that
 * carries the heat away has to be going round first: an engine lit before its cooling is running
 * comes apart, and takes the engine room with it. So the emitters are the last thing touched,
 * and they are only touched when every step before them has been seen done.
 *
 * The steps are data, one list for each engine room, with each machine known by the name it has
 * aboard. The server tells engineering staff what machines there are (EngineMachine in types.ts).
 * If any machine on a list is not among them, that list is not for this engine, and an engineer
 * with no list for an engine does not light it: it says so.
 *
 * The body does each step by going to the machine and working it as a player would: a click, a
 * wrench on a canister, a setting on the machine. This file only says which machine, and how.
 */
import type { EngineMachine } from '../types';

/**
 * How a machine is worked, as the server's `work_machine` tool takes it: turned on or off, set to
 * full, a canister wrenched onto its connector, an emitter switched on or off, a battery set to
 * charge, an air alarm set to draw everything out of the chamber.
 */
export type How =
  | 'on'
  | 'off'
  | 'full'
  | 'connect'
  | 'switch_on'
  | 'switch_off'
  | 'charge'
  | 'draw_all';

/** One step of lighting an engine. */
export type EngineStep = {
  /** The machine's kind, and its name as the server gives it, in lower case. */
  kind: EngineMachine['kind'];
  name: string;
  /** Which one, of those with that name. */
  nth: number;
  how: How;
  /** What the step is, as it is told to the LLM: "turning on Gas to Chamber". */
  doing: string;
  /** What is said of it if it will not take: "Gas to Chamber will not turn on". */
  fails: string;
};

/** A step matched to the machine it is done on. */
export type EngineAction = EngineStep & {
  machine: EngineMachine;
  /** What the step is known by once it is done: the machine and how it was worked. */
  key: string;
};

/** A pump's steps: each of the ways it is to be worked, in order. */
function pump(
  name: string,
  hows: ('on' | 'off' | 'full')[],
  nth = 1,
): EngineStep[] {
  const words = {
    on: ['turning on', 'will not turn on'],
    off: ['turning off', 'will not turn off'],
    full: ['setting to full', 'will not go to full'],
  };
  return hows.map((how) => ({
    kind: 'pump',
    name: name.toLowerCase(),
    nth,
    how,
    doing: `${words[how][0]} ${name}`,
    fails: `${name} ${words[how][1]}`,
  }));
}

function canister(nth: number): EngineStep {
  return {
    kind: 'canister',
    name: 'nitrogen canister',
    nth,
    how: 'connect',
    doing: 'wrenching a nitrogen canister onto its connector',
    fails: 'the nitrogen canister will not connect',
  };
}

function filter(nth: number): EngineStep {
  return {
    kind: 'filter',
    name: 'filter',
    nth,
    how: 'on',
    doing: 'turning on a filter',
    fails: 'a filter will not turn on',
  };
}

function emitter(nth: number): EngineStep {
  return {
    kind: 'emitter',
    name: 'emitter',
    nth,
    how: 'switch_on',
    doing: 'switching on an emitter',
    fails: 'an emitter will not switch on',
  };
}

/**
 * MetaStation's supermatter engine, on nitrogen. Traced from the map's pipes on 2026-11-18, not
 * taken from the wiki: the wiki's steps leave the loop broken here, at the filter with nothing
 * set and at Mix Bypass, and the nitrogen never gets back to the chamber.
 *
 * Nitrogen goes from the canisters into the loop, into the chamber, out through the scrubbers,
 * through the first filter, out to the pipes in space to cool, back through the nitrogen filter,
 * and through Mix Bypass to the chamber again. Engine Coolant Bypass lets gas skip the chamber,
 * so it is shut. The coolers are left off.
 */
const METASTATION: EngineStep[] = [
  canister(1),
  canister(2),
  ...pump('External Gas to Loop', ['on', 'full'], 1),
  ...pump('External Gas to Loop', ['on', 'full'], 2),
  ...pump('Engine Coolant Bypass', ['off']),
  ...pump('Gas to Chamber', ['on', 'full']),
  ...pump('Gas to Filter', ['on', 'full']),
  filter(1),
  ...pump('Gas to Cold Loop', ['full']),
  ...pump('Cold Loop to Gas', ['full']),
  filter(2),
  ...pump('Mix Bypass', ['on', 'full']),
  {
    kind: 'alarm',
    name: 'engine air alarm',
    nth: 1,
    how: 'draw_all',
    doing:
      'setting the engine air alarm so the scrubbers draw everything out of the chamber',
    fails: 'the engine air alarm will not set',
  },
  emitter(1),
  emitter(2),
  emitter(3),
];

/** Every engine room an engineer has the steps for. */
const ENGINES: EngineStep[][] = [METASTATION];

function find(
  machines: EngineMachine[],
  step: Pick<EngineStep, 'kind' | 'name' | 'nth'>,
): EngineMachine | undefined {
  return machines.find(
    (machine) =>
      machine.kind === step.kind &&
      machine.name.toLowerCase() === step.name &&
      machine.nth === step.nth,
  );
}

function matched(
  machines: EngineMachine[],
  steps: EngineStep[],
): EngineAction[] | null {
  const actions: EngineAction[] = [];
  for (const step of steps) {
    const machine = find(machines, step);
    if (!machine) {
      return null;
    }
    actions.push({ ...step, machine, key: `${machine.id}:${step.how}` });
  }
  return actions;
}

/**
 * The steps of lighting the engine these machines belong to, each matched to its machine, in
 * order. Null if they are no engine it has the steps for.
 */
export function lightingSteps(
  machines: EngineMachine[],
): EngineAction[] | null {
  for (const steps of ENGINES) {
    const actions = matched(machines, steps);
    if (actions) {
      return actions;
    }
  }
  return null;
}

/**
 * The next step of lighting the engine, given the steps already seen done. Null when there is
 * none left. An emitter is never the next step while any step that is not an emitter is undone,
 * whatever order a list is written in: that rule is kept here, and not left to the lists.
 */
export function nextLightingStep(
  actions: EngineAction[],
  done: string[],
): EngineAction | null {
  const left = actions.filter((action) => !done.includes(action.key));
  return (
    left.find((action) => action.kind !== 'emitter') ??
    left.find((action) => action.kind === 'emitter') ??
    null
  );
}

/** The emitters, each as a step that switches it on or off. */
export function emitterSteps(
  machines: EngineMachine[],
  how: 'switch_on' | 'switch_off',
): EngineAction[] {
  return machines
    .filter((machine) => machine.kind === 'emitter')
    .sort((a, b) => a.nth - b.nth)
    .map((machine) => ({
      kind: 'emitter',
      name: machine.name.toLowerCase(),
      nth: machine.nth,
      how,
      doing:
        how === 'switch_on'
          ? 'switching on an emitter'
          : 'switching off an emitter',
      fails:
        how === 'switch_on'
          ? 'an emitter will not switch on'
          : 'an emitter will not switch off',
      machine,
      key: `${machine.id}:${how}`,
    }));
}

/** The station's batteries, each as a step that sets it to charge. */
export function batterySteps(machines: EngineMachine[]): EngineAction[] {
  return machines
    .filter((machine) => machine.kind === 'battery')
    .sort((a, b) => a.nth - b.nth)
    .map((machine) => ({
      kind: 'battery',
      name: machine.name.toLowerCase(),
      nth: machine.nth,
      how: 'charge',
      doing: 'setting a battery to charge',
      fails: 'a battery will not set',
      machine,
      key: `${machine.id}:charge`,
    }));
}
