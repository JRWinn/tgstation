// A head of department's order to force the door they stand at (jobs/forcing.ts). No model is called.
//
//   bun run forcing-heads.ts
const { ROOT, makeBrain, at } = await import('./fixtures');
const F = await import(ROOT + 'jobs/forcing');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const PDA = [
  { name: 'Derek Albright', job: 'Station Engineer' },
  { name: 'Ada Voss', job: 'Chief Engineer' },
  { name: 'Armando Bode', job: 'Head of Personnel' },
  { name: 'Joan Marsh', job: 'Head of Security' },
  { name: 'Zim Fire', job: 'Captain' },
  { name: 'Nev Os', job: 'Janitor' },
];
const DOOR = { room: 'Cargo Bay', door: 'Cargo Lobby' };
const KEY = 'Cargo Bay (Cargo Lobby)';
const body = (name: string, job: string, pda = PDA) => {
  const b: any = makeBrain(name, job);
  b.pdaPeople = pda.filter((it) => it.name !== name);
  b.hasPda = true;
  at(b, 6000, 'Engineering');
  return b;
};
const said = (b: any) => { const out = b.toTell.map((it: any) => `${it.to}: ${it.line}`); b.toTell = []; return out; };

for (const text of [
  'Can you send an engineer to force open the door to cargo?', 'bust open this door', 'Break down this door please', 'pry this open',
  'force this doro', 'The door was locked, force it open', 'get someone to break into here', 'open this door', 'I need this airlock unlocked',
]) add(`an order: ${text}`, F.asksForced(text), true);
for (const text of [
  'How is the engine', 'Hold a meeting', 'Never mind the door, do not force it', 'the door is open', 'Thanks for opening the door',
  'Light the engine again', 'Who opened this door?', 'Open the engineering meeting',
]) add(`no order: ${text}`, F.asksForced(text), false);

for (const [name, job, to] of [['Zim Fire', 'Captain', 'Captain'], ['Armando Bode', 'Head of Personnel', 'Armando'], ['Joan Marsh', 'Head of Security', 'Joan']] as const) {
  const b = body('Ada Voss', 'Chief Engineer');
  b.senderDoor = DOOR;
  add(`${job}: taken`, F.forcingReads(b, name, job, 'bust open this door'), true);
  add(`${job}: down to the engineer, and word of who is coming`, said(b), [
    `Derek Albright: Derek, ${job === 'Captain' ? 'the Captain' : name} needs the door of the ${KEY} opened. Go and open it, please.`,
    `${name}: ${to}, I am sending Derek to open the ${KEY}.`,
  ]);
  F.forcingReads(b, name, job, 'bust open this door');
  add(`${job}: asked again, not sent twice`, said(b), []);
  F.forcingReads(b, 'Derek Albright', 'Station Engineer', F.forceDoneLine('Ada', KEY));
  add(`${job}: told it is open`, said(b), [`${name}: ${to}, the door of the ${KEY} is open.`]);
}
{
  const b = body('Ada Voss', 'Chief Engineer');
  b.senderDoor = null;
  F.forcingReads(b, 'Zim Fire', 'Captain', 'force open the door to cargo');
  add('at no door: asked to stand at it', said(b), ['Zim Fire: Captain, I cannot tell which door you mean. Stand next to it and send me that again, please.']);
  b.senderDoor = DOOR;
  add('a janitor may not', F.forcingReads(b, 'Nev Os', 'Janitor', 'bust open this door'), false);
}
{
  const e = body('Derek Albright', 'Station Engineer');
  e.senderDoor = DOOR;
  add('with a Chief Engineer aboard, the engineer takes none from a head', F.forcingReads(e, 'Zim Fire', 'Captain', 'bust open this door'), false);
  add('the engineer takes it from its chief', F.forcingReads(e, 'Ada Voss', 'Chief Engineer', F.headOrderLine('Derek', 'the Captain', KEY)), true);
  F.syncForcing(e);
  const task = e.tasks.find((it: any) => it.kind === 'force_door');
  const act = F.planForcing(e, task)?.act;
  add('and goes to that very door', act, { tool: 'force_door', place: 'Cargo Bay', door: 'Cargo Lobby', ordered: true, attempt: 1 });
  F.forcingAfterActing(e, act, false, { reason: 'bolted' });
  add('bolted: its chief is told', said(e), [`Ada Voss: Ada, I could not open the door of the ${KEY}: it is bolted.`]);
}
{
  const e = body('Derek Albright', 'Station Engineer', PDA.filter((it) => it.job !== 'Chief Engineer'));
  e.senderDoor = DOOR;
  F.forcingReads(e, 'Armando Bode', 'Head of Personnel', 'pry this door open');
  add('with no chief, the engineer goes itself and says so', said(e), [`Armando Bode: Armando, I am coming to open the door of the ${KEY}.`]);
}
{
  const b = body('Ada Voss', 'Chief Engineer', PDA.filter((it) => it.job !== 'Station Engineer'));
  b.senderDoor = DOOR;
  F.forcingReads(b, 'Zim Fire', 'Captain', 'break this door open');
  add('with no engineer, the chief goes itself', [said(b), b.forcing.jobs[0].exact], [[`Zim Fire: Captain, I am coming to open the door of the ${KEY}.`], { place: 'Cargo Bay', door: 'Cargo Lobby' }]);
}
let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
