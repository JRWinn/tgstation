// What a janitor does when its hands are full and it wants something more, case by case
// (DESK-10, LOGA-05). No model is called: this is all decided in code (CrewBrain/jobs/janitor.ts).
//
//   bun run janitor-hands.ts
const { ROOT, janitor, know } = await import('./fixtures');
const { JANITOR } = await import(ROOT + 'jobs/janitor');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const store = (b: any, room: string, items: string[]) =>
  b.places.get(room).storage.set('locker', { items: new Map(items.map((item) => [item, true])) });

// ---- DESK-10: a mop and soap in hand, a bucket known, a mess elsewhere
function mopAndSoap() {
  const b: any = janitor(null);
  b.stowed = [];
  b.holding = ['mop', 'soap'];
  b.cleaningTool = 'mop';
  b.wantsBucket = true;
  know(b, ['Bar', 'Custodial Closet']);
  store(b, 'Custodial Closet', ['bucket']);
  const task = { id: 50, kind: 'clean', place: 'Bar', state: 'open', urgency: 'asked', source: 'told' };
  b.tasks.push(task);
  return { b, task };
}
{
  const { b, task } = mopAndSoap();
  add('a bucket known: it goes for the bucket first', JANITOR.plan(b, task)?.act, { tool: 'pick_up', item: 'bucket' });
  JANITOR.afterActing(b, { tool: 'pick_up', item: 'bucket' }, task, false);
  add('the bucket could not be picked up: it sets off for the mess', JANITOR.plan(b, task)?.act, { tool: 'go_to', place: 'Bar' });
}
{
  const { b, task } = mopAndSoap();
  JANITOR.afterActing(b, { tool: 'pick_up', item: 'soap' }, task, false);
  add('some other pick-up failing leaves the bucket step', JANITOR.plan(b, task)?.act, { tool: 'pick_up', item: 'bucket' });
}

// ---- LOGA-05: a rag in each hand, a mop known: one rag goes down first
function twoRags(holding: string[]) {
  const b: any = janitor(null);
  b.stowed = [];
  b.holding = holding;
  b.cleaningTool = 'damp rag';
  b.poorTool = true;
  know(b, ['Custodial Closet']);
  store(b, 'Custodial Closet', ['mop']);
  return JANITOR.plan(b, { id: 51, kind: 'supplies', state: 'open', urgency: 'asked', source: 'own' } as any)?.act;
}
add('two rags: one is put down for the mop', twoRags(['damp rag', 'damp rag']), { tool: 'put_down', item: 'damp rag' });
add('one rag and a free hand: it takes the mop', twoRags(['damp rag']), { tool: 'pick_up', item: 'mop' });

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
