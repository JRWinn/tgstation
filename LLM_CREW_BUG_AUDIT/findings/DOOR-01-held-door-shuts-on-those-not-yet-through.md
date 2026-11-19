---
id: DOOR-01
title: A door held for several people shuts on the rest when the one watched longest goes through first
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:656, code/modules/llm_crew/crew_npc_doors.dm:624
fix: Count who is still to come through each held door and shut it only when the last of them is through or every hold has run out
---

## What is wrong

When a door is held open for more than one person, each person has their own watcher (`watch_door`), each with its own end time `until`. The door is meant to shut "behind whoever is last through it". What the code does is shut it behind **whoever has the latest end time**, the moment that one person is through, whoever else is still on their way.

The check that is meant to stop one person shutting the door on another only works in one direction. A watcher that finishes looks at the longest hold on the door (`GLOB.crew_npc_door_holds[REF(door)]`). If that is later than its own `until`, it leaves the door alone. If it is equal, which it is for the watcher with the latest `until`, it deletes the hold and shuts the door.

One concrete case (the one the comment in the code was written for, the other way round):

1. Janitor A and janitor B are both shut in the Bitrunning Den. A asks to be let out. A cargo technician calls `open_door` for A.
2. `hold_door_for` opens the door, watches A with `until = T`, then finds B (`other_controller.is_shut_in()`), adds one tick and watches B with `until = T + 1`. The hold on the door is now `T + 1`.
3. B is standing nearer the door and is through it first.
4. B's watcher: `through` is TRUE. `GLOB.crew_npc_door_holds[REF(door)]` is `T + 1`, which is not greater than B's `until` (`T + 1`). So it removes the hold and calls `let_door_close`.
5. The door shuts with A still inside. A's watcher goes on running against a shut door until its own time is up. A has to ask all over again. This is the fault the change log entry "A door held open for two people shuts behind the later one, not the first one through" set out to mend, and it is mended only when the person asked for (A) is the first one through.

The same happens with two technicians holding one door for two different people: whichever person belongs to the later hold shuts the door on the other by going through first.

A second, smaller fault in the same lines: when the door itself is deleted while held, `watch_door` returns at its first check without taking `REF(door)` out of `GLOB.crew_npc_door_holds`. The entry stays for the round. And a watcher is a timer on the holder's controller: if the holder's body is deleted (gibbed, cremated) while it holds a door, the timers go with the controller, nothing ever calls `let_door_close`, and the door stays open with `autoclose` switched off for the rest of the round. (Switching `autoclose` off at all is the cheat already listed in `LLM_CREW_PLAN_NO_CHEATS.md` section 4.8. If 4.8 is built, this whole watcher goes and this finding with it.)

## Where

`code/modules/llm_crew/crew_npc_doors.dm:656`, in `watch_door`:

    	if(through || world.time >= until)
    		// Held for someone else too, who came to it later and is not through yet: one janitor going
    		// in must not shut the door on the one behind. Whoever is holding it for them shuts it.
    		if(GLOB.crew_npc_door_holds[REF(door)] > until)
    			return
    		GLOB.crew_npc_door_holds -= REF(door)
    		let_door_close(door_ref)
    		return

`code/modules/llm_crew/crew_npc_doors.dm:624`, in `hold_door_for`, where the others are given later end times:

    			// Each is watched a tick longer than the last, so that the door shuts behind whoever
    			// is last through it and not on them: see watch_door.
    			held_until += 1
    			GLOB.crew_npc_door_holds[REF(door)] = max(GLOB.crew_npc_door_holds[REF(door)], held_until)
    			watch_door(WEAKREF(door), WEAKREF(other), TRUE, held_until, room)

`code/modules/llm_crew/crew_npc_doors.dm:634`, the early return that leaves the hold behind:

    	if(QDELETED(door) || QDELETED(src) || isnull(room))
    		let_door_close(door_ref)
    		return

## How it was found

Read from the code, not seen in a round. The change log (the entry that added `crew_npc_door_holds`, about line 1023) describes the intent. No round log was searched for it.

## How to fix it

1. Change `GLOB.crew_npc_door_holds` from `REF(door) -> latest end time` to `REF(door) -> number of watches still running` (a count is enough; a list of weak references is only needed if something must name who is still to come). Add one in `hold_door_for` for the person asked for and one for each `other`, just before each `watch_door` call.
2. In `watch_door`, when this watcher's person is through or its time is up, take one off the count. Then shut the door only if the count is now zero (and remove the key). If it is not zero, return without shutting: the watchers that are left will shut it. Every return out of `watch_door` that ends the watch, including the early one at the top, must take its one off, or the door is never shut.
3. Drop the `held_until += 1` trick. It is not needed once the door is shut by "nobody left", not by "latest time".
4. In the early return at the top of `watch_door`, also remove this watcher's entry (and the whole key if the door is gone).
5. Keep the extension (`CREW_NPC_DOOR_HELD_ON`) as it is: it only moves this watcher's own `until`.
6. For the deleted holder: either make the watch a timer on the door's side (a global proc given the weak references, so it does not die with the controller), or in the controller's `Destroy` walk the list and call `let_door_close` for the doors it holds. The first is simpler.

If section 4.8 of `LLM_CREW_PLAN_NO_CHEATS.md` (the honest door: click to open, stand beside it, click it shut once they are through) is built first, build the "nobody left to come through" rule into that and close this finding.

## How to test the fix

- Server compile (see README).
- None of this is run by the simulator. In a round: get two janitors shut in one cargo room (the Bitrunning Den and the Mining Office have done it before), have one ask out, and watch that the door stays open until both are out. In `game.log` grep for `opened .* to let` and check there is no second `opened` line for the same room within the next minute.

## Check

Opus 5.5, 2026-11-19. Confirmed.

- Read `hold_door_for` and `watch_door` in `code/modules/llm_crew/crew_npc_doors.dm` (`:579` to `:667`). The quotes match. Traced the case: the person asked for is watched to `T`, each `other` to `T + 1`, `T + 2`...; the global holds `T + n`. The watcher for the last `other` sees `holds > until` false on its own `until`, removes the key and calls `let_door_close` whoever else is still inside. The guard only works when the watcher with the latest `until` is the last one through.
- Which comes through first is not fixed by the code: the person asked for is usually the one at the door, but an `other` is anyone in the room with `is_shut_in()`, and one standing at the door too (two janitors waiting together) is as likely to be first. The second case, two holders each opening the same door for a different person, follows the same lines (`max()` at `:600`).
- `let_door_close` (`:796`) sets `autoclose` back and calls `close()`; nothing reopens it for the one left inside. A's watcher runs on and does nothing useful.
- The side faults hold: the early return at `:634` does not remove the key (harmless, since a stale time is in the past and `max()` overrides it), and the watch is a timer on the holder's controller, so a deleted holder leaves the door open with `autoclose` off.
- `LLM_CREW_PLAN_NO_CHEATS.md` 4.8 (the honest door) is still "Proposed"; `door.autoclose = FALSE` is still in `hold_door_for`. No change log entry after line 1023 touches this.
- Changed: the fix uses a count rather than a list of entries, and says every ending return must take its one off. Severity medium and effort small stand for the main fault; the deleted-holder part (moving the watch off the controller) is more and can be left to 4.8.
