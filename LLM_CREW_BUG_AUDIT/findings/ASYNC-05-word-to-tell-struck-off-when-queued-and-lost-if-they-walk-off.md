---
id: ASYNC-05
title: Word meant for someone face to face is struck off the moment it is queued for the model, and is lost if they walk out of sight before it is said
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 92e7a0de62c
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:873, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:719, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1359, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1396, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1612
fix: Strike a spoken tell off toTell only once the line has gone out with its person still in view, not in noteDone when it is handed to the model; if they have gone, say nothing and leave it on toTell
---

## What is wrong

See also: DRV-07 (its first half has the same cause, `noteDone` called in `drive` as soon as a line is handed to `speak`, for shut-in asks; one change that runs `noteDone` for a spoken step only once the line is said would mend both, but DRV-07's second half, asks and knocks never made again, is a fault of its own)

`brain.toTell` holds words the body means to say to one person: "Order 7, right away." to the Quartermaster, the officer's answer to a warrant (`WARRANT_ACK`), "crate 12 is out in the lobby for you", "Yes, Captain. I am putting Pun Pun out.", a head's report to the Captain (`way.report`), and about twenty more. The step comes up when that person is in view.

For a spoken one the driver hands the line to `speak` (which sets `brain.mustSay` and queues the NPC for the model) and then calls `noteDone` straight away, which strikes the line off `toTell`. The line is actually said only at the end of `think()`, after the NPC's turn has come and the model has answered. That is a second or two with a free model and one NPC, and anything up to a minute or more when others are ahead in the queue or the model is slow (see DRV-05).

At the end of `think()` the line is said only if somebody is in view or somebody was heard this turn (`alone`). If the person it was for has walked out of sight in the meantime and nobody else is about, the line is dropped, and since it is no longer on `toTell`, nothing ever says it. If someone else is in view, or the absent person was the one who had just spoken to it (so is still in `speakers`), it is said anyway: to someone else, with the absent person's name on it, or to an empty room. Either way the work goes on as if it had been told: whoever was waiting on the word never gets it.

The case it fits best is the one these words exist for: a person who has just said something and is turning to go.

Concrete case:

1. The Quartermaster stands at the technician's counter and says "Sam, order 7: two Janitorial Supplies Crates for the Janitor." `CARGO.overhears` pushes `{ to: 'Ada Quartermaster', line: 'Order 7, right away.' }` (`cargo.ts:2165`).
2. On the next update `nextStep` finds the tell, since Ada is in view. `drive` calls `fail(key)`, `speak(...)`, then `noteDone(brain, step)`: `brain.toTell` no longer has the line.
3. The model is busy with a janitor's reply. Sam waits his turn: four seconds.
4. The Quartermaster, its order given, has walked back into its office and shut the door. Sam's `peopleInView` is empty.
5. `think()` for Sam. Here the Quartermaster had just spoken to Sam, so it is in `speakers` (`brain.ts:1036`, `:1297`) and `alone` is FALSE: the line *is* said, to an empty counter, and the after-saying hooks run. Out of sight is out of earshot, so the Quartermaster does not hear it. (When the tell did not come from speech in that same turn, `speakers` is empty, `alone` is TRUE and the line is not said at all: the `exact` branch is skipped by `if (!alone)`, the plain-line branch by `mustSay && !alone`.) Either way the word does not reach the person it was for.
6. The Quartermaster never hears that order 7 was taken, though Sam goes on to place it. Here there is a way back: after `TAKEN_WAIT_DS` (a minute) the Quartermaster gives order 7 again (`quartermaster.ts:805`). That costs a minute and a second walk to the counter.

Most spoken tells have no way back. The Captain says "Ann, put Pun Pun out of here" and walks on: guarding pushes "Yes, Captain. I am putting Pun Pun out." (`guarding.ts:743`). If the Captain is out of sight by the time Ann's turn with the model comes, nothing is said, and the Captain, the human player, is not answered at all. Likewise a technician's "Sorry, I am not holding a crate by that number." to someone who asked at the counter and turned to look around.

The same struck-off-at-once happens on the quick path for words said in passing (`driver.ts:719`) and on the model-down path in the `catch`, which says the line only `if (mustSay && brain.peopleInView.length > 0)`.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805`, in `drive`:

    if (step.say) {
      // Asked once; if nothing comes of it, it is left a while before being asked again.
      fail(brain, step.key);
      speak(step.say, step.needs, step.sayIf, step.exact);
      noteDone(brain, step);
      return step;
    }

`driver.ts:873`, in `noteDone`:

    if (step.tells) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
    }

`driver.ts:719`, the quick path, the same:

      fail(brain, key);
      speak(quick.line, quick.needs, undefined, quick.exact);
      noteDone(brain, step);

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1359` and `:1390`, in `think`:

    const alone = brain.peopleInView.length === 0 && speakers.length === 0;
    ...
    if (mustSay && exact) {
      ...
      if (!alone) {
        actions.push({ tool: 'say', text: withRemark(mustSay, given?.text) });
      }
      actions.push(...rest);
    } else if (
      mustSay &&
      !alone &&
      !actions.some((action) => action.tool === 'say')
    ) {

`brain.ts:1612`, the model-down path:

    if (mustSay && brain.peopleInView.length > 0) {

Neither looks at whether the person the line is for is still in view.

## How it was found

Read from the code: `drive`, `nextStep`'s tell step, `noteDone`, and the end of `think` on both paths. Not seen in a round. HOLE-06 found the same early strike-off for words sent by PDA when the PDA will not send; this is the spoken half, and its cause is the wait for the model, not a refusal.

## How to fix it

1. Give `speak` the tell it is for. In `drive`, pass `step.tells` (and the person, `tell.to`) through `speak` into a new field `brain.mustSayTell = { line, to }`, and do **not** call `noteDone` for a spoken step with `tells`. Keep `noteDone` as it is for PDA tells (those are HOLE-06's business) and for everything else.
2. In `think()`, copy `brain.mustSayTell` with the other `mustSay` fields at the start and clear it on the brain. After the await, if a tell is in hand and its person is no longer in `brain.peopleInView`, do not say the line at all and leave it on `toTell`: it comes up again when they are next in view, within its `keepMs` (120 seconds by default, 20 for the lobby crate). Treating it like `dropped` is not enough on its own: `dropped` still lets the LLM's own `say` through when `speakers` is not empty, and here the speaker is usually the very person who has gone. So set `mustSay = null` and also drop every `say` action unless one of `speakers` is still in `brain.peopleInView`. If the person is in view and the line goes out, strike it off `toTell` there, beside `afterSaying(brain)`. Also clear `mustSayTell` in the early return at the top of `think` (the `mustSayIf` one) and in `fixtures.ts`' `makeBrain` / the new-brain block (`brain.ts:252` and on).
3. Do the same on the `catch` path: say it only if its person is in view, and strike it off only then.
4. The step is in backoff (`fail(key)`) for 20 seconds after it is handed over. Leave that: it stops the line being asked for again on every update while the model thinks. When the line is put back because its person had gone, clear that failure (`brain.failures.delete(key)`) so that it is said as soon as they are back.

This needs no change on the server and does not touch what the model is asked.

## How to test the fix

- Simulator: a scenario where the Quartermaster gives an order and leaves the technician's view one update later, while the model is held busy by another NPC (the sim can delay its model answers). Before: no "Order 7, right away." ever. After: it is said when the Quartermaster is next in view.
- Type check from `tgui/`.
- Next round: in `game.log`, every "readsOrder" line from the Quartermaster should be followed by the technician's "Order N, right away." line. Grep `crew_brain.log` for decisions whose trigger quotes a toTell line and whose `say` is missing.

## Check

Checked by Opus 5.5. Read `drive` (`driver.ts:666-835`), the quick path (`:700-723`), the tell step in `nextStep` (`:441-468`), `noteDone` (`:841-880`), the `speak` callback in `ingest` (`brain.ts:750-760`), `shouldWake`'s speech branch (`brain.ts:960-1036`) and `think` (`brain.ts:1273-1625`). The quotes are what the code says today. `noteDone` strikes the tell off as soon as `speak` has set `mustSay`; nothing puts it back; the line is said only after the model returns, against `peopleInView` as it is then, and nothing checks the tell's person.

One correction, made in the body: in the write-up's own case the Quartermaster has just spoken to Sam, so it is in `speakers` and `alone` is FALSE. The line is said to an empty counter rather than dropped. The Quartermaster still does not hear it, so the fault stands; only step 5's reason was wrong. The same goes for the Captain case. The fix's check on the tell's person (not on `alone`) covers both, and I added that the LLM's own `say` must be held back too, or it still goes out to the empty room.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans fixes this (the only `toTell` entries are `keepMs` at line 695 and `exact`/`whileBusy` at 1014). Effort raised to medium: `driver.ts`, `brain.ts`, `types.ts` and the fixture, under 100 lines. Severity medium stands: the work goes on, and most tells have a retry or are courtesy lines; a human Captain left unanswered is noticed. Not run: the case needs a held model and a moving person, which the simulator cannot be asked for without running it.
