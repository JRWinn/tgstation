// KNB-09 for the Head of Security: an officer's "On my way" to the meeting and its report sent by
// PDA are read as every head reads them (staffMeetingWord in jobs/head.ts, called from
// readsMessage in jobs/headofsecurity.ts); a report sent while after someone (KEPT_AWAY) is still
// read. No model is called and no station is simulated.
//
//   bun run secmeet-knb09.ts
const { ROOT, makeBrain, know } = await import('./fixtures');
const { HEAD_OF_SECURITY } = await import(ROOT + 'jobs/headofsecurity');
const { workWords } = await import(ROOT + 'jobs/reports');
const { KEPT_AWAY } = await import(ROOT + 'jobs/security');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const OFFICER = 'Hale Stone';
const head = () => {
  const h: any = makeBrain('Joan Marsh', 'Head of Security');
  h.pdaPeople = [
    { name: OFFICER, job: 'Security Officer' },
    { name: 'Zim Fire', job: 'Captain' },
  ];
  h.office = 'Security Office';
  h.staffPost = 'Security Office';
  know(h, ['Security Office', 'Brig']);
  h.meeting = { calledAt: 0, room: 'Security Office', calledIn: true, invited: [OFFICER], copied: true, answers: {}, startedAt: null, turns: [], reports: {}, closedAt: null, orderedBy: null };
  return h;
};
const read = (h: any, text: string, at = 50) => HEAD_OF_SECURITY.readsMessage?.(h, OFFICER, text, at, 'Security Officer');

{
  const h = head();
  read(h, 'On my way to the Security Office.');
  add('an officer\'s "On my way" by PDA: it is coming', h.meeting.answers[OFFICER], 'coming');
  read(h, `Sorry I missed the meeting. ${workWords({ cleaned: 2 }, 0)}. I need nothing.`, 60);
  add('a report it sends by PDA, missed: counted as given', [!!h.meeting.reports[OFFICER], h.meeting.answers[OFFICER]], [true, 'cannot']);
}
{
  const h = head();
  read(h, `I could not get into the Security Office for the meeting. ${workWords({}, 0)}. I need nothing.`);
  add('a report by PDA, shut out of the room: counted as given', [!!h.meeting.reports[OFFICER], h.meeting.answers[OFFICER]], [true, 'cannot']);
}
{
  const h = head();
  read(h, `${KEPT_AWAY}: I am after Pun Pun. ${workWords({}, 0)}. I need nothing.`);
  add('a report sent while after someone (KEPT_AWAY): still counted as given', [!!h.meeting.reports[OFFICER], h.meeting.answers[OFFICER]], [true, 'cannot']);
}
{
  // After the meeting a report goes into the next one's count, as before.
  const h = head();
  h.meeting = null;
  h.lateWork = {};
  read(h, `Sorry I missed the meeting. ${workWords({ cleaned: 2 }, 0)}. I need nothing.`);
  add('a report by PDA after the meeting: no meeting made, and nothing thrown', h.meeting, null);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
