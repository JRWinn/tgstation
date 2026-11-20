---
id: ARR-06
title: The officer asks the Captain to let it in, and when the Captain opens the door it does not go through
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:583, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:603, code/modules/llm_crew/crew_npc_doors.dm:805, code/modules/llm_crew/crew_npc_doors.dm:279
fix: Tell the brain when the door it is standing at is open, and have letInStep walk through it at once whoever opened it
---

## What is wrong

Shut out of a room with someone wanted in it, the officer goes to the door and sends a PDA message to someone whose ID opens it. With no staff of that room aboard that is the Captain, who is the human player: `keepersOf` falls back to the Captain for every room. Then it waits at the door, 90 seconds for each person asked.

The only thing that ends that wait early is `brain.doorHeld`, and the server sets that only when a crew NPC opens the door with the `open_door` tool (`hold_door_for` calls `door_opened_for`). A player who walks up and opens the airlock with their own ID raises nothing. The officer stands at the open door, still "waiting", until its 90 seconds are up. Then it asks the next person or gives up, reports "nobody has opened the X for security", and the Head of Security asks engineering to force a door that the Captain has just opened by hand.

So the one person the officer most often has to ask is the one person who cannot let it in.

One concrete case: a warrant on Pun Pun, seen in the Bar. The Bar has no staff aboard. The officer goes to the Bar's door, sends "Captain, I am at the Kitchen door of the Bar with a warrant for Pun Pun. Could you let me in, please?", and its plan becomes `{ ready: false, wait: true, step: '... You have asked Zim Fire to let you into the Bar, and are waiting at the door.' }`. The Captain comes, swipes the door open and stands in the doorway to hold it. `brain.doorHeld` stays false. `letInStep` returns the same wait every time it is asked. After 90 seconds `keepers.find(...)` finds nobody else, `shut.gaveUp = true`, and the outcome "cannot: nobody has opened the Bar for security" goes up the chain.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:583`, in `letInStep`, the only way through:

    // A door held open for it is the way in.
    if (brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door) {
      return {
        ready: true,
        step: `The door into the ${door} is being held open for you, and you are going through for ${name}.`,
        act: { tool: 'go_to', place: door },
      };
    }

`arrests.ts:603`, the wait that nothing else breaks:

    const last = shut.asked[shut.asked.length - 1];
    if (last && brain.now - shut.askedAt < LET_IN_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `${name} is in the ${shut.place}${within}, which is locked to you. You have asked ${last} to let you into the ${door}, and are waiting${atDoor ? ' at the door' : ''}.`,
      };
    }

`code/modules/llm_crew/crew_brain_link.dm:124`: `"door_held" = world.time < npc.door_held_until`. `door_held_until` is set in two places only, both for a crew NPC holding the door: `door_opened_for` (`crew_npc_doors.dm:810`) and `watch_door` (`:653`).

`code/modules/llm_crew/crew_npc_senses.dm:174`: whether a door stands open is looked at only for a body that is shut in:

    	open_door_in_view = FALSE
    	if(is_shut_in())

`arrests.ts:514`, `keepersOf`, why it is so often the Captain:

    const captain = captainName(brain);
    const names = listed.length > 0 ? listed : captain ? [captain] : [];

## How it was found

Read from the code. The let-in steps have been played once (`data/logs/2026/11/19/round-20.00.21`, per the change log's 20:19 entry): the officer asked the Captain at the Bar Backroom door, the Captain did not come, and it gave up after 90 seconds. A Captain who does come and open the door has not been played. The simulator's keepers are crew NPCs, which do raise `door_held`.

## How to fix it

1. Server: the body is standing at a door it wants through (`wanted_door`, `at_door_of()` in `crew_npc_doors.dm`). It can see whether that door is open. Add a proc `wanted_door_open()` that returns TRUE when `at_door_of()` is not null and the resolved `wanted_door` has `density == FALSE`, and send it in `ui_data` (`crew_brain_link.dm`) as `"at_door_open"`. This is what its eyes tell it, so it keeps "senses only".
2. Window: copy it to `brain.atDoorOpen` in `brain.ts` beside `brain.atDoorOf`. In `letInStep`, before the wait, when `brain.atDoorOf === door && brain.atDoorOpen`, return the same `go_to` step as for a held door. Number the try (`attempt`) so that a first walk that just misses the door closing is not held back by the driver. Also let `inBackoff` in `driver.ts` pass over a held-back step while `atDoorOpen` is set, as it already does for `doorHeld`: a `go_to` into that room that failed a minute ago says nothing about one made now.
3. The walk itself: `tool_go_to` plans its route with the body's own access (`get_access()`), and the pathfinder takes a door that is standing open for a way through (the change log's 20:19 entry says so). So the walk works while the door is open. If the route is refused for a door "that only happens to stand open" (`route_by_open_door` is used that way in `tool_go_to_door`), check that `tool_go_to` has no such refusal. It has not, as read.
4. This is a general rule, not security's alone: a janitor waiting to be let into a room by the Captain has the same blind spot (`jobs/janitor.ts`, its let-in wait). Put the `atDoorOpen` check in one shared helper and use it in both.
5. Do not treat any open door anywhere as an invitation. Only the door it asked at, after it has asked. Walking through a locked room's door that someone else happened to open is exactly what `route_by_open_door` was written to stop.

