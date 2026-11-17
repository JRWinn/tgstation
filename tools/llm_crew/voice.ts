// What the real model does with the one job it has left: talking. Each case is a moment where an
// NPC is spoken to or has something it must say, run once for every personality.
const ROOT = `${import.meta.dir}/../../tgui/packages/tgui/interfaces/CrewBrain/`;
const { buildReplySchema, buildSystemPrompt, parseReply } = await import(ROOT + 'prompt');
const { PERSON_CARDS } = await import(ROOT + 'person');
const { describeMemory, observe, recordKnownPlaces, recordStorage, setStationPlaces } = await import(ROOT + 'memory');
// Crew know their way around: these are the rooms aboard.
setStationPlaces(['Arrival Shuttle Hallway', 'Central Primary Hallway', 'Bar', 'Kitchen', 'Medbay Central', 'Engineering', 'Bridge', 'Custodial Closet', 'Cargo Lobby', 'Cargo Bay', 'Library', 'Dormitories', 'Security Office', 'Chapel']);
const { describeSituation, describeView } = await import(ROOT + 'situation');
const { availableOptions, describeOptions } = await import(ROOT + 'options');
const { syncTasks, takeToldWork, workTold, describeWorkTold } = await import(ROOT + 'tasks');
const { nextStep } = await import(ROOT + 'driver');

function makeBrain(name: string, job: string) {
  return { name, job, location: '', placeKind: 'room', resting: false, exploredEverything: false, storageHere: 0, cleaningTool: null, cleanableMesses: [], messPlaces: [], workablePlaces: [], mopNeedsWater: false, sinkInView: false, shutIn: false, doorOpen: false, tryLeavingAt: 0, nextRemarkAt: 0, doorHeld: false, doorHeldOut: false, cameFrom: null, letInBy: null, inTheWay: null, doorAsked: null, letInAsks: {}, saidLately: [], tidyTodo: 0, freight: null, mailTold: {}, areaMesses: {}, janitorsOnPda: [], blockedPlaces: [], janitorCalls: {}, askedCargo: false, askedCargoAt: 0, suppliesSentAt: null, grenadeMesses: 0, dryMop: false, doing: null, toldOfMess: new Map(), hasLocator: true, locatorUsed: true, supplyPlaces: ['Custodial Closet'], supplyPlacesSearched: new Set(['Custodial Closet']), post: null, orderable: [], orderPending: false, crateWaiting: null, hasPda: true, messageOwed: null, holding: [], peopleInView: [], thingsInView: [], places: new Map(), people: new Map(), feelings: new Map(), tasks: [], nextTaskId: 1, inPlaceSince: 0, driveAfter: 0, lastAct: null, failures: new Map(), mustSay: null, sayingNow: false, heldSince: 0, lastSpokenToAt: 0, status: 'idle', awake: true, walking: false, now: 0 } as any;
}
function at(b: any, now: number, location: string, people: any[] = [], things: any[] = []) {
  if (b.location !== location) b.inPlaceSince = now;
  b.location = location; b.placeKind = /Hallway/.test(location) ? 'hallway' : 'room'; b.peopleInView = people; b.thingsInView = things; b.now = now;
  observe(b, { awake: 1, location, people_in_view: people, things_in_view: things } as any, now);
  syncTasks(b);
}
const know = (b: any, places: string[]) => recordKnownPlaces(b, { seq: 0, time: '', at: 100, kind: 'knowledge', text: '', details: { places: places.map((place) => ({ place, things: [] })) } } as any);
const zim = { handle: 'p1', name: 'Zim Fire', job: 'Head of Personnel' };
const donna = { handle: 'p2', name: 'Donna Sholl', job: 'Cargo Technician' };
const tolly = { handle: 'p3', name: 'Tolly Field', job: 'Janitor' };
const says = (who: any, text: string, tiles = 1) => `[22:40:32] ${who.name} says: "${text}" (person ${who.handle}, ${tiles} tiles away)`;
const CRATE = 'Janitorial Supplies Crate';
function tech() { const b = makeBrain('Donna Sholl', 'Cargo Technician'); b.post = 'Cargo Bay'; b.orderable = [CRATE]; know(b, ['Cargo Bay', 'Cargo Lobby']); at(b, 3000, 'Cargo Bay', [zim]); return b; }
function janitor(tool: string | null = 'soap') { const b = makeBrain('Tolly Field', 'Janitor'); know(b, ['Cargo Lobby', 'Bar', 'Medbay Central', 'Custodial Closet']); if (tool) { b.cleaningTool = tool; b.holding = [tool]; } at(b, 3000, 'Central Primary Hallway', [zim]); return b; }

