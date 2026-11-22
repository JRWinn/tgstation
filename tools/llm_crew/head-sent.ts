// SECT-08 (the owner's answer B), the heads' side: a head notes whom it sends where, from any line
// it says to someone or PDA message it sends them that names a room, and asked by a keeper "Did
// you send <name> to the <room>?" answers "Yes, I sent <name>." or "No, I did not send <name>."
// from that note. No model is called.
//
//   bun run head-sent.ts
const { ROOT, makeBrain, know } = await import('./fixtures');
const { HEAD_OF_PERSONNEL, SENT_ASK_WORDS } = await import(ROOT + 'jobs/head');
const { CHIEF_ENGINEER } = await import(ROOT + 'jobs/chiefengineer');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const CAPTAIN = { name: 'Cap Tain', job: 'Captain', handle: 'p0', distance: 3 };
const JAN = { name: 'Jan Itor', job: 'Janitor', handle: 'p1', distance: 2 };
const TECH = { name: 'Sam Tech', job: 'Cargo Technician', handle: 'p2', distance: 2 };

function head(job = 'Head of Personnel', name = 'Hop Kins'): any {
  const b: any = makeBrain(name, job);
  know(b, ['Cargo Lobby', 'Cargo Bay', 'Bar', 'Custodial Closet', 'Engineering']);
  b.pdaPeople = [{ name: CAPTAIN.name, job: CAPTAIN.job }, { name: JAN.name, job: JAN.job }, { name: TECH.name, job: TECH.job }];
  b.peopleInView = [];
  b.now = 3000;
  return b;
}
const jobFor = (b: any) => (/Chief Engineer/.test(b.job) ? CHIEF_ENGINEER : HEAD_OF_PERSONNEL);
const sends = (b: any, to: string, text: string, ok = true) => jobFor(b).afterActing(b, { tool: 'message', person: to, text }, undefined, ok);
const pdaAsk = (b: any, text: string) => jobFor(b).readsMessage(b, TECH.name, text, b.now, TECH.job);
const askAloud = (b: any, text: string, saidTo = 'me') => jobFor(b).overhears(b, { details: { message: text, speaker: TECH.name, said_to: saidTo } });
const answers = (b: any) => b.toTell.filter((t: any) => t.to === TECH.name).map((t: any) => [t.line, !!t.byPda]);

add('the keeper\'s words are read', SENT_ASK_WORDS.test('Hop, did you send Jan Itor to the Cargo Bay?'), true);

for (const job of ['Head of Personnel', 'Chief Engineer']) {
  const who = job === 'Chief Engineer' ? 'Ada Volt' : 'Hop Kins';
  {
    const b = head(job, who);
    sends(b, JAN.name, 'Jan, please go to the Cargo Bay and clean the floor by the door.');
    b.now += 600;
    pdaAsk(b, `${who.split(' ')[0]}, did you send Jan Itor to the Cargo Bay?`);
    add(`${job}: sent by PDA, asked by PDA: yes, by PDA`, answers(b), [['Yes, I sent Jan Itor.', true]]);
  }
  {
    const b = head(job, who);
    sends(b, JAN.name, 'Jan, please go to the Cargo Bay and clean the floor by the door.');
    pdaAsk(b, 'Did you send Jan to the Cargo Bay?');
    add(`${job}: asked by first name only: yes, in the name it was asked by`, answers(b), [['Yes, I sent Jan.', true]]);
  }
  {
    const b = head(job, who);
    sends(b, JAN.name, 'Jan, please go to the Bar and clean up.');
    pdaAsk(b, 'Did you send Jan Itor to the Cargo Bay?');
    add(`${job}: sent somewhere else: no`, answers(b), [['No, I did not send Jan Itor.', true]]);
  }
  {
    const b = head(job, who);
    pdaAsk(b, 'Did you send Pun Pun to the Cargo Bay?');
    add(`${job}: nothing noted: no`, answers(b), [['No, I did not send Pun Pun.', true]]);
  }
  {
    const b = head(job, who);
    sends(b, JAN.name, 'Jan, please go to the Cargo Bay.', false);
    pdaAsk(b, 'Did you send Jan Itor to the Cargo Bay?');
    add(`${job}: a message that would not send sends nobody`, answers(b), [['No, I did not send Jan Itor.', true]]);
  }
  {
    const b = head(job, who);
    b.peopleInView = [JAN, TECH];
    jobFor(b).afterSaying(b, 'Jan, the Cargo Bay floor needs a mop, please see to it.');
    askAloud(b, `${who.split(' ')[0]}, did you send Jan Itor to the Cargo Bay?`);
    add(`${job}: said to their face, asked aloud: yes, aloud, word for word`, b.toTell.filter((t: any) => t.to === TECH.name).map((t: any) => [t.line, !!t.byPda, t.exact]), [['Yes, I sent Jan Itor.', false, true]]);
  }
  {
    const b = head(job, who);
    b.peopleInView = [JAN, TECH];
    jobFor(b).afterSaying(b, 'Jan, the Cargo Bay floor needs a mop, please see to it.');
    askAloud(b, 'Did you send Jan Itor to the Cargo Bay?', 'other');
    add(`${job}: a question to someone else is not answered`, answers(b), []);
  }
  {
    const b = head(job, who);
    sends(b, CAPTAIN.name, 'Captain, I am going to the Cargo Bay.');
    pdaAsk(b, 'Did you send Cap Tain to the Cargo Bay?');
    add(`${job}: word to the Captain sends nobody anywhere`, answers(b), [['No, I did not send Cap Tain.', true]]);
  }
  {
    const b = head(job, who);
    sends(b, JAN.name, 'Jan, please go to the Cargo Bay.');
    b.now += 40000;
    pdaAsk(b, 'Did you send Jan Itor to the Cargo Bay?');
    add(`${job}: sent over an hour ago: no longer`, answers(b), [['No, I did not send Jan Itor.', true]]);
  }
}

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(90)} ${ok ? '' : `${got}   (wanted ${want})`}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
