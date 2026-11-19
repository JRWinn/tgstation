// What a crew member remembers of a locker or crate it looked in, case by case. No model is called:
// recordStorage (CrewBrain/memory.ts) decides, so it can be checked in a second.
//
//   bun run memory-storage.ts
const { ROOT, janitor } = await import('./fixtures');
const { recordStorage } = await import(ROOT + 'memory');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const look = (b: any, state: string, names: string[], at = 500) =>
  recordStorage(b, { seq: 0, time: '', at, kind: 'storage_seen', text: '', details: { place: 'Custodial Closet', container: 'janitorial locker', state, contents: names.map((name) => ({ name, count: 1 })) } } as any);
/** What it remembers of the janitorial locker: each item and whether it is there. */
const held = (b: any) => Object.fromEntries(b.places.get('Custodial Closet')?.storage.get('janitorial locker')?.items ?? []);

// ---- MULTI-04: a look at a locker standing open marks nothing it remembered as gone
{
  const b: any = janitor();
  look(b, 'looked', ['mop', 'bucket']);
  add('looked in shut: mop and bucket', held(b), { mop: true, bucket: true });
  look(b, 'open', []);
  add('then seen standing open and empty: still mop and bucket', held(b), { mop: true, bucket: true });
  look(b, 'open', ['soap']);
  add('seen standing open with soap: soap added, nothing marked gone', held(b), { mop: true, bucket: true, soap: true });
  look(b, 'looked', ['soap']);
  add('looked in shut with only soap: mop and bucket gone', held(b), { mop: false, bucket: false, soap: true });
}
{
  const b: any = janitor();
  look(b, 'looked', ['mop']);
  look(b, 'locked', []);
  add('locked: what it remembered is kept', held(b), { mop: true });
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(80)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
