---
id: GAP-19
title: Engineering lights the engine and nothing else, no power call is taken and no fault is handed on between jobs (engineering plan stages 2 and 3, and the owner's lights-out example)
kind: gap
severity: medium
effort: large
confidence: sure
status: found
area: engineering
files: LLM_CREW_PLAN_ENGINEERING.md:170, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:1, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:170, tgui/packages/tgui/interfaces/CrewBrain/jobs/engine.ts:111
fix: Build stage 2 as a shared reporting duty plus a list of calls on the Chief Engineer, starting with the one call the game makes easy, a room's breaker that is off
---

## What is wrong

`LLM_CREW_PLAN_ENGINEERING.md` stage 1 (the engine) is built. Its Status says: "Not built: stages 2 and 3 (section 5)." Those were "not to be built until stage 1 has been played in a round". Stage 1 has now been played: the 13:32 round's notes say "the engine was lit at 13:36" and "power and PDA messages lasted the whole round". So stage 2 is due, and nothing has started it.

Stage 2 is the owner's own example from 2026-11-16, recorded in the plan's section 1 and in the design notes as "diagnostics": "a fault is looked into and handed on between jobs. The lights are out, the janitor checks the bulb, says the power is out, and calls engineering." And the plan's decided line: "a room that is dark with every tube intact is the power being off. That is engineering's business, not the light replacer's."

What stage 2 says, and what exists:

| Stage 2 item | Today |
| --- | --- |
| The Chief Engineer learns of a room without power from the alert console in its office, or from anyone who tells it | It reads the engine monitor on its PDA and nothing else. A PDA message "the power is out in the Bar" from the Captain is not read by any code: the 16:50 entry notes the Captain's "There is a firelockout in the kitchen that needs to be opened" to the Chief Engineer "got no answer at all" |
| Any crew NPC that finds a room dark with its tubes intact tells the Chief Engineer by PDA, once | No body sees light fixtures at all (GAP-11), or whether a room has power |
| The Chief Engineer keeps a list of calls and gives them to the engineer one at a time | The only job it gives is the engine, and (since 18:50) a door to force for security (`jobs/forcing.ts`) |
| The engineer goes, reads the room's power controller, turns on a breaker that is off, reports anything else | No tool for an APC. `tool_work_machine` works the engine room's named machines |
| Gravity: after the blackout event the generator's breaker is off, the engineer turns it back on | Not built |
| The engineer reports calls answered at the meeting, counted by the server | `work_done` has `machines_set` only |

Stage 3 (a dead cell swapped, a generator hauled, solars, a radiation suit, radio, a second engineer) is further off and needs bodies to put on clothes, which no body can.

One more thing in the same plan that the rules ask about: the engine checklist is data for one map. `jobs/engine.ts:111`: "MetaStation's supermatter engine, on nitrogen. Traced from the map's pipes". On any other map `lightingSteps` finds no steps and the engineer says `UNKNOWN_ENGINE` ("I do not know this engine"), which is what the plan decided, so it is honest. But it means that off MetaStation the engineering staff do nothing at all for the round, since the engine is their only job.

One case: a random event (a grid check, or an APC fault) cuts the Cargo Bay's power 20 minutes in. The supply console is dead. A player could order nothing. The technicians go on ordering at it all the same, because the crew code does not test the console (GAP-20), so nobody even notices, and nobody tells engineering. Once GAP-20 is mended the orders will rightly fail, and this gap is then what stands between a dead console and a mended one. The Chief Engineer's monitor shows a healthy engine, so its meeting reports "the engine is at 100 percent integrity". The owner's memory note "station power fails early" tells the next reader to "check power ... before blaming the brain", which is the workaround for this gap.

## Where

`LLM_CREW_PLAN_ENGINEERING.md:174` to `:181` (stage 2), `:183` to `:190` (stage 3), `:253` ("Not built").

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:184`:

    // An engine room it has no steps for is not one it lights by guesswork.
    if (lighting(engine) && !lightingSteps(brain.machines)) {
      stick(brain, engine, UNKNOWN_ENGINE);
    }

## How it was found

Read from the plan and a search of both code trees for APC, breaker, gravity and "power". `jobs/chiefengineer.ts` and `jobs/engineer.ts` were read only at their task lists and headers.

## How to fix it

Stage 2 in four steps, each checkable alone. It reuses what exists: the reporting duty is the shape of a sighting (`jobs/wanted.ts`), the list of calls and the hand-down are the shape of the door-forcing chain (`jobs/forcing.ts`), and working a machine by click is `tool_work_machine`.

1. **Seeing a dead room (server, medium).** A body can see that a room's lights are off and that its machines are dark. The honest test is what a player sees: the room's APC in view with its "no power" look (`/obj/machinery/power/apc`: read `code/modules/power/apc/` for the state a player sees on the sprite: charging, not charging, off), or a machine in view that is `NOPOWER`. Send `dark_here: true` when the body is in a room whose APC it can see and that APC is not giving power. Do not read `area.power_equip` for rooms the body is not in.
2. **Telling the Chief Engineer (window, small).** A shared duty, any job with a PDA: once per room in ten minutes, "Kate, the power is out in the Cargo Bay." With no Chief Engineer on the PDA, its own head. Fixed words in `jobs/engineering.ts`, read by `jobs/chiefengineer.ts` `readsMessage`. The same reader takes the Captain's or a head's message with the mended speller of GAP-15 ("power", "lights", "dark", and a room name it knows).
3. **The list and the hand-down (window, medium).** `calls` on the Chief Engineer's brain: room, who told it, when. One at a time to the engineer, to its face or by PDA: "Lauren, the power is out in the Cargo Bay. See to its power controller, please." Answer "Noted" to whoever told it. The engine and its emergencies rank above a call.
4. **The engineer at the APC (server, medium).** A new errand to the APC of a named room: walk to it, swipe its ID (a click with the ID, or the lock click: read the APC's `attackby` and `ui_act`), and switch the main breaker on by sending what the APC's window would send, as the owner allowed for machine windows ("Send what the window would send", engineering plan Status). Read back `operating`. Report one of: "the breaker was off, it is on now", "its cell is flat", "it has no power coming in". The last two are stage 3 and are only reported. Count calls answered in `work_done`.
5. **Gravity** is step 4 pointed at the gravity generator's breaker.

For other maps: the plan's rule is right (no guesswork with an engine). What can be general is steps 1 to 5 above, which read rooms and APCs, not names off one map. So stage 2 also gives engineering something to do off MetaStation.

Questions for the owner: is stage 2 next, or the lights (GAP-11), since the two meet at "dark with every tube intact"? And may a body read an APC by the window stand-in, as it sets the batteries?

## How to test the fix

- `tools/llm_crew/engine.ts` for the new fixed lines and readers.
- Simulator: a fake room with an APC that is off. A janitor walks in, one PDA message goes, the Chief Engineer hands it down, the engineer switches it on, and word comes back. With a dead LLM. A second run with the engine half lit: the call waits.
- Server compile. In a round: an admin switches off the Bar's breaker. `grep -n "power is out" pda.log`, then `game.log` for the engineer's walk and the click.
