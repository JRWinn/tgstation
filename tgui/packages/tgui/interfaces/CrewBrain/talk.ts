/**
 * Puts together one call to the LLM for an NPC that has something to say or to answer.
 *
 * There are a few kinds of moment an NPC talks at: someone has spoken to it, it is meeting someone,
 * its work calls for a line, it has a quiet moment in company, or something has happened that may
 * be worth a word. Each needs different things said to the LLM and asks different things back.
 * Sending all of it every time is what made the prompt long and the answers poor, so each call
 * carries a short fixed part (see prompt.ts) and then only what its own moment needs:
 *
 * - what the NPC remembers is sent only when it was asked something, and only the part of it that
 *   bears on what was said;
 * - what its job has it agree to or turn down is sent only when someone has spoken to it;
 * - the reply holds only the parts that apply, and where there is nothing to choose between, no
 *   choice is asked for.
 *
 * The game and the tests both build their calls here, so what is tested is what is sent.
 */
import { jobFor } from './jobs';
import { describeMemoryFor, notesFor } from './memory';
import { availableOptions, describeOptions } from './options';
import { MOMENTS } from './person';
import {
  buildReplySchema,
  buildSystemPrompt,
  describeReply,
  type ReplyParts,
} from './prompt';
import { describeSituation, describeView } from './situation';
import {
  describeOrdered,
  describeWorkTold,
  workInWords,
  workTold,
} from './tasks';
import type { ChatMessage, NpcBrain, Task } from './types';

const NEWLINE = String.fromCharCode(10);
/** Most lines of earlier talk sent with a call, and how old (milliseconds) the oldest may be. */
const TALK_SHOWN = 8;
const TALK_KEPT_MS = 600000;

/** What has happened that the NPC may speak about. */
export type Moment = {
  /** What its body has sensed since it last spoke, oldest first, one event to a line. */
  report: string[];
  /** Handles of those who have just spoken to it. */
  speakers: string[];
  /** A line its work calls for, in plain words, or null. */
  mustSay: string | null;
  /** TRUE if this is a quiet moment in company, when it may pass a remark or not. */
  remark: boolean;
  /**
   * TRUE if that line is said word for word by the body, and the LLM is asked only for a short
   * remark of its own to follow it: see Plan.exact.
   */
  exact?: boolean;
  /**
   * Who each speaker was, by handle, as the body saw them when they spoke. They may have walked
   * out of view since, and what they said is still theirs.
   */
  heardFrom?: Map<string, Speaker>;
};

/** Someone who spoke to the NPC, as it saw them at the time. */
export type Speaker = {
  name: string;
  /** TRUE if the NPC answers to them: the Captain, or the head of its own department. */
  superior: boolean;
};

/** One call, ready to send, and what the code needs to act on the answer. */
export type TalkCall = {
  messages: ChatMessage[];
  schema: object;
  /** What the reply is to hold. Kept so that it can be asked for again without "think". */
  parts: ReplyParts;
  /** The report as the LLM is sent it. */
  trigger: string;
  /** Whoever has just spoken that the NPC answers to, by name, or null. */
  superior: string | null;
  /** Whoever told it of any work in what was said, by name. */
  toldBy: string | undefined;
  /** An order from someone it answers to, made out from what was said and taken on already, or null. */
  ordered: Task | null;
};

/** How something that ends a conversation and needs no answer begins: thanks, agreement, goodbye. */
const CLOSING_WORDS =
  /^\W*(thanks|thank you|cheers|ta|ok|okay|alright|all right|got it|will do|bye|goodbye|see you|see ya|later|never ?mind)\b/i;
/** The most words such a thing runs to. Anything longer has more in it than a goodbye. */
const CLOSING_MAX_WORDS = 5;

/** TRUE if all someone said was thanks, agreement or goodbye, which may fairly go unanswered. */
function needsNoAnswer(said: string): boolean {
  return (
    CLOSING_WORDS.test(said) &&
    !said.includes('?') &&
    said.trim().split(/\s+/).length <= CLOSING_MAX_WORDS
  );
}

/** What people said in the NPC's hearing in a report, in their own words. */
function wordsHeard(report: string[]): string[] {
  return report
    .filter((line) => line.includes(' says: ') && line.includes('(person '))
    .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
    .map((quoted) => quoted.slice(1, -1));
}

/** The talk before this moment that the LLM is reminded of, as lines. */
function describeTalk(brain: NpcBrain): string[] {
  const earlier = brain.talkLog
    .filter(
      (said) =>
        (said.own || said.reported) && Date.now() - said.at < TALK_KEPT_MS,
    )
    .slice(-TALK_SHOWN);
  if (earlier.length === 0) {
    return [];
  }
  return [
    'What has been said lately:',
    ...earlier.map(
      (said) => `- ${said.own ? 'You' : said.who}: "${said.text}"`,
    ),
  ];
}

