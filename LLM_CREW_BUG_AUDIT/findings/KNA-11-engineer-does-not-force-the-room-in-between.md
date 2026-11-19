---
id: KNA-11
title: An engineer sent to a door behind another locked room says so and stops, when it could force the outer door first
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:362, code/modules/llm_crew/crew_npc_forcing.dm:225
fix: When the server says the way is through another locked room, force that room's door first and then go on to the door that was asked for
---

## What is wrong

Listed as not built in the change log entry of 2026-11-18, 20:19 to 20:40: "An engineer does not force its way through a room in between. Sent to a door behind a locked hallway it says so and stops. Forcing the hallway's door first is not built."

The server already tells the window which room is in the way (`through`). The window uses it only to word the failure: "I could not open the door of the Bar Backroom: the way to it is through the Service Hallway, which is locked to engineering as well." The job is then dropped and the Captain is told engineering could not do it. Everything needed to carry on is in hand: the engineer has the tools, knows the wires, and `force_door` takes any room name.

The case, from `data/logs/2026/11/19/round-20.00.21` (`game.log` 02:07:53 by log time): the engineer is sent to the Bar Backroom. "It found no way to: Bar at (130,123) and Bar Storage at (133,120)". One door opens from inside the Bar, the other from the Service Hallway, whose doors take a service ID. It stops there. Forcing "Service Hall at (129,118)" would have given it the Bar Storage door.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:225`, `tool_force_door`: the room in between is found and sent.

    // Why there is no way to it, if that is a room in between that is locked to it as well.
    var/area/outer = get_area(spot)
    if(isnull(through) && outer != get_area(body) && (locked_out_of(outer) || hallway_locked_to(outer)))
    	through = format_text(outer.name)
    ...
    forcing_failure("no_way", through ? "You cannot get to a door of [room_name]: the way to it is through [through], which is locked to you as well." : ..., more_details = through ? list("through" = through) : null, tell_now = TRUE)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:376`, `forcingAfterActing`: `through` is only words.

    const reason = String(details.reason ?? '');
    ...
    if (!ok) {
      job.tries++;
      if (job.tries < FORCE_TRIES && !final.includes(reason)) {
        return;
      }
    }
    forcing.jobs = forcing.jobs.filter((it) => it !== job);

## How it was found

Read from the code and the change log's account of the round.

## How to fix it

1. In `forcingAfterActing`, when `!ok`, `reason === 'no_way'` and `details.through` is a room name the job has not already been through: do not count a try and do not close the job. Record `job.through = [...(job.through ?? []), details.through]`.
2. In `planForcing`, while the job has a `through` room that is not yet opened, the step is `force_door` on that room: "The way to the X is through the Y, which is locked to you as well. You are opening a door of the Y first." Mark it opened when that call comes back `ok` (forced, or `already_open`), then the next step is the door asked for.
3. Limit it: two rooms in between at most, and never the same room twice. After that it fails as it does now, naming the last room.
4. Each door forced is left standing open with its panel shut, as now. Tell whoever sent it which doors were opened, in fixed words, so that the Captain knows a hallway door was forced too: "Ada, the door of the Bar Backroom is open. I had to open the Service Hallway as well."
5. **Questions for the owner:** (a) is forcing a second department's door on security's say-so within what was approved ("when security can not reach a fugitive call an engineer to bust open the door ... as a last step")? (b) should the outer door be shut again afterwards? It cannot be until its power is back, about a minute.

Keeps the rules: every door is opened with tools at the door; the model is not asked.

## How to test the fix

- `tools/llm_crew/security.ts`: cases for `forcingAfterActing` with `reason: 'no_way', through: 'Service Hallway'`, then `ok` on the hallway, then `ok` on the room; and the limit.
- The simulator has no door to force. Server compile only for the server side, which does not change.
- Next round, `game.log`: "could not force ... the way to it is through" followed by "forced open" for a door of that room, then for the room asked for.
