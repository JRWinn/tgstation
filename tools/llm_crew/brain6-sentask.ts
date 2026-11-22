// SECT-08 (the owner's answer B), through ingest itself (CrewBrain/brain.ts): a keeper of any post,
// not only cargo, reads the Captain's or a head's PDA yes or no to "Did you send X to the Y?"
// (jobs/guarding.ts guardReadsMessage). No model is called.
//
//   bun run brain6-sentask.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');
const { guardOverhears, planGuarding } = await import(ROOT + 'jobs/guarding');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const IVY = { handle: 'p8', name: 'Ivy Lane', job: 'Assistant', in_post: 1, belongs: 0, distance: 2 };
let ids = 0;
/** A body as the server would send it: a keeper of its post, with Ivy in it. */
const body = (id: string, job: string, post: string, more: any = {}) => ({
  id, name: 'Pat Keep', job, awake: 1, location: post, people_in_view: [IVY], things_in_view: [], holding: [], place_kind: 'room',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: null, has_locator: 0, cleanable_messes: [], mess_places: [],
  workable_mess_places: [], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: null, dry_mop: 0, post, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  pda_people: [{ name: 'Cap Tain', job: 'Captain' }], acked_seq: 0, events: [], ...more,
});
const pda = (seq: number, from: string, message: string) => ({
  seq, time: '', at: 300, kind: 'pda_message', text: '', details: { speaker: from, message, job: 'Captain' },
});

for (const [job, post] of [['Janitor', 'Custodial Closet'], ['Cargo Technician', 'Cargo Bay'], ['Bartender', 'Bar']]) {
  for (const [answer, want] of [['Yes, I sent Ivy Lane.', 'stay'], ['No, I did not send Ivy Lane.', 'go']]) {
    const id = `sentask-${++ids}`;
    B.ingest([body(id, job, post) as any], 100);
    const b: any = B.getBrain(id);
    // Ivy has been asked why she is there.
    Object.assign(b.strangers[IVY.name], { asks: 1, askedAt: 95 });
    guardOverhears(b, { seq: 1, time: '', at: b.now, kind: 'speech_heard', text: '', details: { speaker: IVY.name, message: 'The Captain sent me.', said_to: 'me' } } as any);
    planGuarding(b, { id: 77, kind: 'stranger', item: IVY.name, state: 'open' } as any);
    const asked = b.toTell.some((t: any) => t.to === 'Cap Tain' && /^Did you send Ivy Lane to the /.test(t.line));
    B.ingest([body(id, job, post, { events: [pda(5, 'Cap Tain', answer)] }) as any], 300);
    add(`${job} keeping the ${post}: asked the Captain by PDA, and "${answer}" read`, [asked, b.strangers[IVY.name]?.verdict ?? null], [true, want]);
  }
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(100)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
