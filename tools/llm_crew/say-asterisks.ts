// Asterisks in what the model wants said (HAND-03): the window keeps as said what the server will
// say, which takes a *...* action at the start or end out and every other asterisk with it
// (tool_say in code/modules/llm_crew/crew_npc_tools.dm). CrewBrain/prompt.ts, inOwnVoice and
// parseReply. No model is called.
//
//   bun run say-asterisks.ts
const { ROOT } = await import('./fixtures');
const { inOwnVoice, parseReply } = await import(ROOT + 'prompt');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);
const said = (line: string) => parseReply(JSON.stringify({ say: line })).filter((action: any) => action.tool === 'say').map((action: any) => action.text);

// The three lines from the finding.
add('an action at the end goes', inOwnVoice('On my way, Captain. *salutes*'), 'On my way, Captain.');
add('emphasis keeps its word', inOwnVoice('Crate **12** is in the lobby for you.'), 'Crate 12 is in the lobby for you.');
add('a stray asterisk at the end goes', inOwnVoice('I will get to it right away*'), 'I will get to it right away');
// And around them.
add('an action at the start goes', inOwnVoice('*nods* Right you are.'), 'Right you are.');
add('a line with none is as it was', inOwnVoice('My body is on its way.'), 'I am on its way.');
add('through parseReply: what is kept as said', said('On my way, Captain. *salutes*'), ['On my way, Captain.']);
add('a line that is only an action is silence', said('*nods*'), []);
add('nor is "**" anything', said('**'), []);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
