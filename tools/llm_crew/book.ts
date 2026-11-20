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
  // PARSE-06: naming the kind of crate the waiting order is for does not make the yes a new order.
  add('"Yes, the janitorial one." to a janitorial order is a yes', answered('Yes, the janitorial one.'), 'new (captain), 1 in book');
  add('"Yes, and order some lights." is still a new order, and the yes is asked about', answered('Yes, and order some lights.'), 'asking, 2 in book, asked');
  const paperQm = () => {
    const qm = waitingQm();
    qm.orderable = ['Janitorial Supplies Crate', 'Replacement Lights', 'Bureaucracy Crate'];
    qm.crateCosts['Bureaucracy Crate'] = 300;
    qm.ledger.orders = readBook(['Order 1. From Hop Kins, Head of Personnel: 1 Bureaucracy Crate. 300 cr.', 'Order 1. Asked the Captain.'], 5000);
    return qm;
  };
  for (const [line, want] of [['Yes, the paper one.', 'new (captain)'], ['No, not the paper.', 'refused'], ['Yes, the lights.', 'asking']]) {
    const qm = paperQm();
    QUARTERMASTER.readsMessage(qm, 'Cap Tain', line, 5100, 'Captain');
    add(`"${line}" to an order of paper waiting on the Captain`, `${qm.ledger.orders[0].state}${qm.ledger.orders[0].approved ? ` (${qm.ledger.orders[0].approved})` : ''}`, want);
  }
}

// QM-10: a head's line sorted into cancel, question, order or talk before anything is ordered.
{
  const clearedQm = () => {
    const qm: any = makeBrain('Ada Finch', 'Quartermaster');
    qm.orderable = ['Janitorial Supplies Crate', 'Replacement Lights'];
    qm.crateCosts = { 'Janitorial Supplies Crate': 400, 'Replacement Lights': 400 };
    qm.budget = 2000;
    qm.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Hop Kins', job: 'Head of Personnel' }, { name: 'Cap Tain', job: 'Captain' }];
    qm.ledger = { orders: readBook(['Order 1. From Hop Kins, Head of Personnel: 1 Replacement Lights. 400 cr.', 'Order 1. No Captain aboard: approved by me.'], 5000), next: 2, toWrite: [], read: true, paperRetryAt: 0, cameOutAt: 0, duties: {}, heldUp: {}, sendFor: null };
    qm.ledger.orders[0].state = 'cleared';
    return qm;
  };
  const sent = (line: string, from = 'Cap Tain', job = 'Captain') => {
    const qm = clearedQm();
    QUARTERMASTER.readsMessage(qm, from, line, 5100, job);
    return qm;
  };
  const toldOf = (qm: any) => qm.toTell.map((tell: any) => `${tell.to}: ${tell.line}`).join(' | ');
  {
    const qm = sent('Cancel the replacement lights order, we do not need it.');
    add('"Cancel the replacement lights order" cancels order 1 and orders nothing', [qm.ledger.orders.length, qm.ledger.orders[0].state, qm.ledger.toWrite], [1, 'refused', ['Order 1. Cancelled by Cap Tain.']]);
    add('and Hop Kins is told, in words the head reads as the order not coming', qm.toTell.some((tell: any) => tell.to === 'Hop Kins' && REFUSED_WORDS.test(tell.line)), true);
    add('and the Captain is told it is cancelled', qm.toTell.some((tell: any) => tell.to === 'Cap Tain' && /order 1: .* is cancelled/i.test(tell.line)), true);
  }
  for (const line of ['Has the janitorial order come in yet?', 'Why did you order janitorial supplies?', 'Did order 1 for lights arrive?']) {
    const qm = sent(line);
    add(`"${line}" orders nothing, and is answered from the book`, [qm.ledger.orders.length, qm.toTell.length === 1 && qm.toTell[0].to === 'Cap Tain'], [1, true]);
  }
  add('the answer names order 1 and where it stands', toldOf(sent('Did order 1 for lights arrive?')), 'Cap Tain: Order 1, 1 Replacement Lights for Hop Kins: cleared, and being given to a technician to place.');
  {
    const qm = sent("Don't order any more lights.");
    add('"Don\'t order any more lights." orders nothing and cancels nothing', [qm.ledger.orders.length, qm.ledger.orders[0].state], [1, 'cleared']);
  }
  {
    const qm = sent('Has my order come in?', 'Hal Pott', 'Chief Engineer');
    add('"Has my order come in?" from a head with none: no order, and no "I cannot order that"', [qm.ledger.orders.length, /cannot order/i.test(toldOf(qm)), /no order from you/.test(toldOf(qm))], [1, false, true]);
  }
  add('"Can we get a crate of replacement lights?" is an order', sent('Can we get a crate of replacement lights?').ledger.orders.length, 2);
  add('"Could you order janitorial supplies, please?" is an order', sent('Could you order janitorial supplies, please?').ledger.orders.length, 2);
  {
    const qm = sent('Cancel my lights order.', 'Hal Pott', 'Chief Engineer');
    add('a head cannot cancel another head\'s order', [qm.ledger.orders[0].state, /no order like that/.test(toldOf(qm))], ['cleared', true]);
  }
  {
    const qm = clearedQm();
    qm.ledger.orders[0].state = 'given'; qm.ledger.orders[0].givenTo = 'Cora Tech';
    QUARTERMASTER.readsMessage(qm, 'Hop Kins', 'Please cancel order 1.', 5100, 'Head of Personnel');
    add('an order already with a technician is said to be past calling off', [qm.ledger.orders[0].state, /already with Cora Tech/.test(toldOf(qm))], ['given', true]);
  }
  add('a cancel written in the book is read back as off', readBook(['Order 1. From Hop Kins, Head of Personnel: 1 Replacement Lights. 400 cr.', 'Order 1. Cancelled by Hop Kins.'], 5000).map((order: any) => `${order.state} ${order.cancelledBy}`), ['refused Hop Kins']);
}

