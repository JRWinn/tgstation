// The Quartermaster answering a knock at its office door (LOGB-04), case by case. No model is
// called: this is all decided in code (CrewBrain/jobs/quartermaster.ts).
//
//   bun run qm-knock.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const OFFICE = "Quartermaster's Office";
const knockTasks = (b: any) => b.tasks.filter((task: any) => task.kind === 'qm_knock' && task.state !== 'done').length;

function quartermaster() {
  const b: any = makeBrain('Ada Finch', 'Quartermaster');
  b.office = OFFICE;
  b.location = OFFICE;
  b.staffPost = 'Cargo Bay';
  b.now = 5000;
  return b;
}

// ---- the body is seen in the bay before its walk's result comes in
{
  const b = quartermaster();
  b.knockAt = { room: OFFICE, at: 5000, inside: false };
  syncTasks(b);
  add('a knock at its office: it goes to answer it', knockTasks(b), 1);
  b.now = 5050;
  b.location = 'Cargo Bay';
  syncTasks(b);
  add('seen in the bay: the knock is answered', [knockTasks(b), b.knockAt, b.ledger?.cameOutAt], [0, null, 5050]);
  b.now = 5200;
  b.location = OFFICE;
  syncTasks(b);
  add('back in its office within the minute: the same knock does not send it out again', knockTasks(b), 0);
}
// ---- a knock gone stale while it is still in its office
{
  const b = quartermaster();
  b.knockAt = { room: OFFICE, at: 5000, inside: false };
  syncTasks(b);
  b.now = 5000 + 700;
  syncTasks(b);
  add('stale, still in its office: no answer, and it is not taken to have come out', [knockTasks(b), b.ledger?.cameOutAt ?? 0], [0, 0]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
