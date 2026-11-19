// When a crew member stops being woken by someone who keeps talking to it, case by case. No model is
// called: hearSpeaker and noteReplies (CrewBrain/brain.ts) decide, so it can be checked in a second.
//
//   bun run brain-replies.ts
const { ROOT, janitor, says, at } = await import('./fixtures');
const { hearSpeaker, noteReplies } = await import(ROOT + 'brain');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const captain = { handle: 'p9', name: 'Cap Tain', job: 'Captain', superior: 1 };
const cook = { handle: 'p7', name: 'Ann Other', job: 'Cook' };
const lookTasks = (b: any) => b.tasks.filter((task: any) => task.state !== 'done' && task.kind === 'look').map((task: any) => task.place);
const fresh = (people: any[]) => {
  const b: any = janitor();
  b.talks = new Map();
  b.pendingSpeakers = new Set();
  at(b, 3000, 'Central Primary Hallway', people);
  return b;
};
/** The person says a line at server time `when`; if the NPC is woken, it answers at once. */
const speak = (b: any, who: any, text: string, when: number) => {
  b.now = when;
  const line = says(who, text);
  const event = { seq: 0, time: '', at: when, kind: 'speech_heard', text: '', details: { source: 'person', handle: who.handle, speaker: who.name, message: text, said_to: 'me' } };
  const woken = hearSpeaker(b, event, line);
  if (woken) {
    noteReplies(b, [who.handle]);
    b.pendingSpeakers.clear();
  }
  return woken;
};

// ---- BRAIN-01: a player talking at a normal pace is answered however long the talk goes on
{
  const b = fresh([captain]);
  const answered: boolean[] = [];
  for (let i = 0; i < 8; i++) {
    answered.push(speak(b, captain, `Line number ${i + 1}, Tolly.`, 3000 + i * 100));
  }
  add('the Captain, eight lines ten seconds apart: all eight answered', answered, [true, true, true, true, true, true, true, true]);
}
{
  // Six answers in under a minute is more than anyone types: the seventh is not answered...
  const b = fresh([captain]);
  const answered: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    answered.push(speak(b, captain, `Quick line ${i + 1}.`, 3000 + i * 50));
  }
  add('six lines five seconds apart: all answered', answered.every(Boolean), true);
  add('the seventh, at once: not answered', speak(b, captain, 'Tolly, go and check the Bar.', 3300), false);
  // ...but an order in it from the Captain is still taken on, by code.
  add('the refused line was an order from the Captain: a look task for the Bar', lookTasks(b), ['Bar']);
  // A refused line does not put off the fresh start: a minute after the sixth answer, it answers again.
  add('said again within the minute: still not answered', speak(b, captain, 'Tolly, are you there?', 3260), false);
  add('the lines refused do not keep it deaf: answered once the minute is up', speak(b, captain, 'Tolly, are you there?', 3000 + 5 * 50 + 610), true);
}
{
  // From someone it does not answer to, a refused line takes on no work.
  const b = fresh([cook]);
  for (let i = 0; i < 6; i++) {
    speak(b, cook, `Chat ${i + 1}.`, 3000 + i * 50);
  }
  add('the cook, seventh line at once: not answered', speak(b, cook, 'Tolly, go and check the Bar.', 3300), false);
  add('the cook is not over it: no task', lookTasks(b), []);
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