/** Builds the call for one moment. Takes on an order made out from what was said, as a side effect. */
export function buildTalk(brain: NpcBrain, moment: Moment): TalkCall {
  const { report, speakers, mustSay } = moment;
  const spokenTo = speakers.length > 0;
  // Who spoke, as they were seen when they said it, and failing that as they are seen now. They
  // may have walked on out of view in the seconds before this turn came.
  const heardFrom = speakers.flatMap((handle) => {
    const then = moment.heardFrom?.get(handle);
    if (then) {
      return [then];
    }
    const now = brain.peopleInView.find((seen) => seen.handle === handle);
    return now ? [{ name: now.name, superior: !!now.superior }] : [];
  });
  // Whoever has just spoken that it answers to, if anyone: the Captain, or the head of its department.
  const superior = heardFrom.find((seen) => seen.superior)?.name ?? null;
  // Whoever spoke is who told it of any work, and who will want to hear when it is done.
  const toldBy = superior ?? heardFrom[0]?.name;
  // An order from someone it answers to is made out by code before the LLM is asked anything.
  // Whether it goes is not for the LLM to decide, and what it says is said knowing it is going.
  const ordered = superior ? workInWords(brain, report, toldBy, true) : null;
  const heard = wordsHeard(report);
  const meeting = report.some((line) =>
    line.includes('you have not seen them before'),
  );
  const options = availableOptions(
    brain,
    spokenTo,
    report.filter((line) => line.includes(' says: ')).join(' '),
    brain.peopleInView.filter((person) => speakers.includes(person.handle)),
  );
  // How it feels is asked about whoever has just spoken to it, and nobody else: someone merely
  // walking into view has done nothing to like or dislike.
  const feelAbout = brain.peopleInView
    .map((person) => person.handle)
    .filter((handle) => speakers.includes(handle));
  // Likewise it is asked whether it has been told of work only when someone it saw has spoken to
  // it, whether or not they are still in view, and not when the order has been made out already.
  const told =
    heardFrom.length > 0 && !ordered ? workTold(brain, !!superior) : null;

  // What this moment is, and what is said about it.
  const about: string[] = [];
  let sayIs: string;
  let maySaySilent: boolean;
  if (moment.exact && mustSay !== null) {
    // The line is the body's, and goes out as it stands. Nothing is asked of the LLM but a
    // remark, and nothing else it might be asked at this moment is put to it.
    about.push(MOMENTS.aside);
    sayIs = 'your own short remark, to follow the line your body is saying.';
    maySaySilent = true;
  } else if (spokenTo) {
    about.push(
      MOMENTS.spokenTo,
      ...(meeting ? [MOMENTS.meetingToo] : []),
      ...(jobFor(brain.job).whenAsked?.(brain, heard.join(' ')) ?? []),
    );
    if (ordered && superior) {
      about.push(describeOrdered(brain, ordered, superior));
    }
    if (mustSay !== null) {
      about.push(MOMENTS.line);
    }
    sayIs = 'your answer, out loud.';
    // Only something that plainly closes the talk may go unanswered. Otherwise it answers, and
    // is not given the choice.
    maySaySilent = mustSay === null && needsNoAnswer(heard.at(-1) ?? '');
    if (maySaySilent) {
      about.push(
        'If all they did was thank you, agree or say goodbye, that needs no answer.',
      );
    }
  } else if (mustSay !== null) {
    about.push(MOMENTS.line, ...(meeting ? [MOMENTS.meetingToo] : []));
    sayIs = 'what the report gives you to say or ask, in your own words.';
    maySaySilent = false;
  } else if (meeting) {
    about.push(MOMENTS.meeting);
    sayIs = 'your greeting.';
    maySaySilent = false;
  } else if (moment.remark) {
    about.push(MOMENTS.remark);
    sayIs = 'your remark.';
    maySaySilent = true;
  } else {
    about.push(MOMENTS.happened);
    sayIs = 'what you say about it, if anything.';
    maySaySilent = true;
  }

  const parts: ReplyParts = {
    think: spokenTo,
    feelAbout,
    workTold: told,
    workIs: told ? describeWorkTold(brain, superior) : '',
    sayIs,
    maySaySilent,
    options,
    note: spokenTo,
  };
  const trigger = [
    ...describeView(brain),
    ...report,
    ...describeSituation(brain),
    ...about,
    ...describeReply(parts),
    ...(options.length > 1 ? describeOptions(options) : []),
  ].join(NEWLINE);

  // What it knows beyond the moment, cut to what the moment needs.
  const said = heard.join(' ');
  const notes = notesFor(brain, said);
  const memory = spokenTo ? describeMemoryFor(brain, brain.now, said) : [];
  const talk = describeTalk(brain);
  const system = [
    buildSystemPrompt(brain.name, brain.job, brain.card, brain.post),
    ...(notes.length > 0
      ? ['', 'Your notes:', ...notes.map((note) => `- ${note}`)]
      : []),
    ...(memory.length > 0 ? ['', ...memory] : []),
    ...(talk.length > 0 ? ['', ...talk] : []),
  ].join(NEWLINE);

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: trigger },
    ],
    schema: buildReplySchema(parts),
    parts,
    trigger,
    superior,
    toldBy,
    ordered,
  };
}
