// Looking for someone in the room they were seen in (KNA-23, the window's part): serveStep and
// beatAfterActing in CrewBrain/jobs/arrests.ts. The officer looks from where it came in, then walks
// to the middle of the room and looks from there, each leg timed from its own arrival. Only then is
// the sighting used up. No model is called and no station is simulated.
//
//   bun run arrests3-look.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer just come into the Bar Lounge, where Pun Pun was seen, nobody in sight. */
const officer = () => {
  const o: any = makeBrain('Nova Aultman', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  know(o, ['Security Office', 'Bar Lounge', 'Aft Primary Hallway', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar Lounge', []);
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.lastSeen = { place: 'Bar Lounge', at: 4900 };
  return { o, w, task: open(o, 'serve_warrant') };
};
const later = (f: any, now: number) => {
  f.o.now = now;
};

{
  const f = officer();
  const first = A.planBeat(f.o, f.task);
  add('just in: it looks from where it stands', [first?.ready, first?.wait], [false, true]);
  later(f, 5000 + 210);
  const walk = A.planBeat(f.o, f.task);
  add('20 seconds, nobody: it walks to the middle of the room, numbered', walk?.act, { tool: 'go_to', place: 'Bar Lounge', middle: true, attempt: 1 });
  add('the sighting is not used up yet', f.w.lookedAt, null);
  A.beatAfterActing(f.o, walk?.act, f.task, true, {});
  const there = A.planBeat(f.o, f.task);
  add('in the middle: it looks from there', [there?.wait, /middle/.test(there?.step ?? '')], [true, true]);
  later(f, 5210 + 50);
  add('5 seconds on: still looking', A.planBeat(f.o, f.task)?.wait, true);
  later(f, 5210 + 110);
  const after = A.planBeat(f.o, f.task);
  add('10 seconds from the middle, nobody: the sighting is used up, and it goes on to the hallways', [f.w.lookedAt, after?.act?.tool], [5320, 'go_to']);
  add('the next walk is not to the middle of the Bar Lounge again', after?.act?.middle, undefined);
}
{
  // The walk to the middle fails twice: it looks from where it is.
  const f = officer();
  later(f, 5210);
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, {});
  const again = A.planBeat(f.o, f.task)?.act;
  add('a walk to the middle that came to nothing: tried once more, numbered 2', again?.attempt, 2);
  A.beatAfterActing(f.o, again, f.task, false, {});
  add('twice: it looks from where it stands', A.planBeat(f.o, f.task)?.wait, true);
}
{
  // A new sighting of the same room starts the legs again.
  const f = officer();
  later(f, 5210);
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, true, {});
  later(f, 5400);
  A.planBeat(f.o, f.task);
  f.w.lastSeen = { place: 'Bar Lounge', at: 5450 };
  f.o.inPlaceSince = 5460;
  later(f, 5470);
  add('a fresh sighting: it looks from where it stands first again', A.planBeat(f.o, f.task)?.wait, true);
}
{
  // Seen at once: no legs, the arrest.
  const f = officer();
  later(f, 5210);
  f.o.peopleInView = [{ handle: 'p2', name: 'Pun Pun', job: '', place: 'Bar Lounge', distance: 9 }];
  add('in sight on the way: it walks up to them', A.planBeat(f.o, f.task)?.act?.tool, 'approach');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
