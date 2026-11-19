---
id: TRA-03
title: Any line from cargo about a lost crate or a wrong number ends every crate errand a collector has asked for in the last minute, whatever crate it was about
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:224, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:231, code/modules/llm_crew/crew_npc_held.dm:102, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:66
fix: In pickupsOverhear act only on a line that names the task's own crate number, or on a numberless no-such-crate line said to this body by name or beside it
---

## What is wrong

`pickupsOverhear` is how someone sent for a crate learns at the counter that there is no such crate. It takes any line from a cargo person that matches `/not holding a crate|(has|have) been lost|is lost\b/i` and is not said to someone else (`said_to !== 'other'`), and then, for every collect task it asked about in the last minute, ends the task and sends its head "Cargo says there is no crate #N to collect: it has been lost, or the number is wrong. I have not got it."

It never looks at which crate the line is about. Two things make that go wrong in an ordinary round:

1. **Cargo says aloud when a crate is lost, naming it.** `write_off_lost_crates` has the technician say "Crate 12 for Hop Kins is lost: it has been destroyed. I will send word." as part of its work, from wherever it stands, the moment the crate is found lost (it runs inside `held_state`, on every state update). The line names no listener, so for everyone in earshot `said_to` is `nobody` or `me`, which passes. A janitor at the counter who asked for crate 13 a few seconds before hears it, drops its errand for 13, and tells its head 13 is lost.
2. **The "not holding a crate by that number" answer to one collector is taken by the other.** A head with a two-crate order sends two janitors at once (`sendFor` for each number in the one message), and they come to the counter together. The answer to one is "Sorry, Mo, I am not holding a crate by that number." It is meant to be ruled out for the other by `said_to === 'other'`. But `callsOn` in `addressing.ts` only knows a name by its first part of more than two letters: for "Mo Pper" that is "Pper", which the line does not contain. So for Jan the line is said to nobody, it passes, and Jan's good errand ends too. The simulator's own crew has a janitor called Mo Pper.

Either way the errand that ended was for a crate that is there. It sits in the bay; the head, which has no reader for "Cargo says there is no crate" (HEAD-02), sends nobody until cargo's reminder five minutes later, and then sends the next janitor in turn.

Concrete case, with a lost crate: the head's order comes in as crates #12 and #13. Jan is sent for #12, Mo for #13, and both come to the counter. Cora goes to bring #12 out and cannot get to it, twice (it stands boxed in by other crates on the bay's squares; `crew_npc_fail_errand` counts `entry.unreachable`, and at `CREW_NPC_LOST_AFTER` = 2 `crew_npc_crate_lost` says "nobody can get to it"). Meanwhile Mo has asked: "Cora, I am here to collect crate 13 for Hop Kins, please." (`task.askedAt` set). On her next state update Cora says "Crate 12 for Hop Kins is lost: nobody can get to it. I will send word." Jan's errand ends, rightly. So does Mo's: a cargo line with "is lost" in it, not said to anyone else. Mo tells its head #13 is lost or the number is wrong and walks off. Cora still has Mo's asking for #13 and brings that crate out to a lobby nobody is waiting in.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:224`:

    const NO_SUCH_CRATE = /not holding a crate|(has|have) been lost|is lost\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:236`, in `pickupsOverhear`, the only tests:

    if (
      !isCargo(theirJob) ||
      event.details.said_to === 'other' ||
      !NO_SUCH_CRATE.test(heard)
    ) {
      return;
    }
    for (const task of brain.tasks) {
      // Only one it has asked for, and not long since: the answer is to that asking.
      if (
        task.kind !== COLLECT ||
        task.state === 'done' ||
        task.unpacked ||
        task.askedAt === undefined ||
        brain.now - task.askedAt > BROUGHT_OUT_WAIT_DS
      ) {
        continue;
      }
      task.reported = true;
      finishTask(brain, task);

`code/modules/llm_crew/crew_npc_held.dm:102`, in `write_off_lost_crates`, the line said aloud:

    speak_plainly("Crate [entry.number][entry.for_name ? " for [entry.for_name]" : ""] is lost: [entry.lost]. I will send word.")

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:66`, in `callsOn`, how a name is known in a line:

    const first = name.split(/[^A-Za-z]+/).find((part) => part.length > 2);

## How it was found

Read from the code on both sides: the window's reader, the server's spoken write-off, and the addressing rule. Not seen in a round. The second case needs a technician to answer a collector with a short first name while another collector stands by; the first needs a crate lost while another is being asked for, which is rarer.

## How to fix it

1. In `pickupsOverhear`, read the crate number out of the line with `crateNumberIn(heard)`.
2. If the line names a number, act only on the collect task whose `item` is that number. The write-off line ("Crate 12 ... is lost") then ends only the errand for 12, which is right.
3. If the line names no number (the technician's "Sorry, Jan, I am not holding a crate by that number."), act on it only if it was said to this body: `said_to === 'me'`. Do not take `nobody` or `group` as an answer to this body's asking.
4. The same short-name gap in `callsOn` affects every reader that relies on `said_to === 'other'`. It is outside this finding's fix, but worth noting to whoever owns `addressing.ts`: a first name of two letters is still a name when it opens the line or is set off by commas.

## How to test the fix

- Type check from `tgui/`.
- A small table of cases beside `tools/llm_crew/`: a collector with tasks for 12 and 13, fed "Crate 12 for Hop Kins is lost: it has been emptied. I will send word." (only 12 ends) and "Sorry, Mo, I am not holding a crate by that number." heard by Jan (nothing ends).
- Simulator: a `waiting` variant with two janitors sent at once for two crates, one of which is emptied in the bay before they arrive. Pass if the janitor sent for the good crate still collects it.
