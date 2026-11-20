---
id: MEM-01
title: Any word of an NPC's name or job anywhere in a line is taken as said to it
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:95, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:48, tools/llm_crew/addressing.ts:40
fix: In saidTo rule 1 test that the line calls on the NPC (first or last name, or its whole job title, at the start, set off by a comma, or as the last word) instead of usesName, and drop the loose test
---

## What is wrong

See also: PARSE-14

Rule 1 of `saidTo` says a line is for this NPC if it "uses this NPC's name (or its job, if it serves at a post)". It is tested with `usesName`, which is true if **any part of the name longer than two letters appears anywhere in the line as a word**. The file's own comment on `callsOn` says why that is wrong ("there is a fire in the bar" does not call on Zim Fire), and rule 2 uses the strict `callsOn` for everyone else. Rule 1 does not, so the NPC itself is the one person in the room who is called on by its name merely being in the sentence.

The same goes for the job of a crew member with a post (cargo technicians, station engineers, security officers: `post_place` is set in `crew_npc_cargo.dm`, `crew_npc_engineering.dm`, `crew_npc_security.dm`). Every line with "cargo", "technician", "station", "engineer", "security" or "officer" in it is taken as said to that NPC.

What follows from `said_to: 'me'`: `shouldWake` in `brain.ts` wakes the model to answer, the report tells it "(... speaking to you)", the line goes to `overhears` for its job, and `buildTalk` reads orders out of it if the speaker is its superior. So:

- The NPC answers lines meant for someone else, and acts on them. The file's header gives exactly this as the thing to avoid ("asked 'Zim, open the door', it was a bot that went and opened it").
- Rule 2 never runs for it: a line that plainly calls on someone else ("Ann, ...") is still 'me' if the NPC's name or job word is further on.

Common English words are crew names. In `strings/names/`: first names May, Rose, Hope, Mark, Chase, Hunter; last names Cook, Wood, Stone, Hill, Young, King, Black, White, Brown, Green, Day, Baker, Hall, Bell, Price, Power, Best, Rose, Hunter. Round `round-09.12.44` had a cargo technician called "Victor Brown": any line with "brown" in it ("the brown crate") was his.

Concrete cases, run (see below), the Captain speaking to the Quartermaster Ann Moss four tiles from the NPC, turned away:

| NPC | Line | `saidTo` gives | Should be |
| --- | --- | --- | --- |
| Ben Fire, Janitor | "There is a fire in the bar" | me | nobody |
| Tom Cook, Cargo Technician | "Ann, have the cook make lunch" | me | other: Ann Moss |
| Tom Reed, Cargo Technician (post) | "Ann, order a mop through cargo" | me | other: Ann Moss |
| Eli Moor, Station Engineer (post) | "Chief Engineer, come here" (Chief Engineer in view) | me | other / nobody |
| Eli Moor, Station Engineer (post) | "Gus, the station is losing power" | me | other: Gus Lane |
| Ivy Hart, Security Officer (post) | "Ann, tell security nothing" | me | other: Ann Moss |
| May Rees, Janitor | "Ann, may I ask you something" | me | other: Ann Moss |

The "Engineer" in "Chief Engineer" case is a title inside a title: a Station Engineer takes every word to its head as its own.

The test table `tools/llm_crew/addressing.ts` checks the fire case only from the side of Amber Holt (`hears('There is a fire in the bar!', { from: josh })`, wanted `me` because Amber is alone with Josh), never from the side of an NPC whose own name is the common word. So the table passes.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:95`, in `saidTo`:

    if (
      usesName(lower, brain.name) ||
      (!!brain.post && usesName(lower, brain.job))
    ) {
      return { to: 'me' };
    }

`addressing.ts:48`, the loose test it uses:

    function usesName(heardLower: string, name: string): boolean {
      return nameParts(name).some((part) =>
        new RegExp(`\\b${part}\\b`).test(heardLower),
      );
    }

and `addressing.ts:65`, `callsOn`, the strict test rule 2 uses for everyone else, whose comment says "there is a fire in the bar" does not call on Zim Fire.

## How it was found

Read from the code, then run. A throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/addressing.ts` and called `saidTo` for each row of the table above; every row printed `me`. Not seen in a round log: nobody grepped a round for a case of it.

