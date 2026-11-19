---
id: KNA-02
title: A body shut in and waiting at the door is sent off to search storage and to walk to rooms it cannot reach
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:577, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:500, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:423
fix: While shut in with no open door in view, offer only steps that keep the body where it is, and make the meeting step wait instead of walking
---

## What is wrong

See also: DRV-12

A body that is shut in a locked room goes to the door, knocks, and sends word to whoever let it in. Then it has a minute to wait before it writes to the next person (`NOBODY_CAME_MS`). During that minute nothing in `nextStep` holds it at the door. It falls through to its ordinary work and then to passing the time:

- with storage in the room it is told to `search`, and walks away from the door to the lockers;
- with a staff meeting called it is told `go_to` the meeting room, which cannot succeed, and each failure is one more "walk failed" line and one more count toward being shut in;
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
3. In `jobs/meetings.ts`, where the staff walk to the meeting is planned (`:423`), return `{ ready: false, step: 'You are shut in ... and will go when you are let out.' }` while `brain.shutIn`. The existing "missed" path (`summons.missed`, report by PDA) then covers the meeting, as it did in the round at 02:17:27.
4. Leave `wayOutOpen` as it is: a door standing open is worth two tries.

Keeps the rules: code decides, nothing new is known to the body, no model is asked.

## How to test the fix

- Simulator: the door scenarios in `tools/llm_crew/sim.ts` (`nested` and the janitor let-out ones) must still pass. Add a check to one of them: between "knock" and the door being opened, the janitor sends no `search`, `explore` or `go_to`.
- Type check from `tgui/`.
- Next round, `game.log`: no "walk failed (go_to, to X)" from a body whose last brain step was "You are shut in". And in `crew_brain.log`, no "seeing what is kept in the storage here" between a "knocking at the door" step and the door being opened.
