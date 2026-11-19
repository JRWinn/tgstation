---
id: SEC-03
title: An arrest or a jailing that is called off keeps running, so an officer that breaks off hurt goes on fighting
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: e8578cc6b40
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:865, code/modules/llm_crew/crew_npc_security.dm:936, code/modules/llm_crew/crew_npc_security.dm:1145, code/modules/llm_crew/crew_npc_hands.dm:392, code/modules/llm_crew/crew_npc_hands.dm:171
fix: Have make_arrest, baton_hits, close_with, put_cuffs_on, walk_steps, put_in_cell, set_free and the kit procs stop after any sleep once errand_serial is no longer the one they began with
---

## What is wrong

See also: ARR-09 (the same break-off, on the window side: told to try again, it breaks off again at once).

An errand's work is one long proc that sleeps: `make_arrest` can run for 15 seconds of chase, 7 more for the cuffs and a few more for the hold; `put_in_cell` for as long as the walk in, the cuffs and the walk out take. The proc is started by the tree leaf `crew_npc_do_errand` and nothing can stop it. When the errand is called off (`cancel_errand()`, or a new `start_errand()`), all that happens is that `errand_serial` goes up, so that the finished proc's answer is thrown away. The proc itself goes on to the end, clicking, stepping the body and laying hands on people, while the body has been given something else to do.

For most errands that is a second or two of nothing. For security it is the fight itself.

The case the design names, "hurt, under half its health, it breaks off":

1. The officer is in `make_arrest` with `how = force` on Pun Pun, inside `baton_hits`. The monkey bites it under half health.
2. In the window, `syncBeat` sets `beat.hurt`. `serveStep` for that warrant is now not ready ("You are hurt, and use no force"). The `get_away` task is an emergency with a ready step, `go_to` the post. `orderToDrop` (driver.ts) finds it, it is not the task the last act belongs to, so the driver sends `go_to` although the body is busy.
3. Server: `tool_go_to` ends in `start_walk`, which calls `cancel_errand()`. `errand_serial` goes up and the errand key is cleared. The tree leaves the errand branch and starts the walk.
4. `baton_hits` is still in its `while` loop. It checks only that things exist, that the baton is held and that fewer than 8 swings and 15 seconds have gone. It calls `close_with`, which steps the body back toward the monkey with a bare `Move` every 0.2 seconds, against the walk that is taking it to its post. It swings. Then `put_cuffs_on` follows the monkey for up to 12 steps more, twice.
5. If that ends with the cuffs on, `hold_arrested` sets `arrested` and takes the monkey by the arm. None of this is told to the brain: `perform_async` sees `errand_serial != serial` and drops the outcome. `work_arrests` has gone up, `game.log` says "arrested", and the brain thinks it ran away.

So the officer that "broke off" stays in the fight, pulled two ways at once, for up to 20 seconds more. (If the cuffs do go on, the next state the window gets has `security.holding` set, so the brain is not wholly lost, but no "cuffed" outcome is pushed and the officer is now pulling a prisoner along the walk to its post.)

Other ways the same thing happens, all read from the code:

- Two warrants out. The officer is at the baton with the newer one when the older one walks into view. Both `serve_warrant` tasks are emergencies, the older sorts first (`workInOrder` ends on `createdAt`), it is not the task in hand, so the driver sends `approach` for it. `tool_walk_to` cancels the errand; the first fight goes on.
- A crew member takes the officer by the arm to walk it out of a room (`taken_hold_of` in `crew_npc_guarding.dm` calls `cancel_errand()`). The officer is "in hand" and its tools are refused, and its `make_arrest` goes on batoning and cuffing from inside the hold.
- An officer that is itself arrested by the Head of Security (`being_arrested` calls `cancel_errand()`) goes on with the arrest it was making.
- `put_in_cell` called off between `body.stop_pulling()` and the timer: the ghost still walks out and starts the timer, or fights the new walk and leaves a prisoner standing in an open cell with nobody told.
- `set_free` and `take_cuffs_off` called off: the body goes on with the four seconds of taking cuffs off someone.

