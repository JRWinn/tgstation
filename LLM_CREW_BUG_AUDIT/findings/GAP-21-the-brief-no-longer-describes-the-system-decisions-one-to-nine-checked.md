---
id: GAP-21
title: The brief no longer describes the system, its nine decisions checked against today's code (three reversed on purpose and never written into it, three quietly untrue)
kind: gap
severity: low
effort: small
confidence: sure
status: found
area: design
files: LLM_CREW_BRIEF.md:9, tgui/packages/tgui/interfaces/CrewBrain/person.ts:9, tgui/packages/tgui/interfaces/CrewBrain/choice.ts:1, code/modules/llm_crew/crew_npc_spawn.dm:29, CLAUDE.md:14
fix: Rewrite sections 2, 5 and 6 of the brief to say what is true now, with the date and the owner's words for each reversal, and list what the brief promised that is still unbuilt
---

## What is wrong

`CLAUDE.md` tells every new session that `LLM_CREW_BRIEF.md` is "what the project is and what was decided". The brief was last changed in the first commit (`82810bef671`) and still describes milestone 1. A new engineer or agent who reads it will build to rules the owner has since overturned. Each of the nine decisions in its section 2, against today's code:

| # | The brief says | Today | Verdict |
| --- | --- | --- | --- |
| 1 | /tg/station, this repo | Yes | Holds |
| 2 | "The LLM decides what to do... It is never handed a menu of goals to pick from." | Each job's `plan()` decides. The LLM is asked what to say, and `choice.ts` hands it a lettered menu of 2 to 4 ready jobs to put first | **Reversed on purpose**, twice (2026-11-16 "nuke the LLM", partly back on 2026-11-17). Recorded in the plans only as a premise ("Decided: code does the work and the LLM is the voice", security plan line 47, engineering plan line 16) and in the owner's memory notes. Not in the brief |
| 3 | "Actions are tools. The LLM acts by calling tools with free parameters." | `driver.ts` sends the tool calls. The LLM is offered at most a couple (`offers` on a job: cargo's `order`, leading someone to a place) | **Reversed on purpose**, with 2 |
| 4 | "Senses only... No hidden shared data channel between NPCs... its headset's radio channels" | Shared lists between workmates in window and server (GAP-06). The server tells bodies why a fire alarm is on (GAP-05). No body hears the radio: the security and engineering plans both leave radio out | **Quietly untrue** in part. The radio half was never built |
| 5 | Client-hosted brains, the client relays to a local LLM | Yes: `fetch` to Ollama from the window (`brain.ts:1704`). The section 5 "Unproven" link is proven. But the *plans* run in the client too now, not only the model, so the owner's client decides orders, arrests and doors. The server bounds each tool by job and ID (`tool_arrest`: security only, never the Captain; `tool_order`: cargo only, the budget), which is the brief's section 7 rule, and it holds | Holds, with more riding on it than the brief knew |
| 6 | "NPC cards. Each NPC is defined by a text file on the player's PC ... uploaded to the server at spawn so admins can review it" | `person.ts:9`: "Person cards are hardcoded for testing. They will later be files on the player's PC". `pickPersonCard(npc.name)` picks one of the built-in personalities. The fixed prompt is logged to `crew_brain.log` (`kind: card`), which is the admin review half | **Not built** |
| 7 | Multiple NPCs per player, each with its own card and its own separate context | Eleven per player works. Contexts are not fully separate: module-level lists are shared between brains (GAP-06) | **Quietly untrue** in part |
| 8 | Behaviour trees are the motor layer and do not choose goals | Yes (`crew_npc_controller.dm:4`, `crew_npc_motor.dm`) | Holds |
| 9 | "If the owner's LLM is missing, slow or disconnected, the NPC keeps running on default behavior without personality." | A dead model: better than promised, the coded job goes on. A closed or reloaded window: every job stops and all memory is lost (GAP-12) | **Quietly untrue** for the window |

Section 6's acceptance checks, read in the code and not run:

- "Two NPCs left together do not chat endlessly": met, four ways (`MAX_REPLIES_PER_TALK`, `FELLOW_REPLY_EVERY_DS`, `REMARKS_UNANSWERED_MAX` in `brain.ts`, and the server's `CREW_NPC_SAY_COOLDOWN` of 4 seconds in `tool_say`).
- "Speech cooldown": met (`crew_npc_tools.dm:162`), with a 200 character limit and the word filter.
- "Closing the brain window leaves the NPC wandering silently, with no errors": wandering, yes. See GAP-12 for what else is left hanging.
- "Meeting the same character again does not produce a second introduction": the brain's record of who it has met is lost on a window reload, so everyone is introduced again after one.

Section 7, read in the code:

- "Validate tool names, parameters and rates server-side": names by a fixed list (`crew_npc_tools.dm:13`), 8 calls in 10 seconds a body (`tool_call_allowed`), 40 log records in 10 seconds a window, text trimmed and filtered. One soft spot: a PDA message has no limit of its own, so a body can send 8 in 10 seconds for as long as its window says to.
- "Everything an NPC hears is untrusted": rank comes from the ID a person carries (`crew_npc_is_command`, `answers_to`) for speech, and from the name and job on the PDA list for messages. Orders are read by code. Met as far as read.
- "One GPU serves requests one at a time": met (one queue, `pump` in `brain.ts`).
- "Thinking mode ... has not been tested": settled, `think: false` in every call (`brain.ts:1712`).
- "Upstream merges ... touch existing files as little as possible": three base files touched, and one of them changes the game for everyone (`attack_paw` now raises the attacked signal for a monkey's bite). GAP-01 as first planned would have been a fourth and now is not.

Section 8, "not in milestone 1", still not built today: the NPC card file format and upload, memory saved between rounds, a player-facing spawn UI and per-player limits (spawning is three admin verbs, `R_SPAWN`, `crew_npc_spawn.dm:29`), a host-side fallback brain, radio. PDA senses and job skills are built.

The other handoff note, `LLM_PROMPT_FIXES.md`, is done and can be marked so: the reply format is enforced by a schema (`format: schema`, `brain.ts:1720`), "Nothing." is dropped (`prompt.ts:320`), notes are compared and capped (`addNote`, `NOTES_MAX`, `NOTES_SHOWN` in `memory.ts`), the prompt is split by kind of moment (`talk.ts`), an idle remark is decided in code (`brain.ts:872`), and the replay set exists (`tools/llm_crew/voice.ts`, `runs/before.json` and `after.json`). Its last step, a side-by-side with Claude Haiku, the owner declined ("No Haiku").

## Where

`LLM_CREW_BRIEF.md:12`:

    2. **The LLM decides what to do; the server knows how to do it.** The LLM receives what its body senses and chooses its own goals. It is never handed a menu of goals to pick from.

`tgui/packages/tgui/interfaces/CrewBrain/person.ts:9`:

    * Person cards are hardcoded for testing. They will later be files on the player's PC, one per NPC.

## How it was found

Read the brief, then looked for each decision in the code. `brain.ts` was read in parts, not in full.

## How to fix it

One sitting, documents only, after asking the owner to confirm the wording of each reversal:

1. In `LLM_CREW_BRIEF.md` section 2, keep the nine numbers and under each of 2, 3, 4, 6, 7 and 9 add "**As it stands, DATE:**" with what is true now and the owner's words where there are any ("I knew internally to nuke the LLM... the randomness is killing us"; "I want to take it back to the LLM deciding what job to do").
2. Add the rules the audit's `README.md` lists under "The project's rules" as the brief's new section 2a: they are the real decisions now (no cheats, code does the work, senses only, an example is not the scope, nobody lays a hand on the Captain or a head, supplies through cargo, the prompt is a budget, the owner decides).
3. Replace section 5 (one decision cycle) with the real one: sense events to the window, `ingest`, `syncTasks`, `plan`, `driver.ts` sends a tool call, the result comes back as a sense event, and the model is called for talk and for the choice between ready jobs.
4. Replace section 6 with a pointer to the change log and the plans, and move its acceptance checks to a short "still true?" list.
5. Add a section "Promised and not built", pointing at this audit's gaps.
6. Mark `LLM_PROMPT_FIXES.md` done at its top, with the file names above.

Questions for the owner: are NPC cards as files (decision 6) and other players owning NPCs (the vision in section 1) still wanted? If yes, GAP-06 and GAP-12 matter more than they look, because both only show with a second owner or a second window.

## How to test the fix

Nothing to run. A reader new to the project should be able to say, from the brief alone, who decides what a janitor does next, and get it right.
