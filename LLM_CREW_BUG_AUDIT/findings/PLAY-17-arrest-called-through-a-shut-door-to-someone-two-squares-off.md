---
id: PLAY-17
title: An officer calls you are under arrest through a shut door or window to the person wanted, when they stand two squares off in a room locked to it
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1224, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1635
fix: Before the arrest line, when the person is seen in another room than the officer's own, note it shut out of that room and go to letInStep, whatever the distance
---

## What is wrong

The officer's code is meant not to call an arrest across a counter or through a window, and to ask to be let in instead (the comment in `serveStep` says so). But it only does that once `warrant.shutOut` is set, and that is set only after a walk at the person fails with them more than two squares off (`NEAR = 2`), or after the `arrest` tool comes back `no_way`. When the person wanted is within two squares, behind a shut door, the officer does not walk: it says the arrest line at once, through the door, and then tries the cuffs. Each time the person moves to another room `shutOut` is cleared, and the line is said again the next time they are seen.

The officer's own prompt gives the rule: said to them "before you have a hand on them, it is a warning to run". Here the person was told three times, through glass, while the officer could not get in.

Seen in `data/logs/2026/11/20/round-10.31.34` (played on `pre-night`; the code is the same on master). Warrant on the Quartermaster, Nehemiah Knapp; the officer, Kaleb Schofield, in the Cargo Lobby, which a shut, locked door at (78,146) parts from the Cargo Bay.

1. 16:41:15 `crew_brain.log`: "There is a warrant on Nehemiah Knapp, and Nehemiah Knapp is here. Your body is telling them, in these words: "Nehemiah Knapp, you are under arrest. Stand still."" `game.log` the same second has it said. Kaleb at (79,146) in the Cargo Lobby, Nehemiah at (77,150) in the Cargo Bay. Nehemiah answers aloud at 16:41:18. Only at 16:41:35 is the officer "Nehemiah Knapp is in the Cargo Bay, which is locked to you. You are going to the door".
2. 16:48:13: said again. Its walk at him right after, at 16:48:21, failed with "the last route planned was 1 steps", Nehemiah at (77,146), two squares off with the door between.
3. 16:49:17: said a third time from the Cargo Lobby.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1212` to 1250, in the step for a wanted person in sight:

        // In sight, and in a room it cannot get into: across a counter, or through a window. It
        // does not call the arrest out from there. It asks to be let in.
        // They have moved to another room since: the door it was asking at is no longer the one.
        if (
          warrant.shutOut &&
          seen.place &&
          warrant.shutOut.place !== seen.place
        ) {
          warrant.shutOut = undefined;
        }
        // A walk at them has already failed with them in that room: near or far, fought back or not,
        // the baton cannot reach them until someone lets it in.
        const far = (seen.distance ?? 0) > NEAR;
        if (warrant.shutOut) {
          return letInStep(brain, warrant);
        }
        // Someone who has hit it gets no second telling: the baton, at once.
        if (!warrant.resisted || warrant.toldAt === null) {
          if (far && !warrant.walkedUp) {
            ...
          }
          ...
          if (warrant.toldAt === null) {
            const line = arrestLine(seen.name, warrant.reason);

`arrests.ts:1635`, the only other place `shutOut` is set from a walk, and only for someone far off:

      if (warrant && act.tool === 'approach') {
        warrant.walkedUp = true;
        // It could not get to them, and they are in sight in another room: shut out of it.
        const seen = target(brain, warrant);
        if (!ok && seen && (seen.distance ?? 0) > NEAR && seen.place) {
          noteShutOut(brain, warrant, seen.place);
        }

Nothing compares `seen.place` with `brain.location` before the line is said.

## How it was found

Seen in the round log above, then read on master: both places are as quoted (`git diff pre-night master` does not touch them). Not checked: the 16:41:15 case, where the walk failed with Nehemiah four squares off and `shutOut` should have been set by the approach result; why it was not is not clear from the logs (the approach result is not logged). The 16:48:13 case is the plain one.

## How to fix it

1. In the in-sight step, before the `far` test: if `seen.place` is set and is not `brain.location`, and `seen.place` is one of the rooms locked to the officer (`brain.blockedPlaces`, or not its own room and the person is not in an open doorway), call `noteShutOut(brain, warrant, seen.place)`. If that returns true, `return letInStep(brain, warrant)`. If there is nobody to ask, fall through as now (ARR-07 covers that case).
2. Leave `toldAt` null, so that once it is let in and walks up, the line is said then, to their face.
3. Keep working: someone in the same room behind a counter still goes the ARR-07 way; someone in an open doorway, or in the next room with the door standing open, is still walked up to.

## How to test the fix

- Simulator: a cargo warrant scenario with the Quartermaster standing at the bay side of the lobby door. `game.log`: no "you are under arrest" from the officer before an "opened ... to let <officer> into" line, and a let-in ask in `pda.log` or aloud.
- Type check and lint.
- Next round, `game.log`: each "you are under arrest" line from security is said in the same room as the person (check the GAME-SAY areas of both).
