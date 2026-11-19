---
id: SUP-17
title: A held crate that a player takes away and unpacks, the one who ordered it among them, is written off as lost and emptied, and its owner is told so and may have it bought again
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_held.dm:63, code/modules/llm_crew/crew_npc_held.dm:171, code/modules/llm_crew/crew_npc_held.dm:92, code/modules/llm_crew/crew_npc_held.dm:265
fix: Treat a held crate that has left cargo's rooms in the hands of someone who is not crew as collected, and only call one emptied in cargo's own rooms lost
---

## What is wrong

A held crate is "collected" only one way: a crew body's `collect` tool hauls it and `crate_collected` takes its entry off the list. Anything else that happens to it is read by `crew_npc_crate_lost`, which knows four answers: destroyed, off the station, emptied, nobody can get to it.

A player who walks into the bay and takes their own crate, as players do, is none of those at first. It becomes "nobody can get to it" or "emptied" later:

    	if(isnull(entry.collected_by) && crew_npc_crate_spent(crate))
    		return "it has been emptied"

So:

- While the player has it in their room, shut, the crate is still "waiting". `held_waiting` has no look at where it is. Once it has waited five minutes, a technician's `check_held` goes to the nearest overdue crate. If that is one still in the bay, it says "Still waiting: crate 12 for Zim Fire. I will send word." and the player is sent a reminder, up to three times (`look_over_held`).
- If the nearest overdue crate is the taken one, in a room cargo cannot get into, the `check_held` errand fails and `crew_npc_fail_errand` counts `entry.unreachable` (it does so for `CHECK_HELD`, `RELEASE` and `STOW`). After two such failures, five minutes or so apart, it is lost as "nobody can get to it" (`CREW_NPC_LOST_AFTER` = 2). This is the likelier end for a shut crate dragged off: written off about 10 to 15 minutes after it came in, with the LOST notice below. A `tool_release` for it fails the same way.
- "Emptied" (`crew_npc_crate_spent`, `crew_npc_freight.dm:130`) means nothing left inside the shut crate, or, when it is open, nothing left on the open crate's own square (`crew_npc_crate_holds` reads `crate.drop_location()`). A player who opens a Janitorial Supplies Crate and takes two things leaves the rest spilled round it, and that is not "emptied". It is emptied once every item is taken from that square, the open crate is dragged off its spilled contents, or it is shut with nothing in it. Then it is lost as "it has been emptied".
- Either way, at the write-off: A technician says aloud "Crate 12 for Zim Fire is lost: it has been emptied. I will send word.", and a LOST notice goes to the player by PDA. With a Quartermaster, word that a crate of an order is lost makes `crateLost` order it again (QM-12): cargo pays a second time for what the player already has.

A concrete case, which is the usual one for a Captain with all access:

1. The Captain orders a Janitorial Supplies Crate through the Quartermaster for the Captain's own use. It comes in as #12 and is held in the bay.
2. The Captain is in the bay anyway and drags #12 to the bridge, then opens it and takes the things out.
3. Within two seconds a cargo body's `held_state` runs `crew_npc_held_crates()`; `crew_npc_crate_lost` finds the crate spent and not collected, and it is moved to the lost list.
4. A technician says "Crate 12 for Zim Fire is lost: it has been emptied. I will send word." and the Captain is sent a PDA message that their crate is lost.
5. The Quartermaster is told; its book marks order N lost and orders it again (QM-12).

The same comes from any player who drags a held crate off and opens it, which is a thing players do with crates left lying in a cargo bay.

## Where

`code/modules/llm_crew/crew_npc_held.dm:63`, in `crew_npc_crate_lost`, quoted above.

`code/modules/llm_crew/crew_npc_held.dm:171`, `held_waiting`, which has no look at where the crate is or who took it:

    		if(entry.post == post_place && entry.held_since && isnull(entry.collected_by) && entry.reminders < CREW_NPC_HELD_REMINDERS)
    			waiting += entry

`code/modules/llm_crew/crew_npc_held.dm:92`, `write_off_lost_crates`, which says it aloud and owes the LOST notice.

## How it was found

Read from the code. Not seen in a round. The window side of "lost" (QM-12, HEAD-02, TRA-03) was read only in those findings.

## How to fix it

What a technician would notice, as a player: the crate has gone from the bay, and who took it if it saw them. What it cannot know is what happened after.

1. Keep a note on the entry of the last person not on cargo staff seen pulling the crate (`crate.pulledby`, if not crew cargo), checked where the held crates are already walked over (`crew_npc_held_crates`, or the once-a-second look PERF-07 asks for, which is better for "seen").
2. A held crate that is no longer in `freight_rooms()` and is not being collected by a crew body is not lost and not waiting: it was taken. Take it off the held list with a new end, `taken_by = <that name or "someone">`, and no LOST notice. If the one who took it is `entry.for_name`, that is the order collected: owe an `arrived`-kind notice to nobody, but tell the Quartermaster face to face, as for a crate collected, so the book closes the order.
3. Call a crate "emptied" only while it is still in cargo's rooms (someone opened it at the counter). That one is lost, as now.
4. A crate taken by someone else than `for_name` is the owner's call: say nothing, or tell `for_name` "someone took crate 12 from the bay". Question for the owner.

## How to test the fix

Compile. In a round, as the Captain, drag a held crate out of the Cargo Bay and open it. `game.log` should not show "wrote off held crate #... it has been emptied", and no "lost" PDA should reach the Captain.
