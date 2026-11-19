// Who is reported as one who would not be walked out of a room (MULTI-08). Someone only being seen
// to the door when the work they were sent for is done is never reported, however the walk out
// fails; someone put out on a superior's order is. No model is called.
//
//   bun run guarding-wanted.ts
const { ROOT, makeBrain, at } = await import('./fixtures');
const { wantedAfterActing } = await import(ROOT + 'jobs/wanted');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const GOT_AWAY = 'You could not get Tolly Field out of Cargo Bay: they got away from you.';
function reported(record: object | null, line = GOT_AWAY) {
  const t = makeBrain('Cora Tech', 'Cargo Technician');
  t.post = 'Cargo Bay';
  at(t, 4000, 'Cargo Bay', [{ handle: 'p3', name: 'Tolly Field', job: 'Janitor', place: 'Cargo Bay', distance: 1, in_post: 1 }]);
  if (record) {
    t.strangers['Tolly Field'] = { seenAt: 4000, lastSeenAt: 4000, asks: 0, verifyAsks: 0, ...record };
  }
  wantedAfterActing(t, { tool: 'throw_out', person: 'p3' }, false, line);
  return t.wanted.couldNot.map((it: any) => it.name);
}

add('a janitor seen out after its work, whose walk out failed, is not reported', reported({ verdict: 'go', sent: true, seenOut: true }), []);
add('nor when the record says only that it was seen out', reported({ verdict: 'go', seenOut: true }), []);
add('one sent for but put out on a superior order still is', reported({ verdict: 'go', sent: true, seenOut: false, orderedBy: 'Quin Master' }), ['Tolly Field']);
add('a stranger with no good reason who got away still is', reported({ verdict: 'go' }), ['Tolly Field']);
add('a stranger never asked anything who got away still is', reported(null), ['Tolly Field']);
add('a walk out that failed because the body was knocked down is no word for anyone', reported({ verdict: 'go' }, 'You could not get Tolly Field out of Cargo Bay: you were knocked down.'), []);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
