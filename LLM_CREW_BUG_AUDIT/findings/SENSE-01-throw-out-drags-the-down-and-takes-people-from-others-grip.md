---
id: SENSE-01
title: The keeper of a room drags out a stranger who is out cold, dead or in cuffs, and pulls someone out of another person's grip, the Captain's included
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_guarding.dm:136, code/modules/llm_crew/crew_npc_guarding.dm:173, code/game/atoms_movable.dm:546, code/modules/mob/living/living.dm:425, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:398
fix: In why_not_put_out refuse when the person is down, cuffed, or already pulled by someone else, and in syncGuarding do not count unanswered asks of a person who is down
---

## What is wrong

A body with a post asks a stranger in it why they are there. If it asks twice and hears nothing, the window settles that they must go, and sends `throw_out`. The server's only checks before the body takes them by the arm are `why_not_put_out` (do they belong, are they command) and that they are in the post. Nothing asks whether the person *can* answer or walk, or whether someone else already has hold of them.

So:

1. **Someone out cold, in crit or dead in the post** cannot answer. After two asks the window settles `go` ("Asked twice, and not a word"), and the body drags them out into the hallway by the arm, and reports "You walk X out of the Cargo Bay and let go of them." Nobody is told someone is lying hurt. A player would call medical, not haul the body into the corridor.
2. **Someone already being pulled by another person.** `take_hold_of` calls `body.start_pulling(person)`. The base `/mob/living/start_pulling` takes the person out of whoever had them: `"[src] pulls [AM] from [AM.pulledby]'s grip."` then `AM.pulledby.stop_pulling()`. That person may be an officer walking a prisoner to the brig through the room, or the Captain dragging someone in. The rule is that nobody lays a hand on the Captain or a head; snatching a person out of the Captain's hand is close to that, and snatching a prisoner from an officer breaks the arrest (the officer's walk then fails on its lost grip).
   The likeliest place for this is the officer's own post, the Security Office (`learn_security_places` makes it the post of every officer). A player officer, or the Head of Security, brings a cuffed prisoner in by the arm to book them. The prisoner has no security access, so `belongs` is false (`crew_npc_cell_holding` only covers someone already in a cell on a running timer); the crew officer asks twice and, if the prisoner keeps quiet (as prisoners do), walks the prisoner out of the office, out of the other officer's hands.
3. **Someone in cuffs** left in the room. They are put out like anyone, though they may be someone's prisoner.

