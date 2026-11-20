// With two officers, the Captain's "try again" goes to the officer that broke off hurt, not to
// whichever officer is first in sight or on the PDA (deskTakes in CrewBrain/jobs/desk.ts). No model
// is called and no station is simulated.
//
//   bun run secdesk-tryagain.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const D = await import(ROOT + 'jobs/desk');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const CAPTAIN = { name: 'Zim Fire', job: 'Captain' };
const SAM = { name: 'Sam Reed', job: 'Security Officer' };
const HALE = { name: 'Hale Stone', job: 'Security Officer' };
const head = (pda: any[]) => {
  const h: any = makeBrain('Joan Marsh', 'Head of Security');
  h.pdaPeople = pda;
  h.staffPost = 'Security Office';
  h.office = 'Security Office';
  know(h, ['Security Office', 'Brig']);
  h.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(h, 3000, 'Security Office');
  return h;
};
const toOfficers = (h: any) => h.toTell.filter((tell: any) => [SAM.name, HALE.name].includes(tell.to)).map((tell: any) => tell.to);

{
  // Sam is first on the PDA; Hale is the one hurt.
  const h = head([CAPTAIN, SAM, HALE]);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  h.toTell = [];
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Try again', false);
  add('try again: told to Hale, who broke off hurt, not Sam', toOfficers(h), ['Hale Stone']);
}
{
  // The hurt officer is gone from the PDA: any officer aboard is told, as before.
  const h = head([CAPTAIN, SAM, HALE]);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  h.pdaPeople = [CAPTAIN, SAM];
  h.toTell = [];
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Try again', false);
  add('try again, the hurt officer no longer aboard: Sam is told', toOfficers(h), ['Sam Reed']);
}
{
  // Told once: a second "try again" with nobody hurt goes to any officer.
  const h = head([CAPTAIN, SAM, HALE]);
  D.deskTakes(h, 'Hale Stone', 'Security Officer', 'Joan, I am hurt and can make no arrests.', false);
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Try again', false);
  h.toTell = [];
  D.deskTakes(h, 'Zim Fire', 'Captain', 'Try again', false);
  add('a second try again, nobody hurt since: the first officer aboard', toOfficers(h), ['Sam Reed']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
