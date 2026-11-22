// PLAY-07: each model decision sent for crew_brain.log carries `calls`, what the code did with the
// reply (logDecision in CrewBrain/brain.ts), and not only the model's raw reply. A stand-in model
// answers; no real model is called.
//
//   bun run play-calls-logged.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// The stand-in model: answers with a line, whatever it is asked.
(globalThis as any).fetch = async (_url: string, init: any) => {
  const properties = JSON.parse(init.body).format.properties;
  const reply: any = properties.think ? { think: 'x' } : {};
  if (properties.feel) reply.feel = { person: properties.feel.properties.person.enum[0], change: 'same', why: '' };
  if (properties.work) reply.work = { what: 'nothing', where: properties.work.properties.where.enum.at(-1) };
  reply.say = 'Hello there, Ann.';
  if (properties.move) reply.move = { tool: 'stay' };
  return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) }, done_reason: 'stop', prompt_eval_count: 200, eval_count: 20 }) };
};

const logged: any[] = [];
B.setAct((action: string, payload: any) => {
  if (action === 'brain_log' && payload.kind === 'decision') logged.push(payload);
});
B.chooseModel(['stand-in']);

const ann = { handle: 'p7', name: 'Ann Other', job: 'Cook' };
const body = (more: any = {}) => ({
  id: 'calls1', name: 'Pat Mop', job: 'Janitor', awake: 1, location: 'Central Primary Hallway', people_in_view: [ann], things_in_view: [], holding: [], place_kind: 'hallway',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});

B.ingest([body() as any], 100);
B.ingest([body({ events: [{ seq: 1, time: '', at: 110, kind: 'speech_heard', text: 'Ann Other says: "Hi Pat, how are you?"', details: { source: 'person', handle: 'p7', speaker: 'Ann Other', message: 'Hi Pat, how are you?', said_to: 'me' } }] }) as any], 110);

// The model call and the log send are on timers: wait for them.
const until = Date.now() + 15000;
while (Date.now() < until && !logged.some((record) => record.trigger && !String(record.trigger).startsWith('ROUTINE'))) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const record = logged.find((r) => !String(r.trigger).startsWith('ROUTINE'));
const brain = B.getBrain('calls1') as any;
add('a model decision was logged', !!record, true);
add('the record has a calls field, a string', typeof record?.calls, 'string');
add('calls is what the window shows for that decision, one per line', record?.calls, brain?.lastDecision?.calls.join('\n'));
add('calls holds the line that was said', /say\("Hello there, Ann\."\)/.test(record?.calls ?? ''), true);
add('the raw reply is still there beside it', /Hello there/.test(record?.reply ?? ''), true);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
B.stopSession();
process.exit(failed ? 1 : 0);
