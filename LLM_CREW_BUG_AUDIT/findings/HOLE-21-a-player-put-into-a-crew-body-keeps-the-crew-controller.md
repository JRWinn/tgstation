---
id: HOLE-21
title: A player put into a crew body keeps the crew controller, so they walk through people, the other crew treat them as one of their own, and the brain takes the body back when they leave
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_controller.dm:293, code/datums/ai/_ai_controller.dm:675, code/modules/llm_crew/crew_npc_senses.dm:103, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:938, code/modules/llm_crew/crew_npc_security.dm:871, code/modules/admin/verbs/debug.dm:166
fix: Have the crew controller notice COMSIG_MOB_LOGIN on its body, take PASSMOB off, tell the window the body is now a player's and drop it from the window's crew, and on logout not take the body back unless the owner says so
---

## What is wrong

Nothing in our code thinks about a player getting into a crew body. The game has at least four ordinary ways for that to happen: the admin verbs Assume Direct Control and Give Direct Control (`code/modules/admin/verbs/debug.dm:166`), Offer Control to Ghosts (`offer_control`, `code/modules/mob/mob_helpers.dm:378`, which an admin uses on any mob that has nobody in it), and a mind swap or similar from the antagonist side. With a whole station of crew, letting a late-joining player take over a crew member is also the natural way to put a player in a job, so this will come up.

What happens today when a player's key lands in a crew body:

1. The base controller hears `COMSIG_MOB_LOGIN` and switches itself off (`on_sentience_gained`, `_ai_controller.dm:675`). It does not let go of the body. The crew controller stays as `body.ai_controller`, with everything it set up.
2. **The player walks through people.** `TryPossessPawn` gave the body `PASSMOB` (`crew_npc_controller.dm:293`) and only `UnpossessPawn` takes it off. The player in the body now steps through every person and mob on the station, which no other player can do. (CHEAT-01 is about crew bodies having it; this is a player having it.)
3. `can_sense()` goes false because `ai_status` is `AI_STATUS_OFF` (`crew_npc_senses.dm:103`), so the window gets `awake: false` for this body for as long as the player is in it, and every tool call is refused "Your body is not responding". The brain stays in the window with all its tasks.
4. **The other crew go on taking the player for one of their own crew.** The window decides that a speaker is a fellow NPC by looking for a brain with that name (`brain.ts:938`, `brain.ts:1018`). The body's brain is still there, so the player is answered once at most ("One reply each is a conversation"), is not answered at all in a staff meeting, and is counted among `others` when the window works out who a line was said to (`brain.ts:603`). Each head still counts them as staff who answer in set words.
5. **Security treats the player as a crew prisoner.** `make_arrest` tests `istype(person.ai_controller)` (`crew_npc_security.dm:871`), which is still true. It calls `being_arrested` on the controller, which makes the player's body let go of what it is pulling (`body.stop_pulling()`), and `put_in_cell` takes the cuffs off them because they "have a crew controller".
6. **When the player leaves, the brain takes the body back.** On logout the base controller's `on_sentience_lost` calls `reset_ai_status()` (`_ai_controller.dm:682`), the body is awake to the window again, and the brain carries on with the tasks it had before the player came, in whatever room the player left it, holding whatever the player left in its hands. Nothing tells the brain that time has passed or that the body was someone else's. If the player only ghosted to look around (`ghostize(TRUE)`), they can come back into a body the brain has been walking about meanwhile.

Concrete case: the owner is testing and an assistant player asks to try being a cargo technician. The admin uses Give Direct Control on the NPC technician. The player now walks through the Quartermaster and anyone in the lobby. The Quartermaster gives the player orders in its set words and, when the player answers in their own words, answers them once and then stops answering (the fellow-NPC rule). Twenty minutes later the player logs off; the controller wakes, the old brain remembers the order it was given twenty minutes ago and walks off to place it.

