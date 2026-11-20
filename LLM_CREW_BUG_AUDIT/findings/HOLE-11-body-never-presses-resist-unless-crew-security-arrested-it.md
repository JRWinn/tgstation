---
id: HOLE-11
title: A crew member strapped to a chair, shut in a locker, set alight or cuffed by a player never tries to get free
kind: gap
severity: high
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: core
files: code/modules/llm_crew/crew_npc_security.dm:1462, code/modules/llm_crew/crew_npc_senses.dm:138, code/modules/mob/living/living.dm:1049, code/modules/mob/living/living.dm:1151, code/datums/ai/movement/_ai_movement.dm:61
fix: Add one reflex to the body, run from look_around, that presses Resist the way a player would when it is buckled by someone else, shut in a container, on fire, or in cuffs with nobody holding it, and tells the brain what happened
---

## What is wrong

Every player has a Resist button. It gets you up from a chair someone strapped you to, out of a locker someone shut on you, rolling on the floor when you are on fire, and out of handcuffs given a minute. The crew's bodies press it in one case only: `custody_tick`, when the crew's own security has arrested them and then left them in cuffs.

In every other case the body is stuck for the rest of the round, and it takes a player one click to do it.

- **Strapped to a chair or a bed.** Drag a crew member onto a chair and it is buckled. `/mob/living/Move` returns without moving for a body buckled to something anchored. Every walk the brain asks for fails with "it was taking too long", is left alone for 20 seconds and then up to two minutes, and is asked for again, for ever. The body is "awake", so nothing looks wrong in the window but the "Doing" line.
- **Shut in a locker or a crate.** `look_around` notes `off_floor_in` and returns: "It sees nothing from in there, and makes nothing of where it is until it is out again." The base movement code will not move a body that is not on a turf (`allowed_to_move`). Nothing opens the locker from inside. The body stays there until someone opens it. An unlocked locker opens at once to Resist; a locked or welded one takes two minutes of it.
- **On fire.** Nothing in `code/modules/llm_crew/` reads `on_fire` or `fire_stacks`. A burning janitor goes on mopping until it falls.
- **Cuffed by anyone but crew security.** `custody_phase` is set only in `being_arrested` and `put_in_custody`, which the crew's own arrest and jail tools call. Cuffs put on by a player, by a human security officer, or by Officer Beepsky leave `custody_phase` null, so `custody_tick` never runs and Resist is never pressed. The body walks about in cuffs, every tool that needs a hand fails, and it stays that way. The change log's line 639 says of Beepsky "It will work the cuffs off, slowly": by the code it will not, unless one of the crew's own officers arrested it first.
- **Held in a grab.** A player who takes a crew member in an aggressive grab holds it as long as they like. Only security staff are even told (`on_grabbed` is registered in `start_security_senses`, "Security staff only: nobody else has anything to do about it yet").

