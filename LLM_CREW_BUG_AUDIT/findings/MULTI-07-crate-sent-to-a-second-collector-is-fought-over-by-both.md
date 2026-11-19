---
id: MULTI-07
title: A crate the head sends a second collector for is gone after by both, and at the crate each pulls it out of the other's hands and wipes the other's claim on it
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_held.dm:388, code/modules/llm_crew/crew_npc_held.dm:426, code/modules/llm_crew/crew_npc_held.dm:372, code/modules/llm_crew/crew_npc_grip.dm:58, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:331
fix: Set collected_by when tool_collect starts the errand, refuse haul_collected and haul_released when someone else has the crate in hand, clear collected_by on failure only if it is still this body's, and have the head stand the first collector down
---

## What is wrong

A head sends one of its staff for a held crate. If cargo's five-minute reminder comes before that one has collected it, `sendFor` sends the next of its staff instead ("...has not collected it. You are sending Y a PDA message to go and collect it instead"). The first is not told to stand down. Its COLLECT task still stands, so now two crew are after one crate.

On the server nothing keeps them apart:

- `tool_collect` checks `entry.collected_by`, but that is only set in `haul_collected`, once a body is standing at the crate and has hold of it. Two who set off at about the same time both pass.
- `haul_collected` takes hold with `start_pulling` without asking whether someone else already has the crate in hand. `start_pulling` takes it out of their grip (base `/mob/living/start_pulling`: "pulls [AM] from [AM.pulledby]'s grip"). `haul_freight` has this guard; `haul_collected`, `haul_released` and `haul_crate_back` do not.
- The one who lost the crate fails its walk with "you lost your grip on it" (`crate_got_away` returns FALSE because someone else has it, and `crate_collected` gives no "has taken it from you" as `freight_hauled` does). On failure `crate_collected` sets `entry.collected_by = null`, though the crate is now in the other's hands. So the loser's next `collect_crate` passes `tool_collect` again, it walks after the crate, and takes it back. Each time the driver's backoff (20 s, then 40 s and more) is all that separates them.
- When one of them finally unpacks the crate, the entry is struck from the held list. The other then gets "Cargo has not put a crate by that number out for you", goes to the counter, is told "I am not holding a crate by that number", and sends the head "Cargo says there is no crate #12 to collect: it has been lost, or the number is wrong" about a crate that was delivered.

One concrete case, the standing test crew:

1. Crate #12 of janitorial supplies is held. The Head of Personnel sends Ann for it. Ann is called to a staff meeting on the way, and then has to wait at the counter for a technician.
2. Five minutes on, a technician's look over the held crates sends the head "Still waiting at cargo: crate #12". `sendFor`: `before.to` is Ann, so the turn passes to Bo: "Bo, crate #12 ... is waiting at cargo."
3. Ann is now at the counter, and the technician brings #12 out to the lobby. Ann and Bo both see it `out`, both call `collect_crate`, both pass `tool_collect` (no `collected_by` yet), and both walk to it.
4. Ann reaches it: `collected_by = "Ann"`, she pulls it towards the Custodial Closet. Bo reaches it a second later: `haul_collected`, `start_pulling`, and the crate is out of Ann's hand. `collected_by = "Bo"`.
5. Ann's walk ends with `CREW_NPC_GRIP_LOST`. `crate_collected(FALSE)`: `entry.collected_by = null`. Twenty seconds later Ann's `collect_crate` passes and she goes after it again.

## Where

`code/modules/llm_crew/crew_npc_held.dm:372`, `tool_collect`, which can only see a claim made at the crate:

    	if(entry.collected_by && entry.collected_by != body.real_name)
    		action_result(CREW_TOOL_COLLECT, FALSE, "[entry.collected_by] is already taking crate #[entry.number] away.", list("no_such_crate" = TRUE))
    		return

`crew_npc_held.dm:397`, `haul_collected`, no check on who has the crate:

    	body.start_pulling(crate)
    	if(body.pulling != crate)
    		return list(FALSE, "You cannot get a grip on crate #[entry.number].")
    	entry.collected_by = body.real_name

`crew_npc_held.dm:425`, `crate_collected`, which wipes whoever's claim it is:

    	// Left where it stopped, it is still there for the taking.
    	if(entry)
    		entry.collected_by = null

compare `code/modules/llm_crew/crew_npc_freight.dm:434`, `haul_freight`, which has the guard:

    	// A workmate got to it first. Taking hold of it now would pull it out of their hands.
    	if(crate.pulledby && crate.pulledby != body)
    		return list(FALSE, "[crate.pulledby.name] already has hold of the [crate_name].")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:331`, the second send, with nothing sent to the first:

    	if (before && to === before.to && turns.length > 1) {
    		to = turns[brain.pickupTurn % turns.length];

## How it was found

Read from the code. Not seen in a round. HEAD-09 is a different fault in the same `sendFor` (which of the staff is picked). The same missing guard means a player who pulls a crate a crew member is collecting, releasing or taking back has it taken out of their hands when the body gets to it.

## How to fix it

1. Server, `haul_collected`, `haul_released` and `haul_crate_back`: before `start_pulling`, if `crate.pulledby && crate.pulledby != body`, return `list(FALSE, "[crate.pulledby.name] already has hold of it.")`, as `haul_freight` does.
2. Server, `tool_collect`: set `entry.collected_by = body.real_name` there, when the errand starts, so a second collector is refused at once. Clear it if the errand is cancelled or fails.
3. Server, `crate_collected` on failure: clear `collected_by` only if it is this body's name.
4. Window, `head.ts` `sendFor`: when it sends a second collector, also send the first "Y is collecting crate #12 now: leave it, please." and have `readPickup`'s side drop a COLLECT task on those words.
5. Window, `pickups.ts`: on a `collect_crate` failure with `no_such_crate`, finish the task quietly instead of going to the counter; the crate has been collected by someone.

## How to test the fix

- Compile to a side copy.
- Simulator (window side only): a head with two janitors, a held crate, and a reminder after the first collector has been held up. The first must drop its task when told; only one `collect_crate` must be sent.
- In a round, `attack.log` shows "pulled from" between two crew members over a crate; with the fix there should be none.
