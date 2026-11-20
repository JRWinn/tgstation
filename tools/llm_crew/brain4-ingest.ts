// What the window makes of fields the server sends, through ingest itself (CrewBrain/brain.ts),
// round M2: full crates aboard the shuttle (SUP-05), the door it stands at standing open (ARR-06),
// work of its own job said to nobody in particular (PARSE-17). No model is called; the brain is
// made by ingest from a body with nothing about it.
//
//   bun run brain4-ingest.ts
const { ROOT, know } = await import('./fixtures');
const B = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

let ids = 0;
/** A body as the server would send it, with nothing about it, and these fields. */
const body = (id: string, location: string, more: any = {}) => ({
  id, name: 'Pat Box', job: 'Cargo Technician', awake: 1, location, people_in_view: [], things_in_view: [], holding: [], place_kind: 'room',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});
/** Ingests the body once with nothing, then with these fields, and gives back its brain. */
const ingested = (location: string, more: any) => {
  const id = `ingest4-${++ids}`;
  B.ingest([body(id, location) as any], 100);
  B.ingest([body(id, location, more) as any], 200);
  return B.getBrain(id) as any;
};
const freight = (more: any = {}) => ({
  freight: { shuttle_docked: 1, to_unload: 0, empties_aboard: 0, mail_crate: 0, mail_for: [], empty_crates: 0, ...more },
});

// ---- SUP-05: full crates aboard, claimed or not
add('SUP-05: full_aboard sent: read as fullAboard', ingested('Cargo Bay', freight({ full_aboard: 2 })).freight?.fullAboard, 2);
add('SUP-05: full_aboard 0 is kept as 0, not dropped', ingested('Cargo Bay', freight({ full_aboard: 0 })).freight?.fullAboard, 0);
add('SUP-05: not sent: unset, so toUnload is read in its place', ingested('Cargo Bay', freight()).freight?.fullAboard === undefined, true);

// ---- ARR-06: the door it stands at, opened by hand
add('ARR-06: a fresh brain: atDoorOpen false', ingested('Central Primary Hallway', {}).atDoorOpen, false);
add('ARR-06: at_door_open sent: read as atDoorOpen', ingested('Central Primary Hallway', { at_door_of: 'Bar', at_door_open: 1 }).atDoorOpen, true);
add('ARR-06: not sent: false', ingested('Central Primary Hallway', { at_door_of: 'Bar' }).atDoorOpen, false);

// ---- PARSE-17: "someone threw up in the bar", said across the room to nobody in particular
{
  const captain = { handle: 'p9', name: 'Ada Crane', job: 'Captain', superior: 1, place: 'Cargo Lobby', distance: 5 };
  const tech = { handle: 'p8', name: 'Donna Sholl', job: 'Cargo Technician', place: 'Cargo Lobby', distance: 2 };
  const janitor = (more: any = {}) => ({ name: 'Tolly Field', job: 'Janitor', cleaning_tool: 'soap', holding: ['soap'], people_in_view: [captain, tech], ...more });
  const id = `ingest4-${++ids}`;
  B.ingest([body(id, 'Cargo Lobby', janitor()) as any], 100);
  const brain: any = B.getBrain(id);
  know(brain, ['Bar', 'Cargo Lobby', 'Custodial Closet']);
  const message = 'someone threw up in the bar';
  const heard = { seq: 1, time: '', at: 110, kind: 'speech_heard', text: `[22:40:32] Ada Crane says: "${message}" (person p9, 5 tiles away)`, details: { source: 'person', handle: 'p9', speaker: 'Ada Crane', message, distance: 5, facing: 0 } };
  B.ingest([body(id, 'Cargo Lobby', janitor({ events: [heard] })) as any], 110);
  const task = brain.tasks.find((one: any) => one.place === 'Bar' && one.state !== 'done');
  add('PARSE-17: heard through ingest, said to nobody: the janitor takes the Bar on', [task?.kind, task?.place], ['clean', 'Bar']);
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