## How to fix it

1. In `saidTo`, rule 1: replace `usesName(lower, brain.name)` with a test that the line **calls on** the NPC: `callsOn(heard, brain.name)`, or its last name used the same way (`callsOn` only tries the first name part; add the last name as a second try, so "Cook, come here" still works). Also let `callsOn` take the name as the last word of the line ("come here tom", "over here Tom!"): people type that, the owner said on 2026-11-18 that typed words to the crew should be understood with loose wording, and without it a line that today reaches the NPC by rule 1 would fall to rule 4 and, with others about, to nobody. Do this for rule 2's other names too, so both sides agree.
2. For the job of a post-holder, call on the job the same way: at the start of the line or set off by a comma ("Hey, cargo technician, any mail?", "Officer, over here"). Match the whole job title, not one word of it, so "Engineer" does not match inside "Chief Engineer": test that the job is not preceded by "chief " or "head of " — better, test the other jobs in view first and take the longest title that matches (the same longest-first rule `placeNamedIn` uses for rooms).
3. Drop the loose `usesName` from rule 1 altogether. Keeping it as a fallback after rule 2 would bring back the fire case: "There is a fire in the bar" calls on nobody else, so the fallback would take it for Ben Fire again. "Have you seen Billy?" said beside Billy is already for Billy by rule 4 (beside, facing, or just talking). Build this with PARSE-14 (full names and one- or two-letter names, same lines); its fix cuts full names out before rule 1.
4. Add rows to `tools/llm_crew/addressing.ts` from the NPC's side: a janitor named "Ben Fire" hearing "There is a fire in the bar" across a room with others in it wants `nobody`; "Ann, have the cook make lunch" heard by "Tom Cook" wants `other:Ann Moss`; a Station Engineer hearing "Chief Engineer, come here" wants `nobody` or `other`; a cargo technician with a post hearing "Ann, order a mop through cargo" wants `other:Ann Moss`. Keep the existing `Hey, cargo technician, any mail?` case passing.

## How to test the fix

- `bun tools/llm_crew/addressing.ts` with the new rows; all old rows must still pass. Add rows that must stay `me`: "Cook, come here" and "come here tom" heard by Tom Cook with others in view and the speaker turned away; "Officer, over here" heard by a Security Officer with a post.
- In the next round, grep `crew_brain.log` for `speaking to you)` on lines that begin with another person's name followed by a comma: there should be none.

## Check

Checked by Opus 5.5. The quotes match the code today (`addressing.ts:40`, `:48`, `:65`, `:95`). `saidTo` is the one place `said_to` is set (`brain.ts:604`), before any job's `overhears` runs. I ran a throwaway bun script that imports `CrewBrain/addressing.ts` by absolute path and calls `saidTo` with a bare brain (name, job, post, people in view: the speaker, Ann Moss, Gus Lane and one more; speaker four tiles off, turned away) for all seven rows of the table: every row gave `{"to":"me"}`, as the write-up says. Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose the loose test for the NPC's own name; the file's own comment on `callsOn` says the fire case is wrong. Not a duplicate of PARSE-14 (confirmed): that one is full names and short names, and says this fix does not cure it. I changed the fix: the fallback in step 3 would have let the fire case back in, so it is dropped (rule 4 already covers a line said beside someone), and `callsOn` should also take a name at the end of the line, so the stricter rule does not lose "come here tom". Effort set to medium: the job-title matching and name-at-end change, plus new table rows in a second file, go past 20 lines. Severity stays medium. Not seen in a round.
