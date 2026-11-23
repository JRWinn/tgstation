// Lighting the engine, case by case. No model is called and no station is simulated: the steps
// are data (CrewBrain/jobs/engine.ts), the lines the engineering staff pass between them are said
// word for word and read by code (jobs/engineering.ts), and what the engineer and the Chief
// Engineer do with them is code (jobs/engineer.ts, jobs/chiefengineer.ts). So all of it can be
// checked in a second.
//
//   bun run engine.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { lightingSteps, nextLightingStep, emitterSteps, batterySteps } = await import(ROOT + 'jobs/engine');
const { ENGINEER } = await import(ROOT + 'jobs/engineer');
const { CHIEF_ENGINEER } = await import(ROOT + 'jobs/chiefengineer');
const { jobFor } = await import(ROOT + 'jobs/index');
const { ENGINE_TAKEN, ENGINE_TAKEN_WORDS, HEARD_WORDS, heardLine, isChiefEngineer, isLightAgainOrder, isEngineer, LIGHT_WORDS, notOffLine, LIT_WORDS, lightLine, litLine, OFF_WORDS, offLine, ON_AGAIN_WORDS, onAgainLine, RELIGHT_WORDS, relightLine, SHUT_WORDS, shutLine, STUCK_WORDS, stuckLine } = await import(ROOT + 'jobs/engineering');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// MetaStation's engine room as the server names it to engineering staff, and the batteries.
function machines(without?: string): any[] {
  const list: any[] = [];
  const put = (kind: string, name: string, count = 1, place = 'Supermatter Engine Room') => {
    for (let nth = 1; nth <= count; nth++) {
      list.push({ id: `m${list.length + 1}`, name, kind, nth, place, seen: null });
    }
  };
  put('canister', 'nitrogen canister', 2);
  put('canister', 'canister', 2);
  put('pump', 'External Gas to Loop', 2);
  for (const name of ['Engine Coolant Bypass', 'Gas to Chamber', 'Gas to Filter', 'Cooling Loop Bypass', 'Atmos to Loop', 'Gas to Cold Loop', 'Cold Loop to Gas', 'Mix Bypass', 'Mix to Gas', 'Gas to Mix']) {
    put('pump', name);
  }
  put('filter', 'filter', 2);
  put('alarm', 'engine air alarm');
  put('emitter', 'emitter', 3);
  put('battery', 'battery', 3, 'Engineering');
  return list.filter((machine) => machine.name !== without);
}

// The steps.
const steps = lightingSteps(machines());
add('MetaStation\'s engine is one it has the steps for', steps?.length, 21);
add('the emitters are the last three steps', steps?.slice(-3).map((step: any) => step.kind), ['emitter', 'emitter', 'emitter']);
add('nothing before them is an emitter', steps?.slice(0, -3).some((step: any) => step.kind === 'emitter'), false);
add('the first step is a nitrogen canister onto its connector', steps && [steps[0].machine.name, steps[0].how], ['nitrogen canister', 'connect']);
add('the bypass is turned off, not on', steps?.find((step: any) => step.machine.name === 'Engine Coolant Bypass')?.how, 'off');
add('the pumps that are right already are left alone', steps?.some((step: any) => ['Cooling Loop Bypass', 'Atmos to Loop', 'Mix to Gas', 'Gas to Mix'].includes(step.machine.name)), false);
add('an engine room with a machine missing is not one it has the steps for', lightingSteps(machines('Mix Bypass')), null);
add('no machines at all is no engine it knows', lightingSteps([]), null);
// Emitters last is a rule of its own, whatever order a list is written in.
const shuffled = steps ? [steps[20], ...steps.slice(0, 20)] : [];
add('an emitter written first in a list is still not done first', nextLightingStep(shuffled, [])?.kind, 'canister');
add('with every other step done, the emitters are next', nextLightingStep(shuffled, shuffled.filter((step: any) => step.kind !== 'emitter').map((step: any) => step.key))?.kind, 'emitter');
add('with every step done there is none left', nextLightingStep(shuffled, shuffled.map((step: any) => step.key)), null);
add('three emitters to switch off', emitterSteps(machines(), 'switch_off').map((step: any) => step.how), ['switch_off', 'switch_off', 'switch_off']);
add('three batteries to set', batterySteps(machines()).length, 3);

// Who is who.
add('the Chief Engineer is not an engineer', [isChiefEngineer('Chief Engineer'), isEngineer('Chief Engineer')], [true, false]);
add('a Station Engineer is', [isChiefEngineer('Station Engineer'), isEngineer('Station Engineer')], [false, true]);
add('the job for "Chief Engineer" is the Chief Engineer\'s', jobFor('Chief Engineer') === CHIEF_ENGINEER, true);
add('the job for "Station Engineer" is the engineer\'s', jobFor('Station Engineer') === ENGINEER, true);

