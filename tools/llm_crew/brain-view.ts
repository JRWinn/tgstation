// What a crew member's report says of the people in view, case by case. No model is called:
// describeView (CrewBrain/situation.ts) writes it, so it can be checked in a second.
//
//   bun run brain-view.ts
const { ROOT, janitor, at } = await import('./fixtures');
const { describeView } = await import(ROOT + 'situation');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const peopleLine = (people: any[]) => {
  const b: any = janitor();
  at(b, 3000, 'Bar', people);
  return describeView(b).find((line: string) => line.startsWith('People in view:'));
};

// ---- HOLE-25 (window part): someone down or in cuffs is said to be so
add('standing: as before', peopleLine([{ handle: 'p6', name: 'Bob Hale', job: 'Assistant' }]), 'People in view: Bob Hale, Assistant (p6).');
add('down: lying still', peopleLine([{ handle: 'p6', name: 'Bob Hale', job: 'Assistant', down: 1 }]), 'People in view: Bob Hale, Assistant (p6) (lying still).');
add('in cuffs', peopleLine([{ handle: 'p6', name: 'Bob Hale', job: 'Assistant', cuffed: 1 }]), 'People in view: Bob Hale, Assistant (p6) (in cuffs).');
add('down and in cuffs', peopleLine([{ handle: 'p6', name: 'Bob Hale', job: 'Assistant', down: 1, cuffed: 1 }]), 'People in view: Bob Hale, Assistant (p6) (lying still, in cuffs).');
add('down: 0 is up', peopleLine([{ handle: 'p6', name: 'Bob Hale', job: 'Assistant', down: 0, cuffed: 0 }]), 'People in view: Bob Hale, Assistant (p6).');

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(60)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
