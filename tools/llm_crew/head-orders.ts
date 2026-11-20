// The Head of Personnel's orders, case by case: how it puts an order to cargo, at the counter or
// by PDA to the Quartermaster, what it takes for an answer, and what it does when none comes.
// No model is called.
//
//   bun run head-orders.ts
const { ROOT, makeBrain, know } = await import('./fixtures');
const { HEAD_OF_PERSONNEL } = await import(ROOT + 'jobs/head');
const { findTask } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const CAPTAIN = { name: 'Cap Tain', job: 'Captain' };
const JAN = { name: 'Jan Itor', job: 'Janitor' };
const TECH = { handle: 't1', name: 'Sam Tech', job: 'Cargo Technician', distance: 2, place: 'Cargo Lobby' };
const QM = { name: 'Quinn Master', job: 'Quartermaster' };

/** A Head of Personnel with one janitor short of something, and the people its PDA lists. */
function hop(onPda: any[] = [CAPTAIN, JAN]) {
  const b: any = makeBrain('Hop Kins', 'Head of Personnel');
  know(b, ['Cargo Lobby', 'Bar', 'Head of Personnel\'s Office']);
  b.meetingRoom = 'Bar';
  b.office = 'Head of Personnel\'s Office';
  b.location = b.office;
  b.pdaPeople = onPda;
  b.metOnce = true;
  b.asks = [{ who: JAN.name, what: 'something to clean with', at: 0, ordered: false, told: false }];
  b.nextMeetingAt = 1e9;
  b.now = 3000;
  HEAD_OF_PERSONNEL.syncTasks(b);
  return b;
}
const step = (b: any, kind = 'requisition') => {
  const task = findTask(b, kind);
  return task ? HEAD_OF_PERSONNEL.plan(b, task) : null;
};
/** Puts it at the counter at a time, seeing these people. */
const counter = (b: any, now: number, people: any[] = [], arrived = false) => {
  if (arrived || b.location !== 'Cargo Lobby') b.inPlaceSince = now;
  b.location = 'Cargo Lobby';
  b.peopleInView = people;
  b.now = now;
  HEAD_OF_PERSONNEL.syncTasks(b);
};