// QM-12: a lost crate is ordered again once by cargo, and the reorder, lost too, is not.
{
  const qm: any = makeBrain('Ada Finch', 'Quartermaster');
  qm.orderable = ['Janitorial Supplies Crate'];
  qm.crateCosts = { 'Janitorial Supplies Crate': 400 };
  qm.budget = 5000;
  qm.office = "Quartermaster's Office"; qm.location = 'Cargo Bay'; qm.staffPost = 'Cargo Bay';
  qm.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Hop Kins', job: 'Head of Personnel' }];
  qm.peopleInView = [{ handle: 'p2', name: 'Cora Tech', job: 'Cargo Technician' }];
  qm.ledger = { orders: readBook(['Order 3. From Hop Kins, Head of Personnel: 1 Janitorial Supplies Crate. 400 cr.', 'Order 3. Given to Cora Tech.', 'Order 3. Docked: crate #12 (Janitorial Supplies Crate).'], 5000, 'Ada Finch'), next: 4, toWrite: [], read: true, paperRetryAt: 0, cameOutAt: 0, duties: {}, heldUp: {}, sendFor: null };
  const tell = (line: string, saidTo = 'me') => QUARTERMASTER.overhears(qm, { seq: 1, time: '', at: 100, kind: 'heard', text: '', details: { speaker: 'Cora Tech', handle: 'p2', message: line, said_to: saidTo } } as any);
  // KNB-10: the same word said to someone else by name is not told to it, and nothing is reordered.
  tell('Hop, crate #12 for Hop Kins is lost: nobody can get to it.', 'other');
  add('a loss said to Hop Kins, not to it: not ordered again', [qm.ledger.orders.map((order: any) => order.n), qm.toTell.length], [[3], 0]);
  tell('Ada, crate #12 for Hop Kins is lost: nobody can get to it.');
  add('the first loss is ordered again', qm.ledger.orders.map((order: any) => order.n), [3, 4]);
  const four = qm.ledger.orders.find((order: any) => order.n === 4);
  four.state = 'docked';
  four.crates = [{ number: 13, kind: 'Janitorial Supplies Crate' }];
  qm.ledger.toWrite = [];
  tell('Ada, crate #13 for Hop Kins is lost: nobody can get to it.');
  add('the reorder lost as well: not bought again', qm.ledger.orders.map((order: any) => order.n), [3, 4]);
  add('and written as lost with no reorder', qm.ledger.toWrite, ['Order 4. Lost: crate #13.']);
  const back = readBook(['Order 3. From Hop Kins, Head of Personnel: 1 Janitorial Supplies Crate. 400 cr.', 'Order 3. Lost: crate #12. Ordered again as order 4.', 'Order 4. From Hop Kins, Head of Personnel: 1 Janitorial Supplies Crate. 400 cr.'], 5000);
  add('read back from the book: the reorder is known for one', back.map((order: any) => `${order.n} ${!!order.reordered}`), ['3 true', '4 true']);
}

