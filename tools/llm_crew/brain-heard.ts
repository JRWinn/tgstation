// What a crew member makes of a line once its turn with the model comes, case by case. No model is
// called: buildTalk (CrewBrain/talk.ts) decides who spoke and takes on an order by code, so it can
// be checked in a second.
//
//   bun run brain-heard.ts
const { ROOT, janitor, says, at } = await import('./fixtures');
const { buildTalk } = await import(ROOT + 'talk');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const captain = { handle: 'p9', name: 'Cap Tain', job: 'Captain', superior: 1 };
const line = 'Tolly, go and check the Bar, I heard something';
const lookTasks = (b: any) => b.tasks.filter((task: any) => task.state !== 'done' && task.kind === 'look').map((task: any) => task.place);

// ---- ASYNC-08: the Captain gives an order and walks out of view before the turn comes
{
  // Still in view: as before.
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', [captain]);
  const call = buildTalk(b, { report: [says(captain, line)], speakers: ['p9'], mustSay: null, remark: false, heardFrom: new Map([['p9', { name: 'Cap Tain', superior: true }]]) });
  add('in view: superior is the Captain', call.superior, 'Cap Tain');
  add('in view: the order is a look in the Bar', call.ordered ? [call.ordered.kind, call.ordered.place] : null, ['look', 'Bar']);
  add('in view: a look task for the Bar', lookTasks(b), ['Bar']);
}
{
  // Gone from view, seen when he spoke.
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', []);
  const call = buildTalk(b, { report: [says(captain, line)], speakers: ['p9'], mustSay: null, remark: false, heardFrom: new Map([['p9', { name: 'Cap Tain', superior: true }]]) });
  add('walked off: superior is still the Captain', call.superior, 'Cap Tain');
  add('walked off: toldBy is the Captain', call.toldBy, 'Cap Tain');
  add('walked off: the order is a look in the Bar', call.ordered ? [call.ordered.kind, call.ordered.place] : null, ['look', 'Bar']);
  add('walked off: a look task for the Bar', lookTasks(b), ['Bar']);
}
{
  // A workmate who is not over it tells it of a mess and walks off: it is still asked for work.
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', []);
  const mate = { handle: 'p7', name: 'Ann Other', job: 'Cook' };
  const call = buildTalk(b, { report: [says(mate, 'Tolly, there is vomit in the Bar')], speakers: ['p7'], mustSay: null, remark: false, heardFrom: new Map([['p7', { name: 'Ann Other', superior: false }]]) });
  add('workmate walked off: no superior', call.superior, null);
  add('workmate walked off: toldBy is the workmate', call.toldBy, 'Ann Other');
  add('workmate walked off: asked for work', !!call.parts.workTold, true);
  add('workmate walked off: not asked how it feels about someone gone', call.parts.feelAbout, []);
}
{
  // Never seen at all (no record, not in view): nothing is taken from them, as before.
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', []);
  const call = buildTalk(b, { report: [says(captain, line)], speakers: ['p9'], mustSay: null, remark: false });
  add('never seen: no superior', call.superior, null);
  add('never seen: no order', call.ordered, null);
  add('never seen: not asked for work', call.parts.workTold, null);
}
{
  // Seen when it spoke as someone it does not answer to: not made a superior by being out of view.
  const b: any = janitor();
  at(b, 3000, 'Central Primary Hallway', []);
  const call = buildTalk(b, { report: [says(captain, line)], speakers: ['p9'], mustSay: null, remark: false, heardFrom: new Map([['p9', { name: 'Cap Tain', superior: false }]]) });
  add('seen as no superior: no order', call.ordered, null);
}

// ---- MEM-05: an order the Captain gave someone else is not taken on when he next speaks to it
{
  const ann = { handle: 'p8', name: 'Ann Moss', job: 'Head of Personnel' };
  const toAnn = `${says(captain, 'Ann, go and check the Kitchen and report back.', 2).slice(0, -1)}, speaking to Ann Moss)`;
  const toAll = `${says(captain, 'Someone check the Kitchen.', 2).slice(0, -1)}, speaking to everyone there)`;
  const toTolly = `${says(captain, 'Tolly, stay here for now.', 2).slice(0, -1)}, speaking to you)`;
  const toTollyGo = `${says(captain, 'Tolly, go and check the Kitchen.', 2).slice(0, -1)}, speaking to you)`;
  const heardCaptain = new Map([['p9', { name: 'Cap Tain', superior: true }]]);
  const run = (report: string[], forMe: string[]) => {
    const b: any = janitor();
    at(b, 3000, 'Bar', [captain, ann]);
    const call = buildTalk(b, { report, speakers: ['p9'], mustSay: null, remark: false, heardFrom: heardCaptain, forMe: new Set(forMe) });
    return { ordered: call.ordered ? [call.ordered.kind, call.ordered.place] : null, looks: lookTasks(b) };
  };
  add('to Ann, then "stay here" to Tolly: no order', run([toAnn, toTolly], [toTolly]), { ordered: null, looks: [] });
  add('"stay here" to Tolly alone: no order', run([toTolly], [toTolly]), { ordered: null, looks: [] });
  add('"go and check the Kitchen" to Tolly: look Kitchen', run([toTollyGo], [toTollyGo]).ordered, ['look', 'Kitchen']);
  add('"someone check the Kitchen", Tolly not the nearest, then "stay here": no order', run([toAll, toTolly], [toTolly]), { ordered: null, looks: [] });
  add('"someone check the Kitchen", Tolly the nearest, then "stay here": look Kitchen', run([toAll, toTolly], [toAll, toTolly]).ordered, ['look', 'Kitchen']);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
