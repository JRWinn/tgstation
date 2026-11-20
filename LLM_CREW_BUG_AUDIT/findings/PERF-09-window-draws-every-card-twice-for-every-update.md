---
id: PERF-09
title: The Crew Brain window draws every crew card twice for every update from the server, once before the brains have taken it in and once after, and nothing skips a card that has not changed
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/index.tsx:95, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:70, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:785, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:286
fix: Wrap NpcCard in React memo with a compare on the few fields it shows, and run ingest before render or skip the first draw of each update
---

## What is wrong

The window runs on the owner's own PC, the one that also runs the game and the model.

On each update from the server:

1. `useBackend` hands `CrewBrain` new `data`, and React draws the whole window: every `NpcCard` (eleven today, forty wanted), the locked-rooms list, and the details panel if one is open. The brains have not yet seen this data, so the cards show the old brain state against the new server state.
2. After that draw, the `useEffect` on `[data]` calls `ingest`. If anything changed (and on nearly every update something does: an ack is sent, a step is logged), `ingest` ends with `notify()`, which bumps the version that `useSyncExternalStore(subscribe, getVersion)` watches, and React draws the whole window again.

So two full draws per update. `notify()` is also called from `think`, `chooseJob` and `readOrder` when a model call starts and ends, each one more full draw. `NpcCard` is a plain function component with no `memo`, and each `npc` object from the server is new on every update, so no card is ever skipped, however little about it changed.

How much that costs was not measured: the brain code itself took 0.9 ms an update for 11 crew and 3.9 ms for 40 in a bun run (PERF-02), but drawing was not part of that. At forty crew and some 13 updates a second (PERF-02's estimate), it is about 26 full draws of 40 cards a second plus the model's own, every one on the same thread that runs `ingest` and the model calls' callbacks.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:69`:

    // Re-render whenever a brain changes state.
    useSyncExternalStore(subscribe, getVersion);

`index.tsx:95`:

    useEffect(() => {
      setStationPlaces(data.places ?? []);
      ingest(data.npcs ?? [], data.now);
    }, [data]);

`brain.ts:785`, the end of `ingest`:

    if (changed) {
      notify();
      pump();
    }

`index.tsx:286`: `const NpcCard = (props: { ... }) => { ... }`, with no `memo`, given `npc={npc}` straight from `data.npcs`.

## How it was found

Read from the code. The draw time was not measured: there is no profiler output from a played round, and the throwaway bun script used for PERF-02 runs the brain code without React. That is why this is `likely`, and why it is low.

## How to fix it

1. Make `NpcCard` a `memo` component with a compare function over what it shows: `npc.name`, `npc.job`, `npc.location`, `npc.doing`, `npc.resting`, `npc.awake`, the inventory (compare `JSON.stringify(npc.inventory)` or a key built from name, count and where), `card_color`, `detailsOpen`, and from the brain `status`, `lastRoutine?.text`, `lastSaid?.text`, `lastJob?.what`, `choice?.why`, `card.label`. Pass those brain fields as props rather than the whole `brain` object, which is the same object each time and mutated in place, so a memo on it would never see a change.
2. Either take the first draw away (keep the last `data` that `ingest` has seen in a ref, and render the cards from that, so the draw before `ingest` shows nothing new and memo skips it), or move the `ingest` call out of the effect into the backend subscription so it runs before React draws.
3. With PERF-02's step 1 (one update a tick), the number of draws falls as well.

## How to test the fix

- Type check and lint.
- In the game, with the React profiler (the tgui dev server, on a test server with no round that matters: a rebuilt bundle reloads the window and wipes every brain), open the Crew Brain window with the standing crew and record ten seconds: before, every card renders on every commit; after, only those whose fields changed.
- The simulator does not draw the window.
