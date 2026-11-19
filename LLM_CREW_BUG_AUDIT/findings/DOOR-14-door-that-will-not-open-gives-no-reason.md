---
id: DOOR-14
title: A door a technician cannot open is answered with one line for four causes, so a door with no power is walked to at every asking and nobody is told why
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:585, code/modules/llm_crew/crew_npc_doors.dm:593, code/modules/llm_crew/crew_npc_doors.dm:438, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:962
fix: Give hold_door_for a separate answer and a reason detail for no power, bolted, welded and not your access, refuse a door that stands open only when it is not open, and pass over dead doors in room_door_for
---

## What is wrong

`hold_door_for` is where a cargo technician opens the door of its room for a janitor, or to let someone out. It refuses for four different reasons with the same words, "The door will not open for you.", and no details:

- the door is bolted (`door.locked`),
- it is welded,
- it has no power (`!door.hasPower()`),
- the technician's own ID does not open it.

The brain cannot tell them apart. In `cargo.ts` (`afterActing`, "The door has been opened for them, or could not be. Either way that request is dealt with.") a failed `open_door` clears the request (`doorAsked`, `knockAt`) just as a good one does, and nothing more happens. Whoever is shut in or waiting outside is never told, and nobody is asked for what would help: a crowbar (anyone can pry a door that has no power, `try_to_crowbar` in `airlock.dm`), or an engineer for a bolted one. The person knocks or sends word again, the technician walks to the door again and is refused again. (Corrected by the checker: this is not endless. A shut-in body knocks once, writes once to whoever let it in, once to one other door keeper (`KEEPERS_WRITTEN_TO = 1`) and once to its head, a minute apart (`nextToWrite` in `driver.ts`). So it is three or four walks to a dead door, and then the body waits, shut in and told nothing.)

The no-power case is the one that matters. The project's own notes say test rounds lose station power about 15 minutes in. From then on every airlock of the room has no power, so every door the technician is asked to open is refused with this one line, for the rest of the round.

Two smaller faults in the same lines:

1. A door with no power that is standing open is refused too. The test `!door.hasPower()` comes before anything looks at `door.density`. An airlock that lost power while open stays open (its close needs power), so the person could walk through it, and the technician is told it "will not open".
2. `room_door_for` does not look at power, bolts or a weld when it picks which door of the room to open: the door it picks is the nearest the technician's ID opens. With two doors, one dead and one working, it can pick the dead one, and `hold_door_for` then refuses, when the other door would have done.

One concrete case. The station's power fails. A janitor is shut in the Cargo Bay after cleaning and knocks. The technician's brain plans `open_door` for it. `tool_open_door` finds the janitor and the door, the errand walks the technician to the door, and `hold_door_for` returns `list(FALSE, "The door will not open for you.")`. The request is dropped and the janitor hears nothing. It sends word again later (by PDA, to whoever let it in, then to one other technician, then to its head), and the same walk and refusal follow each time. After that nobody else is asked, and the janitor stays shut in. A player technician would see the door's lights were out, pry it with a crowbar from the nearest toolbox or emergency locker, or call engineering.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:585`, in `hold_door_for`:

    	if(door.locked || door.welded || !door.hasPower() || !door.allowed(body))
    		return list(FALSE, "The door will not open for you.")
    	...
    	door.autoclose = FALSE
    	if(door.density && !door.open())
    		door.autoclose = TRUE
    		return list(FALSE, "The door will not open for you.")

`code/modules/llm_crew/crew_npc_doors.dm:445`, in `room_door_for`, which picks the door by distance and access only:

    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(!door.allowed(pawn))
    			continue

