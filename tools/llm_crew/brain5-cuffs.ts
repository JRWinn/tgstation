// SEC-07 (the owner's answer B, window part): a crew member the server says is stuck in handcuffs
// tells its own head once, face to face if in view, else by PDA (CrewBrain/tasks.ts,
// noteStuckInCuffs). No model is called.
//
//   bun run brain5-cuffs.ts
const { ROOT, at, janitor, zim } = await import('./fixtures');
const { noteStuckInCuffs, STUCK_IN_CUFFS_LINE } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const stuck = { seq: 1, time: '', at: 3100, kind: 'knowledge', text: 'You cannot get the handcuffs off.', details: { stuck_in_cuffs: true } } as any;
const mine = (b: any) => b.toTell.map((tell: any) => [tell.to, tell.line, !!tell.byPda]);

{
  // The janitor's head is the Head of Personnel (Zim, in the fixtures).
  const b: any = janitor();
  at(b, 3000, 'Bar', [zim]);
  noteStuckInCuffs(b, stuck);
  add('its head in view: told face to face', mine(b), [['Zim Fire', `Zim, ${STUCK_IN_CUFFS_LINE}`, false]]);
  noteStuckInCuffs(b, stuck);
  add('said once', b.toTell.length, 1);
}
{
  const b: any = janitor();
  at(b, 3000, 'Bar', []);
  b.pdaPeople = [{ name: 'Zim Fire', job: 'Head of Personnel' }];
  noteStuckInCuffs(b, stuck);
  add('its head not in view: told by PDA', mine(b), [['Zim Fire', STUCK_IN_CUFFS_LINE, true]]);
}
{
  const b: any = janitor();
  at(b, 3000, 'Bar', []);
  b.pdaPeople = [];
  noteStuckInCuffs(b, stuck);
  add('no head to be found: nobody told, and it may say so later', [b.toTell.length, b.cuffsToldAt ?? null], [0, null]);
}
{
  const b: any = janitor();
  at(b, 3000, 'Bar', [zim]);
  noteStuckInCuffs(b, { ...stuck, details: {} });
  add('not stuck: nothing said', b.toTell.length, 0);
}
{
  // A head of staff tells the Captain.
  const { makeBrain } = await import('./fixtures');
  const b: any = makeBrain('Zim Fire', 'Head of Personnel');
  at(b, 3000, 'Bridge', []);
  b.pdaPeople = [{ name: 'Ada Stone', job: 'Captain' }, { name: 'Zim Fire', job: 'Head of Personnel' }];
  noteStuckInCuffs(b, stuck);
  add('a head tells the Captain', mine(b), [['Ada Stone', STUCK_IN_CUFFS_LINE, true]]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