What must keep working: a crew NPC holding the door (`doorHeld`) is still the way in. The officer still gives up and reports after its asks run out when nobody comes.

## How to test the fix

- Type check, lint, server compile to a side copy.
- Simulator: in the scenario where security is shut out, have the simulated server set `at_door_open: true` without any `door_held` event while the officer waits. Check that the next step is `go_to` the room, and that no "nobody has opened" outcome is sent.
- In a round, as Captain: declare a warrant on someone in the Bar, wait for the PDA message asking to be let in, open the door and stand beside it, not in the doorway, so that the test is of the door and not of getting past the Captain. The officer should walk in within a few seconds. `game.log` should show the walk, and `pda.log` no "nobody has opened the Bar for security".

## Check

Checked by Opus 5.5. Confirmed, and confidence raised to sure: nothing in the code ends the wait for a door a player opens.

Read `letInStep` (`arrests.ts:561-625`): the only ready step once it is at the door is the `doorHeld` one; otherwise it waits `LET_IN_WAIT_DS = 900` (90 seconds) per person asked. Read `crew_brain_link.dm:124` and every write of `door_held_until`: `door_opened_for` (`crew_npc_doors.dm:810`) and `watch_door` (`:653`), both from a crew NPC's own `open_door`. Read `crew_npc_senses.dm:174`: `open_door_in_view` is looked at only when shut in. Read `serveStep` (`arrests.ts:785` and `:850-858`): with the wanted person out of sight or more than `NEAR = 2` tiles off, the plan goes to `letInStep` while `blockedPlaces` has the room, and `is_blocked_place` goes by whether a door opens to the body's ID (`door.allowed`), which an open door does not change. Read `inBackoff` (`driver.ts:228`): it lets go of held-back steps for `doorHeld` and for a body shut in, not for this. The one way round is the wanted person standing within two tiles in view, when the arrest walks up to them: rare.

The walk would work: `tool_go_to` (`crew_npc_tools.dm:200`) has no refusal for a locked room, and `/obj/machinery/door/airlock/CanAStarPass` (`code/game/machinery/doors/airlock.dm:1523`) passes any airlock with `!density`. `route_by_open_door` is used only in `tool_go_to_door` and in forcing. The change log's 20:19 entry lists "a Captain opening a door for security" under Not built as something the Captain "can" do, but nothing was built to notice it. The janitor's let-in wait (`jobs/janitor.ts:476`, `:488`) also goes by `doorHeld` alone, so step 4 is right. Added the `inBackoff` point to step 2 and moved the round test beside the door. Severity medium and effort medium kept.

## Fix so far

Group m-secsrv, commit 5f42cf32506 (tables only; inert until the rest lands). The window's part of step 2 in `letInStep`: at the door it asked at, having asked, with `brain.atDoorOpen` set, it sends `go_to` the room, numbered, three failed walks at most (`openWalks`). Table: `tools/llm_crew/arrests3-opendoor.ts`. Left: step 1 (`wanted_door_open()` in `crew_npc_doors.dm`, `"at_door_open"` in `crew_brain_link.dm` ui_data), `brain.atDoorOpen` in `brain.ts` and `types.ts`, `inBackoff` in `driver.ts` passing a held-back step while it is set, and step 4 (the janitor's let-in wait in `jobs/janitor.ts`).
