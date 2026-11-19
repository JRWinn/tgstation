---
id: KNB-04
title: A technician opens a door for someone by calling the door's open proc and switching its auto-close off, not by a click
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:592, code/modules/llm_crew/crew_npc_doors.dm:796, LLM_CREW_PLAN_NO_CHEATS.md:168
fix: Open and shut the door with click_as_body from beside it, leave autoclose alone, and click it open again if it shuts before the person is through
---

## What is wrong

Every door a cargo technician opens for a janitor, for security, or to let someone out is opened by code. The body walks to the door and its access is checked, and then the door's `open()` is called directly, its `autoclose` is set to FALSE so that it stands open, and later `autoclose` is set back and `close()` is called. A player cannot do any of that: a player clicks or walks into the door, it opens, it shuts itself after its own delay, and to hold it they stand in it or open it again.

Listed, and never built:

- 2026-11-18 09:40, "the mail chute again": "Every door opened for someone is still opened by code and held by switching off its closing (item 8 of `LLM_CREW_PLAN_NO_CHEATS.md`). The hold shared between two people in `6e249e9e` is built on that and goes when it does."
- "Earlier work", the last line of the change log: "Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute)".
- 2026-11-18 12:00, under "Not built": "holding a door is one of the cheats still to be taken out".
- 2026-11-18 18:05, the helper's list: "`hold_door_for` and `let_door_close` call a door's `open()` and `close()` directly".

Since then four more things have been built on top of it: the hold shared between two people (`GLOB.crew_npc_door_holds`), the door held on for someone in sight (`CREW_NPC_DOOR_HELD_ON`), letting out everyone shut in the room, and the next door opened unasked. Each makes the honest version a little larger.

Concrete case, any round: `game.log` "opened Deliveries to let ... into Delivery Office" is written from `hold_door_for`. In `round-20.43.32` (2026/11/19) one technician made 18 of them for one janitor in twelve minutes. Each was a direct `door.open()`. A side effect a player would notice: with `autoclose` off, a door a technician opened stays open for as long as the watch runs (15 seconds, up to 30) even if the airlock's own timer is shorter, and anyone passing walks in. KNB-03 and the 20:19 entry's "the pathfinder takes a door that is standing open for a way through" both feed on doors left standing open.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:592`, in `hold_door_for`:

    	door.autoclose = FALSE
    	if(door.density && !door.open())
    		door.autoclose = TRUE
    		return list(FALSE, "The door will not open for you.")

`code/modules/llm_crew/crew_npc_doors.dm:796`, `let_door_close`:

    	door.autoclose = TRUE
    	if(!door.density)
    		INVOKE_ASYNC(door, TYPE_PROC_REF(/obj/machinery/door, close))

The plan's table, `LLM_CREW_PLAN_NO_CHEATS.md:83`: "Door | `hold_door_for`, `crew_npc_doors.dm` | Walks to the door and checks access, then opens it by code and switches its auto-close off."

## How it was found

Read from the code. The plan and the change log both say it. Seen in every round's log as the "opened X to let Y" line, which only this proc writes.

## How to fix it

The plan's section 4.8 is the design and the owner accepted it with the rest on 2026-11-18. In steps:

1. In `hold_door_for`, replace the `autoclose = FALSE` and `door.open()` with a click on the door from where the body stands: `click_as_body(door)` (`crew_npc_machines.dm`), which reaches `/obj/machinery/door/airlock/attack_hand` and from there `try_to_activate_door`, with the door's own access check, bolts, power and shock. Wait for `!door.density` up to the door's opening time (about a second) and return "The door will not open for you." if it does not.
2. Do not touch `autoclose` anywhere. Delete the three assignments.
3. In `watch_door`, where it now only waits: if the door has shut (`door.density`) and the person is not through and the hold has time left, click it open again. That is the plan's "If the door shuts before the person is through, it opens it again". The body must still be beside the door for that, so `step_away_from_door` has to wait until the watch ends: move its `addtimer` from `hold_door_for` to the place where `let_door_close` is called.
4. In `let_door_close`, shut it with a click (`click_as_body(door)` on an open airlock closes it) and only if the body is still within reach. If it has been called away, leave the door to its own timer: that is what would happen with a player.
5. `GLOB.crew_npc_door_holds` can stay as the note of how long the door is wanted open. It no longer needs to stop one holder closing on another's visitor by itself, because the door closes itself, but it still says when to stop reopening.
6. The body stands beside the door and out of the doorway while it holds (the plan: "It stays beside the door, out of the doorway"). `who_is_in_the_way` already treats a body in a doorway as in the way, so pick the `inside`/`outside` tile from `crew_npc_doors_of` that is on the body's own side.

What must keep working: the door shut behind whoever is last through (`watch_door`'s `through` test), anyone else shut in being told the door is open (`door_opened_for`), and the 5 seconds held on for someone in sight.

No owner question: 4.8 was accepted. One thing to tell the owner: a real airlock shuts on its own after a few seconds, so a slow janitor will see the door opened two or three times rather than standing open.

## How to test the fix

- Server compile to a side copy.
- The simulator's door is a flag: it shows only that the brain side still works. Run `nested`, `office`, `vouch` and `crew` a few times each.
- A round: `game.log` "opened X to let Y" should still appear once per asking. Watch one door: it should open, shut by itself, and open again if the visitor was slow. `grep -c "autoclose" code/modules/llm_crew/*.dm` should be 0.
