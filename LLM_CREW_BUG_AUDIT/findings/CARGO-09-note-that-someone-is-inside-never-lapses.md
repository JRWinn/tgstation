---
id: CARGO-09
title: A note that a visitor is inside a locked room never lapses, so one who left unseen has the door tried for them for good and stops orders, rounds and janitor calls
kind: bug
severity: medium
effort: medium
confidence: likely
status: fixed
fixed_in: 8d2123256a6, 1f45c797ac9
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/expected.ts:40, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1475, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1966, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1517, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1878
fix: Strike the note when a let-out fails because they are not in that room, give the note an age limit, and do not let a standing door want switch off order-taking
---

## What is wrong

When a technician opens a door of its department for someone, the department's shared list notes them as inside that room (`noteLetIn`). The note is taken off in three ways only: a technician opens a door to let them out, a technician sees them standing somewhere else, or they ask by PDA to be let into that same room again. It has no age limit: `current()` in `expected.ts` keeps every entry with `inside` set for the whole round.

A visitor can leave without any of the three. A janitor who is shut in a room walks out through any door it sees standing open (`wayOutOpen` in `driver.ts`), and a technician walking through on its rounds or with a crate leaves the airlock open for eight seconds. A person, or the Captain, can open the door for them. Or the door was opened and they never went in, and then walked off out of sight.

The stale note then does all of this, for as long as that technician does not happen to see them elsewhere:

1. **The door is tried every two minutes for good.** After three minutes (`LEFT_INSIDE_DS`) in a room with no mess left, `doorSought` returns a want to let them out. `open_door` is sent with their handle. The server finds them, sees they are neither in the room nor at its door, and answers "You cannot see that person, and they are not at the door of ..." or "You have no call to let ... into ...". `afterActing` only strikes the note when the answer is ok. The want is back on the next update, the driver backs the step off (20 seconds, rising to two minutes), and it is sent again, without end.
2. **Orders are not offered.** `offers` returns nothing while `doorWanted(brain)` is set, and `hears` goes by `offers`. With no Quartermaster aboard, no head can order from that technician. The list is the department's, shared by every technician in the window, and the long stop has no test of whose door it is, so this is every technician at that post at once, not only the one who let them in. The 15 second pause after an opened door (`lastOpened`) never comes, because the door never opens.
3. **No rounds, and no walk back to the post.** `syncRounds` is passed `!wants && !visitorToMind(brain)`, and `away` needs `!wants`.
4. **No janitor is called to a mess in that room.** In `tidyStep`, for a locked room, `here` is whoever the list says was let in. The step is "X, a janitor, is here and can see the mess in the Warehouse." for good, and no call is sent. (With a mess in the room the long stop in point 1 does not run, so this is the state it sits in.)
5. **The model is told something false.** `cues` says "X is inside the Warehouse and cannot get out by themselves ... You are opening the door for them now".

