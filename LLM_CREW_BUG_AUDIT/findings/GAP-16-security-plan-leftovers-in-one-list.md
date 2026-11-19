---
id: GAP-16
title: Security, what the two plans decided or proposed and is still not built, in one list
kind: gap
severity: medium
effort: large
confidence: sure
status: found
area: security
files: LLM_CREW_PLAN_SECURITY.md:159, LLM_CREW_PLAN_ROUND_1428_SECURITY.md:12, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1, code/modules/llm_crew/crew_npc_security.dm:1
fix: Take the small ones (cuffs collected, a freed prisoner seen out, the sighting answered, a follow order) in one sitting and put the rest to the owner as a list
---

## What is wrong

`LLM_CREW_PLAN_SECURITY.md` and `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` are mostly built. What is left is spread over section 3.0 of the first, the Status of the second, and five change log entries. This is the one list, each checked against today's code by search. GAP-05 (fire doors), GAP-13 (someone down), GAP-14 (janitors putting people out) and GAP-15 (loose wording) are the larger ones and have their own files.

**Decided by the owner, put off by the owner. Not to be built without asking:**

| Item | Where it is recorded | Today |
| --- | --- | --- |
| Laws: what can be declared, and the time for each | Security plan section 5, "We will come up with laws later" | The reason on a warrant is whatever was said. 5 minutes unless said, 15 at most (`jobs/security.ts`) |
| Reactions by personality: arguing, running, fighting when arrested | Section 5, "random reactions based on personalities" | Every crew NPC stands still and goes along (`being_arrested`) |
| Lethal weapons only in high-level situations | 14:28 plan, under C1, "TODO, the owner's" | No gun is used. The disabler and flash are kept as trade tools and never fired |
| Handing weapons out from the armoury | 14:28 plan, under C1, the owner's ideas | Not built: the lockers work now, so not needed |

**Proposed and accepted with the plan ("just go with your gut"), not built:**

| Item | Plan | Today |
| --- | --- | --- |
| The officer answers the first sighting: "On my way to the Bar." | 3.4 | Nothing answers a sighting (3.0). Whoever sent it does not know it was read |
| A report from someone who works in a locked room counts as sending for security | 3.5 | Not built. The let-in ask to keepers (`letInStep`) came instead, and cargo opens for security (`mayPass`). No other department's staff open a door for it: the 16:50 entry's "Anyone but a cargo technician or the Captain opening a door for security" |
| The officer collects its cuffs from the cell when the time is up | 3.8, 3.9 | It takes another pair from a locker (3.0). One arrest uses up one pair for good: the plan's risk "One pair of cuffs" |
| A freed prisoner still in the brig a minute later is seen out | 3.9 | "The rules already built may do it. Not tried." Nothing new |
| Recharging the baton | section 5 stage 3, risk "about ten baton hits in a round" | Not built. After about ten hits security cannot arrest by force for the rest of the round, and says "no baton that works" |
| Stage 2: the records console, the PDA records program, Officer Beepsky | section 5 | Not built. The plan's warning still stands: setting a crew NPC to "Arrest" at a console has Beepsky cuff it and leave it |
| A follow order ("follow me", "follow X") | 14:28 plan, M4 | Voice only: the officer is told to say it cannot. No order |
| Getting into the Bar (H8) | 14:28 plan | A body cannot climb a table. The 20:19 entry mends the door choice and has an engineer force a door, which is not the same |
| L3, L4 of the 14:28 plan | its Status line | Not built |
| A wanted person hears the list read at a meeting they stand in | 16:50 entry, "Not built" | Only the PDA copy leaves their name off (`wantedAbsent`) |
| An engineer forcing its way through a room in between | 20:19 entry | Says which room is in the way and stops |
| Where the officer looks with no fresh word | 20:19 entry, "the owner's to decide" | Walks rooms with "Primary Hallway" in the name only |
| A hurt officer defending itself against someone who follows it | 20:53 entry, "the owner's to say" | Walks away and is hit |

**Never tested against the real model** (every security entry says "No model tests"): the question put to the LLM to read a loose order, and every new fixed line's effect on the voice. `tools/llm_crew/voice.ts` has no security cases (14:15 entry: "The new lines have no cases in voice.ts").

One case to show these are not only paper: the officer arrests Pun Pun and leaves it cuffed in Cell 1. Fifteen minutes later the door opens, the monkey walks out with the cuffs still on the cell floor or on its wrists. A second warrant sends the officer to the lockers for another pair (`wantsKit` in `jobs/arrests.ts`). MetaStation's security lockers hold a fixed number. After a few arrests "I have no cuffs" is the answer for the rest of the round, and the plan's 3.9 ("looks in at the cell and collects its cuffs if they are there") is what would have stopped it.

## Where

`LLM_CREW_PLAN_SECURITY.md:159` to `:168` (the departures), `:366` to `:399` (later stages), `:481` to `:495` (risks). `LLM_CREW_PLAN_ROUND_1428_SECURITY.md:12`. Change log entries 14:15 ("Not built"), 15:40, 16:50, 20:19, 20:53.

Checked by search of `tgui/packages/tgui/interfaces/CrewBrain/` and `code/modules/llm_crew/`: no "On my way to the" outside the meeting code (`jobs/meetings.ts:88`), no recharger or `cell_charger` anywhere, no `follow` tool in `handle_tool_call` (`crew_npc_tools.dm:13`), no records program read.

## How it was found

Read from the plans and the change log, with a search of the code for each row. The procs themselves were not read end to end: other reviewers have `crew_npc_security.dm` and `jobs/arrests.ts`.

## How to fix it

In the order I would take them. Each of the first four is small and stands alone.

1. **Cuffs collected.** `jobs/arrests.ts`: when a cell's time is up (`desk.held[name].until`, or the officer's own note of when it shut the door), a task "look in at Cell N" under everything else. Server: cuffs on the cell floor are picked up by the existing `pick_up`. A prisoner still wearing them and standing for it has them taken off by `take_cuffs_off`.
2. **The sighting answered.** `jobs/desk.ts` where a sighting is taken: reply once per warrant to the first sighting that changes where the officer is sent, "Captain, I have that: Pun Pun, the Bar." Use the read-back form, not "On my way": with a Head of Security it is not the one walking.
3. **A freed prisoner seen out.** A prisoner whose time is up and who is still in the brig after a minute is a visitor whose welcome has ended: `leavingStep` in `jobs/guarding.ts` already walks such a person out. Check `belongs_in_post` stops returning TRUE for them once the timer is off (`crew_npc_cell_holding` returns null), then it follows by itself. Try it in the simulator before writing code.
4. **A follow order.** A new order in `jobs/orders.ts` beside `LOOK`: walk to the named person every few seconds while they are in sight, until told to stop or five minutes pass. General, any job, from the Captain or its own head.
5. **Recharging the baton.** A recharger is a machine in the Security Office: put the baton in (a click), take it out when charged (a click). `security_state` already sends whether the baton works. Do it when the charge is under a third and no warrant is being served.
6. **Voice cases.** Add the security lines to `tools/llm_crew/voice.ts` and run the reading question on the real model with the graphics card free.
7. Put the rest (laws, reactions, records and Beepsky, lethal force, where to look, the hurt officer) to the owner as questions. They are design, not leftovers.

## How to test the fix

- `tools/llm_crew/security.ts` for each new fixed line and its reader.
- Simulator: `warrant` extended past the cell's time, checking the cuffs come back and a second arrest needs no trip to the lockers. `pardon` for the freed prisoner leaving the brig.
- Server compile. In a round: `grep -n "cuffs" game.log` after a cell opens.