Shared state makes it worse: `baton_stopped`, `draw_stopped`, `jail_cell`, `jail_minutes`, `arrested` and `errand_item` belong to the controller, not to the run. A new `tool_jail` sets `jail_cell` and `jail_minutes` while an old `put_in_cell` is still reading them (`cell = jail_cell` is read once at the top, but `jail_minutes` is read again at the end for the log and for `put_in_custody`).

## Where

`code/modules/llm_crew/crew_npc_hands.dm:392`, the only place the serial is looked at, after the work is all done:

    /datum/bt_node/ai_behavior/crew_npc_do_errand/perform_async(datum/ai_controller/controller)
        var/datum/ai_controller/crew_npc/crew_controller = controller
        var/serial = crew_controller.errand_serial
        var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])
        if(async_still_valid())
            finish_async(AI_BEHAVIOR_SUCCEEDED)
        ...
        if(!QDELETED(crew_controller) && crew_controller.errand_serial == serial)
            crew_controller.finish_errand(outcome)

`code/modules/llm_crew/crew_npc_hands.dm:171`:

    /datum/ai_controller/crew_npc/proc/cancel_errand()
        clean_queue = list()
        errand_serial++
        errand_tool = null
        errand_item = null
        clear_blackboard_key(BB_CREW_NPC_ERRAND_TARGET)

`code/modules/llm_crew/crew_npc_security.dm:957`, the loop in `baton_hits`, which never asks whether it is still wanted:

    while(landed < most && swings < CREW_NPC_BATON_SWINGS && world.time - started < CREW_NPC_BATON_CHASE)
        if(QDELETED(src) || QDELETED(body) || QDELETED(person) || QDELETED(baton) || !body.is_holding(baton) || person.handcuffed)
            break

The same shape is in `close_with` (line 375), `put_cuffs_on` (line 1008), `walk_steps` (line 419), `draw_item` (line 311), `put_in_cell` (line 1145 on), `set_free` (line 1320 on), `take_cuffs_off` (line 1232 on) and `kit_from_locker` (line 603).

The driver's side, `tgui/packages/tgui/interfaces/CrewBrain/driver.ts:726`:

    const busy = brain.walking || !!brain.doing || !!brain.lastAct;
    const dropFor = busy ? orderToDrop(brain) : null;

and `jobs/arrests.ts:481`, the task it drops the arrest for:

    const away =
      !!security &&
      beat.struckAt !== undefined &&
      brain.now - beat.struckAt < AWAY_DS &&
      (!security.has_baton || beat.hurt) &&
      !security.holding &&
      !sayingHurt;
    keep(brain, AWAY, away, 'emergency');

## How it was found

Read from the code, server and window. Not seen in a round. The round where an officer was beaten down after breaking off is `round-20.43.32` (change log entry of 20:53), not round-19.33.50; there the baton go had already ended ("hit Pun Pun with its baton 0 times ... could not get its baton into a free hand", 20:52:00) six seconds before it broke off, so that round does not show this fault either way.

## How to fix it

1. In `crew_npc_hands.dm` add a helper:

       /// TRUE if the errand this run belongs to has been called off, or the body is gone. A null serial is a run that is not an errand.
       /datum/ai_controller/crew_npc/proc/errand_over(serial)
           return QDELETED(src) || QDELETED(pawn) || (!isnull(serial) && errand_serial != serial)

   The same test already exists for one errand: `still_forcing(door, serial)` in `crew_npc_forcing.dm:244`, and `crew_npc_grip.dm:259` checks `errand_serial != serial` in its loop. Follow that shape.