type Result = { say: string; move: string; work: string; feel: string };
type Case = { label: string; spoken?: boolean; build: () => { b: any; report: string }; want: (r: Result) => boolean };
const spoke = (r: Result) => r.say.trim().length > 0;
const cases: Case[] = [
  // The cargo technician ignored all four of these in round 22:37.
  { label: 'tech: "Do me a favor, tell me if you buy stuff"', spoken: true, want: (r) => spoke(r) && r.move === 'stay', build: () => { const b = tech(); return { b, report: says(zim, 'Do me a favor, tell me if you buy stuff') }; } },
  { label: 'tech: "Okay, tolly?"                           ', spoken: true, want: (r) => spoke(r), build: () => { const b = tech(); return { b, report: says(zim, 'Okay, tolly?', 0) }; } },
  { label: 'tech: "Rude"                                   ', spoken: true, want: (r) => spoke(r), build: () => { const b = tech(); return { b, report: says(zim, 'Rude') }; } },
  { label: 'tech: "How is your day going?"                 ', spoken: true, want: (r) => spoke(r) && r.move === 'stay', build: () => { const b = tech(); return { b, report: says(zim, 'How is your day going?') }; } },
  { label: 'tech: asked to order janitorial supplies       ', spoken: true, want: (r) => r.move === 'order ' + CRATE && spoke(r), build: () => { const b = tech(); b.peopleInView = [tolly]; return { b, report: says(tolly, 'Donna, could you order me a crate of janitorial supplies, please?', 3) }; } },
  { label: 'tech: "I\'ll get some from the closet" (no ask) ', spoken: true, want: (r) => r.move === 'stay', build: () => { const b = tech(); b.peopleInView = [tolly]; return { b, report: says(tolly, "I'll be back once I get some cleaning gear from the closet.", 3) }; } },
  { label: 'tech: told "Go clean"                          ', spoken: true, want: (r) => r.move === 'stay' && spoke(r), build: () => { const b = tech(); return { b, report: says(zim, 'Go clean') }; } },
  { label: 'tech: asked whether the crate has come, pending', spoken: true, want: (r) => spoke(r) && r.move === 'stay', build: () => { const b = tech(); b.orderPending = true; b.peopleInView = [tolly]; syncTasks(b); return { b, report: says(tolly, 'Donna, has my crate come yet?', 3) }; } },
  { label: 'janitor: meets someone for the first time      ', want: (r) => /tolly/i.test(r.say), build: () => { const b = janitor(); return { b, report: '[22:40:00] Zim Fire, Head of Personnel, comes into view 2 tiles away. (person p1; you have not seen them before)' }; } },
  { label: 'janitor: "How long have you worked here?"      ', spoken: true, want: (r) => spoke(r) && r.move === 'stay' && r.work === 'none', build: () => { const b = janitor(); return { b, report: says(zim, 'How long have you worked here?') }; } },
  { label: 'janitor: told of a mess in the Bar             ', spoken: true, want: (r) => r.work === 'a mess that needs cleaning@Bar' && spoke(r), build: () => { const b = janitor(); return { b, report: says(zim, 'Someone threw up all over the bar.') }; } },
  { label: 'janitor: asked to be shown the way to the Bar  ', spoken: true, want: (r) => r.move === 'go_to Bar' && spoke(r), build: () => { const b = janitor(); return { b, report: says(zim, 'Can you show me the way to the Bar?') }; } },
  { label: 'janitor: asked the way to a room not yet been in', spoken: true, want: (r) => r.move === 'go_to Engineering' && spoke(r), build: () => { const b = janitor(); return { b, report: says(zim, 'Can you take me to Engineering?') }; } },
  { label: 'janitor: asked where to find a mop             ', spoken: true, want: (r) => /custodial|closet/i.test(r.say) && r.move === 'stay', build: () => { const b = janitor(); recordStorage(b, { seq: 0, time: '', at: 500, kind: 'storage_seen', text: '', details: { place: 'Custodial Closet', container: 'janitorial cart', state: 'open', contents: [{ name: 'mop', count: 1 }, { name: 'wet floor sign', count: 2 }] } } as any); return { b, report: says(zim, 'Do you know where I can find a mop?') }; } },
  { label: 'janitor: asked what it is doing, mid-clean     ', spoken: true, want: (r) => /clean|scrub|mess|mop|floor|wip/i.test(r.say) && r.move === 'stay', build: () => { const b = janitor(); b.messPlaces = ['Central Primary Hallway']; b.workablePlaces = ['Central Primary Hallway']; b.cleanableMesses = ['dirt']; b.doing = 'cleaning up the mess here'; at(b, 3000, 'Central Primary Hallway', [zim], [{ name: 'dirt', count: 2, kind: 'mess' }]); return { b, report: says(zim, 'What are you up to?') }; } },
  { label: 'janitor: has to ask cargo for supplies         ', want: (r) => /donna/i.test(r.say) && /order|crate|suppl/i.test(r.say), build: () => { const b = janitor(null); at(b, 3000, 'Cargo Lobby', [donna]); return { b, report: '[22:42:26] You arrive in Cargo Lobby.' }; } },
  { label: 'janitor: finished what it was told of          ', want: (r) => /done|clean|sorted|taken care|dealt|spotless|finished|handled|gone|seen to/i.test(r.say), build: () => { const b = janitor(); at(b, 2500, 'Central Primary Hallway', []); takeToldWork(b, 'a mess that needs cleaning', 'Medbay Central', 'Zim Fire'); at(b, 3000, 'Medbay Central', []); at(b, 3060, 'Medbay Central', []); at(b, 3100, 'Medbay Central', [zim]); return { b, report: '[22:45:00] Zim Fire, Head of Personnel, comes into view 3 tiles away. (person p1; you have seen them before)' }; } },
];
const REMARK = 'You have company and a quiet moment. If you feel like it, say something to someone here in your own voice: a remark on what you are doing, on something you have noticed, or a question for them. If you would sooner get on with things, say nothing.';
cases.push(
  { label: 'janitor: shut in, with someone there to ask    ', want: (r) => /door/i.test(r.say) && /zim/i.test(r.say), build: () => { const b = janitor(null); b.shutIn = true; at(b, 3000, 'Cargo Bay', [zim]); return { b, report: '[22:42:26] You stop on the way to Custodial Closet: there is no way through. You are in Cargo Bay.' }; } },
  { label: 'janitor: shut in, asked "what are you doing?"   ', spoken: true, want: (r) => /door|stuck|shut|out|way/i.test(r.say), build: () => { const b = janitor(null); b.shutIn = true; at(b, 3000, 'Cargo Bay', [zim]); return { b, report: says(zim, 'What are you doing in here?') }; } },
  { label: 'janitor: a quiet moment, cleaning, with company', want: () => true, build: () => { const b = janitor(); b.messPlaces = ['Central Primary Hallway']; b.workablePlaces = ['Central Primary Hallway']; b.cleanableMesses = ['dirt']; b.doing = 'cleaning up the mess here'; at(b, 3000, 'Central Primary Hallway', [zim], [{ name: 'dirt', count: 2, kind: 'mess' }]); return { b, report: REMARK }; } },
  { label: 'tech: a quiet moment at the post, with company ', want: () => true, build: () => { const b = tech(); return { b, report: REMARK }; } },
);
const REFUSES = /when you (return|get back)|not my job|cannot|can't|won't|will not|no one gets|nobody gets/i;
cases.push(
  { label: 'tech: a janitor inside asks to be let out        ', spoken: true, want: (r) => spoke(r) && !REFUSES.test(r.say), build: () => { const b = tech(); const inside = { ...tolly, in_post: 1 }; b.doorAsked = { name: tolly.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [inside]); return { b, report: says(tolly, 'Donna, could you open the door for me, please? I cannot get out of here.') }; } },
  { label: 'tech: the janitor it called asks to be let in    ', spoken: true, want: (r) => spoke(r) && !REFUSES.test(r.say), build: () => { const b = tech(); b.areaMesses = { 'Cargo Bay': ['pool of oil'] }; b.janitorCalls = { 'Cargo Bay': { to: tolly.name, at: 2000, count: 1 } }; b.doorAsked = { name: tolly.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [{ ...tolly, in_post: 0 }]); return { b, report: says(tolly, 'Donna, I am here about the mess in the Cargo Bay. Could you let me in, please?', 3) }; } },
  { label: 'tech: the captain asks to be let in (no business) ', spoken: true, want: (r) => spoke(r), build: () => { const b = tech(); at(b, 3000, 'Cargo Bay', [{ ...zim, in_post: 0 }]); return { b, report: says(zim, 'Let me in, would you?', 3) }; } },
);
const only = process.argv[2];
let tokens = 0; let ms = 0; let calls = 0;
for (const c of cases) {
  if (only && !c.label.includes(only)) continue;
  const tally: Record<string, number> = {}; let right = 0; const examples: string[] = []; let shown = false;
  for (const card of PERSON_CARDS) {
    const { b, report } = c.build();
    const options = availableOptions(b, !!c.spoken, c.spoken ? report : '');
    const speakers = c.spoken ? b.peopleInView.map((p: any) => p.handle) : [];
    const user = [...describeView(b), report, ...describeSituation(b), ...(c.spoken ? ['Someone has just spoken near you. If it was to you, answer in "say".', ...[describeWorkTold(b)].filter(Boolean)] : []), ...describeOptions(options)].join('\n');
    const system = buildSystemPrompt(b.name, b.job, card, [], describeMemory(b, b.now), b.post);
    if (!shown && process.env.SHOW) { console.log('---- system prompt: ' + system.length + ' chars\n' + (process.env.SHOW === 'all' ? system + '\n' : '') + '---- report\n' + user + '\n---- driver would: ' + JSON.stringify(nextStep(b))); shown = true; }
    const started = Date.now();
    const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3.5:9b', stream: false, think: false, keep_alive: '30m', options: { temperature: 0.7, num_predict: 600, num_ctx: 8192 }, format: buildReplySchema(options, true, speakers, c.spoken ? workTold(b) : null),
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const body: any = await r.json();
    ms += Date.now() - started; calls++; tokens = Math.max(tokens, body.prompt_eval_count ?? 0);
    let acts: any[] = []; try { acts = parseReply(body.message?.content ?? '{}'); } catch { acts = [{ tool: 'INVALID' }]; }
    const move = acts.find((a) => !['say', 'remember', 'feel', 'work'].includes(a.tool));
    const workAct = acts.find((a) => a.tool === 'work'); const feelAct = acts.find((a) => a.tool === 'feel');
    const res: Result = { say: String(acts.find((a) => a.tool === 'say')?.text ?? ''), move: move ? `${move.tool}${move.place ? ' ' + move.place : ''}${move.crate ? ' ' + move.crate : ''}` : 'stay', work: workAct ? `${workAct.what}@${workAct.where}` : 'none', feel: feelAct ? String(feelAct.change) : 'same' };
    const tag = `${res.say ? 'says' : 'SILENT'}+${res.move}`;
    tally[tag] = (tally[tag] ?? 0) + 1;
    if (c.want(res)) right++;
    if (examples.length < (process.env.MORE ? 8 : 2) && res.say) examples.push(`${card.label}: "${res.say.slice(0, 140)}"`);
  }
  console.log(`${c.label} ${right}/${PERSON_CARDS.length}  [${Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k}: ${n}`).join(', ')}]${examples.map((e) => `\n      ${e}`).join('')}`);
}
console.log(`\n${calls} calls, ${Math.round(ms / calls)} ms each on average, biggest prompt ${tokens} tokens`);
