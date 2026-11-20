// MAP-07 (step 4): the server's word that a body floats with the gravity off reaches the brain
// through ingest (CrewBrain/brain.ts), and the situation text says so while it lasts
// (CrewBrain/situation.ts). No model is called; the brain is made by ingest from a bare body.
//
//   bun run gravity3-floating.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');
const S = await import(ROOT + 'situation');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const LINE = 'There is no gravity here: you float and cannot walk.';
const body = (id: string, more: any = {}) => ({
  id, name: 'Pat Mop', job: 'Janitor', awake: 1, location: 'Central Primary Hallway', people_in_view: [], things_in_view: [], holding: [], place_kind: 'room',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});

B.ingest([body('float1') as any], 100);
const brain = B.getBrain('float1') as any;
add('with gravity: not floating', brain.floating, false);
add('with gravity: no line about it', S.describeSituation(brain).includes(LINE), false);

B.ingest([body('float1', { floating: 1 }) as any], 200);
add('the server says it floats: the brain knows', brain.floating, true);
add('the server says it floats: the situation says so, once', S.describeSituation(brain).filter((l: string) => l === LINE).length, 1);

B.ingest([body('float1', { floating: 0 }) as any], 300);
add('gravity back: not floating', brain.floating, false);
add('gravity back: the line is gone', S.describeSituation(brain).includes(LINE), false);

B.ingest([body('float1', { floating: 1 }) as any], 400);
B.ingest([body('float1') as any], 500);
add('an older server that sends no floating key: taken as not floating', brain.floating, false);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
B.stopSession();
process.exit(failed ? 1 : 0);
