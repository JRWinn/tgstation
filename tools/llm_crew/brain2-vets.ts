// What a security body's model line becomes before it is said, with a warrant in its hands
// (KNA-32): the reply filter's call of the job's vetsSay (CrewBrain/brain.ts, vetLines; the screen
// itself is warrantTalk in jobs/arrests.ts). No model is called.
//
//   bun run brain2-vets.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { vetLines } = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const BRICK = { handle: 'p3', name: 'Brick Lane', job: 'Assistant', place: 'Bar', distance: 2 };
const CAPTAIN = { handle: 'p1', name: 'Zim Fire', job: 'Captain', place: 'Bar', distance: 2, command: 1 };
const officer = (people: any[]) => {
  const o: any = makeBrain('Nova Aultman', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Zim Fire', job: 'Captain' }];
  know(o, ['Security Office', 'Bar', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  at(o, 5000, 'Bar', [{ handle: 'p9', name: 'Pun Pun', job: '', place: 'Bar', distance: 4 }, ...people]);
  A.syncBeat(o);
  return o;
};
const vet = (o: any, text: string, mustSay: string | null = null, exact = false, answering: string[] = []) => {
  const replied = [{ tool: 'say', text }, { tool: 'remember', note: 'Pun Pun is in the Bar.' }];
  const notes = vetLines(o, replied as any, mustSay, exact, answering);
  return { said: replied[0].text, note: replied[1].note, putAside: notes.length };
};

{
  const o = officer([BRICK]);
  const got = vet(o, "Hi Brick! I'm Nova Aultman, security! Pun Pun is being a right mess, but I'll sort him out soon!");
  add('a greeting to Brick naming the warrant: only who it is is said', got.said, 'I am Nova Aultman, security.');
  add('and it is shown as put aside; a note is not looked at', [got.putAside, got.note], [1, 'Pun Pun is in the Bar.']);
}
{
  const o = officer([BRICK]);
  add('an answer to Brick naming the warrant: put plainly', vet(o, 'Pun Pun is giving me trouble.', null, false, ['Brick Lane']).said, 'I am on security business.');
}
{
  const o = officer([BRICK, CAPTAIN]);
  add('called on the Captain by name: said whole', vet(o, 'Zim, Pun Pun is in the Bar.').said, 'Zim, Pun Pun is in the Bar.');
  add('an answer to the Captain: said whole', vet(o, 'I saw Pun Pun in the Bar.', null, false, ['Zim Fire']).said, 'I saw Pun Pun in the Bar.');
  add('calling on whoever it is on, while answering the Captain: put plainly', vet(o, 'Pun Pun, stay where you are!', null, false, ['Zim Fire']).said, 'I am on security business.');
}
{
  const o = officer([BRICK]);
  const line = 'Pun Pun, you are under arrest. Come quietly.';
  add('the arrest line, code\'s own, is not touched', vet(o, line, line, true).said, line);
  add('the model\'s remark after an exact line, naming them: the line alone', vet(o, `${line} Pun Pun is a menace!`, line, true).said, line);
  add('the model\'s remark after an exact line with no name in it: left to withRemark', vet(o, `${line} Easy now.`, line, true).said, `${line} Easy now.`);
  add('a line its work calls for in other words, naming them: the work\'s own line said', vet(o, 'Brick, Pun Pun ran off!', 'The warrant, right away.').said, 'The warrant, right away.');
}
{
  const o = officer([BRICK]);
  add('a line with no warrant in it is said whole', vet(o, 'Nice day for it, Brick.').said, 'Nice day for it, Brick.');
}
{
  const c: any = makeBrain('Pat Mop', 'Janitor');
  at(c, 5000, 'Bar', [BRICK]);
  add('a job with no vetsSay: nothing looked at', vet(c, 'Pun Pun made a mess.').said, 'Pun Pun made a mess.');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