// HEAD-01: an order nobody at the counter takes does not stop the meetings.
{
  const b = hop();
  add('an order is made for the janitor', !!b.requisition, true);
  // A meeting falls due while it is on its way to the counter: it is called.
  b.nextMeetingAt = 3100;
  b.now = 3200;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('a meeting falls due on the way to the counter: it is called', !!b.meeting, true);
  add('and the order waits for it: no requisition task beside the meeting', !!findTask(b, 'requisition'), false);
}
{
  // Three visits with nobody at the counter: it puts the order by and tells the Captain, once.
  const b = hop();
  for (const visit of [0, 1, 2]) {
    const start = 4000 + visit * 2000;
    counter(b, start, [], true);
    counter(b, start + 700);
    step(b);
  }
  add('three empty visits: the order is put by', step(b)?.step?.includes('put it by'), true);
  add('the Captain is told once', b.toTell.filter((t: any) => t.to === 'Cap Tain').map((t: any) => t.line), ['Nobody at the cargo counter will take my order for a crate of janitorial supplies. I will try again after the next staff meeting.']);
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('while put by, it is no task', !!findTask(b, 'requisition'), false);
  // The next meeting comes and goes; the order is taken up again.
  b.nextMeetingAt = b.now + 100;
  b.now += 200;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('the next meeting is called while it is put by', !!b.meeting, true);
  b.meeting.closedAt = b.now;
  HEAD_OF_PERSONNEL.syncTasks(b);
  b.now += 10;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('after that meeting, a fresh order is made for the janitor', [!!b.requisition, b.requisition && !b.requisition.lines[0].people.includes('x'), !!findTask(b, 'requisition')], [true, true, true]);
  const again = b.requisition;
  b.nextMeetingAt = 1e9;
  let last: any = null;
  for (const visit of [0, 1, 2]) {
    const start = b.now + 100 + visit * 2000;
    counter(b, start, [], true);
    counter(b, start + 700);
    last = step(b);
  }
  add('put by a second time: the Captain is not told again', [last?.step?.includes('put it by'), b.toTell.filter((t: any) => /cargo counter/.test(t.line)).length, b.requisition === again], [true, 1, true]);
}
{
  // A technician lying on the floor at the counter is nobody to take an order.
  const b = hop();
  counter(b, 4000, [{ ...TECH, down: 1 }], true);
  add('a technician who is down is not asked', step(b)?.say ?? null, null);
}
{
  // Said twice on one visit with no answer: put by.
  const b = hop();
  counter(b, 4000, [TECH], true);
  const first = step(b);
  add('a technician at the counter is asked', !!first?.say?.startsWith('Sam, I need to order'), true);
  HEAD_OF_PERSONNEL.afterSaying(b, first.say);
  counter(b, 4400, [TECH]);
  const second = step(b);
  add('no answer in half a minute: asked again', !!second?.say?.startsWith('Sam, I need to order'), true);
  HEAD_OF_PERSONNEL.afterSaying(b, second.say);
  counter(b, 4800, [TECH]);
  add('no answer to the second: put by', step(b)?.step?.includes('put it by'), true);
}
{
  // No way known to the counter: put by, the Captain told, and meetings go on.
  const b = hop();
  b.places.delete('Cargo Lobby');
  const { setStationPlaces } = await import(ROOT + 'memory');
  setStationPlaces(['Bar', 'Custodial Closet']);
  add('no way to the counter: put by', step(b)?.step?.includes('put it by'), true);
  add('the Captain is told why', b.toTell.some((t: any) => /do not know the way to the cargo counter/.test(t.line)), true);
  setStationPlaces(['Arrival Shuttle Hallway', 'Central Primary Hallway', 'Bar', 'Kitchen', 'Medbay Central', 'Engineering', 'Bridge', 'Custodial Closet', 'Cargo Lobby', 'Cargo Bay', 'Library', 'Dormitories', 'Security Office', 'Chapel', 'Aft Maintenance']);
}
{
  // Told to hold a meeting with no room to hold it in: it does not say one is being called.
  const b = hop();
  b.meetingRoom = null;
  const { departmentHeadedBy } = await import(ROOT + 'hierarchy');
  const roomless = !departmentHeadedBy('Head of Personnel')?.meetsIn;
  const lines = HEAD_OF_PERSONNEL.whenAsked(b, 'Hop, find out how your staff are doing.');
  if (roomless) add('no room: it does not say a meeting is being called', lines.some((line: string) => /cannot call a staff meeting/.test(line)), true);
}

// HEAD-02: a crate lost at cargo, or not to be had, does not leave the asker noted as ordered for good.
const ordered = (b: any) => { b.asks[0].ordered = true; b.requisition = null; b.pickups = [{ number: 12, to: JAN.name, room: 'Custodial Closet', what: 'janitorial supplies', at: b.now }]; };
{
  const b = hop();
  ordered(b);
  HEAD_OF_PERSONNEL.readsMessage(b, 'Sam Tech', 'Lost at cargo: crate #12 (Janitorial Supplies Crate) from your order. It cannot be found. It will have to be ordered again, and nobody need come for it.', b.now, 'Cargo Technician');
  add('lost at cargo: the crate is no longer sent for', b.pickups.length, 0);
  add('and the asker is to be ordered for again', b.asks[0].ordered, false);
  b.now += 10;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('a fresh order is made', !!b.requisition, true);
}
{
  const b = hop([CAPTAIN, JAN, QM]);
  ordered(b);
  HEAD_OF_PERSONNEL.readsMessage(b, QM.name, 'Lost at cargo: crate #12 from your order. It cannot be found. I am having it ordered again, as order 4, and nobody need come for the lost one.', b.now, 'Quartermaster');
  add('lost and being ordered again: no fresh order, the crate not sent for', [b.asks[0].ordered, b.pickups.length], [true, 0]);
}
{
  const b = hop();
  ordered(b);
  HEAD_OF_PERSONNEL.readsMessage(b, JAN.name, 'Cargo says there is no crate #12 to collect: it has been lost, or the number is wrong. I have not got it.', b.now, 'Janitor');
  add('no such crate at the counter: not sent for, nothing ordered yet', [b.pickups.length, b.asks[0].ordered], [0, true]);
}
{
  const b = hop();
  ordered(b);
  b.now += 12100;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('ordered for and never told for twenty minutes: the ask and the crate are let go', [b.asks.length, b.pickups.length], [0, 0]);
}

