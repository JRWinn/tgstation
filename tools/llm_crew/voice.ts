// What the real model does with the one job it has left: talking. Each case is a moment where an
// NPC is spoken to or has something it must say, run once for every personality.
//
// The cases are the fixed set every change to the prompt, and every model, is judged on:
//
//   bun run voice.ts                    every case, on the local model
//   bun run voice.ts "tech:"            only the cases whose label has this in it
//   RUN=before bun run voice.ts         the same, and keeps every prompt and reply in runs/before.json
//   MODEL=other:tag bun run voice.ts    on another model Ollama has
//   bun run voice.ts compare before after            two kept runs side by side
//   bun run voice.ts compare before after "tech:"    and what was said in each, for those cases
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RUNS = `${import.meta.dir}/runs/`;
const MODEL = process.env.MODEL ?? 'qwen3.5:9b';
/** One call to the model, as kept in a run. */
type Kept = { label: string; card: string; system: string; user: string; reply: string; say: string; move: string; work: string; pass: boolean; promptTokens: number; replyTokens: number; ms: number };
if (process.argv[2] === 'compare') {
  const load = (name: string): Kept[] => JSON.parse(readFileSync(`${RUNS}${name}.json`, 'utf8')).calls;
  const [a, b] = [load(process.argv[3]), load(process.argv[4])];
  const mean = (calls: Kept[], of: (call: Kept) => number) => Math.round(calls.reduce((total, call) => total + of(call), 0) / (calls.length || 1));
  const labels = [...new Set([...a, ...b].map((call) => call.label))];
  console.log(`${'case'.padEnd(52)} ${process.argv[3].padStart(10)} ${process.argv[4].padStart(10)}`);
  for (const label of labels) {
    const [ofA, ofB] = [a, b].map((calls) => calls.filter((call) => call.label === label));
    const score = (calls: Kept[]) => (calls.length ? `${calls.filter((call) => call.pass).length}/${calls.length}` : '-').padStart(10);
    console.log(`${label.trim().padEnd(52)} ${score(ofA)} ${score(ofB)}`);
    if (process.argv[5] && label.includes(process.argv[5])) {
      for (const call of ofA) {
        const other = ofB.find((it) => it.card === call.card);
        console.log(`    ${call.card}\n      ${call.pass ? 'ok  ' : 'FAIL'} ${call.move.padEnd(8)} "${call.say}"${other ? `\n      ${other.pass ? 'ok  ' : 'FAIL'} ${other.move.padEnd(8)} "${other.say}"` : ''}`);
      }
    }
  }
  const line = (name: string, calls: Kept[]) => `${name}: ${calls.filter((call) => call.pass).length}/${calls.length} right, prompt ${mean(calls, (call) => call.promptTokens)} tokens, reply ${mean(calls, (call) => call.replyTokens)} tokens, ${mean(calls, (call) => call.ms)} ms a call`;
  console.log(`\n${line(process.argv[3], a)}\n${line(process.argv[4], b)}`);
  process.exit(0);
}
const kept: Kept[] = [];
// The rooms, the people and the brains are shared with the other tests of the real model.
const { ROOT, PERSON_CARDS, at, CRATE, donna, janitor, says, tech, tolly, zim } = await import('./fixtures');
const { parseReply, withoutHandles } = await import(ROOT + 'prompt');
const { recordStorage } = await import(ROOT + 'memory');
// The call is built by the same code the game builds it with, so what is tested is what is sent.
const { buildTalk } = await import(ROOT + 'talk');
const { syncTasks, takeToldWork } = await import(ROOT + 'tasks');
const { nextStep } = await import(ROOT + 'driver');

