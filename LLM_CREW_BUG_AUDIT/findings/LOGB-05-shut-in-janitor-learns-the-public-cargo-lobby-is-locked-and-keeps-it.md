---
id: LOGB-05
title: A janitor shut in a room learns that the Cargo Lobby and the Cargo Bay each open only from the other, keeps that for good, and makes for the door of the public lobby
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:388, code/modules/llm_crew/crew_npc_doors.dm:395, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:693, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:77
fix: Send door_through from go_to_door only when a route to the outer room's own door was found, never from a body that is shut in, and have the brain refuse an entry that makes a loop and forget entries after a while
---

## What is wrong

See also: DOOR-02 (a room with an open way in is still taken as locked). That is half of this; the other half is what the brain does with it.

`go_to_door` for a room tests the way to each of its doors. When no door can be walked up to and the first such door opens from another room the body is locked out of, it answers "You cannot get to the door into X: it opens from Y, which is locked to you as well", with `door_of = X` and `door_through = Y`. The brain writes that into `brain.reachedThrough[X] = Y` and keeps it for the rest of the round. `doorFor` follows that map outwards to decide which door a janitor goes and stands at.

Two things make this go wrong:

1. **A body that is shut in finds no way to any door**, because it cannot leave the room it is in. The tool does not know that is why. It blames the room beyond the door. Nothing in `tool_go_to_door` asks whether the body is shut in.
2. **`locked_out_of` says the Cargo Lobby is locked to a janitor.** Its only airlock is the one into the Cargo Bay; its way in from the hallway has no door. DOOR-02 is this.

So a janitor shut in somewhere else, sent for to a cargo room, learns both "the Cargo Bay opens from the Cargo Lobby, which is locked to you" and "the Cargo Lobby opens from the Cargo Bay, which is locked to you". The map now has a loop. `doorFor` follows it four steps and stops on the Cargo Lobby, and the janitor's step becomes "Monte Mcmullen called you to a mess in the Delivery Office, which is reached through the Cargo Lobby, which is locked to you. You are going to stand at the door of the Cargo Lobby to be let in." The public lobby, where everyone goes to the counter.

The case, `data/logs/2026/11/18/round-17.48.05`, Arleen Fleming, a janitor shut in the Head of Personnel's Office from 23:52 to the end (LOGB-01). Her memory in `crew_brain.log` (times are the crew's, 6 hours behind the log):

- "You cannot get to the door into Cargo Bay: it opens from Cargo Lobby, which is locked to you as well." (once)
- "You cannot get to the door into Cargo Lobby: it opens from Cargo Bay, which is locked to you as well." (at 18:08:18, 18:10:18 and after; six times in all)

and her steps, all from inside the Head of Personnel's Office:

- 23:52:03 "... a mess in the Delivery Office, which is reached through the Cargo Lobby, which is locked to you ..." => `go_to_door("Cargo Lobby")`
- 23:56:16, 23:58:16 and on: "... a mess in the Mining Office, which is reached through the Cargo Lobby ..." => `go_to_door("Cargo Lobby")`. Eleven `go_to_door("Cargo Lobby")` steps in the round.
- 00:16:27, PDA to her head: "About the Cargo Lobby. I could not get in: there is no way in for me." Untrue: there is no door to get in by.

Once let out, she would still have gone to "the door of the Cargo Lobby" for every mess in a cargo room: nothing clears `reachedThrough`. And `go_to_door("Cargo Lobby")` from anywhere aims at the Cargo Bay side of the bay's airlock (the far side of the lobby's only door), which is a spot inside the locked bay.

