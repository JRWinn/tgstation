// Someone at the counter come for a crate (CARGO-08): which number they gave, whether they were
// taken as collecting at all, and which held crate is brought out for them, or what they are told.
// No model is called (CrewBrain/jobs/pickups.ts, crateNumberIn and COLLECT_WORDS; jobs/cargo.ts,
// overhears).
//
//   bun run cargo-pickups.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');
const { COLLECT_WORDS, crateNumberIn } = await import(ROOT + 'jobs/pickups');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// What was said; the number read; taken as collecting.
const table: [string, number | null, boolean][] = [
  ["I'm here for my crate", null, true],
  ['I have come for my crate, number is 12', 12, true],
  ['here to collect crate no. 12', 12, true],
  ['picking up crate twelve', 12, true],
  ['here for #12', 12, true],
  ['can i have crate 12', 12, true],
  ['I am here to get crate 12', 12, true],
  ['come to grab crate 12', 12, true],
  ['I need to pick my crate up', null, true],
  ['Sam, I am here to collect crate 12 for Hop Kins, please.', 12, true],
  // Orders, not collecting.
  ['can I have a crate of soap', null, false],
  ['could I get a crate of lights', null, false],
  ['I need to order a crate of janitorial supplies for my staff, please.', null, false],
  ['no one is here to help', null, false],
];
for (const [said, number, collecting] of table) {
  add(`"${said}": number`, crateNumberIn(said), number);
  add(`"${said}": collecting`, COLLECT_WORDS.test(said), collecting);
}

