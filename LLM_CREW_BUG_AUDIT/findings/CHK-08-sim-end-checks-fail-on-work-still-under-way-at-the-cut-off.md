---
id: CHK-08
title: Two simulator scenarios fail by chance because their end checks read the crew at a fixed second, with a look round or a reminder still under way
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:1306, tools/llm_crew/sim.ts:1523, tools/llm_crew/sim.ts:1524, tools/llm_crew/sim.ts:437, tgui/packages/tgui/interfaces/CrewBrain/jobs/rounds.ts:25
fix: Stop starting new held checks and look rounds in the last minute of a scenario and run the clock on until no body has a walk or a message in hand, before the end checks
---

## What is wrong

See also: GAP-22, which lists `aside` and `nested` as scenarios that fail by chance and asks why. `aside` is explained by DRV-03. This finding explains the two others seen failing in the audit's three quiet runs of every scenario: `mixed` (1 run of 3) and `qmwait` (1 run of 3). Neither is a fault in the window code. Both are the simulator stopping the clock at a fixed second and then checking an end state that a piece of routine work, begun a few seconds before, has not yet reached.

1. **`qmwait`, "the cargo technician ends at the post".** The scenario runs 560 seconds. A technician alone at its post looks in on the Delivery Office every five minutes (`LOOK_IN_EVERY_DS = 3000`), later when other work holds it up. In the failing run (seed 3, see below) its first look was at 00:19:49; the held-crate check and the knock at the Quartermaster's door took it to 00:25:22; it set off for the Delivery Office at 00:25:53. The clock stopped at 00:26:00, and the check found it in the Delivery Office:

       00:25:22 Cargo Bay                word_passed {"person":"Hal Pott","kind":"waiting"}
       00:25:53 Cargo Bay                go_to {"place":"Delivery Office"}
       FAIL the cargo technician ends at the post  Cora Tech in Delivery Office

   Eight seconds later it would have been back in the bay. It is doing what it was built to do.

2. **`mixed`, "nobody is still owed a PDA message about their crates".** The scenario runs 420 seconds (the clock ends at 00:23:40). The simulator's server sets a technician's look over the held crates at a random moment, 300 to 360 seconds after the crates came in (`heldCheckDue`, `heldWait`). The crates came in at about 00:17:40 to 00:18:10, so the look falls between about 00:22:50 and 00:23:40. The look takes 4 seconds; then the reminder by PDA is sent some 6 to 8 seconds later. A look that ends in the last eight seconds or so leaves a notice owed when the clock stops, and the check fails. A look that starts in the last four seconds never finishes, pushes no notice, and the check passes. Over seeds 1 to 8 the looks fell at:

       00:22:58  00:23:18  00:22:58  00:22:52  00:22:50  00:23:18  00:23:39  00:23:38

   Seeds 7 and 8 began their look a second or two before the end and passed only because it had not finished. The failing run from the audit's first pass, `quiet_mixed_3`, said "Still waiting: crates 4521 and 4522 and 4523 for Hal Pott. I will send word." and ended with `Cora Tech: 1` owed.

The cost is the one GAP-22 names: three change log entries in a row put a red run down to chance, and a check that fails one run in three on good code cannot catch a fault that shows one run in three. These two are now known to be chance, and why.

## Where

`tools/llm_crew/sim.ts:1306`, the fixed lengths:

    const SECONDS = ... : VARIANT === 'qmwait' ? 560 : ... : VARIANT === 'mixed' ? 420 : 540;

`tools/llm_crew/sim.ts:437`, the held check's random moment:

    const heldWait = () => HELD_CHECK_EVERY + (Math.random() * 2 - 1) * HELD_CHECK_SPREAD;

`tools/llm_crew/sim.ts:1523` and `:1524`, the end checks:

    check(techs.length > 1 ? 'the cargo technicians end at the post' : 'the cargo technician ends at the post', techs.every((body) => body.room === 'Cargo Bay'), ...);
    check('nobody is still owed a PDA message about their crates', techs.every((body) => body.notices.length === 0), ...);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/rounds.ts:25`:

    const LOOK_IN_EVERY_DS = 3000;

## How it was found

Checks that were run. The audit's first pass ran every scenario three times in quiet mode; `quiet_mixed_3` and `quiet_qmwait_1` failed and the other two runs of each passed. To repeat them, `Math.random` was replaced with a seeded one by a preload file kept outside the repo (`bun --preload <temp>/seed.ts tools/llm_crew/sim.ts quiet qmwait` with `SEED=n` and `SHOW=1`); the same seed gives the same run byte for byte. `quiet qmwait` failed on seed 3 only, of seeds 1 to 8, with the lines quoted above. `quiet mixed` failed on seed 13 only, of seeds 1 to 20 (so the 1 in 3 of the first pass was bad luck; about 1 in 20 is nearer), exactly as described: the look began at 00:23:35, it said "Still waiting: crates 4521 and 4522 and 4523 for Hal Pott. I will send word." and the clock stopped at 00:23:40 with `FAIL nobody is still owed a PDA message about their crates  Cora Tech: 1`. The times of the looks above are from the logs of seeds 1 to 8. No code was changed.

The same check failed once more in this audit, in another scenario: the second dead-mode run of `shutout` (`sim.ts dead shutout`) ended `FAIL the cargo technician ends at the post  Cora Tech in Delivery Office`, the first passed. That run was not kept with `SHOW=1`, so its timing was not read, but the line is the same, and any scenario with a technician alone at its post can end mid look round. So the fix belongs in the shared end of `sim.ts`, not in one scenario.

## How to fix it

1. In `sim.ts`, end each scenario in two parts. For the last 60 simulated seconds (`second >= SECONDS - 60`), have the fake server stop offering new routine work: `heldCheckDue` returns false, and `look_in_rooms` is sent empty. Then, after `SECONDS`, keep the clock running, up to 60 more seconds, until no body is `busy`, none has a `go_to` or `message` in its last log line within the past few seconds, and every body's `notices` is empty or has been for 30 seconds. Then run the checks.
2. Print the extra seconds used ("ran on 9s for work under way") so it shows if that grace ever starts hiding something.
3. Do not widen the two checks themselves: a technician that really never goes back to its post, or a reminder that is really never sent, must still fail.
4. Optional, and with GAP-22's step 1: make the seed part of `sim.ts` (print it at the start, take it from `SEED=`), so the seeded runs used here need no preload file.

## How to test the fix

- `SEED=3 ... sim.ts quiet qmwait` (with the seed as above, or in `sim.ts` after step 4): all passed, and the technician's log ends with it back in the Cargo Bay.
- `quiet mixed` over seeds 1 to 20 and `quiet qmwait` over seeds 1 to 8: all passed.
- Every other scenario once more in quiet mode: none must newly fail, and the "ran on" line should be 0 to a few seconds in most.
