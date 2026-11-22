---
id: KNA-02
title: A body shut in and waiting at the door is sent off to search storage and to walk to rooms it cannot reach
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:577, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:500, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:423
fix: While shut in with no open door in view, offer only steps that keep the body where it is, and make the meeting step wait instead of walking
---

## What is wrong

See also: DRV-12

A body that is shut in a locked room goes to the door, knocks, and sends word to whoever let it in. Then it has a minute to wait before it writes to the next person (`NOBODY_CAME_MS`). During that minute nothing in `nextStep` holds it at the door. It falls through to its ordinary work and then to passing the time:

- with storage in the room it is told to `search`, and walks away from the door to the lockers;
- with a staff meeting called it is told `go_to` the meeting room, which cannot succeed, and each failure is one more "walk failed" line (and a walk off the door first). The driver's leaving throttle (`walksOut` and `tryLeavingAt` in `drive`, about `driver.ts:768`) already holds a `go_to` or `explore` back to one try in 20 seconds (120 if `wantsOut`), except while `wayOutOpen`; it does not hold back `search`, which is in `STAYS`;
- then, because it is no longer at the door, it is sent back to the door (`go_to_door`), and round again.

It should stand at the door until it is let out or it is time to write to the next person, and do only what needs no walking (send a message, clean what is in reach).

This is the item listed and "not looked into" in the change log entry of 2026-11-18, 20:19 to 20:40: "a janitor with no route from the Mining Office to the Bar Lounge three times". The walks failed because the janitor was shut in the Mining Office, knew it, and was sent anyway.

The case, from `data/logs/2026/11/19/round-20.00.21`, `crew_brain.log`, Marina Shaffer (janitor):

    02:13:59 You are shut in Mining Office. You are going to stand at the door out ...   go_to_door()
    02:14:02 ... You are knocking at the door ...                                        knock()
    02:14:05 Nobody has come to the door ... sending Jaden Prechtl ... a PDA message     message(...)
    02:14:08 None of your work can be got on with just now, so you are seeing what is kept in the storage here.
    02:14:19 None of your work can be got on with just now, so you are seeing what is kept in the storage here.
    02:14:26 ... staff meeting in the Bar Lounge ...  message("Oliver Davies", "I am shut in the Mining Office. I will come to the Bar Lounge as soon as I am let out.")
    02:14:30 ... That comes before everything else, and you are on your way there.       go_to("Bar Lounge")
    02:14:38 ... That comes before everything else, and you are on your way there.       go_to("Bar Lounge")
    02:14:45 You are shut in Mining Office. You are going to stand at the door out ...   go_to_door()
    02:15:57 ... That comes before everything else, and you are on your way there.       go_to("Bar Lounge")

`game.log` has her at the door at 02:13:56 (74,160) and ten tiles off at (64,163) when the walk failed at 02:14:35. She had told her head in so many words that she was shut in, four seconds before she was sent to walk there.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:360`, in `nextStep`: the shut-in block returns a step only when there is something new to do at the door. When there is not, it falls out of the `if`.

    if (stuck && !helper && brain.atDoorOf === brain.location) {
      if (!brain.outAsks?.knocked && !inBackoff(brain, KNOCK_OUT_KEY)) {
      ...
      const next = nextToWrite(brain);
      if (next && !inBackoff(brain, `${WRITE_OUT_KEY}:${next.name}`)) {
        return {
      ...
      }
    }

`driver.ts:500` onward: the work loop has no test for `brain.shutIn`. Any task whose plan is `ready` is taken, wherever its room is.

`driver.ts:577`: nor does passing the time.

    if (job.keepsPost || work.some(({ plan }) => plan.wait)) {
      return null;
    }
    const idle: Action | null =
      brain.storageHere > 0
        ? { tool: 'search' }
        : brain.resting
          ? null
          : { tool: 'explore' };

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:408` to `:435`, in the staff side of the meeting plan: the answer knows about being shut in and the walk does not.

    text: brain.shutIn
      ? `${HELD_UP} ${brain.location}. I will come to the ${room} as soon as I am let out.`
    ...
    return {
      ready: true,
      step: `${by} has called a staff meeting in the ${room}. That comes before everything else, and you are on your way there.`,
      act: { tool: 'go_to', place: room },
    };

The two tries eight seconds apart at 02:14:30 and 02:14:38 are `wayOutOpen` at work (`driver.ts:221`, `:228`): with a door standing open in view nothing is held back and the shut-in block is skipped, twice (`OPEN_DOOR_TRIES`). That part is as built. The try at 02:15:57 had no open door: it is the plain fall-through.

On the server each failed walk calls `note_way_out_failed()` (`code/modules/llm_crew/crew_npc_tools.dm:506`), and an `explore` that finds nowhere does too (`crew_npc_tools.dm:277`).

## How it was found

Seen in a round log (the lines above), then read from the code. Not run in the simulator.

## How to fix it

