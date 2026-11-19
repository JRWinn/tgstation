---
id: QM-14
title: The Quartermaster's I have that to a technician is held back longer each time it is said, till the technician gives up on it, and while held back it stops every PDA message behind it
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:444, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:719, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:931, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1517
fix: Do not count a line said word for word as a failure, and in the toTell step take the first line that is not held back rather than giving up when the first one is
---

## What is wrong

See also: ARR-01, which found the root (every saying of a line is counted by the driver as a failure of that line, and the count is never cleared) and its cost to an officer's arrest line. This is the cost to the Quartermaster, which is worse, and a second fault in the same place that ARR-01 does not cover.

**1. "Sam, I have that." gets slower every time.** Each time a technician tells the Quartermaster something (an order has come in, a crate is still waiting, a crate is lost or would not come), `heardIt` queues the same line, "Sam, I have that.", to be said at once (`whileBusy`). The quick path in `drive` calls `fail(brain, key)` on it as it says it. `fail` adds one to that line's count and holds it back for 20 seconds times the count, up to 2 minutes. Nothing ever clears it. So from the sixth time the Quartermaster answers one technician, the answer is held back for up to 2 minutes after the last one.

The technician waits 25 seconds (`HEARD_WAIT_DS`) for it, says its word again, waits again, and after two tries (`TELL_TRIES`) gives up and falls back to the PDA (`tellQuartermaster` in `cargo.ts`). For word that an order has come in, that fall-back tells the head and not the Quartermaster (CARGO-02): the order stays `given` in the book for good and that technician is never given another order. So in a long round the Quartermaster's order flow stops by itself, with nothing having gone wrong.

**2. One held-back line stops every message behind it.** The general tell step finds the first line in `brain.toTell` it could give, and if that one is held back it gives none:

    const tell = brain.toTell.find((it) =>
      it.byPda
        ? brain.hasPda
        : brain.peopleInView.some((person) => person.name === it.to),
    );
    if (tell) {
      const key = `tell:${tell.to}:${tell.line}`;
      if (!inBackoff(brain, key)) {

The held-back "Sam, I have that." sits in front of the PDA messages the same word causes (`noteDocked` queues the crate numbers for the head straight after `heardIt`), and in front of anything else queued after it: "Noted, order N" to a head, the question to the Captain. Every line in `toTell` is dropped unsent two minutes after it was queued (`TELL_KEPT_MS`). So a message queued behind it can be lost outright.

Checked with a script (`heard2.ts` in the system temp folder) that drives the real `drive` with a Quartermaster in the Cargo Bay and its technician Sam beside it. Every 90 seconds Sam says "Ada, still waiting to be collected: crate #N for Hop Kins.", and says it again after 26 and 52 seconds if not answered, as `tellQuartermaster` does. How long until the Quartermaster says "Sam, I have that.":

    word 1 at +0s:   after 0s
    word 5 at +360s: after 0s
    word 6 at +450s: after 10s
    word 7 at +540s: after 40s
    word 8 at +630s: after 70s   <- the technician has given up and gone to PDA
    word 9 at +720s: after 100s  <- the same
    word 10 at +810s: never in 2 minutes
    PDA reminders to Hop Kins sent: 8 of 10

The two missing reminders were dropped unsent behind the held-back line.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:701`, the quick path:

    const key = quick ? `tell:${quick.to}:${quick.line}` : '';
    if (quick && !inBackoff(brain, key)) {
      ...
      fail(brain, key);
      speak(quick.line, quick.needs, undefined, quick.exact);

`driver.ts:931`, `fail`:

    const count = (brain.failures.get(key)?.count ?? 0) + 1;
    brain.failures.set(key, {
      count,
      until: Date.now() + Math.min(RETRY_MS * count, RETRY_MAX_MS),
    });

`driver.ts:444`, the general tell step quoted above.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1517`, `heardIt`, which queues the same line for every word from one technician:

    const line = `${firstName(speaker)}, ${WORD_HEARD}.`;
    brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
    brain.toTell.push({

## How it was found

Read from the code, then the script above, run with `tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe` against the real `driver.ts` and `jobs/quartermaster.ts` (with `Date.now` stubbed to move the clock). The technician's side was not run; its 25 second wait and two tries were taken from `cargo.ts` (`HEARD_WAIT_DS = 250`, `TELL_TRIES = 2`). Not seen in a round. The same two faults reach every fixed line said again and again ("The engine, right away.", the security "I have that"), which is why the area is driver.

## How to fix it

1. A line that was said is not a step that failed. In the quick path and in the `step.say` branch of `drive`, do not call `fail` for a line that is `exact` (said word for word by the body, so nothing can go wrong with the words); for one the model words, keep the hold-back but delete the record when `afterSaying` sees the line said, as ARR-01 step 5 proposes (a `forget(brain, key)` exported from `driver.ts`, called from `brain.ts` beside `afterSaying`).
2. If a hold-back is still wanted so that one line is not said twice in a breath, make it a flat few seconds, not one that grows: `until: Date.now() + 5000`, no count.
3. In the general tell step, pick the first line that is not held back: move the `inBackoff` test into the `find` callback.
4. Optionally give the Quartermaster's PDA lines a longer `keepMs` (say five minutes) so a busy minute does not lose the crate numbers. HOLE-06 has the wider question of word that is lost.

## How to test the fix

Run the script above (or put it in `tools/llm_crew/`): "Sam, I have that." must come at once for every word. Add a case with a held-back face-to-face line first in `toTell` and a PDA line after it: the PDA must be sent. Run the simulator's cargo scenarios four at a time and check that arrivals still reach the Quartermaster late in the run. Type check and lint. In a round, grep `game.log` for "I have that" and for technicians' PDAs "Your order has come in" sent to a head while the Quartermaster was aboard.
