---
id: DRV-11
title: Shut in and unable to get to the door, a body never knocks and never sends PDA word, because both wait on it standing at the door
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: ae1e7bb59e6
found_by: Opus 5.5
checked_by: Opus 5.5
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
- the doorway is walled off by crates (KNA-13, KNB-01, the Warehouse), when the walk stops more than two tiles from the door (`at_door_of` counts any spot within `CREW_NPC_AT_DOOR`, 2, by `get_dist`, walls and crates or not, so a body stopped close to the door is taken to be at it and does knock);
- rarely: the server is still testing routes from an earlier `go_to_door` into a room (`finding_door`), and gives no answer at all, so the step is lost after 12 seconds and held back. (Going out, the loop takes the first door without testing a route, so `finding_door` is only up for a moment.)

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
6. Move `nextToWrite` out of the at-door block too, or it is never reached away from the door. With no `letInBy` (a body that walked in by itself and was shut in behind it), step 2 has nobody to write to first, so `nextToWrite` must be allowed to start on the same condition (failed walk to the door) rather than on `knocked`.
7. Keep the words the readers look for. A head reads `^I am shut in the (.+?) and nobody has come to the door` (`jobs/head.ts:149`), the Quartermaster reads `\bI am shut in the (.+?) and\b` (`SHUT_IN_WORDS`, `jobs/supply.ts:240`), meetings read "I am shut in the" (`jobs/meetings.ts:89`) and cargo staff take any message with `\bout\b` as a let-out ask (`LET_OUT_WORDS`, `jobs/cargo.ts:158`). The wording in step 3 matches all but the head's, and the head form is kept as it is, so that is fine; do not reword the head form.

## How to test the fix

- Type check from `tgui/`.
- A table test with the fixture brain: shut in, `letInBy` set, `hasPda` true, nobody in view, `atDoorOf` null and `go_to_door` failed twice: `nextStep` must offer the `message` step, worded without "am at the door".
- In the next round, for any body whose `game.log` shows `go_to_door` failing more than twice while shut in, `crew_brain.log` should show a "PDA message asking to be let out" record soon after.

## Check

Checked by Opus 5.5. The quotes match the code (`driver.ts:320`, `:360`, the `WORD_OUT_KEY` step, `nextToWrite` at `driver.ts:187`; `crew_npc_doors.dm:323` and `:343`). `brain.atDoorOf` comes from the server's `at_door_of` (`crew_npc_doors.dm:279`, set from `wanted_door` within 2 tiles) or, for a few seconds, from a `go_to_door` that reported success (`brain.ts:489-498`, `noteResult`). A `go_to_door` answered "You cannot find the door out of X" sets no `wanted_door`, so a body in a room whose every door has bad air beyond it is never "at the door", and the knock, the word to whoever let it in and `nextToWrite` (which needs `knocked`) are all out of reach. Nothing else in the window writes "let me out" for it; the head, Quartermaster and meeting readers only react to words this block sends.

Ran a throwaway script with bun against the real `driver.ts` and the fixture brain: shut in the Warehouse, `atDoorOf` null, `letInBy` set, PDA on, nobody in view, `go_to_door` failed three times and held back: `nextStep` gave `explore`, no `message`. Confirmed. Two mends to the write-up: a walk stopped by crates within two tiles of the door does count as at the door, and the `finding_door` case hardly arises going out. Added fix steps 6 and 7: `nextToWrite` also has to come out of the block (and start without a `letInBy`), and the words must keep matching the head's, the Quartermaster's and cargo's readers. Effort stays small: one block of `nextStep` and `nextToWrite`, in `driver.ts`.
