// The Quartermaster's own crate (paper it ordered for itself) lost before it opens it (QM-04),
// case by case. No model is called: this is all decided in code (CrewBrain/jobs/quartermaster.ts).
//
//   bun run qm-own-crate.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { QUARTERMASTER } = await import(ROOT + 'jobs/quartermaster');
const { syncTasks } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const OFFICE = "Quartermaster's Office";
const CRATE = 'Bureaucracy Crate';
const unpackTasks = (b: any) => b.tasks.filter((task: any) => task.kind === 'qm_unpack' && task.state !== 'done').length;
const ownOpen = (b: any) => b.ledger.orders.filter((order: any) => order.own && !order.unpacked && order.state !== 'refused').length;

/** A Quartermaster whose own Bureaucracy Crate has docked as crate #12 and is not yet opened. */
function quartermaster() {
  const b: any = makeBrain('Ada Finch', 'Quartermaster');
  b.office = OFFICE;
  b.location = 'Cargo Bay';
  b.staffPost = 'Cargo Bay';
  b.orderable = [CRATE];
  b.crateCosts = { [CRATE]: 200 };
  b.budget = 2000;
  b.now = 5000;
  b.pdaPeople = [{ name: 'Cora Tech', job: 'Cargo Technician' }];
  b.peopleInView = [{ handle: 'p2', name: 'Cora Tech', job: 'Cargo Technician' }];
  // No paper to be found: it orders a crate for itself.
  QUARTERMASTER.afterActing(b, { tool: 'get_paper' }, undefined, false, false, {});
  const order = b.ledger.orders[0];
  order.state = 'docked';
  order.crates = [{ number: 12, kind: CRATE }];
  syncTasks(b);
  return b;
}
const told = (line: string) => ({ seq: 1, time: '', at: 100, kind: 'heard', text: '', details: { speaker: 'Cora Tech', handle: 'p2', message: line, said_to: 'me' } });

{
  const b = quartermaster();
  add('its crate docked: it goes to open it', unpackTasks(b), 1);
  QUARTERMASTER.overhears(b, told('Ada, crate #12 for Ada Finch is lost: it has been destroyed.') as any);
  syncTasks(b);
  add('told it is lost: the lost crate is not tried again', unpackTasks(b), 0);
  add('and it is ordered again once', b.ledger.orders.filter((order: any) => order.own).length, 2);
  // The reorder comes in and is opened. Later there is no paper again.
  const again = b.ledger.orders[1];
  again.state = 'docked';
  again.crates = [{ number: 13, kind: CRATE }];
  again.unpacked = true;
  b.now = 9000;
  QUARTERMASTER.afterActing(b, { tool: 'get_paper' }, undefined, false, false, {});
  add('out of paper again later: it orders more', b.ledger.orders.filter((order: any) => order.own).length, 3);
}
{
  const b = quartermaster();
  const task = b.tasks.find((it: any) => it.kind === 'qm_unpack');
  b.ledger.paperRetryAt = 99999;
  QUARTERMASTER.afterActing(b, { tool: 'open_own_crate', number: 12 }, task, false, false, { no_such_crate: true });
  syncTasks(b);
  add('cargo holds no such crate for it: done with, and paper looked for again at once', [unpackTasks(b), ownOpen(b), b.ledger.paperRetryAt], [0, 0, 0]);
}
{
  const b = quartermaster();
  const task = b.tasks.find((it: any) => it.kind === 'qm_unpack');
  QUARTERMASTER.afterActing(b, { tool: 'open_own_crate', number: 12 }, task, false, false, {});
  syncTasks(b);
  add('it could not open it for some other reason: it tries again', unpackTasks(b), 1);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
