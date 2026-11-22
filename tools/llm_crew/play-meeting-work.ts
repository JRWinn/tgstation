// PARSE-15, the think half (CrewBrain/brain.ts, the work branch): a head told to call a meeting
// in the same breath as an order naming a room takes the model's work answer for that room. A
// meeting order alone, with the model naming a room anyway, is still not taken as work. The
// look is worded so the code's own net (workInWords) misses it, so only the model's answer can
// take it. A stand-in model answers; no real model is called.
//
//   bun run play-meeting-work.ts
const { ROOT, know } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// The stand-in model: says yes, and answers work for the Bar whenever it may.
(globalThis as any).fetch = async (_url: string, init: any) => {
  const properties = JSON.parse(init.body).format.properties;
  const reply: any = properties.think ? { think: 'x' } : {};
  if (properties.feel) reply.feel = { person: properties.feel.properties.person.enum[0], change: 'same', why: '' };
  if (properties.work) {
    const whats: string[] = properties.work.properties.what.enum ?? [];
    const look = whats.find((what) => /look at a room/.test(what)) ?? whats[0];
    const wheres: string[] = properties.work.properties.where.enum ?? [];
    reply.work = { what: look, where: wheres.includes('Bar') ? 'Bar' : wheres.at(-1) };
  }
  reply.say = 'Yes, Captain.';
  if (properties.move) reply.move = { tool: 'stay' };
  return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) }, done_reason: 'stop', prompt_eval_count: 200, eval_count: 20 }) };
};

const logged: any[] = [];
B.setAct((action: string, payload: any) => {
  if (action === 'brain_log' && payload.kind === 'decision') logged.push(payload);
});
B.chooseModel(['stand-in']);

const cap = { handle: 'p1', name: 'Zim Fire', job: 'Captain', superior: 1 };
const body = (id: string, more: any = {}) => ({
  id, name: 'Quin Mark', job: 'Quartermaster', awake: 1, location: 'Central Primary Hallway', people_in_view: [cap], things_in_view: [], holding: [], place_kind: 'hallway',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});

/** The Captain says this to the Quartermaster; gives back the calls of the decision it made. */
async function told(id: string, text: string): Promise<string | null> {
  B.ingest([body(id) as any], 100);
  know(B.getBrain(id), ['Bar', 'Cargo Bay', 'Central Primary Hallway', "Quartermaster's Office"]);
  const from = logged.length;
  B.ingest([body(id, { events: [{ seq: 1, time: '', at: 110, kind: 'speech_heard', text: `[22:40:32] Zim Fire says: "${text}" (person p1, 1 tiles away)`, details: { source: 'person', handle: 'p1', speaker: 'Zim Fire', message: text, said_to: 'me' } }] }) as any], 110);
  const until = Date.now() + 15000;
  const mine = () => logged.slice(from).find((record) => record.npc === id || !String(record.trigger ?? '').startsWith('ROUTINE'));
  while (Date.now() < until && !mine()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return (B.getBrain(id) as any)?.lastDecision?.calls.join('\n') ?? null;
}

{
  const calls = await told('meet1', 'Quin, call a staff meeting. And then pop over to the Bar for me and tell me what state it is in.');
  add('a meeting order and the Bar in words the net misses: the model\'s work answer is taken', /^work\(/m.test(calls ?? ''), true);
  add('and not only caught from the words afterwards', /caught from what was said/.test(calls ?? ''), false);
}
{
  const calls = await told('meet2', 'Quin, call a staff meeting.');
  add('a meeting order alone: no work is taken for the room the model named', /work\(/.test(calls ?? ''), false);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
B.stopSession();
process.exit(failed ? 1 : 0);
