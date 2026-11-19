---
id: GAP-26
title: Six plans still open with "Planning only, nothing here is built", the no-cheats plan has no Status section, and the change log's summary calls two built plans unbuilt
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: logs
files: LLM_CREW_PLAN_NO_CHEATS.md:3, LLM_CREW_CHANGELOG.md:1124, LLM_CREW_PLAN_ENGINEERING.md:3, LLM_CREW_PLAN_SECURE_AREAS.md:3, LLM_CREW_PLAN_MEETING_FOLLOWUPS.md:3, LLM_CREW_PLAN_SECURITY.md:3
fix: Give the no-cheats plan a Status section at the top that says what is built (4.1, the mail chute, the water half of 4.4), change the six opening lines to point at the Status, and correct the change log's summary in a new top entry
---

## What is wrong

Also written up as: KNB-16

What KNB-16 adds, kept here: the no-cheats plan's line 3 also says "**Do not start until the project owner says it is this plan's turn.**", though the owner's go-ahead was given ("all eleven decisions accepted 2026-11-18"); strike that too and say in the new Status that the go-ahead was given. The dropped-crates plan was built at 09:20 the same day (the entry "crates that get away, and crates in the way", the commit that added `crew_npc_grip.dm`). Concrete case of harm already done: earlier findings in this audit took the change log's last line at its word. KNB-04, KNB-05 and KNB-06 each quote it as "Planned and not built ... (all but the mail chute)", and KNB-06 has to add by hand that the water cheat was taken out in the 13:30 entry. Before writing the corrected summary line, check each item against the code: KNB-04, KNB-05 and KNB-06 say which cheats are still in.

`CLAUDE.md` sends every new session to the plans, "each with a Status section", and to the change log. Those are what a fixer reads first to learn what is built. Three of the places they would look say the wrong thing.

1. **The no-cheats plan has no Status section and says nothing is built.** Its third line is "**Planning only: nothing here is built.**" Since then, by the change log and the code:
   - 4.1 (careful step near slippery things, nothing sensed while in a pipe) is built: there is a one-line "Status, 2026-11-18" buried at line 105 inside section 4.1;
   - the mail chute fault it was written for is built (memory notes and the change log's 09:40 entry);
   - half of 4.4 is built: honest wetting at a sink, a hand bucket fetched, filled and carried (change log 13:30, item 7). The plan does not say so anywhere.
   Someone who takes the third line at its word will build 4.1 or the bucket a second time; someone who reads only line 105 will think 4.4 is untouched. The items still to do (4.2, 4.3, the cart in 4.4, 4.5 to 4.9) are written up one by one in GAP-01 to GAP-04 and GAP-07 to GAP-10, but the plan itself does not say which they are.

2. **The change log's summary line is wrong about two plans.** Its last line, under "Earlier work":

       Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute), `LLM_CREW_PLAN_DROPPED_CRATES.md`, `LLM_CREW_PLAN_LIGHTS.md`.

   `LLM_CREW_PLAN_DROPPED_CRATES.md`'s own Status says "**Built 2026-11-18.** Server compile, type check and simulator only", and the code has it (`crew_npc_grip.dm`, the regrip and put-clear). The no-cheats plan is more than the mail chute, as above. Only the lights plan is truly unbuilt (GAP-11).

3. **Five more plans open with the same "Planning only: nothing here is built"** though each was built and has a Status saying so lower down: `LLM_CREW_PLAN_ENGINEERING.md` (Status is section 8, at line 238, the end of the file), `LLM_CREW_PLAN_SECURE_AREAS.md`, `LLM_CREW_PLAN_MEETING_FOLLOWUPS.md`, `LLM_CREW_PLAN_SECURITY.md` ("and it is not to be built until the owner says so"), and `LLM_CREW_PLAN_LIGHTS.md`, where it is true. Read top-down, the first thing each says is false.

None of this changes what the crew does. It changes what the next engineer does, and the audit's README sends them to these files.

## Where

`LLM_CREW_PLAN_NO_CHEATS.md:3`:

    Written 2026-11-18. **Planning only: nothing here is built.**

`LLM_CREW_PLAN_NO_CHEATS.md:105`, the only status line in that plan:

    - **Status, 2026-11-18:** built the same night the Quartermaster was posted through the chute (`round-01.53.17`), compiled and not played. Built: walking wherever the next step may be onto a slippery tile, ...

`LLM_CREW_CHANGELOG.md`, its last line, quoted above. `LLM_CREW_PLAN_DROPPED_CRATES.md:9`: "**Built 2026-11-18.**"

`LLM_CREW_PLAN_ENGINEERING.md:3` against `:240`: "Planning only: nothing here is built." against "Stage 1 built 2026-11-18."

## How it was found

Read every plan's opening and Status sections against the change log's entries and its summary line. `grep -n "Planning only" LLM_CREW_PLAN_*.md` lists the six openings.

## How to fix it

1. `LLM_CREW_PLAN_NO_CHEATS.md`: add a `## Status` section under the title, in the shape the other plans use: built (4.1 and the mail chute, with the date and "compiled, not played"; 4.4's honest wetting and hand bucket, from the 13:30 entry), not built (4.2, 4.3, the cart and the rest of 4.4, 4.5, 4.6, 4.7, 4.8, 4.9), and for each unbuilt item the audit finding that holds its fix (GAP-08, GAP-09, GAP-10, GAP-04, GAP-02, GAP-01, GAP-03, GAP-07). Change line 3 to "Written 2026-11-18 as a plan; see Status for what is built."
2. The other five: change "**Planning only: nothing here is built.**" to "Written as a plan before it was built; see Status." Move the engineering plan's Status from section 8 to the top, as the others have it.
3. The change log: by the file's own rule, add a short entry at the top that corrects the summary line (the dropped-crates plan is built; the no-cheats plan is built in part, see its Status), rather than editing an old entry.
4. Ask the owner whether `CLAUDE.md` should say "read the plan's Status section, not its opening lines".

## How to test the fix

`grep -n "Planning only" LLM_CREW_PLAN_*.md` prints only the lights plan. `grep -n "^## Status" LLM_CREW_PLAN_*.md` prints one line for each of the eleven plans.
