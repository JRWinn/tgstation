// Who a shut-in body asks for the door (whoToAskForTheDoor in CrewBrain/situation.ts): never
// anyone it holds a warrant on, so a shut-in officer does not ask the person it is after to let
// it out. No model is called.
//
//   bun run situation-doorask.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { whoToAskForTheDoor, describeShutIn } = await import(ROOT + 'situation');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const PUN = { handle: 'p2', name: 'Pun Pun', job: '', place: 'Bar', distance: 1 };
const ANN = { handle: 'p3', name: 'Ann Moss', job: 'Bartender', place: 'Bar', distance: 3 };
const officer = (people: any[], letInBy: string | null = null) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.location = 'Bar';
  o.shutIn = true;
  o.peopleInView = people;
  o.letInBy = letInBy;
  A.giveWarrant(o, { name: 'Pun Pun', reason: 'theft', minutes: 5 });
  return o;
};

add('the one it is after first in view: it asks the next person', whoToAskForTheDoor(officer([PUN, ANN])), 'Ann Moss');
add('only the one it is after in view: nobody to ask', whoToAskForTheDoor(officer([PUN])), null);
add('and the prompt says there is nobody here to ask', /There is nobody here to ask\./.test(describeShutIn(officer([PUN]))), true);
add('the one it is after let it in: still not asked', whoToAskForTheDoor(officer([PUN, ANN], 'Pun Pun')), 'Ann Moss');
{
  const b: any = makeBrain('Tolly Field', 'Janitor');
  b.location = 'Bar';
  b.shutIn = true;
  b.peopleInView = [PUN, ANN];
  add('no warrant: the first person in view is asked, as before', whoToAskForTheDoor(b), 'Pun Pun');
}
{
  const o = officer([PUN, ANN]);
  A.forgetWarrant(o, 'Pun Pun');
  add('the warrant gone: they may be asked again', whoToAskForTheDoor(o), 'Pun Pun');
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
