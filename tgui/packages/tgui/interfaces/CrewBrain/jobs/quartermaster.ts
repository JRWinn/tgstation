/**
 * The Quartermaster: head of the supply staff. Every order aboard goes through it.
 *
 * - A head of department, or the Captain, sends it an order by PDA. It writes the order in its
 *   order book under a number, and sends word back that it is noted.
 * - Every order is paid for out of cargo's one budget. A big purchase wants the Captain's say
 *   first: more than 1,000 credits, or more than half of what is free in the budget. It asks by
 *   PDA, twice at most, three minutes apart, and then holds the order. With no Captain aboard it
 *   clears the order itself and writes down that it did. An order the budget cannot cover is
 *   held until the money is there.
 * - It delegates: it never places an order at the console. It walks up to one of its
 *   technicians and gives them the order to their face. Nothing between it and its technicians
 *   goes by PDA.
 * - When the order comes in the technician tells it so, face to face, knocking at its office
 *   door if that is where it is. It writes the crate numbers in the book and sends them to
 *   whoever ordered. Word that a crate is still waiting, or has been lost, comes to it the same
 *   way, and it passes that on too. A lost crate it has ordered again, once.
 * - It holds a staff meeting in the room its technicians work from, called aloud. Each reports
 *   the crates it has brought in and sent out. At the first one it divides their standing work
 *   between them: the counter, the shuttle and the rooms.
 *
 * The order book is a sheet of paper it carries. It starts the shift with none, and its first job
 * is to go and find some. If there is none to find it orders some, the way it would order
 * anything, and opens that crate itself when it comes. What it has taken down in its head is
 * written up when it has paper. The book is what it knows: with nothing in its head and a book
 * with writing in it, the window having been closed and opened again, it reads the book and
 * carries on from there.
 *
 * All of that is code, the numbers included. The LLM answers people in its voice.
 */
import { answersTo, isHead } from '../hierarchy';
import { addTask, blockTask, findTask, finishTask } from '../tasks';
import type {
  Ledger,
  LedgerOrder,
  NpcBrain,
  PersonInView,
  Plan,
  SenseEvent,
  Task,
} from '../types';
import { itemsAskedFor } from './cargo';
import {
  captainName,
  hearReport,
  MEET,
  type Meeting,
  type MeetingWay,
  meetingActed,
  meetingSaid,
  meetStep,
  present,
  syncMeeting,
  workReported,
} from './head';
import type { Job } from './job';
import { isMeetingOrder } from './meetings';
import { totalWords } from './reports';
import {
  CANNOT_ORDER,
  cratesTold,
  cratesWritten,
  DOCKED_WORDS,
  dutiesFor,
  dutiesIn,
  dutyLine,
  GIVEN_WORDS,
  isQuartermaster,
  isTechnician,
  LOST_TOLD_WORDS,
  NOT_PLACED_WORDS,
  NOTED,
  ORDERING,
  orderSpoken,
  orderWritten,
  SHUT_IN_WORDS,
  seeToLine,
  TAKEN_WORDS,
  tryAgainLine,
  WAITING_TOLD_WORDS,
  WONT_COME_WORDS,
  WORD_HEARD,
  WORD_HEARD_WORDS,
} from './supply';

/** Writing up what it has yet to write in its order book. */
const WRITE = 'qm_write';
/** Going to find paper to keep its order book on. */
const PAPER = 'qm_paper';
/** Giving an order to one of its technicians, face to face. The task's item is the order's number. */
const GIVE = 'qm_give';
/** Opening a crate of its own that has come in. The task's item is the order's number. */
const UNPACK = 'qm_unpack';
/** Sending one of its technicians to see to something a workmate could not, face to face. */
const SEND = 'qm_send';
/** How long (deciseconds) such a sending is worth making. After that the trouble is over, or someone has told it again. */
const SEND_STANDS_DS = 3000;
/** Coming out of its office to a knock at the door. */
const KNOCK = 'qm_knock';
/** Going back to its office when there is nothing to see to. */
const OFFICE = 'qm_office';

/** An order of more than this many credits wants the Captain's say. So does one of more than half of what is free in the budget. */
const BIG_PURCHASE_CR = 1000;
/** How long (deciseconds) it waits for the Captain's answer before it asks again, and how many times it asks. */
const CAPTAIN_WAIT_DS = 1800;
const CAPTAIN_ASKS = 2;
/** How long (deciseconds) it waits to hear a technician say they have the order before it gives it again. */
const TAKEN_WAIT_DS = 600;
/** How long (deciseconds) an order that could not be placed is left before it is given again. */
const PLACE_AGAIN_DS = 1200;
/** How long (deciseconds) it leaves it before it looks for paper again, having found none. */
const PAPER_AGAIN_DS = 3000;
/** How long (deciseconds) a knock at its office door stands, and how long it stays out to hear what is wanted. */
const KNOCK_STANDS_DS = 600;
const STAY_OUT_DS = 450;
/**
 * How long (deciseconds) into its shift it calls its first staff meeting: first thing, so that the
 * work is divided before there is any of it, and its technicians are not shut up in a meeting
 * when the first people come to the counter and the door.
 */
const FIRST_MEETING_DS = 300;
/** The most lines it writes in its order book in one go. The server writes no more than this at once. */
const LINES_AT_ONCE = 6;
/** How far off (tiles) a technician has to be standing before it walks up to them to speak. */
const SPEAKING_DISTANCE = 2;
/** The most characters a body can say at once, or send in one PDA message. Past that the end is cut off. */
const SAID_MAX = 200;

/** The words that mark what a head says or writes to it as an order for supplies. */
const ORDER_WORDS =
  /\b(order|ordering|requisition|buy|purchase)\b|\b(need|want|get|send)\b[^.?!]*\bcrates?\b/i;
/**
 * The words of the Captain's answer about a purchase. A bare "no" is a refusal only standing on
 * its own ("No.", "No, not now.", "the answer is no") or as "no to order 2": "no rush", "no one",
 * "no worries" and "no need to ask" are not. "Don't" is a refusal only of the buying itself.
 */