2. In `make_arrest`, `put_in_cell`, `set_free` and `take_kit`, read `var/serial = errand_serial` on the first line (it is the same value `perform_async` read a moment before, with no sleep between).
3. Pass `serial` down to `baton_hits`, `close_with`, `put_cuffs_on`, `walk_steps`, `draw_item`, `take_cuffs_off`, `kit_from_locker`, `wear_kit_belt`, `kit_from_belt` (a last argument that defaults to null, and `errand_over` treats null as "not on an errand" for `tool_jail`'s callers that are not errands, if any are added).
4. In each, wherever the code now says `if(QDELETED(src) || QDELETED(body) ...)` after a `sleep`, a `click_as_body`, a `walk_steps` or a `close_with`, add `|| errand_over(serial)` and leave by the same way out. Check at the top of each loop turn as well.
5. What the body does on the way out when it has been called off: nothing more with its hands on anyone. Do not call `hold_arrested`. It may still switch its baton off (`put_baton_away` is two clicks and steps nowhere), but only if the body is not already walking: simplest is to skip it and let the next `get_kit` or arrest find the baton in its hand, which `draw_item` handles.
6. `put_in_cell` called off after `body.stop_pulling()`: leave `arrested` set, so that the next `tool_jail` can take hold again (it already does: "Let go of for a moment, and still standing there in cuffs").
7. Keep the last lines of `perform_async` as they are: the outcome of a run that was called off is still not reported.

Do not try to fix this from the window alone by never dropping an arrest: breaking off hurt has to be able to stop the fight, and that needs the server loop to stop.

The same helper is worth using in the other long errands (hauling, forcing a door, cleaning), but those are outside this finding.

## How to test the fix

- Server compile on a side copy.
- Have `make_arrest` and `put_in_cell` write one `game.log` line when they leave because `errand_over` tripped ("Crew NPC X broke off its arrest of Y: called off"), so the round shows the fix working and not only the absence of a fault.
- The simulator does not run server code, so no scenario shows this. `tools/llm_crew/security.ts` can hold a window-side case: hurt in mid-arrest, the next step is `go_to` the post (it passes today; it guards the driver side).
- In a round, with a monkey that fights: after the "is hurt" PDA message, `game.log` must show no further "hit ... with its baton" line and no "arrested" line for that go, and the officer must be seen to walk off without turning back. Grep for "(force)" lines timed after the walk line "walking to".

## Check

Checked by Opus 5.5, from the code; nothing was run. Confirmed.

- `crew_npc_hands.dm:171` `cancel_errand()` only bumps `errand_serial` and clears keys; `perform_async` (`:392`) looks at the serial once, after `do_errand` returns. `do_errand` (`:185`) calls `make_arrest`, `take_kit`, `put_in_cell` and `set_free` directly. DM cannot stop a sleeping proc from outside, so the run goes on.
- `make_arrest`, `baton_hits`, `close_with`, `put_cuffs_on`, `walk_steps` and `draw_item` (`crew_npc_security.dm:302` to `1027`) check only `QDELETED` and what is held. None reads `errand_serial`. `click_as_body` (`crew_npc_machines.dm:259`) checks only reach and fitness, so swings and cuffing still land.
- The window side holds: `syncBeat` makes `get_away` an emergency with `go_to` once `sayingHurt` (5 seconds, `HURT_WORD_DS = 50`) is over; `serveStep` for a hurt `force` warrant is not ready (`arrests.ts:756`); `orderToDrop` (`driver.ts:631`) drops the arrest task for it because `lastAct.task` is the warrant's; `tool_go_to` ends in `start_walk` (`crew_npc_tools.dm:397`), which calls `cancel_errand()`. The other `cancel_errand()` callers named (`taken_hold_of`, `crew_npc_guarding.dm:211`; `being_arrested`, `crew_npc_security.dm:1398`) are as described.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions a called-off errand that keeps running. The 20:53 entry's "a hurt officer still walks away ... does not defend itself" is a different matter (KNA-08).
- Mended: the round named was wrong (the beating after breaking off was round-20.43.32, and the baton go there had already ended); the helper now treats a null serial as "not an errand", as step 3 says; the existing `still_forcing` helper is named; a log line for the test is added. Severity high and effort medium stand: the "breaks off hurt" rule fails in the fight it is for, and the change is about ten procs in one file.
