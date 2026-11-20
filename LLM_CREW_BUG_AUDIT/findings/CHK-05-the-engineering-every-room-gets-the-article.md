---
id: CHK-05
title: The Chief Engineer calls its meeting "in the Engineering" - every room name is given "the", fitting or not
kind: bug
severity: low
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:71, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:65, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:712, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1145
fix: Put the article on through one helper that knows which room names take one, and let the code that reads these lines back accept the name with or without it
---

## What is wrong

Lines the crew say and send are built by putting "the" in front of whatever the room is called: `in the ${room}`. That reads right for "the Cargo Bay", "the Bar", "the Security Office". It reads wrong for a room whose name is not a thing with an article: "Engineering", "Medbay Central", "Atmospherics", "Hydroponics", "Aft Maintenance". The engineering staff meet in the room the game calls "Engineering", so the Chief Engineer says, every meeting of every round:

    Staff meeting in the Engineering now, please. Gather round and have your reports ready.

and sends the Captain "I am holding a staff meeting in the Engineering now. My report will follow it." A player notices at once. Nothing stops working.

It is in the simulator's output too, in all five engine scenarios, and those pass: no check looks at the wording.

About 170 places in `CrewBrain/jobs/*.ts` put "the" before a room this way (28 in `cargo.ts`, 19 in `forcing.ts`, 17 in `head.ts`, 16 each in `janitor.ts` and `meetings.ts`, 13 in `arrests.ts`). Most are prompt text the model reads, where it does no harm. The ones that matter are the lines said aloud or sent by PDA. Other parts of the code go without the article ("You have a mess to clean up in ${task.place}", "You are in Cargo Bay."), so there is no one rule.

The article is also **read back**. Three places know a meeting call by the words "meeting in the", so the article cannot simply be dropped from the line that is said:

    const CALL_WORDS = /\bmeeting in the\b/i;                              (jobs/meetings.ts:65)
    export const ALOUD_CALL_WORDS = /^staff meeting in the .+? now, please\b/i;   (jobs/meetings.ts:73)
    if (/^staff meeting in the/i.test(text)) {                             (jobs/head.ts:1145)

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:70`, `aloudCall`:

    export function aloudCall(room: string): string {
      return `Staff meeting in the ${room} now, please. Gather round and have your reports ready.`;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:712` (and the same words again at `:808`), the call sent by PDA:

    text: `Staff meeting in the ${room} now, please. Send word that you are coming, and bring your report.`,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:457`, the report sent to the Captain:

    const came = `Staff meeting in the ${meeting.room}: ${there} of ${meeting.invited.length} there...

`code/game/area/areas/station/engineering.dm:17` is where the name comes from: `name = "Engineering"`.

## How it was found

Seen in the simulator's output while running every scenario (`quiet engine`, `enginestuck`, `enginehot`, `engalone`, `enginedim`), then looked for in the round logs. It is in the real rounds. `data/logs/2026/11/18/round-10.46.15/game.log`:

    [2026-11-18 16:48:19.636] GAME-SAY: *no key*/(Kyla Schofield) (mob_2987) "Staff meeting in the Engineering now, please. Gather round and have your reports ready. I suppose we can wait until the pumps are fixed."
    [2026-11-18 16:47:49.058] GAME: Crew NPC *no key*/(Kyla Schofield) (owner: zimfire) was told by its brain to PDA Zim Fire: I am holding a staff meeting in the Engineering now. My report will follow it.

A count over the `game.log` files of 2026-11-17 to 2026-11-19: "in the Engineering now, please. Gather round" 79 times, "in the Engineering now. My report will follow" 40 times, "to the Engineering" 4 times. Not in `LLM_CREW_CHANGELOG.md` or any plan.

Not checked: which other odd names a round would bring up. Only the engineering staff's meeting room has such a name among the rooms the present crew are sent to by name, so today it is this one line and its PDA twin. A medical or atmospherics crew member would add more.

## How to fix it

1. Add one helper, next to `knowsPlace` in `memory.ts`, for example `theRoom(name: string): string`. It returns the name with "the " in front when the name ends in a word that takes one, and the bare name otherwise. A short list of last words covers the station's rooms on every map: Office, Room, Bay, Lobby, Hallway, Closet, Bar, Kitchen, Bridge, Brig, Chapel, Library, Quarters, Storage, Lab, Wing, Foyer, Dock, Vault, Shuttle, Tunnel, Dormitories, Cell, Checkpoint, Theater, Garden, Morgue, Pharmacy. Anything else ("Engineering", "Medbay Central", "Atmospherics", "Aft Maintenance", "Hydroponics") gets no article. This is a rule about words, not about one map or one job.
2. Use it in the lines that are said aloud or sent: `aloudCall` in `meetings.ts`, the two PDA calls and the Captain's report in `head.ts`, and the same lines in `quartermaster.ts`, `chiefengineer.ts` and `headofsecurity.ts` if they build their own. Then work outwards through the other spoken lines (`say:` and `text:` values) as they are touched. The prompt text (`step:` values) can wait.
3. Make the three readers above accept the name with or without the article: `/\bmeeting in (?:the )?/i`, `/^staff meeting in (?:the )?.+? now, please\b/i`, `/^staff meeting in\b/i`. Do this in the same change as step 2, or a meeting called "in Engineering" is not known for a call and nobody comes.
4. Look for any other reader that pulls a room name out of a line by the words "in the" or "of the" and give it the same optional article. `placeNamedIn` works from the room names themselves and needs nothing. `janitor.ts:807` already has it: `text.match(/mess in (?:the )?([^:.,]+)/i)`.

The other way is to drop the article everywhere ("Staff meeting in Cargo Bay now, please"). It is less work and reads a little clipped. That is the owner's choice: the helper is what I would do.

## How to test the fix

- `tools/llm_crew/reports.ts` has the cases for `isMeetingOrder` and the meeting words: add cases that a call "in Engineering" and a call "in the Cargo Bay" are both known for calls, aloud and by PDA.
- Simulator: `quiet engine` (the Chief Engineer must say "Staff meeting in Engineering now, please" and the engineer must still come: the check "the Chief Engineer calls its staff together in Engineering, aloud" must pass), `quiet crew`, `quiet qm`, `quiet shutout`, `quiet warrant` for the meetings that keep the article.
- In the next round, grep `game.log` for "in the Engineering": there should be none.
