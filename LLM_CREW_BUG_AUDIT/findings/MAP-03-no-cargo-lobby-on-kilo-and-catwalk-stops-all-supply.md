---
id: MAP-03
title: KiloStation and CatwalkStation have no Cargo Lobby, so no crate can be put out, asked for at the counter, collected or brought back
kind: gap
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/memory.ts:193, code/modules/llm_crew/crew_npc_held.dm:323, code/modules/llm_crew/crew_npc_cargo.dm:87, code/modules/llm_crew/crew_npc_cargo.dm:597, code/modules/llm_crew/crew_npc_freight.dm:61, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:173, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:940
fix: Have the server work out the counter room from the post (the room on the far side of the service window or desk nearest the post spot), send its name to the brain as the counter, and use that name everywhere the window says Cargo Lobby
---

## What is wrong

See also: HEAD-01, which names the Head of Personnel's half of this in passing.

The whole supply chain goes through one room found by its type and its name: `/area/station/cargo/lobby` on the server, the text `'Cargo Lobby'` in the window. Of the maps in `config/maps.txt`, KiloStation and CatwalkStation have no area of that type at all. (Counted with a script over each map's `.dmm`: MetaStation, DeltaStation, IceBox, Tramstation and NebulaStation have one; KiloStation's cargo is `cargo/office`, `cargo/storage`, `cargo/sorting`, `cargo/warehouse` and the mining rooms; CatwalkStation's is `cargo/storage`, `cargo/sorting`, `cargo/warehouse`, `cargo/miningoffice`.) And MAP-01 shows KiloStation is the map the next round lands on once a shuttle leaves.

On such a map, every step that needs the lobby fails, and none of them has another way:

1. **Nobody knows the counter.** `learn_starting_places` does `learn_place(/area/station/cargo/lobby)`, gets null, and tells no body "the way to the Cargo Lobby". `knowsPlace(brain, CARGO_LOBBY)` is false for everyone.
2. **The Head of Personnel cannot ask.** With no Quartermaster aboard, `requisitionStep` returns "You do not know the way to the cargo counter." (not ready) for ever. HEAD-01 says what that hold does to its meetings.
3. **A technician cannot put a crate out.** `haul_released` returns "You do not know where to put the crate out." because `learn_place` and `middle_of` both come back null for the lobby type. Every crate that comes in stays held in the bay.
4. **Nobody can collect.** `pickupStep` (`pickups.ts:173`) tells a janitor sent for a crate "You do not know the way" unless it knows `Cargo Lobby`.
5. **An emptied crate cannot be brought back** by anyone outside cargo: `haul_crate_back` takes it to `learn_place(/area/station/cargo/lobby)`, gets null, and answers "You do not know where to take the crate."
6. The PDA lines the Quartermaster and technicians send ("Send someone to the Cargo Lobby counter with the number", "Come by the counter in the Cargo Lobby") and the technician's job prompt ("Crew come to the Cargo Lobby, on the other side of the counter") name a room the station does not have.

Concrete case: KiloStation, the standing crew. A janitor says "I need something to clean with" at the first meeting. With the Quartermaster aboard, the order goes by PDA and is placed. The crate comes in. The technician sends "Your order has come in: crate #1 ... Send someone to the Cargo Lobby counter". The head sends a janitor. The janitor's step is "You do not know the way to the counter" and it does nothing. If it did get there, the technician's `release` would answer "You do not know where to put the crate out." No janitor is ever supplied.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:193`:

    export const CARGO_LOBBY = 'Cargo Lobby';

`code/modules/llm_crew/crew_npc_held.dm:323`, in `haul_released`:

    var/lobby = learn_place(/area/station/cargo/lobby)
    // The middle of the lobby, so the crate ends up well inside it, where whoever came for it can get at it.
    var/turf/destination = middle_of(/area/station/cargo/lobby)
    if(isnull(lobby) || isnull(destination))
    	return list(FALSE, "You do not know where to put the crate out.")

`code/modules/llm_crew/crew_npc_cargo.dm:597`, in `haul_crate_back`:

    place_name = learn_place(/area/station/cargo/lobby)
    destination = middle_of(/area/station/cargo/lobby)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:173`:

    if (brain.location !== CARGO_LOBBY) {
      return knowsPlace(brain, CARGO_LOBBY)

`code/modules/llm_crew/crew_npc_freight.dm:61` (the rooms cargo keeps tidy) and `crew_npc_cargo.dm:198` (where the post spot is chosen, "as near the Cargo Lobby as it can get") look for the same type, and fall back quietly.

## How it was found

Read from the code. The map data was counted with a throwaway script that reads each `.dmm` and lists the area types on each z level (`bun areas.ts <map>.dmm /area/station/cargo/lobby ...`): no `/area/station/cargo/lobby` tile in `KiloStation.dmm` or `CatwalkStation_2023.dmm`. Not seen in a round: no round has been played off MetaStation.

## How to fix it

1. Server: add `find_counter_room()` on the controller. From the post spot (`post_turf`), look at the service windows and tables within a few tiles (`/obj/machinery/door/window`, `/obj/structure/table` with a `/obj/machinery/door/window` or a `/obj/structure/desk_bell` beside it), and take the area on the far side that is not the post's area and is open to the crew (`!crew_npc_room_is_closed`). On MetaStation this must still give the Cargo Lobby. Fall back to `/area/station/cargo/lobby` if it exists, and last to the hallway outside the post's nearest public door.
2. Keep the answer as a type-free thing: the area itself and its name. Change `haul_released`, `haul_crate_back`, `freight_rooms` and `find_post_turf` to use it in place of the lobby type. `middle_of` takes a type; give it an area instead (it already loops areas).
3. Send its name to every body in the knowledge sense as `counter` (a non-cargo body needs it too: the server can work it out once for the station, from the main supply console's room, and cache it in a global).
4. Window: replace the constant `CARGO_LOBBY` with `counterOf(brain)`, read from that sense, everywhere it is used (`head.ts`, `janitor.ts`, `pickups.ts`) and in the wording of the PDA lines and the job prompt. If it is not known, say "the cargo counter" in words and let the step say so rather than stall.
5. Question for the owner: on a map where cargo has no counter room at all (crew walk into the office), should the crate be put out in the hallway outside the post's door? That is what a player technician would do.

## How to test the fix

- Server compile.
- Load KiloStation (an admin can set the next map) and check `game.log` for the knowledge sense of a janitor: it should name the room in front of the cargo counter. Run an order through to a collected crate.
- On MetaStation, check the name is still "Cargo Lobby" and the simulator scenarios that use it still pass.
