// Where security waits with a prisoner (MAP-04 step 3): brigPlace in CrewBrain/jobs/arrests.ts.
// The server sends each cell's room and distance with security.cells. Where no cell is in the
// Brig (Tramstation: the cells are in the department checkpoints), it waits by the nearest cell's
// room. No model is called.
//
//   bun run arrests3-brig.ts
const { ROOT, makeBrain, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const cell = (name: string, room?: string, dist?: number | null) => ({ name, running: null, left: null, occupants: null, ...(room ? { room } : {}), ...(dist !== undefined ? { dist } : {}) });
const officer = (cells: any[], places = ['Security Office', 'Brig', 'Cargo Security Post', 'Science Security Post', 'Engineering Security Post']) => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  know(o, places);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells };
  return o;
};

add('MetaStation: cells in the Brig: the Brig', A.brigPlace(officer([cell('Cell 1', 'Brig', 9), cell('Cell 2', 'Brig', 10)])), 'Brig');
add('an older server (no room sent): the Brig, as before', A.brigPlace(officer([cell('Cell 1'), cell('Cell 2')])), 'Brig');
add('no cells known at all: the Brig, as before', A.brigPlace(officer([])), 'Brig');
add('IceBox: cells in "Brig Upper" count as the Brig', A.brigPlace(officer([cell('Cell 1', 'Brig Upper', 4)], ['Brig', 'Brig Upper'])), 'Brig');
const tram = [cell('Cargo Cell', 'Cargo Security Post', 40), cell('Science Cell', 'Science Security Post', 12), cell('Engineering Cell', 'Engineering Security Post', null)];
add('Tramstation: no cell in the Brig: the nearest cell\'s room', A.brigPlace(officer(tram)), 'Science Security Post');
add('Tramstation: a cell room it does not know is passed over', A.brigPlace(officer(tram, ['Brig', 'Cargo Security Post', 'Engineering Security Post'])), 'Cargo Security Post');
add('Tramstation: a cell on another level comes last', A.brigPlace(officer([tram[2], tram[0]])), 'Cargo Security Post');
add('Tramstation: it knows none of the cell rooms: the Brig if it knows that', A.brigPlace(officer(tram, ['Brig'])), 'Brig');
add('it knows nothing: nowhere', A.brigPlace(officer(tram, [])), null);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
