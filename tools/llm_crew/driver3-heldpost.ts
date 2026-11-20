// A step that failed at a body's own post does not keep it from walking back to that post (DRV-12's
// hold on walks back to a room, CrewBrain/driver.ts nextStep). A cargo technician whose shuttle call
// was refused at the counter, then looked in on the Delivery Office, goes back to the Cargo Bay at
// once; a walk to any other room where a step failed is still held. No model is called.
//
//   bun run driver3-heldpost.ts
const { ROOT, tech, at, know } = await import('./fixtures');
const { nextStep } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

{
  const b: any = tech();
  know(b, ['Cargo Bay', 'Cargo Lobby', 'Delivery Office']);
  // Back from a look in on the Delivery Office, with the shuttle call it made at the counter held back.
  at(b, 3400, 'Delivery Office', []);
  b.heldAt = [{ place: 'Cargo Bay', until: Date.now() + 100_000 }];
  const step: any = nextStep(b);
  add('a step held at its post: it still walks back to the post', [step?.act?.tool, step?.act?.place], ['go_to', 'Cargo Bay']);
}
{
  const b: any = tech();
  know(b, ['Cargo Bay', 'Cargo Lobby', 'Delivery Office']);
  at(b, 3400, 'Delivery Office', []);
  // The same, but its post is somewhere else: the Cargo Bay is now just a room a step failed in.
  b.post = 'Cargo Lobby';
  b.heldAt = [{ place: 'Cargo Bay', until: Date.now() + 100_000 }];
  const step: any = nextStep(b);
  add('a room that is not its post, with a step held there: no walk to it', step?.act?.tool === 'go_to' && step?.act?.place === 'Cargo Bay', false);
}

let bad = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - bad} of ${cases.length} cases right`);
process.exit(bad ? 1 : 0);
