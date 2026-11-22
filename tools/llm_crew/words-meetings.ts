// Which lines tell a head to call its staff together, case by case, and what else in the same
// line is still taken as an order. No model is called: isMeetingOrder (CrewBrain/jobs/meetings.ts)
// and workInWords (CrewBrain/tasks.ts) decide, so it can be checked in a second.
//
//   bun run words-meetings.ts
const { ROOT, makeBrain, at, says, know } = await import('./fixtures');
const { isMeetingOrder } = await import(ROOT + 'jobs/meetings');
const { workInWords } = await import(ROOT + 'tasks');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const hop = makeBrain('Rita Vance', 'Head of Personnel');
const qm = makeBrain('Ann Moss', 'Quartermaster');

// ---- PARSE-15: the plain asks call a meeting
for (const line of [
  'hold a meeting',
  'call a staff meeting',
  'find out how your people are doing',
  'check on your janitors',
  'meeting pls',
  'hold a meetin',
  'gather your staff',
  'get your team together',
  'status report on your department please',
  'give me a report on your section',
  'I want a report from your department',
  'have your staff report in',
  'how are your guys doing',
  'how is service doing',
  'How are your staff getting on?',
]) {
  add(`"${line}" calls a meeting`, isMeetingOrder(hop, line), true);
}
// ---- and a question, a "no need" or a "later" does not
for (const line of [
  'did you hold a meeting?',
  'have you had a meeting yet',
  'get the janitors to clean the bar, no need for a meeting',
  'have the bar cleaned, we can have a meeting later',
  "Don't call a meeting, just clean the bar",
  'Walker, go and look at the Bar and report back to me.',
  'Find out what is in the Custodial Closet.',
]) {
  add(`"${line}" calls no meeting`, isMeetingOrder(hop, line), false);
}
// ---- the Quartermaster's own words for its crates are not a meeting
for (const line of ['status report on the order?', 'get a crate of lightbulbs ordered, no meeting needed', 'how is the order going?']) {
  add(`to the Quartermaster, "${line}" calls no meeting`, isMeetingOrder(qm, line), false);
}
add('to the Quartermaster, "status report on your department" calls one', isMeetingOrder(qm, 'status report on your department'), true);

// ---- an order in another clause of a line that also calls a meeting is still taken
{
  const captain = { handle: 'p9', name: 'Ada Crane', job: 'Captain', superior: true };
  const b = makeBrain('Rita Vance', 'Head of Personnel');
  know(b, ['Bar', 'Kitchen']);
  at(b, 3000, 'Central Primary Hallway', [captain]);
  const task = workInWords(b, [says(captain, 'Hold a meeting, and go and check the Bar.')], captain.name, true);
  add('"Hold a meeting, and go and check the Bar." still sends the head to look at the Bar', task ? `${task.kind} ${task.place}` : null, 'look Bar');
  const none = workInWords(b, [says(captain, 'Find out how your section is doing.')], captain.name, true);
  add('"Find out how your section is doing." is no look order', none ? `${none.kind} ${none.place}` : null, null);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(86)} ${got}${ok ? '' : `   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
