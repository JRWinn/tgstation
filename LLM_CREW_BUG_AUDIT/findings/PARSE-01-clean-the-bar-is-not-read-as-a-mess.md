---
id: PARSE-01
title: Clean the bar, mop the kitchen, puked and vomited are not read as a mess, so a typed call to a janitor is taken as word its supplies have come
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 301fdb1c850
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:220, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:801, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:261
fix: Add the verbs of asking for cleaning (clean, mop, wipe, scrub, tidy, sweep) and the past and -ing forms of the mess words to MESS_WORDS, and let a word that begins with a mess word count
---

## What is wrong

See also: DESK-01

`MESS_WORDS` is the only thing the janitor's code goes by to tell that a line or a PDA message is a call to a mess. It holds nouns and a few fixed forms, matched as whole words:

    /\b(mess|messy|blood|bloody|vomit|threw up|thrown up|puke|spill|spilled|spilt|oil|dirt|dirty|filth|filthy|stain|grime|ash|ashes)\b/

It has none of the words a player uses to **ask** for cleaning: clean, mop, wipe, scrub, tidy, sweep. And it misses the ordinary forms of its own words: puked, vomited, vomiting, bloodstains, stains, spills, puddle, sticky, trash, glass.

Two places read it with no model:

1. **Every PDA message to a janitor** (`readsMessage`). If `MESS_WORDS` does not match, the message falls to the last lines of the reader, which take it as word that the janitor's supplies have come, and in the room the message names (DESK-01 found the fall-through; this is why ordinary calls land there). So the Captain's "clean the bar pls" makes the janitor walk to the Bar **to collect supplies**, and no mess task is made.
2. **Spoken orders when the model is down, and the order made out by code before the model is asked** (`workInWords`, through `soundsLike: { [CLEAN]: MESS_WORDS }`). With the model up, the reply's `work` field may still catch "clean the bar", but `buildTalk` makes the superior's order by code first (`const ordered = superior ? workInWords(...)`) and only that one is sure. With the model down, `workInWords` in the catch branch of `brain.ts` is the only reader, and the order is lost.

