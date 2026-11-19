// A shut-in body sending word to be let out (DRV-11), case by case. No model is called: this is
// all decided in code (CrewBrain/driver.ts), so it can be checked in a second.
//
//   bun run driver-shut-in.ts
const { ROOT, at, janitor } = await import('./fixtures');
const { nextStep } = await import(ROOT + 'driver');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const DOOR_KEY = 'none:{"tool":"go_to_door"}';

/** A janitor shut in the Warehouse with nobody in view, its walk to the door failed `fails` times. */
function shutIn(fails: number, letInBy: string | null = 'Donna Sholl') {
  const b: any = janitor();
  at(b, 3000, 'Warehouse', []);
  b.shutIn = true;
  b.doorOpen = false;
  b.atDoorOf = null;
  b.letInBy = letInBy;
  b.hasPda = true;
  if (fails) b.failures.set(DOOR_KEY, { count: fails, until: Date.now() + 60000 });
  return b;
}

// ---- DRV-11: word is sent from where it stands when the door cannot be got to
{
  const step = nextStep(shutIn(2));
  add('door failed twice, held back: a PDA message to whoever let it in', [step?.act?.tool, step?.act?.person], ['message', 'Donna Sholl']);
  add('worded for where it is', step?.act?.text, 'I am shut in the Warehouse and cannot get to its door. Could you let me out, please?');
}
{
  const step = nextStep(shutIn(1));
  add('door failed once: no word yet, the walk is tried again first', step?.act?.tool === 'message', false);
}
{
  const b = shutIn(2);
  b.outAsks = { room: 'Warehouse', asked: [], knocked: false, messaged: true, wrote: [], wroteAt: Date.now() - 600000 };
  b.pdaPeople = [{ name: 'Zim Fire', job: 'Head of Personnel' }];
  b.doorKeepers = [];
  const step = nextStep(b);
  add('nobody came: word goes on to its head, in the head form', [step?.act?.person, step?.act?.text], ['Zim Fire', 'I am shut in the Warehouse and nobody has come to the door. Could you send someone to let me out, please?']);
}
{
  const b = shutIn(2, null);
  b.pdaPeople = [];
  b.doorKeepers = ['Donna Sholl'];
  const step = nextStep(b);
  add('nobody let it in: a door keeper is written to, worded for where it is', [step?.act?.person, step?.act?.text], ['Donna Sholl', 'I am shut in the Warehouse and cannot get to its door. Could you let me out, please?']);
}
{
  const b = shutIn(0);
  b.atDoorOf = 'Warehouse';
  const step = nextStep(b);
  add('at the door: it knocks first, as before', step?.act?.tool, 'knock');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
