// The Quartermaster's order book, and the words an order is passed along in, case by case. No
// model is called and no station is simulated: the book is written and read back in code
// (CrewBrain/jobs/quartermaster.ts), and each line an order travels in is said word for word and
// read by code (jobs/supply.ts). So all of it can be checked in a second.
//
//   bun run book.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { readBook, QUARTERMASTER } = await import(ROOT + 'jobs/quartermaster');
const { itemsAskedFor } = await import(ROOT + 'jobs/cargo');
const { cratesTold, DOCKED_WORDS, dutiesFor, dutiesIn, dutyLine, GIVEN_WORDS, LOST_TOLD_WORDS, NOTED_WORDS, NOT_PLACED_WORDS, orderSpoken, QM_SILENT_WORDS, REFUSED_WORDS, TAKEN_WORDS, WAITING_TOLD_WORDS } = await import(ROOT + 'jobs/supply');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// The book read back: each order is as far on as the last line written about it says.
const TAKEN = 'Order 1. From Hop Kins, Head of Personnel: 2 Janitorial Supplies Crate, 1 Replacement Lights. 1200 cr.';
const read = (lines: string[]) => readBook(lines, 5000).map((order: any) => `${order.n} ${order.state}${order.approved ? ` (${order.approved})` : ''}${order.givenTo ? ` to ${order.givenTo}` : ''}${order.waitingTold ? ' told-waiting' : ''}${order.shortTold ? ' told-short' : ''}`);
add('an order taken down', read([TAKEN]), ['1 new']);
const [first] = readBook([TAKEN], 5000);
add('who it is from, what for, and what it comes to', [first.from, first.fromJob, first.items, first.cost], ['Hop Kins', 'Head of Personnel', [{ crate: 'Janitorial Supplies Crate', count: 2 }, { crate: 'Replacement Lights', count: 1 }], 1200]);
add('the Captain asked about it', read([TAKEN, 'Order 1. Asked the Captain.']), ['1 asking']);
add('the Captain said yes: it is to be cleared and given', read([TAKEN, 'Order 1. Asked the Captain.', 'Order 1. The Captain said yes.']), ['1 new (captain)']);
add('the Captain said no: it is done with', read([TAKEN, 'Order 1. Asked the Captain.', 'Order 1. The Captain said no.']), ['1 refused']);
add('no answer from the Captain: it is held, and whoever ordered was told', read([TAKEN, 'Order 1. Asked the Captain.', 'Order 1. No answer from the Captain: held.']), ['1 asking told-waiting']);
add('no Captain aboard: cleared by the Quartermaster', read([TAKEN, 'Order 1. No Captain aboard: approved by me.']), ['1 new (self)']);
add('held for money: whoever ordered was told', read(['Order 2. From Hal Pott, Head of Personnel: 2 Janitorial Supplies Crate. 800 cr.', 'Order 2. Held for money: 800 cr wanted, 500 cr in the budget.']), ['2 new told-short']);
add('given to a technician', read([TAKEN, 'Order 1. Given to Cora Tech.']), ['1 given to Cora Tech']);
add('it could not be placed: it is to be given again', read([TAKEN, 'Order 1. Given to Cora Tech.', 'Order 1. Could not be placed.']), ['1 new']);
add('it has come in: it is done with', read([TAKEN, 'Order 1. Given to Cora Tech.', 'Order 1. Docked: crates #4521 and #4522 (Janitorial Supplies Crate); crate #4523 (Replacement Lights).']), ['1 docked to Cora Tech']);
add('two orders, their lines mixed together', read([TAKEN, 'Order 2. From Ada Stone, Captain: 1 Replacement Lights. 400 cr.', 'Order 2. Given to Vik Hale.', 'Order 1. Asked the Captain.']), ['1 asking', '2 given to Vik Hale']);
add('writing that is not the book\'s is passed over', read(['Shopping: milk', TAKEN, '', 'Order 9. Given to nobody in particular']), ['1 new']);
add('a line about an order the book does not have is passed over', read(['Order 4. Given to Cora Tech.']), []);