// The words, said and read back, with a remark after them.
add('the engine given', LIGHT_WORDS.test(`${lightLine('Sam Rees')} Quick as you can.`), true);
add('"The engine, right away."', ENGINE_TAKEN_WORDS.test(ENGINE_TAKEN), true);
add('the engine lit', LIT_WORDS.test(`${litLine('Ada Volt')} Humming nicely.`), true);
add('a step that would not take, and which', `${stuckLine('Ada Volt', 'the nitrogen canister will not connect')} Sorry.`.match(STUCK_WORDS)?.[1], 'the nitrogen canister will not connect');
add('emitters off', SHUT_WORDS.test(shutLine('Sam Rees')), true);
add('the emitters are off', OFF_WORDS.test(offLine('Ada Volt')), true);
add('switch them on again', RELIGHT_WORDS.test(relightLine('Sam Rees')), true);
add('the emitters are on again', ON_AGAIN_WORDS.test(onAgainLine('Ada Volt')), true);
add('"I have that"', HEARD_WORDS.test(heardLine('Sam Rees')), true);
add('talk about the engine is not giving it', LIGHT_WORDS.test('Sam, the engine is yours to worry about, not mine.'), false);
add('nor is asking whether the emitters are off an order', SHUT_WORDS.test('Sam, are the emitters off now?'), false);

// An engineer, with the Chief Engineer standing by.
const ADA = { name: 'Ada Volt', job: 'Chief Engineer', handle: 'p1', distance: 1 };
function engineer(inView = true): any {
  const sam = makeBrain('Sam Rees', 'Station Engineer');
  sam.machines = machines();
  sam.post = 'Engineering';
  sam.location = 'Engineering';
  sam.peopleInView = inView ? [ADA] : [];
  sam.pdaPeople = [{ name: 'Ada Volt', job: 'Chief Engineer' }];
  return sam;
}
const said = (who: any, speaker: string, message: string) => ENGINEER.overhears(who, { details: { message, speaker } } as any);
const open = (who: any, kind: string) => who.tasks.find((task: any) => task.kind === kind && task.state !== 'done');
/** Works one of its tasks until there is no step of it left, the server saying each step went as `goes` says. Returns the steps taken. */
function work(who: any, kind: string, goes: (act: any) => boolean = () => true, most = 60): any[] {
  const acts: any[] = [];
  for (let turn = 0; turn < most; turn++) {
    ENGINEER.syncTasks(who);
    const task = open(who, kind);
    const plan = task ? ENGINEER.plan(who, task) : null;
    if (!task || !plan?.ready || !plan.act) break;
    acts.push(plan.act);
    ENGINEER.afterActing(who, plan.act, task, goes(plan.act));
  }
  ENGINEER.syncTasks(who);
  return acts;
}

