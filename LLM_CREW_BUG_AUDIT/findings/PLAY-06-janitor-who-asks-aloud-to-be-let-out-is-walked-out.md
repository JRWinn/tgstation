---
id: PLAY-06
title: A let-out door that fails strikes out the ask, so a janitor who asked aloud to be let out is taken by the arm and walked out instead
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2164, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:554, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:305, code/modules/llm_crew/crew_npc_hands.dm:450
fix: When open_door could not get to the door for someone asking out who is still inside, keep their ask and try once more after ten seconds, and after a second failure, or at once for a dead door, tell them why and then walk them out
---

## What is wrong

A janitor shut in a cargo room asks a technician aloud to be let out. The technician sets off to open the door. The errand fails, and the round log does not say why. The window then strikes out the janitor's ask as if the door had been opened. With the ask gone, the guard that KNA-01 put in (`askingOut`) no longer sees the janitor as on the way out. The janitor's welcome ran out a minute before, so the guarding duty marks them "seen out" and the technician takes them by the arm and walks them out to the lobby. The janitor asked for the maintenance door and is pulled out of the other door, by the arm, with nothing said about the door.

Spoken asks are covered by the KNA-01 guard. `overhears` puts a spoken ask on `brain.doorAsks` through `putAsk`, the same list `askingOut` reads. The gap is not how the ask is taken. It is that a failed `open_door` removes it.

The case, from `data/logs/2026/11/19/round-15.44.36`:

