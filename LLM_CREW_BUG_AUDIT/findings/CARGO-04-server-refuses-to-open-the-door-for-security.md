---
id: CARGO-04
title: A technician goes to let security in and the server refuses, because open_door lets in nobody but a janitor with a mess to clean
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:536, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1284, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1490, tools/llm_crew/sim.ts:768
fix: Let tool_open_door (and the simulator's copy of it) open for someone in security who is at the door, and give doorCue words for security that do not talk of a mess
---

## What is wrong

Fault H9 of round 14.28 ("nobody lets security into a department") was fixed in the window only. `mayPass` in `cargo.ts` now says a security officer who asks at the door is to be let in. The technician answers by PDA "Raelene, I am coming to the door of the Cargo Bay to let you in.", walks to the door, and calls `open_door`. The server proc was not changed. It still lets in only a janitor, and only while it remembers a mess in that room, so it answers "You have no call to let Raelene Hart into Cargo Bay." The door stays shut.

Then `afterActing` in `cargo.ts` treats the ask as dealt with whether or not the door opened (`brain.doorAsked = null`). The officer waits its 90 seconds, hears nothing more, and reports "nobody has opened the Cargo Bay for security", having been told by PDA that someone was coming.

The simulator's copy of the server check has the same rule, so no scenario can show the technician letting security in either.

Two smaller faults ride on the same path:

- `doorCue` has no words for security. The step text, and the cue the model is given, say "Raelene Hart was sent for to clean up the mess in the Cargo Bay, and the door is locked to them."
- The change log entry of 16:50 says "(H9) A cargo technician opens the door for security." and the 18:15 addition says "In the Cargo Bay's case that is the technicians, who let security in." Neither is true on the server.

One concrete case: the Captain declares a warrant on a technician, Marisol. The officer goes to the Cargo Lobby door of the Cargo Bay and sends the other technician, Quin, "Quin, I am at the Cargo Lobby door of the Cargo Bay with a warrant for Marisol Burris. Could you let me in, please?" Quin's `readsMessage` sets `doorAsked` (`DOOR_WORDS` matches "door" and "let me in"). `mayPass` returns `{ name, room: 'Cargo Bay', out: false }` from the security branch. A `door` task is added and the PDA answer is sent. `plan` sends `open_door` with the officer's name and the room. `tool_open_door` finds the officer at the door, sees it is outside and not a janitor, and refuses.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:536`, in `tool_open_door`:

    if(!inside && !(findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor") && mess_beyond))
        action_result(CREW_TOOL_DOOR, FALSE, "You have no call to let [person.name] into [room_name].")
        return

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1284`, in `mayPass`:

    // Security at the door, asking to be let in: it has a warrant on someone inside, and the
    // warrant is the permission. It was left standing in the lobby calling an arrest through the
    // counter until the Captain came and opened the door.
    if (
      isSecurity(
        person?.job ??
          brain.pdaPeople.find((known) => known.name === name)?.job ??
          '',
      )
    ) {
      return { name, room: wanted, out: false };
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1966`, in `afterActing`, which runs on failure too:

    // The door has been opened for them, or could not be. Either way that request is dealt with.
    if (task?.kind === DOOR) {
      if (brain.doorAsked?.name === task.item) {
        brain.doorAsked = null;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1490`, `doorCue`:

    return want.out
      ? `${want.name} is inside the ${want.room} and cannot get out by themselves: the door is locked to them.`
      : want.beyond
        ? `${want.name} was sent for to clean up the mess in the ${want.beyond}, ...`
        : `${want.name} was sent for to clean up the mess in the ${want.room}, and the door is locked to them.`;

`tools/llm_crew/sim.ts:768`:

    if (!inside && !(them.job === 'Janitor' && messBeyond)) return result(body, 'open_door', false, `You have no call to let ${them.name} into ${room}.`);

## How it was found

Read from the code, not seen in a round. `LLM_CREW_CHANGELOG.md` lists the window change at "(H9) A cargo technician opens the door for security" and says of it "This is the one change to another job's file". Nothing in the change log or in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` records a round in which a technician opened a door for an officer: in round 15.52.18 the Captain opened it.

## How to fix it

1. Server, `tool_open_door`: also allow someone outside whose job is in security. Use the same test the rest of the server uses for security staff (see `works_in_security` in `crew_npc_security.dm`, which reads the controller's own body: write a small `/proc/crew_npc_job_is_security(title)` from its regex and use it on `person.get_assignment(...)`). The line becomes: refuse if not inside, and not (janitor with a mess beyond), and not security.
2. Whether the officer really holds a warrant is the window's to know, as it is for whether a janitor was sent for. But see the owner's question below.
3. Window, `doorCue`: carry why on the `DoorWant` (for example `why: 'security'` set in the security branch of `mayPass`) and say "${name} is security, at the door of the ${room} with a warrant to serve, and the door is locked to them."
4. Window, `afterActing` for a `door` task: when the answer is a failure, keep `brain.doorAsked` unless the text says there is nobody there. As it stands a door that could not be reached for a crate in the way is also forgotten. The driver's own back-off (20 seconds, then longer) already stops it being tried over and over, and the ask lapses by itself after `DOOR_ASK_DS`.
5. Simulator, `sim.ts:768`: mirror the server change.
6. After being let in, the officer is on the department's list as inside (`noteLetIn`), which is right: its ID does not open the door from inside either, and it will ask to be let out with its prisoner.

Owner's question: `mayPass` lets in anyone whose job is security who asks, with no check that there is a warrant or that the wanted person is in the room. A technician's body cannot see the wanted list unless it was sent one (see `jobs/wanted.ts`). Is "security asks, security is let in" the rule, or should the technician let security in only when it holds word of a warrant?

## How to test the fix

- Simulator: add a scenario in which the officer has a warrant on a technician who is in the Cargo Bay and there is a second technician. Check that `open_door` is answered ok and the officer ends inside. None of the nine security scenarios has security shut out of a room (the change log says so at the 16:50 entry).
- Server compile.
- In a round: `game.log` "opened ... to let ... into Cargo Bay" with the officer's name, and no "You have no call to let".
