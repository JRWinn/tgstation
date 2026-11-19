---
id: LOGB-02
title: A meeting called while a janitor hauls a collected crate makes its brain lose the haul, so it unpacks the crate, then tells its head the crate is lost
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:825, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:945, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:408, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:307
fix: Do not let a step that stays put (a PDA reply) take the place of brain.lastAct while a walk or haul is still waiting on its result, keep it aside and match results to either
---

## What is wrong

The driver keeps one step it is waiting to hear about, `brain.lastAct`. A janitor hauling a crate it has collected is busy, but an `emergency` task still breaks in (`orderToDrop`), and a call to a staff meeting is one. The first step of a meeting call is a PDA message back, "On my way to the X" (`planMeetings`), and that step is ready even while hauling: only the walk to the meeting waits for the crate to be set down. So the driver sends the PDA reply in the middle of the haul and writes it over `brain.lastAct`.

The message's own result comes back at once and clears `lastAct`. When the haul ends a few seconds later and the server reports `collect_crate` done, `noteResult` finds no `lastAct` and throws the result away. `pickupsAfterActing` never runs, so the task is never marked `unpacked`:

- the head is never sent "Crate #N is unpacked in the Custodial Closet";
- the empty crate is never taken back (`take_back` is only planned from an unpacked task);
- the task goes on as if the crate had never been collected. The crate is no longer held (the server dropped it from the held list when it was unpacked), so `planPickups` sends the janitor back to the counter to ask for it, again and again between other work. In the end a technician says "I am not holding a crate by that number", and the janitor tells its head "Cargo says there is no crate #N to collect: it has been lost, or the number is wrong. I have not got it." That is not true: it unpacked it.

