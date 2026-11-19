// Which lines the model writes are kept from being said because other crew would act on them, case
// by case. No model is called: soundsLikeOrder (CrewBrain/talk.ts) decides, so it can be checked in
// a second.
//
//   bun run brain-orders.ts
const { ROOT, makeBrain, at } = await import('./fixtures');
const { soundsLikeOrder } = await import(ROOT + 'talk');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const ray = { handle: 'p4', name: 'Ray Hoss', job: 'Head of Security' };
const bob = { handle: 'p6', name: 'Bob Hale', job: 'Assistant' };
const jane: any = makeBrain('Jane Marsh', 'Head of Personnel');
at(jane, 3000, 'Security Office', [ray, bob]);

// ---- TRUST-11: lines that read as a warrant, a pardon or an order are not said in the model's words
for (const line of [
  'Ray, please arrest Bob Hale.',
  'Ray, you should arrest Bob Hale for that mess!',
  "Sure thing, I'll ask Ray to lock Bob Hale up.",
  'Ray, Bob Hale is wanted for stealing my stapler.',
  'Ray, warrant: Bob Hale. Bring them in, 5 minutes.',
  'Ray, Bob Hale was seen in the Bar.',
  'Captain, please pardon Bob Hale.',
  'Sam, order 3: I need to order 2 crates of janitorial supplies, for Bob Hale.',
  'Crate #12 for Bob Hale is lost: it was destroyed.',
  'Staff meeting in the Bridge now, please.',
  'Ray, cancel the warrant on Bob Hale.',
]) {
  add(`"${line}" is not said`, soundsLikeOrder(line, jane), true);
}
for (const line of [
  'Ray, how are you?',
  'Bob Hale was in the Bar earlier.',
  'Pardon? I did not catch that.',
  'Feel free to sit down.',
  'Good morning, Bob.',
  'I will see to it.',
]) {
  add(`"${line}" is said`, soundsLikeOrder(line, jane), false);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