// A Quartermaster with nothing in its head and writing in its book: the book is what it knows.
const ada = makeBrain('Ada Finch', 'Quartermaster');
ada.orderable = ['Janitorial Supplies Crate', 'Replacement Lights'];
ada.crateCosts = { 'Janitorial Supplies Crate': 400, 'Replacement Lights': 400 };
ada.budget = 2000;
ada.office = "Quartermaster's Office"; ada.location = "Quartermaster's Office"; ada.staffPost = 'Cargo Bay';
ada.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Hop Kins', job: 'Head of Personnel' }];
ada.book = [TAKEN, 'Order 1. No Captain aboard: approved by me.', 'Order 2. From Hop Kins, Head of Personnel: 1 Replacement Lights. 400 cr.', 'Order 2. Given to Cora Tech.'];
QUARTERMASTER.syncTasks(ada);
add('the window closed and opened again: it reads its book', ada.ledger.orders.map((order: any) => `${order.n} ${order.state}`), ['1 cleared', '2 given']);
add('and the next order it takes gets the next number', ada.ledger.next, 3);
add('what it still has to do is what the book says is not done: give order 1', ada.tasks.filter((task: any) => task.kind === 'qm_give').map((task: any) => task.item), ['1']);
// A new order by PDA is taken down under that number, and word goes back that it is noted.
QUARTERMASTER.readsMessage(ada, 'Hop Kins', 'I need to order a crate of janitorial supplies for my staff, please.', 5100, 'Head of Personnel');
add('a head\'s order by PDA is taken down', ada.ledger.orders.at(-1).n + ' ' + ada.ledger.orders.at(-1).cost, '3 400');
add('it is to be written in the book', ada.ledger.toWrite, ['Order 3. From Hop Kins, Head of Personnel: 1 Janitorial Supplies Crate. 400 cr.']);
add('and word goes back that it is noted', NOTED_WORDS.test(ada.toTell.at(-1).line) && ada.toTell.at(-1).to === 'Hop Kins' && ada.toTell.at(-1).byPda, true);
// The same order again while it is in hand is not taken twice.
QUARTERMASTER.readsMessage(ada, 'Hop Kins', 'I need to order a crate of janitorial supplies for my staff, please.', 5200, 'Head of Personnel');
add('the same order again is not taken twice', ada.ledger.orders.length, 3);
// Nor is an order from someone who is not a head, or talk that is not an order.
QUARTERMASTER.readsMessage(ada, 'Jan Itor', 'I need to order a crate of janitorial supplies, please.', 5300, 'Janitor');
QUARTERMASTER.readsMessage(ada, 'Hop Kins', 'How are things in cargo today?', 5400, 'Head of Personnel');
add('nor is an order from someone who is not a head, nor talk that is not an order', ada.ledger.orders.length, 3);