// HEAD-05: its PDA will not send the order to the Quartermaster.
{
  const b = hop([CAPTAIN, JAN, QM]);
  const sent = step(b);
  add('with a Quartermaster aboard the order goes by PDA', [sent?.act?.tool, sent?.act?.person], ['message', QM.name]);
  HEAD_OF_PERSONNEL.afterActing(b, sent.act, undefined, false);
  b.now += 300;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('the PDA would not send it: the same message is not offered again', step(b)?.act ?? null, null);
  add('and the asks are not marked ordered', b.asks[0].ordered, false);
  b.nextMeetingAt = b.now;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('a meeting is called meanwhile', !!b.meeting, true);
  b.meeting = null;
  b.nextMeetingAt = 1e9;
  b.now += 5500;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('once the server has given the kept copy up, it goes to the counter', step(b)?.act?.place, 'Cargo Lobby');
}
{
  const b = hop([CAPTAIN, JAN, QM]);
  HEAD_OF_PERSONNEL.afterActing(b, step(b).act, undefined, false);
  b.now += 3000;
  HEAD_OF_PERSONNEL.readsMessage(b, QM.name, 'Noted, order 3: 1 Janitorial Supplies Crate, for Hop Kins.', b.now, 'Quartermaster');
  add('a Noted after the server sent the kept copy is taken', [b.requisition.heardBack, b.requisition.askedAt !== null, b.asks[0].ordered], [true, true, true]);
  b.now += 4000;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('and it never goes to the counter', step(b)?.act ?? null, null);
}

// TRA-02: told to its face at the counter that its order has come in, it sends for the crate.
const heard = (b: any, speaker: any, message: string, saidTo = 'me') => HEAD_OF_PERSONNEL.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: speaker.name, message, said_to: saidTo } });
for (const [saidTo, want] of [['me', true], ['other', false]] as [string, boolean][]) {
  const b = hop();
  counter(b, 4000, [TECH], true);
  HEAD_OF_PERSONNEL.afterSaying(b, step(b).say);
  heard(b, TECH, 'Hop, your order has come in: crate #12 (Janitorial Supplies Crate). Send someone to the Cargo Lobby counter with the number to collect it.', saidTo);
  add(`"your order has come in" said ${saidTo === 'me' ? 'to it' : 'to someone else'}: ${want ? '' : 'not '}sent for`, [b.pickups.map((p: any) => p.number), b.requisition === null], want ? [[12], true] : [[], false]);
}

// TRA-04: at the counter, only an answer to the head counts as its order taken.
for (const [line, saidTo, want] of [
  ['I am going to check to see what crates are still here.', 'nobody', false],
  ['Hop, I am coming to the door of the Cargo Bay to let you in.', 'me', false],
  ['Jan, crate 12 is out in the lobby for you.', 'other', false],
  ['Of course, Hop, I will put that in now.', 'me', true],
  ['Hop, I have put your order in: a crate of janitorial supplies.', 'me', true],
] as [string, string, boolean][]) {
  const b = hop();
  counter(b, 4000, [TECH], true);
  HEAD_OF_PERSONNEL.afterSaying(b, step(b).say);
  heard(b, TECH, line, saidTo);
  add(`at the counter, "${line.slice(0, 50)}" (${saidTo}): ${want ? '' : 'not '}the answer`, b.requisition.heardBack, want);
}
{
  // On the way by PDA, a technician heard in passing is not the Quartermaster's Noted.
  const b = hop([CAPTAIN, JAN, QM]);
  HEAD_OF_PERSONNEL.afterActing(b, step(b).act, undefined, true);
  b.peopleInView = [TECH];
  heard(b, TECH, 'Hop, good morning.');
  add('order sent by PDA: a technician\'s word is not its Noted', b.requisition.heardBack, false);
}

// HEAD-10: no room named by the server: no meeting in the Bar, and the Captain told once.
{
  const b = hop();
  b.meetingRoom = null;
  b.requisition = null;
  b.asks = [];
  b.nextMeetingAt = b.now;
  b.meetingOrderedBy = 'Cap Tain';
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('no room: no meeting is called', b.meeting, null);
  add('the Captain is told there is nowhere to hold one', b.toTell.filter((t: any) => /nowhere I can call my staff together/.test(t.line)).length, 1);
  add('the order to hold one is not left standing, and the next try is a gap off', [b.meetingOrderedBy, b.nextMeetingAt > b.now], [null, true]);
  b.now = b.nextMeetingAt + 1;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('told once only', b.toTell.filter((t: any) => /nowhere I can call my staff together/.test(t.line)).length, 1);
}

