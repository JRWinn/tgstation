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
  TAKEN_WORDS,
  WAITING_TOLD_WORDS,
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
/** The words of the Captain's answer about a purchase. No is looked for first: "not approved" has both. */
const NO_WORDS =
  /\b(no|nope|nah|denied|deny|refused?|rejected?|not approved|do not|don'?t|negative|cancel)\b/i;
const YES_WORDS =
  /\b(yes|yep|yeah|aye|approved?|granted|go ahead|do it|fine|ok|okay|sure|agreed|authori[sz]ed|no (objection|problem))\b/i;
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
  self: (order: LedgerOrder) =>
    `Order ${order.n}. No Captain aboard: approved by me.`,
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
    if (/^Asked the Captain\.$/.test(rest)) {
      order.state = 'asking';
      order.askedAt = now;
      order.asks = 1;
    } else if (/^The Captain said yes\.$/.test(rest)) {
      order.approved = 'captain';
      order.state = 'new';
    } else if (/^The Captain said no\.$/.test(rest)) {
      order.state = 'refused';
    } else if (/^No Captain aboard/.test(rest)) {
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
    // Only an outright order for something it cannot get is answered. Anything else is talk.
    if (/\b(order|ordering|requisition)\b/i.test(said)) {
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
function orderAnswered(ledger: Ledger, text: string): LedgerOrder | undefined {
  const asking = ledger.orders.filter(
    (order) => order.state === 'asking' && order.approved === null,
  );
  const named = [...text.matchAll(/\b(\d+)\b/g)].map((found) =>
    Number(found[1]),
  );
  return asking.find((order) => named.includes(order.n)) ?? asking[0];
}

/**
 * Reads what the Captain has said or written as its answer about a purchase, if it is one.
 * Returns TRUE if it was.
 */
function readAnswer(brain: NpcBrain, text: string): boolean {
  const ledger = ledgerOf(brain);
  const order = orderAnswered(ledger, text);
  const no = NO_WORDS.test(text) && !/\bno (objection|problem)\b/i.test(text);
  const yes = YES_WORDS.test(text);
  if (!order || (!no && !yes)) {
    return false;
  }
  if (no) {
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
  return `${work ? `Between you, that is ${work}.` : 'There are no crates in or out to count yet.'} The meeting is over, thank you.`;
}

/**
 * Its report to the Captain of a staff meeting that is over: who came, the crates in and out,
 * the orders it has in hand and what is in the budget. A PDA message that runs long is cut off,
 * so if it will not all fit, the least of it goes.
 */
function supplyReport(brain: NpcBrain, meeting: Meeting): string {
  const ledger = ledgerOf(brain);
  const there = meeting.turns.length;
  const work = totalWords(workReported(brain, meeting));
  const open = ledger.orders.filter(isOpen).length;
  const came = `Supply staff meeting: ${there} of ${meeting.invited.length} there.`;
  const done = work
    ? `Since the last one: ${work}.`
    : 'No crates in or out to count yet.';
  const orders =
    open === 0
      ? 'No orders in hand.'
      : `${open} order${open === 1 ? '' : 's'} in hand.`;
  const money =
    brain.budget === null ? '' : ` Budget: ${credits(brain.budget)} credits.`;
  return (
    [`${came} ${done} ${orders}${money}`, `${came} ${done} ${orders}`].find(
      (line) => line.length <= SAID_MAX,
    ) ?? `${came} ${done}`
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
      order.state = 'cleared';
      order.pick = null;
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
    finishTask(brain, answer);
  }

  // Between errands it goes back to its office. Not at once after coming out to a knock: whoever
  // knocked has something to tell it.
  const busy = brain.tasks.some(
    (task) =>
      task.state !== 'done' &&
      [WRITE, GIVE, KNOCK, UNPACK, MEET].includes(task.kind),
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
  if (!order.pick || !free.includes(order.pick)) {
    order.pick =
      free.find((name) => (ledger.duties[name] ?? []).includes('shuttle')) ??
      free.find((name) => inView(name)) ??
      free[order.n % free.length];
    order.walkedUp = false;
  }
  let seen: PersonInView | undefined = inView(order.pick);
  if (!seen && brain.location === brain.staffPost) {
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

function plan(brain: NpcBrain, task: Task): Plan | null {
  const ledger = ledgerOf(brain);
  if (task.kind === MEET) {
    return meetStep(brain, SUPPLY_WAY);
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
    case 'cleared':
      return 'cleared, to be given to a technician';
    case 'given':
      return `given to ${order.givenTo}, not yet come in`;
    case 'docked':
      return 'come in';
    case 'refused':
      return 'refused by the Captain';
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
    if (/captain/i.test(job) && readAnswer(brain, text)) {
      return;
    }
    if (answersTo(brain.job, job) && isMeetingOrder(brain, text)) {
      if (!brain.meeting) {
        brain.meetingOrderedBy = from;
      }
      return;
    }
    if (isHead(job) && ORDER_WORDS.test(text)) {
      takeOrder(brain, from, job, text);
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
        const order = ledger.orders.find((it) => it.n === Number(docked[1]));
        if (order && order.state !== 'docked') {
          const itemised = itemisedIn(docked[2]);
          const several = (itemised.match(/#\d+/g) ?? []).length > 1;
          order.state = 'docked';
          order.crates = cratesTold(itemised);
          ledger.toWrite.push(BOOK.docked(order, itemised));
          tellOrderer(
            brain,
            order,
            `Your order has come in: ${itemised}. Send someone to the Cargo Lobby counter with the number to collect ${several ? 'each one' : 'it'}.`,
            `${speaker} has told you that order ${order.n}, which ${order.from} sent you, has come in. You are sending ${order.from} the crate numbers by PDA.`,
          );
        }
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
    if (/captain/i.test(job) && readAnswer(brain, heard)) {
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
    if (isHead(job) && ORDER_WORDS.test(heard)) {
      takeOrder(brain, speaker, job, heard);
    }
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
  afterActing: (brain, act, task, ok, looped) => {
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
    // Its own crate is open, and what was in it is out where it can be got at.
    if (task?.kind === UNPACK && act.tool === 'open_own_crate' && ok) {
      const order = ledger.orders.find((it) => String(it.n) === task.item);
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
