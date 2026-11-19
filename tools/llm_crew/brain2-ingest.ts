// What the window makes of what the server sends, through ingest itself (CrewBrain/brain.ts):
// a fire alarm that would not reset (DOOR-11), and a room left on purpose (CHK-07). No model is
// called; the brain is made by ingest from a body with nothing about it.
//
//   bun run brain2-ingest.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
/** A body as the server would send it, with nothing about it, and these events. */
const body = (id: string, location: string, events: any[] = [], more: any = {}) => ({
  id, name: 'Pat Mop', job: 'Janitor', awake: 1, location, people_in_view: [], things_in_view: [], holding: [], place_kind: 'room',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events, ...more,
});
let seq = 1;
const event = (kind: string, details: any, text = '') => ({ seq: seq++, time: '', at: 100, kind, text, details });
const fresh = (location: string) => {
  const id = `ingest${++ids}`;
  B.ingest([body(id, location) as any], 100);
  return { id, brain: B.getBrain(id) as any };
};

// ---- DOOR-11: a fire alarm reset that did not happen leaves that room alone a while
{
  const { id, brain } = fresh('Central Primary Hallway');
  const before = Date.now();
  B.ingest([body(id, 'Central Primary Hallway', [event('action_result', { tool: 'reset_alarm', ok: 0, alarm_dead: 'Bar' }, 'The fire alarm in Bar has no power. It will not reset.')]) as any], 200);
  const until = brain.fireClosed['Bar'] ?? 0;
  add('DOOR-11: an alarm with no power: that room is left alone about ten minutes', until >= before + 590_000 && until <= Date.now() + 600_000, true);
}
{
  const { id, brain } = fresh('Central Primary Hallway');
  B.ingest([body(id, 'Central Primary Hallway', [event('action_result', { tool: 'reset_alarm', ok: 0, alarm_out_of_reach: 'Bar' })]) as any], 200);
  add('DOOR-11: one out of reach, as before: left alone too', (brain.fireClosed['Bar'] ?? 0) > Date.now(), true);
  B.ingest([body(id, 'Central Primary Hallway', [event('action_result', { tool: 'reset_alarm', ok: 1 })]) as any], 300);
  add('DOOR-11: a reset that went through names no other room', Object.keys(brain.fireClosed), ['Bar']);
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
