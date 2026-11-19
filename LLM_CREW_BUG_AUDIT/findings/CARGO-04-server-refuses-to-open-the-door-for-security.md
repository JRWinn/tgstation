---
id: CARGO-04
title: A technician goes to let security in and the server refuses, because open_door lets in nobody but a janitor with a mess to clean
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
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

1. Server, `tool_open_door`: also allow someone outside whose job is in security. `works_in_security` (`crew_npc_security.dm:107`) does take a body, but do not call it on someone else: it goes through `job_title`, which reads the card out of their hands or belt (`get_idcard(TRUE)`), more than the technician could see. Go by what the line already uses, the job shown on them: `var/shown_job = person.get_assignment(if_no_id = "", if_no_job = "")`, then security is `findtext(shown_job, "Security Officer") || findtext(shown_job, "Head of Security")`, the same two titles as `isSecurity` in `jobs/security.ts`. The line becomes: refuse if not inside, and not (janitor with a mess beyond), and not security. Leave `janitor_at_door` as it is: the officer is found by name through `person_at_room`.
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

## Check

Confirmed, Opus 5.5, 2026-11-19. Read from the code, nothing run.

- `tool_open_door` (`crew_npc_doors.dm:536`) is as quoted. A security officer at the Cargo Bay door is found by name (`person_at_room`), is not inside, passes the at-the-door test, and then fails the one test that lets anyone in: its shown job has no "janitor" in it. Nothing before that line lets security through, and `hold_door_for` is never reached. The simulator has the same rule at `sim.ts:768`.
- The window side is as quoted: `mayPass` returns `{ name, room: wanted, out: false }` for anyone `isSecurity` (`cargo.ts:1284`), `readsMessage` sets `doorAsked` on `DOOR_WORDS`, and `afterActing` clears `doorAsked` on a failed `open_door` as well (`cargo.ts:1965`). `doorCue` has only the mess wordings.
- No later change log entry touched the server check. The 16:50 entry (H9) changed `mayPass` only, and the 18:15 note "the technicians, who let security in" was never true on the server. `grep "no call to let"` finds only the two copies of the refusal.

Changed: severity to medium. The arrest is not lost for good: the officer asks up to three keepers in turn, 45 seconds each (staff of the room, then heads, then the Captain, change log 16:50), and after that the Head of Security can have an engineer force the door (18:50 entry). With two technicians and a Quartermaster aboard, all three asks may go to cargo staff, and the Quartermaster's `open_door` is refused the same way, so the arrest then waits on the engineer. It is still a fault the owner named ("no one is opening the door for security") and that the change log says is fixed. Effort to medium, since the fix is the server line, the simulator's copy and, for the wording, `doorCue`. Step 1 of the fix: the security test should read the job shown on the person, as the janitor test does, not `works_in_security`, which reads the card itself.
