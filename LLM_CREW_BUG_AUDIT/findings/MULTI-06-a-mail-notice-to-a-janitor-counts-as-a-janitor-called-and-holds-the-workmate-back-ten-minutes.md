---
id: MULTI-06
title: Any PDA message a technician sends a janitor, a mail notice among them, counts as the post having called a janitor, and holds its workmate's calls to every mess back for ten minutes
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
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

1. Let the window say when a message is a call to a mess: add `"call_for": place` to the `message` tool's arguments from `tidyStep` (cargo.ts) and nowhere else. In `tool_message` (and when the kept message is resent), call `note_janitor_called(place)` only when `call_for` is a room of the post's department.
2. Keep `GLOB.crew_npc_janitor_calls` per post and room: `[post][room] = list(caller, time, janitor)`. Send `workmate_called` as the list of rooms a workmate has called for (or, with GAP-09, rooms and names).
3. In `tidyStep`, hold back only when `task.place` is one of those rooms.
4. If the owner rules on GAP-06 that this list is not allowed, step 2 is replaced by hearing the caller say aloud "I have sent for Ysabel to the Cargo Bay", and step 1 still decides what is a call.

## How to test the fix

- Simulator: two technicians with the work divided. The shuttle one sends a janitor a mail notice; a mess then appears in the bay. The rooms one must send for a janitor after its usual wait, not ten minutes later. (The sim plays `workmate_called`; it has to play it from the new per-room list.)
- Compile. In a round, grep `game.log` for "to PDA" lines from the rooms technician after a mail notice to a janitor.
