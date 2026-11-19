---
id: DESK-09
title: A janitor that put its mop and bucket down to scrub with a rag forgets where they are, and asks its head for something better than a rag
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:172, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:287, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:324, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:293, code/modules/llm_crew/crew_npc_hands.dm:37
fix: Remember the room it put its mop and bucket down in, and in supplyStep go back there for them before searching or asking its head
---

## What is wrong

Called to a mess that wants scrubbing (a cobweb, rubble) with a mop and a bucket in its hands, `changeForScrubbing` takes them to where the cleaning gear is kept, puts them down on the floor there, and takes up a rag or soap. The comment says it "goes back for the mop afterwards: with only a rag, it is short of something better".

It cannot find them again. What a janitor knows the whereabouts of is `allKnownItems`: things in view, and things in storage it has looked inside. A mop on the floor of a room it is not standing in is neither. The server's `tool_pick_up` works the same way (things in view, then remembered containers). `place.things` does keep items seen lying in a room, but nothing reads it for this.

So once the scrubbing is done, holding only a rag (`poorTool`), its SUPPLIES task runs `supplyStep`:

1. `knownSupply`: nothing, the mop is out of sight.
2. `suppliesSentAt`: null (cleared while it held the mop).
3. `mustFindSupplies`: FALSE, it used the locator at the start of the round.
4. `unsearched`: the Custodial Closet was put in `supplyPlacesSearched` at the start of the round, when it stood there with nothing left to look inside. That set is never cleared, so the closet is not gone back to.
5. `needStep(brain, NEED_BETTER)`: it tells its head "I need something better than a rag to clean with for my work. Could you get it ordered, please?". `JANITOR.needs` says the same at the next staff meeting.

The head orders a second crate of janitorial supplies, while the janitor's own mop and bucket lie in the closet. With only a rag, the janitor then goes on with what a rag will shift.

If the closet happens not to be in `supplyPlacesSearched`, it does walk back, sees the mop, and takes it up: so this is not certain every time, hence `likely`.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:172`, in `changeForScrubbing`:

    return {
      ready: true,
      step: `The mess in ${task.place}${toldBy} needs scrubbing with soap or a rag. You are putting your ${inTheWay[0]} down here${kept ? `, in the ${kept}, where it is kept` : ''}, to have a hand for your ${scrubber}.`,
      act: { tool: 'put_down', item: inTheWay[0] },
    };

`janitor.ts:287` and `janitor.ts:324`, in `supplyStep`:

    const supply = knownSupply(brain);
    ...
    // A supply room is done with once the NPC has stood in it with no storage left to look inside.
    if (brain.supplyPlaces.includes(brain.location) && brain.storageHere === 0) {
      brain.supplyPlacesSearched.add(brain.location);
    }

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:293`, `allKnownItems`: things in view, and storage contents only.

`code/modules/llm_crew/crew_npc_hands.dm:37`, `tool_pick_up`: something in plain view, then "the nearest container the body remembers seeing one in", else "You cannot see one, and you do not remember where one is kept."

## How it was found

Read from the code on both sides. Not seen in a round: `changeForScrubbing` is new and the log for it was not looked at.

## How to fix it

1. Add `putAway?: { item: string; place: string }[]` to the brain (types.ts, brain.ts start value `[]`).
2. In the janitor's `afterActing`, on a `put_down` that went through (`ok`) for a CLEAN task with `wantsScrub`, push `{ item: act.item, place: brain.location }`.
3. In `supplyStep`, after `knownSupply` and before the PDA-supplies and locator steps: if `putAway` holds a proper tool (`PROPER_SUPPLY`) and the janitor is not in that room, `go_to` that room ("You put your mop down in the Custodial Closet to scrub with your rag. You are going back for it."). Once in the room, the mop is in view and `knownSupply` picks it up.
4. Drop an entry when the janitor has stood in that room a few seconds without seeing the item (someone took it), or when it holds that item again.
5. Optionally, the same for the bucket via `wantsBucket`.

## How to test the fix

- Simulator: a janitor holding a mop and a bucket, with a rag stowed, called to a cobweb; the Custodial Closet already searched. After scrubbing it must go back to the closet and take up its mop, and send its head nothing.
- Type check from `tgui/`.
- Next round: grep `pda.log` for "something better than a rag" and check `game.log` for a put-down of a mop by that janitor shortly before.
