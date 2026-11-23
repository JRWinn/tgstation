// SEC-07 (the owner's answer B), where two round-A1 groups met: a crew member stuck in handcuffs
// tells its own head (noteStuckInCuffs in CrewBrain/tasks.ts), and only security takes cuffs off
// (stuckInCuffsAsk in jobs/arrests.ts). A head that is not security passes the word on to the Head
// of Security, else an officer (passOnStuckInCuffs in jobs/head.ts), and security reads the one
// named as the one stuck. No model is called.
//
//   bun run sec07-passon.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const A = await import(ROOT + 'jobs/arrests');
const { jobFor } = await import(ROOT + 'jobs/index');
const { STUCK_IN_CUFFS_LINE } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const JAN = { handle: 'p5', name: 'Jan Itor', job: 'Janitor', place: 'Bar', distance: 2, cuffed: 1 };
const told = (b: any) => b.toTell.map((t: any) => `${t.to}${t.byPda ? ' (PDA)' : ''}: ${t.line}`);
let ids = 0;
const head = (job: string, name: string, pda: any[]) => {
  const b: any = makeBrain(name, job);
  b.id = `passon-${++ids}`;
  b.pdaPeople = pda;
  b.peopleInView = [];
  b.toTell = [];
  b.now = 5000;
  return b;
};
const SEC = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Hale Stone', job: 'Security Officer' }];

for (const [job, name] of [['Head of Personnel', 'Hop Kins'], ['Chief Engineer', 'Ada Volt'], ['Quartermaster', 'Quinn Master']]) {
  {
    const b = head(job, name, [...SEC, { name: JAN.name, job: JAN.job }]);
    jobFor(job).readsMessage(b, JAN.name, STUCK_IN_CUFFS_LINE, 5000, JAN.job);
    add(`${job}: told by PDA: passed on to the Head of Security by PDA`, told(b), [`Joan Hale (PDA): Jan Itor is in handcuffs and cannot get them off. Can someone from security take them off?`]);
    jobFor(job).readsMessage(b, JAN.name, STUCK_IN_CUFFS_LINE, 5010, JAN.job);
    add(`${job}: told again at once: not passed on twice`, b.toTell.length, 1);
  }
  {
    const b = head(job, name, [{ name: 'Hale Stone', job: 'Security Officer' }]);
    b.peopleInView = [JAN];
    jobFor(job).overhears(b, { seq: 1, time: '', at: 5000, kind: 'speech_heard', text: '', details: { speaker: JAN.name, message: `${name.split(' ')[0]}, ${STUCK_IN_CUFFS_LINE}`, source: 'person', said_to: 'me' } });
    add(`${job}: told to its face, no Head of Security: passed on to the officer`, told(b), [`Hale Stone (PDA): Jan Itor is in handcuffs and cannot get them off. Can someone from security take them off?`]);
  }
  {
    const b = head(job, name, [{ name: JAN.name, job: JAN.job }]);
    jobFor(job).readsMessage(b, JAN.name, STUCK_IN_CUFFS_LINE, 5000, JAN.job);
    add(`${job}: nobody of security known: nobody told`, b.toTell.length, 0);
  }
}

// Security reading the word passed on: the one named is stuck, not the head who sent it.
{
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = SEC;
  know(o, ['Security Office', 'Bar', 'Brig']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(o, 5000, 'Security Office', []);
  jobFor('Security Officer').readsMessage(o, 'Hop Kins', 'Jan Itor is in handcuffs and cannot get them off. Can someone from security take them off?', 5000, 'Head of Personnel');
  add('officer: passed on by a head: the ask is for the one named', Object.keys(A.beatOf(o).cuffAsks ?? {}), ['Jan Itor']);
  at(o, 5600, 'Bar', [JAN]);
  A.syncBeat(o);
  add('officer: and once they are seen, still in cuffs, it lets them go', A.beatOf(o).toFree.map((it: any) => it.name), ['Jan Itor']);
  const self: any = makeBrain('Hale Stone', 'Security Officer');
  self.security = o.security;
  A.stuckInCuffsAsk(self, 'Jan Itor', STUCK_IN_CUFFS_LINE);
  add('officer: the crew member\'s own "I am in handcuffs" is still theirs', Object.keys(A.beatOf(self).cuffAsks ?? {}), ['Jan Itor']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
