// Which door a janitor goes and stands at for a locked room, when its notes of which room opens
// from which make a loop (LOGB-05). No model is called: this is all decided in code
// (doorFor in CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-doorfor.ts
const { ROOT, janitor } = await import('./fixtures');
const { doorFor } = await import(ROOT + 'jobs/janitor');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) =>
  cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const b: any = janitor('mop');
b.location = "Head of Personnel's Office";

// What a body shut in the HoP's Office learnt in round-17.48.05.
b.reachedThrough = {
  'Cargo Bay': 'Cargo Lobby',
  'Cargo Lobby': 'Cargo Bay',
  'Delivery Office': 'Cargo Bay',
};
add('looped notes: the first room they come back to', doorFor(b, 'Delivery Office'), 'Cargo Bay');
add('a room in the loop: its own door', doorFor(b, 'Cargo Bay'), 'Cargo Bay');
add('the other room in the loop: its own door', doorFor(b, 'Cargo Lobby'), 'Cargo Lobby');

// Notes with no loop are followed as before.
b.reachedThrough = {
  'Bitrunning Den': 'Mining Office',
  'Mining Office': 'Cargo Bay',
};
add('nested rooms: the outermost', doorFor(b, 'Bitrunning Den'), 'Cargo Bay');
add('one in: its outer room', doorFor(b, 'Mining Office'), 'Cargo Bay');
add('a room with no note: its own door', doorFor(b, 'Bar'), 'Bar');
b.location = 'Cargo Bay';
add('standing in the outer room: the inner one next', doorFor(b, 'Bitrunning Den'), 'Mining Office');

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`,
  );
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