The window plans the same `open_door` act each time it is asked, `tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:962` (the `DOOR` task's plan), and treats a failure as the request dealt with, `jobs/cargo.ts` about line 1966:

    // The door has been opened for them, or could not be. Either way that request is dealt with.
    if (task?.kind === DOOR) {
      if (brain.doorAsked?.name === task.item) {
        brain.doorAsked = null;
      }

## How it was found

Read from the code, with `airlock.dm` (`close` needs power at `DEFAULT_DOOR_CHECKS`; `try_to_crowbar` opens a door with no power for anyone holding a crowbar). Not seen in a round. The power failing early is from the owner's notes on test rounds, not checked here.

## How to fix it

1. In `hold_door_for`, test in this order and give each its own words and a `reason` in the details (the errand returns `list(ok, words)`; add a third element and carry it to `action_result`, as `force_door_outcome` already does for forcing). Today `finish_errand` in `crew_npc_hands.dm` (about line 347) passes `null` as the details for every tool that is not security's, so that line needs a case for `CREW_TOOL_DOOR` too (`length(outcome) >= 3 ? outcome[3] : null`), or the reason never reaches the window:
   - `!door.density`: the door is open already. Go on as for an opened door (watch it, tell the person), without touching it.
   - `door.welded`: "The door is welded shut." reason `welded`.
   - `door.locked`: "The door is bolted." reason `bolted`.
   - `!door.hasPower()`: "The door has no power: its lights are out." reason `no_power`.
   - `!door.allowed(body)`: "Your ID does not open this door." reason `no_access`.
2. In `room_door_for`, among doors the body's ID opens, prefer one that has power and is neither bolted nor welded; fall back to a dead one only if there is no other. Mind the two early returns above the loop (a door named by label, and the door the person is standing at, `wanted_door`): those come back before any scoring. A dead door there should fall through to the loop only when the person is not standing at it, or they are let out by a door across the room they do not walk to.
3. In `cargo.ts`, on `no_power`, `bolted` or `welded`, remember that door as dead for a few minutes so a new ask does not send the technician to it again, say so to the person (aloud if in sight, by PDA otherwise), and tell its head. What comes next needs the owner:
   - Question for the owner: should cargo staff fetch a crowbar (a toolbox or emergency locker is on most maps) and pry a door with no power themselves, as a player would? Or should they send for engineering, whose `force_door` already pries a dead door? The first keeps the work in cargo; the second needs the engineering chain in GAP-19.
4. Keep `door.allowed(body)` as the access test. Leave the `autoclose` lines to the fix for KNB-04 and GAP-03, which rewrites the opening as a click; the order of tests above holds for that version too.

## How to test the fix

- Simulator: give the stand-in server's `open_door` the four refusals (SIM-04 notes it gives none of them today) and check that the technician stops after one and says why.
- In a round: cut power to the Cargo Bay's APC with a janitor shut inside, and check `game.log` and `pda.log` for one refusal with the reason, the janitor told why, and no second walk to the same dead door.

## Check

Checked by Opus 5.5, read from the code; not seen in a round.

- The quotes are what the code says today: both refusals in `hold_door_for` (`crew_npc_doors.dm:585` and `:593`), the access-only loop in `room_door_for` (about line 445), the `DOOR` plan in `cargo.ts` (`open_door` at line 981) and "Either way that request is dealt with" at `cargo.ts:1965`, which clears `doorAsked` and `knockAt` whatever `ok` was.
- `tool_open_door` (`crew_npc_doors.dm:492`) makes no test of power, bolts or a weld before it starts the errand, so the walk always happens. `finish_errand` (`crew_npc_hands.dm:347`) gives the window no details for this tool, so it cannot tell the causes apart even if the words differed.
- The base game: `airlock/close` returns FALSE without power at `DEFAULT_DOOR_CHECKS` (`airlock.dm:1407`), so an open door that loses power stays open, and the `!door.hasPower()` test comes before any look at `density`. Smaller fault 1 holds.
- Corrected one statement: the asking is not repeated for the rest of the round. `nextToWrite` in `driver.ts` writes once to whoever let it in, once to one keeper (`KEEPERS_WRITTEN_TO = 1`) and once to the head, `NOBODY_CAME_MS` (a minute) apart; then it stops. The fault is three or four wasted walks and a body left shut in with nobody told why, which is still medium.
- Not found as known or chosen: `LLM_CREW_PLAN_NO_CHEATS.md:83` lists `hold_door_for` only for opening the door by code; `LLM_CREW_PLAN_ROUND_0912.md:139` saw "The door will not open for you" in a round, for two technicians on one ask, not this.
- Effort raised to medium: the server part is small, but the reason has to be carried through `finish_errand` and acted on in `cargo.ts`. Added that step and the caution about `room_door_for`'s early returns to the fix.
