---
id: SENSE-08
title: The Captain or a head of staff who is not wearing their ID is a stranger to every keeper of a room, and can be taken by the arm and walked out
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_guarding.dm:40, code/modules/llm_crew/crew_npc_guarding.dm:136, code/modules/mob/living/carbon/human/human_helpers.dm:117, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:364
fix: Have why_not_put_out also refuse anyone whose own face shows and whose name the crew manifest gives as the Captain or a head, and let the window remember who it has seen to be command
---

## What is wrong

The owner's rule: nobody lays a hand on the Captain or a head of staff, other than a lawful arrest. The server keeps it in one place, `why_not_put_out`, by `crew_npc_is_command(person)`. That reads only the ID the person *wears*: `person.get_idcard(FALSE)`. On a human, `get_idcard(FALSE)` returns `wear_id?.GetID() || belt?.GetID()`, and nothing held. The window keeps the rule by the same flag (`seen?.command`, sent from `crew_npc_is_command`).

So the Captain, or a head, with no ID in the ID slot or on the belt is, to every crew body:

- not `command`, so the window's "Nobody who outranks the NPC is made to go" never fires, and the server's "outranks you" refusal never fires;
- not `belongs` either, unless an ID in their hand opens a door of the room.

Players take their ID off often: the Captain puts it in the communications console or the ID console on the bridge and walks off; the Head of Personnel leaves theirs in the ID console at the desk; an ID is stolen. With the face showing, a player in the room sees exactly who it is: the name over them is the Captain's own name (`human.name` is the real name when the face shows and no ID is worn).

One concrete case. The Captain (the human player) leaves the captain's ID in the bridge's ID console, and walks into the Cargo Bay to see why an order is late. The two technicians see "Joan Hale" with no job (`get_assignment` gives ""), `in_post: true`, `belongs: false`, `command: false`. Technician A asks "What are you doing in here?" twice. The Captain is typing to the Quartermaster by PDA and does not answer in speech. `waitedOut` → `go`. `throw_out` → `why_not_put_out` returns null → the technician takes the Captain by the arm and walks her out of her own station's cargo bay. `game.log`: "took hold of Joan Hale to walk them out of Cargo Bay".

The same holds for `answers_to`: the Captain without a worn ID is not `superior`, so orders given aloud are not taken as orders (`crew_npc_job_of` reads the same card).

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:40`:

    /proc/crew_npc_is_command(mob/living/carbon/human/person)
    	var/obj/item/card/id/card = person.get_idcard(FALSE)
    	return !isnull(card) && (ACCESS_COMMAND in card.GetAccess())

`code/modules/mob/living/carbon/human/human_helpers.dm:117` (base):

    /mob/living/carbon/human/get_idcard(hand_first = TRUE)
    	. = ..()
    	if(. && hand_first)
    		return
    	//Check inventory slots
    	return (wear_id?.GetID() || belt?.GetID())

`code/modules/llm_crew/crew_npc_guarding.dm:136`, the only server guard:

    	if(crew_npc_is_command(person))
    		return "[person.name] outranks you. You do not lay a hand on them."

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:364`, the only window guard:

    if (stranger.verdict === 'go' && seen?.command) {
      stranger.verdict = 'stay';

## How it was found

Read from the code, both sides, and the base `get_idcard`. Not seen in a round.

## How to fix it

The body has to know a head by the face as well as by the card, by means a player has.

1. **Server, the hard stop.** In `why_not_put_out`, after the card check, refuse anyone whose face shows (`person.get_face_name() == person.real_name`, the same test the game uses for the name shown) and whose `real_name` the crew manifest (`GLOB.manifest.general`, each record's `name` and `rank`; every crew member can read the manifest on their PDA) lists as the Captain or a head of staff (`SSjob.get_job(rank)` has `JOB_HEAD_OF_STAFF`, or is `/datum/job/captain`). Words: "[name] is the [rank]. You do not lay a hand on them." This also covers the window being wrong for any other reason.
2. **Server, the flag.** Send the same test in `look_around` as part of `command` (or a new `known_command`), so the window treats the person as command too.
3. **Window, memory.** In `syncGuarding`, remember for the round every name it has seen with `command` set, and treat a stranger of that name as command thereafter. A player remembers the Captain's face.
4. Leave the arrest path alone: a lawful arrest may lay a hand on a head, and that has its own checks.

Question for the owner: is reading the crew manifest (as a PDA would show it) an acceptable way for a body to know who the heads are? If not, step 3 alone covers heads the body has seen before, and step 1 should use a list the body itself has built from what it saw.

## How to test the fix

- Sim: a scenario where the Captain is in the Cargo Bay with `command: false` and no job, and says nothing. After the fix no `throw_out` is sent, and a `throw_out` sent by hand is refused with "You do not lay a hand on them."
- Compile. In a round, take the Captain's ID off and stand in the Cargo Bay without speaking: grep `game.log` for `took hold of`.
