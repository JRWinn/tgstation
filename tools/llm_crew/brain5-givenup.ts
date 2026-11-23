// The owner's answer MEM-11 A (with JOBS-02 and CARGO-13): when work someone asked for is given up
// (blocked an hour, or open past its time limit), whoever asked is sent word once, face to face if
// in view, else by PDA (CrewBrain/tasks.ts, syncTasks and tellGivenUp). No model is called.
//
//   bun run brain5-givenup.ts
const { ROOT, at, janitor, know, zim, donna } = await import('./fixtures');
const { addTask } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const mine = (b: any) => b.toTell.map((tell: any) => [tell.to, tell.line, !!tell.byPda]);

{
  // A told mess in a room it cannot get into: blocked, then given up after an hour.
  const b: any = janitor();
  know(b, ['Library']);
  at(b, 3000, 'Central Primary Hallway', []);
  addTask(b, { kind: 'clean', place: 'Library', urgency: 'asked', source: 'told', askedBy: 'Donna Sholl' });
  b.blockedPlaces = ['Library'];
  at(b, 3100, 'Central Primary Hallway', []);
  add('blocked: kept, nobody told yet', [b.tasks.length, b.toTell.length], [1, 0]);
  at(b, 3100 + 30000, 'Central Primary Hallway', []);
  add('blocked fifty minutes: still kept', b.tasks.length, 1);
  at(b, 3100 + 36100, 'Central Primary Hallway', []);
  add('blocked over an hour: given up', b.tasks.length, 0);
  add('Donna is sent word by PDA, once', mine(b), [['Donna Sholl', 'Donna, I could not get to the mess in the Library.', true]]);
  at(b, 3100 + 36200, 'Central Primary Hallway', []);
  add('and not again', b.toTell.length, 1);
}
{
  // Open past its time, with whoever asked in view: said face to face.
  const b: any = janitor();
  know(b, ['Library']);
  at(b, 3000, 'Central Primary Hallway', []);
  addTask(b, { kind: 'clean', place: 'Library', urgency: 'asked', source: 'told', askedBy: 'Zim Fire' });
  at(b, 3000 + 18100, 'Central Primary Hallway', [zim]);
  add('open half an hour: given up', b.tasks.length, 0);
  add('Zim is in view: told face to face', mine(b), [['Zim Fire', 'Zim, I could not get to the mess in the Library.', false]]);
}
{
  // A crate errand for its head, dropped: worded for a crate.
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', []);
  const task = addTask(b, { kind: 'collect', place: 'Custodial Closet', item: '12', urgency: 'asked', source: 'asked', askedBy: 'Zim Fire' });
  task.state = 'open';
  at(b, 3000 + 18100, 'Central Primary Hallway', []);
  add('a crate errand given up: Zim told by PDA', mine(b), [['Zim Fire', 'Zim, I could not collect crate #12 from cargo.', true]]);
}
{
  // Work nobody asked for is dropped with no word.
  const b: any = janitor();
  know(b, ['Library']);
  at(b, 3000, 'Central Primary Hallway', []);
  addTask(b, { kind: 'clean', place: 'Library', urgency: 'routine', source: 'noticed' });
  at(b, 3000 + 18100, 'Central Primary Hallway', [donna]);
  add('nobody asked: no word', b.toTell.length, 0);
}
{
  // No PDA and whoever asked not in view: kept to say when they are next seen.
  const b: any = janitor();
  b.hasPda = false;
  know(b, ['Library']);
  at(b, 3000, 'Central Primary Hallway', []);
  addTask(b, { kind: 'clean', place: 'Library', urgency: 'asked', source: 'told', askedBy: 'Donna Sholl' });
  at(b, 3000 + 18100, 'Central Primary Hallway', []);
  add('no PDA: to be said face to face', mine(b), [['Donna Sholl', 'Donna, I could not get to the mess in the Library.', false]]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
