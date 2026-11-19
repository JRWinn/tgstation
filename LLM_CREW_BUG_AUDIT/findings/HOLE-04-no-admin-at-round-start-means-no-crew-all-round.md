---
id: HOLE-04
title: With no admin connected ten seconds into the round there is no crew all round, and nothing is logged
kind: gap
severity: medium
effort: small
confidence: sure
status: found
area: design
files: code/modules/llm_crew/crew_npc_spawn.dm:92, code/modules/llm_crew/crew_npc_spawn.dm:68, code/modules/llm_crew/crew_npc_spawn.dm:56
fix: Log why no crew was spawned, try again when an admin who may spawn connects, and name the owner in config instead of taking the first admin on the list
---

## What is wrong

The standing crew is spawned once, ten seconds after the round starts, for "the first admin connected who may spawn things". Four things follow that nobody planned for.

1. **Nobody there, nothing happens, and nothing says so.** `spawn_test_crew` returns 0 before it logs anything when it finds no admin, or the admin has no mob. `round_started` does not look at what it returned. The callback was registered with `SSticker.OnRoundstart`, which fires once. If the owner's client connects eleven seconds into the round (a slow load, a restart of the client, a server set to start by itself), there is no crew, no line in `game.log`, and no message. The owner has to know to use the "Spawn Test Crew" verb.
2. **The first admin on the list gets them, whoever that is.** `GLOB.admins` is in the order clients connected. With two admins on, the crew and the brain window go to whichever connected first, who may have no Ollama. The crew still work without the model, but they are run by, and can be driven from, a window the owner of the project is not looking at.
3. **It is on for every round on every server this build runs on.** `GLOB.crew_npc_autostart` is `TRUE` in code, with no config entry. There is no way to host a round without the standing crew short of an admin editing the variable before the round starts.
4. **The verb can spawn a second crew on top of the first.** "Spawn Test Crew" has no check that a crew is already aboard. Run after the automatic spawn it makes twenty-two bodies, with two of every head, all in one window. Nothing in the window code expects two Heads of Personnel that are both its own (see HOLE-03 for what two heads do).

A smaller one in the same proc: where the room for a job cannot be found, the body is put on `get_turf(owner.mob)`. Ten seconds in, an owner who has not readied up is still a lobby mob, and a lobby mob stands on a real turf (`forceMove(pick(GLOB.newplayer_start))` in `code/modules/mob/dead/new_player/new_player.dm:27`). So a body whose room is not found is spawned in the lobby's start room, off the station, where it can never get out. On MetaStation every room is found, so this has not been seen. See HOLE-05 for the maps where rooms are not found.

## Where

`code/modules/llm_crew/crew_npc_spawn.dm:92`:

    /proc/spawn_test_crew(client/owner)
    	if(isnull(owner))
    		for(var/client/admin as anything in GLOB.admins)
    			if(check_rights_for(admin, R_SPAWN))
    				owner = admin
    				break
    	if(isnull(owner) || isnull(owner.mob))
    		return 0

`code/modules/llm_crew/crew_npc_spawn.dm:68`:

    /datum/controller/subsystem/crew_npc/proc/round_started()
    	if(GLOB.crew_npc_autostart)
    		addtimer(CALLBACK(GLOBAL_PROC, GLOBAL_PROC_REF(spawn_test_crew)), CREW_NPC_AUTOSTART_DELAY)

`code/modules/llm_crew/crew_npc_spawn.dm:115`:

    		var/turf/spot = crew_npc_spawn_turf(entry[2], z_level) || get_turf(owner.mob)

## How it was found

Read from the code. Not seen: every round so far was started by the owner on their own machine, where a localhost client is an admin from the first second.

## How to fix it

1. In `spawn_test_crew`, before `return 0`, write `log_game("The standing crew was not spawned: no admin who may spawn things is connected.")` and `message_admins` the same.
2. In `round_started`, if the spawn returned 0, register for `COMSIG_GLOB_CLIENT_CONNECT` on `SSdcs` and spawn for the first client that connects with `R_SPAWN`. Unregister once it has spawned. A flag on the subsystem, `crew_spawned`, stops it happening twice.
3. Have the "Spawn Test Crew" verb refuse, or ask "A standing crew is already aboard. Spawn another?", when that flag is set.
4. Add two config entries, read in `Initialize`: whether the standing crew is spawned at all, and the ckey that owns it. With an owner named, only that ckey is waited for. Without one, the first admin is taken as now.
5. Replace `|| get_turf(owner.mob)` with: the owner's turf only if it is on a station level, else skip the body and log which job had nowhere to stand.

Question for the owner: when the standing crew grows to a whole station, should it still wait for an admin's window, or should the server be able to run the bodies' routine work with no window at all? That is the "host-side fallback brain" the brief lists as later work. Today the answer is that nothing runs without one person's window (see HOLE-02).

## How to test the fix

- Server compile.
- Start a round with Dream Daemon alone and no client, wait a minute, then join. `game.log` should have the "not spawned" line at ten seconds and the "was spawned for" line when the client connects.
- Run the verb twice: the second must ask or refuse.