The owner has said typed orders should be understood with loose wording.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:220`:

    const MESS_WORDS =
      /\b(mess|messy|blood|bloody|vomit|threw up|thrown up|puke|spill|spilled|spilt|oil|dirt|dirty|filth|filthy|stain|grime|ash|ashes)\b/;

`janitor.ts:801`, in `readsMessage`:

    if (MESS_WORDS.test(heard)) {

and `janitor.ts:881`, where a message that fails it ends up:

    // Word that what it asked for has come, and where it is.
    brain.suppliesSentAt = at;
    brain.suppliesAt = placeNamedIn(brain, heard) ?? CARGO_LOBBY;
    brain.toldHeadAt = null;

`tasks.ts:261`, in `workInWords`:

    for (const [kind, words] of Object.entries(job.soundsLike ?? {})) {
      if (job.takes?.[kind] && words.test(heard)) {

## How it was found

Run. Two throwaway scripts in the scratchpad (`parse/work.ts`, `parse/jpda.ts`) built a janitor with `tools/llm_crew/fixtures.ts`, knowing the Bar, Kitchen, Library, Engineering, Dormitories and Medbay Central, holding a mop.

`workInWords` with the Captain (superior) saying the line:

| Captain says | Task made |
| --- | --- |
| clean the bar | nothing |
| can you clean the bar pls | nothing |
| go clean the kitchen | nothing |
| mop the bar | nothing |
| the bar needs cleaning | nothing |
| someone puked in the bar | nothing |
| vomited in the bar | nothing |
| bloodstains in the bar | nothing |
| theres glass all over the bar | nothing |
| trash everywhere in the bar | nothing |
| theres a puddle in the kitchen | nothing |
| the kitchen floor is sticky | nothing |
| tidy up the library / sweep the library | nothing |
| clean engineering | nothing |
| blood in the bar | clean Bar |
| someone threw up in the bar | clean Bar |
| the bar is a mess | clean Bar |

`readsMessage` with the same kind of line sent by PDA from the Captain:

| PDA from the Captain | Tasks | suppliesAt |
| --- | --- | --- |
| clean the bar pls | none | Bar |
| can you mop the kitchen | none | Kitchen |
| someone puked in the bar | none | Bar |
| the bar needs cleaning | none | Bar |
| mess in the bar | clean Bar | null |

So the janitor sets off for the Bar thinking its order from cargo is there (when it has no proper tool; `brain.ts:556` clears `suppliesSentAt` while it holds one, so a janitor with a mop simply ignores the call). Not seen in a round log.

## How to fix it

1. In `jobs/janitor.ts`, widen `MESS_WORDS`. Keep it one regular expression, tested on lower-case text:
   - the verbs of asking: `clean|cleaning|cleaned|mop|mopping|wipe|scrub|tidy|sweep`;
   - the forms of the nouns: let the stem match the start of a word, `\b(vomit|puk|spill|blood|trash|garbage|litter|puddle|sticky|gross|filth|dirt|grime|oil)\w*` (this takes in vomited, vomiting, puked, spills and bloodstains). Keep whole-word forms for the stems that begin other words: `mess(y|es)?\b` (not "messages"), `stain(s|ed)?\b` (not "stainless"), `ash(es)?\b` (not "ashley", "ashore"), `glass\b` (not "glasses"), `threw up|thrown up|throwing up`.
   - The checker tried one such expression on the lines above and on "thanks", "how is it going", "what you asked for has come. it is in the cargo lobby", "you have messages", "ashley wants you", "stainless steel", "my glasses are gone", "toilet", "bring the cleaner grenade": with `stain\w*` it took "stainless steel"; with the whole-word forms above it took every call and none of the rest. Note "cleaner" must not match: keep `clean` as `clean(s|ing|ed)?\b`.
   - Leave out `water` and `wet` on their own: "wet floor" is said of what the janitor itself left.
2. Make sure the wider list does not turn the janitor's own fixed lines into calls. The janitor's PDA reader only reads PDA messages, so check the fixed lines other crew send it by PDA: cargo's call ("mess in the X: ..." already matches), the head's "what you asked for has come" (must still not match: it has no mess word, keep it so), and `beyondRoom` (handled first). Grep `jobs/` for `message` tool texts sent to a janitor.
3. In `workInWords`, "clean" now also matches when a head says "I cleaned the bar earlier". That costs one walk (the comment there accepts this). If the owner wants it tighter, take the verbs only at the start of the line or after "please", "can you", "go", "pls". The wider list also makes PARSE-09 ("no need to clean the bar" taken as an order) come up more often: fix the two together, or at least test that line.
4. The fall-through to "supplies have come" is DESK-01's to fix; with both fixed, a call with no room named should be answered "Which room?" rather than dropped.

## How to test the fix

- Add a table to `tools/llm_crew/` (beside `addressing.ts`) that runs `workInWords` and the janitor's `readsMessage` over the lines above and wants `clean <room>` for each, and wants nothing for "thanks", "how is it going", "what you asked for has come and is in the Cargo Lobby".
- Simulator (new scenario, or an addition to `dead`): a scenario where the Captain sends the janitor "clean the bar pls" by PDA with the model dead; the janitor should go to the Bar with a mess task, not a supplies trip.
- Next round, grep `crew_brain.log` for `your PDA says what you asked for has come` and check each against `pda.log`: it should only follow the head's fixed message.
- Note for the table: `fixtures.ts` `janitor()` builds a brain with no `stowed` list, and `readsMessage` throws on it (`scrubberToHand`, `janitor.ts:132`) once a mess word matches. Set `b.stowed = []` in the table, or in the fixture.

## Check

Checked by Opus 5.5. Read and run; not seen in a round.

- The quotes match the code today: `MESS_WORDS` at `jobs/janitor.ts:220`, the test in `readsMessage` at line 801, the supplies fall-through at lines 881-884, `soundsLike: { [CLEAN]: MESS_WORDS }` at line 791, and the loop in `workInWords` at `tasks.ts:261`.
- Nothing else reads these lines first. In `ingest` (`brain.ts:578-598`) a PDA message goes to `readSummons`, `readPickup` and `readWanted`, then to the job's `readsMessage`; none of the three takes a mess call. For a spoken order, `workInWords` tries `soundsLike` and then `ORDER_SOUNDS` (`jobs/orders.ts:27`, look/check/inspect words only), so "clean the bar" falls through both.
- Ran a throwaway bun script (scratchpad `chk_parse01/t.ts`) with `tools/llm_crew/fixtures.ts`: `workInWords` with the Captain as superior gave nothing for "clean the bar", "go clean the kitchen", "mop the bar", "someone puked in the bar", "vomited in the bar", and `clean Bar` for "blood in the bar" and "the bar is a mess". The janitor's `readsMessage` (no cleaning tool) gave no clean task and `suppliesAt` Bar for "clean the bar pls" and "someone puked in the bar", and a clean task for "mess in the bar". This matches the write-up's tables.
- Checked that the head's fixed "what you asked for has come. It is in the X." (`head.ts:1298`) has none of the proposed words, so the wider list does not turn it into a call. A second script (`chk_parse01/re.ts`) tried a widened expression; see the note under step 1.
- Not in the change log as fixed. The owner's wish for loose wording is in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` M5 (about arrests); nothing there covers the janitor's words.
- Severity kept high: a typed call to a janitor in the plainest words fails every time it is sent by PDA, which is how the player calls one. Effort small: one expression in one file, plus a table.
