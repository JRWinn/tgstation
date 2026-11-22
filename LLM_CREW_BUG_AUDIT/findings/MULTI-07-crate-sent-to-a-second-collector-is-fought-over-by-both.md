---
id: MULTI-07
title: A crate the head sends a second collector for is gone after by both, and at the crate each pulls it out of the other's hands and wipes the other's claim on it
kind: bug
severity: medium
effort: medium
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_held.dm:397, code/modules/llm_crew/crew_npc_held.dm:426, code/modules/llm_crew/crew_npc_held.dm:372, code/modules/llm_crew/crew_npc_grip.dm:58, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:331
fix: Refuse haul_collected, haul_released and haul_crate_back when someone else has the crate in hand, clear collected_by on failure only if it is still this body's, and have the window end a COLLECT task the server refuses for that
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
2. Server, `crate_collected` on failure: clear `collected_by` only if it is this body's name (`entry.collected_by == body.real_name`). With step 1 this is what stops the fight: the loser's next `collect_crate` is refused by the guard already in `tool_collect`, and `syncPickups` (`pickups.ts:122`) ends its task once `taken_by` names someone else.
3. Window, `pickups.ts`: the window does not read the `no_such_crate` detail today (nothing in `CrewBrain/` does). In `pickupsAfterActing`, on a failed `collect_crate` whose result says someone else is taking it or has hold of it, finish the task quietly instead of going to the counter. `pickupsAfterActing` is given only `ok`, so the detail has to be passed in, or the check made where the result event is read.
4. Optional, server, `tool_collect`: set `entry.collected_by = body.real_name` when the errand starts, so a second collector is refused at once. I would leave this out: `held_waiting` (`crew_npc_held.dm:172`) skips any crate with `collected_by` set, so a claim made before the crate is in hand must be cleared on `cancel_errand`, on a failed walk to it, and on the body's death, or cargo stops reminding anyone of a crate nobody is coming for. Steps 1 and 2 cover the fault without it.
5. Optional, window, `head.ts` `sendFor`: when it sends a second collector, also send the first "Y is collecting crate #12 now: leave it, please." and have `readPickup`'s side drop a COLLECT task on those words. This saves the first a walk; it is not needed to stop the fight.

## How to test the fix

- Compile to a side copy.
- Simulator (window side only): a head with two janitors, a held crate, and a reminder after the first collector has been held up. The first must drop its task when told; only one `collect_crate` must be sent.
- In a round, `attack.log` shows "pulled from" between two crew members over a crate; with the fix there should be none.
- Server compile only covers steps 1 and 2; nothing in the simulator runs them. The round check above is the only test of the fight itself.

## Check

Checked by Opus 5.5. The quotes are what the code says (`tool_collect` `crew_npc_held.dm:372-374`, `haul_collected` `:397-400`, `crate_collected` `:425-427`, `haul_freight`'s guard `crew_npc_freight.dm:434-435`, `sendFor` `head.ts:331-334`). Base `start_pulling` (`code/modules/mob/living/living.dm:415-421`) takes a pulled thing out of the other's grip with no check but `can_be_pulled`, and logs "pulled from". `haul_released` (`crew_npc_held.dm:328`) and `haul_crate_back` (`crew_npc_cargo.dm:600`) have no guard either. `crate_got_away` (`crew_npc_grip.dm:58`) returns FALSE when someone else has the crate, and `crate_collected` then nulls `collected_by` whoever's it is. How both get there: `held_state` (`crew_npc_held.dm:150`) tells every window of a crate once it is `out`, wherever the body is, so both collectors' `planPickups` send `collect_crate` on the same update and both pass `tool_collect`; the driver does not cancel a running errand when the window's task ends (`busy` in `driver.ts:726`). The second send itself is real but slower than the finder implied: `sendFor` waits `SENT_GRACE_DS` (`head.ts:128`, 5 minutes) after the first, so the first collector has to be held up that long. Not seen in a round. Not checked: whether the second collector's errand walk follows a crate that is moving away, or fails on reach; either way, if it reaches it the crate is taken. Effort raised to medium: steps 1 and 2 are server, step 3 is the window. Reordered the fix: the early claim (old step 2) is now optional with its risk named, and the window step says the detail it relies on is not read today.

## Fix so far

Done on branch `m-cargosrv` (server only, compile only, not played): steps 1 and 2. `haul_collected`, `haul_released` (`crew_npc_held.dm`) and `haul_crate_back` (`crew_npc_cargo.dm`) refuse to take hold of a crate someone else has in hand ("X already has hold of crate #N."). `crate_collected` on failure lets go of `collected_by` only if it is this body's own name, and when someone else has the crate in hand it says so ("X has taken hold of it") with `held_by` in the details, in place of the lost-grip line.

Not done: step 3 (`jobs/pickups.ts`, not this group's). The errand's own refusal ("already has hold of") comes back through `finish_errand` (`crew_npc_hands.dm`), which passes no details for `collect`, so the window has the words only; the walk's failure has `held_by`. Steps 4 and 5 (optional) not done.
Window part on branch `m-cargo` (`jobs/pickups.ts`; cases in `tools/llm_crew/cargo-pickups.ts`; not played): `pickupsAfterActing` now takes the result's details and text as optional arguments, and a failed `collect_crate` whose text says "already has hold of" or "has taken hold of", or whose details carry `held_by`, ends the COLLECT task with nothing said.

Held: `driver.ts`, in `noteResult`, must pass `event.details` and `event.text` to `pickupsAfterActing` (add them as the 5th and 6th arguments). Until then this does nothing in a round.

Round M2 (g-brain): the held part is built. `settleResult` (`driver.ts`, reached from `noteResult`) passes `event.details` and `event.text` to `pickupsAfterActing`. Table `tools/llm_crew/driver4-results.ts` (fed through `noteResult`). Steps 4 and 5 still not done.
