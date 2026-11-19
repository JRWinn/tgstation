---
id: KNA-26
title: Shut out, the officer asks to be let in only by PDA, in a fixed order, never to the face of a keeper it can see, and with no PDA it gives up at once
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:611, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:617, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:514
fix: Ask first whichever keeper is in sight, aloud, and fall back to the PDA list only when none is, and with no PDA wait at the door for a keeper to come by
---

## What is wrong

Listed in the change log entry of 2026-11-18, 20:19 to 20:40, Known and not fixed: "The officer asks the Captain to let it in and waits 90 seconds, wherever the Captain is. The Captain was in the Bar Lounge." Still as built.

When the person on a warrant is in a room locked to security, `letInStep` sends the officer to the door and then asks, one at a time, the people whose ID opens it. Every ask is a PDA message (`tool: 'message'`). Who is asked first is the order the server's list gives (`security.keepers`, staff of the room, then heads, then the Captain), with nothing to put a keeper who is standing in view first. After each ask it waits 90 seconds (`LET_IN_WAIT_DS`) before the next.

1. **A keeper in sight is not asked to their face, and may be asked last.** The case: the officer is at the Kitchen door of the Bar. The Captain is in the Bar Lounge, in plain view across the counter. The list is [Head of Personnel, Captain]. The officer sends the Head of Personnel a PDA message and stands 90 seconds. Then it sends the Captain a PDA message, which a player reads in a chat box, not as someone at the door talking to them. That is three minutes before the Captain, who was in view all along, is asked.
2. **With no PDA it gives up before asking anyone.** `if (!next || shut.asked.length >= LET_IN_ASKS || !brain.hasPda)` sets `gaveUp` at once. An officer whose PDA was taken, or lost to an EMP, standing at a door with a keeper inside the window, says nothing, and reports "nobody has opened the X for security" (which itself goes by PDA, see ARR-05). A player would knock and call out.
3. With a PDA that will not send (Communications Blackout), the ask is kept and resent for 8 minutes (`resend_unsent`), but the 90-second wait goes on to the next keeper as if it had been sent, so all three asks are used up in four and a half minutes and none has reached anyone.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:611`, `letInStep`:

    const keepers = keepersOf(
      brain,
      door,
      door === shut.place ? shut.keepers : undefined,
    );
    const next = keepers.find((keeper) => !shut.asked.includes(keeper));
    if (!next || shut.asked.length >= LET_IN_ASKS || !brain.hasPda) {
      shut.gaveUp = true;
      return {
        ready: false,
        step: `${name} is in the ${shut.place}, which is locked to you, and nobody has let you in.`,
      };
    }
    const to = addressOf(next, jobOf(brain, next));
    return {
      ready: true,
      step: `... You are sending ${next} a PDA message asking to be let in.`,
      act: {
        tool: 'message',
        person: next,
        text: atDoor
          ? letInLine(to, doorCalled(brain, door), door, name)
          : letInFarLine(to, door, name),
      },
    };

`arrests.ts:514`, `keepersOf`: the server's list as it comes, or the Captain alone, less the officer and anyone wanted. Nothing looks at `brain.peopleInView`.

## How it was found

Read from the code, against the round named in the change log (`data/logs/2026/11/19/round-20.00.21`); I did not trace in that round's log where the Captain stood when each ask went.

## How to fix it

1. In `letInStep`, before the PDA ask, look for a keeper in `brain.peopleInView` (by `sameName` against `keepers`) who is not wanted. If there is one, the step is a `say` to them in fixed words, `letInLine(...)` as now, with `exact: true` and the person as the one spoken to. Count it in `shut.asked` as a PDA ask is counted, and wait `LET_IN_WAIT_DS` the same way. The door code on the other side already reads `LET_IN_WORDS` aloud for a cargo technician (`mayPass`); check that the words heard aloud reach it (`overhears` in `jobs/cargo.ts`).
2. Put keepers in view at the front of the order whether or not the step is aloud, so the nearest one is asked first.
3. With no PDA: do not give up while a keeper may come by. Stand at the door, and ask aloud the first keeper that comes into view; give up only after the same total time as three PDA asks (4.5 minutes).
4. With a PDA whose message was kept unsent (the server's answer to `message` says so: the brain is told the send failed), do not count that ask as made; try the next keeper aloud if one is in view, or wait.

The Captain is a player: asking them aloud is speech, and a player hears it. Nothing here touches anyone or anything, so the no-cheats rule is kept.

## How to test the fix

Cases in `tools/llm_crew/security.ts`: a shut-out warrant with the Captain in `peopleInView` gives a `say` to the Captain first, not a `message` to the Head of Personnel; with `hasPda` false and a keeper in view, a `say`, and with none in view a wait, not `gaveUp`. Simulator: no scenario has security shut out of a room (change log 16:50), so add one. Next round, `game.log`: "was told by its brain to say" with "Could you let me in" when a keeper is in the room.
