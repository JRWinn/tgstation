---
id: KNB-16
title: The change log's last line says the dropped-crates plan is not built and the no-cheats plan is built only for the mail chute, and the no-cheats plan says nothing in it is built
kind: bug
severity: low
effort: small
confidence: sure
status: duplicate
duplicate_of: GAP-26
found_by: Opus 5.5
area: logs
files: LLM_CREW_CHANGELOG.md:1124, LLM_CREW_PLAN_NO_CHEATS.md:3, LLM_CREW_PLAN_DROPPED_CRATES.md:9
fix: Rewrite the last line of the change log from the plans' Status sections, and give the no-cheats plan a Status section that says what is built
---

## What is wrong

The project's record of what is done misleads whoever picks the work up. `CLAUDE.md` sends every session to the change log and to "Plans, each with a Status section". Two of those are wrong about what is built.

1. **The change log's "Earlier work" table ends:**

       Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute), `LLM_CREW_PLAN_DROPPED_CRATES.md`, `LLM_CREW_PLAN_LIGHTS.md`.

   - `LLM_CREW_PLAN_DROPPED_CRATES.md` was built at 09:20 the same day: its own Status section says "**Built 2026-11-18.**", and the 09:20 entry is "crates that get away, and crates in the way (the commit that added `crew_npc_grip.dm`)".
   - From `LLM_CREW_PLAN_NO_CHEATS.md` more than the mail chute is built. The 13:30 entry took out the water cheat: "(7) Wetting is honest. The mop is held to the sink a click at a time ... The `add_reagent` top-up is gone." A janitor also carries a bucket now (plan section 4.4, part built).
   - Only `LLM_CREW_PLAN_LIGHTS.md` is rightly listed (see GAP-11).

2. **`LLM_CREW_PLAN_NO_CHEATS.md` has no Status section.** Its third line still says "**Planning only: nothing here is built.**" and "**Do not start until the project owner says it is this plan's turn.**" The only status in it is one line inside section 4.1, for the mail chute. A session reading the plan is told to build water carrying from scratch and to wait for a go-ahead that the owner gave long ago ("all eleven decisions accepted 2026-11-18").

Concrete case: earlier findings in this audit took that last line at its word. KNB-04, KNB-05 and KNB-06 each quote it as "Planned and not built ... (all but the mail chute)". KNB-06 has to add by hand that "The water cheat in the same table was taken out in the 13:30 entry". A fixer who reads only the line would rebuild the regrip work in `crew_npc_grip.dm` or the honest wetting in `wet_mop`.

## Where

`LLM_CREW_CHANGELOG.md:1124`, quoted above.

`LLM_CREW_PLAN_NO_CHEATS.md:3`:

    Written 2026-11-18. **Planning only: nothing here is built.** Items marked **Decided** are the project owner's. ...

`LLM_CREW_PLAN_DROPPED_CRATES.md:9`:

    **Built 2026-11-18. Server compile, type check and simulator only. Not played in a round.**

## How it was found

Read: the change log's older half in full, and the Status sections of the two plans. No code was needed.

## How to fix it

1. Replace the last line of `LLM_CREW_CHANGELOG.md` with one that goes by each plan's Status: "Planned and not built: `LLM_CREW_PLAN_LIGHTS.md`. Part built: `LLM_CREW_PLAN_NO_CHEATS.md` (the mail chute, honest wetting, a bucket carried; not the cart, the doors, the shuttle, unpacking or the galoshes)." Check each against the code before writing it: KNB-04, KNB-05 and KNB-06 say which cheats are still in.
2. Give `LLM_CREW_PLAN_NO_CHEATS.md` a `## Status` section under its title, in the form the other plans use: what is built, by which change log entry, what is not, and that the owner's go-ahead was given. Strike "Planning only: nothing here is built" and "Do not start until ...".
3. This is a change to the change log and a plan, not to crew code, so per `CLAUDE.md` no new change log entry is needed beyond the corrected line, but say in the commit what was corrected.

## How to test the fix

Nothing to run. Read the new line against `grep -n "^## Status" -A3 LLM_CREW_PLAN_*.md` and against the findings named above.
