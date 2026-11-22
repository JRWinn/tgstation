// PLAY-10 (brain part): an answer the model gives word for word as one the NPC said a moment ago is
// not said again (saidJustNow in the reply filter, CrewBrain/brain.ts). A stand-in model answers;
// no real model is called.
//
//   bun run play-repeat-reply.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const REFUSAL = "Hey Zim! Cleaning isn't part of my job description, that's what the janitors are for.";
let answer = REFUSAL;
(globalThis as any).fetch = async (_url: string, init: any) => {
  const properties = JSON.parse(init.body).format.properties;
  const reply: any = properties.think ? { think: 'x' } : {};
  if (properties.feel) reply.feel = { person: properties.feel.properties.person.enum[0], change: 'same', why: '' };
  if (properties.work) reply.work = { what: 'nothing', where: properties.work.properties.where.enum.at(-1) };
  reply.say = answer;
  if (properties.move) reply.move = { tool: 'stay' };
  return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) }, done_reason: 'stop', prompt_eval_count: 200, eval_count: 20 }) };
};

const said: string[] = [];
const logged: any[] = [];
B.setAct((action: string, payload: any) => {
  if (action === 'tool_call' && payload.tool === 'say') said.push(String(payload.args?.text ?? ''));
  if (action === 'brain_log' && payload.kind === 'decision' && !String(payload.trigger).startsWith('ROUTINE')) logged.push(payload);
});
B.chooseModel(['stand-in']);

const zim = { handle: 'p7', name: 'Zim Fire', job: 'Cook' };
const body = (more: any = {}) => ({
  id: 'rep1', name: 'Jace Richardson', job: 'Janitor', awake: 1, location: 'Central Primary Hallway', people_in_view: [zim], things_in_view: [], holding: [], place_kind: 'hallway',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});
let seq = 0;
let tick = 100;
const hear = (message: string) => {
  seq++;
  tick += 10;
  B.ingest([body({ events: [{ seq, time: '', at: tick, kind: 'speech_heard', text: `Zim Fire says: "${message}"`, details: { source: 'person', handle: 'p7', speaker: 'Zim Fire', message, said_to: 'me' } }] }) as any], tick);
};
const answered = async (count: number) => {
  const until = Date.now() + 30000;
  while (Date.now() < until && logged.length < count) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

B.ingest([body() as any], tick);
hear('its messy in here');
await answered(1);
add('the first answer is said', said, [REFUSAL]);

hear('Then ask for a janitor');
await answered(2);
add('the same answer again, word for word: not said a second time', said, [REFUSAL]);
add('the log says why', /\[said word for word just now: not said\]/.test(logged[1]?.calls ?? ''), true);

answer = 'Fine, I will send a PDA message to one of the janitors now.';
hear('Well, do it then');
await answered(3);
add('a different answer is said', said.at(-1), answer);

answer = 'Yes, sir.';
hear('Good.');
await answered(4);
hear('Thanks.');
answer = 'Yes, sir.';
await answered(5);
add('a short answer is said as often as asked', said.filter((line) => line === 'Yes, sir.').length, 2);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
B.stopSession();
process.exit(failed ? 1 : 0);