One concrete case. A bored player drags the Quartermaster onto the chair in its own office. From then on no order from any head is given to a technician: the Quartermaster writes each in its book and can never walk to the counter to give it. The heads are told "noted". Nothing comes. Nobody is told why.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1462`, in `custody_tick`, the only call of Resist in the crew's code:

    		if(CREW_CUSTODY_CUFFS)
    			held = !isnull(body.handcuffed) && cuff_tries <= CREW_NPC_CUFF_TRIES
    			// Not at it just now: it starts, or starts again.
    			if(held && !length(body.do_afters))
    				cuff_tries++
    				if(cuff_tries <= CREW_NPC_CUFF_TRIES)
    					INVOKE_ASYNC(body, TYPE_PROC_REF(/mob/living, execute_resist))

`code/modules/llm_crew/crew_npc_senses.dm:136`, in `look_around`:

    	// Not standing on a floor: in a disposal pipe, a locker, a crate. It sees nothing from in there,
    	// and makes nothing of where it is until it is out again.
    	if(!isturf(body.loc))
    		...
    		return

`code/modules/mob/living/living.dm:1049` (base game), in `/mob/living/Move`:

    	if (buckled && buckled.loc != newloc) //not updating position
    		if (!buckled.anchored)
    			...
    		return

`code/modules/mob/living/living.dm:1151` (base game), `execute_resist`, which is what the button runs: it resists a grab, then unbuckles, then breaks out of a container, then stops a fire, then works at restraints, in that order.

## How it was found

Read from the code. Not seen in a round. The disposal-unit case (Pun Pun putting bodies in bins) is different and is handled: the pipes carry the body out by themselves.

## How to fix it

One reflex on the server, since this is the body's doing and not a judgement. The brief allows it: "Behavior trees are the motor layer. They execute multi-tick actions and reflexes." It is the same button a player has, so the no-cheats rule is kept.

1. Add `/datum/ai_controller/crew_npc/proc/get_free()` in a new file `crew_npc_resist.dm` (and its line in `tgstation.dme`). Call it at the top of `look_around`, before the `isturf(body.loc)` return, when `can_sense()` is true. It does nothing while `custody_phase` is set: someone lawfully held stays held.
2. It presses Resist (`INVOKE_ASYNC(body, TYPE_PROC_REF(/mob/living, execute_resist))`) when the body has no `do_after` running and any of these holds:
   - `body.on_fire`. At once, every time.
   - `body.buckled` and the body did not sit down itself. No crew tool sits a body down today, so any buckle is someone else's doing. Wait a few seconds first (`buckled_since`), so that it is not up again before whoever did it has let go.
   - `!isturf(body.loc)` and the thing it is in is a closet, a crate or another container (`istype(body.loc, /obj/structure/closet)` and the like). Not the disposal pipes, which the existing code names. Wait a few seconds first here too.
   - `body.handcuffed`, nobody pulling it, and it has been so for a while (use the existing `CREW_NPC_CUFFED_ALONE`). The simplest way is to set `custody_phase = CREW_CUSTODY_CUFFS` and start `custody_tick`, which already does the tries and the telling.
   - `body.pulledby` with a grab above passive, by someone it does not answer to (`answers_to`) and who is not crew security making an arrest. This one is a choice: see the question below.
3. Tell the brain once for each, with `emit_sense(CREW_SENSE_KNOWLEDGE, ...)`: "Someone strapped you to the chair. You have got up.", "You were shut in the locker and have got out.", "You were on fire and have put it out." With `details` naming what it was, so that a job can make something of it later (telling security, say). Write the same to `game.log`.
4. `execute_resist` checks `can_resist()` and sets a click delay itself, so calling it once a second from `look_around` is safe. Check `resist_buckle` for a body in cuffs: the base game makes that take time, and the `do_afters` check keeps it from being started twice.
5. In the window nothing has to change for the body to get free. For the log to make sense, add the new details to the lines `describeEvent` writes, which it does for any event already.

Questions for the owner:
- Should a crew member break a player's grab? A player would. But the crew are also walked out of rooms by the arm on purpose, by their own workmates (`in_hand_until`), and that must go on working.
- Having got free, should it tell anyone (its head, security) that someone strapped it down or shut it in? That is the "handing a fault on" the security plan speaks of.
- A locked or welded locker takes two minutes of Resist and makes a noise. Should it try, or knock and call out? Today it can do neither: it is deaf and blind in there by design, and `tool_say` works from inside a locker only if `can_sense()`, which it does.

## How to test the fix

- Server compile. The simulator runs no server code, so none of this is tested there.
- In a round, as a player: drag a janitor onto a chair, shut one in a locker, cuff one and walk away, and set one alight with admin tools. For each, `game.log` should have the new line within a few seconds (two minutes for the cuffs), and the body should go back to work.
- Arrest a crew member with the crew's own officer afterwards, to check the lawful case is unchanged: it must still stand still and go to its cell.