// TRUST-07: "did not go through" only from whoever has the order; a big reorder goes to the Captain.
{
  const qm: any = makeBrain('Ada Finch', 'Quartermaster');
  qm.orderable = ['Janitorial Supplies Crate'];
  qm.crateCosts = { 'Janitorial Supplies Crate': 400 };
  qm.budget = 5000;
  qm.office = "Quartermaster's Office"; qm.location = 'Cargo Bay'; qm.staffPost = 'Cargo Bay';
  qm.pdaPeople = [{ name: 'Sam Tech', job: 'Cargo Technician' }, { name: 'Kim Lie', job: 'Cargo Technician' }, { name: 'Jane Marsh', job: 'Head of Personnel' }, { name: 'Zim Fire', job: 'Captain' }];
  const book = readBook([
    'Order 4. From Jane Marsh, Head of Personnel: 2 Janitorial Supplies Crate. 800 cr.', 'Order 4. Given to Sam Tech.',
    'Order 5. From Jane Marsh, Head of Personnel: 3 Janitorial Supplies Crate. 1200 cr.', 'Order 5. Asked the Captain.', 'Order 5. The Captain said yes.', 'Order 5. Given to Sam Tech.',
    'Order 5. Docked: crates #21, #22 and #23 (Janitorial Supplies Crate).',
  ], 5000, 'Ada Finch');
  qm.ledger = { orders: book, next: 6, toWrite: [], read: true, paperRetryAt: 0, cameOutAt: 0, duties: {}, heldUp: {}, sendFor: null };
  const from = (who: string, line: string) => QUARTERMASTER.overhears(qm, { seq: 1, time: '', at: 100, kind: 'heard', text: '', details: { speaker: who, handle: 'p9', message: line, said_to: 'me' } } as any);
  const four = qm.ledger.orders.find((order: any) => order.n === 4);
  from('Kim Lie', 'Ada, order 4 did not go through.');
  add('"did not go through" from a technician who has not the order: it stays with Sam', [four.state, four.givenTo], ['given', 'Sam Tech']);
  from('Sam Tech', 'Ada, order 4 did not go through.');
  add('from Sam, who has it: it is to be given again', [four.state, four.givenTo, qm.ledger.toWrite.includes('Order 4. Could not be placed.')], ['new', null, true]);
  from('Kim Lie', 'Ada, crates #21, #22 and #23 for Jane Marsh are lost: they have been destroyed.');
  const again = qm.ledger.orders.find((order: any) => order.n === 6);
  add('a lost crate told by another technician is still ordered again', again?.items, [{ crate: 'Janitorial Supplies Crate', count: 3 }]);
  add('but a big reorder does not carry the Captain\'s yes over: it is asked again', again?.approved, null);
}

// CARGO-14: "for <name>" of someone on the Quartermaster's PDA list is who it is for, not a crate.
{
  const qm = makeBrain('Ada Finch', 'Quartermaster');
  qm.orderable = ['Janitorial Supplies Crate', 'Replacement Lights'];
  qm.crateCosts = { 'Janitorial Supplies Crate': 400, 'Replacement Lights': 400 };
  qm.budget = 2000;
  qm.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Hop Kins', job: 'Head of Personnel' }, { name: 'Paige Rags', job: 'Janitor' }];
  QUARTERMASTER.readsMessage(qm, 'Hop Kins', 'I need to order a crate of replacement lights for Paige Rags, please.', 5100, 'Head of Personnel');
  add('"lights for Paige Rags" orders lights only', qm.ledger?.orders.at(-1)?.items, [{ crate: 'Replacement Lights', count: 1 }]);
}

