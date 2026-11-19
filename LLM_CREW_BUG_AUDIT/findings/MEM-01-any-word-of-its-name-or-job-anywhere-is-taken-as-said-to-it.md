---
id: MEM-01
title: Any word of an NPC's name or job anywhere in a line is taken as said to it
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:95, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:48, tools/llm_crew/addressing.ts:40
fix: In saidTo rule 1 use callsOn for the NPC's own name and job, not usesName, and keep usesName only as a tie-break when no one else is called on
---

## What is wrong

Rule 1 of `saidTo` says a line is for this NPC if it "uses this NPC's name (or its job, if it serves at a post)". It is tested with `usesName`, which is true if **any part of the name longer than two letters appears anywhere in the line as a word**. The file's own comment on `callsOn` says why that is wrong ("there is a fire in the bar" does not call on Zim Fire), and rule 2 uses the strict `callsOn` for everyone else. Rule 1 does not, so the NPC itself is the one person in the room who is called on by its name merely being in the sentence.

The same goes for the job of a crew member with a post (cargo technicians, station engineers, security officers: `post_place` is set in `crew_npc_cargo.dm`, `crew_npc_engineering.dm`, `crew_npc_security.dm`). Every line with "cargo", "technician", "station", "engineer", "security" or "officer" in it is taken as said to that NPC.

What follows from `said_to: 'me'`: `shouldWake` in `brain.ts` wakes the model to answer, the report tells it "(... speaking to you)", the line goes to `overhears` for its job, and `buildTalk` reads orders out of it if the speaker is its superior. So:

- The NPC answers lines meant for someone else, and acts on them. The file's header gives exactly this as the thing to avoid ("asked 'Zim, open the door', it was a bot that went and opened it").
- Rule 2 never runs for it: a line that plainly calls on someone else ("Ann, ...") is still 'me' if the NPC's name or job word is further on.

Common English words are crew names. In `strings/names/`: first names May, Rose, Hope, Mark, Chase, Hunter; last names Cook, Wood, Stone, Hill, Young, King, Black, White, Brown, Green, Day, Baker, Hall, Bell, Price, Power, Best, Rose, Hunter. Round `round-09.12.44` had a "Victor Brown" and a "Lance Cooper".

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

1. In `saidTo`, rule 1: replace `usesName(lower, brain.name)` with a test that the line **calls on** the NPC: `callsOn(heard, brain.name)`, or its last name used the same way (`callsOn` only tries the first name part; add the last name as a second try, so "Cook, come here" still works).
2. For the job of a post-holder, call on the job the same way: at the start of the line or set off by a comma ("Hey, cargo technician, any mail?", "Officer, over here"). Match the whole job title, not one word of it, so "Engineer" does not match inside "Chief Engineer": test that the job is not preceded by "chief " or "head of " — better, test the other jobs in view first and take the longest title that matches (the same longest-first rule `placeNamedIn` uses for rooms).
3. Keep the loose `usesName` only after rule 2 has run and found nobody else called on, and only when there is no one else in view whose name is also in the line: "Have you seen Billy?" said beside Billy is still for Billy.
4. Add rows to `tools/llm_crew/addressing.ts` from the NPC's side: a janitor named "Ben Fire" hearing "There is a fire in the bar" across a room with others in it wants `nobody`; "Ann, have the cook make lunch" heard by "Tom Cook" wants `other:Ann Moss`; a Station Engineer hearing "Chief Engineer, come here" wants `nobody` or `other`; a cargo technician with a post hearing "Ann, order a mop through cargo" wants `other:Ann Moss`. Keep the existing `Hey, cargo technician, any mail?` case passing.

## How to test the fix

- `bun tools/llm_crew/addressing.ts` with the new rows; all old rows must still pass.
- In the next round, grep `crew_brain.log` for `speaking to you)` on lines that begin with another person's name followed by a comma: there should be none.
