---
id: CORE-10
title: When the owner is still in the lobby ten seconds into the round, the brain window is opened on the lobby mob and is shut the moment they join or observe, so no crew member is driven until they reopen it by hand
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_spawn.dm:123, code/modules/llm_crew/crew_npc_spawn.dm:68, code/modules/mob/dead/new_player/new_player.dm:376, code/modules/mob/logout.dm:4, code/controllers/subsystem/tgui.dm:370
fix: In spawn_test_crew, when the owner's mob is a lobby mob, do not open the window then, and open it for them as soon as they have a body or a ghost (listen for their client changing mob)
---

## What is wrong

See also: HOLE-04 (the spawn itself in the same case, and the turf a body is put on) and HOLE-02 (what a closed window loses). This is the window being opened on a mob that is about to go away.

The standing crew is spawned `CREW_NPC_AUTOSTART_DELAY` (10 s) after the round starts, "so that whoever owns them has a body by then". Nothing checks that they do. If the owner has not readied up, their mob at that moment is the lobby mob (`/mob/dead/new_player`), and `spawn_test_crew` ends with:

    	get_crew_brain_link(owner.ckey).ui_interact(owner.mob)

so the Crew Brain window is opened on the lobby mob.

When the owner then joins (late join, as the Captain, say) or presses Observe, the lobby code moves their key with `PossessByPlayer(key)` (`transfer_character`, `new_player.dm:376`; `make_me_an_observer`, `new_player.dm:97`). Neither calls `SStgui.on_transfer`, the step that carries open windows over to the new mob (`mind.transfer_to` and `ghostize` both do; these two do not). The lobby mob's `Logout` runs `SStgui.on_logout`, which closes every window that mob had. The brain window closes, `stopSession` runs, and every crew member's brain is gone.

From then on no tool call is sent for any crew member: they wander and stand at their posts. Nothing in the game says why. The owner has to know to use the "Crew Brain" verb, which needs `R_SPAWN`.

## Where

`code/modules/llm_crew/crew_npc_spawn.dm:67`:

    /// Called when the round starts. The crew is spawned a few seconds in, once whoever owns them has a body.
    /datum/controller/subsystem/crew_npc/proc/round_started()
    	if(GLOB.crew_npc_autostart)
    		addtimer(CALLBACK(GLOBAL_PROC, GLOBAL_PROC_REF(spawn_test_crew)), CREW_NPC_AUTOSTART_DELAY)

`code/modules/llm_crew/crew_npc_spawn.dm:98` and `:123`, in `spawn_test_crew`:

    	if(isnull(owner) || isnull(owner.mob))
    		return 0
    	...
    	get_crew_brain_link(owner.ckey).ui_interact(owner.mob)

`code/modules/mob/dead/new_player/new_player.dm:372` (base):

    /mob/dead/new_player/proc/transfer_character()
    	. = new_character
    	if(!.)
    		return
    	new_character.PossessByPlayer(key) //Manually transfer the key to log them in,

`code/modules/mob/logout.dm:1` (base):

    /mob/Logout()
    	SEND_SIGNAL(src, COMSIG_MOB_LOGOUT)
    	log_message("[key_name(src)] is no longer owning mob [src]([src.type])", LOG_OWNERSHIP)
    	SStgui.on_logout(src)

Compare `code/modules/mob/dead/observer/observer.dm:282`, `ghostize`, which does carry windows over:

    	SStgui.on_transfer(src, ghost) // Transfer NanoUIs.

## How it was found

Read from the code. Not seen in a round: the owner has always readied up as the Captain before the round started, so their mob was a body by ten seconds in.

## How to fix it

1. In `spawn_test_crew`, after spawning, open the window only if `!isnewplayer(owner.mob)`.
2. If the owner is in the lobby, open it when they are not. The simplest general way: register on the global signal `COMSIG_GLOB_CREWMEMBER_JOINED` for a late join and on the owner's client for its next mob login (`COMSIG_CLIENT_MOB_LOGIN` if this code base has it; otherwise a short repeating timer, every 2 seconds for up to 30 minutes, that checks `owner.mob` and stops once it is not a lobby mob). Then call `get_crew_brain_link(owner.ckey).ui_interact(owner.mob)` and unregister.
3. Change the comment on `round_started` to say what is true: the spawn is ten seconds in whether or not the owner has a body.
4. Leave the base lobby code alone.

## How to test the fix

- Server compile.
- Start a round without readying up. Wait 15 seconds, then late-join as any job. Without the fix the Crew Brain window flashes up in the lobby and is gone once you are in; with it, it opens when you arrive.
- Do the same pressing Observe instead.
