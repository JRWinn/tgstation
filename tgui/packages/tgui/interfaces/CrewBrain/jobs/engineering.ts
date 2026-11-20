/**
 * What the engineering staff have in common: who is the Chief Engineer and who is an engineer,
 * and the words the engine's work is known by as it passes between them.
 *
 * The Chief Engineer gives its engineer the engine to light, to its face. The engineer says when
 * it is lit, or what stopped it. The Chief Engineer watches the engine from its PDA, and if the
 * crystal starts to come apart it has the emitters switched off. Each of those lines is said or
 * written word for word, and read by code. They are kept here, in one place, so that whoever says
 * a line and whoever hears it cannot come to disagree about it.
 */
import type { NpcBrain } from '../types';

/** TRUE if this job title is the Chief Engineer, who heads the engineering staff. */
export function isChiefEngineer(title: string): boolean {
  return /chief engineer/i.test(title);
}

/** TRUE if this job title is a station engineer: one of the Chief Engineer's staff, who work the engine. */
export function isEngineer(title: string): boolean {
  return /engineer/i.test(title) && !isChiefEngineer(title);
}

export function firstName(name: string): string {
  return name.split(' ')[0];
}

/**
 * The Chief Engineer aboard, as far as this NPC can tell: one in view, or one its PDA lists. Null
 * if there is none, or it is the Chief Engineer itself.
 */
export function chiefAboard(
  brain: NpcBrain,
): { name: string; job: string } | null {
  if (isChiefEngineer(brain.job)) {
    return null;
  }
  return (
    brain.peopleInView.find((person) => isChiefEngineer(person.job)) ??
    brain.pdaPeople.find((person) => isChiefEngineer(person.job)) ??
    null
  );
}

/** The engineers aboard, by name, as far as this NPC can tell: those in view, and those its PDA lists. */
export function engineersAboard(brain: NpcBrain): string[] {
  return [
    ...new Set(
      [...brain.peopleInView, ...brain.pdaPeople]
        .filter((person) => isEngineer(person.job))
        .map((person) => person.name),
    ),
  ];
}

/**
 * What a Chief Engineer has heard of its engineers (ENG-03): the one that has the engine (said it
 * took it, or that it is lit), those that have ever answered in the crew's set words, and how many
 * orders running each has left unanswered. All of it is from what it has heard: a crew member
 * cannot tell a player from another NPC, but it can tell one that answers from one that does not.
 */
type EngineersHeard = {
  has: string | null;
  answered: Set<string>;
  unanswered: Record<string, number>;
};
const engineersHeard = new WeakMap<NpcBrain, EngineersHeard>();
/** How many orders running an engineer may leave unanswered before another is given them. */
export const UNANSWERED_MAX = 2;

function heardOf(brain: NpcBrain): EngineersHeard {
  let heard = engineersHeard.get(brain);
  if (!heard) {
    heard = { has: null, answered: new Set(), unanswered: {} };
    engineersHeard.set(brain, heard);
  }
  return heard;
}

/**
 * Notes that an engineer has answered in the set words. `has` says whether what it said means it
 * has the engine: "the engine is lit" names who has it over "the engine, right away", since the
 * first engineer at a meeting may be given it and another light it.
 */
export function engineerAnswered(
  brain: NpcBrain,
  name: string,
  has?: 'taken' | 'lit',
): void {
  const heard = heardOf(brain);
  heard.answered.add(name);
  heard.unanswered[name] = 0;
  if (has === 'lit' || (has === 'taken' && !heard.has)) {
    heard.has = name;
  }
}

/** Notes that an order given to this engineer went unanswered. Returns how many have, running. */
export function engineerUnanswered(brain: NpcBrain, name: string): number {
  const heard = heardOf(brain);
  heard.unanswered[name] = (heard.unanswered[name] ?? 0) + 1;
  return heard.unanswered[name];
}

/**
 * The engineer a Chief Engineer gives an order to: the one that has the engine, while it is aboard
 * and answering; failing that one that has answered before, then one in sight, then the first its
 * PDA lists. One that has left UNANSWERED_MAX orders unanswered is passed over while there is any
 * other. Taken as the first in sight or on the PDA, the order to switch the emitters off went to a
 * player, or a dead engineer's PDA, and not to the engineer that lit the engine (ENG-03).
 */
