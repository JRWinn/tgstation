// The words of a staff meeting, case by case. No model is called: a report's numbers are written
// and read back in code (CrewBrain/jobs/reports.ts), an order for several kinds of crate is read
// in code (jobs/cargo.ts), and whether a head has been told to hold a meeting is decided in code
// (jobs/meetings.ts). So all of it can be checked in a second.
//
//   bun run reports.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { needWords, readReport, reportWords, withRemark, workWords, totalWords, WORDINGS } = await import(ROOT + 'jobs/reports');
const { itemsAskedFor } = await import(ROOT + 'jobs/cargo');
const { isMeetingOrder, OVER_WORDS } = await import(ROOT + 'jobs/meetings');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

// A report read back gives the numbers it was written with, whichever way it is worded.
for (const counts of [{ put_away: 14, cleaned: 9 }, { cleaned: 1 }, { put_away: 1 }, {}]) {
  for (let wording = 0; wording < WORDINGS; wording++) {
    for (const need of ['something to clean with', 'something better than a rag to clean with', null]) {
      const line = `Walker, ${workWords(counts, wording)}. ${needWords(need)}`;
      add(`read back: "${line}"`, readReport(line), { counts, need: !!need });
    }
  }
}
// What a janitor has done since it last reported is what it reports, and nothing it has reported already.
const jan = makeBrain('Jan Itor', 'Janitor');
jan.workDone = { cleaned: 12, put_away: 3 };
jan.workReported = { cleaned: 5 };
add('work since the last report', reportWords(jan, null, 0), 'I have cleaned up 3 items and scrubbed 7 spots. I need nothing.');
add('a total, as a head says it', totalWords({ put_away: 31, cleaned: 22 }), '31 items cleaned up and 22 spots scrubbed');
add('talk that is not a report is not read as one', readReport('Lovely day for it, Walker.'), null);
add('the end of a meeting is known by its words', OVER_WORDS.test('Between you, that is 9 spots scrubbed. Nobody needs anything. The meeting is over, thank you.'), true);

// The remark: kept when it is only a remark, left off when it could be taken for anything else.
const fact = 'Walker, I have scrubbed 9 spots. I need nothing.';
add('a plain remark is kept', withRemark(fact, 'Not that anyone noticed'), `${fact} Not that anyone noticed.`);
add('a remark with a number in it is left off', withRemark(fact, 'That makes 40 today!'), fact);
add('so is one with an amount in words', withRemark(fact, 'A dozen more to go.'), fact);
add('so is a question', withRemark(fact, 'Happy now?'), fact);
add('so is one that speaks of needing something', withRemark(fact, 'I need a holiday.'), fact);
add('so is one that speaks of the meeting', withRemark(fact, 'Can this meeting end.'), fact);
add('so is one that runs long', withRemark(fact, 'I would like it noted for the record that the hallway outside the bar was in a truly shocking state when I got to it this morning.'), fact);
add('no remark at all leaves the line as it is', withRemark(fact, null), fact);
add('nor does the model saying it has nothing to say', withRemark(fact, '(nothing)'), fact);
add('the line given back with a remark on the end keeps only the remark', withRemark(fact, `${fact} So there.`), `${fact} So there.`);
add('the line given back in other numbers is left off', withRemark(fact, 'Walker, I scrubbed 90 spots.'), fact);

// An order for several kinds of crate at once.
const ORDERABLE = ['Janitorial Supplies Crate', 'Replacement Lights'];
const items = (said: string) => itemsAskedFor(said.toLowerCase(), ORDERABLE).map((item: any) => `${item.count} ${item.crate}`);
add('one kind, one crate', items('Cora, I need to order a crate of janitorial supplies for my staff, please. Send me the manifest number when it comes in.'), ['1 Janitorial Supplies Crate']);
add('one kind, several crates', items('Cora, I need to order 2 crates of janitorial supplies for my staff, please.'), ['2 Janitorial Supplies Crate']);
add('two kinds in one order', items('Cora, I need to order two crates of janitorial supplies and a crate of replacement lights, please.'), ['2 Janitorial Supplies Crate', '1 Replacement Lights']);
add('two kinds, the other way round, in plain words', items('Cora, could I get some light bulbs, and three crates of cleaning supplies?'), ['1 Replacement Lights', '3 Janitorial Supplies Crate']);
add('one kind named twice is not ordered twice', items('Cora, we need soap and mops.'), ['1 Janitorial Supplies Crate']);
add('nothing cargo orders', items('Cora, I need to order a crate of pizza.'), []);

// Told to hold a meeting, as against being sent to look at a room.
const hop = makeBrain('Walker Wolfe', 'Head of Personnel');
const janitor = makeBrain('Jan Itor', 'Janitor');
add('"Find out how your section is doing" tells a head to hold a meeting', isMeetingOrder(hop, 'Walker, find out how your section is doing.'), true);
add('"Hold a staff meeting"', isMeetingOrder(hop, 'Walker, hold a staff meeting, please.'), true);
add('"How are your staff getting on?"', isMeetingOrder(hop, 'How are your staff getting on?'), true);
add('"Go and look at the Bar and report back" is not that', isMeetingOrder(hop, 'Walker, go and look at the Bar and report back to me.'), false);
add('"Find out what is in the Custodial Closet" is not that', isMeetingOrder(hop, 'Find out what is in the Custodial Closet.'), false);
add('someone with no staff cannot be told to', isMeetingOrder(janitor, 'Jan, find out how your section is doing.'), false);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(96)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
