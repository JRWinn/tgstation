// PLAY-11: asked to step aside, the body moves at once (asideStep, CrewBrain/jobs/aside.ts), and the
// situation text must not tell the voice it is still in the middle of its work (describeSituation in
// CrewBrain/situation.ts). No model is called; the brain is made by ingest from a bare body.
//
//   bun run play-aside-voice.ts
const { ROOT } = await import('./fixtures');
const B = await import(ROOT + 'brain');
const S = await import(ROOT + 'situation');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const body = (id: string, more: any = {}) => ({
  id, name: 'Netta Rader', job: 'Janitor', awake: 1, location: 'Cargo Bay', people_in_view: [{ handle: 'p4', name: 'Kailyn Patterson', job: 'Cargo Technician' }],
  things_in_view: [{ name: 'pool of oil', count: 1, kind: 'mess' }], holding: ['mop', 'bucket'], place_kind: 'room',
  walking: 0, resting: 0, explored_everything: 0, storage_here: 0, cleaning_tool: 'mop', has_locator: 0, cleanable_messes: ['pool of oil'], mess_places: ['Cargo Bay'],
  workable_mess_places: ['Cargo Bay'], mop_needs_water: 0, sink_in_view: 0, shut_in: 0, door_open: 0, door_held: 0, door_held_out: 0, let_in_by: null,
  at_door_of: null, grenade_messes: 0, doing: 'cleaning up the mess here', dry_mop: 0, post: null, orderable: [], order_pending: 0, has_pda: 1, notices: [],
  acked_seq: 0, events: [], ...more,
});
const index = (lines: string[], start: string) => lines.findIndex((l) => l.startsWith(start));

B.ingest([body('aside1') as any], 100);
const brain = B.getBrain('aside1') as any;

{
  const lines = S.describeSituation(brain);
  add('nobody asked: it is in the middle of its work', lines.includes('You are in the middle of cleaning up the mess here.'), true);
  add('nobody asked: no aside line', lines.some((l: string) => l.includes('step aside')), false);
}

brain.asideAsked = { by: 'Kailyn Patterson', handle: 'p4', at: Date.now(), done: false };
{
  const lines = S.describeSituation(brain);
  add('asked, not yet stepped: no "in the middle of" line', lines.some((l: string) => l.startsWith('You are in the middle of')), false);
  add('asked: the work is broken off for now', lines.includes('You have broken off cleaning up the mess here for now to let Kailyn Patterson past. You go back to it once they are past.'), true);
  const aside = index(lines, 'Kailyn Patterson asked you to step aside');
  add('asked: the aside line says it is moving now, as settled', lines[aside], 'Kailyn Patterson asked you to step aside, and you are moving out of their way now. That is already done: you do not say you will wait, finish first or cannot. You do not argue it or explain what you were doing: at most you say sorry.');
  add('asked: the aside line comes before the mess line', aside >= 0 && aside < index(lines, 'There is a mess here'), true);
  add('asked: the mess is still named, to go back to', index(lines, 'There is a mess here') >= 0, true);
  add('asked: the broken-off line comes first of all', index(lines, 'You have broken off'), 0);
}

brain.asideAsked.done = true;
{
  const lines = S.describeSituation(brain);
  add('stepped: the aside line says it has stepped', lines.some((l: string) => l.startsWith('Kailyn Patterson asked you to step aside, and you have stepped out of their way now.')), true);
}

// The server's doing is the step aside itself: "broken off stepping out of someone's way" would be nonsense.
B.ingest([body('aside1', { doing: "stepping out of someone's way", walking: 1 }) as any], 200);
{
  const lines = S.describeSituation(brain);
  add('doing is the step itself: no broken-off line', lines.some((l: string) => l.startsWith('You have broken off')), false);
  add('doing is the step itself: no "in the middle of" line', lines.some((l: string) => l.startsWith('You are in the middle of')), false);
  add('doing is the step itself: the aside line is first', index(lines, 'Kailyn Patterson asked you to step aside'), 0);
}

// Nothing in hand to do: only the aside line.
B.ingest([body('aside1', { doing: null }) as any], 300);
{
  const lines = S.describeSituation(brain);
  add('doing nothing: the aside line is first', index(lines, 'Kailyn Patterson asked you to step aside'), 0);
}

// The asking has passed (the stand and the hold): back to the plain line.
brain.asideAsked.at = Date.now() - 60000;
B.ingest([body('aside1') as any], 400);
{
  const lines = S.describeSituation(brain);
  add('the asking long past: in the middle of its work again', lines.includes('You are in the middle of cleaning up the mess here.'), true);
  add('the asking long past: no aside line', lines.some((l: string) => l.includes('asked you to step aside')), false);
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
