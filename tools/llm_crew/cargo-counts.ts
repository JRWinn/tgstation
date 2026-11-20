// How many crates an order asks for (CARGO-05): the number read from anywhere in the clause, not
// only right before "crate", in words to ten, "a couple", "x2", capped at the console's four of a
// kind, and not a crate's or an order's number. No model is called (CrewBrain/jobs/cargo.ts,
// itemsAskedFor).
//
//   bun run cargo-counts.ts
const { ROOT } = await import('./fixtures');
const { itemsAskedFor } = await import(ROOT + 'jobs/cargo');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const KINDS = ['Janitorial Supplies Crate', 'Replacement Lights', 'Bureaucracy Crate'];
const read = (said: string, names: string[] = []) =>
  itemsAskedFor(said.toLowerCase(), KINDS, names).map((it: any) => `${it.count} ${it.crate}`);

for (const [said, want] of [
  ['two crates of janitorial supplies and a crate of light bulbs', ['2 Janitorial Supplies Crate', '1 Replacement Lights']],
  ['two janitorial supplies crates', ['2 Janitorial Supplies Crate']],
  ['i need 2 janitorial crates please', ['2 Janitorial Supplies Crate']],
  ['three lots of cleaning supplies', ['3 Janitorial Supplies Crate']],
  ['five crates of janitorial supplies', ['4 Janitorial Supplies Crate']],
  ['a couple of crates of light bulbs', ['2 Replacement Lights']],
  ['janitorial supplies x2', ['2 Janitorial Supplies Crate']],
  ['2x janitorial supplies', ['2 Janitorial Supplies Crate']],
  ['can i get two crates each of janitorial supplies and lights', ['2 Janitorial Supplies Crate', '2 Replacement Lights']],
  ['two crates of janitorial supplies and lights', ['2 Janitorial Supplies Crate', '1 Replacement Lights']],
  ['a crate of janitorial supplies', ['1 Janitorial Supplies Crate']],
  ['can you order janitorial supplies', ['1 Janitorial Supplies Crate']],
  ['i need to order 2 janitorial supplies crates', ['2 Janitorial Supplies Crate']],
  ['soap and mops', ['1 Janitorial Supplies Crate']],
  ['two crates of soap and two of mops', ['4 Janitorial Supplies Crate']],
  ['three crates of soap and three of mops', ['4 Janitorial Supplies Crate']],
  ['janitorial supplies like crate #12 again', ['1 Janitorial Supplies Crate']],
  ['about order 3: janitorial supplies', ['1 Janitorial Supplies Crate']],
  ['order #3 was janitorial supplies, two more please', ['1 Janitorial Supplies Crate']],
  ['2 crates of janitorial supplies, and a crate of replacement lights', ['2 Janitorial Supplies Crate', '1 Replacement Lights']],
  ['ten boxes of paperwork', ['4 Bureaucracy Crate']],
] as [string, string[]][]) {
  add(`"${said}"`, read(said), want);
}
// The Quartermaster's own fixed line to a technician, as GIVEN_WORDS hands it on.
add('the Quartermaster\'s fixed line reads as before', read(' 2 crates of janitorial supplies and a crate of replacement lights'), ['2 Janitorial Supplies Crate', '1 Replacement Lights']);
add('a name it knows is no kind and no count', read('two crates of light bulbs for Jan Mopp', ['Jan Mopp']), ['2 Replacement Lights']);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
