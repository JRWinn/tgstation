// A freight step that keeps failing is put off a while (JOBS-04): three failures running block the
// task for three minutes, so the rest of the work goes on, and a mail crate that cannot be emptied
// does not keep the shuttle in the dock. One failure and then a success blocks nothing.
// No model is called (CrewBrain/jobs/freight.ts, afterFreight and syncFreight).
//
//   bun run cargo-freight.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { afterFreight, syncFreight, freightInHand } = await import(ROOT + 'jobs/freight');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const tech = () => {
  const b: any = makeBrain('Sam Tech', 'Cargo Technician');
  b.id = `freight-${Math.random()}`;
  b.now = 10_000;
  b.tasks = [];
  b.mailTold = {};
  b.hasPda = true;
  b.orderPending = false;
  b.freight = { shuttleDocked: true, toUnload: 0, mailCrate: true, emptyCrates: 0, misplaced: 0, mailFor: [] };
  return b;
};
const NO_ROOM = 'You have no room in your bag for the mail in the mail crate.';
{
  const b = tech();
  syncFreight(b);
  const mail = b.tasks.find((t: any) => t.kind === 'mail');
  add('a mail crate in the bay: a mail task, in hand', [!!mail, freightInHand(b)], [true, true]);
  add('and the shuttle is held for it', b.tasks.some((t: any) => t.kind === 'send' && t.state !== 'done'), false);
  for (let i = 0; i < 3; i++) afterFreight(b, { tool: 'collect_mail' }, mail, false, NO_ROOM);
  syncFreight(b);
  add('three failures running: the mail task is blocked', mail.state, 'blocked');
  add('and says why', /no room in your bag/.test(mail.blockedOn ?? ''), true);
  add('the only freight in hand is sending the shuttle back', b.tasks.filter((t: any) => t.state === 'open').map((t: any) => t.kind), ['send']);
  add('and the shuttle may go back', b.tasks.some((t: any) => t.kind === 'send' && t.state === 'open'), true);
  b.now += 1900;
  syncFreight(b);
  add('three minutes on: the mail task is open again', mail.state, 'open');
}
{
  const b = tech();
  b.freight = { shuttleDocked: true, toUnload: 2, mailCrate: false, emptyCrates: 0, misplaced: 0, mailFor: [] };
  syncFreight(b);
  const unload = b.tasks.find((t: any) => t.kind === 'unload');
  afterFreight(b, { tool: 'unload' }, unload, false, 'You could not get there.');
  afterFreight(b, { tool: 'unload' }, unload, true);
  afterFreight(b, { tool: 'unload' }, unload, false, 'You could not get there.');
  afterFreight(b, { tool: 'unload' }, unload, false, 'You could not get there.');
  syncFreight(b);
  add('a failed walk, a success, then two more failures: unload not blocked', unload.state, 'open');
}
// SUP-05: a crate still aboard that is not to come off (fullAboard) keeps the shuttle.
{
  const sends = (fullAboard?: number) => {
    const b = tech();
    b.freight = { shuttleDocked: true, toUnload: 0, mailCrate: false, emptyCrates: 0, misplaced: 0, mailFor: [], ...(fullAboard === undefined ? {} : { fullAboard }) };
    syncFreight(b);
    return b.tasks.some((t: any) => t.kind === 'send' && t.state !== 'done');
  };
  add('SUP-05: nothing to unload, no word of what is aboard: the shuttle goes, as before', sends(), true);
  add('SUP-05: nothing to unload but a full crate aboard: it stays', sends(1), false);
  add('SUP-05: nothing aboard at all: it goes', sends(0), true);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
