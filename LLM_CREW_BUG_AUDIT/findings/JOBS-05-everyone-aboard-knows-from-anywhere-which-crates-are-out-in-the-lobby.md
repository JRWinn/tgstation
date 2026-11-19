---
id: JOBS-05
title: Every body aboard is told from anywhere which crates cargo has put out in the lobby and who took them, and a collector sets off for its crate before it has seen it
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_held.dm:156, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:101, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:166, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:122
fix: Only act on a crate being out when the body is in the room the crate is in (brain.location equals the crate's place), and on the server send out crates to non-cargo bodies only when they are in that room
---

## What is wrong

See also: CHEAT-06. That finding covers cargo staff being sent the held crates wherever they stand. This is the other half: `held_state` sends the crates that are **out** to every body on the station, cargo or not, wherever it is, and the window's crate errand acts on it.

`held_state` skips a held crate for a non-cargo body only while it is not out (`if(!cargo && !entry.out) continue`). Once cargo has put a crate out in the lobby, every janitor, engineer, officer and head is sent its number, who it is for, what it is, the room it is in, and who has taken it (`taken_by`), on every update, from anywhere aboard. Nothing in the body saw it.

`pickups.ts` goes by that list alone:

- `planPickups` checks `crateOf(brain, task)?.out` **before** it looks at where the body is. A collector still walking to the lobby, or blocked in its own room waiting to try the counter again, switches to `collect_crate` the moment the crate is put out, and walks straight to it.
- `syncPickups` ends the errand as soon as `crate.takenBy` names someone else, wherever the collector is.

The senses rule ("A crew member knows what its own body could see, hear or be sent") is broken, and it changes what the body does: it acts on a crate it has not seen.

One concrete case: the Head of Personnel sends Jan and, five minutes later because Jan has not come, Mo for crate #12 (`sendFor` sends the next in turn when cargo says the crate is still waiting). Jan had stood at an empty counter and is back in the Custodial Closet waiting out `TRY_AGAIN_DS`. A technician brings #12 out for Mo. At that moment Jan's task is still blocked, but as soon as `retryAt` passes, `planPickups` sees the crate is out and sends Jan from the Custodial Closet straight to the crate in the lobby, with no counter visit and nobody having told it. Jan and Mo both make for the same crate.

## Where

`code/modules/llm_crew/crew_npc_held.dm:156`, in `held_state`:

    for(var/datum/crew_npc_held_crate/entry as anything in crew_npc_held_crates())
        if(!cargo && !entry.out)
            continue
        held += list(list(
            "number" = entry.number,
            "for" = entry.for_name,
            "what" = entry.what,
            "place" = get_area_name(entry.crate_ref.resolve(), TRUE),
            "out" = entry.out,
            "taken_by" = entry.collected_by,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:165`, in `planPickups`, before any check of where the body is:

    // Cargo has put it out in the lobby: it is there for the taking.
    if (crateOf(brain, task)?.out) {
      return {
        ready: true,
        ...
        act: { tool: 'collect_crate', number: Number(number), place: room },
      };
    }
    if (brain.location !== CARGO_LOBBY) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:122`, in `syncPickups`:

    const crate = crateOf(brain, task);
    if (crate?.takenBy && crate.takenBy !== brain.name) {

## How it was found

Read from the code: `held_state` and `ui_data` on the server, `ingest` in `brain.ts` (where `heldCrates` is filled for every body), and every reader of `heldCrates` outside `cargo.ts` (only `pickups.ts`). Not seen in a round.

## How to fix it

1. Window, `pickups.ts`: in `planPickups`, take the crate as there for the taking only if the body is in the room it is in: `const crate = crateOf(brain, task); if (crate?.out && crate.place === brain.location) { ... }`. A collector elsewhere goes on to the lobby as before, and there it sees the crate.
2. Window, `syncPickups`: end the errand on `takenBy` only when the body is in that room too, or when cargo has said so at the counter (cargo.ts already says "Bob has taken crate 12 already" to a collector who asks).
3. Server, `held_state`: for a body that does not work in cargo, send an out crate only when the body is in the crate's area or can see it (`can_see(pawn, crate)` or `get_area(pawn) == get_area(crate)`). Leave `for` and `what` out for non-cargo bodies: nothing in `pickups.ts` reads them.
4. Keep cargo's own half to CHEAT-06.

## How to test the fix

- Simulator: the `pickup` scenarios must still pass. Add one where the crate is put out while the collector is still walking to the lobby: the collector must arrive in the lobby before `collect_crate` is sent.
- Type check and compile. In a round, the `collect_crate` line for a collector in `game.log` should always come after its arrival in the Cargo Lobby.
