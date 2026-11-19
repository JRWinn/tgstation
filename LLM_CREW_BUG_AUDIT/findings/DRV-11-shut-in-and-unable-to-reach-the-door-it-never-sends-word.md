---
id: DRV-11
title: Shut in and unable to get to the door, a body never knocks and never sends PDA word, because both wait on it standing at the door
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:360, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:320, code/modules/llm_crew/crew_npc_doors.dm:323, code/modules/llm_crew/crew_npc_doors.dm:343
fix: Send the PDA word, worded for where it is, when go_to_door has failed and is held back, instead of only from the door
---

## What is wrong

See also: DOOR-06, whose fix (its step 4) names this in passing. This finding is the window side on its own, with the cases DOOR-06 does not cover and a fix for the wording.

A shut-in body does three things in turn: goes to stand at the door out, asks whoever it can see, and with nobody in sight knocks once and sends PDA word (to whoever let it in, then a door keeper, then its head). The knock and all the PDA word sit inside one test, `brain.atDoorOf === brain.location`. A PDA does not need a door, but nothing is sent unless the body is standing at one.

When the walk to the door fails, `go_to_door` is held back (20 seconds, then 40, up to two minutes) and tried again, and the body never stands at the door. So it never sends word at all. The server says it cannot get to the door in these cases, among others:

- every door of the room has bad air on one side or the other: `tool_go_to_door` leaves out any door whose tile inside, or (going out) tile outside, is not `crew_npc_safe_turf`, and with none left answers "You cannot find the door out of X". A body shut in a room with the hallway outside open to space is the one that most needs to send word;
- the door it picks cannot be walked to (DOOR-06: the same door every time);
- the doorway is walled off by crates (KNA-13, KNB-01, the Warehouse);
- the server is still testing routes from the last call (`finding_door`), and gives no answer at all, so the step is lost after 12 seconds and held back.

One concrete case: a janitor is let into the Warehouse to clean, the technician leaves, and the crates by the door leave no way to the airlock (KNA-13). The janitor is shut in. `go_to_door` fails, is held back, fails again, for the rest of the round. Nobody is in sight to ask. Its PDA works, and whoever let it in is on it, but `WORD_OUT_KEY` is never offered, and no keeper or head is written to. The janitor waits in the Warehouse until someone happens to walk in.

The words the PDA steps send also say "am at the X door", which would not be true from where it stands.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:360`, in `nextStep`, the one test both the knock and the PDA word sit under:

      if (stuck && !helper && brain.atDoorOf === brain.location) {
        if (!brain.outAsks?.knocked && !inBackoff(brain, KNOCK_OUT_KEY)) {
          ...
        }
        if (
          brain.outAsks?.knocked &&
          !brain.outAsks.messaged &&
          brain.letInBy &&
          brain.hasPda &&
          !inBackoff(brain, WORD_OUT_KEY)
        ) {
          ...
              text: `I am done in the ${brain.location} and am at the ${doorCalled(brain, brain.location)}door. Could you let me out${outTo}, please?`,

The PDA word also needs `knocked`, so even with the test moved, it waits on a knock that cannot be made away from a door.

`driver.ts:320`, the walk to the door, which is the only step offered while it fails and is held back:

      if (
        brain.shutIn &&
        !wayOutOpen(brain) &&
        brain.atDoorOf !== brain.location
      ) {
        const act = { tool: 'go_to_door' };

`code/modules/llm_crew/crew_npc_doors.dm:323` and `:343`, in `tool_go_to_door`:

    		if(!crew_npc_safe_turf(spot) || (leaving && !crew_npc_safe_turf(sides[2])))
    			continue
    	...
    	if(!length(scores))
    		action_result(CREW_TOOL_TO_DOOR, FALSE, "You cannot find [goal].")

## How it was found

Read from the code. Not run, and not seen in a round log (a body shut in with no `ROUTINE (no LLM)` "PDA message asking to be let out" record and repeated `walk failed (go_to_door, ...)` lines in `game.log` would show it).

## How to fix it

1. In `nextStep`, split the block. Keep the knock under `brain.atDoorOf === brain.location`.
2. Let the PDA word go when either the knock has been made, or `go_to_door` has failed and is held back (`inBackoff(brain, keyOf(null, { tool: 'go_to_door' }))`, or `brain.failures.has(...)` with a count of 2 or more, so that one failed walk is given another try first).
3. Word it for where it is: when not at the door, "I am shut in the X and cannot get to its door. Could you let me out, please?" (and the head form as it is). Keep "am at the X door" for a body that is there.
4. Make the same change to the `nextToWrite` steps, which use `outAsks.wroteAt` from the knock: set `wroteAt` when the first word is sent without a knock as well (`noteDone` already does this for `WORD_OUT_KEY`), and let `nextToWrite` go on `messaged` or `wroteAt`, not on `knocked` alone.
5. Nothing on the server has to change for this. DOOR-06's fix (try another door) is still wanted, and the two go together.

## How to test the fix

- Type check from `tgui/`.
- A table test with the fixture brain: shut in, `letInBy` set, `hasPda` true, nobody in view, `atDoorOf` null and `go_to_door` failed twice: `nextStep` must offer the `message` step, worded without "am at the door".
- In the next round, for any body whose `game.log` shows `go_to_door` failing more than twice while shut in, `crew_brain.log` should show a "PDA message asking to be let out" record soon after.