1. In `nextStep` (`driver.ts`), after the shut-in block that ends near line 402 and before `wantsOut`, add: if `stuck` (shut in, no open door in view) and `brain.atDoorOf === brain.location`, the body waits. Let through only what keeps it where it is: a `tell` by PDA, and work whose act is in `STAYS` (`message`, `clean`, `note`, `word_passed`) or whose `task.place === brain.location`. Everything else is skipped, and when nothing is left return `null`. Do not let `search` through: it is in `STAYS` but walks the body to each locker.
2. In the same place, when `stuck` and not at the door, nothing but the `go_to_door` step should be offered. Today a `go_to_door` in backoff lets work through.
3. In `jobs/meetings.ts`, where the staff walk to the meeting is planned (`:423`), return `{ ready: false, step: 'You are shut in ... and will go when you are let out.' }` while `brain.shutIn && !brain.doorOpen` (so that a door standing open is still tried, as `wayOutOpen` means it to be). The existing "missed" path (`summons.missed`, set in `meetings.ts:285` when the head says the meeting is over, report by PDA) then covers the meeting, as it did in the round at 02:17:27.
4. Leave `wayOutOpen` as it is: a door standing open is worth two tries.
5. Simplest form of steps 1 and 2: one flag, `const holdAtDoor = stuck && brain.atDoorOf === brain.location`, tested in the work loop (skip any plan whose act is not in `STAYS`, or is `search` or `find_supplies`, both of which walk to lockers; a plan with only `say` is fine) and before the idle block (`return null`). Work in the same room with a walking act (`clean` of a mess across the room starts a walk too) is better skipped as well: the body is waiting for a door that will be held only `CREW_NPC_DOOR_HELD`.

Effort is medium, not small: two window files, about 25 lines, and the door scenarios to re-run.

Keeps the rules: code decides, nothing new is known to the body, no model is asked.

## How to test the fix

- Simulator: the door scenarios in `tools/llm_crew/sim.ts` (`nested` and the janitor let-out ones) must still pass. Add a check to one of them: between "knock" and the door being opened, the janitor sends no `search`, `explore` or `go_to`.
- Type check from `tgui/`.
- Next round, `game.log`: no "walk failed (go_to, to X)" from a body whose last brain step was "You are shut in". And in `crew_brain.log`, no "seeing what is kept in the storage here" between a "knocking at the door" step and the door being opened.

## Check

Opus 5.5, 2026-11-19. Confirmed.

- Read `nextStep` in `driver.ts` as it is today: the shut-in block at `:360` returns only a knock, the first PDA message or `nextToWrite`; otherwise it falls through to `toTell`, the work loop (`:500`, no test of `shutIn`) and the idle block (`:579`, `search` when `storageHere > 0`). The quotes match.
- Read the leaving throttle in `drive` (`walksOut`, `tryLeavingAt`, `TRY_LEAVING_MS` 20 s, `TRY_LEAVING_LET_IN_MS` 120 s). It limits `go_to` and `explore` while shut in, which the write-up did not say; it does not cover `search`, and `search` (`tool_search`, `start_search` in `crew_npc_storage.dm`) walks the body to each locker in view. So the door is still left.
- Read the staff meeting plan in `jobs/meetings.ts:408-435`: the answer says "as soon as I am let out", the next step is a `go_to` with no test of `shutIn`. Quote matches.
- Read the round log: `data/logs/2026/11/19/round-20.00.21/crew_brain.log` lines 597-660 and `game.log` lines 623-686 are as quoted. She was at (74,160) at 02:13:56 and at (64,163) when the Bar Lounge walk failed at 02:14:35, after two storage searches.
- Searched `LLM_CREW_CHANGELOG.md` and the plans: the case is listed at line 100 as "not looked into"; no later entry and no later commit to `driver.ts` on any branch.
- Changed: effort to medium (two files); noted the throttle; the meeting gate should leave an open door to be tried; a one-flag form of the fix.

## Fix so far

Steps 1, 2 and 5 are built in `driver.ts` (`nextStep`). Shut in with no open door in view and at the door (or unable to reach it, DRV-11), `holdAtDoor` lets through only work done where it stands: an act in `STAYS` other than `search` and `find_supplies` (`LEAVES_THE_DOOR`), or a line to say. The idle step is `null` while there is still a knock to make, word to send to whoever let it in, or someone it will write to when the wait is up (`moreToTryAtDoor`, `nextToWrite(..., anyTime)`); with nobody left it may `explore` (never `search`), held to one try in a while by `tryLeavingAt` in `drive` as before. Shut in and not yet at the door, with the walk there held back, it waits and takes no other step. A door standing open still lets everything be tried. Table: `tools/llm_crew/driver3-door.ts`.

Held (step 3, `jobs/meetings.ts`, not this group's): where the staff walk to the meeting is planned (the `act: { tool: 'go_to', place: room }` return after the `HAULING` guard), return `{ ready: false, step: 'You are shut in the ' + brain.location + ' and will go to the meeting when you are let out.' }` while `brain.shutIn && !brain.doorOpen`. The driver already keeps the walk from being taken; this makes the plan say so truly, and lets the "missed" path cover the meeting.

Round M2 (g-brain): the hold at the door no longer skips an emergency in the room the body is shut in. `nextStep` lets through an emergency task whose step breaks in (`plan.breaksIn`), whose room is the room it stands in, or whose act is aimed at someone in view in that room (`aimsInThisRoom`: a warrant task has no room of its own, so the brief's `task.place === brain.location` alone would not have let the arrest through). Table `tools/llm_crew/driver4-shutin-arrest.ts`.