The case, `data/logs/2026/11/18/round-17.48.05` (log times are 6 hours ahead of those in the brain's memory). Vincent Briner is a janitor, Corrine Raub his head.

- 00:01:31, `crew_brain.log`: "Cargo has put crate #7740 out for you. You are hauling it to the Custodial Closet ..." => `collect_crate(7740, "Custodial Closet")`.
- 00:01:50, `game.log`: the head calls a meeting by PDA; 0.07 s later Vincent "was told by its brain to PDA Corrine Raub: On my way to the Bar Lounge." His brain step: "R@Lesser Starboard Maintenance ... sending Corrine Raub a PDA message to say you are coming" => `message(...)`. He is still on the haul.
- 00:01:57, in his own memory: "[18:01:57] You haul the crate #7740 to Custodial Closet and unpack it there: bucket, mop, push broom, wet floor sign, trash bag, space cleaner, damp rag and cleaner grenade. The empty crate is yours to take back to cargo."
- No "Crate #7740 is unpacked" PDA follows, in `game.log` or `pda.log`. No take-back is ever logged.
- From 00:05:06 to 00:12:21 his brain gives "Corrine Raub has sent you to collect crate #7740 from cargo ... You are going to the counter in the Cargo Lobby to ask for it" twelve times, between cleaning jobs, from the Bar Lounge, Cargo Bay, Delivery Office, Mining Office, Bitrunning Den and Fore Port Maintenance.
- 00:05:36 and 00:12:35 he asks Monte at the counter for crate 7740. 00:12:38 Monte: "Sorry, Vincent, I am not holding a crate by that number." 00:12:38 PDA to the head: "Cargo says there is no crate #7740 to collect: it has been lost, or the number is wrong. I have not got it."

The same can happen to any step the driver is waiting on when an emergency step that stays put is sent over it: a technician's `release`, `unload` or `stow_crate` haul when its head's meeting call comes in, an engineer on a long walk.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:408`, the first step of a call, which is ready whatever the hands are doing:

    // First of all it sends word back, so that its head knows who to wait for.
    if (!summons.answered && brain.hasPda) {
      return {
        ready: true,
        step: `${by} has called a staff meeting in the ${room}. You are sending ${by} a PDA message to say you are coming.`,
        act: {
          tool: 'message',

and the guard just below it, which covers only the walk:

    if (brain.doing && HAULING.test(brain.doing)) {
      return {
        ready: false,

`meetings.ts:351`, the call is an emergency: `urgency: 'emergency'`.

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:726`, busy is broken into for it:

    const busy = brain.walking || !!brain.doing || !!brain.lastAct;
    const dropFor = busy ? orderToDrop(brain) : null;

`driver.ts:825`, whatever is sent replaces the step being waited on:

    brain.lastAct = {
      key: step.key,
      tool: serverTool,
      at: now,
      act: step.act,
      task: step.task,
    };

`driver.ts:944`, a result for any other tool, or with no `lastAct`, is dropped:

    const last = brain.lastAct;
    if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:307`, the only place a collected crate is marked unpacked:

    if (act.tool === 'collect_crate' && ok) {
      task.unpacked = true;

## How it was found

Seen in a round log (quoted above: `game.log`, `pda.log`, and the brain's memory lines inside `crew_brain.log`), then the cause read in the current code, which is unchanged in each of the places quoted. Not proved by a run. Not looked at: whether the same thing happened to a technician's haul in these rounds.

Related but different: ASYNC-02 and API-03 are a result taken for the wrong step when the LLM sends one; SUP-06 is a haul cut off by a new walk. Here no walk is sent and the model is not involved: the driver's own PDA reply hides the haul's result.

## How to fix it

1. In `drive` (`driver.ts`), when `busy` and the step being sent is one that stays put (`STAYS.has(step.act.tool)`, a `message` above all), send it without touching `brain.lastAct`. Keep it as `brain.sideAct` (same shape) so its failure can still be noted, and match results to `lastAct` first and then to `sideAct` by tool name in `noteResult`. Clear `sideAct` after `LOST_ACT_MS` like `lastAct`. Two things this must keep: (a) the side step's result has to go through the same hooks as now (`afterActing`, `meetingsAfterActing`, `pickupsAfterActing` and the rest in `noteResult`), because `summons.answered` is only set in `meetingsAfterActing` (`meetings.ts:685-690`); so move the body of `noteResult` into a helper that takes the matched step, and call it for whichever of the two matched. Clear only the one that matched: the `brain.lastAct = null` and the breath at the end of `noteResult` (`driver.ts:1035`) belong to the long step only. (b) While a `sideAct` is waiting, do not send another (`orderToDrop` will still find the meeting's reply ready until its result is in).
2. Or, smaller: in `planMeetings`, hold the "On my way" reply back while `brain.doing` matches `HAULING`, as the walk already is. The head counts on no word for 90 seconds (`WORD_BACK_DS`), which a haul fits in. This fixes only this case.
3. As a second line, in `planPickups`: a COLLECT task not marked unpacked, whose crate is no longer in `brain.heldCrates`, while `brain.crateToReturn` is TRUE and the brain's memory has "You haul the crate #N to ... and unpack it there", is unpacked. The server could send `collected_number` with `crate_to_return` so the window need not read the text.

I would take 1: it mends every case of a stay-put step sent over a long one, not only this one. Keep 2 as well, since replying mid-haul is no gain.

## How to test the fix

- A simulator scenario: a janitor sent for a crate, with the head calling a meeting while the haul is under way. Want "Crate #N is unpacked in the Custodial Closet" by PDA, a `take_back`, and no second "here to collect crate N".
- Type check, and the existing `qm` and `crew` scenarios.
- Next round, `game.log`: no "Cargo says there is no crate #N" after "You haul the crate #N to ..." for the same N.

## Check

Checked by Opus 5.5. Read in the window: `drive` (`driver.ts:657` on: `busy`, `orderToDrop`, the `brain.lastAct = {...}` at about line 826 that overwrites whatever was waiting), `orderToDrop` (`driver.ts:631`: an `emergency` task with a ready act breaks in unless `lastAct` is already that task's), `noteResult` (`driver.ts:943`: returns at once when `lastAct` is missing or its tool differs, and sets `lastAct = null` at the end), `planMeetings` (`meetings.ts:408`: the reply is `ready: true` whatever the hands do; only the `go_to` below waits on `HAULING`), the MEETING task's `urgency: 'emergency'`, and `pickupsAfterActing` (`pickups.ts:307`, the only setter of `task.unpacked`). On the server, the `message` tool answers at once with `action_result(CREW_TOOL_MESSAGE, TRUE, ...)` (`crew_npc_cargo.dm:738`), and the haul answers later with `action_result(CREW_TOOL_COLLECT, TRUE, "You haul the ... and unpack it there ...")` (`crew_npc_held.dm:423`). So: haul sent, `lastAct` = collect_crate; reply sent, `lastAct` = message; message result clears it; collect result finds no `lastAct` and is dropped. Even if the message result came later, the collect result would not match `lastAct.tool` and would be dropped the same way.

Round log checked: `round-17.48.05/game.log` lines 775-776 (the call at 00:01:50.148 and "On my way" 0.07 s later), the brain's memory at 18:01:57 "You haul the crate #7740 to Custodial Closet and unpack it there", the same prompt still listing "collect crate #7740 ... waiting its turn", and `pda.log` line 131 (the false "Cargo says there is no crate #7740"). No later change-log entry (19:38, 20:19, 20:53) touches `lastAct`, `noteResult` or the meeting reply.

Changed: severity to medium. It needs a meeting call (or another emergency stay-put step) to land inside a haul, which is timing, not most rounds; the supplies are unpacked and only the report, the take-back and the walks are wrong, which FORMAT.md puts at medium. Added to fix step 1 the two things it must keep, since a plain `sideAct` that skips the hooks would send "On my way" again and again. Not run.
