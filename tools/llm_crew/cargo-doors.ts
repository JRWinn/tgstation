// In or out, when someone asks a cargo technician about the door of its post (PARSE-08). Seen, it
// goes by where they stand; by PDA, or out of sight, by the words, never the bare word "out".
// No model is called (CrewBrain/jobs/cargo.ts, overhears and readsMessage).
//
//   bun run cargo-doors.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const JAN = { handle: 'p3', name: 'Jan Mopp', job: 'Janitor' };
let at = 10_000;
const tech = (people: any[]) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `doors-${at}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  at += 5000;
  b.now = at;
  b.closedRooms = ['Cargo Bay', 'Mining Office'];
  b.roomsThrough = { 'Mining Office': 'Cargo Bay' };
  b.peopleInView = people;
  b.pdaPeople = [{ name: JAN.name, job: JAN.job }];
  b.toTell = [];
  b.heldCrates = [];
  b.doorAsks = [];
  return b;
};
const asked = (b: any) => (b.doorAsks ?? []).map((ask: any) => !!ask.out);
const aloud = (people: any[], message: string) => {
  const b = tech(people);
  CARGO.overhears(b, { seq: 1, time: '', at: b.now, kind: 'heard', text: '', details: { speaker: JAN.name, message, said_to: 'me' } });
  return asked(b);
};
const byPda = (message: string) => {
  const b = tech([]);
  CARGO.readsMessage(b, JAN.name, message, b.now, JAN.job);
  return asked(b);
};
const inLobby = [{ ...JAN, place: 'Cargo Lobby', distance: 2 }];
const inBay = [{ ...JAN, place: 'Cargo Bay', in_post: 1, distance: 2 }];

for (const line of ["I'm locked out, can you open the door", 'donna im out here at the door, let me in', 'can you open the door so i can get my crate out', 'let me in']) {
  add(`in the lobby: "${line}" wants in`, aloud(inLobby, line), [false]);
  add(`by PDA: "${line}" wants in`, byPda(line), [false]);
}
for (const line of ['i want to leave, open the door', 'im done, can you open the door', 'can I leave? the door is shut', 'let me leave', 'get me out of here']) {
  add(`in the bay: "${line}" wants out`, aloud(inBay, line), [true]);
  add(`by PDA: "${line}" wants out`, byPda(line), [true]);
}
add('in the bay: "let me into the Mining Office" wants in, further in', aloud(inBay, 'let me into the Mining Office door'), [false]);
add('in the bay: "I\'m already at the door; step aside" is no ask', aloud(inBay, "I'm already at the door; step aside"), []);
add('the crew\'s own line, "I am done in the Cargo Bay ... let me out", by PDA', byPda('I am done in the Cargo Bay. Could you let me out, please?'), [true]);

// LOGA-04: a knock from inside is pinned only on someone let in before it.
{
  const { noteLetIn, clearExpected } = await import(ROOT + 'expected');
  const knocked = (letInAt: number) => {
    clearExpected();
    const b = tech(inBay);
    b.knockAt = { room: 'Cargo Bay', at: b.now - 100, inside: true };
    noteLetIn('Cargo Bay', JAN.name, 'Cargo Bay', 'Maria Williams', b.now + letInAt);
    CARGO.syncTasks(b);
    return b.tasks.filter((t: any) => t.kind === 'door' && t.state !== 'done').map((t: any) => t.item);
  };
  add('Jan let in before the knock, knocking from inside: the door is opened for Jan', knocked(-200), [JAN.name]);
  add('Jan let out and let back in since the knock: the old knock is not Jan\'s', knocked(-50), []);
  clearExpected();
}

// LOGA-04 (rest): a workmate letting someone out of a room spends every older knock on it, for
// every technician at the post; a knock after that still stands.
{
  const { noteLetIn, noteLetOut, lastLetOutAt, clearExpected } = await import(ROOT + 'expected');
  const knockedThenOut = (knockAfter: number) => {
    clearExpected();
    const b = tech(inBay);
    noteLetIn('Cargo Bay', JAN.name, 'Cargo Bay', 'Maria Williams', b.now - 500);
    // Maria lets Jan out at now - 100, out of the Cargo Bay.
    noteLetOut('Cargo Bay', JAN.name, undefined, b.now - 100, 'Cargo Bay');
    b.knockAt = { room: 'Cargo Bay', at: b.now - 100 + knockAfter, inside: true };
    CARGO.syncTasks(b);
    return [b.knockAt ? 'knock stands' : 'knock spent', b.tasks.filter((t: any) => t.kind === 'door' && t.state !== 'done').length];
  };
  add('a knock from before a workmate let Jan out is spent: no door for it', knockedThenOut(-50), ['knock spent', 0]);
  add('a knock after the let-out still stands', knockedThenOut(20)[0], 'knock stands');
  clearExpected();
  noteLetOut('Cargo Bay', JAN.name, undefined, 500, 'Mining Office');
  add('the let-out is stamped on the room it was out of', lastLetOutAt('Cargo Bay', 'Mining Office'), 500);
  add('and not on another', lastLetOutAt('Cargo Bay', 'Cargo Bay'), null);
  noteLetOut('Cargo Bay', JAN.name, 'Cargo Bay');
  add('seen to have gone, with no time given, stamps nothing', lastLetOutAt('Cargo Bay', 'Cargo Bay'), null);
  clearExpected();
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
