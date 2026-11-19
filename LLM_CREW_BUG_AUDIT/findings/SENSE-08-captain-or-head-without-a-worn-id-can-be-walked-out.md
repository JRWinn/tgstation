---
id: SENSE-08
title: The Captain or a head of staff who is not wearing their ID is a stranger to every keeper of a room, and can be taken by the arm and walked out
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_guarding.dm:40, code/modules/llm_crew/crew_npc_guarding.dm:136, code/modules/mob/living/carbon/human/human_helpers.dm:117, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:364
fix: Have why_not_put_out and the command flag in look_around also count anyone whose own face shows and whose name the crew manifest gives as the Captain or a head, and have the window treat a name its PDA list shows as Captain or a head as command
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
5. **Window, a cheaper step that needs no new server field.** The brain already has `brain.pdaPeople`, the PDA messenger list (`people_on_pda` in `crew_npc_cargo.dm:666`: each PDA's `saved_identification` and `saved_job`), which is what the body's own PDA shows. In `settle` and in the two `seen?.command` tests in `syncGuarding`, also count as command a stranger whose name is on `pdaPeople` with the job Captain or a head of staff. Match the job title exactly against the head titles, not with `isHead`'s `includes` (HOLE-01 shows why). This covers the usual case, the Captain whose ID is in a console while the PDA is still worn, with what the body can read on its own PDA.
6. Put the face-and-name test in one proc on the server (say `crew_npc_known_command(person)`) used by both step 1 and step 2, so the refusal and the flag cannot disagree.

Steps 1 and 2 alone are server work in one file and are medium effort; with step 3 or 5 as well it touches both sides.

Question for the owner: is reading the crew manifest (as a PDA would show it) an acceptable way for a body to know who the heads are? If not, steps 3 and 5 cover heads the body has seen before or can find on its PDA list, and step 1 should use the same PDA list, which is a sense the body already has.

## How to test the fix

- Sim: a scenario where the Captain is in the Cargo Bay with `command: false` and no job, and says nothing. After the fix no `throw_out` is sent, and a `throw_out` sent by hand is refused with "You do not lay a hand on them."
- Compile. In a round, take the Captain's ID off and stand in the Cargo Bay without speaking: grep `game.log` for `took hold of`.

## Check

Checked by Opus 5.5 on 2026-11-19. The quotes are what the code says today: `crew_npc_is_command` at `crew_npc_guarding.dm:40` (`person.get_idcard(FALSE)`), `why_not_put_out` at `:136` (only `belongs_in_post` and `crew_npc_is_command`), the base `get_idcard` at `human_helpers.dm:117`, and the window's `seen?.command` test at `guarding.ts:364`. With `hand_first = FALSE` the parent's held card is thrown away and only `wear_id?.GetID() || belt?.GetID()` is returned, so a card in a pocket, a bag or a console is not seen. `look_around` (`crew_npc_senses.dm:191`) sends `command` from the same proc and `job` from `get_assignment(if_no_id = "")`, so the window has no other sign: `settle` (`guarding.ts:279`) and `syncGuarding` look only at `command`, and nothing in `guarding.ts` reads `pdaPeople`. Both `tool_throw_out` and `take_hold_of` (`crew_npc_guarding.dm:149-170`) go through `why_not_put_out` and nothing else. With the face showing and no card worn, the base game shows the real name (`get_face_name` at `human_helpers.dm:83`), so a player in the room would know who it is. The fault is real.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose to go by the worn card for this; `LLM_CREW_PLAN_SECURITY.md:492` is about a hidden face, which is another case. Not a duplicate: CHEAT-10 is about reading hidden access off a card that is worn, HOLE-01 about trusting a card's job text; neither covers a head with no card on them.

Severity lowered from high to medium: it breaks the owner's rule about heads, but only for a player Captain or head who has taken their card off, is inside a locked post without being let in, and does not answer twice. NPC heads never take their cards off. Effort stays medium for the server steps. Added step 5, which uses the PDA list the brain already has and needs no owner decision about the manifest, and step 6.
