// Who sends for a janitor once the Quartermaster has given the rooms to one technician (CARGO-11,
// CARGO-12). The other leaves it to the keeper only while the keeper is about and fit to do it:
// not while they are away a minute or more, down, or in cuffs. No model is called
// (CrewBrain/jobs/cargo.ts, plan, tidyStep and leftTo).
//
//   bun run cargo-rooms.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { CARGO } = await import(ROOT + 'jobs/cargo');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const MARIA = { handle: 'p4', name: 'Maria Williams', job: 'Cargo Technician' };
let at = 50_000;
const tech = (keeperSeen: any | null, keeperLastSeen: number | null) => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `rooms-${at}`;
  b.post = 'Cargo Bay';
  b.location = 'Cargo Bay';
  at += 5000;
  b.now = at;
  b.hasPda = true;
  b.janitorsOnPda = ['Jan Mopp'];
  b.duties = { 'Maria Williams': ['shuttle', 'rooms'], 'Sam Tech': ['counter'] };
  b.peopleInView = keeperSeen ? [{ ...MARIA, place: 'Cargo Bay', distance: 2, ...keeperSeen }] : [];
  // When the keeper was last seen on their feet: a body lying in view keeps brain.people fresh, not this.
  b.people = new Map([[MARIA.name, { at: b.now }]]);
  b.ableAt = keeperLastSeen === null ? {} : { [MARIA.name]: b.now - keeperLastSeen };
  b.areaMesses = { 'Cargo Bay': ['pool of oil'] };
  b.janitorCalls = {};
  const task = { id: 1, kind: 'tidy', place: 'Cargo Bay', state: 'open', urgency: 'routine', source: 'noticed', createdAt: b.now - 3000 };
  b.tasks = [task];
  return { b, task };
};
const calls = (keeperSeen: any | null, keeperLastSeen: number | null) => {
  const { b, task } = tech(keeperSeen, keeperLastSeen);
  const plan = CARGO.plan(b, task);
  return plan?.act?.tool === 'message' ? plan.act.person : null;
};

add('the keeper in sight: left to them', calls({}, 0), null);
add('the keeper seen half a minute ago: left to them', calls(null, 300), null);
add('the keeper not seen for two minutes (in the Brig): this one sends for the janitor', calls(null, 1200), 'Jan Mopp');
add('the keeper never seen at all: this one sends for the janitor', calls(null, null), 'Jan Mopp');
// CARGO-12: in sight but down or in cuffs is not about.
add('the keeper lying in the bay, last on their feet two minutes ago: this one sends', calls({ down: 1 }, 1200), 'Jan Mopp');
add('the keeper in cuffs in the bay, last free two minutes ago: this one sends', calls({ cuffed: 1 }, 1200), 'Jan Mopp');
add('the keeper just knocked down, on their feet a moment ago: left to them a minute yet', calls({ down: 1 }, 100), null);
{
  // syncTasks notes who is seen on their feet first thing; the rest of it may want more of a brain than this one has.
  const { b } = tech({ down: 1 }, 1200);
  try { CARGO.syncTasks(b); } catch {}
  add('seeing the keeper lying there does not count as seeing them about', b.ableAt[MARIA.name], b.now - 1200);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
