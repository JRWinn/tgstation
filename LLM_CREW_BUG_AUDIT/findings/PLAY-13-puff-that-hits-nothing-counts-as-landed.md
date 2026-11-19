---
id: PLAY-13
title: A space-cleaner puff that hits nothing is counted as landed, so the body waits 8 seconds and then writes the mess off as one that will not come off
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:554, code/modules/llm_crew/crew_npc_cleaning.dm:574, code/modules/reagents/reagent_containers/spray.dm:66, code/game/objects/effects/decals/chemspray.dm:43
fix: In clean_mess, for a spray count the click as landed only if the mess is gone within a second of the puff, else treat it as a miss that is tried once more from closer and never counted against the room
---

## What is wrong

RT-01 is marked fixed. Its fix made `clean_mess` wait out the click cooldown, and judge whether a click "landed". But for a spray the test it uses is true for every puff that leaves the bottle, whether or not the puff reaches the mess.

The game's spray takes the reagent out of the bottle and sets the click cooldown before the puff moves. The puff then travels toward the mess on its own. If its first step is blocked, it fades out and touches nothing. `clean_mess` has already seen the bottle's volume go down and `next_move` go up, so it says the click landed. It then waits the full `CREW_NPC_CLEAN_TIME` (8 seconds) for the mess to go. The mess does not go. So the body marks it stubborn, adds one to the count for that kind of mess in that room, and reports "You scrub at the dirt but it will not come off." Two such misses in one room write off every mess of that kind in the room (`stubborn_kinds[kind_here] >= 2`).

What it should do: a puff that did not wash the mess is a miss. It should be tried again or left as "could not get to it", as RT-01 meant, and it should not count against the room.

One case, from round-15.44.36:

1. Hayden Griffiths, janitor, is in the Custodial Closet with a space cleaner. The room has 13 dirt.
2. At 21:49:21.751 he sprays from (147,108). The puff washes his own tile: dirt, a bucket, himself, the floor.
3. The next dirt is one step on. `clean_mess` waits out the 0.8 s cooldown and clicks it. At 21:49:22.611 the puff is fired from the same tile. No "sprayed" line follows: the puff hit nothing.
4. Volume went down and `next_move` moved, so `landed = TRUE`. The body stands and waits.
5. His next puff is at 21:49:31.015, 8.4 seconds later, from (148,108). In those 8 seconds the mess was marked stubborn.

Why the puff hit nothing is not proved. The puff has `pass_flags = PASSTABLE | PASSGRILLE` only, so a step onto a tile with a dense structure on it (a locker, the janitorial cart, the water tank) fails, and so can a diagonal step past a wall corner. `check_move` then ends the puff with no spray at all. People and animals do not stop it: `/mob/living/CanAllowThrough` ends `return !mover.density || body_position == LYING_DOWN`, and the puff is not dense. (Second reviewer's correction: the first write-up named people, animals and the janicart. A puff at 21:49:34.297 did reach the janicart vehicle's square and sprayed it, so that was not the blocker either.) Whatever the blocker, the fault in our code is the same: the puff is counted as landed.