One concrete case: Sam lets the janitor Jan into the Warehouse for a mess. Jan cleans it and wants out. A miner, or a player, opens the Warehouse door from the bay, and Jan, seeing it open, leaves through it and on out of the bay by its far door while Sam and Maria are both in the lobby. Neither has seen Jan since. (A workmate who opens the door would see Jan as they pass and, being on the same list, strike the note: `syncTasks` at `jobs/cargo.ts:811-840`. The note stands only while no technician at the post sets eyes on Jan after Jan is out.) Three minutes on, Sam's `doorSought` returns `{ name: 'Jan Mopp', room: 'Warehouse', out: true }`. Sam's `open_door` is refused. The Head of Personnel comes to the counter and says "I need to order a crate of janitorial supplies." `offers` is empty for Sam, and for Maria too. Nothing is ordered, by the model or by `hears`.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/expected.ts:40`:

    function current(now: number): Expected[] {
      list = list.filter((entry) => entry.inside || now - entry.at < EXPECTED_DS);
      return list;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1475`, the long stop in `doorSought`:

    for (const room of ownRooms(brain)) {
      if (room === post || brain.areaMesses[room]) {
        continue;
      }
      const left = stillInside(post, room, brain.now).find(
        (entry) => brain.now - entry.at > LEFT_INSIDE_DS,
      );
      if (left) {
        return { name: left.name, room, out: true };
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1966`, `afterActing`: everything that changes the list is under `if (ok && ...)`:

    if (task?.kind === DOOR) {
      if (brain.doorAsked?.name === task.item) {
        brain.doorAsked = null;
      }
      if (brain.knockAt?.room === task.place) {
        brain.knockAt = null;
      }
      ...
      if (ok && task.item && task.place && brain.post) {

`code/modules/llm_crew/crew_npc_doors.dm:518`, the two answers a stale note gets:

    var/inside = get_area(person) == room
    var/obj/machinery/door/airlock/door = room_door_for(person, room, room_name, door_label)
    var/at_the_door = !isnull(door) && get_dist(person, door) <= CREW_NPC_AT_DOOR
    if(!recently_saw(person) && !inside && !at_the_door)
        action_result(CREW_TOOL_DOOR, FALSE, "You cannot see that person, and they are not at the door of [room_name].")
        return
    ...
    if(!inside && !(findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor") && mess_beyond))
        action_result(CREW_TOOL_DOOR, FALSE, "You have no call to let [person.name] into [room_name].")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1517`, `tidyStep`:

    const letIn = brain.post ? stillInside(brain.post, place, brain.now)[0] : null;
    const here = lockedAway
      ? letIn
        ? { name: letIn.name }
        : undefined

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873`, `offers`:

    // Someone at the door wants the door. Offered an order as well, the LLM sometimes takes it.
    doorWanted(brain) ||

## How it was found

Read from the code, not seen in a round. How often a visitor leaves unseen is not known: the write-up of round 00.56.30 in `LLM_CREW_PLAN_NO_CHEATS.md` has "The Head of Personnel asked Maria for a crate of janitorial supplies while a janitor was knocking ... Nothing was placed", which is the same switch in `offers` with a real knock. That plan's section 4.2 proposes keeping the ask. It does not cover a door want that never ends.

## How to fix it

1. Server, `tool_open_door`: when the person was found by handle or name and is not in the room, add `list("not_inside" = TRUE)` to the details of both refusals above (`action_result` takes the details as its fourth argument, as `tool_order` does). Add it as well to "You do not know who that is, and there is nobody of that name at the door" when the handle no longer resolves: whoever it was is gone from the round or out of reach, and is not in there to be let out.
2. Window, `afterActing` for a `door` task: when `!ok && task.out && details?.not_inside`, call `noteLetOut(brain.post, task.item, task.place)`. They are not in there, whatever the note says. `afterActing` already receives `details` as its sixth argument.
3. `expected.ts`: give an `inside` entry an age limit as a long stop, for example drop `inside` (not the call) when `now - entry.at > 18000` (30 minutes) and nothing has renewed it. `noteLetIn` already resets `at`.
4. Cap the long stop in `doorSought`: after two failed tries for one person and room, leave it until they knock or send word. Keep the count on the entry.
5. `offers`: withhold `order` only while the door want is fresh and came from an ask or a knock (for example `brain.doorAsked` or `brain.knockAt` within the last 30 seconds), not for a want that comes from the long stop. Section 4.2 of `LLM_CREW_PLAN_NO_CHEATS.md` (keep the ask and place it after) is the fuller answer and is already decided.
6. `tidyStep`: treat a let-in janitor as "here" only for a limited time after they were let in (say `CALL_AGAIN_DS`), or only until they have said they cannot shift it (`call.declined`).

What must keep working: a janitor let in and still scrubbing is not let out unasked, and is let out the moment they knock (the comment above the long stop gives the history).

## How to test the fix

- Simulator: `nested` and `office` are the scenarios with let-in and let-out. Add one in which the sim moves the janitor out of the room without an `open_door` and out of the technician's view, and then a head orders at the counter with no Quartermaster aboard. Checks: one `open_door` try at most, then none, and the order is placed.
- Type check and server compile.
- In a round: `crew_brain.log` should not show the same "ROUTINE (no LLM) ... You are going to open the door for them" step for one name every two minutes.

## Check

Confirmed, on Opus 5.5.

- The quotes match the code today: `current` at `expected.ts:40`, the long stop at the end of `doorSought` (`jobs/cargo.ts:1475-1485`, `LEFT_INSIDE_DS = 1800` at `:168`), the door part of `afterActing` (`:1966-2027`, every list change under `if (ok && ...)`), `tidyStep` (`:1517`), the `doorWanted` test in `offers` (`:1878`), and the refusals in `tool_open_door` (`crew_npc_doors.dm:516-534`).
- The only ways an `inside` note is struck are `noteLetOut` from a door opened outward (`afterActing`), from a technician seeing them elsewhere (`syncTasks`, `:811-840`, after `GONE_THROUGH_DS`), and `forgetExpected`. None runs on a failed `open_door`. The `DOOR` task is re-made by `syncTasks` while `doorWanted` returns the want, and the driver backs it off by `RETRY_MS * count` up to `RETRY_MAX_MS` (`driver.ts:52-53`, `:932-935`), so it is tried every two minutes for as long as the note stands.
- `syncRounds` gets `!wants && !visitorToMind(brain)` and `away` needs `!wants` (`jobs/cargo.ts:907-927`); `visitorToMind` is true while `stillInside` has anyone for any own room. Points 3 to 5 hold.
- Ran a throwaway bun script outside the repo: `noteLetIn('Cargo Lobby', 'Jan Mopp', 'Warehouse', ...)` at time 100, then the real `CARGO.offers` for the Head of Personnel in view with no Quartermaster. It returned no options for Sam and for Maria at time 2100, and still none at time 100000 (about 2.7 hours on). With the note put under another post, both got the `order` option. So the note does not lapse, and it switches off ordering for every technician at the post.
- Mended in the write-up: point 2 and the case now say it is every technician at the post (the list is shared and the long stop does not ask whose door it is). The concrete case changed: as first written, a workmate opened the door, and that workmate would most likely have seen Jan leave and struck the note. The real trigger is that no technician sees Jan after Jan is out.
- How often that happens is not known: confidence stays likely. CARGO-16 (the stand-in name for whoever is knocking booked as inside for the round) is one more way the same never-lapsing note is made; GAP-08 (an ask lost while a door is wanted) is the same switch in `offers` with a real door want. Neither is a duplicate of this.
- Fix step 1 extended to the "do not know who that is" refusal. Steps 2 and 3 alone would stop the loop; I would build 1, 2, 3 and 5 and leave 4 out, since 2 already ends the tries once the server says they are not there.

## Fix so far

Window side done (group g-cargo, round M2): steps 2, 3, 5 and 6; step 4 left out, as the check advised. `afterActing` (`jobs/cargo.ts`) strikes the note (`noteLetOut`) when a let-out `open_door` fails with `details.not_inside` or with the server's own words for it today ("You cannot see that person, and they are not at the door", "You have no call to let ... into", "You do not know who that is"). `current()` in `expected.ts` drops an `inside` note 30 minutes (`INSIDE_DS`) after it was last renewed. The long-stop want from `doorSought` is marked `unasked` and no longer stops `offers` (and so `hears`). `tidyStep` takes a let-in janitor to be in the room only for `CALL_AGAIN_DS` after the let-in and not once it declined the mess. Table: `tools/llm_crew/cargo-lapse.ts`.

Left (server, `crew_npc_doors.dm`, `tool_open_door`): step 1, add `list("not_inside" = TRUE)` as the details of the two refusals quoted above and of "You do not know who that is"; the window reads the words until then. Not added to the simulator: the scenario in "How to test the fix".

Round M3 (group m3-server), compile only, not played: step 1 built. `tool_open_door` (`crew_npc_doors.dm`) sends `not_inside = TRUE` in the details of its three refusals ("You do not know who that is...", "You cannot see that person...", "You have no call to let ... into ..."). Nothing is left on the server side.