export function engineerToOrder(brain: NpcBrain): string | null {
  const names = engineersAboard(brain);
  if (names.length === 0) {
    return null;
  }
  const heard = heardOf(brain);
  const answering = names.filter(
    (name) => (heard.unanswered[name] ?? 0) < UNANSWERED_MAX,
  );
  const pool = answering.length > 0 ? answering : names;
  const inView = (name: string) =>
    brain.peopleInView.some((person) => person.name === name);
  return (
    pool.find((name) => name === heard.has) ??
    pool.find((name) => heard.answered.has(name) && inView(name)) ??
    pool.find((name) => heard.answered.has(name)) ??
    pool.find(inView) ??
    pool[0]
  );
}

/** TRUE if a line is said to this NPC by its first name: "Sam, ..." */
export function saidTo(brain: NpcBrain, line: string): boolean {
  return new RegExp(`^${firstName(brain.name)}\\b`, 'i').test(line.trim());
}

/**
 * TRUE if a line begins with the whole of a set line, whatever remark may follow it: "Ada, the
 * engine is lit. All done in there." begins with litLine('Ada'). Not "Ada, I'll let you know once
 * the engine is lit."
 */
export function beginsWith(text: string, line: string): boolean {
  return text.trim().toLowerCase().startsWith(line.toLowerCase());
}

/**
 * The set words with a reason in them, matched only straight after the listener's first name at
 * the start of the line: "Ada, I cannot light the engine: the nitrogen canister will not connect."
 */
export function matchAfterName(
  text: string,
  name: string,
  words: RegExp,
): RegExpMatchArray | null {
  const said = text.trim();
  const prefix = `${firstName(name)}, `;
  if (!said.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }
  const found = said.slice(prefix.length).match(words);
  return found && found.index === 0 ? found : null;
}

/** The Chief Engineer giving an engineer the engine, to its face: "Sam, the engine is yours. Light it now, please." */
export function lightLine(to: string): string {
  return `${firstName(to)}, the engine is yours. Light it now, please.`;
}
export const LIGHT_WORDS = /\bthe engine is yours\. Light it now, please\b/i;

/** The engineer's word back that it has the engine: "The engine, right away." */
export const ENGINE_TAKEN = 'The engine, right away.';
export const ENGINE_TAKEN_WORDS = /\bthe engine, right away\b/i;

/** The engineer telling the Chief Engineer that every step is done and the emitters are on. */
export function litLine(to: string): string {
  return `${firstName(to)}, the engine is lit.`;
}
export const LIT_WORDS = /\bthe engine is lit\b/i;

/**
 * The engineer telling the Chief Engineer that a step would not take, and which: "Ada, I cannot
 * light the engine: the nitrogen canister will not connect." The emitters have not been touched.
 */
export function stuckLine(to: string, what: string): string {
  return `${firstName(to)}, I cannot light the engine: ${what}.`;
}
export const STUCK_WORDS = /\bI cannot light the engine: ([^.]+)\./i;

/** What an engineer says stopped it when the engine room is not one it has the steps for. */
export const UNKNOWN_ENGINE = 'I do not know this engine';

/**
 * The Chief Engineer having the emitters switched off, because the crystal is coming apart. Said
 * to the engineer's face, or sent by PDA. Nothing comes before it.
 */
export function shutLine(to: string): string {
  return `${firstName(to)}, the engine is losing integrity. Emitters off, now.`;
}
export const SHUT_WORDS = /\bEmitters off, now\b/i;

/** The engineer telling the Chief Engineer that the emitters are off. */
export function offLine(to: string): string {
  return `${firstName(to)}, the emitters are off.`;
}
export const OFF_WORDS = /\bthe emitters are off\b/i;

/** The Chief Engineer sending the engineer to switch the emitters on again: they have stopped, and the crystal is sound. */
export function relightLine(to: string): string {
  return `${firstName(to)}, the emitters have stopped. Switch them on again, please.`;
}
export const RELIGHT_WORDS = /\bSwitch them on again, please\b/i;

/** The engineer telling the Chief Engineer that the emitters are on again. */
export function onAgainLine(to: string): string {
  return `${firstName(to)}, the emitters are on again.`;
}
export const ON_AGAIN_WORDS = /\bthe emitters are on again\b/i;