// QM-05 (words only, not yet said): the Quartermaster sending a technician to let a workmate out.
{
  const S = await import(ROOT + 'jobs/supply');
  const line = S.letOutLine('Sam', 'Cora', 'Warehouse');
  add('the let-out line', line, 'Sam, Cora is shut in the Warehouse. Could you let them out, please?');
  add('read back: to whom, who, and where', line.match(S.SEND_TO_LET_OUT_WORDS)?.slice(1, 4), ['Sam', 'Cora', 'Warehouse']);
  add('and it is not the "see to it" line', S.SEE_TO_WORDS.test(line), false);
}

// QM-05: told by PDA that Cora is shut in the Warehouse, the Quartermaster sends Sam with the
// let-out line, and Sam, hearing it, goes to the Warehouse door for Cora.
{
  const { CARGO } = await import(ROOT + 'jobs/cargo');
  const S = await import(ROOT + 'jobs/supply');
  const qm = makeBrain('Ada Finch', 'Quartermaster');
  qm.staffPost = 'Cargo Bay'; qm.office = "Quartermaster's Office"; qm.location = 'Cargo Bay';
  qm.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Sam Rees', job: 'Cargo Technician' }, { name: 'Kim Lie', job: 'Cargo Technician' }];
  // Kim is in view, lying on the floor: Sam is sent, not Kim.
  qm.peopleInView = [{ name: 'Kim Lie', job: 'Cargo Technician', handle: 'p3', distance: 3, down: true }];
  QUARTERMASTER.readsMessage(qm, 'Cora Tech', 'I am shut in the Warehouse and nobody has come to the door. Could you send someone to let me out to the Cargo Bay, please?', 5000, 'Cargo Technician');
  const sent = qm.ledger?.sendFor;
  add('the shut-in word sends one who is on their feet, with the let-out line', [sent?.to, sent?.line], ['Sam Rees', 'Sam, Cora is shut in the Warehouse. Could you let them out, please?']);
  const sam: any = makeBrain('Sam Rees', 'Cargo Technician');
  sam.post = 'Cargo Bay'; sam.location = 'Cargo Bay'; sam.closedRooms = ['Warehouse']; sam.now = 5100;
  sam.peopleInView = [{ name: 'Ada Finch', job: 'Quartermaster', handle: 'p1', distance: 1 }];
  sam.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }];
  CARGO.overhears(sam, { kind: 'speech', details: { speaker: 'Ada Finch', message: sent?.line ?? '', said_to: 'me' } });
  add('Sam takes it as a let-out ask from Cora, by PDA, for the Warehouse', (sam.doorAsks ?? []).map((ask: any) => `${ask.name} ${ask.room} ${ask.out} ${ask.byPda}`), ['Cora Tech Warehouse true true']);
  add('and is not only given the shuttle and the rooms', sam.seeToUntil, 0);
  CARGO.syncTasks(sam);
  add('and goes to the Warehouse door for her', sam.tasks.filter((task: any) => task.kind === 'door' && task.state !== 'done').map((task: any) => `${task.item} ${task.place} ${task.out}`), ['Cora Tech Warehouse true']);
  const kim: any = makeBrain('Kim Lie', 'Cargo Technician');
  kim.post = 'Cargo Bay'; kim.location = 'Cargo Bay'; kim.closedRooms = ['Warehouse']; kim.now = 5100;
  kim.peopleInView = [{ name: 'Ada Finch', job: 'Quartermaster', handle: 'p1', distance: 1 }];
  CARGO.overhears(kim, { kind: 'speech', details: { speaker: 'Ada Finch', message: sent?.line ?? '', said_to: 'other' } });
  add('a technician it was not said to takes no ask from it', kim.doorAsks ?? [], []);
  add('the crate line is still the see-to line', S.SEE_TO_WORDS.test(S.seeToLine('Sam', 'crate #12 is in the Supply Shuttle and Cora could not get it off the shuttle')), true);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
