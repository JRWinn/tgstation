---
id: QM-14
title: The Quartermaster's I have that to a technician is held back longer each time it is said, till the technician gives up on it, and while held back it holds up every line queued behind it
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 76043e61716
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:444, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:719, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:931, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1517
fix: Do not count saying a toTell line as a failure (it leaves the queue when said), and in the toTell step take the first line that is not held back rather than stopping at the first one
---

## What is wrong

See also: ARR-01, which found the root (every saying of a line is counted by the driver as a failure of that line, and the count is never cleared) and its cost to an officer's arrest line. This is the cost to the Quartermaster, which is worse, and a second fault in the same place that ARR-01 does not cover.

**1. "Sam, I have that." gets slower every time.** Each time a technician tells the Quartermaster something (an order has come in, a crate is still waiting, a crate is lost or would not come), `heardIt` queues the same line, "Sam, I have that.", to be said at once (`whileBusy`). The quick path in `drive` calls `fail(brain, key)` on it as it says it. `fail` adds one to that line's count and holds it back for 20 seconds times the count, up to 2 minutes. Nothing ever clears it. So from the sixth time the Quartermaster answers one technician, the answer is held back for up to 2 minutes after the last one.

The technician waits 25 seconds (`HEARD_WAIT_DS`) for it, says its word again, waits again, and after two tries (`TELL_TRIES`) gives up and falls back to the PDA (`tellQuartermaster` in `cargo.ts`). For word that an order has come in, that fall-back tells the head and not the Quartermaster (CARGO-02): the order stays `given` in the book for good and that technician is never given another order. So in a long round the Quartermaster's order flow stops by itself, with nothing having gone wrong.

