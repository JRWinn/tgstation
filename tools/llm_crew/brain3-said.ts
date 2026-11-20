// A line the work calls for, said once it has really gone out (CrewBrain/brain.ts, driver.ts).
// ASYNC-05: word for someone face to face is struck off toTell only once it is said with them in
// view; if they walk out of sight while the model is busy, it waits until they are back.
// DRV-07 (half 1): a shut-in body counts someone as asked for the door only once it has asked them.
// A stand-in model answers, held back as long as a case wants; no real model is called.
//
//   bun run brain3-said.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

/** While TRUE, the stand-in model does not answer until `release` is called. */
let holding = false;
let release: (() => void) | null = null;
let answer = 'Hello there.';
/** While TRUE, the stand-in model takes each call and never answers, until the caller gives up on it. */
let hanging = false;
(globalThis as any).fetch = async (_url: string, init: any) => {
  if (hanging) {
    await new Promise<void>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted.')));
    });
  }
  if (holding) {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  }
  const properties = JSON.parse(init.body).format.properties;
  const reply: any = properties.think ? { think: 'x' } : {};
  if (properties.feel) reply.feel = { person: properties.feel.properties.person.enum[0], change: 'same', why: '' };
  if (properties.work) reply.work = { what: 'nothing', where: properties.work.properties.where.enum.at(-1) };
  if (properties.say) reply.say = answer;
  if (properties.move) reply.move = { tool: 'stay' };
  return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) }, done_reason: 'stop', prompt_eval_count: 200, eval_count: 20 }) };
};

const said: string[] = [];
let decisions = 0;
/** Lines the round's brain log was told were lost. */
const lost: string[] = [];
/** When each body was sent each tool call. */
const calls = new Map<string, number[]>();
let evSeq = 1000;
const onAct = (action: string, payload: any) => {
  if (action === 'tool_call') calls.set(payload.npc, [...(calls.get(payload.npc) ?? []), Date.now()]);
  if (action === 'tool_call' && payload.tool === 'say') said.push(String(payload.args?.text ?? ''));
  if (action === 'brain_log' && payload.kind === 'decision' && !String(payload.trigger).startsWith('ROUTINE')) decisions++;
  if (action === 'brain_log' && /line lost/.test(String(payload.reply))) lost.push(String(payload.reply));
};
B.setAct(onAct);
/** TRUE if no body was sent more than the server's 8 tool calls in any 10 seconds. */
const worstWindow = () => [...calls.values()].every((times) => times.every((at, i) => times.filter((other) => other >= at && other - at < 10000).length <= 8 || i < 0));
B.chooseModel(['stand-in']);