/**
 * The engineer telling the Chief Engineer that an emitter would not switch off, with the reason the
 * body was given: "Ada, I cannot switch the emitters off: its controls are locked." The others were tried.
 */
export function notOffLine(to: string, why: string): string {
  return `${firstName(to)}, I cannot switch the emitters off: ${why}.`;
}
export const NOT_OFF_WORDS = /\bI cannot switch the emitters off: ([^.]+)\./i;

/** The same for switching them on again. */
export function notOnLine(to: string, why: string): string {
  return `${firstName(to)}, I cannot switch the emitters on again: ${why}.`;
}
export const NOT_ON_WORDS =
  /\bI cannot switch the emitters on again: ([^.]+)\./i;

/**
 * What the body was told when a switch would not take, as the engineer says it to someone: "You
 * cannot reach the emitter to switch it off." becomes "I cannot reach the emitter to switch it off".
 */
export function switchFailReason(text: string | undefined): string {
  const said = (text ?? '')
    .trim()
    .replace(/\.$/, '')
    .replace(/^The emitter will not switch (off|on): /i, '')
    .replace(/^You\b/, 'I')
    .replace(/\byour\b/gi, 'my')
    .replace(/\./g, ',');
  return said || 'it would not take';
}

/**
 * Why a work_machine step did not take, sorted from what the body was told (TRC-04): it never got
 * to the machine or could not reach it ('unreached'), its hands were full or it had no wrench to
 * hand ('hands'), it does not know the machine ('unknown'), or the machine itself would not take
 * ('machine'). A reason the server gives in the result's details (`reason`) is taken first. The
 * words are the server's, in crew_npc_hands.dm and crew_npc_machines.dm: keep them together.
 */
export function machineFailKind(
  text: string | undefined,
  reason?: unknown,
): 'unreached' | 'hands' | 'unknown' | 'machine' {
  if (
    reason === 'unreached' ||
    reason === 'hands' ||
    reason === 'unknown' ||
    reason === 'machine'
  ) {
    return reason;
  }
  const said = text ?? '';
  if (/could not get to it|\bcannot reach\b/i.test(said)) {
    return 'unreached';
  }
  if (/no free hand|\bno wrench\b|get your wrench out/i.test(said)) {
    return 'hands';
  }
  if (
    /know of no such machine|not a machine you know how to work/i.test(said)
  ) {
    return 'unknown';
  }
  return 'machine';
}

/**
 * The Chief Engineer's word back to an engineer who has told it something about the engine: that
 * it heard. Until this comes back the engineer has not passed its word on. The same words the
 * Quartermaster answers its technicians in: see jobs/supply.ts.
 */
export function heardLine(to: string): string {
  return `${firstName(to)}, I have that.`;
}
export const HEARD_WORDS = /\bI have that\b/i;

/** How the Captain, or anyone the Chief Engineer answers to, tells it to have the engine lit again after it was shut off. */
const LIGHT_AGAIN_ORDER =
  /(?:^|[.!,;]\s*|\bplease\s+)(?:re-?light|light|restart|start(?: up)?|turn on)\s+(?:the\s+)?(?:engine|emitters|supermatter|sm)\b|(?:^|[.!,;]\s*|\bplease\s+)(?:turn the engine back on|get the emitters back on|light it again)\b/i;
const LIGHT_AGAIN_REFUSED =
  /\b(?:do not|don't|dont|never|not to)\s+(?:re-?light|light|restart|start|turn on)\b/i;

/**
 * Whether a line is an order to light the engine again: "Light the engine.", "Relight the engine
 * please.", "Ada, light the engine again." A line with "do not" just before the verb, or one that
 * asks ("Why did you not light the engine?"), is not. A leading address to the Chief Engineer,
 * by its first name or its title, is taken off first.
 */
export function isLightAgainOrder(text: string, myName: string): boolean {
  const said = text.trim();
  if (!said || said.endsWith('?') || LIGHT_AGAIN_REFUSED.test(said)) {
    return false;
  }
  const first = firstName(myName).replace(/[^A-Za-z'-]/g, '');
  const address = new RegExp(
    `^(?:${first ? `${first}|` : ''}chief engineer|chief|ce)\\b[,:]?\\s*`,
    'i',
  );
  return LIGHT_AGAIN_ORDER.test(said.replace(address, ''));
}
