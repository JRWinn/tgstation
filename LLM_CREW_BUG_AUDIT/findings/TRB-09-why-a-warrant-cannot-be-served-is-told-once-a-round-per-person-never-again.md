---
id: TRB-09
title: Why a warrant cannot be served is told once a round for each person, so on a second warrant on the same person nobody hears it and engineering is never asked to force the door again
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:380, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1151, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1185, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:852
fix: Clear the cannotTold keys for a name when its warrant leaves beat.warrants (jailed, dropped, handed back), and let a key be told again after a few minutes while the warrant still stands
---

## What is wrong

What stops a warrant being served is told to whoever keeps the list "once for each reason" (`syncBeat`): no baton, nobody has opened the room, no way into the room, cannot get them into a cell, and "they will not stand still". The record of what has been told, `beat.cannotTold`, is keyed by `name|why` and is never cleared: not when the warrant is served, not when it is pardoned or withdrawn, not when the officer hands it back. So it is once a round for each person, not once a warrant.

The same people are wanted again and again. In three of the four rounds the change log reads, the warrant was on Pun Pun, and the log notes Pun Pun "let out with a grudge" going on to make trouble straight after its cell opened. A second warrant on Pun Pun meets the same obstacles, and this time none of them is said:

1. Round, first warrant on Pun Pun. It hides in the Bar, which is locked to the officer. Three people asked, nobody opens it: `shut.gaveUp`, `cannot('Pun Pun', 'nobody has opened the Bar for security')`. The Head of Security tells the Captain and, through `deskOutcome`, has engineering force the door (`askEngineering`). Pun Pun is jailed. `cannotTold['Pun Pun|nobody has opened the Bar for security']` stays.
2. Twenty minutes later the Captain declares a second warrant on Pun Pun. It is in the Bar again. The officer asks three people again, nobody opens, `gaveUp` again. `cannot(...)`: the key is there, nothing is pushed.
3. The Head of Security never hears that the warrant is stuck, so it never tells the Captain and never asks engineering. The officer's step is "nobody has let you in" (not ready). Every five minutes `SHUT_OUT_DS` clears `shutOut` and it asks three more people, and gives up again in silence, for the rest of the round.

The same for "no baton": the first time the officer has no baton the Captain hears "Hale cannot bring in Pun Pun: no baton"; the second time, nothing. And for "they will not stand still", which was the only word the Captain had of why there was no arrest in round 19.33.50.

It also holds within one warrant: a reason told once is not told again even after the obstacle went away and came back (the room forced open, then locked again).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:380`, in `syncBeat`:

    beat.cannotTold ??= {};
    const told = beat.cannotTold;
    const cannot = (name: string, why: string) => {
      const key = `${name}|${why}`;
      if (told[key] === undefined) {
        told[key] = brain.now;
        beat.outcomes.push({ what: 'cannot', name, why });
      }
    };

`arrests.ts:1151`, the same map for "will not stand still":

    beat.cannotTold ??= {};
    const key = `${warrant.name}|${WILL_NOT_STAND}`;
    if (beat.cannotTold[key] === undefined) {

`arrests.ts:1185`, a warrant served: the warrant goes, its told reasons stay.

    beat.warrants = beat.warrants.filter((it) => it !== warrant);
    return;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:852`, the only way engineering is asked to force a door: a `cannot` outcome reaching the desk.

    const shutRoom = outcome.why?.match(
      /^nobody has opened the (.+) for security$/,
    )?.[1];
    if (shutRoom) {
      askEngineering(brain, shutRoom, outcome.name);
    }

Nothing anywhere deletes a key: `cannotTold` is written at the two places above and read nowhere else (searched `CrewBrain/` for `cannotTold`).

## How it was found

Read from the code. Not seen in a round: no round so far had a second warrant on one person that met the same obstacle.

## How to fix it

1. Whenever a warrant leaves `beat.warrants` (the `jailed` branch of `beatAfterActing`, `dropWarrant`, `handBack`: arrests.ts:1185, 189 and 247 are the only three), delete every `cannotTold` key that begins with that warrant's name and `|`. Simplest, and safe for any later way out: in `syncBeat`, just after `beat.cannotTold ??= {}`, delete every key whose name part (before the last `|`) has no warrant in `beat.warrants`. `syncBeat` runs before every plan, so a warrant given again is always seen fresh. Match by the exact name, since the key is written with `warrant.name`.
2. Keep the value as the time it was told (it already is), and let `cannot` tell it again once enough time has gone by and the warrant still stands. Use ten minutes, the same as `ASK_AGAIN_DS` in forcing.ts, not five: each `cannot` that reaches the desk is sent to the Captain by PDA (`deskOutcome`'s default branch, desk.ts:845), and five minutes would be a fresh "cannot bring in" to the Captain every five minutes for a warrant stuck behind a door; `askEngineering` would anyway act only every ten. The owner may want this step left out; steps 1 and 3 fix the fault as written.
3. Delete a `nobody has opened ...` key when the room is opened (`doorOpened`) so that a room locked again is told again.

## How to test the fix

- `tools/llm_crew/security.ts`: a case that serves a warrant with a `cannot` outcome, jails the person, gives a second warrant on the same name, and makes the same obstacle: a second `cannot` outcome must be pushed.
- Simulator: run `warrant` with a second warrant on Pun Pun after the cell opens, with the Bar locked both times; the Head of Security must ask engineering twice.
- Type check.

## Check

Confirmed. Read `syncBeat`'s `cannot` (arrests.ts:380-422), the `WILL_NOT_STAND` copy in `beatAfterActing` (1151), the three places a warrant leaves `beat.warrants` (189 `dropWarrant`, 247 `handBack`, 1185 the jailed branch), `giveWarrant` (131, which makes a fresh warrant with no `shutOut`), `letInStep` (564-620, where `gaveUp` is set), the `SHUT_OUT_DS` reset (726), `doorOpened` (217), `deskOutcome`'s default branch (desk.ts:845-858) and `askEngineering` (forcing.ts:152, its only caller is desk.ts:856). `cannotTold` is written and read only at arrests.ts:380-386 and 1151-1154 and declared in types.ts:580; no code in `CrewBrain/` or `tools/llm_crew/` deletes a key, and `brain.beat` is never reset. Nothing in the change log or plans covers it.

Ran a throwaway bun script on the window code with `tools/llm_crew/fixtures.ts`: an officer with a warrant on Pun Pun and a `shutOut` on the Bar marked `gaveUp`. The first `syncBeat` pushed `{what: 'cannot', name: 'Pun Pun', why: 'nobody has opened the Bar for security'}`. Then the warrant was taken out of `beat.warrants` as the jailed branch does, a new warrant on Pun Pun given with the same `gaveUp` on the Bar, and `syncBeat` run again: no outcome, and `cannotTold` still held the key from the first time.

Severity medium and effort small stand. Step 2 of the fix changed from five to ten minutes, for the PDA to the Captain each `cannot` brings.
