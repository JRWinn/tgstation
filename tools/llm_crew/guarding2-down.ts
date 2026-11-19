// A stranger in a post who is lying down, out cold or worse, is neither asked why they are there nor
// taken to have refused to answer (SENSE-01). No model is called: this is all decided in code
// (CrewBrain/jobs/guarding.ts).
//
//   bun run guarding2-down.ts
const { ROOT, at, tech, zim } = await import('./fixtures');
const { planGuarding } = await import(ROOT + 'jobs/guarding');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const ann = { handle: 'p7', name: 'Ann Other', job: 'Assistant', in_post: true, belongs: false };
const task = { id: 98, kind: 'stranger', item: ann.name, state: 'open' } as any;

// ---- asked twice and silent while down: no verdict, nothing said, nothing done
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, { ...ann, down: true }]);
  b.strangers[ann.name].asks = 2;
  b.strangers[ann.name].askedAt = 3000;
  at(b, 3400, 'Cargo Bay', [zim, { ...ann, down: true }]);
  add('asked twice, silent and down: not settled', b.strangers[ann.name]?.verdict ?? null, null);
  const plan: any = planGuarding(b, task);
  add('asked twice, silent and down: nothing said or done', [plan?.ready, plan?.say ?? null, plan?.act ?? null], [false, null, null]);
  at(b, 3410, 'Cargo Bay', [zim, ann]);
  add('up again, still silent: put out', b.strangers[ann.name]?.verdict ?? null, 'go');
}

// ---- seen down before anyone asked: not asked
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, { ...ann, down: true }]);
  at(b, 3200, 'Cargo Bay', [zim, { ...ann, down: true }]);
  const plan: any = planGuarding(b, task);
  add('down and never asked: not asked', [plan?.ready, plan?.say ?? null], [false, null]);
  at(b, 3210, 'Cargo Bay', [zim, ann]);
  const up: any = planGuarding(b, task);
  add('up again: asked why they are in here', [up?.ready, !!up?.say], [true, true]);
}

// ---- a stranger standing and silent is still put out, as before
{
  const b = tech();
  at(b, 3000, 'Cargo Bay', [zim, ann]);
  b.strangers[ann.name].asks = 2;
  b.strangers[ann.name].askedAt = 3000;
  at(b, 3400, 'Cargo Bay', [zim, ann]);
  add('asked twice and silent, standing: put out', b.strangers[ann.name]?.verdict ?? null, 'go');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
