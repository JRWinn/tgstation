// What the real model does when it is asked which job comes first.
//
// Every job it is offered is one it could fairly do, so there is no wrong pick. What this shows is
// whether the picks mean anything:
//   - by position: if it takes whatever is listed first, it is not choosing. Each case is put to it
//     with the jobs in several orders, so that shows up.
//   - by job: whether what the job is (blood in the Bar, dust in a tunnel) moves the pick.
//   - by person: whether an idle person and an eager one pick differently.
//
//   bun run choose.ts              every case, each person, the jobs in four orders
//   bun run choose.ts "tunnel"     only the cases whose label has this in it
//   DRY=1 bun run choose.ts        builds every question and sends none
//   MODEL=other:tag bun run choose.ts
const { ROOT, PERSON_CARDS, MODEL, ask, at, janitor, tech } = await import('./fixtures');
const { buildChoice, readChoice } = await import(ROOT + 'choice');
const { nextStep } = await import(ROOT + 'driver');
const { syncTasks, describeTask } = await import(ROOT + 'tasks');

const mess = (name: string, count = 1) => ({ name, count, kind: 'mess' });
/** A janitor who has seen a mess in each of these rooms, in this order, and now stands in the last. */
function janitorWithMesses(rooms: [string, ReturnType<typeof mess>[]][], minutesApart = 2) {
  const b = janitor();
  let now = 3000;
  for (const [room, messes] of rooms) {
    b.messPlaces = [...b.messPlaces, room]; b.workablePlaces = [...b.messPlaces];
    b.cleanableMesses = messes.map((m) => m.name);
    at(b, now, room, [], messes);
    now += minutesApart * 600;
  }
  b.now = now; syncTasks(b);
  return b;
}

type Case = { label: string; build: () => any };
const cases: Case[] = [
  // Underfoot, in a busy room, and out of the way: the three things the code's own order went by.
  { label: 'janitor: dirt underfoot, blood in the Bar, oil in a tunnel', build: () => janitorWithMesses([['Bar', [mess('blood'), mess('vomit')]], ['Aft Maintenance', [mess('pool of oil')]], ['Central Primary Hallway', [mess('dirt', 2)]]]) },
  // Nothing underfoot: which room next.
  { label: 'janitor: blood in the Bar or dust in the Library', build: () => { const b = janitorWithMesses([['Bar', [mess('blood'), mess('vomit')]], ['Library', [mess('dust')]], ['Custodial Closet', []]]); b.messPlaces = ['Bar', 'Library']; b.workablePlaces = ['Bar', 'Library']; b.cleanableMesses = []; at(b, b.now, 'Custodial Closet'); return b; } },
  // A lopsided one, to see that it can tell: the same mess, in a hallway or in a tunnel.
  { label: 'janitor: the same dirt, in a hallway or in a tunnel', build: () => { const b = janitorWithMesses([['Aft Maintenance', [mess('dirt')]], ['Arrival Shuttle Hallway', [mess('dirt')]], ['Custodial Closet', []]]); b.messPlaces = ['Aft Maintenance', 'Arrival Shuttle Hallway']; b.workablePlaces = [...b.messPlaces]; b.cleanableMesses = []; at(b, b.now, 'Custodial Closet'); return b; } },
  // The bay's chores, which can go in any order.
  { label: 'tech: unload the shuttle, take out the mail, or send for a janitor', build: () => { const b = tech(); b.peopleInView = []; b.freight = { shuttleDocked: true, toUnload: 2, emptiesAboard: 0, mailCrate: true, mailFor: [], emptyCrates: 0 }; b.areaMesses = { 'Cargo Lobby': ['pool of oil'] }; b.janitorsOnPda = ['Tolly Field']; at(b, 3000, 'Cargo Bay'); at(b, 4000, 'Cargo Bay'); return b; } },
];

/** A shuffle that is the same every run, so that two runs put the same orders to the model. */
function seeded(seed: number) {
  let state = seed * 2654435761 + 12345;
  return () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
}
const ROUNDS = 4;
const only = process.argv[2];
let calls = 0; let ms = 0; let tokens = 0; let unreadable = 0;
for (const c of cases) {
  if (only && !c.label.includes(only)) continue;
  const byJob: Record<string, number> = {}; const byPlace = [0, 0, 0, 0]; const byPerson: string[] = []; const reasons: string[] = [];
  let asked = 0; let offered = 0; let shown = false;
  for (const [index, card] of PERSON_CARDS.entries()) {
    const picks: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const b = c.build(); b.card = card;
      const options = nextStep(b)?.choose;
      if (!options) { console.log(`${c.label}: the driver has no choice to put here: ${JSON.stringify(nextStep(b))}`); break; }
      offered = options.length;
      const call = buildChoice(b, options, seeded(index * ROUNDS + round + 1));
      if (!shown && (process.env.SHOW || process.env.DRY)) { console.log(`---- ${c.label}\n${call.system}\n----\n${call.user}\n---- ${call.system.length + call.user.length} chars, about ${Math.round((call.system.length + call.user.length) / 4)} tokens; the code's own order would start with: ${describeTask(b, options[0].task)}`); shown = true; }
      if (process.env.DRY) break;
      const answer = await ask([{ role: 'system', content: call.system }, { role: 'user', content: call.user }], call.schema, 80);
      calls++; ms += answer.ms; tokens += answer.promptTokens; asked++;
      const picked = readChoice(answer.text, call.letters);
      if (!picked) { unreadable++; picks.push('?'); continue; }
      const job = describeTask(b, b.tasks.find((task: any) => task.id === picked.task));
      byJob[job] = (byJob[job] ?? 0) + 1;
      byPlace[Object.values(call.letters).indexOf(picked.task)]++;
      picks.push(job.replace(/^clean up the mess in /, ''));
      if (round === 0) reasons.push(`${card.label}: ${job.replace(/^clean up the mess in /, '')}, "${picked.why}"`);
    }
    if (process.env.DRY) break;
    byPerson.push(`${card.label.padEnd(15)} ${picks.join(' | ')}`);
  }
  if (process.env.DRY || asked === 0) continue;
  console.log(`\n${c.label}  (${asked} asked, ${offered} jobs each)`);
  console.log(`  by job:      ${Object.entries(byJob).sort((x, y) => y[1] - x[1]).map(([job, n]) => `${job}: ${n}`).join(', ')}`);
  console.log(`  by position: ${byPlace.slice(0, offered).map((n, place) => `${['first', 'second', 'third', 'fourth'][place]} listed: ${n}`).join(', ')}  (even would be ${Math.round(asked / offered)} each)`);
  for (const line of byPerson) console.log(`    ${line}`);
  for (const line of reasons) console.log(`      ${line}`);
}
if (calls > 0) console.log(`\n${calls} calls on ${MODEL}: ${Math.round(ms / calls)} ms each on average, prompt ${Math.round(tokens / calls)} tokens on average${unreadable ? `, ${unreadable} answer(s) that named no job` : ''}`);
