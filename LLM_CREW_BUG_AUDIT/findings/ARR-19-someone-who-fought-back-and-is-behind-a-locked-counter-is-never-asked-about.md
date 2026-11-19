---
id: ARR-19
title: Someone in sight across a locked counter who has fought back, or who stands within two tiles, is never asked to be let in to, and security walks, shouts and fails at them for ever
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:785, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:789, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1113
fix: Gate the let-in branch on shutOut alone, for the room they are in, dropping both the not-resisted and the more-than-two-tiles conditions
---

## What is wrong

See also: ARR-07 (the same endless round, for someone in the officer's own room). This is a different cause: a room that is locked to it, with people to ask, and a flag that skips the asking.

In `serveStep`, someone in sight in a room security is shut out of is handled by `letInStep`: go to the door, ask whoever's ID opens it, wait. The branch has three conditions:

    if (far && warrant.shutOut && !warrant.resisted) {
      return letInStep(brain, warrant);
    }

`warrant.resisted` is set the moment the person on the warrant hits, shoves or takes hold of security (`securityFeels`), and is never cleared. So once someone has fought back, the let-in is never tried, whatever room they are in. What runs instead:

1. `resisted` and `toldAt` set: the arrest, with the baton (`how: 'force'`). The server walks at them, finds no way, and answers `no_way` with the room and its keepers.
2. `beatAfterActing`: `no_way` sets `toldAt = null` and `noteShutOut` (already noted, so nothing changes). No try is counted.
3. `toldAt` is null, so the "telling" block runs: `far && !walkedUp` (the arrest cleared `walkedUp`), so `approach`. The walk fails or stops short. `walkedUp` is set.
4. The arrest line, said across the counter: "Pun Pun, you are under arrest, for trespass. Stand still."
5. Back to 1.

No try is ever counted, so it never rests and never sends "I cannot bring in". Nobody is asked to open the door, so nobody does, and nothing goes up to the Head of Security for engineering to force it. The driver's back-off (ARR-01) slows the round to once every one or two minutes. It goes on for as long as they stay in sight.

That the baton should come "at once" for someone who has hit it is the reason for the condition (the comment above the telling block: "Someone who has hit it gets no second telling: the baton, at once."). But `far && warrant.shutOut` already says the baton cannot reach them: it is more than two tiles off and in a room security cannot walk into.

One concrete case: a warrant on Pun Pun. The officer finds it in the Bar Lounge and goes for the cuffs; the monkey bites it (`resisted`, `force`) and gets away behind the bar counter, into the Bar, which is locked to security. It sits on the far side of the counter, three tiles off, in plain sight. The officer's `arrest(p2, 'force')` comes back `no_way`, place "Bar", keepers the Bartender, the Head of Personnel and the Captain. From then on: walk at it, say the arrest line, try the baton, `no_way`, round again. The Bartender is never asked. The Captain hears nothing.

### The same round with no fighting back, at the counter

The other condition, `far` (more than `NEAR`, two tiles), has the same effect. Across a bar or a desk the person is often two tiles off: the officer at the counter, the counter, then them. `far` is false, so the let-in branch is skipped, and so is the walk-up. The plan is the arrest line, then the quiet arrest; the server walks at them and answers `no_way`; `toldAt` goes back to null; the line again; and so on. `shutOut` is set by that first `no_way`, so the window knows they are in a room it is shut out of, and does nothing with it. The bartender at work behind the bar, with a warrant on them, is the plain case.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:784`, in `serveStep`:

    const far = (seen.distance ?? 0) > NEAR;
    if (far && warrant.shutOut && !warrant.resisted) {
      return letInStep(brain, warrant);
    }
    // Someone who has hit it gets no second telling: the baton, at once.
    if (!warrant.resisted || warrant.toldAt === null) {
      if (far && !warrant.walkedUp) {
        return { ... act: { tool: 'approach', person: seen.handle }, dropsWalk: true };
      }
      if (
        warrant.toldAt === null ||
        brain.now - warrant.toldAt > TOLD_STANDS_DS
      ) {
        const line = arrestLine(seen.name, warrant.reason);
        return { ... say: line, exact: true };
      }
    }
    return { ... act: { tool: 'arrest', person: seen.handle, how: force ? 'force' : 'quiet' } };

`jobs/arrests.ts:1113`, in `beatAfterActing`, the `no_way` answer, which counts no try:

    if (reason === 'no_way') {
      warrant.toldAt = null;
      noteShutOut(...);
      return;
    }

`jobs/arrests.ts:1262`, in `securityFeels`, where `resisted` is set and never cleared:

    if (warrant) {
      warrant.resisted = true;
      warrant.force = true;
      warrant.restUntil = 0;
      return;
    }

## How it was found

Read from the code, stepping through `serveStep` and `beatAfterActing` by hand for the case above. Not seen in a round.

## How to fix it

1. Change the branch to `if (warrant.shutOut && seen.place === warrant.shutOut.place)`, with neither `far` nor `!warrant.resisted`. `shutOut` is only set when a walk at them has failed with them in view in that room, which is the evidence that they cannot be reached; how far off they are does not add to it. The baton "at once" still holds for anyone it can reach: there is then no `shutOut` for their room, and the arrest goes as now. The existing line just above, which clears `shutOut` when they move to another room, stays.
2. Keep `resisted` for what it is for: the five extra minutes and no second telling once it can get at them.
3. With ARR-07's fix (count a `no_way` with nowhere to ask as a try), the case where nobody can be asked also ends in a rest and a report.

## How to test the fix

- `tools/llm_crew/security.ts`: a warrant with `resisted: true`, `force: true`, `toldAt` set and `shutOut` set; the person in view at distance 3 in another room. `planBeat` on the serve task should give the `go_to_door` or the let-in message, not `approach`, `say` or `arrest`.
- A simulator scenario where the wanted person bites the officer and steps behind a locked counter: the officer should go to the door and ask.
- In the next round, grep `pda.log` for "Could you let me in, please?" after an officer is bitten, and `game.log` for the same arrest line said more than twice.