const NO_WORDS =
  /^\s*no\b(?=\s*([.!,;:]|$|to\b))|\bno[.!]?\s*$|\bno to\b|\bno,? thanks?\b|\bno thank you\b|\b(nope|nah|denied|deny|refused?|rejected?|negative|cancel)\b|\bnot (approved?|ok(ay)?|fine|granted|authori[sz]ed|now)\b|\b(don'?t|do not)\s+(buy|order|get|place|approve|go ahead|bother|do it)\b/i;
const YES_WORDS =
  /\b(yes|yep|yeah|aye|approved?|granted|go ahead|go on|go for it|do it|buy it|get it|place it|places? (that|the|your) order|put it through|fine|ok|okay|sure|agreed|authori[sz]ed|affirmative|absolutely|of course|green light|sounds good|very well|all ?right|no (objection|problem))\b/i;
/** A yes said the other way about: "not approved", "don't buy it". Taken out before the yes is looked for. */
const NEGATED_YES =
  /\b(not|never|don'?t|do not)\s+(approved?|ok(ay)?|fine|granted|authori[sz]ed|agreed|buy it|get it|do it|place it|go ahead|go for it|put it through)\b/gi;
/** An order named by its number: "order 3", "order #3", "#3". A bare number is a count of crates. */
const ORDER_NUMBER = /(?:\border\s*#?|#)\s*\d+\b/i;
/** The words of a head calling an order off. */
const CANCEL_WORDS =
  /\b(cancel|call (it |that |the order )?off|scrap|no longer need|never ?mind|don'?t (order|need|want|bother)|do not (order|need|want|bother))\b/i;
/**
 * A clause that asks after an order: one that opens with a question word, and is about an order
 * or a crate. Not one that opens with can, could, would, will or may: that is an order put kindly.
 */
const QUESTION_WORDS =
  /(^|[.!?]\s*)(has|have|did|is|are|was|were|where|when|why|what|how)\b[^.?!]*\b(orders?|crates?|lights|supplies|come in|arrived?)\b/i;
/** Asking after an order by its number: "order 3, status?", "order 3 come in yet". */
const ASKED_AFTER_WORDS = /\b(come in|arrived?|status|where)\b/i;
/** A line of this many words or more is no answer about an order, unless it names the order. */
const ANSWER_WORDS = 12;
/**
 * The words that mark what the Captain says as being about an order, when it is neither a plain
 * yes or no nor an order that names a crate. With one waiting on their say, it is asked about.
 */
const ABOUT_ORDER_WORDS =
  /\b(orders?|crates?|purchase|buy|supplies|budget|credits)\b/i;
/** How many times the Captain is asked what they meant about one order. */
const UNCLEAR_ASKS = 2;
/** The kind of crate that has paper in it, by the words in its name. */
const PAPER_CRATE = /bureaucracy|paper|stationery/i;

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** Writes a short list the way it is said: "a", "a and b", "a, b and c". */
function listed(names: string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Begins a sentence with a capital. */
function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** An amount of credits as it is written: "1,200". */
function credits(amount: number): string {
  return amount.toLocaleString('en-US');
}

/** The job of someone it knows of, by name: from sight, or from its PDA. */
function jobOf(brain: NpcBrain, name: string): string {
  return (
    brain.peopleInView.find((person) => person.name === name)?.job ??
    brain.pdaPeople.find((person) => person.name === name)?.job ??
    ''
  );
}

/** Its technicians, by name: those in view, and those its PDA lists. */
function technicians(brain: NpcBrain): string[] {
  return [
    ...new Set(
      [...brain.peopleInView, ...brain.pdaPeople]
        .filter((person) => isTechnician(person.job))
        .map((person) => person.name),
    ),
  ];
}

/** Its working copy of the order book, made the first time it is wanted. */
function ledgerOf(brain: NpcBrain): Ledger {
  brain.ledger ??= {
    orders: [],
    next: 1,
    toWrite: [],
    read: false,
    paperRetryAt: 0,
    cameOutAt: 0,
    duties: {},
    heldUp: {},
    sendFor: null,
  };
  return brain.ledger;
}

/** What an order comes to, at what the server says each crate costs. */
function costOf(brain: NpcBrain, items: LedgerOrder['items']): number {
  return items.reduce(
    (total, item) => total + (brain.crateCosts[item.crate] ?? 0) * item.count,
    0,
  );
}

/** What is left in the budget once the orders already cleared, and not yet come in, are paid for. */
function moneyFree(brain: NpcBrain, ledger: Ledger): number | null {
  if (brain.budget === null) {
    return null;
  }
  const spoken = ledger.orders
    .filter((order) => order.state === 'cleared' || order.state === 'given')
    .reduce((total, order) => total + order.cost, 0);
  return brain.budget - spoken;
}

/** Sends someone a PDA message, once the driver gets to it. */
function sendWord(
  brain: NpcBrain,
  to: string,
  line: string,
  why: string,
): void {
  brain.toTell.push({ to, line, why, byPda: true, at: Date.now() });
}

/**
 * The lines of the order book, as they are written and as they are read back. Each begins with
 * the order it is about: "Order 3. Given to Sam Tech." Not with the bare number: paper in the
 * game sets a line that begins "3." as an item in a numbered list, and renumbers it.
 */
const BOOK = {
  taken: (order: LedgerOrder) =>
    `Order ${order.n}. From ${order.from}, ${order.fromJob}: ${orderWritten(order.items)}. ${order.cost} cr.`,
  asked: (order: LedgerOrder) => `Order ${order.n}. Asked the Captain.`,
  yes: (order: LedgerOrder) => `Order ${order.n}. The Captain said yes.`,
  no: (order: LedgerOrder) => `Order ${order.n}. The Captain said no.`,
  cancelled: (order: LedgerOrder, by: string) =>
    `Order ${order.n}. Cancelled by ${by}.`,
  self: (order: LedgerOrder) =>
    `Order ${order.n}. No Captain aboard: approved by me.`,
  small: (order: LedgerOrder) =>
    `Order ${order.n}. No longer a big purchase: approved by me.`,
  silent: (order: LedgerOrder) =>
    `Order ${order.n}. No answer from the Captain: held.`,
  short: (order: LedgerOrder, have: number) =>
    `Order ${order.n}. Held for money: ${order.cost} cr wanted, ${have} cr in the budget.`,
  given: (order: LedgerOrder, to: string) =>
    `Order ${order.n}. Given to ${to}.`,
  failed: (order: LedgerOrder) => `Order ${order.n}. Could not be placed.`,
  docked: (order: LedgerOrder, itemised: string) =>
    `Order ${order.n}. Docked: ${itemised}.`,
  lost: (order: LedgerOrder, written: string, again: number | null) =>
    `Order ${order.n}. Lost: ${written}.${again === null ? '' : ` Ordered again as order ${again}.`}`,
};

/** An order as it stands the moment it is taken down. */
function newOrder(
  n: number,
  from: string,
  fromJob: string,
  items: LedgerOrder['items'],
  cost: number,
): LedgerOrder {
  return {
    n,
    from,
    fromJob,
    items,
    cost,
    state: 'new',
    approved: null,
    askedAt: null,
    asks: 0,
    waitingTold: false,
    shortTold: false,
    pick: null,
    walkedUp: false,
    givenTo: null,
    givenAt: null,
    taken: false,
    retryAt: 0,
  };
}

/**
 * Reads the order book back into orders: what a Quartermaster with nothing in its head knows from
 * the book it carries. Each order is as far on as the last line written about it says. `self` is
 * the Quartermaster's own name: an order from itself is one for something it needed.
 */
export function readBook(
  lines: string[],
  now: number,
  self?: string,
): LedgerOrder[] {
  const orders: LedgerOrder[] = [];
  for (const line of lines) {
    const entry = line.trim().match(/^Order (\d+)\. (.*)$/);
    if (!entry) {
      continue;
    }
    const n = Number(entry[1]);
    const rest = entry[2];
    const taken = rest.match(/^From (.+?), ([^:]+): (.+)\. (\d+) cr\.$/);
    if (taken) {
      const items = taken[3]
        .split(', ')
        .map((part) => part.match(/^(\d+) (.+)$/))
        .filter((part): part is RegExpMatchArray => !!part)
        .map((part) => ({ crate: part[2], count: Number(part[1]) }));
      const order = newOrder(n, taken[1], taken[2], items, Number(taken[4]));
      order.own = !!self && taken[1] === self;
      orders.push(order);
      continue;
    }
    const order = orders.find((it) => it.n === n);
    if (!order) {
      continue;
    }
    const given = rest.match(/^Given to (.+)\.$/);
    const docked = rest.match(/^Docked: (.+)\.$/);
    const cancelled = rest.match(/^Cancelled by (.+)\.$/);
    if (/^Asked the Captain\.$/.test(rest)) {
      order.state = 'asking';
      order.askedAt = now;
      order.asks = 1;
    } else if (/^The Captain said yes\.$/.test(rest)) {
      order.approved = 'captain';
      order.state = 'new';
    } else if (/^The Captain said no\.$/.test(rest)) {
      order.state = 'refused';
    } else if (cancelled) {
      order.state = 'refused';
      order.cancelledBy = cancelled[1];
    } else if (/^No Captain aboard|^No longer a big purchase/.test(rest)) {
      order.approved = 'self';
      order.state = 'new';
    } else if (/^No answer from the Captain/.test(rest)) {
      order.state = 'asking';
      order.askedAt = now;
      order.asks = CAPTAIN_ASKS;
      order.waitingTold = true;
    } else if (/^Held for money/.test(rest)) {
      order.shortTold = true;
    } else if (given) {
      order.state = 'given';
      order.givenTo = given[1];
      order.givenAt = now;
      // Written down as given, it was given. Whoever has it will say when it comes in.
      order.taken = true;
    } else if (/^Could not be placed\.$/.test(rest)) {
      order.state = 'new';
      order.givenTo = null;
    } else if (docked) {
      order.state = 'docked';
      order.crates = cratesTold(docked[1]);
      // What it did about its own crate after that is not in the book. It is taken to be opened:
      // opening one twice is not possible, and looking for paper again costs a walk.
      order.unpacked = true;
    } else if (/^Lost: /.test(rest)) {
      order.reordered = true;
    }
  }
  return orders;
}

/** TRUE while an order still has something to be done about it. */
function isOpen(order: LedgerOrder): boolean {
  return order.state !== 'docked' && order.state !== 'refused';
}

/**
 * Takes an order down: gives it a number, writes it in the book, and sends word back that it is
 * noted. The same order from the same person while one is still in hand is not taken twice.
 */
function takeOrder(
  brain: NpcBrain,
  from: string,
  job: string,
  said: string,
): void {
  const ledger = ledgerOf(brain);
  const items = itemsAskedFor(said.toLowerCase(), brain.orderable);
  if (items.length === 0) {
    // Only an outright order for something it cannot get is answered. Anything else is talk, and
    // so is a line about an order in the book by its number: "no to order 3".
    if (
      /\b(order|ordering|requisition)\b/i.test(said) &&
      !ORDER_NUMBER.test(said)
    ) {
      sendWord(
        brain,
        from,
        `${CANNOT_ORDER}, ${firstName(from)}. What cargo can get just now: ${listed(brain.orderable) || 'nothing'}.`,
        `${from} has sent you an order for something cargo cannot get. You are sending word back to say so, and what can be had.`,
      );
    }
    return;
  }
  const same = ledger.orders.find(
    (order) =>
      isOpen(order) &&
      order.from === from &&
      orderWritten(order.items) === orderWritten(items),
  );
  if (same) {
    sendWord(
      brain,
      from,
      `${NOTED} ${same.n} already: ${orderWritten(same.items)}. It is in hand.`,
      `${from} has sent you an order you already have in your book as order ${same.n}. You are sending word back that it is in hand.`,
    );
    return;
  }
  const order = newOrder(
    ledger.next++,
    from,
    job || 'crew',
    items,
    costOf(brain, items),
  );
  // The Captain's own order has the Captain's say already.
  if (/captain/i.test(job)) {
    order.approved = 'captain';
  }
  ledger.orders.push(order);
  ledger.toWrite.push(BOOK.taken(order));
  sendWord(
    brain,
    from,
    `${NOTED} ${order.n}: ${orderWritten(items)}, ${credits(order.cost)} credits. I will send you the crate numbers when it comes in.`,
    `${from} has sent you an order. You have taken it down as order ${order.n} and are sending word back that it is noted.`,
  );
}

/**
 * Takes down an order of its own: something it needs for its own work, and could not find. It
 * goes in the book and through the same clearing as anyone's, and is given to a technician to
 * place. Nobody is sent word of it: it is its own.
 */
function orderForItself(brain: NpcBrain, crate: string): void {
  const ledger = ledgerOf(brain);
  const items = [{ crate, count: 1 }];
  // One at a time: not while one of its own is on its way, or has come and is not yet opened.
  if (
    ledger.orders.some(
      (order) =>
        order.own &&
        (isOpen(order) || (order.state === 'docked' && !order.unpacked)),
    )
  ) {
    return;
  }
  const order = newOrder(
    ledger.next++,
    brain.name,
    'Quartermaster',
    items,
    costOf(brain, items),
  );
  order.own = true;
  ledger.orders.push(order);
  ledger.toWrite.push(BOOK.taken(order));
}

/** The order of those the Captain has been asked about that an answer is to: the one it names, or the one asked about first. */
export function orderAnswered(
  ledger: Ledger,
  text: string,
): LedgerOrder | undefined {
  const asking = ledger.orders.filter(
    (order) => order.state === 'asking' && order.approved === null,
  );
  // A number names an order only after "order" or "#": "yes, 2 crates" is no order number.
  const named = [...text.matchAll(/(?:\border\s*#?|#)\s*(\d+)\b/gi)].map(
    (found) => Number(found[1]),
  );
  const byNumber = asking.find((order) => named.includes(order.n));
  if (byNumber) {
    return byNumber;
  }
  // A line that names another order is about that one: "cancel order 3" is no refusal of order 1.
  if (named.length > 0) {
    return undefined;
  }
  // With none named, the answer is to the question asked last: the message in front of them.
  return [...asking].sort(
    (one, other) => (other.askedAt ?? -1) - (one.askedAt ?? -1),
  )[0];
}

/**
 * What a line says as a yes or a no: both are looked for, and a line with both is unclear. NULL
 * if it has neither.
 */
export function yesOrNo(text: string): 'yes' | 'no' | 'unclear' | null {
  const no = NO_WORDS.test(text);
  const yes = YES_WORDS.test(text.replace(NEGATED_YES, ' '));
  if (yes && no) {
    return 'unclear';
  }
  return yes ? 'yes' : no ? 'no' : null;
}

/**
 * Reads what the Captain has said or written as its answer about a purchase, if it is one.
 * Returns TRUE if it was. An answer is short, or names the order, and orders nothing of its own:
 * a line that names a crate is a new order, and its yes or no is asked about (see `headsLine`).
 * One with a yes and a no in it is asked about too, rather than guessed at.
 */
function readAnswer(
  brain: NpcBrain,
  captain: string,
  text: string,
  aloud: boolean,
): boolean {
  const ledger = ledgerOf(brain);
  const order = orderAnswered(ledger, text);
  // "Is order 2 approved?" asks; it does not answer.
  if (!order || sortLine(text) === 'question') {
    return false;
  }
  const namesIt = new RegExp(`(?:\\border\\s*#?|#)\\s*${order.n}\\b`, 'i').test(
    text,
  );
  const words = text.split(/\s+/).filter(Boolean).length;
  if (
    (!namesIt && words >= ANSWER_WORDS) ||
    itemsAskedFor(text.toLowerCase(), brain.orderable).length > 0
  ) {
    return false;
  }
  const answer = yesOrNo(text);
  if (answer === null) {
    return false;
  }
  if (answer === 'unclear') {
    // Asked at most twice; after that the line is let go, and the order waits.
    askWhatWasMeant(brain, captain, text, aloud, true);
    return true;
  }
  if (answer === 'no') {
    order.state = 'refused';
    ledger.toWrite.push(BOOK.no(order));
    if (!order.own) {
      sendWord(
        brain,
        order.from,
        `The Captain has said no to order ${order.n}: ${orderWritten(order.items)}. It will not be ordered.`,
        `The Captain has refused order ${order.n}, which ${order.from} sent you. You are sending ${order.from} word of it.`,
      );
    }
    return true;
  }
  order.approved = 'captain';
  order.state = 'new';
  ledger.toWrite.push(BOOK.yes(order));
  return true;
}

/**
 * Asks the Captain what they meant. With an order waiting on their say, something they say or
 * write about an order that is no plain yes or no, and names no crate, is most likely their
 * answer in other words: "place that order you asked me about". Taken for a new order, it was
 * answered with "I cannot order that", and the order it was about waited for the rest of the shift.
 *
 * It asks in the way it was spoken to: aloud to someone standing there, by PDA otherwise.
 * `plainly` is TRUE when the line had a yes or a no in it that could not be taken as the answer:
 * both at once, or said with a new order. Then it asks whatever else the line is about.
 * Returns TRUE if it asked.
 */
function askWhatWasMeant(
  brain: NpcBrain,
  captain: string,
  text: string,
  aloud: boolean,
  plainly = false,
): boolean {
  const ledger = ledgerOf(brain);
  const order = orderAnswered(ledger, text);
  if (
    !order ||
    (!plainly &&
      (!ABOUT_ORDER_WORDS.test(text) ||
        itemsAskedFor(text.toLowerCase(), brain.orderable).length > 0)) ||
    (order.unclear ?? 0) >= UNCLEAR_ASKS
  ) {
    return false;
  }
  order.unclear = (order.unclear ?? 0) + 1;
  const about = `order ${order.n}: ${orderWritten(order.items)}`;
  const why = `${captain} has said something about an order, and order ${order.n} is waiting on the Captain's say. You could not tell whether it was a yes or a no, so you are asking.`;
  if (aloud) {
    const line = `${firstName(captain)}, is that a yes or a no to ${about}?`;
    brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
    brain.toTell.push({
      to: captain,
      line,
      why,
      exact: true,
      whileBusy: true,
      at: Date.now(),
    });
  } else {
    sendWord(
      brain,
      captain,
      `Captain, is that a yes or a no to ${about}?`,
      why,
    );
  }
  return true;
}

/**
 * What a head's line to it is, sorted in code before anything is done about it: a call to cancel
 * an order, a question about one, an order, or talk. Only an order is taken down. A question is
 * one that opens with a question word: "Can we get a crate of lights?" and "Could you order
 * janitorial supplies?" are orders. "Don't order any more lights" calls nothing off and orders
 * nothing: it is talk.
 */
export function sortLine(
  text: string,
): 'cancel' | 'question' | 'order' | 'talk' {
  if (CANCEL_WORDS.test(text)) {
    return /\b(don'?t|do not)\b/i.test(text) &&
      /\b(any ?more|again)\b/i.test(text)
      ? 'talk'
      : 'cancel';
  }
  if (
    QUESTION_WORDS.test(text) ||
    (ORDER_NUMBER.test(text) && ASKED_AFTER_WORDS.test(text))
  ) {
    return 'question';
  }
  return ORDER_WORDS.test(text) ? 'order' : 'talk';
}

/** The order numbers a line names, after "order" or "#". */
function numbersNamed(text: string): number[] {
  return [...text.matchAll(/(?:\border\s*#?|#)\s*(\d+)\b/gi)].map((found) =>
    Number(found[1]),
  );
}

/**
 * The orders in its book a head's line is about, the latest first: those it names by number, else
 * those for the kinds of crate it names, else those the speaker sent. A head is told only of its
 * own; the Captain of any, and of every order in hand when the line is not about their own.
 */
function ordersMeant(
  brain: NpcBrain,
  from: string,
  job: string,
  text: string,
): LedgerOrder[] {
  const ledger = ledgerOf(brain);
  const captain = /captain/i.test(job);
  const theirs = (order: LedgerOrder) => captain || order.from === from;
  const named = numbersNamed(text);
  const kinds = itemsAskedFor(text.toLowerCase(), brain.orderable).map(
    (item) => item.crate,
  );
  let found: LedgerOrder[];
  if (named.length > 0) {
    found = ledger.orders.filter((order) => named.includes(order.n));
  } else if (kinds.length > 0) {
    const forKinds = ledger.orders.filter((order) =>
      order.items.some((item) => kinds.includes(item.crate)),
    );
    const own = forKinds.filter((order) => order.from === from);
    found = own.length > 0 ? own : forKinds;
  } else if (captain && !/\b(my|mine)\b/i.test(text)) {
    found = ledger.orders.filter(isOpen);
  } else {
    found = ledger.orders.filter((order) => order.from === from);
  }
  return found.filter(theirs).sort((one, other) => other.n - one.n);
}

/** Where an order stands, in a few plain words, as whoever asks after it is told. */
function toldStanding(order: LedgerOrder): string {
  switch (order.state) {
    case 'asking':
      return order.waitingTold
        ? 'held, as the Captain has not answered'
        : "waiting on the Captain's say";
    case 'cleared':
      return 'cleared, and being given to a technician to place';
    case 'given':
      return `given to ${order.givenTo} to place; not come in yet`;
    case 'docked':
      return order.crates?.length
        ? `come in, as ${cratesWritten(order.crates.map((crate) => crate.number))}`
        : 'come in';
    case 'refused':
      return order.cancelledBy
        ? `cancelled by ${order.cancelledBy}`
        : 'refused by the Captain';
    default:
      return order.shortTold
        ? 'held until the budget can pay for it'
        : 'taken down, and being seen to';
  }
}

/** Answers someone in the way they spoke: aloud to their face, by PDA otherwise. */
function answer(
  brain: NpcBrain,
  to: string,
  line: string,
  why: string,
  aloud: boolean,
): void {
  if (!aloud) {
    sendWord(brain, to, line, why);
    return;
  }
  const said = `${firstName(to)}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  brain.toTell = brain.toTell.filter((tell) => tell.line !== said);
  brain.toTell.push({ to, line: said, why, whileBusy: true, at: Date.now() });
}

/**
 * Answers a head's question about an order from its book, in code: "Order 1, 1 Replacement
 * Lights for Hop Kins: given to Sam Tech to place; not come in yet." A question that is about no
 * order, number or crate is left to the voice.
 */
function answerAbout(
  brain: NpcBrain,
  from: string,
  job: string,
  text: string,
  aloud: boolean,
): void {
  if (
    !/\border/i.test(text) &&
    numbersNamed(text).length === 0 &&
    itemsAskedFor(text.toLowerCase(), brain.orderable).length === 0
  ) {
    return;
  }
  const orders = ordersMeant(brain, from, job, text);
  const why = `${from} has asked after an order. You are telling them where it stands, from your order book.`;
  if (orders.length === 0) {
    answer(
      brain,
      from,
      /\b(my|mine)\b/i.test(text) || !/captain/i.test(job)
        ? 'I have no order from you in my book like that.'
        : 'I have no order like that in my book.',
      why,
      aloud,
    );
    return;
  }
  let line = '';
  for (const order of orders.slice(0, 3)) {
    const part = `Order ${order.n}, ${orderWritten(order.items)} for ${order.own ? 'me' : order.from}: ${toldStanding(order)}.`;
    if (line && line.length + part.length + 1 > SAID_MAX - 12) {
      break;
    }
    line = line ? `${line} ${part}` : part;
  }
  answer(brain, from, line, why, aloud);
}

/**
 * Calls off the order a head or the Captain says to cancel: their own, or for the Captain anyone's.
 * One not yet given to a technician is cancelled, written so in the book, and whoever ordered is
 * told. One already given, or come in, is said to be past calling off.
 */
function cancelOrder(
  brain: NpcBrain,
  from: string,
  job: string,
  text: string,
  aloud: boolean,
): void {
  const ledger = ledgerOf(brain);
  const meant = ordersMeant(brain, from, job, text);
  const order =
    meant.find(
      (it) =>
        it.state === 'new' || it.state === 'asking' || it.state === 'cleared',
    ) ??
    meant.find(isOpen) ??
    meant[0];
  const why = `${from} has told you to cancel an order. You are saying what has been done about it.`;
  if (!order) {
    answer(
      brain,
      from,
      'I have no order like that in my book to cancel.',
      why,
      aloud,
    );
    return;
  }
  const about = `order ${order.n}: ${orderWritten(order.items)}`;
  switch (order.state) {
    case 'given':
      answer(
        brain,
        from,
        `${capital(about)} is already with ${order.givenTo} to place. It cannot be called off now.`,
        why,
        aloud,
      );
      return;
    case 'docked':
      answer(brain, from, `${capital(about)} has come in already.`, why, aloud);
      return;
    case 'refused':
      answer(brain, from, `${capital(about)} is off already.`, why, aloud);
      return;
  }
  order.state = 'refused';
  order.cancelledBy = from;
  ledger.toWrite.push(BOOK.cancelled(order, from));
  answer(brain, from, `${capital(about)} is cancelled.`, why, aloud);
  if (!order.own && order.from !== from) {
    sendWord(
      brain,
      order.from,
      `${from} has cancelled order ${order.n}: ${orderWritten(order.items)}. It will not be ordered.`,
      `${from} has called off order ${order.n}, which ${order.from} sent you. You are sending ${order.from} word of it.`,
    );
  }
}

/**
 * What a head or the Captain says or sends it that is not the Captain's plain answer about an
 * order: a call to cancel one, a question about one, an order of their own, or, from the Captain
 * with an order waiting on their say, words about it that it cannot read. Returns TRUE if the
 * line was theirs to it.
 */
function headsLine(
  brain: NpcBrain,
  from: string,
  job: string,
  text: string,
  aloud: boolean,
): boolean {
  if (!isHead(job)) {
    return false;
  }
  const captain = /captain/i.test(job);
  const kind = sortLine(text);
  if (kind === 'cancel') {
    cancelOrder(brain, from, job, text, aloud);
    return true;
  }
  if (kind === 'question') {
    answerAbout(brain, from, job, text, aloud);
    return true;
  }
  // Something the Captain has said about an order, with one waiting on their say, that is no
  // plain answer and names no crate: asked about, not taken for a new order.
  if (captain && askWhatWasMeant(brain, from, text, aloud)) {
    return true;
  }
  if (kind !== 'order') {
    return false;
  }
  takeOrder(brain, from, job, text);
  // "Ok, order me a crate of lights" with order 1 waiting: the new order is taken, and whether
  // the ok was to order 1 is asked, not guessed.
  if (captain && yesOrNo(text) !== null) {
    askWhatWasMeant(brain, from, text, aloud, true);
  }
  return true;
}

/** Asks the Captain, by PDA, whether an order may be placed. The numbers are the server's. */
function askCaptain(
  brain: NpcBrain,
  order: LedgerOrder,
  captain: string,
): void {
  const who = order.own
    ? 'I want'
    : `${order.fromJob === 'crew' ? '' : `the ${order.fromJob} `}${order.from} wants`;
  const money =
    brain.budget === null
      ? `${credits(order.cost)} credits`
      : `${credits(order.cost)} credits of ${credits(brain.budget)} in the budget`;
  const lines = [
    `Captain, order ${order.n}: ${who} ${orderWritten(order.items)}: ${money}. Yes or no?`,
    `Captain, order ${order.n}: ${order.own ? 'I want' : `${order.from} wants`} ${orderWritten(order.items)}: ${money}. Yes or no?`,
    `Captain, order ${order.n} from ${order.own ? 'me' : order.from}: ${money}. Yes or no?`,
  ];
  sendWord(
    brain,
    captain,
    lines.find((line) => line.length <= SAID_MAX) ?? lines[2],
    `Order ${order.n} is a big purchase: more than ${credits(BIG_PURCHASE_CR)} credits, or more than half of what is free in the budget. It wants the Captain's say, and you are asking ${captain} by PDA.`,
  );
  order.askedAt = brain.now;
  order.asks++;
}

/** Tells whoever ordered something, by PDA. Its own order is nobody's to tell. */
function tellOrderer(
  brain: NpcBrain,
  order: LedgerOrder,
  line: string,
  why: string,
): void {
  if (!order.own) {
    sendWord(brain, order.from, line, why);
  }
}

/**
 * Sees each order through what stands between taking it and giving it to a technician: the
 * Captain's say, if it is a big one, and the money to pay for it.
 */
function clearOrders(brain: NpcBrain, ledger: Ledger): void {
  const captain = captainName(brain);
  for (const order of ledger.orders) {
    if (order.state === 'asking' && order.approved === null) {
      // The Captain was asked because it was a big purchase when it was taken. With more in the
      // budget since, it may be one no longer, and then it wants nobody's say: an order for 400
      // credits waited on the Captain to the end of a shift that had 1,960 to spend.
      const freeNow = moneyFree(brain, ledger);
      if (
        freeNow !== null &&
        order.cost <= BIG_PURCHASE_CR &&
        order.cost <= freeNow / 2
      ) {
        order.approved = 'self';
        order.state = 'new';
        ledger.toWrite.push(BOOK.small(order));
        if (captain) {
          sendWord(
            brain,
            captain,
            `Captain, order ${order.n} no longer needs your say: there are ${credits(freeNow)} credits free in the budget now, and it comes to ${credits(order.cost)}. I am having it placed.`,
            `There is more in the budget than when you asked the Captain about order ${order.n}, and it is no longer a big purchase. You are having it placed, and sending the Captain word of that.`,
          );
        }
      }
    }
    if (order.state === 'asking' && order.approved === null) {
      if (
        order.askedAt !== null &&
        brain.now - order.askedAt > CAPTAIN_WAIT_DS
      ) {
        if (order.asks < CAPTAIN_ASKS && captain) {
          askCaptain(brain, order, captain);
        } else if (!order.waitingTold) {
          order.waitingTold = true;
          ledger.toWrite.push(BOOK.silent(order));
          tellOrderer(
            brain,
            order,
            `Order ${order.n} is waiting on the Captain's say: it comes to ${credits(order.cost)} credits. I have asked twice and had no answer.`,
            `You have asked the Captain twice about order ${order.n} and had no answer. You are holding it, and sending ${order.from} word that it is waiting on the Captain.`,
          );
        }
      }
      continue;
    }
    if (order.state !== 'new' || brain.now < order.retryAt) {
      continue;
    }
    const free = moneyFree(brain, ledger);
    const big =
      order.cost > BIG_PURCHASE_CR || (free !== null && order.cost > free / 2);
    if (big && order.approved === null) {
      if (captain) {
        order.state = 'asking';
        ledger.toWrite.push(BOOK.asked(order));
        askCaptain(brain, order, captain);
        continue;
      }
      order.approved = 'self';
      ledger.toWrite.push(BOOK.self(order));
    }
    if (free !== null && order.cost > free) {
      if (!order.shortTold) {
        order.shortTold = true;
        ledger.toWrite.push(BOOK.short(order, Math.max(0, free)));
        tellOrderer(
          brain,
          order,
          `Order ${order.n} is held for money: it comes to ${credits(order.cost)} credits and there are ${credits(Math.max(0, free))} free in the budget. I will have it placed when the money is there.`,
          `The budget cannot cover order ${order.n} yet. You are holding it until it can, and sending ${order.from} word of that.`,
        );
      }
      continue;
    }
    order.state = 'cleared';
  }
}

/** The technicians who have no order of its on the go, by name. */
function freeTechnicians(brain: NpcBrain, ledger: Ledger): string[] {
  const busy = new Set(
    ledger.orders
      .filter((order) => order.state === 'given')
      .map((order) => order.givenTo),
  );
  return technicians(brain).filter((name) => !busy.has(name));
}

/** The words an order is given to a technician in. Said word for word: the technician's body goes by them. */
function giveLine(order: LedgerOrder, to: string): string {
  return `${firstName(to)}, order ${order.n}: ${ORDERING} ${orderSpoken(order.items)}, for ${order.from}.`;
}

/** What its staff have brought in and sent out between them, as it says it to end a meeting. */
function supplyClosing(brain: NpcBrain, meeting: Meeting): string {
  const work = totalWords(workReported(brain, meeting));
  // With no report given there is nothing to say about crates either way. "No crates in or out"
  // was said of a shift that had brought one in and sent three out, because nobody had reported.
  const none =
    Object.keys(meeting.reports).length === 0
      ? 'I have had no reports.'
      : 'There are no crates in or out to count yet.';
  return `${work ? `Between you, that is ${work}.` : none} The meeting is over, thank you.`;
}

/**
 * Its report to the Captain of a staff meeting that is over: who came, the crates in and out,
 * the orders it has in hand and what is in the budget. A PDA message that runs long is cut off,
 * so if it will not all fit, the least of it goes.
 */
function supplyReport(brain: NpcBrain, meeting: Meeting): string {
  const ledger = ledgerOf(brain);
  // Whoever gave a report was there. Someone it could see and never heard from was not at it.
  const reported = Object.keys(meeting.reports).length;
  const there = meeting.turns.filter((turn) => turn.heard).length;
  const work = totalWords(workReported(brain, meeting));
  const open = ledger.orders.filter(isOpen).length;
  const came = `Supply staff meeting: ${there} of ${meeting.invited.length} there.`;
  const done = work
    ? `Since the last one: ${work}.`
    : reported === 0
      ? 'No reports given.'
      : 'No crates in or out to count yet.';
  const orders =
    open === 0
      ? 'No orders in hand.'
      : `${open} order${open === 1 ? '' : 's'} in hand.`;
  // An order held for want of the Captain's say is named each time, until it has it.
  const held = ledger.orders.filter(
    (order) =>
      order.state === 'asking' && order.approved === null && order.waitingTold,
  );
  const waiting =
    held.length === 0
      ? ''
      : ` Order${held.length === 1 ? '' : 's'} ${listed(held.map((order) => String(order.n)))} ${held.length === 1 ? 'is' : 'are'} still waiting on your say.`;
  const money =
    brain.budget === null ? '' : ` Budget: ${credits(brain.budget)} credits.`;
  return (
    [
      `${came} ${done} ${orders}${waiting}${money}`,
      `${came} ${done} ${orders}${waiting}`,
      `${came} ${orders}${waiting}`,
      `${came} ${done} ${orders}`,
    ].find((line) => line.length <= SAID_MAX) ?? `${came} ${done}`
  );
}

/** The technician at the meeting whose standing work it has yet to say, or has to say afresh because it has changed. */
function dutyOwed(
  brain: NpcBrain,
  meeting: Meeting,
): { name: string; duties: string[] } | null {
  const ledger = ledgerOf(brain);
  const dealt = dutiesFor(technicians(brain));
  for (const name of present(brain, meeting)) {
    const duties = dealt[name];
    if (duties && duties.join() !== (ledger.duties[name] ?? []).join()) {
      return { name, duties };
    }
  }
  return null;
}

/**
 * Dividing up the standing work, while its staff are all together: each technician is told,
 * by name and in so many words, what is theirs this shift. Their bodies go by those words.
 */
function dutyStep(brain: NpcBrain, meeting: Meeting): Plan | null {
  const owed = dutyOwed(brain, meeting);
  if (!owed) {
    return null;
  }
  const line = dutyLine(owed.name, owed.duties);
  return {
    ready: true,
    step: `Your staff have reported. You divide the standing work between your technicians: your body is telling ${owed.name} what is theirs, in these words: "${line}"`,
    say: line,
    exact: true,
  };
}

/** How the Quartermaster holds its staff meeting: where its technicians work, called aloud. */
const SUPPLY_WAY: MeetingWay = {
  room: (brain) => brain.staffPost,
  aloud: true,
  firstAt: FIRST_MEETING_DS,
  before: dutyStep,
  closing: supplyClosing,
  report: supplyReport,
};

/** Keeps the Quartermaster's tasks true to its book, its paper, the knock at its door and the time. */
function syncTasks(brain: NpcBrain): void {
  const ledger = ledgerOf(brain);
  // The book it carries is read once. With nothing in its head and writing in the book, the book
  // is what it knows.
  if (!ledger.read && brain.book) {
    if (ledger.orders.length === 0 && brain.book.length > 0) {
      ledger.orders = readBook(brain.book, brain.now, brain.name);
      ledger.next = Math.max(0, ...ledger.orders.map((order) => order.n)) + 1;
    }
    ledger.read = true;
  }
  // A technician given an order that has not said they have it is given it again.
  for (const order of ledger.orders) {
    if (
      order.state === 'given' &&
      !order.taken &&
      order.givenAt !== null &&
      brain.now - order.givenAt > TAKEN_WAIT_DS
    ) {
      // To the same technician, who may have it in hand and only not have been heard: `givenTo`
      // is kept, and giveStep goes by it. Given to whoever was free instead, order 2 was placed
      // by both of them and two crates came. Only word that it could not be placed frees it for
      // someone else.
      order.state = 'cleared';
      order.pick = order.givenTo;
      order.walkedUp = false;
    }
  }
  clearOrders(brain, ledger);
  // Its staff meeting. Not called while it is in the middle of handing an order over.
  syncMeeting(
    brain,
    SUPPLY_WAY,
    ledger.orders.some((order) => order.state === 'given' && !order.taken),
  );

  // Paper to keep the book on: its first job of the shift, and again whenever it has none.
  const paper = findTask(brain, PAPER);
  if (brain.book === null && !paper) {
    addTask(brain, { kind: PAPER, urgency: 'asked', source: 'own' });
  } else if (brain.book !== null && paper) {
    finishTask(brain, paper);
  }
  const looking = findTask(brain, PAPER);
  if (looking) {
    blockTask(
      looking,
      brain.now < ledger.paperRetryAt
        ? 'you found no paper, and will look again in a while'
        : null,
    );
  }
  const write = findTask(brain, WRITE);
  const toWrite = ledger.toWrite.length > 0 && brain.book !== null;
  if (toWrite && !write) {
    addTask(brain, { kind: WRITE, urgency: 'asked', source: 'own' });
  } else if (!toWrite && write) {
    finishTask(brain, write);
  }

  for (const order of ledger.orders) {
    const item = String(order.n);
    // An order that is cleared is given to a technician. One that has been given is waited on
    // until the technician says they have it.
    const toGive =
      order.state === 'cleared' || (order.state === 'given' && !order.taken);
    const give = findTask(brain, GIVE, { item });
    if (toGive && !give) {
      addTask(brain, { kind: GIVE, item, urgency: 'asked', source: 'own' });
    } else if (!toGive && give) {
      finishTask(brain, give);
    }
    // A crate of its own that has come in is its own to open.
    const toOpen =
      !!order.own &&
      order.state === 'docked' &&
      !order.unpacked &&
      (order.crates?.length ?? 0) > 0;
    const unpack = findTask(brain, UNPACK, { item });
    if (toOpen && !unpack) {
      addTask(brain, { kind: UNPACK, item, urgency: 'asked', source: 'own' });
    } else if (!toOpen && unpack) {
      finishTask(brain, unpack);
    }
  }

  // A technician it means to send to see to something: the sending is face to face.
  const sending = findTask(brain, SEND);
  const toSend =
    !!ledger.sendFor && brain.now - ledger.sendFor.at < SEND_STANDS_DS;
  if (toSend && !sending) {
    addTask(brain, { kind: SEND, urgency: 'asked', source: 'own' });
  } else if (!toSend && sending) {
    ledger.sendFor = null;
    finishTask(brain, sending);
  }

  // A knock at its office door, while it is in there: one of its technicians has word for it.
  const knock = brain.knockAt;
  const atDoor =
    !!knock &&
    !!brain.office &&
    knock.room === brain.office &&
    brain.location === brain.office &&
    brain.now - knock.at < KNOCK_STANDS_DS;
  const answer = findTask(brain, KNOCK);
  if (atDoor && !answer) {
    addTask(brain, { kind: KNOCK, urgency: 'asked', source: 'own' });
  } else if (!atDoor && answer) {
    // Out of its office after a knock there: the knock is answered. Cleared here, as well as when
    // the walk's result comes in, since the task the result looks for is gone by then if the body
    // was seen in the bay first, and the same knock sent it out again and again for a minute.
    // A knock gone stale while it is still in the office leaves it where it is: it never came out.
    if (
      knock &&
      brain.office &&
      knock.room === brain.office &&
      brain.location !== brain.office
    ) {
      brain.knockAt = null;
      ledger.cameOutAt = brain.now;
    }
    finishTask(brain, answer);
  }

  // Between errands it goes back to its office. Not at once after coming out to a knock: whoever
  // knocked has something to tell it.
  const busy = brain.tasks.some(
    (task) =>
      task.state !== 'done' &&
      [WRITE, GIVE, SEND, KNOCK, UNPACK, MEET].includes(task.kind),
  );
  const stayingOut =
    ledger.cameOutAt > 0 && brain.now - ledger.cameOutAt < STAY_OUT_DS;
  const away =
    !!brain.office &&
    brain.location !== brain.office &&
    !busy &&
    !stayingOut &&
    !brain.shutIn &&
    brain.toTell.length === 0 &&
    // Out looking for paper, it is not on its way back.
    findTask(brain, PAPER)?.state !== 'open';
  const back = findTask(brain, OFFICE);
  if (away && !back) {
    addTask(brain, { kind: OFFICE, urgency: 'routine', source: 'own' });
  } else if (!away && back) {
    finishTask(brain, back);
  }
}

/** What giving an order to a technician comes down to right now. */
function giveStep(brain: NpcBrain, task: Task): Plan {
  const ledger = ledgerOf(brain);
  const order = ledger.orders.find((it) => String(it.n) === task.item);
  if (!order) {
    return { ready: false, step: 'That order is no longer in your book.' };
  }
  const wanted = orderWritten(order.items);
  // One thing at a time: while its staff are gathered for the meeting, the meeting is what it is about.
  if (brain.meeting) {
    return {
      ready: false,
      step: `Order ${order.n} (${wanted}) is cleared. You will give it out when the staff meeting is over.`,
    };
  }
  if (order.state === 'given') {
    return {
      ready: false,
      wait: true,
      step: `You have given order ${order.n} (${wanted}) to ${order.givenTo}, and are waiting to hear that they have it.`,
    };
  }
  const free = freeTechnicians(brain, ledger);
  if (free.length === 0) {
    return {
      ready: false,
      step:
        technicians(brain).length === 0
          ? `Order ${order.n} (${wanted}) is cleared, and you have no technician aboard to give it to.`
          : `Order ${order.n} (${wanted}) is cleared. Each of your technicians has an order on the go already: it waits for one of them.`,
    };
  }
  const inView = (name: string) =>
    brain.peopleInView.find((person) => person.name === name);
  // Whoever it settled on, if they are still free. Failing that whoever has the shuttle, which
  // is where what is ordered comes in. Failing that one who is in sight, and failing that they
  // take turns, by the order's number.
  // An order it has given once and not heard back about goes to the same technician again.
  const again =
    order.givenTo && technicians(brain).includes(order.givenTo)
      ? order.givenTo
      : null;
  if (again) {
    order.pick = again;
  } else if (!order.pick || !free.includes(order.pick)) {
    order.pick =
      free.find((name) => (ledger.duties[name] ?? []).includes('shuttle')) ??
      free.find((name) => inView(name)) ??
      free[order.n % free.length];
    order.walkedUp = false;
  }
  let seen: PersonInView | undefined = inView(order.pick);
  if (!again && !seen && brain.location === brain.staffPost) {
    // It is where they work, another of them is here and the one it meant is not: this one will do.
    const here = free.find((name) => inView(name));
    if (here) {
      order.pick = here;
      order.walkedUp = false;
      seen = inView(here);
    }
  }
  const pick = order.pick;
  if (!seen) {
    const post = brain.staffPost;
    if (!post) {
      return {
        ready: false,
        step: `Order ${order.n} (${wanted}) is cleared, and you do not know where to find your technicians.`,
      };
    }
    if (brain.location !== post) {
      return {
        ready: true,
        step: `Order ${order.n} (${wanted}, for ${order.from}) is cleared. You give your technicians their orders face to face, so you are going to the ${post} to find ${pick}.`,
        act: { tool: 'go_to', place: post },
      };
    }
    return {
      ready: false,
      wait: true,
      step: `You are in the ${post} with order ${order.n} (${wanted}) to give, waiting for one of your technicians to come back to it.`,
    };
  }
  // Face to face means standing with them, not calling across the bay.
  if ((seen.distance ?? 0) > SPEAKING_DISTANCE && !order.walkedUp) {
    return {
      ready: true,
      step: `Order ${order.n} (${wanted}, for ${order.from}) is cleared, and ${pick} is in sight. You are walking up to ${pick} to give it to them.`,
      act: { tool: 'approach', person: seen.handle },
    };
  }
  const line = giveLine(order, pick);
  return {
    ready: true,
    step: `Order ${order.n} is cleared and ${pick}, one of your technicians, is here. Your body is giving them the order, in these words: "${line}"`,
    say: line,
    exact: true,
  };
}

/**
 * A technician has said a crate would not go where it was meant to. The Quartermaster is the
 * guide: it sends another technician to see to it, whoever's part of the work the shuttle is.
 * With only the one technician, that one is told to try again. Told of the same crate a second
 * time, whoever ordered it is sent word that it is held up.
 */
function crateHeldUp(
  brain: NpcBrain,
  speaker: string,
  what: string,
  how: string,
  leftIn: string | null,
): void {
  const ledger = ledgerOf(brain);
  ledger.heldUp[what] ??= { by: speaker, times: 0, at: brain.now };
  const entry = ledger.heldUp[what];
  entry.times += 1;
  entry.at = brain.now;
  entry.by = speaker;
  if (entry.times === 1) {
    const others = technicians(brain).filter((name) => name !== speaker);
    const to =
      others.find((name) =>
        brain.peopleInView.some((person) => person.name === name),
      ) ??
      others[0] ??
      speaker;
    const where = leftIn ? `is in the ${leftIn}` : 'is lying by a door';
    ledger.sendFor = {
      to,
      line:
        to === speaker
          ? tryAgainLine(firstName(to), what)
          : seeToLine(
              firstName(to),
              `${what} ${where} and ${firstName(speaker)} could not get it ${how}`,
            ),
      why:
        to === speaker
          ? `${speaker} has told you that they could not get ${what} ${how}. You have no other technician to send, so you are telling ${speaker} to try it again.`
          : `${speaker} has told you that they could not get ${what} ${how}. You are sending ${to} to see to it.`,
      at: brain.now,
    };
    return;
  }
  // Twice now. Whoever ordered it is told that it is held up, once.
  const number = Number(what.match(/#(\d+)/)?.[1]);
  const order = number
    ? ledger.orders.find((it) =>
        it.crates?.some((crate) => crate.number === number),
      )
    : undefined;
  if (entry.times === 2 && order && order.from !== brain.name) {
    sendWord(
      brain,
      order.from,
      `Held up at cargo: ${what} from your order cannot be got ${how} yet. I will send word when it can be collected.`,
      `Your technicians have told you twice that they could not get ${what}, which ${order.from} ordered, ${how}. You are sending ${order.from} word that it is held up.`,
    );
  }
}

/** What sending a technician to see to something comes down to right now. */
function sendStep(brain: NpcBrain): Plan {
  const send = ledgerOf(brain).sendFor;
  if (!send) {
    return { ready: false, step: 'There is nobody to send.' };
  }
  const seen = brain.peopleInView.find((person) => person.name === send.to);
  if (!seen) {
    const post = brain.staffPost;
    if (!post) {
      return {
        ready: false,
        step: `${send.why} You do not know where to find ${send.to}.`,
      };
    }
    if (brain.location !== post) {
      return {
        ready: true,
        step: `${send.why} You tell your technicians what to do face to face, so you are going to the ${post} to find ${send.to}.`,
        act: { tool: 'go_to', place: post },
      };
    }
    return {
      ready: false,
      wait: true,
      step: `${send.why} You are in the ${post}, waiting for ${send.to} to come back to it.`,
    };
  }
  // Face to face means standing with them, not calling across the bay.
  if ((seen.distance ?? 0) > SPEAKING_DISTANCE && !send.walkedUp) {
    return {
      ready: true,
      step: `${send.why} ${send.to} is in sight, and you are walking up to them.`,
      act: { tool: 'approach', person: seen.handle },
    };
  }
  return {
    ready: true,
    step: `${send.why} ${send.to} is here. Your body is telling them, in these words: "${send.line}"`,
    say: send.line,
    exact: true,
  };
}

function plan(brain: NpcBrain, task: Task): Plan | null {
  const ledger = ledgerOf(brain);
  if (task.kind === MEET) {
    return meetStep(brain, SUPPLY_WAY);
  }
  if (task.kind === SEND) {
    return sendStep(brain);
  }
  if (task.kind === PAPER) {
    return {
      ready: true,
      step: 'You have no paper to keep your order book on. You are going to find a sheet, and a pen to write with.',
      act: { tool: 'get_paper' },
    };
  }
  if (task.kind === WRITE) {
    return ledger.toWrite.length > 0
      ? {
          ready: true,
          step: `You are writing up your order book: ${ledger.toWrite.length === 1 ? 'one line' : `${ledger.toWrite.length} lines`} to put down.`,
          // A few lines at a time: that is as much as the body writes in one go.
          act: { tool: 'note', lines: ledger.toWrite.slice(0, LINES_AT_ONCE) },
        }
      : { ready: false, step: 'Your order book is up to date.' };
  }
  if (task.kind === GIVE) {
    return giveStep(brain, task);
  }
  if (task.kind === UNPACK) {
    const order = ledger.orders.find((it) => String(it.n) === task.item);
    const crate = order?.crates?.[0];
    return order && crate
      ? {
          ready: true,
          step: `Order ${order.n}, which you ordered for yourself (${orderWritten(order.items)}), has come in as crate #${crate.number}. It is in your own department, so you are going to open it yourself.`,
          act: { tool: 'open_own_crate', number: crate.number },
        }
      : { ready: false, step: 'That crate is seen to.' };
  }
  if (task.kind === KNOCK) {
    return brain.staffPost
      ? {
          ready: true,
          step: `Someone is knocking at the door of your office: one of your technicians has word for you. You are going out to the ${brain.staffPost} to hear it.`,
          act: { tool: 'go_to', place: brain.staffPost },
        }
      : { ready: false, step: 'Someone is knocking at your office door.' };
  }
  if (task.kind === OFFICE) {
    return brain.office
      ? {
          ready: true,
          step: `You have nothing to see to just now, and are going back to your office, the ${brain.office}.`,
          act: { tool: 'go_to', place: brain.office },
        }
      : { ready: false, step: 'You are staying where you are for now.' };
  }
  return null;
}

function describeTask(task: Task): string | null {
  switch (task.kind) {
    case MEET:
      return 'hold the supply staff meeting';
    case PAPER:
      return 'find paper to keep your order book on';
    case WRITE:
      return 'write up your order book';
    case GIVE:
      return `give order ${task.item} to one of your technicians`;
    case SEND:
      return 'send a technician to see to a crate that would not come';
    case UNPACK:
      return `open the crate that came on order ${task.item}`;
    case KNOCK:
      return 'answer the knock at your office door';
    case OFFICE:
      return 'go back to your office';
    default:
      return null;
  }
}

/** Where an order stands, in a few words, for what the LLM is told. */
function standing(order: LedgerOrder): string {
  switch (order.state) {
    case 'asking':
      return order.waitingTold
        ? 'held: the Captain has not answered'
        : "waiting on the Captain's say";
    // Said plainly that these are going ahead. Told only "cleared" and "given", it told the
    // technician it had just given an order to that the crate was not coming yet.
    case 'cleared':
      return `cleared${order.approved === 'captain' ? ' (the Captain has said yes)' : ''} and going ahead: you are giving it to a technician to place`;
    case 'given':
      return `given to ${order.givenTo} to place${order.approved === 'captain' ? ' (the Captain has said yes)' : ''}: it is going ahead, and has not come in yet`;
    case 'docked':
      return 'come in';
    case 'refused':
      return order.cancelledBy
        ? `cancelled by ${order.cancelledBy}`
        : 'refused by the Captain';
    default:
      return order.shortTold ? 'held for money' : 'just taken';
  }
}

/** What the LLM should know about where things stand, so that what it says about them is true. */
function cues(brain: NpcBrain): string[] {
  const ledger = ledgerOf(brain);
  const lines: string[] = [];
  const meeting = brain.meeting;
  if (meeting) {
    lines.push(
      meeting.startedAt === null
        ? `You have called a staff meeting in the ${meeting.room}, and it has not begun yet. Your technicians are gathering for it.`
        : `You are holding a staff meeting in the ${meeting.room}. Your technicians speak one at a time, when you call on them by name.`,
    );
  }
  const open = ledger.orders.filter(isOpen);
  if (open.length > 0) {
    lines.push(
      `Orders in your book that are not done with: ${open.map((order) => `order ${order.n} from ${order.own ? 'yourself' : order.from} (${orderWritten(order.items)}, ${credits(order.cost)} credits): ${standing(order)}`).join('; ')}.`,
    );
  } else {
    lines.push('You have no order in hand just now.');
  }
  if (brain.budget !== null) {
    lines.push(
      `There are ${credits(brain.budget)} credits in the cargo budget, which every order is paid from.`,
    );
  }
  if (brain.book === null) {
    lines.push(
      'You have no paper to keep your order book on yet. Orders you take meanwhile you carry in your head, and write up when you have some.',
    );
  } else {
    // Asked whether it had found paper, with its book in its hand, it said it had seen none.
    lines.push(
      'You have paper: your order book is written up, and you carry it with you.',
    );
  }
  // Who the Captain is, by name, and what they are to it. Spoken to by the Captain, it told them
  // to take their order to the head of their department, and to give the Captain their say.
  const captain = captainName(brain);
  if (captain) {
    const asking = ledger.orders.filter(
      (order) => order.state === 'asking' && order.approved === null,
    );
    lines.push(
      `${captain} is the Captain: the one you answer to, who may order supplies from you, and whose say a big purchase waits on.${asking.length > 0 ? ` ${captain}'s yes or no is what order${asking.length === 1 ? '' : 's'} ${listed(asking.map((order) => String(order.n)))} ${asking.length === 1 ? 'is' : 'are'} waiting on. If ${firstName(captain)} speaks of ${asking.length === 1 ? 'it' : 'one'}, that is their answer: never tell them to ask the Captain, or to go to their head of department.` : ''}`,
    );
  }
  const duties = Object.entries(ledger.duties);
  if (duties.length > 0) {
    lines.push(
      `You have divided the standing work between your technicians: ${duties.map(([name, theirs]) => `${name} has ${listed(theirs.map((duty) => `the ${duty}`))}`).join('; ')}.`,
    );
  }
  return lines;
}

/** The technician's line as it was said, without any remark that followed it: up to the last crate number, and what kind it is. */
function itemisedIn(rest: string): string {
  const numbers = [...rest.matchAll(/#\d+/g)];
  const last = numbers.at(-1);
  if (!last || last.index === undefined) {
    return rest.trim().replace(/\.$/, '');
  }
  const end = last.index + last[0].length;
  const kind = rest.slice(end).match(/^\s*\([^)]*\)/);
  return rest.slice(0, end + (kind ? kind[0].length : 0)).trim();
}

/**
 * Hears from a technician that crates someone ordered have been lost. Whoever ordered is told,
 * it goes in the book, and what was lost is ordered again, once: it is the order they already gave.
 */
function crateLost(
  brain: NpcBrain,
  numbers: number[],
  whose: string,
  why: string,
): void {
  const ledger = ledgerOf(brain);
  const written = cratesWritten(numbers);
  const order = ledger.orders.find((it) =>
    it.crates?.some((crate) => numbers.includes(crate.number)),
  );
  let again: LedgerOrder | null = null;
  // Its own crate, lost: it can never be opened now. Done with, so that it is not tried for the
  // rest of the round and it may order for itself again.
  if (order?.own) {
    order.unpacked = true;
  }
  if (order && !order.reordered) {
    // What kind each lost crate was, as the book has it: the same again, crate for crate.
    const kinds = new Map<string, number>();
    for (const crate of order.crates ?? []) {
      if (numbers.includes(crate.number)) {
        const kind = crate.kind ?? order.items[0].crate;
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      }
    }
    const items = [...kinds].map(([crate, count]) => ({ crate, count }));
    again = newOrder(
      ledger.next++,
      order.from,
      order.fromJob,
      items,
      costOf(brain, items),
    );
    again.own = order.own;
    // Whoever cleared the order cleared this much of it already.
    again.approved = order.approved;
    order.reordered = true;
    ledger.orders.push(again);
    ledger.toWrite.push(BOOK.lost(order, written, again.n));
    ledger.toWrite.push(BOOK.taken(again));
  } else if (order) {
    ledger.toWrite.push(BOOK.lost(order, written, null));
  }
  if (whose !== brain.name) {
    sendWord(
      brain,
      whose,
      `Lost at cargo: ${written} from your order. ${capital(why)}. ${again ? `I am having it ordered again, as order ${again.n}, and nobody need come for the lost one.` : 'It will have to be ordered again, and nobody need come for it.'}`,
      `One of your technicians has told you that ${written}, which ${whose} ordered, ${numbers.length === 1 ? 'has' : 'have'} been lost: ${why}. You are sending ${whose} word of it${again ? ', and having it ordered again' : ''}.`,
    );
  }
}

/**
 * Takes a technician's word that an order has come in: the order is marked so in the book, and
 * whoever ordered is sent the crate numbers. Its own order is nobody's to tell, and with it marked
 * as come in the Quartermaster goes to open the crate. The word may come to its face or, when the
 * technician could not find it, by PDA.
 */
function noteDocked(
  brain: NpcBrain,
  from: string,
  n: number,
  told: string,
): void {
  const ledger = ledgerOf(brain);
  const order = ledger.orders.find((it) => it.n === n);
  if (!order || order.state === 'docked') {
    return;
  }
  const itemised = itemisedIn(told);
  const several = (itemised.match(/#\d+/g) ?? []).length > 1;
  order.state = 'docked';
  order.crates = cratesTold(itemised);
  ledger.toWrite.push(BOOK.docked(order, itemised));
  tellOrderer(
    brain,
    order,
    `Your order has come in: ${itemised}. Send someone to the Cargo Lobby counter with the number to collect ${several ? 'each one' : 'it'}.`,
    `${from} has told you that order ${order.n}, which ${order.from} sent you, has come in. You are sending ${order.from} the crate numbers by PDA.`,
  );
}

/**
 * Takes word of crates that are waiting at cargo as word that an order of its own has come in, if
 * its book does not have it so already. A technician who could not find it sends whoever ordered a
 * PDA message, and for its own order that is the Quartermaster: "Your order has come in: crate
 * #12 (Bureaucracy Crate)." Later it is told, to its face, that the crate is still waiting. Either
 * is the first it has heard of it.
 */
function noteOwnCrate(brain: NpcBrain, from: string, told: string): void {
  const ledger = ledgerOf(brain);
  const numbers = cratesTold(told).map((crate) => crate.number);
  if (numbers.length === 0) {
    return;
  }
  // The crate is already one it knows of.
  if (
    ledger.orders.some((order) =>
      order.crates?.some((crate) => numbers.includes(crate.number)),
    )
  ) {
    return;
  }
  // The order of its own that a technician has in hand, the longest given first.
  const order = ledger.orders
    .filter((it) => it.own && it.state === 'given')
    .sort((a, b) => (a.givenAt ?? 0) - (b.givenAt ?? 0))[0];
  if (order) {
    noteDocked(brain, from, order.n, told);
  }
}

/** The words a technician sends whoever ordered when their order has come in. See `arrived` in jobs/cargo.ts. */
const ARRIVED_WORDS = /^Your order has come in: (.+?)\. Send\b/i;

export const QUARTERMASTER: Job = {
  is: isQuartermaster,
  // It has an office and its staff to see to. It does not wander the station.
  keepsPost: true,
  cleans: false,
  about: () =>
    'You are the Quartermaster, the head of the supply staff: the cargo technicians answer to you, and you answer to the Captain. Every order for supplies aboard goes through you. The Captain and the heads of department send you their orders by PDA. You keep an order book, see that the budget can pay, ask the Captain about any big purchase, and give each order to one of your technicians, face to face, to place and see through. You hold a short staff meeting with your technicians now and then, hear what crates each has brought in and sent out, and divide the standing work between them. You delegate: you never place an order at the console yourself, and you do not haul crates.',
  whenAsked: (brain, heard) => [
    'Only the Captain and the heads of department may order supplies, and they send their orders to you by PDA. Anyone else who asks is told, kindly, to take it to the head of their own department. When a head does order, tell them it is noted: your body writes it in your order book and sends them its number.',
    'You do not place orders at the console, haul crates or work the counter: your technicians do that, on your word. Asked to, say you will have one of them see to it.',
    'Whether an order can be paid for, and whether the Captain has to be asked, your body works out from the budget. Never promise an order will be placed, or say what anything costs, beyond what you are told here.',
    ...(isMeetingOrder(brain, heard)
      ? [
          brain.meeting && !brain.meeting.orderedBy
            ? 'You have just been told to find out how your staff are doing. You have a staff meeting on already: say so, and that your report will follow it.'
            : 'You have just been told to find out how your staff are doing. Your body is calling a staff meeting for that now: say that you are calling one, and that your report will follow it.',
        ]
      : []),
  ],
  cues,
  syncTasks,
  plan,
  describeTask,
  // An order from a head, the Captain's answer about one, or the Captain telling it to find out
  // how its staff are doing, by PDA.
  readsMessage: (brain, from, text, _at, job) => {
    if (/captain/i.test(job) && readAnswer(brain, from, text, false)) {
      return;
    }
    if (answersTo(brain.job, job) && isMeetingOrder(brain, text)) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = from;
      }
      return;
    }
    if (headsLine(brain, from, job, text, false)) {
      return;
    }
    // A technician who could not find it sends word that an order has come in by PDA: in the
    // words it would have said, or, for the Quartermaster's own order, in those meant for
    // whoever ordered.
    if (isTechnician(job)) {
      const docked = text.match(DOCKED_WORDS);
      if (docked) {
        noteDocked(brain, from, Number(docked[1]), docked[2]);
        return;
      }
      const arrived = text.match(ARRIVED_WORDS);
      if (arrived) {
        noteOwnCrate(brain, from, arrived[1]);
        return;
      }
    }
    // One of its technicians is shut in and cannot walk to it: the one time word between them
    // goes by PDA. It sends another technician to see what is shutting the way.
    const shutIn = isTechnician(job) ? text.match(SHUT_IN_WORDS) : null;
    if (shutIn) {
      const other = technicians(brain).find((name) => name !== from);
      if (other) {
        ledgerOf(brain).sendFor = {
          to: other,
          line: seeToLine(
            firstName(other),
            `${firstName(from)} is shut in the ${shutIn[1].trim()}`,
          ),
          why: `${from} has sent word that they are shut in the ${shutIn[1].trim()}. You are sending ${other} to see what is shutting the way.`,
          at: brain.now,
        };
      }
    }
  },
  // What is said in its hearing: a technician giving its report, saying they have an order, that
  // one has come in or could not be placed, or that a crate is waiting or lost; and a head or the
  // Captain saying to its face what they would otherwise have sent.
  overhears: (brain, event: SenseEvent) => {
    const ledger = ledgerOf(brain);
    const heard = String(event.details.message ?? '');
    const speaker = String(event.details.speaker ?? '');
    const job = jobOf(brain, speaker);
    if (!speaker) {
      return;
    }
    if (isTechnician(job)) {
      // At its meeting, a report is a report, whoever's turn it is.
      if (hearReport(brain, speaker, heard)) {
        return;
      }
      // Whatever a technician has come to tell it, it has now heard.
      ledger.cameOutAt = 0;
      // And says so, by name. The technician cannot tell being seen from being heard, and until
      // it has this back it goes on trying to pass its word on.
      const heardIt = () => {
        const line = `${firstName(speaker)}, ${WORD_HEARD}.`;
        brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
        brain.toTell.push({
          to: speaker,
          line,
          why: `${speaker} has told you something about a crate, to your face. You are saying that you have it, so that they know they were heard.`,
          needs: WORD_HEARD_WORDS,
          // Word for word, and there and then: the technician is standing waiting on it.
          exact: true,
          whileBusy: true,
          at: Date.now(),
        });
      };
      const docked = heard.match(DOCKED_WORDS);
      if (docked) {
        heardIt();
        noteDocked(brain, speaker, Number(docked[1]), docked[2]);
        return;
      }
      // A crate that would not go where it was meant to. It says what is to be done about it.
      const stuck = heard.match(WONT_COME_WORDS);
      if (stuck) {
        heardIt();
        crateHeldUp(
          brain,
          speaker,
          stuck[1].trim(),
          stuck[2],
          stuck[3] ?? null,
        );
        return;
      }
      const lost = heard.match(LOST_TOLD_WORDS);
      if (lost) {
        heardIt();
        crateLost(
          brain,
          cratesTold(lost[1]).map((crate) => crate.number),
          lost[2].trim(),
          lost[3].trim(),
        );
        return;
      }
      const waiting = heard.match(WAITING_TOLD_WORDS);
      if (waiting) {
        heardIt();
        const whose = waiting[2].trim();
        // A crate of its own, still waiting: if its book has no word of that order coming in, this
        // is that word. It goes and opens it.
        if (whose === brain.name) {
          noteOwnCrate(brain, speaker, waiting[1]);
        }
        if (whose !== brain.name) {
          sendWord(
            brain,
            whose,
            `Still waiting at cargo: ${waiting[1]} from your order. Send someone to the Cargo Lobby counter with the number, please.`,
            `One of your technicians has told you that ${waiting[1]}, which ${whose} ordered, ${/crates/.test(waiting[1]) ? 'are' : 'is'} still waiting to be collected. You are sending ${whose} a PDA message to remind them.`,
          );
        }
        return;
      }
      const failed = heard.match(NOT_PLACED_WORDS);
      if (failed) {
        const order = ledger.orders.find((it) => it.n === Number(failed[1]));
        if (order && order.state === 'given') {
          order.state = 'new';
          order.givenTo = null;
          order.pick = null;
          order.shortTold = false;
          order.retryAt = brain.now + PLACE_AGAIN_DS;
          ledger.toWrite.push(BOOK.failed(order));
        }
        return;
      }
      const taken = heard.match(TAKEN_WORDS);
      if (taken) {
        const order = ledger.orders.find((it) => it.n === Number(taken[1]));
        if (order && order.state === 'given' && order.givenTo === speaker) {
          order.taken = true;
        }
      }
      return;
    }
    if (event.details.said_to !== 'me') {
      return;
    }
    if (/captain/i.test(job) && readAnswer(brain, speaker, heard, true)) {
      return;
    }
    // Someone it answers to telling it to find out how its staff are doing: a meeting is called.
    if (
      brain.peopleInView.find((person) => person.name === speaker)?.superior &&
      isMeetingOrder(brain, heard)
    ) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = speaker;
      }
      return;
    }
    headsLine(brain, speaker, job, heard, true);
  },
  afterSaying: (brain, called) => {
    if (!called) {
      return;
    }
    const ledger = ledgerOf(brain);
    meetingSaid(brain, called);
    // Having told a technician, in so many words, what is theirs this shift, it is theirs.
    const duty = dutiesIn(called);
    if (duty) {
      const name = technicians(brain).find(
        (it) => firstName(it).toLowerCase() === duty.first.toLowerCase(),
      );
      if (name) {
        ledger.duties[name] = duty.duties;
      }
      return;
    }
    // Having sent a technician to see to something in so many words, they are sent.
    if (ledger.sendFor && called === ledger.sendFor.line) {
      ledger.sendFor = null;
      return;
    }
    // Having given an order in so many words, it is given.
    const given = called.match(GIVEN_WORDS);
    if (!given) {
      return;
    }
    const order = ledger.orders.find((it) => it.n === Number(given[1]));
    if (order && order.state === 'cleared' && order.pick) {
      order.state = 'given';
      order.givenTo = order.pick;
      order.givenAt = brain.now;
      order.taken = false;
      ledger.toWrite.push(BOOK.given(order, order.pick));
    }
  },
  afterActing: (brain, act, task, ok, looped, details) => {
    const ledger = ledgerOf(brain);
    meetingActed(brain, act, ok, looped);
    // What it wrote is written. What it could not write waits for paper.
    if (act.tool === 'note' && ok) {
      const lines = Array.isArray(act.lines) ? act.lines.length : 0;
      ledger.toWrite.splice(0, lines);
    }
    // No paper to be found. What a body needs and cannot find, it orders: a crate that has paper
    // in it, through its own technician, like any other order.
    if (act.tool === 'get_paper' && !ok) {
      ledger.paperRetryAt = brain.now + PAPER_AGAIN_DS;
      const crate = brain.orderable.find((kind) => PAPER_CRATE.test(kind));
      if (crate) {
        orderForItself(brain, crate);
      }
    }
    // Having walked up to a technician, near enough or not, it speaks.
    if (task?.kind === GIVE && act.tool === 'approach') {
      const order = ledger.orders.find((it) => String(it.n) === task.item);
      if (order) {
        order.walkedUp = true;
      }
    }
    // Likewise one it means to send somewhere.
    if (task?.kind === SEND && act.tool === 'approach' && ledger.sendFor) {
      ledger.sendFor.walkedUp = true;
    }
    // Its own crate is open, and what was in it is out where it can be got at.
    if (task?.kind === UNPACK && act.tool === 'open_own_crate' && ok) {
      const order = ledger.orders.find((it) => String(it.n) === task.item);
      if (order) {
        order.unpacked = true;
      }
      ledger.paperRetryAt = 0;
    }
    // Cargo holds no such crate for it any more: lost, or opened or collected by someone else. It
    // is done with, and paper is looked for again at once: its paper may be out already.
    if (act.tool === 'open_own_crate' && !ok && details?.no_such_crate) {
      const order = ledger.orders.find(
        (it) =>
          it.own && it.crates?.some((crate) => crate.number === act.number),
      );
      if (order) {
        order.unpacked = true;
      }
      ledger.paperRetryAt = 0;
    }
    // Out of its office to a knock: it stays out a little while to hear what is wanted.
    if (task?.kind === KNOCK) {
      brain.knockAt = null;
      if (ok) {
        ledger.cameOutAt = brain.now;
      }
    }
  },
};