const CAPTAIN = { handle: 'p1', name: 'Hedley Bowchiew', job: 'Captain', command: 1 };
let at = 10_000;
const tech = (held: any[]) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `pickups-${at}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  at += 5000; // each brain its own asking, so takeOrder's claim from one case does not carry over
  b.now = at;
  b.peopleInView = [{ ...CAPTAIN, place: 'Cargo Lobby', distance: 1 }];
  b.pdaPeople = [{ name: CAPTAIN.name, job: CAPTAIN.job }];
  b.heldCrates = held.map((crate) => ({ for: null, what: 'Replacement Lights', place: 'Cargo Bay', out: false, takenBy: null, waited: 100, ...crate }));
  b.toTell = [];
  return b;
};
const hear = (b: any, message: string) => CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: CAPTAIN.name, message, said_to: 'me' } });
{
  const b = tech([{ number: 37, for: CAPTAIN.name }]);
  hear(b, "I'm here for my crate.");
  add('the Captain, one crate held for him, no number: that crate', b.pickupAsked?.number ?? null, 37);
  add('and nothing to tell him', b.toTell.map((it: any) => it.line), []);
}
{
  const b = tech([{ number: 37, for: CAPTAIN.name }, { number: 41, for: CAPTAIN.name }]);
  hear(b, "I'm here for my crate.");
  add('two held for him, no number: none picked', b.pickupAsked?.number ?? null, null);
  add('and he is asked which', b.toTell.map((it: any) => it.line), ['Hedley, I am holding crates #37 and #41 for you. Which number is it?']);
}
{
  const b = tech([{ number: 37, for: 'Hop Kins' }]);
  hear(b, "I'm here for my crate.");
  add('none held for him, no number: not "by that number"', b.toTell.map((it: any) => it.line), ['Sorry, Hedley, I am holding no crate for you. Which number is it?']);
}
{
  const b = tech([{ number: 37, for: 'Hop Kins' }]);
  hear(b, 'I am here to collect crate 12.');
  add('a number that is no crate: told so by that number', b.toTell.map((it: any) => it.line), ['Sorry, Hedley, I am not holding a crate by that number: crate 12.']);
}
{
  const b = tech([{ number: 37, for: CAPTAIN.name }]);
  hear(b, 'I am here to collect crate 9999.');
  add('a wrong number from one with a crate held: not handed his own instead', b.pickupAsked?.number ?? null, null);
  add('and told so by that number', b.toTell.map((it: any) => it.line), ['Sorry, Hedley, I am not holding a crate by that number: crate 9999.']);
}

{
  // CARGO-13, the technician's side: a collecting line said to a workmate lying at the counter.
  const MARIA = { handle: 'p6', name: 'Maria Williams', job: 'Cargo Technician', place: 'Cargo Lobby', distance: 2 };
  const said = (down: boolean) => {
    const b = tech([{ number: 12, for: 'Hop Kins' }]);
    b.peopleInView.push(down ? { ...MARIA, down: 1 } : MARIA);
    CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: CAPTAIN.name, message: 'Maria, I am here to collect crate 12 for Hop Kins, please.', said_to: 'other', said_to_name: MARIA.name } });
    return b.pickupAsked?.number ?? null;
  };
  add('asked of Maria, who is standing there: left to her', said(false), null);
  add('asked of Maria, who is lying there: taken by this one', said(true), 12);
}
// CARGO-15: an order that says who will come for it is an order.
{
  const { comeForCrate } = await import(ROOT + 'jobs/pickups');
  const come = (said: string) => comeForCrate(said, crateNumberIn(said));
  for (const said of [
    "I'm here for a crate of janitorial supplies, can you order one?",
    'Can you fetch me a crate of light bulbs from the console?',
    "Could you order a crate of soap? I'll come for it later.",
    "Order a crate of cleaning supplies, I'll send someone to pick it up.",
    'Order me a crate of lights, the janitor will collect it.',
  ]) {
    add(`"${said}": an order, not come for a crate`, come(said), false);
  }
  add('"I\'m here for crate 12": come for it', come("I'm here for crate 12"), true);
  add('"I\'m here to collect crate #12": come for it', come("I'm here to collect crate #12"), true);
  add('"I\'m here to collect my crate": come for it', come("I'm here to collect my crate"), true);
  const b = tech([{ number: 12, for: 'Jan Mopp' }]);
  b.pdaPeople.push({ name: 'Jan Mopp', job: 'Janitor' });
  hear(b, 'Order me a crate of lights, the janitor will collect it.');
  add('an order naming the janitor, with a crate held for a janitor: no crate brought out', b.pickupAsked?.number ?? null, null);
  add('and nobody is told "not holding"', b.toTell.map((it: any) => it.line), []);
}
// CARGO-13: the collector asks a technician who can answer, turns to another after an ask that
// brought nothing, and after three asks tells its head and puts the errand off.
{
  const { planPickups, pickupsAfterSaying } = await import(ROOT + 'jobs/pickups');
  const SAM = { handle: 'p5', name: 'Sam Tech', job: 'Cargo Technician', place: 'Cargo Lobby', distance: 2 };
  const MARIA = { handle: 'p6', name: 'Maria Williams', job: 'Cargo Technician', place: 'Cargo Lobby', distance: 2 };
  const jan: any = makeBrain('Jan Mopp', 'Janitor');
  jan.location = 'Cargo Lobby';
  jan.knownPlaces = new Set(['Cargo Lobby', 'Bar']);
  jan.inPlaceSince = 0;
  jan.now = 1000;
  jan.hasPda = true;
  jan.toTell = [];
  jan.heldCrates = [];
  jan.peopleInView = [{ ...SAM, down: 1 }, MARIA];
  const task: any = { id: 1, kind: 'collect', item: '12', place: 'Bar', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
  jan.tasks = [task];
  const ask = () => {
    const plan = planPickups(jan, task);
    if (plan?.say) pickupsAfterSaying(jan, plan.say);
    return plan?.say ?? null;
  };
  add('Sam lying at the counter, Maria standing: Maria is asked', ask(), 'Maria, I am here to collect crate 12 for Hop Kins, please.');
  jan.peopleInView = [SAM, MARIA];
  jan.now += 700;
  add('nothing brought out a minute later: the other technician is asked', ask(), 'Sam, I am here to collect crate 12 for Hop Kins, please.');
  jan.now += 700;
  add('and the next time, back to the first', ask(), 'Maria, I am here to collect crate 12 for Hop Kins, please.');
  jan.now += 700;
  const fourth = planPickups(jan, task);
  add('after three asks it asks no more', fourth?.say ?? null, null);
  add('and its head is sent word by PDA', jan.toTell.map((it: any) => [it.to, it.line, !!it.byPda]), [['Hop Kins', 'Cargo has not brought out crate #12: I asked 3 times at the counter. I will try again later.', true]]);
  add('and it is put off a while', task.retryAt > jan.now, true);
  const lone: any = { ...jan, peopleInView: [{ ...SAM, cuffed: 1 }], tasks: [], toTell: [] };
  const other: any = { ...task, asks: 0, askedAt: undefined, askedOf: undefined };
  lone.tasks = [other];
  add('the only technician in cuffs: nobody is asked', planPickups(lone, other)?.say ?? null, null);
}

// JOBS-02: once the crate is out, the rest of the errand is kept a half hour from then. (What
// keeps it is the give-up rule in tasks.ts reading keepUntil, which this table does not run.)
{
  const { syncPickups, pickupsAfterActing } = await import(ROOT + 'jobs/pickups');
  const b: any = makeBrain('Jan Mopp', 'Janitor');
  b.now = 17_000;
  b.heldCrates = [{ number: 12, for: 'Hop Kins', what: null, place: 'Cargo Lobby', out: false, takenBy: null, waited: 100 }];
  const task: any = { id: 1, kind: 'collect', item: '12', place: 'Bar', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
  b.tasks = [task];
  syncPickups(b);
  add('the crate not out yet: nothing kept past the usual', task.keepUntil ?? null, null);
  b.heldCrates[0].out = true;
  syncPickups(b);
  add('the crate put out at 28 minutes: kept a half hour from then', task.keepUntil, 17_000 + 18_000);
  b.now = 19_000;
  pickupsAfterActing(b, { tool: 'collect_crate', number: 12, place: 'Bar' }, task, true);
  add('unpacked: kept a half hour from then', task.keepUntil, 19_000 + 18_000);
}
// TRA-03: "no such crate" ends only the errand it is about.
{
  const { pickupsOverhear } = await import(ROOT + 'jobs/pickups');
  const CORA = { handle: 'p7', name: 'Cora Tech', job: 'Cargo Technician', place: 'Cargo Lobby', distance: 1 };
  const MO = { handle: 'p8', name: 'Mo Pper', job: 'Janitor', place: 'Cargo Lobby', distance: 1 };
  const collector = (items: string[]) => {
    const b: any = makeBrain('Jan Mopp', 'Janitor');
    b.now = 5000;
    b.hasPda = true;
    b.toTell = [];
    b.heldCrates = [];
    b.peopleInView = [CORA, MO];
    b.tasks = items.map((item, i) => ({ id: i + 1, kind: 'collect', item, place: 'Bar', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0, askedAt: 4900 }));
    return b;
  };
  const hearFrom = (b: any, who: any, message: string, said_to = 'nobody') =>
    pickupsOverhear(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: who.name, message, said_to } });
  const open = (b: any) => b.tasks.filter((t: any) => t.state !== 'done').map((t: any) => t.item);
  {
    const b = collector(['12', '13']);
    hearFrom(b, CORA, 'Crate 12 for Hop Kins is lost: it has been emptied. I will send word.');
    add('"Crate 12 ... is lost": only the errand for 12 ends', open(b), ['13']);
  }
  {
    const b = collector(['13']);
    hearFrom(b, CORA, 'Sorry, Mo, I am not holding a crate by that number: crate 99.');
    add('Mo told there is no crate 99: Jan\'s errand for 13 stands', open(b), ['13']);
  }
  {
    const b = collector(['13']);
    b.now = 5050;
    hearFrom(b, MO, 'Cora, I am here to collect crate 99 for Hop Kins, please.');
    hearFrom(b, CORA, 'Sorry, I am not holding a crate by that number.', 'me');
    add('a numberless no after Mo asked too: Jan\'s errand stands', open(b), ['13']);
  }
  {
    const b = collector(['13']);
    hearFrom(b, CORA, 'Sorry, I am not holding a crate by that number.', 'me');
    add('a numberless no said to it, nobody else asking: its errand ends', open(b), []);
  }
  {
    const b = collector(['13']);
    hearFrom(b, CORA, 'Sorry, I am not holding a crate by that number.', 'nobody');
    add('a numberless no said to nobody: its errand stands', open(b), ['13']);
  }
  // JOBS-05: cargo saying someone else has the crate already ends the errand, and its head is told.
  {
    const b = collector(['12']);
    hearFrom(b, CORA, 'Jan, Mo Pper has taken crate 12 already.', 'me');
    add('JOBS-05: "Mo Pper has taken crate 12 already": the errand ends', open(b), []);
    add('JOBS-05: and its head is told who has it', b.toTell.map((t: any) => [t.to, t.line, !!t.byPda]), [['Hop Kins', 'Cargo says Mo Pper has taken crate #12 already. I have not got it.', true]]);
  }
  {
    const b = collector(['13']);
    hearFrom(b, CORA, 'Jan, Mo Pper has taken crate 12 already.', 'me');
    add('JOBS-05: taken word of another crate: its errand stands', open(b), ['13']);
  }
}
// JOBS-05: a crate out in the lobby is taken up only by a collector in the room with it.
{
  const { planPickups } = await import(ROOT + 'jobs/pickups');
  const b: any = makeBrain('Jan Mopp', 'Janitor');
  b.location = 'Custodial Closet';
  b.knownPlaces = new Set(['Cargo Lobby', 'Custodial Closet']);
  b.now = 5000;
  b.toTell = [];
  b.heldCrates = [{ number: 12, for: 'Hop Kins', what: null, place: 'Cargo Lobby', out: true, takenBy: null, waited: 100 }];
  const task: any = { id: 1, kind: 'collect', item: '12', place: 'Bar', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
  b.tasks = [task];
  add('JOBS-05: the crate out, the collector elsewhere: it goes to the lobby, not to the crate', planPickups(b, task)?.act?.tool, 'go_to');
  b.location = 'Cargo Lobby';
  add('JOBS-05: in the lobby with it: it takes it up', planPickups(b, task)?.act?.tool, 'collect_crate');
}
// MULTI-07: someone else has hold of the crate: the errand ends quietly.
{
  const { pickupsAfterActing } = await import(ROOT + 'jobs/pickups');
  const collecting = () => {
    const b: any = makeBrain('Jan Mopp', 'Janitor');
    b.now = 5000;
    b.toTell = [];
    const task: any = { id: 1, kind: 'collect', item: '12', place: 'Bar', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
    b.tasks = [task];
    return { b, task };
  };
  {
    const { b, task } = collecting();
    pickupsAfterActing(b, { tool: 'collect_crate', number: 12 }, task, false, {}, 'Mo Pper already has hold of the janitorial supplies crate.');
    add('MULTI-07: "already has hold of": the errand ends, nothing said', [task.state, b.toTell.length], ['done', 0]);
  }
  {
    const { b, task } = collecting();
    pickupsAfterActing(b, { tool: 'collect_crate', number: 12 }, task, false, { held_by: 'Mo Pper' }, 'You could not take it.');
    add('MULTI-07: held_by in the details: the errand ends', task.state, 'done');
  }
  {
    const { b, task } = collecting();
    pickupsAfterActing(b, { tool: 'collect_crate', number: 12 }, task, false, {}, 'You lost your grip on it.');
    add('MULTI-07: a lost grip is not that: the errand stands', task.state, 'open');
  }
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