// HEAD-04: only the set asking line, outside a meeting, is an ask; at a meeting, only a report.
for (const [line, want] of [
  ['Excuse me, Hop, could you step aside, please? I need to get this past you.', false],
  ['Just on my way out of the closet.', false],
  ['The supply closet is a mess.', false],
  ['Hop, I need something to clean with for my work. Could you get it ordered, please?', true],
] as [string, boolean][]) {
  const b = hop();
  b.asks = [];
  b.peopleInView = [{ handle: 'j1', name: JAN.name, job: 'Janitor', distance: 1 }];
  heard(b, { name: JAN.name }, line);
  add(`"${line.slice(0, 60)}": ${want ? '' : 'not '}an ask`, b.asks.length, want ? 1 : 0);
}
{
  const { hearReport } = await import(ROOT + 'jobs/head');
  const b = hop();
  b.asks = [];
  b.meeting = { calledAt: 0, room: 'Bar', calledIn: true, invited: [JAN.name], copied: true, answers: { [JAN.name]: 'coming' }, startedAt: 10, turns: [], reports: {}, closedAt: null, orderedBy: null };
  add('at a meeting, a stray "I need" from someone not called on is no report', hearReport(b, JAN.name, 'I have nothing to show yet, I need a moment.'), null);
  add('a report put to it by name is', !!hearReport(b, JAN.name, 'Hop, I have nothing to show yet. I need something to clean with.'), true);
}

// TRA-08: someone who asks while a crate with room for them is coming is put on it.
const MO = { name: 'Mo Mopp', job: 'Janitor' };
const CAL = { name: 'Cal Clean', job: 'Janitor' };
{
  const b = hop([CAPTAIN, JAN, MO, CAL]);
  counter(b, 4000, [TECH], true);
  HEAD_OF_PERSONNEL.afterSaying(b, step(b).say);
  heard(b, TECH, 'Of course, Hop.');
  HEAD_OF_PERSONNEL.readsMessage(b, MO.name, 'Hop, I need something to clean with for my work. Could you get it ordered, please?', b.now, 'Janitor');
  add('a second asker while the order is out: put on it', [b.requisition.lines[0].people, b.asks.find((a: any) => a.who === MO.name)?.ordered], [[JAN.name, MO.name], true]);
  HEAD_OF_PERSONNEL.readsMessage(b, TECH.name, 'Hop, your order has come in: crate #12 (Janitorial Supplies Crate). Send someone to the Cargo Lobby counter with the number to collect it.', b.now, 'Cargo Technician');
  b.now += 10;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('no second order once it has come in', b.requisition, null);
  HEAD_OF_PERSONNEL.readsMessage(b, CAL.name, 'Hop, I need something to clean with for my work. Could you get it ordered, please?', b.now, 'Janitor');
  b.now += 10;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('a third, with no room left in the crate: ordered for', b.requisition?.lines?.[0]?.people, [CAL.name]);
}
{
  const b = hop([CAPTAIN, JAN, MO]);
  counter(b, 4000, [TECH], true);
  HEAD_OF_PERSONNEL.afterSaying(b, step(b).say);
  heard(b, TECH, 'Of course, Hop.');
  HEAD_OF_PERSONNEL.readsMessage(b, TECH.name, 'Hop, your order has come in: crate #12 (Janitorial Supplies Crate). Send someone to the Cargo Lobby counter with the number to collect it.', b.now, 'Cargo Technician');
  HEAD_OF_PERSONNEL.readsMessage(b, MO.name, 'Hop, I need something to clean with for my work. Could you get it ordered, please?', b.now, 'Janitor');
  b.now += 10;
  HEAD_OF_PERSONNEL.syncTasks(b);
  add('asked after the crate came in, before it is unpacked: put on it, nothing ordered', [b.requisition, b.asks.find((a: any) => a.who === MO.name)?.ordered], [null, true]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
