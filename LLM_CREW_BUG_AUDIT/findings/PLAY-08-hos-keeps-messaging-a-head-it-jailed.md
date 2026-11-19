---
id: PLAY-08
title: The Head of Security sends the security notice to a head it has just jailed, twice, then tells the Captain it did not reach them
kind: bug
severity: low
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:912, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:798, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:953, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:795, code/modules/llm_crew/crew_npc_tools.dm:20
fix: In headsToTell also leave out any head named in desk.held, so a jailed head is sent the notice afresh only once its cell time is up
---

## What is wrong

A head of department who is in a brig cell cannot answer a PDA message. Its brain takes no step while the server says it is held, and the server refuses every tool but `say` while it is held. The Head of Security does not know this. It leaves a head off the notice list only while there is a warrant on that head. Once the head is jailed, the warrant is struck off and the list's serial goes up. So the jailed head is at once owed the new notice. It is sent, no "Security notice received." comes back, it is sent again, and then the Captain is told "the security notice did not reach" that head. That is false: it did reach them. They could not answer from a cell.

What it should do: leave a head in a cell off the notice list until its cell time is up, and send it the notice then.

The case from round-15.44.36:

1. The Captain declared a warrant on Sunshine Langston, the Head of Personnel. While it stood, she was rightly left off the notice (`headsToTell` skips a head there is a warrant on).
2. At 22:07:16 Casey Cooper put her in Cell 2 for 5 minutes. Casey's word "Sunshine Langston is in Cell 2" reached the Head of Security Archie Sandford at 22:07:34.
3. `deskOutcome`, case `jailed`, put her in `desk.held`, struck her warrant off `desk.warrants` and added 1 to `desk.serial`.
4. `headsToTell` now counted her as a head to tell, since no warrant names her. `noticeOwed` saw her old notice state was for an older serial, so the new line was owed.
5. 22:07:36 and 22:08:38: Archie sent her the notice. She took no step at all from 22:07:37 to 22:12:20 in `crew_brain.log`, so no answer went.
6. 22:09:39: after the second try, `noticeOwed` set `failed` and told the Captain "Captain, the security notice did not reach Sunshine Langston."
7. Her `noticed` state is now marked failed for that serial. When she came out at 22:12:20 she was not sent the notice again until the list changes.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:912`, in `headsToTell`. Only a warrant keeps a head off the list. `desk.held` is not looked at:

    function headsToTell(brain: NpcBrain): string[] {
      const desk = deskOf(brain);
      return brain.pdaPeople
        .filter(
          (person) =>
            isHead(person.job) &&
            !/captain/i.test(person.job) &&
            !isSecurity(person.job) &&
            person.name !== brain.name &&
            !desk.warrants.some((warrant) => sameName(warrant.name, person.name)),
        )
        .map((person) => person.name);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:798`, in `deskOutcome`. Jailing a head takes the warrant away, which is the one thing that kept it off the list, and changes the serial, which makes a new notice owed:

    case 'jailed': {
      const minutes = outcome.minutes ?? MINUTES_USUAL;
      desk.held[outcome.name] = {
        cell: outcome.cell ?? 'a cell',
        until: brain.now + minutes * 600,
      };
      desk.arrests += 1;
      if (warrant) {
        desk.warrants = desk.warrants.filter((it) => it !== warrant);
        desk.serial += 1;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:953`, in `noticeOwed`. Two tries with no answer, then the Captain is told:

    // No word back. It is sent once more, and after that the Captain is told who it did not reach.
    if (state.tries < NOTICE_TRIES) {
      return lines[0];
    }
    if (!state.failed) {
      state.failed = true;
      tellCaptain(
        brain,
        `Captain, the security notice did not reach ${head}.`,

Why the jailed head cannot answer. `code/modules/llm_crew/crew_npc_security.dm:1649`, in `custody_tick`, a body in a cell stays held as long as the cell timer runs, and `hold_in_custody` pushes `in_hand_until` 3 seconds ahead every second:

    if(CREW_CUSTODY_CELL)
        var/obj/machinery/status_display/door_timer/timer = custody_timer?.resolve()
        held = !QDELETED(timer) && timer.timing

    /datum/ai_controller/crew_npc/proc/hold_in_custody()
        in_hand_until = world.time + CREW_NPC_CUSTODY_HOLD

`code/modules/llm_crew/crew_brain_link.dm:212` sends that to the window as `"in_hand" = world.time < npc.in_hand_until`. `tgui/packages/tgui/interfaces/CrewBrain/driver.ts:795` then takes no step at all:

    // Someone has it by the arm. It goes where it is taken.
    brain.inHand ||

And `code/modules/llm_crew/crew_npc_tools.dm:20` would refuse the `message` tool even if one were sent:

    if(world.time < in_hand_until && tool != CREW_TOOL_SAY && tool != CREW_TOOL_HOLD)

So the "Security notice received." that `readWanted` (`jobs/wanted.ts:174`) queues for her cannot go until she is out. By then it is gone: `driver.ts:452` drops any line in `toTell` older than `TELL_KEPT_MS` (`driver.ts:98`, 120000, two minutes), and she was in the cell for five:

    brain.toTell = brain.toTell.filter(
      (tell) => Date.now() - tell.at < (tell.keepMs ?? TELL_KEPT_MS),
    );

## How it was found

Seen in a round log, then read in the code. Folder `data/logs/2026/11/19/round-15.44.36`.

`game.log`:

    [2026-11-19 22:07:16.379] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) put *no key*/(Sunshine Langston) in Cell 2 for 5 minutes.
    [2026-11-19 22:07:34.439] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Zim Fire: Captain, Sunshine Langston is in Cell 2 for 5 minutes.
    [2026-11-19 22:07:36.931] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Sunshine Langston: Security notice. Wanted: Pun Pun. If you or your staff see them, send me where, at once.
    [2026-11-19 22:08:24.801] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Zim Fire: Security staff meeting: 1 of 1 there. Since the last one: 4 arrests made. Still wanted: Pun Pun. In the cells: Sunshine Langston in Cell 2.
    [2026-11-19 22:08:38.096] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Sunshine Langston: Security notice. Wanted: Pun Pun. If you or your staff see them, send me where, at once.
    [2026-11-19 22:09:39.332] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Zim Fire: Captain, the security notice did not reach Sunshine Langston.
    [2026-11-19 22:12:20.196] GAME: Crew NPC *no key*/(Sunshine Langston) (owner: zimfire) is free to go at Brig (99,162,2).

Archie's own meeting report at 22:08:24 names her in Cell 2, 14 seconds before he sends her the notice again. `pda.log` lines 115, 127 and 131 show the same three messages, and no answer from her. The other two heads answered at once (lines 117 and 119, "Security notice received."), and so did she, at 21:50:17, before she was wanted.

`crew_brain.log`: Sunshine's last step before the cell opened is line 857 at 22:07:36, an LLM turn whose `say` was about the cell timer. Her next is line 1022 at 22:12:20, "going back to your office". No step in between.

Then read `headsToTell`, `deskOutcome` and `noticeOwed` in `jobs/desk.ts`, the `inHand` check in `driver.ts`, `custody_tick` and `hold_in_custody` in `crew_npc_security.dm`, and the hold check in `handle_tool_call` in `crew_npc_tools.dm`.

Her queued "Security notice received." was not sent after she came out: it timed out of `toTell` after two minutes (settled by the second reviewer, see Check). Not checked for a jailed head held in cuffs without a cell; the same `in_hand_until` hold applies under arrest, but while a warrant stands that head is already skipped.

## How to fix it

1. In `headsToTell` in `jobs/desk.ts`, add one more filter: `!Object.keys(desk.held).some((it) => sameName(it, person.name))`. A head in a cell is then not on the list.
2. Nothing else is needed for the release. `desk.held[name]` is deleted in `syncDesk` when `brain.now > held.until`, on a `freed` outcome, and in `strike` (a pardon). Her `desk.noticed` state is for an older serial (or for none), so `noticeOwed` returns line 0 the next time round, and she is sent the list fresh once out. `state.serial !== desk.serial` is tested before `failed`, so an old `failed` does not stop it. If she was jailed with no warrant on this desk, the serial did not move. Then her state is what it was: acked means she has the list and needs nothing; sent and not yet answered means the one more try and the word to the Captain come after release, which is right. So do not delete `desk.noticed[name]` on release: it would only send an acked head the same list again.
3. Keep the warrant rule as it is. A wanted head is still sent nothing while the warrant stands.
4. `desk.held` uses the timer the officer reported, not the real cell timer. If the cell is opened early she stays off the list until `until` passes. That is a few minutes late at worst, which is better than the false word to the Captain. TRB-06 covers seeing someone out of their cell early.

## How to test the fix

- Type check the tgui package (`tsc` on `tgui/`).
- In `tools/llm_crew/security.ts`, add a case: a Head of Security desk with two heads on its PDA, a warrant on one, then a `jailed` outcome for that one. `headsToTell` must not name the jailed head. Move `brain.now` past `until` and run `syncDesk`; `headsToTell` names them again and `noticeOwed` gives the first notice line, with no `tellCaptain` call in between.
- Simulator: the security warrant scenario on a head (`tools/llm_crew/sim.ts`), checking no "did not reach" line while the head is in a cell.
- Next round, with a head jailed: `grep -n "did not reach" game.log` must be empty for that head while they are in a cell, and `pda.log` should show one "Security notice." to them within a few seconds after "is free to go", answered with "Security notice received."

## See also

SUP-16 (a cuffed body's PDA refused and called broken; the sender side of the same cannot-answer state). HOLE-13 (a player head who never says the set ack words gets the same "did not reach" message, rightly).

## Check

Confirmed. I tried to prove it wrong and could not.

What I read. In `jobs/desk.ts` at 99f4d33dd0e: `headsToTell` (912), `deskOutcome` case `jailed` (798) and case `freed` (881), `strike` (262), `noticeOwed` (936), `syncDesk` (984), and the code that writes `desk.noticed` when a "Security notice" is sent (about line 1194). The quotes in the write-up match the code. `headsToTell` looks only at `desk.warrants`, never at `desk.held`. Jailing on a warrant removes the warrant and adds 1 to `desk.serial`. That makes `noticeOwed` return line 0 for her at once. The send code then sets `tries: 1`; a minute with no answer gives the second send (`tries` 2); the next pass sets `failed` and tells the Captain. That is the two sends and the false word in the log, in that order.

Why she could not answer. `driver.ts:795` takes no step while `brain.inHand`. `crew_brain_link.dm:212` sets `in_hand` from `in_hand_until`, which `hold_in_custody` (`crew_npc_security.dm:1617`) keeps ahead while the cell timer runs (`custody_tick`, line 1649). `crew_npc_tools.dm:20` refuses `message` while held. I found no other path that sends a `toTell` line for a body that is held. Her answer, queued by `readWanted`, timed out: `TELL_KEPT_MS` is two minutes (`driver.ts:98`, filter at 452) and she was held about four and a half minutes after the first notice. That settles the finder's open question.

The round. In `round-15.44.36/game.log` I found every line the finding quotes, at the times given: Cell 2 at 22:07:16, notices at 22:07:36 and 22:08:38, "did not reach" at 22:09:39, free at 22:12:20. In `crew_brain.log` her lines are 857 (22:07:36) and then 1022 (22:12:20), with none between. She had answered the 21:50:17 notice within a tenth of a second, so the ack path works when she is free. After 22:12:20 nobody sent her the notice again, as the finding says.

Duplicates. I searched the findings for `headsToTell`, `noticeOwed`, "did not reach" and `inHand`. Only HOLE-13 names the "did not reach" path, and it says that path is right for a player head who never answers. SUP-16 is the sender's side of a PDA used while cuffed. HOLE-16 is about crew not knowing a player locked them up. None is this fault. The change log (line 657) describes the two tries and the word to the Captain as designed, and does not list this case.

The fix. One filter in `headsToTell` works. It keeps the rules: the code does the work, no model call, nothing new for a player head. It also covers a pardon, since `strike` and `freed` both delete the `held` entry. I struck the finder's extra step of deleting `desk.noticed[name]` on release. The serial check already makes her owed the list when it changed, and the delete would only re-send the list to a head that had already acked it. One small cost remains: `desk.held.until` is the term the officer reported, so a head let out early waits until that time for the notice. That is minor, and TRB-06 covers the early-release case.

Severity stays low. The work goes on. The cost is two wasted messages, one false word to the Captain, and a head who never gets the list again after her cell time. That last part only matters if the list changes after she is out. Jailing a head is rare. Effort stays small: one line. I changed one line number (`crew_npc_security.dm` 1647 to 1649). Not run: no tsc, simulator or table check, per this task's rules.
