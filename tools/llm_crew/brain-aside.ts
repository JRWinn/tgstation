// Asking whoever a hauled crate caught on to step aside, case by case. No model is called: this is
// all decided in code (CrewBrain/driver.ts), so it can be checked in a second.
//
//   bun run brain-aside.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const { drive } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const monte = { handle: 'p5', name: 'Monte Mcmullen', job: 'Cargo Technician' };

/** A technician going back for its crate after losing its grip, with Monte beside the crate. */
function regripping(people: any[] = [monte]) {
  const b: any = makeBrain('Joi Seelig', 'Cargo Technician');
  b.post = 'Cargo Bay';
  know(b, ['Cargo Bay', 'Cargo Lobby']);
  at(b, 3000, 'Cargo Bay', people);
  b.walking = true;
  b.lastAct = { key: 'haul', tool: 'haul', at: Date.now(), act: { tool: 'haul' } };
  b.inTheWay = { handle: 'p5', at: Date.now() };
  return b;
}
const said: { line: string; exact: boolean | undefined }[] = [];
const speak = (line: string, _needs?: RegExp, _sayIf?: () => boolean, exact?: boolean) => said.push({ line, exact });
const issue = () => 'none';

// ---- KNB-13: the ask is said while the body is still busy taking the crate up again
{
  said.length = 0;
  const b = regripping();
  const step = drive(b, issue, speak);
  add('busy regripping, Monte in view: the ask is made', step?.key, 'step-aside');
  add('it is said word for word', said, [{ line: 'Excuse me, Monte, could you step aside, please? I need to get this past you.', exact: true }]);
  add('the note of who was in the way is used up', b.inTheWay, null);
  said.length = 0;
  drive(b, issue, speak);
  add('it is not asked twice', said.length, 0);
  // Monte is caught on again: noted again, but the ask is not repeated straight away.
  b.inTheWay = { handle: 'p5', at: Date.now() };
  drive(b, issue, speak);
  add('caught on again at once: not asked again straight away', said.length, 0);
}
{
  said.length = 0;
  const b = regripping([]);
  drive(b, issue, speak);
  add('Monte out of view: nobody is asked', said.length, 0);
}
{
  said.length = 0;
  const b = regripping();
  b.inTheWay = { handle: 'p5', at: Date.now() - 60000 };
  drive(b, issue, speak);
  add('a note a minute old: nobody is asked', said.length, 0);
}
{
  said.length = 0;
  const b = regripping();
  b.mustSay = 'something else';
  drive(b, issue, speak);
  add('with a line already waiting to be said: not asked over it', said.length, 0);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
