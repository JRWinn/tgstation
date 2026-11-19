// When a crew member gives up on work it was told of, case by case. No model is called: syncTasks
// (CrewBrain/tasks.ts) decides, so it can be checked in a second.
//
//   bun run brain-tasks.ts
const { ROOT, janitor, at, know } = await import('./fixtures');
const { addTask } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

/** The state of the told clean task in the Library, or 'gone'. */
const library = (b: any) => b.tasks.find((task: any) => task.kind === 'clean' && task.place === 'Library')?.state ?? 'gone';
const toldMess = () => {
  const b: any = janitor();
  know(b, ['Library']);
  b.now = 3000;
  addTask(b, { kind: 'clean', urgency: 'asked', source: 'told', place: 'Library', askedBy: 'Donna Sholl' });
  return b;
};

// ---- MEM-11: work blocked a long while is not dropped the moment it can go on
{
  const b = toldMess();
  b.blockedPlaces = ['Library'];
  at(b, 3100, 'Central Primary Hallway');
  add('a told mess in a room it cannot get into: blocked', library(b), 'blocked');
  at(b, 27000, 'Central Primary Hallway');
  add('40 minutes on, still blocked: kept', library(b), 'blocked');
  b.blockedPlaces = [];
  at(b, 27100, 'Central Primary Hallway');
  add('the way is clear at last: open, and still on the list', library(b), 'open');
  at(b, 27100 + 17000, 'Central Primary Hallway');
  add('open under 30 minutes since: still on the list', library(b), 'open');
  at(b, 27100 + 18500, 'Central Primary Hallway');
  add('open over 30 minutes since: given up', library(b), 'gone');
}
{
  // Never blocked: given up 30 minutes after it was made, as before.
  const b = toldMess();
  at(b, 3100, 'Central Primary Hallway');
  add('never blocked, 1 second on: open', library(b), 'open');
  at(b, 3000 + 18100, 'Central Primary Hallway');
  add('never blocked, 30 minutes on: given up', library(b), 'gone');
}
{
  // Blocked for over an hour: given up, not kept all round.
  const b = toldMess();
  b.blockedPlaces = ['Library'];
  at(b, 3100, 'Central Primary Hallway');
  at(b, 3100 + 35000, 'Central Primary Hallway');
  add('blocked just under an hour: kept', library(b), 'blocked');
  at(b, 3100 + 36100, 'Central Primary Hallway');
  add('blocked over an hour: given up', library(b), 'gone');
}

// ---- JOBS-02 and CARGO-13: a job may keep open work longer (keepUntil), and a dropped ask is shown
{
  // keepUntil past the half hour: kept until then, then given up.
  const b = toldMess();
  at(b, 3100, 'Central Primary Hallway');
  b.tasks.find((task: any) => task.place === 'Library').keepUntil = 3000 + 18000 + 5000;
  at(b, 3000 + 18100, 'Central Primary Hallway');
  add('keepUntil ahead: kept past the half hour', library(b), 'open');
  at(b, 3000 + 18000 + 4900, 'Central Primary Hallway');
  add('keepUntil still ahead: kept', library(b), 'open');
  at(b, 3000 + 18000 + 5100, 'Central Primary Hallway');
  add('keepUntil passed: given up', library(b), 'gone');
  add('given up on work Donna asked for: the window shows it', /^Gave up on, not done: /.test(b.lastJob?.what ?? ''), true);
}
{
  // keepUntil sooner than the half hour does not cut the half hour short.
  const b = toldMess();
  at(b, 3100, 'Central Primary Hallway');
  b.tasks.find((task: any) => task.place === 'Library').keepUntil = 5000;
  at(b, 3000 + 17000, 'Central Primary Hallway');
  add('keepUntil passed but under 30 minutes old: kept', library(b), 'open');
  add('nothing given up yet: no word in the window', b.lastJob, undefined);
}
{
  // Blocked work with keepUntil is still kept on the blocked limit.
  const b = toldMess();
  b.blockedPlaces = ['Library'];
  at(b, 3100, 'Central Primary Hallway');
  b.tasks.find((task: any) => task.place === 'Library').keepUntil = 4000;
  at(b, 3000 + 25000, 'Central Primary Hallway');
  add('blocked, keepUntil long past: still kept while blocked', library(b), 'blocked');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