1. 21:58:10, Kailyn Patterson (cargo technician, she has "the rooms" this shift) lets the janitor Hayden Griffiths into the Cargo Bay by the Quartermaster Maintenance door. At 21:58:41 Hayden says "there is nothing left to clean here; it's done." From then on his welcome is over (`welcomeStands` is false) and the 60-second grace (`WELCOME_GRACE_DS = 600`) runs.
2. 21:58:57, Hayden tries the door himself and is stopped at (77,150) by the parked MULEbot (PLAY-04).
3. 21:59:02, Hayden says to Kailyn "Kailyn, could you let me out to the Fore Port Maintenance, please?" It goes on her `doorAsks` with `out: true`.
4. 21:59:09, Kailyn's brain plans the door: "Hayden Griffiths is inside the Cargo Bay and cannot get out by themselves ... You are going to open the door for them." The act is `open_door("p6", "Hayden Griffiths", "Cargo Bay")`.
5. No door is opened. `game.log` has no "opened ... to let Hayden Griffiths out of" line, and no "walk failed" line for Kailyn. Her own next prompt does show the result: "[15:59:13] You could not get to it." (the prompt's clock runs 6 hours behind, so 21:59:13). By 21:59:20 she is on to Tyson's order. In her 21:59:23 prompt the door line "You are opening the door for them now" is gone: `doorWanted` is null, so Hayden's ask is gone.
6. 21:59:38, Kailyn's step is "Hayden Griffiths was sent for, and what they were sent for is done with ... tell them you are seeing them out." At 21:59:45.9 it is "You are taking them by the arm and seeing them out", `throw_out("p6")`.
7. 21:59:46, "took hold of Hayden Griffiths to walk them out of Cargo Bay"; 21:59:50, "walked Hayden Griffiths out of Cargo Bay". He comes out in the Cargo Lobby and says "Kailyn, stop fiddling with my arm and let me go to Fore Port Maintenance".

Hayden did get out, and went on to his next mess. So the work got done. But he was handled as a trespasser being put out, not let out as he asked, through another door than the one he asked for, and with no word about why the door did not open. (Corrected by the checker: a line was planned before the walk-out, "thank Hayden Griffiths, and tell them you are seeing them out", and at 21:59:41 the model turned it into a remark to Tyson. Even said as planned, it gives no word about the door.)

Hayden asked again at 21:59:36, but of Tyson by name ("Tyson, could you let me out..."). For Kailyn that line is `said_to: 'other'`, so `overhears` does not take it (`cargo.ts:2519`), and her list stays empty. KNA-01's fix kept the drop on failure on the grounds that "the asker asks again". Here the asker did ask again, and it did not reach the technician who holds the rooms.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2164`, in `afterActing`. The ask is struck out whether the door opened or not (`ok` is not looked at):

    // The door has been opened for them, or could not be. Either way that request is dealt with.
    if (task?.kind === DOOR) {
      if (task.item) {
        dropAsk(brain, task.item);
      }
      if (brain.knockAt?.room === task.place) {
        brain.knockAt = null;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:305`, `askingOut`, which only knows an ask that is still on the list:

    function askingOut(brain: NpcBrain, name: string): boolean {
      const asks = brain.doorAsks ?? (brain.doorAsked ? [brain.doorAsked] : []);
      return asks.some(
        (ask) =>
          ask.name === name && !!ask.out && brain.now - ask.at < ASKED_OUT_DS,
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:554`, in `syncGuarding`. With the ask gone and the grace run out, the janitor is to be put out:

    stranger.overAt ??= brain.now;
    const leaving = askingOut(brain, name);
    if (!leaving && brain.now - stranger.overAt > WELCOME_GRACE_DS) {
      stranger.seenOut = true;
      settle(brain, name, stranger, 'go');
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2525`, in `overhears`. This is where the spoken ask was taken, so spoken asks do reach `askingOut`:

    putAsk(brain, {
      name: speaker,
      at: brain.now,
      ...
      room: askedRoom,
      out: LET_OUT_WORDS.test(heard),

`code/modules/llm_crew/crew_npc_hands.dm:450`, at the end of `crew_npc_fail_errand` (which starts at line 426), one of the two ways the errand gives these words. It reports a failure and logs nothing for a door. The other is `do_errand` at `crew_npc_hands.dm:206`, when the body is beside the door but `can_reach_target_now` is false:

    	crew_controller.finish_errand(list(FALSE, "You could not get to it."))
    	return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED

The other failures in `tool_open_door` and `hold_door_for` (`crew_npc_doors.dm`) also go to the brain only, with no `game.log` line. Only a door that opens is logged.

## How it was found

Seen in a played round, `data/logs/2026/11/19/round-15.44.36`. In `game.log`:

    [2026-11-19 21:59:02.714] GAME-SAY: *no key*/(Hayden Griffiths) (mob_3022) "Kailyn, could you let me out to the Fore Port Maintenance, please? I cannot get out of here by myself." (Cargo Bay (77,150,2))
    [2026-11-19 21:59:46.821] GAME: Crew NPC *no key*/(Kailyn Patterson) (owner: zimfire) took hold of *no key*/(Hayden Griffiths) to walk them out of Cargo Bay.
    [2026-11-19 21:59:50.078] GAME: Crew NPC *no key*/(Kailyn Patterson) (owner: zimfire) walked *no key*/(Hayden Griffiths) out of Cargo Bay.

In `crew_brain.log`, Kailyn (npc4):

    [2026-11-19 21:59:09.485] ... "ROUTINE (no LLM) in Cargo Bay, holding nothing: Hayden Griffiths is inside the Cargo Bay and cannot get out by themselves: the door is locked to them. You are going to open the door for them." reply: open_door("p6", "Hayden Griffiths", "Cargo Bay")
    [2026-11-19 21:59:38.978] ... "Hayden Griffiths was sent for, and what they were sent for is done with. They are still in the Cargo Bay, which is locked to them. In "say", thank Hayden Griffiths, and tell them you are seeing them out."
    [2026-11-19 21:59:45.900] ... "Hayden Griffiths has nothing left to do in the Cargo Bay. You are taking them by the arm and seeing them out." reply: throw_out("p6")

Then the code was read. The ask can leave `doorAsks` only three ways: `dropAsk` (called only from the DOOR branch of `afterActing`), a newer ask by the same person in `putAsk`, or running out (`LET_OUT_ASK_DS = 3000`, five minutes). Hayden said nothing to Kailyn between 21:59:02 and 21:59:23, and five minutes had not passed. Kailyn holds the rooms, so `doorIsMine` is true, and Hayden was in view in the post, so `mayPass` would still give the let-out. So the ask was struck by `afterActing` on an `open_door` result. That result was a failure, since no door was logged as opened and nothing was noted as let out.

What was not seen: why the errand failed. (Corrected by the checker: the words of the result were seen. Kailyn's 21:59:23 prompt, `crew_brain.log` line 538, lists "[15:59:13] You could not get to it." among her recent events.) Errand failures are not written to `game.log`. The MULEbot parked at (77,151) (PLAY-04) is the likely cause, but it is a guess. `open_door` was given no door, so `room_door_for` picked one by its scoring, and which door it picked is not logged. Nothing was run.

The same unlogged failure came 33 seconds earlier for Netta Rader: `open_door("p4", "Netta Rader", "Bitrunning Den", ...)` at 21:58:36, then "[15:58:40] You could not get to it." in the same prompt. So a door errand that fails with nothing in `game.log` is not rare in this round.

## How to fix it

1. In `afterActing` in `jobs/cargo.ts`, in the `task?.kind === DOOR` branch, do not call `dropAsk` when `!ok`, the ask is `out`, and the person is still seen inside one of the department's rooms (`seenInside`). Keep the ask and set `ask.after = brain.now + DOOR_RETRY_DS` (a new constant, about 100, ten seconds), and count the try on the ask (`ask.failedTries`, new field on `DoorAsk` in `types.ts`). `doorSought` already skips an ask whose `after` has not come.
2. On a second failure, drop the ask as now, and queue a line to the person by name through `brain.toTell`: "Hayden, that door will not open for me. I will walk you out through the lobby." Then leave the guarding duty to walk them out, which is a fair way out of a locked room. The ask being gone lets `askingOut` turn false and the seen-out goes ahead, now with a reason given.
3. Keep the success path as it is. Keep the knock (`knockAt`) cleared as now.
4. Do not hold the eviction for good: a dead door (DOOR-14) must not leave a janitor shut in. Two tries, then the walk out, keeps that. It also keeps the reason KNA-01 (step 9) gave for dropping on failure, that an open which fails must not be tried for ever.
5. (Added by the checker.) Retry only a failure to get to the door ("You could not get to it."). A door that "will not open" is dead, and walking to it again ten seconds later is wasted: go straight to step 2. Once DOOR-14 is built and the result carries a reason (`no_power`, `bolted`, `welded`), test that instead of the words. Build this together with DOOR-14 step 3, which changes the same branch.
6. (Added by the checker.) Add a `game.log` line for a failed door errand in `crew_npc_fail_errand` when `errand_tool == CREW_TOOL_DOOR`: who, for whom, which door, and the words. Without it the next round shows only the walk-out, as this one did. This is the server half, and the reason effort is medium, not small: `types.ts` gains a field, `cargo.ts` gains the retry and the told line, and a DM file gains the log line.

In this round the parked MULEbot did not move, so the retry would have failed too. The fix would then have given one more walk, a line from Kailyn to Hayden saying the door would not open, and the same walk-out. That is the point: he is told why.

The other way would be to make `askingOut` also look at a list of recent failed let-outs. I would not: it leaves the technician not retrying the door at all, and the janitor is still walked out with no word.

## How to test the fix

- Add a case in `tools/llm_crew/` (the cargo door scenarios): a janitor inside the post, its welcome over, asks aloud to be let out; the first `open_door` returns `ok: false` with "You could not get to it." Check that the ask is still on `doorAsks`, that `askingOut` is true, that no STRANGER task with `verdict: 'go'` is made, and that `open_door` is planned again after the wait. Then fail it a second time and check that the line is queued and the seen-out follows.
- Run the type check on the window code.
- In the next round's `game.log`, look for "took hold of <janitor> to walk them out of" within a minute after the janitor asked to be let out. It should now come only after a told line ("that door will not open for me"). In `crew_brain.log`, after a failed let-out, the next DOOR step for the same person should appear about ten seconds later.

## See also

- DOOR-14: the same `afterActing` branch, seen from the other side. There a failed door leaves a janitor shut in and told nothing. Here the same drop sets off the walk-out.
- KNA-01: `askingOut` was made to look at every ask. That guard is sound; it is the ask being struck that undoes it.
- PLAY-04: the parked MULEbot that most likely made the errand fail.

## Check

Checked by Opus 5.5 against the round logs and the code at 99f4d33dd0e. Nothing was run. Confirmed.

- The quotes are what the code says. `afterActing` in `jobs/cargo.ts` (line 2164) calls `dropAsk` for a `DOOR` task whatever `ok` is. `askingOut` (`jobs/guarding.ts:305`) reads only `brain.doorAsks`. The seen-out in `syncGuarding` (`jobs/guarding.ts:554`) waits on `askingOut` and `WELCOME_GRACE_DS = 600` (line 71). The spoken ask is taken by `overhears` (`cargo.ts:2525`) with `out` from `LET_OUT_WORDS`.
- I looked for another way the ask could have gone. `putAsk` only replaces an ask by the same person, and Hayden's next ask, at 21:59:36, was said to Tyson by name, which `overhears` skips for Kailyn (`said_to !== 'other'`, `cargo.ts:2519`). It had not run out (`LET_OUT_ASK_DS = 3000`). So the drop came from `afterActing`.
- The result that set off the drop is in the log, not a guess. Kailyn's prompt at 21:59:23 (`crew_brain.log` line 538) lists "[15:59:13] You could not get to it.", four seconds after the `open_door` plan at 21:59:09 (line 529). I mended "What was not seen" to say so, and raised confidence to sure.
- The times fit. Hayden finished the Cargo Bay mess at 21:58:40, so the grace ran from about then. The seen-out step came at 21:59:38, about sixty seconds on, while his ask was already gone.
- Not seen: which door `room_door_for` picked (`open_door` named none), and why Kailyn could not get to it. The MULEbot (PLAY-04) stays the likely cause.
- Not a duplicate. DOOR-14 names the same "Either way that request is dealt with" drop, but its fault is the four refusals in `hold_door_for` and a janitor left shut in. This one is a failure to get to the door, and the drop sets off the walk-out by the arm. KNA-01 step 9 chose to keep the drop on failure "and the asker asks again"; this round shows the asker asking someone else. Both are named in the write-up.
- Mended two claims. A seen-out line was planned before the walk-out (the model turned it into a remark to Tyson), so it is not true that nothing was planned. It is still true that nothing was said about the door.
- The fix is sound and keeps the rules: the code retries and speaks, a bounded number of times, and a dead model does not stall it. I added two steps. Do not retry a door that will not open (DOOR-14's case), only one that could not be reached. And log a failed door errand to `game.log`, or the next round will look like this one. Effort raised to medium, since it touches `cargo.ts`, `types.ts` and one DM file.
- Severity stays medium. The janitor still gets out and the work goes on, but a player would see a janitor who asked to be let out being taken by the arm.

## Fix so far

Group p-server, commit fe96a537708 (compile only): step 6 is done in `finish_errand` (`crew_npc_hands.dm`), which logs a failed `open_door` errand to `game.log` ("did not open <door> at <where> for <person>: <words> It stands at <where>."). It covers every errand failure of the tool (`crew_npc_fail_errand`, `do_errand`, `hold_door_for`), not the refusals `tool_open_door` gives before any errand starts. Left: steps 1 to 5, all in the window.
