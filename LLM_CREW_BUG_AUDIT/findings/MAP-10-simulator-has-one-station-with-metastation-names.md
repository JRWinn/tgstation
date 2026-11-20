---
id: MAP-10
title: The simulator has one station, with MetaStation's room names written in, so nothing that depends on the map is ever tested and every map fault passes
kind: gap
severity: low
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:141, tools/llm_crew/sim.ts:173, tools/llm_crew/sim.ts:175
fix: Make the station in sim.ts a table chosen by name, add a second one with other names (no Cargo Lobby, no room called Brig, hallways not called Primary Hallway), and run the cargo and security scenarios on both
---

## What is wrong

`tools/llm_crew/sim.ts` plays the server for the real window code. Its station is one fixed object, `rooms`, whose keys are MetaStation's room names: `Cargo Lobby`, `Cargo Bay`, `Custodial Closet`, `Bar`, `Brig`, `Security Office`, `Central Primary Hallway` and so on. The window is given exactly those names (`memoryModule.setStationPlaces(Object.keys(rooms))`), and the simulator's own handlers use them too (`rooms['Cargo Lobby'].boxes` in the release and collect handlers, `cargoCrates`).

So the names the window code writes in (`CARGO_LOBBY = 'Cargo Lobby'` in `memory.ts`, `BRIG = 'Brig'` in `arrests.ts`, the `/primary hallway/i` patrol in `arrests.ts`, the `'Bar'` meeting fallback in `hierarchy.ts`) always match in the simulator. A scenario can never show what happens on a station where one of them is missing. MAP-03 (no Cargo Lobby on KiloStation and CatwalkStation) and KNA-07 (no "Primary Hallway" on a map that names its halls otherwise) are faults the simulator, as built, passes every time.

The plans and the change log say the simulator does not run server code. That is understood. This gap is about the window's own half: the part the simulator does run is only ever run on one map's names.

## Where

`tools/llm_crew/sim.ts:141`:

    const rooms: Record<string, Room> = {
      'Arrival Shuttle Hallway': { kind: 'hallway', ...
      'Central Primary Hallway': { kind: 'hallway', ...
      'Custodial Closet': { kind: 'room', ...
      Bar: { kind: 'room', ...
      'Cargo Lobby': { kind: 'room', ...

`tools/llm_crew/sim.ts:173` and `:175`:

    const cargoCrates = () => [...rooms['Cargo Bay'].boxes, ...rooms['Cargo Lobby'].boxes].filter((box) => box.crate);
    // Crew know their way around: the window is given the name of every room aboard.
    memoryModule.setStationPlaces(Object.keys(rooms));

## How it was found

Read from the code. Not run.

## How to fix it

1. Move `rooms` into a function that takes a station name and returns the table, with the room the simulator treats as the counter, the brig and the patrol halls given as fields rather than found by name in the handlers.
2. Add a second station: KiloStation's cargo names (Cargo Office, Cargo Bay, Delivery Office, no lobby), a brig named "Brig" but cells named "Cargo Cell" and "Cell 1" as on DeltaStation, and hallways with names that do not contain "Primary Hallway".
3. Read the station from an argument (`bun tools/llm_crew/sim.ts quiet <scenario> kilo`), with MetaStation the default so every run done today stays the same.
4. Once MAP-03's counter room exists on the server, have the simulator send it the same way the server will, so the window's use of it is tested.

## How to test the fix

Run the cargo, supplies and warrant scenarios with the second station. Today they should fail (that is the point); after MAP-03 and KNA-07 are fixed they should pass on both stations.
