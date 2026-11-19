---
id: GAP-11
title: The light replacer (LLM_CREW_PLAN_LIGHTS.md), all six decisions accepted, none of it built
kind: gap
severity: medium
effort: large
confidence: sure
status: found
area: janitor
files: LLM_CREW_PLAN_LIGHTS.md:63, code/modules/llm_crew/crew_npc_senses.dm:304, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1, tgui/packages/tgui/interfaces/CrewBrain/jobs/reports.ts:1
fix: Build the plan's seven steps in its own order, starting with the server seeing dead fixtures by room
---

## What is wrong

`LLM_CREW_PLAN_LIGHTS.md` was settled on 2026-11-17 ("Yes, all six"): one janitor is given the lights by the Head of Personnel at the first staff meeting, anyone who sees a dead or missing light reports the room to the Head of Personnel once, the head passes rooms on to its light replacer, who fits lights by hand from a box of Replacement Lights that comes through cargo, and "Replaced 4 lights" becomes a third counted kind in a staff report.

Nothing of it exists. A search of `code/modules/llm_crew/`, `tgui/packages/tgui/interfaces/CrewBrain/` and `tools/llm_crew/` for `light` finds only the line that makes every body blind to fixtures:

    /obj/machinery/light,

in the list of things the eyes skip (`crew_npc_senses.dm:304`). So today a room with every tube smashed is, to the crew, a room with nothing wrong in it. Pun Pun and a station power event leave broken tubes behind in most rounds, and nobody says so or mends one. The one piece in place is that cargo can already order the Replacement Lights crate (`/datum/supply_pack/service/lightbulbs` in `orderable_crates`, `crew_npc_cargo.dm:31`), which nothing ever asks for.

## Where

The plan's build list, `LLM_CREW_PLAN_LIGHTS.md:63` to `:73`, and where each step would land:

| Step | Plan | Lands in | Today |
| --- | --- | --- | --- |
| 1 | Server sees dead fixtures, remembers them by room, sends each body the rooms and counts | `crew_npc_senses.dm` (`look_around`, the skip list at `:304`), a new list beside `mess_places()`, `crew_brain_link.dm` `ui_data` | fixtures skipped |
| 2 | One action: fit a light, with a count added to `work_done` | new tool in `handle_tool_call` (`crew_npc_tools.dm:13`), `work_done` at `crew_brain_link.dm:104` | none |
| 3 | Shared duty: any NPC with a PDA reports a room's dead lights to the Head of Personnel once | a new file beside `jobs/meetings.ts` and `jobs/wanted.ts` | none |
| 4 | The head: list of rooms, passing on, handing the job out at the meeting, ordering Replacement Lights | `jobs/head.ts` (`MeetingWay.before` is where the wanted list is read out: the hand-out goes beside it) | none |
| 5 | The janitor's duty when given: a task per room, fetch a box, word back | `jobs/janitor.ts` | none |
| 6 | A third counted kind | `jobs/reports.ts`, `tools/llm_crew/reports.ts` | cleaned, put away, crates, machines, arrests |
| 7 | Simulator fixtures and a scenario | `tools/llm_crew/sim.ts`, `fixtures.ts` | none |

## How it was found

Read from the plan (its first line says "nothing here is built") and confirmed by search. The memory note for this plan says "planned, not built".

## How to fix it

Follow the plan's section 4 in its order: each step can be checked before the next. Notes for whoever builds it, from reading today's code:

1. **Seeing.** A fixture's state is `status` on `/obj/machinery/light` (`LIGHT_OK`, `LIGHT_EMPTY`, `LIGHT_BROKEN`, `LIGHT_BURNED`) and what it takes is `fitting` (tube or bulb): read `code/modules/power/lighting/light.dm` before use. Keep skipping fixtures that are `LIGHT_OK`. A room with no power has fixtures that are fine and dark: the decided rule is that this is not the job, so go by `status`, never by whether the light is on.
2. **Fitting, with no cheats.** A player fits a light by clicking the fixture with the tube in hand, and gets the old one out by clicking it with an empty hand (a broken one cuts a bare hand: check `attack_hand` there). The plan wants the dead one put back in the box. The box is a storage item: taking a tube out is a click on the box with it in the other hand, or opening it. Use `click_as_body`, and `draw_item` in `crew_npc_forcing.dm` as the model for getting a thing out of a held container. Do not `new` a tube and do not set `status`.
3. **The hands.** Decided: the box is one hand, and with both full it puts down the cleaning tool it is not using in the Custodial Closet before it sets out. `changeForScrubbing` in `jobs/janitor.ts` already does this swap for a rag.
4. **The hand-out line** must be read by code from the janitor's own name ("Finn, the lights are yours from now on."), as the Quartermaster's "the counter is yours this shift" is (`jobs/supply.ts`, `jobs/cargo.ts` `roomsKeeper`). Copy that.
5. **Reporting** is the same shape as a sighting in `jobs/wanted.ts` (once for each room and spotter, by PDA, not while the receiver is in sight): copy its throttle. With GAP-06 in mind, the head's list of rooms must be built from the messages it receives, not shared in code.
6. **Prompt budget.** Do not add lights to every prompt. The light replacer's task text is enough.

Depends on: GAP-10 (the decided answer to "bucket or box" is that the light replacer wets its mop at a sink or pulls the cart, and the cart is not built).

Questions for the owner: none new. The items in the plan's section 3 marked **Proposed** "have not been gone through one by one", so anything in section 3 that turns out awkward is the owner's to change.

## How to test the fix

The plan's own checks (section 4, step 7): exactly one janitor is given the job, at the first meeting; a technician's report goes to the head and not to a janitor; the head passes it on once; the light replacer gets a box through cargo when there is none; the lights get fitted; the count in its report is the server's; nobody else fits a light. Then a watched round, with a few tubes broken by hand, reading `game.log` and `pda.log` for "Lights out in".
