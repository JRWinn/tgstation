---
id: SENSE-10
title: A PDA message that comes while the body is in a locker, a crate, the disposal pipes or a mech is thrown away, because the test for the PDA being on it stops at the locker
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 3efad788e2a
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_cargo.dm:803, code/__HELPERS/turfs.dm:116, code/modules/llm_crew/crew_npc_senses.dm:138
fix: In on_pda_message test that the PDA is somewhere inside the body by walking up its loc to the body, not that the topmost thing on the turf is the body
---

## What is wrong

`on_pda_message` reads a message into the brain only "if the PDA is still on it":

    	if(!can_sense() || get_atom_on_turf(computer) != pawn)
    		return

`get_atom_on_turf` climbs `loc` until the next `loc` is a turf, and returns that topmost thing. When the body stands on a floor, that is the body. When the body is inside something, it is the something: the locker, the crate, the disposal bin or the holder moving it through the pipes, the mech, the sleeper, the body bag. So for as long as the body is inside anything, every PDA message to it is dropped, and nothing keeps it to read later.

A player shut in a locker reads their PDA in the dark as usual. A crew body's `look_around` already knows it is "off the floor" (`off_floor_in`) and comes out knowing where it is; it does not come out knowing it was sent anything.

This bites in the rounds the change log describes: Pun Pun puts crew in disposal bins (round-17.06.14, quoted in GAP-13), and crew get shut in lockers and crates. A message sent then ("Come to the bridge", "Is the Cargo Bay clean?") never reaches the brain. The sender sees it delivered.

One concrete case. A janitor is shut in a locker in the Custodial Closet by Pun Pun. It is awake (`can_sense()` true). The Head of Personnel sends it "Hedley, are you all right? You missed the meeting." `COMSIG_MODULAR_PDA_MESSAGE_RECEIVED` fires on its PDA; `get_atom_on_turf(pda)` is the locker; `on_pda_message` returns. When a passer-by opens the locker the janitor goes back to work, and never answers. The head marks it absent.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:803`, `on_pda_message`:

    /datum/ai_controller/crew_npc/proc/on_pda_message(obj/item/modular_computer/computer, datum/signal/subspace/messaging/tablet_message/signal, sender_job, sender_name)
    	SIGNAL_HANDLER
    	if(!can_sense() || get_atom_on_turf(computer) != pawn)
    		return

`code/__HELPERS/turfs.dm:116` (base):

    	while(topmost_thing?.loc && !isturf(topmost_thing.loc))
    		topmost_thing = topmost_thing.loc
    ...
    		return topmost_thing

`code/modules/llm_crew/crew_npc_senses.dm:138`, where the body is known to be inside something.

## How it was found

Read from the code and the base helper. Not seen in a round.

## How to fix it

1. In `on_pda_message`, replace `get_atom_on_turf(computer) != pawn` with a test that the PDA is carried by the body wherever the body is: `get_atom_on_turf(computer, /mob/living) != pawn`. The `stop_type` form (`turfs.dm:116` to `:128`) returns the first living mob met on the way up, and null if there is none, so a PDA in a pocket, in hand or in the body's own bag passes, and a PDA dropped loose in the same locker does not. The base game itself shows the message to `computer.loc` if that is a living mob (`messenger_program.dm`, `receive_message`), with no test of where that mob stands, so this is what a player in a locker gets.
2. The same pattern is used for the order book (`order_book_sheets`, `crew_npc_quartermaster.dm:69`, `get_atom_on_turf(sheet) == pawn`, see SUP-03): while a Quartermaster is in a locker or the pipes its own book's sheets do not count as carried. Put the test in one helper (`crew_npc_carries(thing)`) and use it in both. Leave `crew_npc_cleaning.dm:574` alone: `ismob(get_atom_on_turf(device))` asks whether anyone is carrying the gear, a different question.
3. With CORE-02's fix (keep messages that come while the body cannot read them), a message that comes while the body is unconscious in the pipes is read when it wakes.

## How to test the fix

- Compile.
- In a round, shut a crew body in a locker and send it a PDA message: `crew_brain.log` should show the `pda_message` event, and the body should answer when it gets out (or from inside, if the brain answers by PDA).

## Check

Checked by Opus 5.5. The quote at `crew_npc_cargo.dm:805` is what the code says, and `get_atom_on_turf` (`turfs.dm:116`) with no `stop_type` returns the last thing before the turf, which is the locker, bin, disposal holder or mech when the body is in one. `can_sense()` (`crew_npc_senses.dm:101`) asks only dead or unconscious, so an awake body in a locker passes it and is then dropped by the PDA test. The owner's rule "a body that is not standing on a floor senses nothing until it is out" (`LLM_CREW_CHANGELOG.md` about line 1034, `LLM_CREW_PLAN_NO_CHEATS.md` 4.1) is built in `look_around` for sight only, to end runtime errors; hearing (`on_pre_hear`, `:380`) has no floor test and works in a locker, and the comment on `on_pda_message` says the test is meant to be "if the PDA is still on it". So the drop is a side effect, not a choice. The base messenger (`receive_message`) delivers to `computer.loc` when that is a living mob, wherever it is, so a player in a locker reads it. Mended the fix to name the helper's null return, the second use in `crew_npc_quartermaster.dm:69`, and the cleaning use that should stay. Severity medium and effort small stand. Nothing was run.