let sam = engineer();
sam.now = 400;
ENGINEER.syncTasks(sam);
add('with no order and little time gone, it does not start', !!open(sam, 'light_engine'), false);
said(sam, 'Ada Volt', lightLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('given the engine, it has it to light', !!open(sam, 'light_engine'), true);
add('and says that it has it, word for word', sam.toTell.map((tell: any) => [tell.to, tell.line, tell.exact, tell.whileBusy]), [['Ada Volt', ENGINE_TAKEN, true, true]]);
let acts = work(sam, 'light_engine');
add('it takes 21 steps, each at a machine', acts.map((act: any) => act.tool).filter((tool: string) => tool === 'work_machine').length, 21);
add('the emitters are the last thing it touches', acts.slice(-3).map((act: any) => act.how), ['switch_on', 'switch_on', 'switch_on']);
add('and nothing before them is an emitter', acts.slice(0, -3).some((act: any) => act.how === 'switch_on'), false);
add('the engine is lit, and that is word for the Chief Engineer', [sam.engine.lit, sam.engine.words.map((word: any) => word.line)], [true, ['Ada, the engine is lit.']]);
let word = open(sam, 'word_for_chief');
let step = ENGINEER.plan(sam, word);
add('it tells them to their face, word for word', [step.say, step.exact], ['Ada, the engine is lit.', true]);
ENGINEER.afterSaying(sam, step.say);
add('said is not told: it waits to hear it was heard', ENGINEER.plan(sam, word).wait, true);
said(sam, 'Ada Volt', 'Sam, I have that. Good work.');
ENGINEER.syncTasks(sam);
add('"I have that": the word is passed on', [sam.engine.words.length, !!open(sam, 'word_for_chief')], [0, false]);

// Not heard: it walks up, says it again, and then sends it by PDA.
sam = engineer();
sam.peopleInView = [{ ...ADA, distance: 6 }];
said(sam, 'Ada Volt', lightLine('Sam Rees'));
work(sam, 'light_engine');
word = open(sam, 'word_for_chief');
ENGINEER.afterSaying(sam, ENGINEER.plan(sam, word).say);
sam.now += 300;
step = ENGINEER.plan(sam, word);
add('no word back in 25 seconds: it walks up to them', step.act?.tool, 'approach');
ENGINEER.afterActing(sam, step.act, word, true);
step = ENGINEER.plan(sam, word);
add('and says it again', step.say, 'Ada, the engine is lit.');
ENGINEER.afterSaying(sam, step.say);
sam.now += 300;
step = ENGINEER.plan(sam, word);
add('twice unheard: it goes by PDA', [step.act?.tool, step.act?.person, step.act?.text], ['message', 'Ada Volt', 'Ada, the engine is lit.']);
ENGINEER.afterActing(sam, step.act, word, true);
add('sent, it is passed on', sam.engine.words.length, 0);

// A step that will not take.
sam = engineer();
said(sam, 'Ada Volt', lightLine('Sam Rees'));
acts = work(sam, 'light_engine', (act) => act.how !== 'connect');
add('a step that will not take is tried once more, and no further', acts.length, 2);
add('the emitters are never touched', acts.some((act: any) => act.how === 'switch_on'), false);
add('the job stops there', [sam.engine.stuck, !!open(sam, 'light_engine'), sam.engine.lit], ['the nitrogen canister will not connect', false, false]);
add('and the Chief Engineer is told which step', sam.engine.words.map((it: any) => it.line), ['Ada, I cannot light the engine: the nitrogen canister will not connect.']);
// Told again to light it, it starts afresh.
said(sam, 'Ada Volt', lightLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('given the engine again, it tries again', [sam.engine.stuck, !!open(sam, 'light_engine')], [null, true]);

// TRC-04: a step that fails for want of getting there, or of a free hand, is not the machine's fault.
for (const [told, tries, stuck] of [
  ['You could not get to it.', 5, 'I cannot get to the nitrogen canister'],
  ['You have no free hand to take your wrench out with.', 5, 'my hands are full and I cannot work the nitrogen canister'],
  ['The nitrogen canister will not connect.', 2, 'the nitrogen canister will not connect'],
  ['You know of no such machine.', 1, 'I do not know this engine'],
] as [string, number, string][]) {
  const it = engineer();
  said(it, 'Ada Volt', lightLine('Sam Rees'));
  let failed = 0;
  for (let turn = 0; turn < 10; turn++) {
    ENGINEER.syncTasks(it);
    const task = open(it, 'light_engine');
    const plan = task ? ENGINEER.plan(it, task) : null;
    if (!task || !plan?.act) break;
    failed++;
    ENGINEER.afterActing(it, plan.act, task, false, false, {}, told);
  }
  add(`"${told}": tried ${tries} time(s), then stops with the true reason`, [failed, it.engine.stuck], [tries, stuck]);
}

// TRC-04 (answer B): a stop that is not the machine's fault is tried again by itself five minutes
// on, at most twice; then it waits to be told. One that is the machine's is not.
{
  /** Fails every step it is sent to with these words, until it stops. Returns how many it tried. */
  const failAll = (it: any, told: string) => {
    let failed = 0;
    for (let turn = 0; turn < 10; turn++) {
      ENGINEER.syncTasks(it);
      const task = open(it, 'light_engine');
      const plan = task ? ENGINEER.plan(it, task) : null;
      if (!task || !plan?.act) break;
      failed++;
      ENGINEER.afterActing(it, plan.act, task, false, false, {}, told);
    }
    return failed;
  };
  const it = engineer();
  it.now = 100;
  said(it, 'Ada Volt', lightLine('Sam Rees'));
  failAll(it, 'You could not get to it.');
  const stoppedAt = it.now;
  add('unreached: stopped, and word owed to the Chief Engineer', [it.engine.stuck, it.engine.words.some((w: any) => w.what === 'stuck')], ['I cannot get to the nitrogen canister', true]);
  it.now = stoppedAt + 2900;
  ENGINEER.syncTasks(it);
  add('unreached: not tried again before five minutes', [it.engine.stuck, !!open(it, 'light_engine')], ['I cannot get to the nitrogen canister', false]);
  it.now = stoppedAt + 3000;
  ENGINEER.syncTasks(it);
  add('unreached: five minutes on, it tries again by itself', [it.engine.stuck, !!open(it, 'light_engine')], [null, true]);
  add('unreached: the stop not yet passed on is dropped', it.engine.words.some((w: any) => w.what === 'stuck'), false);
  add('unreached: given five more tries', failAll(it, 'You could not get to it.'), 5);
  it.now += 3000;
  ENGINEER.syncTasks(it);
  add('unreached: stopped again, it tries again a second time', [it.engine.stuck, !!open(it, 'light_engine')], [null, true]);
  failAll(it, 'You have no free hand to take your wrench out with.');
  it.now += 3000;
  ENGINEER.syncTasks(it);
  add('unreached: after two tries again it waits to be told', [it.engine.stuck, !!open(it, 'light_engine')], ['my hands are full and I cannot work the nitrogen canister', false]);
  it.now += 30000;
  ENGINEER.syncTasks(it);
  add('unreached: and goes on waiting', !!open(it, 'light_engine'), false);
  said(it, 'Ada Volt', lightLine('Sam Rees'));
  failAll(it, 'You could not get to it.');
  it.now += 3000;
  ENGINEER.syncTasks(it);
  add('given the engine afresh, it may try again by itself as before', [it.engine.stuck, !!open(it, 'light_engine')], [null, true]);
}
{
  const it = engineer();
  said(it, 'Ada Volt', lightLine('Sam Rees'));
  work(it, 'light_engine', (act) => act.how !== 'connect');
  it.now += 30000;
  ENGINEER.syncTasks(it);
  add('a machine that will not take: never tried again by itself', [it.engine.stuck, !!open(it, 'light_engine')], ['the nitrogen canister will not connect', false]);
}

// Nobody gives it the engine.
sam = engineer(false);
sam.now = 1300;
ENGINEER.syncTasks(sam);
add('two minutes in with no word, it starts by itself', [!!open(sam, 'light_engine'), sam.engine.by], [true, null]);
// Given it later, it carries on from where it is.
work(sam, 'light_engine', () => true, 5);
sam.peopleInView = [ADA];
said(sam, 'Ada Volt', lightLine('Sam Rees'));
add('given the engine while already lighting it, it keeps what it has done', sam.engine.done.length, 5);

// An engine it has no steps for.
sam = engineer();
sam.machines = machines('Mix Bypass');
said(sam, 'Ada Volt', lightLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('an engine it has no steps for is not lit by guesswork', [sam.engine.stuck, !!open(sam, 'light_engine')], ['I do not know this engine', false]);

// Emitters off.
sam = engineer();
said(sam, 'Ada Volt', lightLine('Sam Rees'));
work(sam, 'light_engine', () => true, 8);
said(sam, 'Ada Volt', shutLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('told emitters off, that is an emergency', open(sam, 'emitters_off')?.urgency, 'emergency');
add('and lighting the engine stops', !!open(sam, 'light_engine'), false);
acts = work(sam, 'emitters_off');
add('it switches off each emitter', acts.map((act: any) => act.how), ['switch_off', 'switch_off', 'switch_off']);
add('and tells the Chief Engineer they are off', sam.engine.words.map((it: any) => it.line), ['Ada, the emitters are off.']);
sam.now = 9000;
ENGINEER.syncTasks(sam);
add('shut off on that order, it does not light the engine again unasked', [sam.engine.shut, !!open(sam, 'light_engine')], [true, false]);
said(sam, 'Ada Volt', relightLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('nor switch the emitters on again', !!open(sam, 'emitters_on'), false);
said(sam, 'Ada Volt', lightLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('given the engine again by the Chief Engineer, it lights it', !!open(sam, 'light_engine'), true);

// One emitter whose controls are locked: the others are still switched off, and the Chief Engineer is told why.
sam = engineer();
said(sam, 'Ada Volt', lightLine('Sam Rees'));
work(sam, 'light_engine', () => true, 8);
said(sam, 'Ada Volt', shutLine('Sam Rees'));
{
  const locked = emitterSteps(machines(), 'switch_off')[0].machine.id;
  const tried: any[] = [];
  for (let turn = 0; turn < 20; turn++) {
    ENGINEER.syncTasks(sam);
    const task = open(sam, 'emitters_off');
    const plan = task ? ENGINEER.plan(sam, task) : null;
    if (!task || !plan?.ready || !plan.act) break;
    tried.push(plan.act.machine);
    const goes = plan.act.machine !== locked;
    ENGINEER.afterActing(sam, plan.act, task, goes, false, {}, goes ? 'You switch the emitter off.' : 'The emitter will not switch off: its controls are locked.');
  }
  ENGINEER.syncTasks(sam);
  add('a locked emitter is tried twice, then the other two are switched off', [tried.length, tried.filter((it) => it === locked).length], [4, 2]);
  add('and the shut-off is over', !!open(sam, 'emitters_off'), false);
  add('and the Chief Engineer is told why, as an emergency', [sam.engine.words.map((it: any) => it.line), sam.tasks.find((t: any) => t.item === 'notoff' && t.state !== 'done')?.urgency], [['Ada, I cannot switch the emitters off: its controls are locked.'], 'emergency']);
  said(sam, 'Ada Volt', shutLine('Sam Rees'));
  ENGINEER.syncTasks(sam);
  const again = open(sam, 'emitters_off');
  add('ordered off again, the locked one is tried again', again ? ENGINEER.plan(sam, again)?.act?.machine : null, locked);
}

// The emitters have stopped.
sam = engineer();
said(sam, 'Ada Volt', lightLine('Sam Rees'));
work(sam, 'light_engine');
sam.engine.words = [];
ENGINEER.readsMessage(sam, 'Ada Volt', relightLine('Sam Rees'), 0, 'Chief Engineer');
acts = work(sam, 'emitters_on');
add('told by PDA the emitters have stopped, it switches each on again', acts.map((act: any) => act.how), ['switch_on', 'switch_on', 'switch_on']);
add('and says so', sam.engine.words.map((it: any) => it.line), ['Ada, the emitters are on again.']);
// ENG-06: told to switch them on again while still lighting it, it carries on lighting.
sam = engineer();
said(sam, 'Ada Volt', lightLine('Sam Rees'));
work(sam, 'light_engine', () => true, 8);
said(sam, 'Ada Volt', relightLine('Sam Rees'));
ENGINEER.syncTasks(sam);
add('a relight order while the engine is still being lit is not taken', [sam.engine.lit, !!open(sam, 'emitters_on')], [false, false]);
{
  const forced = { kind: 'emitters_on', urgency: 'asked', state: 'open', source: 'asked', id: 999 };
  add('nor, with one forced in, does it switch an emitter on', ENGINEER.plan(sam, forced as any)?.act ?? null, null);
}
// Someone else's order is not its order.
sam = engineer();
ENGINEER.overhears(sam, { details: { message: lightLine('Sam Rees'), speaker: 'Jan Itor' } } as any);
sam.peopleInView = [ADA, { name: 'Jan Itor', job: 'Janitor', handle: 'p2', distance: 1 }];
ENGINEER.overhears(sam, { details: { message: shutLine('Sam Rees'), speaker: 'Jan Itor' } } as any);
said(sam, 'Ada Volt', lightLine('Vik Hale'));
ENGINEER.syncTasks(sam);
add('an order from someone else, or to someone else, is not taken', [sam.engine.told, sam.engine.shutting], [false, false]);

// The Chief Engineer.
const SAM = { name: 'Sam Rees', job: 'Station Engineer', handle: 'p1', distance: 1 };
function chief(inView = true): any {
  const ada = makeBrain('Ada Volt', 'Chief Engineer');
  ada.machines = machines();
  ada.office = "Chief Engineer's Office";
  ada.location = 'Engineering';
  ada.staffPost = 'Engineering';
  ada.peopleInView = inView ? [SAM] : [];
  ada.pdaPeople = [{ name: 'Sam Rees', job: 'Station Engineer' }, { name: 'Cap Tain', job: 'Captain' }];
  ada.nextMeetingAt = 1e9;
  return ada;
}
const heardBy = (who: any, speaker: string, message: string) => CHIEF_ENGINEER.overhears(who, { details: { message, speaker, said_to: 'me' } } as any);
const openOf = (who: any, kind: string, item?: string) => who.tasks.find((task: any) => task.kind === kind && task.state !== 'done' && task.item === item);

let ada = chief();
heardBy(ada, 'Sam Rees', ENGINE_TAKEN);
add('"The engine, right away.": its engineer has the engine', ada.chief.lightTaken, true);
ada.now = 2000;
heardBy(ada, 'Sam Rees', litLine('Ada Volt'));
add('told the engine is lit, it knows', ada.chief.litAt, 2000);
add('and answers, by name, that it has that', ada.toTell.map((tell: any) => [tell.to, tell.line, tell.exact, tell.whileBusy]), [['Sam Rees', 'Sam, I have that.', true, true]]);

// The batteries.
ada.metOnce = true;
CHIEF_ENGINEER.syncTasks(ada);
let battery = openOf(ada, 'charge_batteries');
add('after the first meeting it has the batteries to set', !!battery, true);
const charged: string[] = [];
for (let turn = 0; turn < 6; turn++) {
  CHIEF_ENGINEER.syncTasks(ada);
  battery = openOf(ada, 'charge_batteries');
  const plan = battery ? CHIEF_ENGINEER.plan(ada, battery) : null;
  if (!plan?.act) break;
  charged.push(`${plan.act.tool} ${plan.act.how}`);
  CHIEF_ENGINEER.afterActing(ada, plan.act, battery, true);
}
CHIEF_ENGINEER.syncTasks(ada);
add('it sets each of the three, itself', charged, ['work_machine charge', 'work_machine charge', 'work_machine charge']);
add('and then has none left to set', !!openOf(ada, 'charge_batteries'), false);

// The engine goes wrong.
ada.toTell = [];
ada.engineReading = { integrity: 99, energy: 400 };
CHIEF_ENGINEER.syncTasks(ada);
add('a sound engine is left alone', ada.chief.order, null);
ada.engineReading = { integrity: 91.4, energy: 900 };
CHIEF_ENGINEER.syncTasks(ada);
let give = openOf(ada, 'engine_order', 'shut');
add('integrity under 95: emitters off, as an emergency', give?.urgency, 'emergency');
add('the Captain is told by PDA', ada.toTell.map((tell: any) => [tell.to, tell.byPda, /losing integrity: 91 percent/.test(tell.line)]), [['Cap Tain', true, true]]);
step = CHIEF_ENGINEER.plan(ada, give);
add('its engineer is there: it is said to their face, word for word', [step.say, step.exact], ['Sam, the engine is losing integrity. Emitters off, now.', true]);
CHIEF_ENGINEER.afterSaying(ada, step.say);
CHIEF_ENGINEER.syncTasks(ada);
add('said, the order is given', [ada.chief.order, !!openOf(ada, 'engine_order', 'shut')], [null, false]);
ada.now += 1000;
CHIEF_ENGINEER.syncTasks(ada);
add('nothing heard of it in a minute and a half: it is given again', ada.chief.order?.what, 'shut');
{
  // The engineer says they will not go off: the Captain is told once, and the order comes round only now and then.
  const copy = structuredClone(ada);
  copy.toTell = [];
  heardBy(copy, 'Sam Rees', notOffLine('Ada Volt', 'its controls are locked'));
  CHIEF_ENGINEER.syncTasks(copy);
  add('told the emitters will not go off, the Captain is told why', copy.toTell.filter((tell: any) => tell.to === 'Cap Tain').map((tell: any) => tell.line), ['The emitters will not go off: its controls are locked. The engine is still firing.']);
  copy.chief.shutGivenAt = copy.now;
  copy.now += 1000;
  CHIEF_ENGINEER.syncTasks(copy);
  add('and the order is not given again a minute and a half on', copy.chief.order, null);
  copy.now += 2500;
  CHIEF_ENGINEER.syncTasks(copy);
  add('but it is, five minutes on', copy.chief.order?.what, 'shut');
  copy.toTell = [];
  heardBy(copy, 'Sam Rees', notOffLine('Ada Volt', 'its controls are locked'));
  add('told again, the Captain is not told twice', copy.toTell.filter((tell: any) => tell.to === 'Cap Tain').length, 0);
}
// ENG-01 (answer B): told its engineer cannot get the emitters off, the Chief Engineer goes to the
// engine room and tries them itself, and tells the Captain how it went.
for (const locked of [false, true]) {
  const copy = structuredClone(ada);
  copy.toTell = [];
  heardBy(copy, 'Sam Rees', notOffLine('Ada Volt', 'its controls are locked'));
  CHIEF_ENGINEER.syncTasks(copy);
  const self = () => openOf(copy, 'chief_emitters_off');
  const label = locked ? 'one locked' : 'none locked';
  add(`${label}: told they will not go off, it takes the emitters itself, as an emergency`, self()?.urgency, 'emergency');
  const tried: string[] = [];
  for (let turn = 0; turn < 10 && self(); turn++) {
    const plan = CHIEF_ENGINEER.plan(copy, self());
    if (!plan?.act) break;
    tried.push(`${plan.act.machine} ${plan.act.how}`);
    const fails = locked && tried[0].startsWith(`${plan.act.machine} `);
    CHIEF_ENGINEER.afterActing(copy, plan.act, self(), !fails, false, fails ? { reason: 'machine' } : {}, fails ? 'The emitter will not switch off: its controls are locked.' : 'You switch the emitter off.');
    CHIEF_ENGINEER.syncTasks(copy);
  }
  add(`${label}: it works each emitter off${locked ? ', the locked one twice' : ''}`, tried.length, locked ? 4 : 3);
  add(`${label}: every switch it tries is a switch-off`, tried.length > 0 && tried.every((it) => it.endsWith('switch_off')), true);
  add(`${label}: it does not go again`, !!self(), false);
  const toCaptain = copy.toTell.filter((tell: any) => tell.to === 'Cap Tain').map((tell: any) => tell.line);
  if (locked) {
    add('one locked: the Captain is told it could not either, and why', toCaptain.filter((line: string) => line === 'I went to switch the emitters off myself and could not: its controls are locked. The engine is still firing.').length, 1);
    add('one locked: the emitters are not taken as off', copy.chief.emittersOff, false);
  } else {
    add('none locked: the Captain is told it switched them off itself', toCaptain.filter((line: string) => /^I have switched the emitters off myself\./.test(line)).length, 1);
    add('none locked: the emitters are taken as off, and no order is left to give', [copy.chief.emittersOff, copy.chief.order], [true, null]);
    copy.now += 9000;
    CHIEF_ENGINEER.syncTasks(copy);
    add('none locked: and none is given a long while on either', copy.chief.order, null);
  }
}
{
  // Its engineer says they are off while it is on its way: it stops.
  const copy = structuredClone(ada);
  heardBy(copy, 'Sam Rees', notOffLine('Ada Volt', 'I cannot reach the emitter to switch it off'));
  CHIEF_ENGINEER.syncTasks(copy);
  add('on its way to the emitters itself: it has the task', !!openOf(copy, 'chief_emitters_off'), true);
  heardBy(copy, 'Sam Rees', offLine('Ada Volt'));
  CHIEF_ENGINEER.syncTasks(copy);
  add('its engineer then says they are off: it does not go on', !!openOf(copy, 'chief_emitters_off'), false);
}
heardBy(ada, 'Sam Rees', offLine('Ada Volt'));
CHIEF_ENGINEER.syncTasks(ada);
add('told the emitters are off, it stops asking', [ada.chief.emittersOff, ada.chief.order], [true, null]);
ada.engineReading = { integrity: 96, energy: 0 };
ada.now += 9000;
CHIEF_ENGINEER.syncTasks(ada);
add('an engine it shut off is not lit again by itself', ada.chief.order, null);
CHIEF_ENGINEER.readsMessage(ada, 'Cap Tain', 'Chief, light the engine again when you are ready.', 0, 'Captain');
add('the Captain says light the engine: it gives its engineer the engine again', [ada.chief.shut, ada.chief.order?.what], [false, 'light']);

// ENG-06: the engineer's set words are taken only as its set lines, not from its chat.
for (const [line, want] of [
  ["I'll tell you when the engine is lit.", null],
  ["Ada, I'll let you know once the engine is lit.", null],
  ['Ada, the engine is lit. All done in there.', 'lit'],
] as [string, string | null][]) {
  const it = chief();
  heardBy(it, 'Sam Rees', line);
  add(`overheard "${line}": ${want ? 'the engine is lit' : 'not taken'}`, it.chief.litAt !== null, want === 'lit');
}
{
  const it = chief();
  heardBy(it, 'Sam Rees', "The engine, right away. I'll tell you when the engine is lit.");
  add('"The engine, right away." with a remark after it: taken, and not as lit', [it.chief.lightTaken, it.chief.litAt], [true, null]);
  it.engineReading = { integrity: 90, energy: 500 };
  CHIEF_ENGINEER.syncTasks(it);
  it.toTell = [];
  heardBy(it, 'Sam Rees', 'The emitters are off until the cooling is running.');
  add('in a shut-off, "The emitters are off until ..." is not taken, and the Captain is told nothing', [it.chief.emittersOff, it.toTell.filter((tell: any) => tell.to === 'Cap Tain').length], [false, 0]);
  CHIEF_ENGINEER.readsMessage(it, 'Sam Rees', offLine('Ada Volt'), 0, 'Station Engineer');
  add('the set line by PDA is still taken', it.chief.emittersOff, true);
}

// ENG-08: shut off, then lit again by someone else.
const shutOff = () => {
  const it = chief();
  it.engineReading = { integrity: 90, energy: 500 };
  CHIEF_ENGINEER.syncTasks(it);
  CHIEF_ENGINEER.afterSaying(it, shutLine('Sam Rees'));
  heardBy(it, 'Sam Rees', offLine('Ada Volt'));
  it.toTell = [];
  return it;
};
ada = shutOff();
for (const energy of [500, 400, 300]) {
  ada.engineReading = { integrity: 90, energy };
  ada.now += 100;
  CHIEF_ENGINEER.syncTasks(ada);
}
add('shut off, the energy dying away is not taken for the engine lit again', [ada.chief.shut, ada.chief.order, ada.toTell.length], [true, null, 0]);
ada = shutOff();
for (const energy of [300, 400, 500]) {
  ada.engineReading = { integrity: 90, energy };
  ada.now += 100;
  CHIEF_ENGINEER.syncTasks(ada);
}
add('shut off, energy rising: it is lit again, the Captain is told once and the emitters are ordered off again', [ada.chief.shut, ada.chief.order?.what, ada.toTell.filter((tell: any) => tell.line === 'The engine has been lit again.').length, ada.toTell.filter((tell: any) => /losing integrity/.test(tell.line)).length], [true, 'shut', 1, 1]);
ada = shutOff();
heardBy(ada, 'Sam Rees', litLine('Ada Volt'));
add('shut off, then told the engine is lit: it is watched again', [ada.chief.shut, ada.chief.litAt !== null], [false, true]);

// Its engineer is somewhere else.
ada = chief(false);
ada.engineReading = { integrity: 80, energy: 900 };
CHIEF_ENGINEER.syncTasks(ada);
give = openOf(ada, 'engine_order', 'shut');
step = CHIEF_ENGINEER.plan(ada, give);
add('its engineer is out of sight: emitters off goes by PDA', [step.act?.tool, step.act?.person, step.act?.text], ['message', 'Sam Rees', 'Sam, the engine is losing integrity. Emitters off, now.']);
CHIEF_ENGINEER.afterActing(ada, step.act, give, false);
step = CHIEF_ENGINEER.plan(ada, give);
add('the PDA will not send: it goes to find them', [step.act?.tool, ada.chief.order?.what], [undefined, 'shut']);
ada.location = "Chief Engineer's Office";
step = CHIEF_ENGINEER.plan(ada, give);
add('from its office, that is a walk to where its staff work', [step.act?.tool, step.act?.place], ['go_to', 'Engineering']);
// ENG-09: at Engineering, its engineer nowhere to be seen.
ada.location = 'Engineering';
ada.toTell = [];
step = CHIEF_ENGINEER.plan(ada, give);
add('at its staff post with its engineer not there, it waits and looks', [step.ready, step.wait], [false, true]);
ada.now += 301;
step = CHIEF_ENGINEER.plan(ada, give);
add('thirty seconds on, it tries the PDA again', [step.act?.tool, step.act?.person], ['message', 'Sam Rees']);
CHIEF_ENGINEER.afterActing(ada, step.act, give, false);
step = CHIEF_ENGINEER.plan(ada, give);
add('that fails too: it looks on, but holds nothing else up', [step.ready, !!step.wait], [false, false]);
ada.now += 301;
step = CHIEF_ENGINEER.plan(ada, give);
add('the second time round the Captain is told it cannot reach its engineer', [step.act?.tool, ada.toTell.filter((tell: any) => tell.to === 'Cap Tain').map((tell: any) => tell.line)], ['message', ['I cannot reach Sam to switch the emitters off. The engine is still firing.']]);
CHIEF_ENGINEER.afterActing(ada, step.act, give, false);
ada.now += 301;
CHIEF_ENGINEER.plan(ada, give);
add('and only once', ada.toTell.filter((tell: any) => tell.to === 'Cap Tain').length, 1);

// The emitters have stopped.
ada = chief(false);
ada.now = 5000;
CHIEF_ENGINEER.readsMessage(ada, 'Sam Rees', litLine('Ada Volt'), 0, 'Station Engineer');
add('word that the engine is lit, by PDA, is taken too, with nothing said back', [ada.chief.litAt, ada.toTell.length], [5000, 0]);
ada.engineReading = { integrity: 100, energy: 0 };
ada.now = 5600;
CHIEF_ENGINEER.syncTasks(ada);
add('no energy a minute after it was lit is not the emitters stopping', ada.chief.order, null);
ada.now = 6400;
CHIEF_ENGINEER.syncTasks(ada);
add('no energy two minutes after: the emitters have stopped', ada.chief.order?.what, 'relight');
step = CHIEF_ENGINEER.plan(ada, openOf(ada, 'engine_order', 'relight'));
add('and its engineer is sent to switch them on again', step.act?.text, 'Sam, the emitters have stopped. Switch them on again, please.');

// What stopped the engineer.
ada = chief();
heardBy(ada, 'Sam Rees', stuckLine('Ada Volt', 'the nitrogen canister will not connect'));
add('told a step would not take, it knows which', ada.chief.stuck, 'the nitrogen canister will not connect');
add('and the Captain is told', ada.toTell.some((tell: any) => tell.to === 'Cap Tain' && tell.byPda && /not lit: the nitrogen canister will not connect/.test(tell.line)), true);
// With no reading it knows nothing of the engine.
ada = chief();
ada.engineReading = null;
CHIEF_ENGINEER.syncTasks(ada);
add('with no reading on its PDA it orders nothing', ada.chief.order, null);
add('and is told that it has none', CHIEF_ENGINEER.cues(ada).some((line: string) => /no reading of the engine/.test(line)), true);

// ENG-11: the crystal comes apart with no engineer aboard.
ada = chief(false);
ada.pdaPeople = [{ name: 'Atmos Tec', job: 'Atmospheric Technician' }, { name: 'Cap Tain', job: 'Captain' }];
ada.engineReading = { integrity: 90, energy: 900 };
CHIEF_ENGINEER.syncTasks(ada);
add('no engineer aboard: the Captain is told there is nobody to switch the emitters off', ada.toTell.filter((tell: any) => tell.to === 'Cap Tain').map((tell: any) => tell.line), ['The engine is losing integrity: 90 percent. I have no engineer to switch the emitters off.']);
add('and it does not say the engine has been shut off', CHIEF_ENGINEER.cues(ada).some((line: string) => /has been shut off/.test(line)), false);
add('and no shut order is kept open to hold its staff meetings back', ada.chief.order, null);
ada.pdaPeople.push({ name: 'Sam Rees', job: 'Station Engineer' });
CHIEF_ENGINEER.syncTasks(ada);
give = openOf(ada, 'engine_order', 'shut');
step = give && CHIEF_ENGINEER.plan(ada, give);
add('an engineer turns up: the order goes to them by PDA', [step?.act?.tool, step?.act?.text], ['message', 'Sam, the engine is losing integrity. Emitters off, now.']);
add('and what it says is that the order is given and not yet heard of', CHIEF_ENGINEER.cues(ada).some((line: string) => /have ordered the emitters off, and have not heard/.test(line)), true);

// ENG-05: which lines are an order to light the engine again.
for (const [line, want] of [
  ['Light the engine.', true],
  ['Relight the engine please.', true],
  ['light the engine again', true],
  ['Ada light the engine', true],
  ['Chief, light the engine again when you are ready.', true],
  ["Don't wait, light the engine now.", true],
  ['Restart the engine.', true],
  ['Light it again.', true],
  ['Do not light the engine again until I say so.', false],
  ['Why did you not light the engine?', false],
  ['Did Sam light the engine', false],
  ['Can engineering light the engine safely now?', false],
] as [string, boolean][]) {
  add(`"${line}" is ${want ? '' : 'not '}an order to light the engine again`, isLightAgainOrder(line, 'Ada Volt'), want);
}

// ENG-03: the orders go to the engineer that has the engine, not to the first one on the PDA.
{
  const ada = chief(false);
  ada.pdaPeople = [{ name: 'Jo Player', job: 'Station Engineer' }, { name: 'Sam Rees', job: 'Station Engineer' }, { name: 'Cap Tain', job: 'Captain' }];
  CHIEF_ENGINEER.readsMessage(ada, 'Sam Rees', litLine('Ada Volt'), 100, 'Station Engineer');
  ada.now = 200;
  ada.engineReading = { integrity: 90, energy: 900 };
  CHIEF_ENGINEER.syncTasks(ada);
  const give = openOf(ada, 'engine_order', 'shut');
  const step = give && CHIEF_ENGINEER.plan(ada, give);
  add('two engineers on the PDA: emitters off goes to the one that lit it', step?.act?.person, 'Sam Rees');
}
{
  // The first on the PDA never answers: after two orders unanswered, the next engineer is given them.
  const ada = chief(false);
  ada.pdaPeople = [{ name: 'Jo Player', job: 'Station Engineer' }, { name: 'Sam Rees', job: 'Station Engineer' }, { name: 'Cap Tain', job: 'Captain' }];
  ada.engineReading = { integrity: 90, energy: 900 };
  const sentTo: string[] = [];
  for (let n = 0; n < 3; n++) {
    ada.now = 100 + n * 2000;
    CHIEF_ENGINEER.syncTasks(ada);
    const give = openOf(ada, 'engine_order', 'shut');
    const step = give && CHIEF_ENGINEER.plan(ada, give);
    if (!step?.act) break;
    sentTo.push(step.act.person);
    CHIEF_ENGINEER.afterActing(ada, step.act, give, true);
  }
  add('an engineer that leaves two orders unanswered is passed over', sentTo, ['Jo Player', 'Jo Player', 'Sam Rees']);
  add('and the Captain is told', ada.toTell.some((tell: any) => tell.line === 'I cannot reach Jo: I am giving the engine to Sam instead.'), true);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
