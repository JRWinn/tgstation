// A door opened by hand for an officer that asked to be let in (ARR-06, the window's part):
// letInStep and beatAfterActing in CrewBrain/jobs/arrests.ts. The Captain swipes the door open
// with their own ID: no crew member holds it, so doorHeld stays false. The officer, standing at
// that door and seeing it open (brain.atDoorOpen, sent by the server as at_door_open), walks in.
// Only the door it asked at, only once it has asked. No model is called and no station is simulated.
//
//   bun run arrests3-opendoor.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PDA = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
const open = (o: any, kind: string) => o.tasks.find((task: any) => task.kind === kind && task.state !== 'done');

/** An officer at the Bar's door, shut out of the Bar where Pun Pun was seen, having asked the Captain. */
const officer = (asked: string[] = ['Zim Fire']) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = PDA;
  o.hasPda = true;
  know(o, ['Security Office', 'Bar', 'Central Primary Hallway', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Central Primary Hallway', []);
  o.blockedPlaces = ['Bar'];
  o.atDoorOf = 'Bar';
  A.syncBeat(o);
  const w = A.beatOf(o).warrants[0];
  w.toldAt = 4990;
  w.lastSeen = { place: 'Bar', at: 4990 };
  w.shutOut = { place: 'Bar', at: 4995, keepers: ['Zim Fire'], asked, askedAt: 4995, door: 'Bar', doorTries: 0 };
  return { o, w, task: open(o, 'serve_warrant') };
};

{
  const f = officer();
  const before = A.planBeat(f.o, f.task);
  add('asked, at the door, the door shut: it waits', [before?.ready, before?.wait], [false, true]);
  f.o.atDoorOpen = true;
  const plan = A.planBeat(f.o, f.task);
  add('the door it asked at is opened by hand: it walks in, numbered', plan?.act, { tool: 'go_to', place: 'Bar', attempt: 1 });
  add('and nobody is told that nobody opened it', A.takeOutcomes(f.o), []);
  A.beatAfterActing(f.o, plan?.act, f.task, false, {});
  add('the walk came to nothing (it shut): the next is numbered 2', A.planBeat(f.o, f.task)?.act, { tool: 'go_to', place: 'Bar', attempt: 2 });
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, {});
  A.beatAfterActing(f.o, A.planBeat(f.o, f.task)?.act, f.task, false, {});
  const after = A.planBeat(f.o, f.task);
  add('three walks came to nothing: it waits as before, no tight loop', [after?.ready, after?.wait], [false, true]);
}
{
  // Not asked yet: an open door into a locked room is no invitation.
  const f = officer([]);
  f.o.atDoorOpen = true;
  const plan = A.planBeat(f.o, f.task);
  add('open, but it has asked nobody: it knocks, it does not walk in', plan?.act?.tool, 'knock');
  A.beatAfterActing(f.o, plan?.act, f.task, true, {});
  add('then it asks, and still does not walk in', A.planBeat(f.o, f.task)?.act?.tool, 'message');
}
{
  // Open, but it is not standing at that door.
  const f = officer();
  f.o.atDoorOf = null;
  f.w.shutOut.doorTries = 2;
  f.o.atDoorOpen = true;
  const plan = A.planBeat(f.o, f.task);
  add('open, but not at that door: no walk in', plan?.act?.tool === 'go_to', false);
}
{
  // A crew member holding the door is still the way in.
  const f = officer();
  f.o.doorHeld = true;
  f.o.doorHeldOut = false;
  f.o.doorHeldFor = 'Bar';
  add('a door held for it: still the way in, as before', A.planBeat(f.o, f.task)?.act, { tool: 'go_to', place: 'Bar' });
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
