// SEC-07 (the owner's answer B, window part): a crew member the server says is stuck in handcuffs
// tells its own head once, face to face, at once though it is held (CrewBrain/tasks.ts,
// noteStuckInCuffs; the quick-tell path in driver.ts). Never by PDA: a player in cuffs cannot work
// a PDA's screen. A head not in view is told when it comes into view. No model is called.
//
//   bun run brain5-cuffs.ts
const { ROOT, at, janitor, zim } = await import('./fixtures');
const { noteStuckInCuffs, STUCK_IN_CUFFS_LINE } = await import(ROOT + 'tasks');
const { drive, lineSaid } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const stuck = { seq: 1, time: '', at: 3100, kind: 'knowledge', text: 'You cannot get the handcuffs off.', details: { stuck_in_cuffs: true } } as any;
const mine = (b: any) => b.toTell.map((tell: any) => [tell.to, tell.line, !!tell.byPda]);
const freed = { ...stuck, text: 'You are free to go.', details: { set_free: true } };
/** One turn of the driver for a body held by the arm, as the server keeps one in cuffs: what it said and sent. */
function heldTurn(b: any) {
  const said: string[] = [];
  const sent: string[] = [];
  b.inHand = true;
  b.awake = true;
  drive(b, (action: any) => { sent.push(action.tool); return null; }, (line: string) => said.push(line));
  return { said, sent };
}

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
  add('its head not in view: never by PDA, kept to say face to face', mine(b), [['Zim Fire', `Zim, ${STUCK_IN_CUFFS_LINE}`, false]]);
  add('its head not in view, held: nothing said or sent', heldTurn(b), { said: [], sent: [] });
  at(b, 3600, 'Bar', [zim]);
  add('its head comes into view a minute on, still held: said at once', heldTurn(b), { said: [`Zim, ${STUCK_IN_CUFFS_LINE}`], sent: [] });
  add('waits on the line being heard to go out, for its head', b.mustSayFor?.to, 'Zim Fire');
  lineSaid(b, b.mustSayFor);
  add('heard to go out: dropped', b.toTell.length, 0);
}
{
  // SEC-07 follow-up: in cuffs the server keeps the body held (in_hand) the whole time.
  const b: any = janitor();
  at(b, 3000, 'Bar', [zim]);
  noteStuckInCuffs(b, stuck);
  add('its head in view, held: said at once though held', heldTurn(b), { said: [`Zim, ${STUCK_IN_CUFFS_LINE}`], sent: [] });
}
{
  const b: any = janitor();
  at(b, 3000, 'Bar', []);
  b.pdaPeople = [{ name: 'Zim Fire', job: 'Head of Personnel' }];
  noteStuckInCuffs(b, stuck);
  noteStuckInCuffs(b, freed);
  add('cuffs taken off before its head came by: the word is dropped unsaid', [b.toTell.length, b.cuffsToldAt ?? null], [0, null]);
  at(b, 3600, 'Bar', [zim]);
  add('then its head comes by: nothing said', heldTurn(b).said, []);
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
  add('a head tells the Captain, face to face when seen', mine(b), [['Ada Stone', `Ada, ${STUCK_IN_CUFFS_LINE}`, false]]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