Other bodies learnt true entries the same way in these rounds ("door into Bitrunning Den: it opens from Mining Office", "door into Delivery Office: it opens from Cargo Bay"), so the tool's answer is right when the body is free to walk. It is the shut-in case and the doorless lobby that poison it. The two halves are not alike (checker's note): "Cargo Bay opens from Cargo Lobby" comes only from a shut-in body, since a free janitor finds a route to the lobby side of the bay's airlock through the doorless hallway side. But "Cargo Lobby opens from Cargo Bay" comes to a free janitor too: the lobby's only airlock has its outer spot inside the bay, so no janitor can walk to it. Once the first entry is in, the loop closes whether or not the body is still shut in.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:370`, in `tool_go_to_door`: a failed route is put down to the outer room with no check that the body could have walked anywhere at all:

    		var/list/nearest_sides = doors[nearest]
    		var/area/outer = get_area(nearest_sides[2])
    		var/outer_locked = outer != get_area(body) && locked_out_of(outer)
    		var/list/route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
    		...
    		if(outer_locked)
    			outer_name ||= format_text(outer.name)
    			continue

`crew_npc_doors.dm:395`:

    			action_result(CREW_TOOL_TO_DOOR, FALSE, "You cannot get to [goal]: it opens from [outer_name], which is locked to you as well.", list("place" = current_place, "door_of" = room_name, "door_through" = outer_name))

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:693`, kept for good, whatever it makes:

      if (
        typeof event.details.door_of === 'string' &&
        typeof event.details.door_through === 'string'
      ) {
        brain.reachedThrough[event.details.door_of] = event.details.door_through;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:77`, `doorFor`, which follows a loop to its depth limit:

    for (let depth = 0; depth < 4; depth++) {
      const outer = brain.reachedThrough[door];
      if (!outer || outer === brain.location) {
        break;
      }
      door = outer;
    }

`grep -rn reachedThrough tgui/packages/tgui/interfaces/CrewBrain` shows nothing that ever deletes an entry.

## How it was found

Seen in a round log, quoted above, then the cause read in the current code, unchanged at each place quoted. That the Cargo Lobby's hallway side has no airlock is from the server's own line in `game.log`: "Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it." Not checked on the map file.

## How to fix it

1. Server, `tool_go_to_door`: when the body `is_shut_in()`, or when no route to any spot was found at all and the body has not left its room in the last attempts, do not send `door_of`/`door_through`. Say "You cannot get out of here to get to X." instead, which is the truth. (Checker: `shut_in` is only set after `check_shut_in` has run, a few failed walks in, so the "no route to any spot and still in the same room" test is the one to rely on; and check what the janitor's mess step does with that failure before counting on it, since the brain matches the result text, not a flag.)
2. Server: only blame the outer room when a route to some door of the outer room itself was tried and it is locked; better, test a route to the outer room's middle (`get_path_to` with the body's access) and send `door_through` only if that fails too.
3. Brain, `brain.ts`: do not store an entry that makes a loop (follow `door_through` outwards; if it comes back to `door_of`, drop it). Give entries a time and forget them after some minutes, or when the body is next seen in the outer room.
4. DOOR-02's fix (`locked_out_of` false for a room with a doorless way in) stops the Cargo Lobby being called locked in the first place.

## How to test the fix

- A simulator scenario with a janitor shut in a room and called to a mess in a cargo room: want no `go_to_door("Cargo Lobby")` and no "There is no way in for me" about the lobby. And `reachedThrough` with no loop.
- A small table in `tools/llm_crew/` for `doorFor` with a looped map: want the first locked room, not the far end of the loop.
- Type check and server compile.
- Next round, `crew_brain.log`: no "You cannot get to the door into Cargo Lobby".

## Check

Checked by Opus 5.5. Confirmed.

- Read `tool_go_to_door` in `crew_npc_doors.dm` (298 to 409): the quotes match. With no route to any door, the first door whose far side is `locked_out_of` sets `outer_name`, and the failure carries `door_of`/`door_through` with nothing asking whether the body could walk anywhere. `is_shut_in()` is not consulted. For the Cargo Lobby, `crew_npc_doors_of` gives one airlock whose outer spot (`sides[2]`) is in the Cargo Bay, so `go_to_door("Cargo Lobby")` aims inside the locked bay for any janitor, shut in or not.
- Read `locked_out_of` (`crew_npc_guarding.dm:118`): a room is locked if no airlock of it opens for the body; a doorless way in is not looked at (DOOR-02, still `found`).
- Read `brain.ts:693`: the entry is written whatever it is; `grep reachedThrough` finds only the write, the empty start in `brain.ts:293`, the type, and the read in `doorFor`. Nothing deletes or checks for a loop.
- Ran `doorFor` from `jobs/janitor.ts` with bun (script in the scratchpad, importing `jobs/index.ts` first to get past a circular import) on `{Cargo Bay: Cargo Lobby, Cargo Lobby: Cargo Bay, Delivery Office: Cargo Bay}` from the HoP's Office. It printed `Delivery Office -> Cargo Lobby`, `Cargo Bay -> Cargo Bay`, `Mining Office (with an entry to Cargo Bay) -> Cargo Lobby`. So the loop is followed to its depth limit and the answer depends on how many steps it took: the lobby, or the bay itself.
- Round log `data/logs/2026/11/18/round-17.48.05`: all the "door into Cargo Lobby: it opens from Cargo Bay" lines in `crew_brain.log` are Arleen Fleming's, from inside the HoP's Office; "reached through the Cargo Lobby" appears 29 times in that log; `pda.log` has her "there is no way in for me" at 00:16:27. `game.log` line 964 has "Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it."
- Not in the change log or plans as known. KNB-14 is a sibling (walks failed while shut in written off against the destination) but a different path: not a duplicate.
- Severity medium stands: it needs a shut-in janitor first, but then it lasts the round. Effort raised to medium: the smallest whole fix is a few lines in `tool_go_to_door` and a few in `brain.ts`, both sides of the line, plus a table of cases. Of the fix steps, 3 (refuse a looping entry) alone stops the far-end lobby, 1 or 2 stops the false first entry, and DOOR-02 stops the false second one; all three are wanted.

## Fix so far

Built on branch `m-janitor`, the window half of step 3 only (type check, table `tools/llm_crew/janitor-doorfor.ts`, simulator `nested` once; not played). `doorFor` in `jobs/janitor.ts` no longer follows a loop in `reachedThrough` to its depth limit: when the next outer room is one already passed, it stops at that room. With the round's notes, a mess in the Delivery Office now sends it to the door of the Cargo Bay, not the Cargo Lobby; the Cargo Bay and the Cargo Lobby each give their own door.

Held, not owned here:
- `crew_npc_doors.dm`, `tool_go_to_door` (steps 1 and 2): do not send `door_of`/`door_through` when no route to any door was found and the body is still in the room it started in (or `is_shut_in()`); say "You cannot get out of here to get to X." Send `door_through` only when a route to the outer room itself also fails.
- `brain.ts`, where `event.details.door_of`/`door_through` is stored in `brain.reachedThrough` (step 3): do not store an entry that makes a loop (follow `door_through` outwards; if it reaches `door_of`, drop it), and give entries a time and forget them after some minutes, or when the body is next seen in the outer room.
- DOOR-02 (step 4) for the doorless Cargo Lobby.

Round M2, group g-srv-a (compile only; not played): step 1 of the server half. `tool_go_to_door` no longer answers `door_of`/`door_through` when no door could be walked up to and the body is shut in (`is_shut_in()`) or cannot walk out of the room it stands in (new `walks_out_of_room()`, routes to just outside up to three of its room's doors); it says "You cannot get out of here to get to the door into X." Left: step 2 (send `door_through` only when a route into the outer room itself also fails; not built, DOOR-02's M1 change to `locked_out_of` covers the doorless lobby case it was for) and the brain half (g-brain, round M2).
