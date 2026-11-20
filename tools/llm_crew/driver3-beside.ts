// A PDA reply sent in the middle of a haul is kept beside the haul, not in its place (LOGB-02,
// CrewBrain/driver.ts): the haul's result is still heard when it comes. No model is called.
//
//   bun run driver3-beside.ts
const { ROOT, at, janitor, zim } = await import('./fixtures');
const { drive, noteResult } = await import(ROOT + 'driver');
const { syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const HAUL = { tool: 'collect_crate', number: 7740, place: 'Custodial Closet' };
/** A janitor hauling a crate it collected, called to a staff meeting by PDA. */
function hauling() {
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', []);
  b.doing = 'hauling crate #7740 to the Custodial Closet';
  b.lastAct = { key: 'haul', tool: 'collect_crate', at: Date.now(), act: HAUL };
  b.pdaPeople = [{ name: zim.name, job: zim.job }];
  b.summons = { by: zim.name, room: 'Bar', at: 3000, answered: false, walkUps: 0, tries: 0, wording: 0 };
  b.driveAfter = 0;
  syncTasks(b);
  return b;
}
const result = (b: any, tool: string, ok = true) =>
  noteResult(b, { seq: 1, time: '', at: 3100, kind: 'action_result', text: '', details: { tool, ok: ok ? 1 : 0 } } as any);

{
  const b = hauling();
  const issued: any[] = [];
  const step = drive(b, (act: any) => { issued.push(act); return act.tool; }, () => {});
  add('mid-haul, called to a meeting: the PDA reply is sent', [step?.act?.tool, issued.map((it) => it.tool)], ['message', ['message']]);
  add('the haul is still the step waited on', b.lastAct?.tool, 'collect_crate');
  add('the reply is kept beside it', b.sideAct?.tool, 'message');
  b.driveAfter = 0;
  const again = drive(b, (act: any) => { issued.push(act); return act.tool; }, () => {});
  add('while the reply is out, no second one is sent', [again, issued.length], [null, 1]);
  result(b, 'message');
  add('the reply\'s result is heard: the meeting is answered', b.summons?.answered, true);
  add('and the haul is still waited on', [b.sideAct ?? null, b.lastAct?.tool], [null, 'collect_crate']);
  result(b, 'collect_crate');
  add('the haul\'s result is heard when it comes', b.lastAct, null);
}
{
  // With nothing being waited on, a message is the step waited on, as before.
  const b = hauling();
  b.lastAct = null;
  b.doing = null;
  drive(b, (act: any) => act.tool, () => {});
  add('nothing waited on: the message is the step', [b.lastAct?.tool, b.sideAct ?? null], ['message', null]);
}

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
