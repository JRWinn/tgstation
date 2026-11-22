// Which lines ask a crew member to step aside (PARSE-04), case by case. No model is called: the
// words are read by code alone (CrewBrain/jobs/aside.ts), so it can be checked in a second.
//
//   bun run driver-aside-words.ts
const { ROOT, makeBrain } = await import('./fixtures');
const { asideOverhears } = await import(ROOT + 'jobs/aside');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

/** TRUE if Tolly, hearing `line` said to it, takes it as an ask to step aside. */
function asked(line: string, saidTo = 'me'): boolean {
  const b: any = makeBrain('Tolly Field', 'Janitor');
  asideOverhears(b, { seq: 1, time: '', at: 100, kind: 'heard', text: '', details: { speaker: 'Monte Mcmullen', handle: 'p5', message: line, said_to: saidTo } } as any);
  return !!b.asideAsked;
}

const ASKS = [
  'move', 'move pls', 'pls move', 'move it', 'Move!', 'Tolly, move.', 'can u move', 'could you move please', 'can you move?',
  'excuse me', 'Sorry, excuse me.', 'coming through', 'let me pass', 'let me thru', 'you are in my way', 'youre in the way', "you're in my way",
  'scoot over', 'budge up', 'step back', 'outta the way', 'move out of the doorway', 'get out of the way', 'move out of the way',
  'I need you out of the way', "I can't get past, out of the way please", 'get the hell out of the way',
  'Excuse me, Tolly, could you step aside, please? I need to get this past you.',
];
const NOT_ASKS = [
  'I moved the bucket out of the way', "I'll move the crate out of the way", 'I will clean this out of the way', 'put it out of the way',
  'can you move the crate to the bay', 'could you move that', 'can you move it to the bay', 'excuse me, where is the bar?', 'the move went fine',
  // PARSE-04 left over (round P): a refusal, or the speaker's own stepping aside, is no ask.
  'I must finish mopping this oil before I can step aside', "I can't step aside", 'I cannot step aside right now, sorry.',
  "Sorry, can't step aside, I'm mopping.", "I'll step aside in a moment.", "I'm stepping aside now.", "Let me get out of the way.",
  "We'll make way once the crate is through.", 'I will move out of your way when I am done.', "Won't move over till this is clean.",
];
// Asks that keep being asks beside the refusals above.
ASKS.push(
  "Why won't you step aside?", 'Why will you not step aside?', 'I need you to step aside.', 'I asked you to step aside, Tolly.',
  "Step aside, I'm hauling.", "I can't get by, step aside please.", 'If you could step aside, I would be grateful.',
);
for (const line of ASKS) add(`asks: "${line}"`, asked(line), true);
for (const line of NOT_ASKS) add(`no ask: "${line}"`, asked(line), false);
add('said to someone else, with no name in it: no ask', asked('move', 'other'), false);
add('said to someone else, naming Tolly: an ask', asked('Tolly, move', 'other'), true);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
