---
id: CHEAT-01
title: Every crew body is given PASSMOB and walks straight through people, even someone in combat mode blocking a doorway
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_controller.dm:293, code/game/atom/_atom.dm:249, code/modules/mob/mob_defines.dm:20, code/modules/mob/living/living.dm:176
fix: Drop PASSMOB from crew bodies and let the game's own mob swap pass them, breaking a diagonal step past someone into two straight steps
---

## What is wrong

When a controller takes a body it sets the PASSMOB pass flag on it, for good. Every mob's `pass_flags_self` is PASSMOB, and the base `CanAllowThrough` lets anything through whose `pass_flags` match. So a crew body moves onto and through the tile of any person as if they were not there. It never bumps anyone, so the game's rules for getting past a person never run.

A player cannot do this. A player who walks into someone goes through `/mob/living/MobBump` and `can_mobswap_with`: they swap places only if the other is not in combat mode, is not restrained and being pulled, is not pulling a restrained person, is not buckled, and neither has `TRAIT_NOMOBSWAP`. On walk intent there is no swap at all. Otherwise the player is stopped, or pushes.

Concrete cases:

1. The Captain (a player) stands in the Cargo Bay's lobby door in combat mode to keep a technician in, or a security player stands in a corridor to stop a janitor. The crew body walks through them as if the tile were empty. No player could.
2. An officer NPC pulls a cuffed prisoner. A player can not push past that pair (`MobBump`: "is restraining [P], you cannot push past"). A crew body passes them, and so does any NPC that meets them in a one-tile maintenance passage.
3. A crew body and a person end up on the same tile. `mind_its_step` sets walk intent near slippery things; on walk intent a player never swaps (`MobBump` returns at once), but a crew body still passes.
4. The body's own movement is never held up by a crowd, so its timings (how long a walk takes, when it arrives) are not a player's.

It is not in `LLM_CREW_PLAN_NO_CHEATS.md` and no change log entry says the owner accepted it. `LLM_CREW_PLAN_DROPPED_CRATES.md:74` notes it only as a cause of lost crates ("Crew bodies step past each other in a passage. A crate cannot step past anyone").

## Where

`code/modules/llm_crew/crew_npc_controller.dm:291`, in `TryPossessPawn`:

    	// Routes are planned as if nobody were in the way, and bodies only swap places head-on, never on
    	// a diagonal. Several NPCs in one small room would jam solid. Letting them step past people fixes that.
    	human_pawn.pass_flags |= PASSMOB

`code/modules/mob/mob_defines.dm:20`:

    	pass_flags_self = PASSMOB

`code/game/atom/_atom.dm:246`, `CanAllowThrough`:

    	if(mover.pass_flags & pass_flags_self)
    		return TRUE

The player's way, `code/modules/mob/living/living.dm:176` (`MobBump`) and `can_mobswap_with`:

    	//No bumping/swapping/pushing others if you are on walk intent
    	if(move_intent == MOVE_INTENT_WALK)
    		return TRUE
    ...
    	if(moving_diagonally)//no mob swap during diagonal moves.
    		return TRUE
    ...
    	// Nor can we pass through non-restrained people in combat mode (or if they're restrained but still too strong for us)
    	if (their_combat_mode && (!HAS_TRAIT(other, TRAIT_RESTRAINED) || too_strong))
    		return FALSE

## How it was found

Read from the code, the crew controller and the base movement procs. Not seen tested in a round: nothing in the logs says when a body passed through someone, because no bump happens.

## How to fix it

1. Remove `human_pawn.pass_flags |= PASSMOB` from `TryPossessPawn` and the matching `&= ~PASSMOB` from `UnpossessPawn`.
2. The reason it was added is real: the game swaps only head-on, never on a diagonal (`moving_diagonally` in `MobBump`). Fix that the way a player does it: when the next step of the route is diagonal and a person stands on that tile, take it as two straight steps. The place to do it is the crew move loop: a small override of the step in `/datum/ai_movement/navmap_astar/crew_npc` (or a `COMSIG_MOVABLE_PRE_MOVE` check beside `mind_its_step`) that, for a diagonal step onto a tile with a living mob, blocks the move and steps the cardinal half first. Crew bodies have no client, so `can_mobswap_with` lets them swap with each other and with players who are not in combat mode (`if (isnull(other.client) || isnull(client)) return TRUE`).
3. A body that is stopped by a person (a bump that did not swap: combat mode, a prisoner, walk intent) is stopped, as a player is. Count a few such stops on the same tile as a blocked step and let the walk fail with a reason the body could notice, such as "[name] is standing in your way", so the brain can say "Excuse me" (the step-aside asking already exists in `jobs/`).
4. Walk intent near slippery things (`mind_its_step`) means no swap. That is the game's rule. Leave it; the body will wait a step.
5. What must keep working: several crew in one small room (the Cargo Bay counter, the Quartermaster's office at a meeting) must not jam for good. Run the meeting scenario in the simulator, but note the simulator does not model bodies at all, so this needs a round.

Question for the owner: is passing through other crew NPCs (both ends ours) acceptable as a stand-in for the swap, with players never passed? If so, a narrower fix is to keep PASSMOB off and allow a pass only when the other mob is a crew NPC and `can_mobswap_with` says yes.

## How to test the fix

- Server compile.
- A round: stand as Captain in the Cargo Lobby door in combat mode and send a technician out; it must stop, not pass. Turn combat mode off; it must swap with you. Watch a meeting of four or more in the Quartermaster's office and see that nobody stays jammed.
- `game.log`: walks failing with the new "standing in your way" reason, and not in large numbers.
