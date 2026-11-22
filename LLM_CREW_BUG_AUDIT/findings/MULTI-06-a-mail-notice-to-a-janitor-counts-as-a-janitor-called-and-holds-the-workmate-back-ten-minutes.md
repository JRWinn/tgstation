---
id: MULTI-06
title: Any PDA message a technician sends a janitor, a mail notice among them, counts as the post having called a janitor, and holds its workmate's calls to every mess back for ten minutes
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: ad3b5a3d800, 5151ce8982c, 5d3dfa388ac, 77c66070633, 6dc2dee0cbc
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:736, code/modules/llm_crew/crew_npc_guarding.dm:235, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1550, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:207
fix: Note a janitor call only for a message that is a call to a mess (have the window say so in the tool call), keep the room it was for, and let a workmate's call hold back only a call to that room
---

## What is wrong

To stop two technicians sending for a janitor for the same mess, the server notes, per post, the last time anyone there sent a janitor a PDA message (`note_janitor_called`), and for ten minutes (`CREW_NPC_CALL_STANDS`) every other technician at the post is told `workmate_called` and holds back its own calls (`tidyStep`: "If no janitor comes by soon, you will call one").

Two things are wrong with what counts:

1. **Any message to a janitor counts**, whatever it says. `tool_message` notes the call whenever the PDA it reaches belongs to a janitor. The technician who has the shuttle sends janitors messages that have nothing to do with a mess: "There is mail for you at cargo..." for each janitor with a letter (freight.ts DELIVER), and the reminders and lost-crate notices if a janitor ordered. Each one marks the post as having sent for a janitor.
2. **The call is for no room in particular.** `workmate_called_janitor` returns one yes or no for the whole post. A call for a mess in the Delivery Office holds back a call for a mess in the Cargo Bay that the janitor was never told of.

With the work divided by the Quartermaster, which the standing test crew does at its first supply meeting, only the technician with the rooms sends for janitors (`roomsKeeper`). The other has the shuttle, and so the mail. So every time the shuttle brings a letter for a janitor, the one technician who would call a janitor is told a workmate has called one, and leaves every mess in the department alone for ten minutes. Nobody comes, because nobody was called.

One concrete case, the standing test crew:

1. The Quartermaster has given Maria the rooms and Sam the shuttle.
2. A mail crate comes in with a letter for the janitor Ysabel. Sam takes the mail out and sends her "There is mail for you at cargo. Come by the counter in the Cargo Lobby when you can and I will hand it over." The PDA belongs to a janitor, so `note_janitor_called()`: `GLOB.crew_npc_janitor_calls["Cargo Bay"] = list("Sam ...", world.time)`.
3. Someone spills oil in the bay. Maria's TIDY task for the Cargo Bay comes up. `roomsKeeper` is Maria, so she is the caller. `brain.workmateCalled` is TRUE (the last call was Sam's, under ten minutes ago).
4. For ten minutes her step reads "There is a mess in the Cargo Bay. If no janitor comes by soon, you will call one." No janitor comes: Ysabel was told about her mail, not a mess. (If she comes for the mail she stands in the lobby, where she cannot see into the bay.)
5. Each later letter for a janitor starts the ten minutes again.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:735`, in `tool_message`:

    	// A message to a janitor from a post is that post's call for one: the others there need not send their own.
    	if(findtext(target.computer.saved_job, "janitor"))
    		note_janitor_called()

(and the same two lines in `resend_unsent`, line 779).

`code/modules/llm_crew/crew_npc_guarding.dm:235`, one flag for the whole post:

    /datum/ai_controller/crew_npc/proc/workmate_called_janitor()
    	var/list/last_call = post_place ? GLOB.crew_npc_janitor_calls[post_place] : null
    	...
    	return last_call[1] != body.real_name && world.time - last_call[2] < CREW_NPC_CALL_STANDS

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1550`, in `tidyStep`:

    if (
      brain.workmateCalled ||
      brain.now - task.createdAt < NOTICE_DS + stagger(brain, CALL_STAGGER_DS)
    ) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:207`, the mail notice, sent with the same `message` tool:

    act: {
      tool: 'message',
      person: name,
      text: 'There is mail for you at cargo. Come by the counter in the Cargo Lobby when you can and I will hand it over.',

## How it was found

Read from the code, not seen in a round. GAP-09 is about the window being told only yes or no and not who called whom; GAP-06 about the list being shared in code at all; CARGO-11 about the rooms keeper being gone. None of them says that a message which is not a call counts as one, or that one room's call holds back another's.

## How to fix it

0. A one-line stopgap, window only, for the case above: in `tidyStep`, hold back for `brain.workmateCalled` only when no rooms keeper is set (`(brain.workmateCalled && !keeper) || ...`). By that line `keeper` is either null or this technician (any other keeper has returned just above), and once the work is divided the keeper is the only one at the post who sends for janitors, so a workmate's message to a janitor cannot be a call. It does not mend the undivided case, where either technician's mail notice still holds the other back.
1. Let the window say when a message is a call to a mess: add `call_for: place` to the `message` act from `tidyStep` (cargo.ts, about line 1628) and nowhere else. On the server, the dispatch `tool_message(arguments["person"], arguments["text"])` (`crew_npc_tools.dm:112`) takes it as a third argument; `tool_message` keeps it in the `unsent_messages` entry as well, so that `resend_unsent` can tell a kept call from a kept notice; and both call `note_janitor_called(place)` only when `call_for` is one of the post's department rooms (`post_place`, `look_in_rooms`).
2. Keep `GLOB.crew_npc_janitor_calls` per post and room: `[post][room] = list(caller, time, janitor)`. Send `workmate_called` as the list of rooms a workmate has called for (or, with GAP-09, rooms and names).
3. In `tidyStep`, hold back only when `task.place` is one of those rooms.
4. If the owner rules on GAP-06 that this list is not allowed, step 2 is replaced by hearing the caller say aloud "I have sent for Ysabel to the Cargo Bay", and step 1 still decides what is a call.

## How to test the fix

- Simulator: two technicians with the work divided. The shuttle one sends a janitor a mail notice; a mess then appears in the bay. The rooms one must send for a janitor after its usual wait, not ten minutes later. (The sim plays `workmate_called`; it has to play it from the new per-room list.)
- The simulator makes the same mistake today: `tools/llm_crew/sim.ts:725` sets `janitorCall` for any message to a janitor, and line 1134 sends `workmate_called` from it. Change it with the server, or the scenario will pass or fail for the wrong reason.
- Compile. In a round, grep `game.log` for "to PDA" lines from the rooms technician after a mail notice to a janitor.

## Check

Checked by Opus 5.5. Read `tool_message` and `resend_unsent` (`crew_npc_cargo.dm`, about lines 735 and 779): both note a call for any message whose PDA's `saved_job` says janitor, with no look at the words. Read `workmate_called_janitor` and `note_janitor_called` (`crew_npc_guarding.dm`, about line 235): one entry per post, no room, ten minutes (`CREW_NPC_CALL_STANDS`, `_defines.dm:207`), and the caller's own calls do not count against it. Read `tidyStep` (`jobs/cargo.ts`, about line 1509): the rooms keeper is not exempt from the `workmateCalled` hold, and nothing else lifts it. The mail notice in `jobs/freight.ts` (DELIVER) and the lost-crate and still-waiting notices in `jobs/cargo.ts` (about lines 591 and 622) all go out with the same `message` tool. Nothing in the change log or plans covers it. Confirmed. Effort raised to medium: the full fix touches the server (`tool_message`, `resend_unsent`, the dispatch, the call list), the window (`tidyStep`) and the simulator.

## Fix so far

Group m-senses, 2026-11-19, server step 2 in `crew_npc_guarding.dm` and `crew_brain_link.dm`. `GLOB.crew_npc_janitor_calls` is now kept per post and room: `[post][room] = list(caller, time)`, with `""` for a call that names no room. `note_janitor_called(room)` takes the room (optional, so the two existing calls with none still work as before). `rooms_workmate_called_for()` lists the rooms a workmate called for in the last `CREW_NPC_CALL_STANDS`; `workmate_called_janitor()` is TRUE if there is any, so `workmate_called` means what it did. `ui_data` also sends `workmate_called_rooms`. With nothing else changed, nothing the crew does changes yet.

Held:
- `crew_npc_cargo.dm` (step 1): in `tool_message` and `resend_unsent`, call `note_janitor_called(call_for)` only when the message carries a `call_for` room that is one of the post's department rooms (`post_place` or in `look_in_rooms`), not for every message to a janitor's PDA; keep `call_for` in the `unsent_messages` entry so `resend_unsent` can tell a call from a notice. Dispatch in `crew_npc_tools.dm`: pass `arguments["call_for"]` as a third argument to `tool_message` (check it is text).
- Window (steps 0, 1, 3): `tidyStep` (`jobs/cargo.ts`) adds `call_for: task.place` to its message act, and holds back only when `task.place` is in `workmate_called_rooms` (or `""` is, for a call from an old server path); step 0's stopgap if wanted. `types.ts`: `workmate_called_rooms?: string[]`.
- Simulator (`sim.ts:725` and `:1196`): note a call only for a message with `call_for`, per room, and send `workmate_called_rooms`.
Compile only; not played.

Round M2, group g-srv-b (2026-11-20), compile only, not played: the `crew_npc_cargo.dm` part of step 1 built. `tool_message(person_name, text, call_for)` takes an optional third argument; new `janitor_call_room(call_for)` returns it only when it is text and is `post_place` or in `look_in_rooms`. `tool_message` and `resend_unsent` call `note_janitor_called(room)` only for such a message to a janitor's PDA, and the `unsent_messages` entry keeps `call_for`. Until `crew_npc_tools.dm` passes `arguments["call_for"]` and `tidyStep` sends it, no message is noted as a call at all, so `workmate_called` stays FALSE and workmates are not held back.
Round M2 (group g-cargo): window step 1 and 3 in `jobs/cargo.ts`. `tidyStep`'s message act carries `call_for: <room>`; it holds back for a workmate's call only when the room (or "") is in `brain.workmateCalledRooms` (`workmateCalledFor`), read through a cast; while that is not set it goes by `workmateCalled` as before. Table cases in `tools/llm_crew/cargo-deaddoor.ts`. Held: `brain.ts` ingest `brain.workmateCalledRooms = npc.workmate_called_rooms` (and `types.ts`: `workmate_called_rooms?: string[]` on the npc data, `workmateCalledRooms?: string[]` on the brain); until then the window cannot see the list. The server side (`tool_message` taking `call_for`) is g-srv-a/g-srv-b's this round.

Round M3 (group m3-server), compile only, not played: `handle_tool_call` (`crew_npc_tools.dm`) passes `arguments["call_for"]` (when it is text) to `tool_message`, and `janitor_call_room` also takes a room in `work_area`, so a call for the Cargo Lobby is noted. Left: `brain.ts`/`types.ts` reading `workmate_called_rooms` (window group).
Round M3 (group m3-window, 6dc2dee0cbc): `brain.ts` ingest copies `workmate_called_rooms` to `brain.workmateCalledRooms` (typed in `types.ts`); `workmateCalledFor` in `jobs/cargo.ts` reads it without the cast. `planCall` (`jobs/orders.ts`) sends `call_for` too (7efbfb5d8e1). Left: `crew_npc_tools.dm` passing `arguments["call_for"]` to `tool_message`, if not done this round by m3-server.