Why it matters so much: the write-off lasts. `stubborn_messes` and `stubborn_kinds` are only cleared in `mind_what_it_holds`, when the body comes to hold a different kind of cleaning tool. A janitor who keeps its space cleaner keeps every room it wrote off for the rest of the round. In this round that was its own Custodial Closet.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:549-561`, in `clean_mess`:

    		var/volume_before = tool.reagents?.total_volume
    		var/next_move_before = body.next_move
    		body.ClickOn(target)
    		// Something came of the click: the mess went, a scrub began, the spray was used, or the
    		// game set the wait that every use of a held thing sets.
    		if(QDELETED(mess) || length(body.do_afters) || tool.reagents?.total_volume != volume_before || body.next_move != next_move_before)
    			landed = TRUE
    			break
    	// Twice clicked and nothing came of it: left as a mess it could not get to is, this one alone and
    	// not tried again, but not counted against its kind in this room as one that would not come off.
    	if(!landed)
    		stubborn_messes[REF(mess)] = TRUE
    		return list(FALSE, "You could not get to it.")

Then `crew_npc_cleaning.dm:563-591`, the 8 second wait and the write-off:

    	var/deadline = world.time + CREW_NPC_CLEAN_TIME
    	...
    	while(!QDELETED(mess) && (world.time < deadline || (length(body.do_afters) && world.time < last_chance)))
    		sleep(0.5 SECONDS)
    	...
    	stubborn_messes[REF(mess)] = TRUE
    	...
    	stubborn_kinds[kind_here]++
    	if(stubborn_kinds[kind_here] >= 2)
    	...
    	return list(FALSE, "You scrub at the [mess_name] but it will not come off.")

`code/modules/llm_crew/_defines.dm:84`:

    #define CREW_NPC_CLEAN_TIME (8 SECONDS)

The base game. `code/modules/reagents/reagent_containers/spray.dm:66-80`, `try_spray`: the volume and the cooldown both change before the puff has gone anywhere.

    	if(reagents.total_volume < amount_per_transfer_from_this)
    		to_chat(user, span_warning("Not enough left!"))
    		return FALSE
    	...
    		spray(target, user)

    	playsound(src, spray_sound, 50, TRUE, -6)
    	user.changeNext_move(CLICK_CD_RANGE * 2)

`spray.dm:94`, in `spray`: `reagents.trans_to(reagent_puff, amount_per_transfer_from_this, 1/range)`. And `spray.dm:113-121`, `do_spray`: only a mess on the body's own tile is washed at once. Any other is reached by a move loop that runs after `ClickOn` has returned.

`code/game/objects/effects/decals/chemspray.dm:5` and `:43-45`:

    	pass_flags = PASSTABLE | PASSGRILLE
    ...
    	if(result == MOVELOOP_FAILURE) //If we hit something
    		end_life(source.delay)
    		return

## How it was found

Seen in a round log, then read from the code.

`data/logs/2026/11/19/round-15.44.36/attack.log` (the puffs are logged there, not in `game.log`):

    [2026-11-19 21:49:21.751] ATTACK: *no key*/(Hayden Griffiths) (mob_3022) fired a puff of reagents from [floor] with the space cleaner with a range of [1], ... (Custodial Closet (147,108,2))
    [2026-11-19 21:49:21.752] ATTACK: *no key*/(Hayden Griffiths) (mob_3022) sprayed [dirt] with the space cleaner ... (Custodial Closet (147,108,2))
    [2026-11-19 21:49:22.611] ATTACK: *no key*/(Hayden Griffiths) (mob_3022) fired a puff of reagents from [floor] with the space cleaner with a range of [1], ... (Custodial Closet (147,108,2))
    [2026-11-19 21:49:31.015] ATTACK: *no key*/(Hayden Griffiths) (mob_3022) fired a puff of reagents from [plating] with the space cleaner with a range of [1], ... (Custodial Closet (148,108,2))

Dortha Matthews, Service Hallway, the same shape:

    [2026-11-19 22:01:20.248] ATTACK: *no key*/(Dortha Matthews) (mob_3021) fired a puff of reagents from [plating] ... (Service Hallway (132,118,2))
    [2026-11-19 22:01:20.249] ATTACK: *no key*/(Dortha Matthews) (mob_3021) sprayed [dirt] ... (Service Hallway (132,118,2))
    [2026-11-19 22:01:21.057] ATTACK: *no key*/(Dortha Matthews) (mob_3021) fired a puff of reagents from [plating] ... (Service Hallway (132,118,2))
    [2026-11-19 22:01:29.778] ATTACK: *no key*/(Dortha Matthews) (mob_3021) fired a puff of reagents from [floor] ... (Service Hallway (131,118,2))

A throwaway awk over `attack.log` found every puff with no "sprayed" line before the same body's next puff. Of 55 puffs in the round, 5 hit nothing, and each was followed by a long gap where hits are about a second apart:

    Hayden Griffiths miss at 21:49:22.611, next puff 8.4 s later
    Hayden Griffiths miss at 21:49:35.145, next puff 9.9 s later
    Hayden Griffiths miss at 21:49:45.876, next puff 26.5 s later
    Hayden Griffiths miss at 21:50:45.879, next puff 117.4 s later
    Dortha Matthews miss at 22:01:21.057, next puff 8.7 s later

Each miss is the second puff from the same tile, under a second after a hit. That fits the body standing still and spraying the next mess one step away.

`crew_brain.log` for the same round, Hayden at 21:50:57: "What stands in the way: Custodial Closet: It is waiting: what is left there cannot be got at, or is beyond what you are holding. | Greater Starboard Maintenance: It is waiting: what is left there cannot be got at, or is beyond what you are holding." He had seen 13 dirt in the closet at 21:49:17 and made only 6 hits there. Three of his misses were in the closet and one in Greater Starboard Maintenance. That fits both rooms being written off by this fault. But it is not proved: Dortha was also cleaning the closet, and the per-mess results of a routine clean are not logged.

Not seen: what blocked each puff. The log gives the body's tile, not the puff's target. I did not check whether the build that ran this round held commit 30ba8eafafe. The 8 second gap after a miss, in place of a retry a second later, is what the new code does, so it seems to have.

Searched `LLM_CREW_BUG_AUDIT/findings/` for `volume_before`, `next_move_before`, `landed`, `puff`, `chempuff`, `stubborn`. RT-01 and HAND-01 are about a click thrown away by the cooldown. JAN-01 and LIFE-02 are about a scrub cut short. HAND-02 is about a mess it could not walk to. JAN-14 is about a missed click at a sink. None covers a puff that left the bottle and hit nothing.

## How to fix it

1. In `clean_mess`, split the "landed" test by tool. For a mop or soap (anything that starts a `do_after`), keep the test as it is.
2. For a spray (`istype(tool, /obj/item/reagent_containers/spray)`), the spray does its work as soon as the puff reaches the mess. So after `ClickOn`, sleep up to 1 second in 0.1 s steps (the puff's move loop runs about 0.5 s at range 1) and count the click as landed only if `QDELETED(mess)`. Otherwise it is a miss.
3. On a miss with a spray, do not wait the 8 seconds, and do not touch `stubborn_kinds`. Before the second try, step onto the mess's tile if that tile can be entered (`close_with` or one `step_to`). A puff fired at a mess on the body's own tile is washed at once, with no move loop to be blocked (`do_spray`: `if(target_turf == start_turf)`). If the tile cannot be entered because a dense thing stands on it, and the body is next to it, click that dense thing in place of the mess: `try_spray` then starts the puff on the dense thing's own tile (`if(adjacent && (target.density || ismob(target)))`, `spray(target, user, get_turf(target))`), and `spray_down_turf` washes the mess there. That is what a player does to clean under a locker. If the body is only diagonal to the mess, step to a square straight beside it first.
4. If the second try misses too, return `list(FALSE, "You could not get to it.")`. Keep it the same as the existing `if(!landed)` branch: this mess alone is set aside, and its kind is not written off. HAND-02 is the place to decide when such a mess is tried again.
5. Keep the 8 second wait and the stubborn write-off for a spray only where it truly hit and the mess stayed. A space cleaner washes any cleanable it touches (`space_cleaner/expose_obj` calls `wash`), so that case should hardly ever happen.

This keeps the no-cheats rule: the body only clicks and steps as a player would. A player would see the puff stop short and step closer.

## How to test the fix

- Compile.
- Simulator, if it can place things: a janitor with a space cleaner, dirt one step away, and a dense locker or a standing person on the dirt's tile. Before the fix: one puff, an 8 second wait, "will not come off". After: a second try from closer, or "You could not get to it.", and `stubborn_kinds` for that room unchanged.
- Next round: run the same awk over `attack.log`. For each puff with no "sprayed" line, the same body's next puff should come within about 2 seconds, not 8 or more. In `crew_brain.log`, the Custodial Closet should not show "what is left there cannot be got at" while dirt is still in view.

## Check

Checked by Opus 5.5. Confirmed. I could not prove it wrong.

What I read:

- `clean_mess` in `crew_npc_cleaning.dm` at the current head (99f4d33dd0e). The quote is still what the code says. The `landed` test is true as soon as the bottle's volume drops or `next_move` moves, and both happen inside `try_spray` (`spray.dm`) before the puff has moved.
- `do_spray` in `spray.dm`. Only a puff whose target is on its own square sprays at once. Any other goes by `move_towards_legacy` with `MOVEMENT_LOOP_START_FAST`. `loop_started` in `movement_types.dm` sets the first step for the next visual tick, so it runs after `ClickOn` has returned. The log agrees: the hit at 21:49:34.297 sprayed at 21:49:34.345, 48 ms later.
- `check_move` and `spray_down_atom` in `chemspray.dm`. Every square the puff reaches logs a "sprayed" line, at least for the floor itself (`spray_down_atom(spraying)` at the end of `spray_down_turf`). So a puff with no "sprayed" line never left its first square. The only way that happens is a failed first step, which calls `end_life` and sprays nothing.
- `/datum/reagent/space_cleaner/expose_obj` and `/obj/effect/decal/cleanable/wash`. A puff that reaches the dirt deletes it at once. So the second's wait in the fix is enough, and an 8 second wait after a sprayed puff is never needed.
- `mind_what_it_holds`. The write-off is cleared only on a change of tool kind. That is why I raised the severity to high: a janitor's own closet was written off for good in the first round this code ran, from about 1 puff in 11 missing.
- `/mob/living/CanAllowThrough` in `living_movement.dm`. Mobs let a non-dense puff through, so the first write-up's "a person, an animal" was wrong. I mended that paragraph. The fault does not depend on what the blocker was.

What I ran: my own awk over `round-15.44.36/attack.log`, pairing each "fired a puff of reagents from [" line with the same body's "sprayed" lines. It printed the same 5 misses out of 55 puffs and the same next-puff times as the finding. `crew_brain.log` line 170 has Hayden's "Custodial Closet: It is waiting" at 21:50:57. Commit 30ba8eafafe is dated 2026-11-19 09:26 local and the round began at 15:44 local, so the round very likely ran this code. I did not check what the server was built from.

Three of Hayden's misses were in the Custodial Closet (21:49:22.611, 21:49:35.145, 21:49:45.876). Each was followed by a gap of 8.4 s or more, which is the 8 second wait, and the only path out of that wait with the mess still there adds one to `stubborn_kinds`. So the closet's dirt count reached 2 and every remembered dirt there was written off. This is not proved mess by mess, since routine cleans are not logged one mess at a time. Dortha could have cleaned one of those messes during the wait, which would have made it a success. Either way two misses are enough.

Duplicates: I searched the findings for `puff`, `chempuff`, `volume_before` and `next_move_before`. Only RT-01 and this file match. RT-01 is the cooldown fault whose fix made this one. It is not the same fault. `LLM_CREW_CHANGELOG.md` names the RT-01 fix and nothing about a puff that hits nothing.

The fix: the first write-up's steps work and keep the rules. I added one more case to step 3. When a dense thing stands on the mess's square, the body clicks that thing, and the game starts the puff on that square. A player does the same. Effort stays small: under 20 lines in `clean_mess`.
