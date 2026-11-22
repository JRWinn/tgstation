// A step of its work that failed is waited out before the body walks back to it (DRV-12,
// CrewBrain/driver.ts): the job's hold runs at least as long as the failed clean's, and no walk is
// offered back to a room where a step has just failed, for whichever task, until that step is let
// off. No model is called.
//
//   bun run driver3-held.ts
const { ROOT, janitor, at } = await import('./fixtures');
const { nextStep, noteResult } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const MESS = [{ name: 'pool of oil', count: 1, kind: 'mess' }];
/** A janitor with soap and a mess in the Bar, standing in the Bar. */
function inTheBar() {
  const b: any = janitor('soap');
  b.messPlaces = ['Bar'];
  b.workablePlaces = ['Bar'];
  b.cleanableMesses = ['pool of oil'];
  b.pendingSpeakers = new Set();
  at(b, 3100, 'Bar', [], MESS);
  return b;
}
const failed = (b: any, step: any) => {
  b.lastAct = { key: step.key, tool: step.act.tool, at: Date.now(), act: step.act, task: step.task };
  noteResult(b, { seq: 1, time: '', at: 3110, kind: 'action_result', text: 'You could not get to it.', details: { tool: step.act.tool, ok: 0 } } as any);
};

{
  const b = inTheBar();
  const step: any = nextStep(b);
  add('the step in the Bar is the clean', step?.act?.tool, 'clean');
  // The clean has failed once already (wetting the mop at a sink on the way, say): this is its second.
  b.failures.set(step.key, { count: 1, until: 0 });
  failed(b, step);
  const clean = b.failures.get(step.key)?.until ?? 0;
  const job = b.failures.get(`job:${step.task}`)?.until ?? 0;
  add('the clean is held back about 40 seconds', clean - Date.now() > 35000, true);
  add('the job is held back no less long than the clean', job >= clean, true);
  add('the Bar is noted as a room a step failed in', (b.heldAt ?? []).map((it: any) => it.place), ['Bar']);
  at(b, 3200, 'Central Primary Hallway');
  const away: any = nextStep(b);
  add('out in the hallway: no walk back to the Bar while the clean is held back', away?.act?.tool === 'go_to' && away?.act?.place === 'Bar', false);
  // The job's own hold let off (as it was, 20 seconds before the clean's): the walk is still held for the room.
  const jobHold = b.failures.get(`job:${step.task}`);
  jobHold.until = 0;
  const still: any = nextStep(b);
  add('the job let off but the clean still held: still no walk back to the Bar', still?.act?.tool === 'go_to' && still?.act?.place === 'Bar', false);
  // Both holds run out.
  for (const it of b.failures.values()) it.until = 0;
  for (const it of b.heldAt ?? []) it.until = 0;
  const back: any = nextStep(b);
  add('once they are let off: it walks back to the Bar', [back?.act?.tool, back?.act?.place], ['go_to', 'Bar']);
}
{
  // A PDA message that fails names no room: the walk back is not held for it.
  const b = inTheBar();
  const task = b.tasks[0];
  b.lastAct = { key: 'msg', tool: 'message', at: Date.now(), act: { tool: 'message', person: 'Zim Fire', text: 'x' }, task: task.id };
  noteResult(b, { seq: 1, time: '', at: 3110, kind: 'action_result', text: 'No answer.', details: { tool: 'message', ok: 0 } } as any);
  add('a failed PDA message notes no room', b.heldAt ?? [], []);
}
{
  // An order from a head is gone on with whatever failed in its room.
  const b = inTheBar();
  const step: any = nextStep(b);
  b.tasks[0].urgency = 'emergency';
  failed(b, step);
  add('a failed step of an order from a head notes no room', b.heldAt ?? [], []);
}

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