One concrete case. A crew member is shot in the Cargo Bay and falls in hard crit. Cargo technician A sees an assistant in its post who does not belong (`in_post: true, belongs: false`; the server sends `down: true` too, but nothing on either side reads it for guarding). `syncGuarding` records a stranger. A asks twice, "What are you doing in here?", and gets no word. `waitedOut` is true, `settle(... 'go')`, then `planGuarding` returns `act: { tool: 'throw_out', person: handle }`. `tool_throw_out` passes (`why_not_put_out` returns null), the errand walks up, `take_hold_of` pulls the dying assistant out to the hallway. The result line says it went well.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:136`, the only reasons not to:

    /datum/ai_controller/crew_npc/proc/why_not_put_out(mob/living/carbon/human/person)
    	if(belongs_in_post(person))
    		return "[person.name] has every right to be in [post_place]."
    	if(crew_npc_is_command(person))
    		return "[person.name] outranks you. You do not lay a hand on them."
    	return null

`code/modules/llm_crew/crew_npc_guarding.dm:173`, in `take_hold_of`, with no look at `person.pulledby`:

    	body.start_pulling(person)
    	if(body.pulling != person)
    		return list(FALSE, "You cannot get a hold of [person.name].")

`code/modules/mob/living/living.dm:425` (base), in `/mob/living/start_pulling`:

    	if(AM.pulledby)
    		if(!supress_message)
    			AM.visible_message(span_danger("[src] pulls [AM] from [AM.pulledby]'s grip."), \
    ...
    		AM.pulledby.stop_pulling() //an object can't be pulled by two mobs at once.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:398`, in `syncGuarding`, silence taken as refusal whatever state the person is in:

    } else if (waitedOut(stranger.askedAt, stranger.asks)) {
      // Asked twice, and not a word.
      settle(brain, name, stranger, 'go');

`code/modules/llm_crew/crew_npc_senses.dm:191` already sends `"cuffed"` and `"down"` for each person in view, so the window has what it needs; `crew_npc_person_down` is in `crew_npc_security.dm:150`.

## How it was found

Read from the code, both sides, and the base `start_pulling`. Not seen in a round.

## How to fix it

1. In `why_not_put_out` (server), after the two existing checks, add:
   - `if(crew_npc_person_down(person)) return "[person.name] is down and cannot walk. Someone should see to them."`
   - `if(person.pulledby && person.pulledby != pawn) return "[person.pulledby.name] already has hold of [person.name]."`
   - `if(person.handcuffed) return "[person.name] is in cuffs. That is security's business."` (see the question below).
   `take_hold_of` already calls `why_not_put_out` again when the body reaches them, so a change between the tool call and the grab is caught too.
2. In `syncGuarding` (window), do not let a person who is `down` reach `go` through `waitedOut`: someone who cannot answer has not refused. Leave their record waiting, or drop it, while `seen.down` is true. Also skip the asking step in `planGuarding` while they are down, so the body does not say "What are you doing in here?" to someone in crit. `down` and `cuffed` are already in the person type (`types.ts`); no window code reads `.down` today.
   A refusal from the server (someone else has hold of them) goes through the driver's ordinary failure backoff (`fail` and `inBackoff` in `driver.ts`), so the window tries again only after a while, by which time the other person may have let go. That is enough; no new window state is needed for it.
3. Optional, a gap for the owner: a body that sees someone down in its post could say so aloud or send for security or medical. That is GAP-13's ground (the harm senses are off), so name it there rather than build it here.

Question for the owner: is a cuffed stranger left alone in a room, walked out, or reported to security? The fix above leaves them alone and says why, which is the safe choice.

## How to test the fix

- Add a sim scenario in `tools/llm_crew/` where a stranger in the Cargo Bay is `down: true` from the start: no `throw_out` is ever sent, and the stranger task does not settle `go`.
- A scenario where the stranger is being pulled by the Captain: the server answers the `throw_out` with "already has hold of", and the window does not retry it every step.
- Next round, grep `game.log` for `took hold of` and check none is of someone who was lying down; grep `attack.log` for `pulled from` with a crew body as the puller.

## Check

Checked by Opus 5.5. The quotes are as the code is today. `why_not_put_out` (`crew_npc_guarding.dm:136`) checks only `belongs_in_post` and `crew_npc_is_command`; `tool_throw_out` adds only sight and being in the post; `take_hold_of` calls `why_not_put_out` again and then `body.start_pulling(person)` with no look at `person.pulledby`. The base `/mob/living/start_pulling` (`living.dm:391`) has no guard against a person someone else already holds: `can_be_pulled` (`atoms_movable.dm:1760`, `living.dm:1957`) tests only anchoring, throwing, move resist and buckling, and the proc then logs "pulled from" and calls `AM.pulledby.stop_pulling()`. On the window side `syncGuarding` settles `go` on `waitedOut(stranger.askedAt, stranger.asks)` (two asks, 30 seconds) with no look at the person's state, and a grep of `CrewBrain/` finds no reader of `.down`; `.cuffed` is read only in `arrests.ts` and `desk.ts`. `crew_npc_person_down` (`crew_npc_security.dm:150`) is sent in `people_in_view` already. The change log and plans say nothing about strangers who are down or held (searched for `why_not_put_out`, `pulledby`, lying). The fault stands as written. Severity medium (uncommon cases, but a player would notice someone in crit being dragged into the hall); effort small. I added to the fix that the asking step should be skipped too, and that the server's refusal is already backed off by the driver. Not run.