// The words an order is passed along in.
const ORDERABLE = ['Janitorial Supplies Crate', 'Replacement Lights'];
const wanted = [{ crate: 'Janitorial Supplies Crate', count: 2 }, { crate: 'Replacement Lights', count: 1 }];
const given = `Cora, order 3: I need to order ${orderSpoken(wanted)}, for Hop Kins. Chop chop.`;
const heard = given.match(GIVEN_WORDS);
add(`an order given to a technician: "${given}"`, heard && [Number(heard[1]), itemsAskedFor(heard[2].toLowerCase(), ORDERABLE), heard[3].trim()], [3, wanted, 'Hop Kins']);
add('a head ordering at the counter is not the Quartermaster giving an order', GIVEN_WORDS.test('Cora, I need to order a crate of janitorial supplies for my staff, please.'), false);
add('"Order 3, right away."', 'Order 3, right away.'.match(TAKEN_WORDS)?.[1], '3');
add('the same, in the technician\'s own words', 'Got it, order 3 coming up right away, boss.'.match(TAKEN_WORDS)?.[1], '3');
const docked = 'Ada, order 3 has come in: crates #4521 and #4522 (Janitorial Supplies Crate); crate #4523 (Replacement Lights). About time.'.match(DOCKED_WORDS);
add('word that an order has come in', docked && [docked[1], /#4523 \(Replacement Lights\)/.test(docked[2])], ['3', true]);
add('word that an order could not be placed', 'Ada, order 3 did not go through. The console would not take it.'.match(NOT_PLACED_WORDS)?.[1], '3');
add('the Captain\'s no, as the head is told of it', 'The Captain has said no to order 3: 2 Janitorial Supplies Crate. It will not be ordered.'.match(REFUSED_WORDS)?.[1], '3');
add('a head at the counter saying the Quartermaster did not answer', QM_SILENT_WORDS.test('Cora, I need to order a crate of janitorial supplies for my staff, please. The Quartermaster has not answered.'), true);

// A crate that has come in is known by its number afterwards, and one that is lost is ordered again once.
const cameIn = readBook([TAKEN, 'Order 1. Given to Cora Tech.', 'Order 1. Docked: crates #4521 and #4522 (Janitorial Supplies Crate); crate #4523 (Replacement Lights).', 'Order 1. Lost: crate #4523. Ordered again as order 2.'], 5000)[0];
add('the crates an order came as, with what each is', cameIn.crates, [{ number: 4521, kind: 'Janitorial Supplies Crate' }, { number: 4522, kind: 'Janitorial Supplies Crate' }, { number: 4523, kind: 'Replacement Lights' }]);
add('a loss written in the book is not ordered again a second time', cameIn.reordered, true);
add('crates told of in one line, several kinds', cratesTold('crates #12 and #13 (Janitorial Supplies Crate); crate #14 (Replacement Lights)').map((crate: any) => `${crate.number} ${crate.kind}`), ['12 Janitorial Supplies Crate', '13 Janitorial Supplies Crate', '14 Replacement Lights']);
const lost = 'Ada, crate #4521 for Hal Pott is lost: it has been destroyed. Shame.'.match(LOST_TOLD_WORDS);
add('a technician telling it a crate is lost', lost && [lost[1], lost[2], lost[3]], ['crate #4521', 'Hal Pott', 'it has been destroyed']);
const still = 'Ada, still waiting to be collected: crates #4521 and #4522 for Hal Pott.'.match(WAITING_TOLD_WORDS);
add('a technician telling it crates are still waiting', still && [still[1], still[2]], ['crates #4521 and #4522', 'Hal Pott']);
add('what the body says aloud at the post when it writes a crate off is not that', LOST_TOLD_WORDS.test('Crate 4521 for Hal Pott is lost: it has been destroyed. I will send word.'), false);

// The standing work, dealt out to however many technicians there are.
add('one technician has all of it', dutiesFor(['Cora Tech']), { 'Cora Tech': ['counter', 'shuttle', 'rooms'] });
add('two: the counter, and the shuttle and the rooms', dutiesFor(['Vik Hale', 'Cora Tech']), { 'Cora Tech': ['counter'], 'Vik Hale': ['shuttle', 'rooms'] });
add('three: one each', dutiesFor(['Vik Hale', 'Cora Tech', 'Sam Rees']), { 'Cora Tech': ['counter'], 'Sam Rees': ['shuttle'], 'Vik Hale': ['rooms'] });
add('a fourth helps with the shuttle', dutiesFor(['Vik Hale', 'Cora Tech', 'Sam Rees', 'Zed Ash'])['Zed Ash'], ['shuttle']);
for (const duties of [['counter'], ['shuttle', 'rooms'], ['counter', 'shuttle', 'rooms']]) {
  const line = dutyLine('Cora Tech', duties);
  add(`said and read back: "${line}"`, dutiesIn(`${line} Off you go.`), { first: 'Cora', duties });
}
add('talk about the work is not handing it out', dutiesIn('Cora, the counter is busy this shift.'), null);

// QM-14: "Sam, I have that." is said at once every time, and a line held back holds up none behind it.
{
  const { drive } = await import(ROOT + 'driver');
  const spoken: string[] = [];
  const nextStep = (b: any) => drive(b, () => 'x', (line: string) => { spoken.push(line); });
  const qm: any = makeBrain('Ada Stone', 'Quartermaster');
  qm.location = 'Cargo Bay';
  qm.hasPda = true;
  qm.peopleInView = [{ name: 'Sam Rees', job: 'Cargo Technician', handle: 'p1', distance: 1 }];
  const said: string[] = [];
  for (let word = 0; word < 8; word++) {
    qm.toTell = [{ to: 'Sam Rees', line: 'Sam, I have that.', why: 'x', whileBusy: true, exact: true, at: Date.now() }];
    qm.failures.forEach((failure: any) => { failure.until = 0; });
    qm.sayingNow = false; qm.mustSay = null; qm.lastAct = null;
    const step = nextStep(qm);
    if (step?.say) said.push(step.say);
  }
  const hold = qm.failures.get('tell:Sam Rees:Sam, I have that.');
  add('said eight times, "I have that" is held back no longer than the first time', [said.length, hold.count, hold.until - Date.now() <= 5000], [8, 0, true]);
  qm.failures.forEach((failure: any) => { failure.until = 0; });
  qm.toTell = [
    { to: 'Sam Rees', line: 'Sam, one.', why: 'x', at: Date.now() },
    { to: 'Hop Kins', line: 'Hop, crate #3 is in.', why: 'x', byPda: true, at: Date.now() },
  ];
  qm.failures.set('tell:Sam Rees:Sam, one.', { count: 3, until: Date.now() + 60000 });
  qm.sayingNow = false; qm.mustSay = null; qm.lastAct = null;
  const behind = nextStep(qm);
  add('a held-back line does not hold up the PDA behind it', behind?.act?.text, 'Hop, crate #3 is in.');
}

// QM-08: which waiting order an answer from the Captain is about.
{
  const { orderAnswered } = await import(ROOT + 'jobs/quartermaster');
  const waiting = { orders: [{ n: 1, state: 'asking', approved: null, askedAt: 1000 }, { n: 2, state: 'asking', approved: null, askedAt: 4000 }, { n: 3, state: 'new', approved: 'self', askedAt: null }] } as any;
  add('two waiting, a bare yes is to the one asked about last', orderAnswered(waiting, 'Yes.')?.n, 2);
  add('"yes to order 1" is to order 1', orderAnswered(waiting, 'Yes to order 1')?.n, 1);
  add('"#1 is fine" is to order 1', orderAnswered(waiting, '#1 is fine')?.n, 1);
  add('a count of crates is no order number', orderAnswered(waiting, 'yes, 1 crate is fine')?.n, 2);
}

// QM-01: the Captain's answer about an order waiting on their say, read for both yes and no.
{
  const waitingQm = () => {
    const qm: any = makeBrain('Ada Finch', 'Quartermaster');
    qm.orderable = ['Janitorial Supplies Crate', 'Replacement Lights'];
    qm.crateCosts = { 'Janitorial Supplies Crate': 400, 'Replacement Lights': 400 };
    qm.budget = 600;
    qm.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Hop Kins', job: 'Head of Personnel' }, { name: 'Cap Tain', job: 'Captain' }];
    qm.ledger = { orders: readBook(['Order 1. From Hop Kins, Head of Personnel: 1 Janitorial Supplies Crate. 400 cr.', 'Order 1. Asked the Captain.'], 5000), next: 2, toWrite: [], read: true, paperRetryAt: 0, cameOutAt: 0, duties: {}, heldUp: {}, sendFor: null };
    return qm;
  };
  const answered = (line: string) => {
    const qm = waitingQm();
    QUARTERMASTER.readsMessage(qm, 'Cap Tain', line, 5100, 'Captain');
    const one = qm.ledger.orders[0];
    const said = qm.toTell.map((tell: any) => tell.line).join(' | ');
    return `${one.state}${one.approved ? ` (${one.approved})` : ''}, ${qm.ledger.orders.length} in book${/yes or a no/.test(said) ? ', asked' : ''}${/said no/.test(said) ? ', told no' : ''}${/cannot order/i.test(said) ? ', cannot order' : ''}`;
  };
  add('"Sure, no worries." is a yes', answered('Sure, no worries.'), 'new (captain), 1 in book');
  add('"Approved, but don\'t spend more than that." is a yes', answered("Approved, but don't spend more than that."), 'new (captain), 1 in book');
  add('"Yes, go for it. No need to ask again." is a yes', answered('Yes, go for it. No need to ask again.'), 'new (captain), 1 in book');
  add('"No one goes into the vault today." is no answer', answered('No one goes into the vault today.'), 'asking, 1 in book');
  add('"No rush, but order me a crate of replacement lights." is a new order, and order 1 waits', answered('No rush, but order me a crate of replacement lights.'), 'asking, 2 in book');
  add('"Ok, order me a crate of replacement lights." is a new order, and the ok is asked about', answered('Ok, order me a crate of replacement lights.'), 'asking, 2 in book, asked');
  add('"Go for it" is a yes', answered('Go for it'), 'new (captain), 1 in book');
  add('"Affirmative" is a yes', answered('Affirmative'), 'new (captain), 1 in book');
  add('"Yes, place that order." is a yes, and nothing is sent back', answered('Yes, place that order.'), 'new (captain), 1 in book');
  add('"No, not now." is a no', answered('No, not now.'), 'refused, 1 in book, told no');
  add('"Not approved." is a no', answered('Not approved.'), 'refused, 1 in book, told no');
  add('"Don\'t buy it." is a no', answered("Don't buy it."), 'refused, 1 in book, told no');
  add('"Yes. No." is asked about', answered('Yes. No.'), 'asking, 1 in book, asked');
  add('"No to order 3" is not about order 1', answered('No to order 3'), 'asking, 1 in book');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
