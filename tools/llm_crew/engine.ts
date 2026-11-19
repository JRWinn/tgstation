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
const { ENGINE_TAKEN, ENGINE_TAKEN_WORDS, HEARD_WORDS, heardLine, isChiefEngineer, isEngineer, LIGHT_WORDS, notOffLine, LIT_WORDS, lightLine, litLine, OFF_WORDS, offLine, ON_AGAIN_WORDS, onAgainLine, RELIGHT_WORDS, relightLine, SHUT_WORDS, shutLine, STUCK_WORDS, stuckLine } = await import(ROOT + 'jobs/engineering');

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
heardBy(ada, 'Sam Rees', offLine('Ada Volt'));
CHIEF_ENGINEER.syncTasks(ada);
add('told the emitters are off, it stops asking', [ada.chief.emittersOff, ada.chief.order], [true, null]);
ada.engineReading = { integrity: 96, energy: 0 };
ada.now += 9000;
CHIEF_ENGINEER.syncTasks(ada);
add('an engine it shut off is not lit again by itself', ada.chief.order, null);
CHIEF_ENGINEER.readsMessage(ada, 'Cap Tain', 'Chief, light the engine again when you are ready.', 0, 'Captain');
add('the Captain says light the engine: it gives its engineer the engine again', [ada.chief.shut, ada.chief.order?.what], [false, 'light']);

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

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
