// The owner's answers PLAY-10 2 B and 3 A (CrewBrain/jobs/orders.ts, tasks.ts): an order to send
// for a janitor is taken only in the imperative or from a line that names the NPC, never from "I'll
// ask for a janitor myself"; and a janitor sent for on such an order is noted in
// brain.calledOnOrder, for the department to let them in. No model is called.
//
//   bun run play-callorder.ts
const { ROOT, makeBrain, know, says } = await import('./fixtures');
const { CALL, ORDERS, callOrderIn, planOrders, ordersAfterActing, syncOrders } = await import(ROOT + 'jobs/orders');
const { takeToldWork, workInWords, WORK_NOWHERE } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const ZIM = { handle: 'p1', name: 'Zim Fire', job: 'Captain', superior: true };
const HAYDEN = { handle: 'p6', name: 'Hayden Griffiths', job: 'Janitor' };
let clock = 10_000;
const tech = () => {
  const b: any = makeBrain('Jace Richardson', 'Cargo Technician');
  b.id = `call-${clock}`;
  clock += 5000;
  b.post = 'Cargo Bay';
  know(b, ['Cargo Bay', 'Cargo Lobby', 'Bar']);
  b.location = 'Cargo Bay';
  b.now = clock;
  b.peopleInView = [{ ...ZIM, place: 'Cargo Bay', in_post: 1, distance: 2 }];
  b.janitorsOnPda = [HAYDEN.name];
  b.toTell = [];
  b.calledOnOrder = [];
  return b;
};

// ---- PLAY-10 2 B: which lines are an order
for (const [line, want] of [
  ['Then ask for a janitor', true],
  ['call a janitor', true],
  ['Get a janitor in here', true],
  ['please get a janitor in here', true],
  ['could you send for a janitor', true],
  ['Jace, call a janitor', true],
  ['We need a janitor, Jace, call one', false],
  ['Jace, we should get a janitor in here', true],
  ["I'll ask for a janitor myself", false],
  ['Jace, I will call a janitor myself', false],
  ['the janitors get paid too much', false],
  ["don't call a janitor", false],
  ['someone should call a janitor', false],
] as [string, boolean][]) {
  add(`"${line}" ${want ? 'is' : 'is not'} an order to Jace`, callOrderIn('Jace Richardson', line), want);
}
{
  const b = tech();
  add('the net: "I\'ll ask for a janitor myself" takes no order', workInWords(b, [says(ZIM, "I'll ask for a janitor myself")], ZIM.name, true), null);
  const caught = workInWords(b, [says(ZIM, 'Then ask for a janitor')], ZIM.name, true);
  add('the net: "Then ask for a janitor" is still taken, for the room', [caught?.kind, caught?.place], [CALL, 'Cargo Bay']);
}
{
  const b = tech();
  add('the model says it is an order, but the words are "I\'ll ask ... myself": not taken', takeToldWork(b, ORDERS[CALL], WORK_NOWHERE, ZIM.name, true, '"I\'ll ask for a janitor myself"'), null);
  const named = takeToldWork(b, ORDERS[CALL], WORK_NOWHERE, ZIM.name, true, '"Jace, we should get a janitor in here"');
  add('the model, with the NPC named: taken', named?.kind, CALL);
  const bare = takeToldWork(tech(), ORDERS[CALL], 'Bar', ZIM.name, true);
  add('no words to hand (an older caller): taken as before', bare?.place, 'Bar');
}

// ---- PLAY-10 3 A: the call is noted
{
  const b = tech();
  const task = takeToldWork(b, ORDERS[CALL], 'Cargo Bay', ZIM.name, true, '"call a janitor"');
  syncOrders(b);
  const plan = planOrders(b, task);
  add('it sends the janitor a PDA message', [plan?.act?.tool, plan?.act?.person], ['message', HAYDEN.name]);
  ordersAfterActing(plan.act, task, true, b);
  add('the call is noted for the department', b.calledOnOrder, [{ room: 'Cargo Bay', janitor: HAYDEN.name, at: b.now }]);
  ordersAfterActing(plan.act, task, true, b);
  add('only once: the task has its finding now', b.calledOnOrder.length, 1);
}
{
  const b = tech();
  const task = takeToldWork(b, ORDERS[CALL], 'Cargo Bay', ZIM.name, true, '"call a janitor"');
  syncOrders(b);
  const plan = planOrders(b, task);
  ordersAfterActing(plan.act, task, false, b);
  add('a message that did not go: nothing noted', b.calledOnOrder, []);
}
{
  const b = tech();
  b.calledOnOrder = [{ room: 'Cargo Bay', janitor: 'Old Mop', at: b.now - 100 }, { room: 'Bar', janitor: 'Old Mop', at: b.now - 40000 }];
  const task = takeToldWork(b, ORDERS[CALL], 'Cargo Bay', ZIM.name, true, '"call a janitor"');
  syncOrders(b);
  ordersAfterActing(planOrders(b, task).act, task, true, b);
  add('a later call for the room stands over the earlier; an hour-old one is dropped', b.calledOnOrder.map((call: any) => [call.room, call.janitor]), [['Cargo Bay', HAYDEN.name]]);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
