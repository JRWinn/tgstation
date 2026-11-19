---
id: RT-01
title: One spray in five is followed by a click the game throws away, and the mess is written off as one that will not come off
kind: bug
severity: high
effort: small
confidence: likely
status: found
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:513, code/modules/llm_crew/crew_npc_machines.dm:259, code/_onclick/click.dm:120, code/modules/reagents/reagent_containers/spray.dm:78
fix: Wait out the body's own click cooldown before the click in clean_mess, and do not mark a mess stubborn when the click never landed
---

## What is wrong

A janitor with a spray bottle cleans one mess, steps to the next one a tile away, and clicks on it at once. The game ignores that click: a spray sets a wait of 0.8 seconds before the same body may click again, and `clean_mess` does not look at it. Nothing is sprayed. The body then stands for the full 8 seconds of `CREW_NPC_CLEAN_TIME`, decides the mess "will not come off", and marks it in `stubborn_messes` so that it is never tried again. Two of those in one room and every mess of that kind in the room is written off (`stubborn_kinds`).

It should wait until it may click again, as a player's client does, and it should know a click that did nothing from a mess that will not shift.

One concrete case, with the real numbers:

1. A janitor holds space cleaner. `clean_queue` holds dirt at (147,107) and dirt at (147,108).
2. It stands on (147,107) and `clean_mess` calls `body.ClickOn(mess)`. The spray's `try_spray` runs, and because the mess is on the body's own tile the puff washes the tile there and then (`do_spray`: "Don't need to bother movelooping if we don't move"). The mess is deleted before `ClickOn` returns. `try_spray` ends with `user.changeNext_move(CLICK_CD_RANGE * 2)`: no click for 8 deciseconds.
3. `clean_mess` returns TRUE at once. `finish_errand` calls `next_mess()`, which starts the errand to (147,108).
4. The tree ticks every 0.25 seconds (`SSai_controllers.wait`). The body takes one step and is on the mess 0.25 to 0.75 seconds after the spray.
5. `clean_mess` calls `body.ClickOn(mess)` again. `ClickOn` reaches `if(next_move > world.time) return` and does nothing. No puff.
6. The loop waits until `deadline`, 8 seconds. The mess is still there. `stubborn_messes[REF(mess)] = TRUE`, `stubborn_kinds["room|type"]++`, and the brain is told "You scrub at the dirt but it will not come off."

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:507`, in `clean_mess`:

    	// Use the tool the way a player would: with it in the active hand, on the mess.
    	var/tool_hand = body.get_held_index_of_item(tool)
    	if(tool_hand && tool_hand != body.active_hand_index)
    		body.swap_hand(tool_hand)
    	// A mop works on the floor under the mess; soap and spray work on the mess itself.
    	var/atom/target = istype(tool, /obj/item/mop) ? get_turf(mess) : mess
    	body.ClickOn(target)

    	var/deadline = world.time + CREW_NPC_CLEAN_TIME
    	...
    	while(!QDELETED(mess) && (world.time < deadline || (length(body.do_afters) && world.time < last_chance)))
    		sleep(0.5 SECONDS)
    		...
    	if(QDELETED(mess))
    		return list(TRUE, "You clean up the [mess_name].")
    	// Some messes do not yield to scrubbing at all. Remember this one so the body stops trying it.
    	stubborn_messes[REF(mess)] = TRUE

The base game, `code/_onclick/click.dm:117`, in `/mob/proc/ClickOn`:

    	if(INCAPACITATED_IGNORING(src, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS))
    		return

    	face_atom(A)

    	if(next_move > world.time) // in the year 2000...
    		return

`code/modules/reagents/reagent_containers/spray.dm:76`, in `try_spray`:

    	playsound(src, spray_sound, 50, TRUE, -6)
    	user.changeNext_move(CLICK_CD_RANGE * 2)

Every other click the crew make goes through `click_as_body` (`crew_npc_machines.dm:259`), which sleeps a full second first. `clean_mess` is the one place that clicks with no wait. `put_down_unasked_item` (`crew_npc_hands.dm:623`) also calls `ClickOn` directly, but comes from a timer and is rarely near another click.

The same blind spot is in `click_as_body` itself: it returns TRUE whenever it called `ClickOn`, whether or not `ClickOn` did anything. With the short gaps security uses (`CREW_NPC_STRIKE_GAP` 0.2 seconds, and the 0.5 second sleep after a swing that "did nothing" in `baton_hits`), a swing 0.7 seconds after the last is thrown away too and counted as a swing.

The comments already describe the effect without the cause: "Once could be a slip of the hand", and "two slips of the hand in the first ten minutes meant that from then on a single miss in any room wrote off all the dirt in it".

## How it was found

Read from the code, then checked against the round logs. Not reproduced in a running game.

Each spray writes a line to `attack.log` ("fired a puff of reagents from [floor] with the space cleaner"), with the time and the tile. A throwaway script (kept outside the repo) took the ten rounds from `data/logs/2026/11/18/round-12.23.07` to `data/logs/2026/11/19/round-20.43.32` and measured the time from each body's spray to its next one:

- 492 sprays in all.
- No second spray comes sooner than 0.98 seconds after the last (one outlier at 0.79). That is the first tree tick after the 0.8 second wait.
- 97 sprays are followed by the next one 8.0 to 9.5 seconds later: a step, the 8 seconds of `CREW_NPC_CLEAN_TIME`, and a step. Only 22 fall anywhere between 3 and 8 seconds.
- In 91 of those 97 the next spray was within two tiles of the last: the body was working a clump of messes.
- Of the quick follow-ups (under 3 seconds) only 18 were one tile from the last spray, against 49 at two tiles and 26 at three. A mess one step away is the one that is clicked too soon.

Example, `round-12.23.07/attack.log`: Andre Davis sprays at 18:24:53.597 on (147,107) and next at 18:25:02.443 on (147,108), 8.85 seconds later.

A spray from on top of a mess cannot leave a washable mess behind: `spray_down_turf` exposes every atom on the tile, `/datum/reagent/space_cleaner/expose_obj` calls `wash`, and `/obj/effect/decal/cleanable/wash` deletes it. So an 8 second stall after a spray is a click that made no spray, not a spray that failed.

Not seen: the `stubborn_messes` entry itself, which is written to no log.

## How to fix it

1. In `clean_mess`, before `body.ClickOn(target)`, wait until the body may click: while `body.next_move > world.time`, sleep the difference (cap it at a second or two), then check `QDELETED(src)`, `QDELETED(body)`, `QDELETED(mess)` and that the errand is still this one (`errand_serial`, as `push_clear` does). A player's own client makes them wait the same way, so this is no cheat.
2. Still in `clean_mess`, know whether the click landed. Note `tool.reagents?.total_volume` before the click. After it, if the mess is still there, nothing is in `body.do_afters`, and a spray's volume has not gone down, the click did nothing: click once more after a second. If that does nothing either, return `list(FALSE, "You could not get to it.")` and do not touch `stubborn_messes` or `stubborn_kinds`.
3. In `click_as_body`, do the same wait for `next_move` after the `gap` sleep, and return FALSE if the body is incapacitated (`INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS)`), so that TRUE means the click reached the game. Check the security callers: `baton_hits` counts a swing for every TRUE.
4. Keep the 8 second wait for a mop or soap, which really do take time.

Question for the owner: none. This is how a player's clicks already work.

## How to test the fix

- Compile the server (`tgstation_check.dme`, see README).
- The simulator does not run server code, so this needs a round. Spawn a janitor in a hallway with dirt on three tiles in a row and a full space cleaner in its hand.
- In `attack.log`, measure the time between that body's sprays as above. There should be no gaps of 8.0 to 9.5 seconds between sprays on neighbouring tiles, and one-tile follow-ups should be the commonest kind.
- In `crew_brain.log`, "will not come off" should stop appearing for dirt, blood and the like when the body holds space cleaner.
