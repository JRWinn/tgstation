// Who is reported as one who would not be walked out of a room (MULTI-08). Someone only being seen
// to the door when the work they were sent for is done is never reported, however the walk out
// fails; someone put out on a superior's order is. No model is called.
//
//   bun run guarding-wanted.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const { wantedAfterActing, syncWanted, readWanted } = await import(ROOT + 'jobs/wanted');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const GOT_AWAY = 'You could not get Tolly Field out of Cargo Bay: they got away from you.';
function reported(record: object | null, line = GOT_AWAY, details?: object) {
  const t = makeBrain('Cora Tech', 'Cargo Technician');
  t.post = 'Cargo Bay';
  at(t, 4000, 'Cargo Bay', [{ handle: 'p3', name: 'Tolly Field', job: 'Janitor', place: 'Cargo Bay', distance: 1, in_post: 1 }]);
  if (record) {
    t.strangers['Tolly Field'] = { seenAt: 4000, lastSeenAt: 4000, asks: 0, verifyAsks: 0, ...record };
  }
  wantedAfterActing(t, { tool: 'throw_out', person: 'p3' }, false, line, details);
  return t.wanted.couldNot.map((it: any) => it.name);
}

add('a janitor seen out after its work, whose walk out failed, is not reported', reported({ verdict: 'go', sent: true, seenOut: true }), []);
add('nor when the record says only that it was seen out', reported({ verdict: 'go', seenOut: true }), []);
add('one sent for but put out on a superior order, told to go, still is', reported({ verdict: 'go', sent: true, seenOut: false, orderedBy: 'Quin Master', toldOutAt: 3990 }), ['Tolly Field']);
add('a stranger with no good reason, told to go, who got away still is', reported({ verdict: 'go', toldOutAt: 3990 }), ['Tolly Field']);
// MULTI-08, answer B: told to leave, refused, and broke the hold, all three.
add('a stranger never told to go who got away is not', reported({ verdict: 'go' }), []);
add('nor one with no record at all', reported(null), []);
add('a told stranger the body could not get a hold of is not (API-01 B)', reported({ verdict: 'go', toldOutAt: 3990 }, 'You cannot get a hold of Tolly Field.'), []);
add('a walk out that failed because the body was knocked down is no word for anyone', reported({ verdict: 'go', toldOutAt: 3990 }, 'You could not get Tolly Field out of Cargo Bay: you were knocked down.'), []);
// The server's word on it (a-secsrv): would_not_go, tested in place of the English when it is there.
add('would_not_go TRUE, told to go: reported', reported({ verdict: 'go', toldOutAt: 3990 }, GOT_AWAY, { would_not_go: true, person: 'Tolly Field' }), ['Tolly Field']);
add('would_not_go FALSE (the body went down, or they were down or cuffed), even with the got-away words: not', reported({ verdict: 'go', toldOutAt: 3990 }, GOT_AWAY, { would_not_go: false }), []);
add('would_not_go TRUE but never told to go: still not (MULTI-08 B)', reported({ verdict: 'go' }, GOT_AWAY, { would_not_go: true }), []);

// SECT-13: someone seen as Unknown (face hidden, no ID on show) is no name to declare a warrant on.
{
  const t = makeBrain('Cora Tech', 'Cargo Technician');
  t.post = 'Cargo Bay';
  t.hasPda = true;
  t.pdaPeople = [{ name: 'Quin Master', job: 'Quartermaster' }, { name: 'Joan Marsh', job: 'Head of Security' }];
  at(t, 4000, 'Cargo Bay', [{ handle: 'p4', name: 'Unknown', job: '', place: 'Cargo Bay', distance: 1, in_post: 1 }]);
  t.strangers.Unknown = { seenAt: 3900, lastSeenAt: 4000, asks: 2, verifyAsks: 0, verdict: 'go', toldOutAt: 3990 };
  wantedAfterActing(t, { tool: 'throw_out', person: 'p4' }, false, 'You could not get Unknown out of Cargo Bay: they got away from you.');
  syncWanted(t);
  add('a technician who could not put out Unknown tells its head plainly, with no name', t.toTell.map((tell: any) => tell.line), ['Quin, someone with their face hidden would not leave the Cargo Bay.']);
  const q = makeBrain('Quin Master', 'Quartermaster');
  q.hasPda = true;
  q.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }, { name: 'Joan Marsh', job: 'Head of Security' }];
  at(q, 4000, 'Quartermaster\'s Office');
  know(q, ['Cargo Bay']);
  readWanted(q, 'Cora Tech', 'Quin, I could not put Unknown out of the Cargo Bay.', 'Cargo Technician');
  add('a head told "could not put Unknown out" declares no warrant', q.toTell.map((tell: any) => tell.line), []);
  readWanted(q, 'Cora Tech', 'Quin, I could not put Tolly Field out of the Cargo Bay.', 'Cargo Technician');
  add('and still declares one on a name', q.toTell.map((tell: any) => tell.line), ['Warrant for Tolly Field, for trespass in the Cargo Bay.']);
  const s = makeBrain('Dana Reyes', 'Janitor');
  s.hasPda = true;
  s.pdaPeople = [{ name: 'Joan Marsh', job: 'Head of Security' }];
  s.wanted.entries = [{ name: 'Unknown' }];
  at(s, 4000, 'Bar', [{ handle: 'p5', name: 'Unknown', job: '', place: 'Bar', distance: 2 }]);
  syncWanted(s);
  add('an old warrant on Unknown sends no sighting of everyone masked', s.toTell.length, 0);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
