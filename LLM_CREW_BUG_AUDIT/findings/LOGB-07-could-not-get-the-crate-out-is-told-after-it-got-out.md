---
id: LOGB-07
title: A technician tells the Quartermaster it could not get a crate out to the lobby after it has got it out, and the Quartermaster sends another technician to see to it
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:714, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:637, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:213
fix: Clear brain.gaveUp when a later haul of the same crate succeeds, and have the Quartermaster check the held crates before it sends anyone to see to one
---

## What is wrong

When a technician gives up a haul, the brain keeps `brain.gaveUp` (which crate, which tool, where it was left) and `syncWontCome` makes a task to tell the Quartermaster, face to face, in fixed words: "Gratian, I could not get crate #7740 out to the lobby. It is still lying by a door." The word stands for five minutes (`WONT_COME_DS`) or until the Quartermaster says "I have that".

Nothing clears it when the crate does get where it was going on a later try. The technician goes on and says it all the same, and the Quartermaster, which takes the fixed words at their word, sends the other technician: "Monte, crate #7740 is lying by a door and Joi could not get it out to the lobby. See to it, please." By then the crate had been put out, collected and was on its way to the Custodial Closet.

The case, `data/logs/2026/11/18/round-17.48.05`, Joi Seelig (technician), Gratian Blyant (Quartermaster), crate #7740 for the Head of Personnel:

- 23:59:53 `game.log`: Joi "has given up hauling ... #7740 (release: it caught on something ...)". `brain.gaveUp` is set.
- 00:00:14 Joi: "Gratian, I could not get crate #7740 out to the lobby. It is still lying by a door." Not heard (no "I have that").
- 00:00:19 Joi: `release(7740, "p4")` again. 00:00:35 `crew_brain.log`: "You have brought crate #7740 out to the Cargo Lobby for Vincent Briner"; Joi says "Vincent, crate 7740 is out in the lobby for you."
- 00:00:44 Vincent takes hold of it (`collect_crate`).
- 00:01:10 Joi, step "You have word for Gratian Blyant ... that you could not get crate #7740 out to the lobby": "Gratian, I could not get crate #7740 out to the lobby. It is still lying by a door." Gratian: "Joi, I have that."
- 00:01:20 Gratian to Monte: "Monte, crate #7740 is lying by a door and Joi could not get it out to the lobby. See to it, please." (said again at 00:01:25 in `game.log`).
- 00:01:57 Vincent's memory: "You haul the crate #7740 to Custodial Closet and unpack it there".

The harm is small: Monte is given the shuttle and rooms for a while (`seeToUntil`), and the Quartermaster's word to its staff is untrue. But the Quartermaster is told something false in the fixed words it trusts, and passes it on.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:714`, set on any give-up, and nowhere cleared but by the telling:

      if (event.details.gave_up && typeof event.details.tool === 'string') {
        const number = Number(event.details.number);
        const named = String(event.details.crate ?? 'crate').replace(/\./g, '');
        brain.gaveUp = {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:644`, in `syncWontCome`, owed for five minutes whatever has happened to the crate since:

      const owed =
        !!gaveUp &&
        !!how &&
        brain.now - gaveUp.at < WONT_COME_DS &&
        brain.now - (brain.wontComeTold[gaveUp.what] ?? -Infinity) > WONT_COME_DS &&
        !!quartermasterAboard(brain);

`grep -rn "gaveUp = " tgui/packages/tgui/interfaces/CrewBrain` finds the one set in `brain.ts` and the two clears in `syncWontCome`.

## How it was found

Seen in a round log, as quoted, and the cause read in the current code, unchanged at each place quoted.

## How to fix it

1. In the cargo job's `afterActing`, when a `release`, `unload`, `recycle` or `stow_crate` comes back ok for the same crate as `brain.gaveUp.what` (the result carries `number` for a held crate), set `brain.gaveUp = null` and finish any open `WONT_COME` task. For a loose crate with no number, any ok haul of the same tool after the give-up will do.
2. In `syncWontCome`, for a held crate (`crate #N`), drop the word if `brain.heldCrates` shows it `out` or `takenBy` someone, or no longer lists it.
3. On the Quartermaster's side (`quartermaster.ts`, where `WONT_COME_WORDS` sets `ledger.sendFor`), do not send anyone for a held crate that its own held list shows as out or taken.

## How to test the fix

- A simulator scenario where a release fails three times, is given up, and then succeeds on the next try before the Quartermaster is in sight. Want no "I could not get crate #N out to the lobby" afterwards and no "See to it".
- Type check.
- Next round: no "could not get crate #N out to the lobby" in `game.log` after "bring crate #N out to" for the same N.
