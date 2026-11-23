// What a step's result settles once it reaches the driver (noteResult in CrewBrain/driver.ts),
// heard the way the server sends it: an action_result with details and text.
// MULTI-07: a collect_crate refused because someone else has hold of the crate reaches
// pickupsAfterActing with its details and words, so the errand ends with nothing said.
// No model is called and no station is simulated.
//
//   bun run driver4-results.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { noteResult } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const result = (tool: string, ok: boolean, text: string, details: Record<string, unknown> = {}) =>
  ({ seq: 1, time: '', at: 100, kind: 'action_result', text, details: { tool, ok: ok ? 1 : 0, ...details } }) as any;

/** A janitor sent to collect crate #12 for the Head of Personnel, its collect_crate step on its way. */
function collecting() {
  const b: any = makeBrain('Jan Mopp', 'Janitor');
  b.toTell = [];
  const task: any = { id: 1, kind: 'collect', item: '12', place: 'Bar', askedBy: 'Hop Kins', state: 'open', urgency: 'asked', source: 'asked', createdAt: 0 };
  b.tasks = [task];
  const act = { tool: 'collect_crate', number: 12 };
  b.lastAct = { key: 'collect:1', tool: 'collect_crate', at: Date.now(), act, task: 1 };
  return { b, task };
}

{
  const { b, task } = collecting();
  noteResult(b, result('collect_crate', false, 'Mo Pper already has hold of the janitorial supplies crate.'));
  add('MULTI-07: refused, someone else has hold of it (words only): the errand ends, nothing said', [task.state, b.toTell.length], ['done', 0]);
}
{
  const { b, task } = collecting();
  noteResult(b, result('collect_crate', false, 'You could not take it.', { held_by: 'Mo Pper' }));
  add('MULTI-07: held_by in the details: the errand ends', task.state, 'done');
}
{
  const { b, task } = collecting();
  noteResult(b, result('collect_crate', false, 'You lost your grip on it.'));
  add('MULTI-07: a lost grip is not that: the errand stands', task.state, 'open');
}

// MULTI-08 (answer B): the server's would_not_go reaches wantedAfterActing, and is read before the words.
const { at } = await import('./fixtures');
function walkingOut(wouldNotGo: number | undefined) {
  const b: any = makeBrain('Cora Tech', 'Cargo Technician');
  b.toTell = [];
  b.post = 'Cargo Bay';
  at(b, 4000, 'Cargo Bay', [{ handle: 'p3', name: 'Tolly Field', job: 'Janitor', place: 'Cargo Bay', distance: 1, in_post: 1 }]);
  b.strangers['Tolly Field'] = { seenAt: 4000, lastSeenAt: 4000, asks: 0, verifyAsks: 0, verdict: 'go', toldOutAt: 3990 };
  const act = { tool: 'throw_out', person: 'p3' };
  b.lastAct = { key: 'stranger:1', tool: 'throw_out', at: Date.now(), act, task: 1 };
  const details = wouldNotGo === undefined ? {} : { would_not_go: wouldNotGo, person: 'Tolly Field' };
  noteResult(b, result('throw_out', false, 'You could not get Tolly Field out of Cargo Bay: they got away from you.', details));
  return b.wanted.couldNot.map((it: any) => it.name);
}
add('MULTI-08: would_not_go 1 from the server: reported', walkingOut(1), ['Tolly Field']);
add('MULTI-08: would_not_go 0 from the server, though the words say got away: not reported', walkingOut(0), []);
add('MULTI-08: no would_not_go: the words are read, as before', walkingOut(undefined), ['Tolly Field']);

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