const zim = { handle: 'p7', name: 'Zim Fire', job: 'Quartermaster' };
let ids = 0;
let tick = 100;
const body = (id: string, people: any[], more: any = {}) => ({
  id, name: 'Sam Crate', job: 'Cargo Technician', awake: 1, location: 'Cargo Bay', people_in_view: people, things_in_view: [], holding: [], place_kind: 'room',
  walking: 0, resting: 0, explored_everything: 1, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: 'Cargo Bay', orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits until the model has been asked `count` times in all, or a few seconds have gone. */
const thought = async (count: number) => {
  const until = Date.now() + 15000;
  while (Date.now() < until && decisions < count) await wait(50);
};
/** Waits until the stand-in model is holding a call. */
const asked = async () => {
  const until = Date.now() + 15000;
  while (Date.now() < until && !release) await wait(50);
};
const update = (id: string, people: any[], more: any = {}) => {
  tick += 10;
  B.ingest([body(id, people, more) as any], tick);
};

// ---- ASYNC-05: the Quartermaster walks out of sight while the technician's answer waits on the model
{
  const id = `said${++ids}`;
  update(id, []);
  const brain: any = B.getBrain(id);
  const LINE = 'Order 7, right away.';
  brain.toTell.push({ to: 'Zim Fire', line: LINE, why: 'The Quartermaster gave you order 7.', at: Date.now(), exact: true });
  holding = true;
  release = null;
  const before = decisions;
  update(id, [zim]);
  await asked();
  add('ASYNC-05: the line is handed to the model: still on toTell while it waits', brain.toTell.some((it: any) => it.line === LINE), true);
  update(id, []);
  holding = false;
  release?.();
  release = null;
  await thought(before + 1);
  add('ASYNC-05: the Quartermaster gone by the time the answer comes: nothing is said', said.includes(LINE), false);
  add('ASYNC-05: the line stays on toTell', brain.toTell.some((it: any) => it.line === LINE), true);
  add('ASYNC-05: and is not held back', brain.failures.has(`tell:Zim Fire:${LINE}`), false);
  update(id, [zim]);
  await thought(before + 2);
  await wait(100);
  add('ASYNC-05: the Quartermaster back in view: the line is said', said.some((line) => line.startsWith(LINE)), true);
  add('ASYNC-05: and only now struck off toTell', brain.toTell.some((it: any) => it.line === LINE), false);
}

// ---- ASYNC-05: in view the whole time, the line is said and struck off, as before
{
  const id = `said${++ids}`;
  update(id, []);
  const brain: any = B.getBrain(id);
  const LINE = 'Order 8, right away.';
  brain.toTell.push({ to: 'Zim Fire', line: LINE, why: 'The Quartermaster gave you order 8.', at: Date.now(), exact: true });
  const before = decisions;
  update(id, [zim]);
  await thought(before + 1);
  await wait(100);
  add('ASYNC-05: still in view: said', said.some((line) => line.startsWith(LINE)), true);
  add('ASYNC-05: still in view: struck off toTell', brain.toTell.length, 0);
}

// ---- DRV-07: shut in, the person it asks for the door walks off before the ask is said
{
  const id = `said${++ids}`;
  const shut = { shut_in: 1, at_door_of: 'Cargo Bay', let_in_by: null };
  update(id, [], shut);
  const brain: any = B.getBrain(id);
  brain.outAsks = { room: 'Cargo Bay', asked: [], knocked: true, messaged: true, wrote: [], wroteAt: Date.now() };
  holding = true;
  release = null;
  const before = decisions;
  const saidBefore = said.length;
  update(id, [zim], shut);
  await asked();
  add('DRV-07: the ask is handed to the model: Zim is not yet down as asked', brain.outAsks.asked, []);
  update(id, [], shut);
  holding = false;
  release?.();
  release = null;
  await thought(before + 1);
  add('DRV-07: Zim gone before it was said: nothing said', said.length - saidBefore, 0);
  add('DRV-07: and Zim is still not down as asked', brain.outAsks.asked, []);
  update(id, [zim], shut);
  await thought(before + 2);
  await wait(100);
  add('DRV-07: Zim back: Zim is asked', said.slice(saidBefore).some((line) => /^Zim, could you open the door/.test(line)), true);
  add('DRV-07: and now down as asked', brain.outAsks.asked, ['Zim Fire']);
}

// ---- BRAIN-02: a model that takes the call and never answers
hanging = true;
{
  // Alone with the model free, the call starts at once and is given up after 15 seconds, not 60.
  const id = `said${++ids}`;
  update(id, []);
  const brain: any = B.getBrain(id);
  const LINE = 'Zim, crate 12 is out in the lobby for you.';
  brain.toTell.push({ to: 'Zim Fire', line: LINE, why: 'Crate 12 is out.', at: Date.now(), needs: /crate 12/i });
  const started = Date.now();
  update(id, [zim]);
  while (Date.now() - started < 20000 && !said.includes(LINE)) {
    await wait(200);
    update(id, [zim]);
  }
  const took = Date.now() - started;
  add('BRAIN-02: the model hangs: the plain line is said', said.includes(LINE), true);
  add('BRAIN-02: within about 15 seconds, not 60', took > 13000 && took < 18000, true);
}
{
  // The model is held by someone else's talk. One with a line to word waits 8 seconds, not its
  // place in the queue times a minute; one with a word-for-word line says it as soon as it may.
  const talker = `said${++ids}`;
  const plain = `said${++ids}`;
  const exact = `said${++ids}`;
  const all = (people: any[], more: any = {}, events: any[] = []) => {
    tick += 10;
    B.ingest([body(talker, [zim], { events }), body(plain, people, more), body(exact, people, more)] as any, tick);
  };
  all([]);
  const P = 'Zim, the bay is clear now.';
  const E = 'Order 9, right away.';
  // The talker is spoken to, so its call (with no line of its own) holds the model up to a minute.
  all([], {}, [{ seq: 1, time: '', at: tick, kind: 'speech_heard', text: 'Zim Fire says: "Hello there"', details: { source: 'person', handle: 'p7', speaker: 'Zim Fire', message: 'Hello there', said_to: 'me' } }]);
  await wait(300);
  (B.getBrain(plain) as any).toTell.push({ to: 'Zim Fire', line: P, why: 'x', at: Date.now(), needs: /clear/i });
  (B.getBrain(exact) as any).toTell.push({ to: 'Zim Fire', line: E, why: 'x', at: Date.now(), exact: true });
  const started = Date.now();
  let exactAt = 0;
  let plainAt = 0;
  while (Date.now() - started < 14000 && !(exactAt && plainAt)) {
    all([zim]);
    await wait(250);
    if (!exactAt && said.some((line) => line.startsWith(E))) exactAt = Date.now() - started;
    if (!plainAt && said.includes(P)) plainAt = Date.now() - started;
  }
  add('BRAIN-02: the model busy elsewhere: a word-for-word line is said within a few seconds', exactAt > 0 && exactAt < 6000, true);
  add('BRAIN-02: a line to be worded is said plainly after about 8 seconds', plainAt > 7500 && plainAt < 11000, true);
  add('BRAIN-02: and is struck off toTell (it was said with Zim in view)', (B.getBrain(plain) as any).toTell.length, 0);
  add('BRAIN-02: and the body is no longer waiting its turn', (B.getBrain(plain) as any).status, 'idle');
}
hanging = false;
// The talker's call is still hanging: start again with the model free.
B.stopSession();
B.setAct(onAct);
B.chooseModel(['stand-in']);

// ---- BRAIN-04: a line the server refuses is said again once, word for word; small talk is not
{
  const id = `said${++ids}`;
  update(id, []);
  const brain: any = B.getBrain(id);
  const LINE = 'Order 11, right away.';
  brain.toTell.push({ to: 'Zim Fire', line: LINE, why: 'x', at: Date.now(), exact: true });
  const before = decisions;
  update(id, [zim]);
  await thought(before + 1);
  await wait(100);
  const count = () => said.filter((line) => line.startsWith(LINE)).length;
  add('BRAIN-04: the line is said', count(), 1);
  const refuse = (text: string) => update(id, [zim], { events: [{ seq: ++evSeq, time: '', at: tick, kind: 'action_result', text, details: { tool: 'say', ok: 0 } }] });
  refuse('You only just spoke. Wait a moment before speaking again.');
  add('BRAIN-04: refused: taken back out of what it said lately', brain.saidLately.some((it: any) => it.text.startsWith(LINE)), false);
  const started = Date.now();
  while (Date.now() - started < 12000 && count() < 2) {
    await wait(250);
    update(id, [zim]);
  }
  add('BRAIN-04: and said again, after the server would let it speak', count(), 2);
  add('BRAIN-04: not before the cooldown', Date.now() - started > 4000, true);
  refuse('You only just spoke. Wait a moment before speaking again.');
  const again = Date.now();
  while (Date.now() - again < 7000) {
    await wait(250);
    update(id, [zim]);
  }
  add('BRAIN-04: refused a second time: given up, not said a third time', count(), 2);
  add('BRAIN-04: and the round log says a line was lost', lost.some((it) => it.includes(LINE)), true);
}
{
  const id = `said${++ids}`;
  update(id, [zim]);
  answer = 'Lovely weather on the station today, Zim.';
  const before = decisions;
  update(id, [zim], { events: [{ seq: ++evSeq, time: '', at: tick, kind: 'speech_heard', text: 'Zim Fire says: "Hello"', details: { source: 'person', handle: 'p7', speaker: 'Zim Fire', message: 'Hello', said_to: 'me' } }] });
  await thought(before + 1);
  await wait(100);
  const n = said.filter((line) => line === answer).length;
  update(id, [zim], { events: [{ seq: ++evSeq, time: '', at: tick, kind: 'action_result', text: 'You only just spoke.', details: { tool: 'say', ok: 0 } }] });
  const started = Date.now();
  while (Date.now() - started < 6000) {
    await wait(250);
    update(id, [zim]);
  }
  add('BRAIN-04: small talk refused: not said again', said.filter((line) => line === answer).length, n);
  answer = 'Hello there.';
}
add('BRAIN-04: no body was sent more than 8 tool calls in any 10 seconds', worstWindow(), true);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