**2. One held-back line holds up every message behind it.** The general tell step finds the first line in `brain.toTell` it could give, and if that one is held back it gives none:

    const tell = brain.toTell.find((it) =>
      it.byPda
        ? brain.hasPda
        : brain.peopleInView.some((person) => person.name === it.to),
    );
    if (tell) {
      const key = `tell:${tell.to}:${tell.line}`;
      if (!inBackoff(brain, key)) {

The held-back "Sam, I have that." sits in front of the PDA messages the same word causes (`noteDocked` queues the crate numbers for the head straight after `heardIt`), and in front of anything else queued after it: "Noted, order N" to a head, the question to the Captain. They wait until the hold-back runs out, up to two minutes.

Whether one is lost outright is less clear (correction by the checker). Every line in `toTell` is dropped unsent two minutes after it was queued (`TELL_KEPT_MS`). But a line behind "I have that" was queued after that line was last queued, so after it was last said, and the hold-back ends at most two minutes after that saying: so a line with the default keep time is held up by less than two minutes and still goes. It can be lost if it has a shorter `keepMs`, or if a second held-back line stands in front once the first goes. In the checker's own run all ten PDA reminders went, the later ones 10 to 26 seconds late.

Checked with a script (`heard2.ts` in the system temp folder) that drives the real `drive` with a Quartermaster in the Cargo Bay and its technician Sam beside it. Every 90 seconds Sam says "Ada, still waiting to be collected: crate #N for Hop Kins.", and says it again after 26 and 52 seconds if not answered, as `tellQuartermaster` does. How long until the Quartermaster says "Sam, I have that.":

    word 1 at +0s:   after 0s
    word 5 at +360s: after 0s
    word 6 at +450s: after 10s
    word 7 at +540s: after 40s
    word 8 at +630s: after 70s   <- the technician has given up and gone to PDA
    word 9 at +720s: after 100s  <- the same
    word 10 at +810s: never in 2 minutes
    PDA reminders to Hop Kins sent: 8 of 10

The finder took the two missing reminders to be dropped unsent behind the held-back line. The checker's run (see Check) did not lose any, so how those two were lost is not known: it may be in the finder's script.

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

1. A line that was said is not a step that failed. For a step that carries `tells` (a line from `brain.toTell`, which `noteDone` takes off the queue as it is said, so it cannot be said again unless someone queues it again), do not call `fail`: in the quick path (`driver.ts:719`) and in the `step.say` branch (`driver.ts:807`) when `step.tells` is set. Do **not** drop `fail` for every `exact` say, as the first draft of this fix said: a plan's own `say` stays the step until the plan's state moves on, and the growing hold-back is all that keeps it from being said on every tick (the emergency path at `driver.ts:689` and plan says at `:807`).
2. If a hold-back is still wanted for a `tells` line, so that one line queued twice in a breath is not said twice, make it a flat few seconds and not one that grows: `brain.failures.set(key, { count: 0, until: Date.now() + 5000 })`.
3. In the general tell step, pick the first line that is not held back: move the `inBackoff` test into the `find` callback.
4. Optionally give the Quartermaster's PDA lines a longer `keepMs` (say five minutes) so a busy minute does not lose the crate numbers. HOLE-06 has the wider question of word that is lost.

## How to test the fix

Run the script above (or put it in `tools/llm_crew/`): "Sam, I have that." must come at once for every word. Check also that a plan step with a fixed `say` (for example the shut-in ask in `nextStep`, `SHUT_IN_KEY`) is still said once and then held back, not on every tick. Add a case with a held-back face-to-face line first in `toTell` and a PDA line after it: the PDA must be sent. Run the simulator's cargo scenarios four at a time and check that arrivals still reach the Quartermaster late in the run. Type check and lint. In a round, grep `game.log` for "I have that" and for technicians' PDAs "Your order has come in" sent to a head while the Quartermaster was aboard.

## Check

Checked by Opus 5.5. The quotes at `driver.ts:444`, `:719`, `:931` and `quartermaster.ts:1517` are what the code says today. I read `inBackoff`, `fail`, `noteDone` and `noteResult`: the count in `brain.failures` for `tell:Sam Rees:Sam, I have that.` is only ever cleared by `brain.failures.clear()` when a door is held for the body, it gets out of being shut in, or it resets a fire alarm (`brain.ts:463`, `:679`, `driver.ts:997`). `noteResult` deletes a key only for an act the server answered, and a say is not an act. A Quartermaster keeps its post, so none of those clears is likely. `heardIt` takes the old line off and queues it again, but the hold-back is keyed on the words, so queueing again does nothing to it. On the technician's side `HEARD_WAIT_DS = 250` and `TELL_TRIES = 2` (`cargo.ts:140`, `:142`, used at `:348` and `:361`) are as the finding says.

I wrote my own script (scratchpad `chk/qm14.ts`, bun, `Date.now` stubbed, the real `drive` and `QUARTERMASTER.overhears`): a Quartermaster in the Cargo Bay with Sam in view; every 90 seconds Sam says a "still waiting to be collected" line, and once more after 26 seconds if not answered. "Sam, I have that." came at once for words 1 to 5, then after 10, 40 and 70 seconds for words 6 to 8; by word 8 Sam's two tries were used up before the answer came, so it would have gone to the PDA. The count stood at 9 at the end. That confirms part 1.

Part 2 I could only half confirm. The general tell step does stop at the first deliverable line when it is held back, so lines behind it wait. But in my run all ten PDA reminders to Hop Kins went (at +1, +91, +181, +271, +361, +461, +566, +656, +746, +821 s), the later ones late, none lost; I explain in the body why a line with the default keep time behind it cannot be held up the full two minutes. I mended the title and part 2 to say "holds up" and marked the finder's "8 of 10" as not reproduced.

I also corrected fix step 1: dropping `fail` for every `exact` say would let a plan's fixed say be said on every tick, because only the hold-back stops that. The safe line is `step.tells`: those lines leave `toTell` when said. Moving `inBackoff` into the `find` (step 3) is right and small.

Nothing in `LLM_CREW_CHANGELOG.md` changes the growing hold-back for said lines; ARR-01 (confirmed) is the same root for an officer, as the finding says. Severity high stands: in a long round the Quartermaster stops being heard by a technician it has answered six or more times, and with CARGO-02 that technician's orders stop. Effort small: a few lines in `driver.ts`. Not seen in a round.