The owner's own case is worse: Assume Direct Control on one of their own NPCs moves the owner's client by `PossessByPlayer` (`debug.dm:179`), which does not call `SStgui.on_transfer`, so the owner's old mob logs out and `SStgui.on_logout` closes the Crew Brain window, wiping every brain (HOLE-02).

## Where

`code/modules/llm_crew/crew_npc_controller.dm:293`, in `TryPossessPawn`:

    	human_pawn.pass_flags |= PASSMOB
    	start_senses(human_pawn)
    	return ..()

`code/datums/ai/_ai_controller.dm:675`, the base controller's whole answer to a player getting in and out:

    /datum/ai_controller/proc/on_sentience_gained()
    	SIGNAL_HANDLER
    	UnregisterSignal(pawn, COMSIG_MOB_LOGIN)
    	if(!continue_processing_when_client)
    		set_ai_status(AI_STATUS_OFF) //Can't do anything while player is connected
    	RegisterSignal(pawn, COMSIG_MOB_LOGOUT, PROC_REF(on_sentience_lost))

    /datum/ai_controller/proc/on_sentience_lost()
    	SIGNAL_HANDLER
    	UnregisterSignal(pawn, COMSIG_MOB_LOGOUT)
    	reset_ai_status() //resume AI control now that the client is gone

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:938`, in `shouldWake` (the same test is at `:1018`):

      const fellow = [...brains.values()].some(
        (other) =>
          other !== brain &&
          other.name === (event.details.speaker ?? event.details.name),
      );

`code/modules/llm_crew/crew_npc_security.dm:871`, in `make_arrest`:

    	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
    	// One of the crew stands for it, and goes along. It is told before a hand is laid on it.
    	if(how != CREW_ARREST_STOP && istype(their_controller))
    		their_controller.being_arrested(body)

Nothing under `code/modules/llm_crew/` registers for `COMSIG_MOB_LOGIN` or `COMSIG_MOB_LOGOUT` (grep for them finds nothing).

## How it was found

Read from the code: the crew controller, the base controller's login handlers, the admin verbs and `offer_control`. Not seen in a round: no round has had a player in a crew body.

## How to fix it

1. In `TryPossessPawn`, register for `COMSIG_MOB_LOGIN` and `COMSIG_MOB_LOGOUT` on the body (the base already registers `COMSIG_MOB_LOGIN` for `on_sentience_gained`, so override `on_sentience_gained` and `on_sentience_lost` in the crew controller and call the parent, rather than registering the signal twice).
2. In the crew `on_sentience_gained`: take `PASSMOB` off the body (keep it as a var so it can be put back), cancel any walk, errand or search, write a line to `game.log` ("Crew NPC X was taken over by <key>"), and emit one sense event with `details.player_in = TRUE`. Send `player_in` in `ui_data` for that body.
3. In the window, a body with `player_in` is not one of the crew: leave it out of the `fellow` tests in `brain.ts` and out of the `others` list for `saidTo`, and stop driving it. Keep its memory, so it can be handed back.
4. In `make_arrest` and `put_in_cell`, test `their_controller.ai_status != AI_STATUS_OFF || !person.client` as well as the type, so a player in a crew body is treated as a player. (If CHEAT-04 is fixed first this test goes away.)
5. In the crew `on_sentience_lost`: do not wake up and carry on. Question for the owner: when a player leaves a crew body, should the brain take it back at once, take it back only after the owner presses a button in the Crew Brain window, or never? Whichever it is, the brain should start with its tasks dropped and be told where it is and what it holds, since what it remembers is from before.
6. For the owner's own Assume Direct Control, add a line to the Crew Brain verb's description or a warning that it closes the window, until HOLE-02 is fixed.

## How to test the fix

- Server compile.
- In a round: spawn a technician, use Give Direct Control on it from a second client, and check that the second player is blocked by people, that the Quartermaster answers them more than once, and that `game.log` has the take-over line. Log the second client out and check what the body does matches the owner's answer to question 5.
- In the simulator: send `player_in: true` for one NPC and check another NPC answers its speech as a person's (`talk.replies` beyond 1).
