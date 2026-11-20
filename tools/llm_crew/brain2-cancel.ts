// A warrant taken back, and words that only look like it (SECT-04 follow-on): whether the officer
// sends a head on to the Head of Security with them (jobs/officer.ts, sendOn), and whether a line
// the model wrote is kept back as one crew would act on (talk.ts, soundsLikeOrder). Both go by
// cancelAsked in jobs/security.ts, as the desk does. No model is called.
//
//   bun run brain2-cancel.ts
const { ROOT, makeBrain, at, know } = await import('./fixtures');
const { OFFICER } = await import(ROOT + 'jobs/officer');
const { soundsLikeOrder } = await import(ROOT + 'talk');

const cases: [string, string, string][] = [];
const add = (label: string, got: unknown, want: unknown) => cases.push([label, JSON.stringify(got), JSON.stringify(want)]);

const officer = () => {
  const o: any = makeBrain('Hale Stone', 'Security Officer');
  o.post = 'Security Office';
  o.pdaPeople = [{ name: 'Joan Hale', job: 'Head of Security' }, { name: 'Quin Mark', job: 'Quartermaster' }];
  know(o, ['Security Office', 'Bar']);
  o.security = { has_baton: 1, has_cuffs: 1, holding: null, health: 90, baton_seen: null, cells: [] };
  at(o, 5000, 'Security Office', []);
  return o;
};
const sentOn = (text: string) => {
  const o = officer();
  OFFICER.readsMessage(o, 'Quin Mark', text, 5000, 'Quartermaster');
  return o.toTell.length > 0;
};

add('a head taking a warrant back by PDA: sent on to the Head of Security', sentOn('Cancel the warrant on Pun Pun.'), true);
add('"Do not cancel the warrant on Pun Pun": nothing to send on', sentOn('Do not cancel the warrant on Pun Pun.'), false);
add('"Did you cancel the warrant?": nothing to send on', sentOn('Did you cancel the warrant?'), false);
add('a warrant declared: still sent on', sentOn('Warrant for Pun Pun, for theft.'), true);

const o = officer();
add('the model taking a warrant back: kept back', soundsLikeOrder('Cancel the warrant on Pun Pun.', o), true);
add('the model saying not to: said', soundsLikeOrder("Don't cancel the warrant on Pun Pun.", o), false);
add('the model asking about it: said', soundsLikeOrder('Did you withdraw the warrant?', o), false);

let failed = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${got}\n       want ${want}`}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} cases right`);
process.exit(failed ? 1 : 0);