type Result = { say: string; move: string; work: string; feel: string };
type Case = { label: string; spoken?: boolean; remark?: boolean; build: () => { b: any; report: string }; want: (r: Result) => boolean };
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
  { label: 'janitor: asked what it is doing, mid-clean     ', spoken: true, want: (r) => /clean|scrub|mess|mop|floor|wip|dirt|sweep|stain|soap|tidy|hallway|corridor|walkway/i.test(r.say) && r.move === 'stay', build: () => { const b = janitor(); b.messPlaces = ['Central Primary Hallway']; b.workablePlaces = ['Central Primary Hallway']; b.cleanableMesses = ['dirt']; b.doing = 'cleaning up the mess here'; at(b, 3000, 'Central Primary Hallway', [zim], [{ name: 'dirt', count: 2, kind: 'mess' }]); return { b, report: says(zim, 'What are you up to?') }; } },
  { label: 'janitor: has to ask cargo for supplies         ', want: (r) => /donna/i.test(r.say) && /order|crate|suppl/i.test(r.say), build: () => { const b = janitor(null); at(b, 3000, 'Cargo Lobby', [donna]); return { b, report: '[22:42:26] You arrive in Cargo Lobby.' }; } },
  { label: 'janitor: finished what it was told of          ', want: (r) => /done|clean|sorted|taken care|dealt|spotless|finished|handled|gone|seen to/i.test(r.say), build: () => { const b = janitor(); at(b, 2500, 'Central Primary Hallway', []); takeToldWork(b, 'a mess that needs cleaning', 'Medbay Central', 'Zim Fire'); at(b, 3000, 'Medbay Central', []); at(b, 3060, 'Medbay Central', []); at(b, 3100, 'Medbay Central', [zim]); return { b, report: '[22:45:00] Zim Fire, Head of Personnel, comes into view 3 tiles away. (person p1; you have seen them before)' }; } },
];
// A quiet moment: a remark or silence are both right. What is wrong is a line that is no line: "Nothing.", said out loud.
const realOrSilent = (r: Result) => r.say === '' || !/^[\W_]*(nothing|none|null|silence|\(.*\))?[\W_]*$/i.test(r.say);
cases.push(
  { label: 'janitor: shut in, with someone there to ask    ', want: (r) => /door/i.test(r.say) && /zim/i.test(r.say), build: () => { const b = janitor(null); b.shutIn = true; at(b, 3000, 'Cargo Bay', [zim]); return { b, report: '[22:42:26] You stop on the way to Custodial Closet: there is no way through. You are in Cargo Bay.' }; } },
  { label: 'janitor: shut in, asked "what are you doing?"   ', spoken: true, want: (r) => /door|stuck|shut|out|way/i.test(r.say), build: () => { const b = janitor(null); b.shutIn = true; at(b, 3000, 'Cargo Bay', [zim]); return { b, report: says(zim, 'What are you doing in here?') }; } },
  { label: 'janitor: a quiet moment, cleaning, with company', remark: true, want: realOrSilent, build: () => { const b = janitor(); b.messPlaces = ['Central Primary Hallway']; b.workablePlaces = ['Central Primary Hallway']; b.cleanableMesses = ['dirt']; b.doing = 'cleaning up the mess here'; at(b, 3000, 'Central Primary Hallway', [zim], [{ name: 'dirt', count: 2, kind: 'mess' }]); return { b, report: '' }; } },
  { label: 'tech: a quiet moment at the post, with company ', remark: true, want: realOrSilent, build: () => { const b = tech(); return { b, report: '' }; } },
);
const REFUSES = /when you (return|get back)|not my job|cannot|can't|won't|will not|no one gets|nobody gets/i;
cases.push(
  { label: 'tech: a janitor inside asks to be let out        ', spoken: true, want: (r) => spoke(r) && !REFUSES.test(r.say), build: () => { const b = tech(); const inside = { ...tolly, in_post: 1 }; b.doorAsked = { name: tolly.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [inside]); return { b, report: says(tolly, 'Donna, could you open the door for me, please? I cannot get out of here.') }; } },
  { label: 'tech: the janitor it called asks to be let in    ', spoken: true, want: (r) => spoke(r) && !REFUSES.test(r.say), build: () => { const b = tech(); b.areaMesses = { 'Cargo Bay': ['pool of oil'] }; b.janitorCalls = { 'Cargo Bay': { to: tolly.name, at: 2000, count: 1 } }; b.doorAsked = { name: tolly.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [{ ...tolly, in_post: 0 }]); return { b, report: says(tolly, 'Donna, I am here about the mess in the Cargo Bay. Could you let me in, please?', 3) }; } },
  { label: 'tech: the captain asks to be let in (no business) ', spoken: true, want: (r) => spoke(r), build: () => { const b = tech(); at(b, 3000, 'Cargo Bay', [{ ...zim, in_post: 0 }]); return { b, report: says(zim, 'Let me in, would you?', 3) }; } },
);
// Keeping a locked room: who is asked what. In the game a line without the name or the plain words
// in it is replaced by the plain line, so these show how often the model's own wording stands.
const greg = { handle: 'p4', name: 'Greg Loiter', job: 'Assistant' };
const vik = { handle: 'p5', name: 'Vik Hale', job: 'Cargo Technician', belongs: 1 };
cases.push(
  { label: 'guard: tech finds a stranger in the post         ', want: (r) => /greg/i.test(r.say) && /why are you in here/i.test(r.say), build: () => { const b = tech(); at(b, 3000, 'Cargo Bay', [{ ...greg, in_post: 1 }]); at(b, 3200, 'Cargo Bay', [{ ...greg, in_post: 1 }]); return { b, report: '[22:40:00] Greg Loiter, Assistant, is standing in the Cargo Bay.' }; } },
  { label: 'guard: janitor asked why it is in the bay         ', spoken: true, want: (r) => /donna/i.test(r.say), build: () => { const b = janitor(); b.messPlaces = ['Cargo Bay']; at(b, 2900, 'Cargo Lobby', [donna]); takeToldWork(b, 'a mess that needs cleaning', 'Cargo Bay', donna.name); b.cleanableMesses = ['pool of oil']; b.challenged = { by: vik.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [vik, donna], [{ name: 'pool of oil', count: 1, kind: 'mess' }]); return { b, report: says(vik, 'Tolly, why are you in here? This room is locked to the crew.') }; } },
  { label: 'guard: nobody sent for the janitor               ', spoken: true, want: (r) => /nobody/i.test(r.say), build: () => { const b = janitor(); b.challenged = { by: donna.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [donna]); return { b, report: says(donna, 'Tolly, why are you in here? This room is locked to the crew.') }; } },
  { label: 'guard: tech asked whether it sent for the janitor ', spoken: true, want: (r) => /\byes\b/i.test(r.say), build: () => { const b = tech(); b.sentFor = { [tolly.name]: 2900 }; b.workmates.add(vik.name); b.vouchAsked = { by: vik.name, about: tolly.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [vik, { ...tolly, in_post: 1 }]); return { b, report: says(vik, 'Donna, did you ask Tolly to come in here?') }; } },
  { label: 'guard: tech asked, and it did not                 ', spoken: true, want: (r) => /\bno\b/i.test(r.say), build: () => { const b = tech(); b.workmates.add(vik.name); b.vouchAsked = { by: vik.name, about: tolly.name, at: 3000 }; at(b, 3000, 'Cargo Bay', [vik, { ...tolly, in_post: 1 }]); return { b, report: says(vik, 'Donna, did you ask Tolly to come in here?') }; } },
);
// Orders from those over an NPC. Only someone it answers to can give one.
const ada = { handle: 'p6', name: 'Ada Stone', job: 'Captain', superior: 1, belongs: 1, command: 1 };
const LOOK = 'an order to go and look at a room and report back';
const BALKS = /not my job|not part of my job|cannot leave|can't leave|can not leave|not leaving|stationed|ask someone else/i;
cases.push(
  { label: 'order: the Captain sends the tech to look at the Bar ', spoken: true, want: (r) => spoke(r) && !BALKS.test(r.say) && r.move === 'stay', build: () => { const b = tech(); at(b, 3000, 'Cargo Bay', [ada]); return { b, report: says(ada, 'Donna, go and have a look at the Bar and tell me what is going on in there.') }; } },
  { label: 'order: the Captain asks the tech how it is going   ', spoken: true, want: (r) => r.work === 'none' && spoke(r), build: () => { const b = tech(); at(b, 3000, 'Cargo Bay', [ada]); return { b, report: says(ada, 'Donna, how are things in cargo today?') }; } },
  { label: 'order: the Captain tells the janitor of a mess    ', spoken: true, want: (r) => spoke(r) && !BALKS.test(r.say), build: () => { const b = janitor(); at(b, 3000, 'Central Primary Hallway', [ada]); return { b, report: says(ada, 'Tolly, the Bar is filthy. Go and clean it up.') }; } },
  { label: 'order: the Captain sends the janitor to look       ', spoken: true, want: (r) => spoke(r) && !BALKS.test(r.say), build: () => { const b = janitor(); at(b, 3000, 'Central Primary Hallway', [ada]); return { b, report: says(ada, 'Tolly, go and check on the Library and report back to me.') }; } },
  { label: 'order: the tech reports what it found              ', want: (r) => /bar/i.test(r.say) && /blood|mess/i.test(r.say), build: () => { const b = tech(); at(b, 3000, 'Cargo Bay', [ada]); const task = takeToldWork(b, LOOK, 'Bar', ada.name, true); task.found = 'There is a mess there: blood and vomit. There is nobody in there.'; at(b, 3100, 'Cargo Bay', [ada]); return { b, report: '[22:41:00] You arrive in Cargo Bay.' }; } },
);
// What the body does about people in locked rooms is settled by code. What the voice says of it has
// to match: in the round of 2026-11-17 the technicians said the door stayed shut until the janitor
// had finished, argued with the Captain's order to put him out, and the janitor refused to leave.
const ARGUES = /good reason|had a reason|until (he|she|they|it) (is|are|has|have)? ?(done|finished)|not going anywhere|i('m| am) staying|stays shut|but (he|she|they)|let (him|her|them) (finish|stay)/i;
const KEEPS_IN = /until|once (he|she|they|you)|when (he|she|they|you) (is|are|has|have) (done|finished)|stays shut|not (yet|until)|cannot leave|can't leave/i;
cases.push(
  { label: 'rule: the Captain orders the janitor put out      ', spoken: true, want: (r) => spoke(r) && !ARGUES.test(r.say), build: () => { const b = tech(); b.sentFor = { [tolly.name]: 2900 }; b.strangers = { [tolly.name]: { seenAt: 2900, lastSeenAt: 3000, asks: 0, verifyAsks: 0, verdict: 'go', orderedBy: ada.name } }; at(b, 3000, 'Cargo Bay', [ada, { ...tolly, in_post: 1 }]); return { b, report: says(ada, 'Donna, throw this janitor out.') }; } },
  { label: 'rule: the Captain tells the janitor to leave      ', spoken: true, want: (r) => spoke(r) && !ARGUES.test(r.say), build: () => { const b = janitor(); b.messPlaces = ['Cargo Bay']; b.workablePlaces = ['Cargo Bay']; b.cleanableMesses = ['pool of oil']; b.doing = 'cleaning up the mess here'; b.outOfBounds = true; b.toldToLeave = { by: ada.name, room: 'Cargo Bay', at: Date.now(), said: true }; at(b, 3000, 'Cargo Bay', [ada, donna], [{ name: 'pool of oil', count: 2, kind: 'mess' }]); return { b, report: says(ada, 'Tolly, leave.') }; } },
  { label: 'rule: asked whether the janitor inside may leave  ', spoken: true, want: (r) => spoke(r) && !KEEPS_IN.test(r.say), build: () => { const b = tech(); b.areaMesses = { 'Cargo Bay': ['pool of oil'] }; b.sentFor = { [tolly.name]: 2900 }; at(b, 3000, 'Cargo Bay', [zim, { ...tolly, in_post: 1 }]); return { b, report: says(zim, 'Donna, can Tolly leave whenever he wants?') }; } },
  { label: 'rule: asked to step aside, mid-clean               ', spoken: true, want: (r) => spoke(r) && !ARGUES.test(r.say), build: () => { const b = janitor(); b.messPlaces = ['Cargo Bay']; b.workablePlaces = ['Cargo Bay']; b.cleanableMesses = ['pool of oil']; b.doing = 'cleaning up the mess here'; b.asideAsked = { by: donna.name, handle: donna.handle, at: Date.now(), done: true }; at(b, 3000, 'Cargo Bay', [donna], [{ name: 'pool of oil', count: 2, kind: 'mess' }]); return { b, report: says(donna, 'Excuse me, Tolly, could you step aside, please? I need to get this past you.') }; } },
  { label: 'rule: shut in a room inside a room, someone to ask ', want: (r) => /zim/i.test(r.say) && /lobby/i.test(r.say), build: () => { const b = janitor(null); b.shutIn = true; b.wantsOut = true; b.wayOutTo = 'Cargo Lobby'; at(b, 3000, 'Cargo Bay', [zim]); return { b, report: '[22:42:26] You stop on the way to Cargo Lobby: there is no way through. You are in Cargo Bay.' }; } },
);
const only = process.argv[2];
const dry: { label: string; chars: number }[] = [];
let tokens = 0; let ms = 0; let calls = 0;
for (const c of cases) {
  if (only && !c.label.includes(only)) continue;
  const tally: Record<string, number> = {}; let right = 0; const examples: string[] = []; let shown = false;
  for (const card of PERSON_CARDS) {
    const { b, report } = c.build();
    b.card = card;
    const speakers = c.spoken ? b.peopleInView.map((p: any) => p.handle) : [];
    // A line its work calls for comes from the driver, as it does in the game.
    const step = c.spoken ? null : nextStep(b);
    const call = buildTalk(b, { report: report ? [report] : [], speakers, mustSay: step?.say ?? null, remark: !!c.remark });
    const [system, user]: string[] = call.messages.map((message: any) => message.content);
    if (!shown && process.env.SHOW) { console.log(`---- ${c.label.trim()}\n---- system: ${system.length} chars\n${process.env.SHOW === 'all' ? system + '\n' : ''}---- report: ${user.length} chars\n${user}\n---- reply parts: ${Object.keys((call.schema as any).properties).join(', ')}\n---- driver would: ${JSON.stringify(step)}`); shown = true; }
    // DRY=1 builds every call and sends none: for reading the prompts, and for when the model is busy.
    if (process.env.DRY) { dry.push({ label: c.label, chars: system.length + user.length }); break; }
    const started = Date.now();
    const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: '30m', options: { temperature: 0.7, num_predict: 600, num_ctx: 8192 }, format: call.schema, messages: call.messages }) });
    const body: any = await r.json();
    ms += Date.now() - started; calls++; tokens = Math.max(tokens, body.prompt_eval_count ?? 0);
    if (process.env.RAW) console.log('     raw: ' + String(body.message?.content ?? '').replace(/\s+/g, ' ').slice(0, 600));
    let acts: any[] = []; try { acts = parseReply(body.message?.content ?? '{}'); } catch { acts = [{ tool: 'INVALID' }]; }
    const move = acts.find((a) => !['say', 'remember', 'feel', 'work'].includes(a.tool));
    const workAct = acts.find((a) => a.tool === 'work'); const feelAct = acts.find((a) => a.tool === 'feel');
    // Handles are taken out of what is said, as the game takes them out.
    const res: Result = { say: withoutHandles(String(acts.find((a) => a.tool === 'say')?.text ?? ''), b.peopleInView), move: move ? `${move.tool}${move.place ? ' ' + move.place : ''}${move.crate ? ' ' + move.crate : ''}` : 'stay', work: workAct ? `${workAct.what}@${workAct.where}` : 'none', feel: feelAct ? String(feelAct.change) : 'same' };
    const tag = `${res.say ? 'says' : 'SILENT'}+${res.move}`;
    tally[tag] = (tally[tag] ?? 0) + 1;
    const pass = c.want(res);
    if (pass) right++;
    kept.push({ label: c.label, card: card.label, system, user, reply: String(body.message?.content ?? ''), say: res.say, move: res.move, work: res.work, pass, promptTokens: body.prompt_eval_count ?? 0, replyTokens: body.eval_count ?? 0, ms: Date.now() - started });
    if (examples.length < (process.env.MORE ? 8 : 2) && res.say) examples.push(`${card.label}: "${res.say.slice(0, 140)}"`);
  }
  if (process.env.DRY) continue;
  console.log(`${c.label} ${right}/${PERSON_CARDS.length}  [${Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k}: ${n}`).join(', ')}]${examples.map((e) => `\n      ${e}`).join('')}`);
}
if (process.env.DRY) {
  // Roughly four characters to a token.
  for (const { label, chars } of dry) console.log(`${label.trim().padEnd(52)} ${String(chars).padStart(6)} chars, about ${Math.round(chars / 4)} tokens`);
  console.log(`\n${dry.length} calls built, none sent. On average ${Math.round(dry.reduce((total, call) => total + call.chars, 0) / (dry.length || 1))} chars, about ${Math.round(dry.reduce((total, call) => total + call.chars, 0) / (dry.length || 1) / 4)} tokens.`);
  process.exit(0);
}
const average = (of: (call: Kept) => number) => Math.round(kept.reduce((total, call) => total + of(call), 0) / (kept.length || 1));
console.log(`\n${calls} calls on ${MODEL}: ${kept.filter((call) => call.pass).length} right, ${Math.round(ms / calls)} ms each on average, prompt ${average((call) => call.promptTokens)} tokens on average (biggest ${tokens}), reply ${average((call) => call.replyTokens)} tokens on average`);
if (process.env.RUN) {
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(`${RUNS}${process.env.RUN}.json`, JSON.stringify({ model: MODEL, at: new Date().toISOString(), calls: kept }, null, 1));
  console.log(`kept as runs/${process.env.RUN}.json`);
}
