---
id: DESK-09
title: A janitor that put its mop and bucket down to scrub with a rag forgets where they are, and asks its head for something better than a rag
kind: bug
severity: medium
effort: medium
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
4. `unsearched`: the Custodial Closet is in `supplyPlacesSearched` if, at some earlier time, `supplyStep` ran while the janitor stood there short of a tool with no storage left to look in and nothing known to take: the closet had been emptied (by another janitor, say) before its own crate came. That set is never cleared, so the closet is not gone back to. If it took its first mop from the closet itself, `knownSupply` returned before line 325 and the closet was never marked: then it walks back via `unsearched`, sees the mop, and takes it up.
5. `needStep(brain, NEED_BETTER)`: it tells its head "I need something better than a rag to clean with for my work. Could you get it ordered, please?". `JANITOR.needs` says the same at the next staff meeting.

The head orders a second crate of janitorial supplies, while the janitor's own mop and bucket lie in the closet. With only a rag, the janitor then goes on with what a rag will shift.

If the closet is not in `supplyPlacesSearched`, it does walk back, sees the mop, and takes it up: so this needs the closet to have been found bare earlier in the round, hence `likely`. That is the usual state with more than one janitor, which is when crates of supplies get ordered at all.

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
4. Drop an entry when the janitor has stood in that room a few seconds without seeing the item (someone took it), or when it holds that item again. Without this it walks back for a mop that is gone, for good: `place.things` keeps items forever (`observe` in `memory.ts` only forgets messes), which is also why a plain "any room whose `things` has a mop" lookup, like the sink walk, is not enough on its own.
5. Make the same entry count in `JANITOR.needs` and in the SUPPLIES urgency in `syncTasks` (both test `knownSupply`): otherwise the staff meeting still hears "something better than a rag" while the mop waits in the closet.
6. Optionally, the same for the bucket via `wantsBucket`.

## How to test the fix

- Simulator: a janitor holding a mop and a bucket, with a rag stowed, called to a cobweb; the Custodial Closet already searched. After scrubbing it must go back to the closet and take up its mop, and send its head nothing.
- Type check from `tgui/`.
- Next round: grep `pda.log` for "something better than a rag" and check `game.log` for a put-down of a mop by that janitor shortly before.

## Check

Read `changeForScrubbing`, `scrubberToHand`, `knownSupply`, `supplyStep`, `syncTasks`, `afterActing` and `JANITOR.needs` in `jobs/janitor.ts`; `allKnownItems`, `observe` and `recordLocator` in `memory.ts`; the `suppliesSentAt` reset in `brain.ts:556-559`; `needStep` in `jobs/meetings.ts`; `tool_pick_up` and `free_a_hand` in `crew_npc_hands.dm`. Every quote matches.

The chain holds. With both hands full (mop and bucket), `changeForScrubbing` walks to the first known supply room, puts both down, and takes the rag out of its bag. In the closet just after, the mop is in view, but the CLEAN task (urgency asked) comes before SUPPLIES (held to routine while `scrubbing`), so it leaves. Once away, `allKnownItems` has only things in view and storage contents, so the mop on the closet floor is not known; nor does `tool_pick_up` look anywhere but view, its own bag and remembered containers. `suppliesSentAt` was cleared while it held a wet mop, and `locatorUsed` is set, so `supplyStep` falls to `unsearched`, and then to `needStep(NEED_BETTER)`.

The one step I found overstated was point 4: the closet is not marked searched "at the start of the round" in the usual case. It is marked only if `supplyStep` once ran there with nothing to take and no storage left. I corrected that in the body. When it is not marked, the janitor recovers by walking back. So the fault needs a closet that was bare earlier, which is the round where crates get ordered. Severity medium and `likely` stand. Not run; not seen in a round. Nothing in the change log fixes it: entry "(13)" says it "goes back for the mop afterwards", which is what does not happen in this case.

## Fix so far

Built on branch `m-janitor`, window only (type check, table `tools/llm_crew/janitor-putdown.ts`, simulator; not played). In `jobs/janitor.ts`: `afterActing` notes a `put_down` that went through for a CLEAN task with `wantsScrub`: the item and the room (`putDown`, a note kept beside the brain). In `supplyStep`, after `knownSupply` and before the PDA-supplies and locator steps, a proper tool on that note (`PROPER_SUPPLY`) in a room it is not in sends it back there ("You put your mop down in the X to scrub with soap or a rag. You are going back for it."); in the room the mop is in view and `knownSupply` picks it up. `JANITOR.needs` and the SUPPLIES urgency count the note too, so the staff meeting does not hear "something better than a rag" while the mop waits. The note goes once it holds the item again, or has stood in that room `LOOK_ABOUT_DS` without seeing it (someone took it). The bucket is noted the same way but only a proper tool is gone back for.

No change was needed in `crew_npc_hands.dm`: once back in the room the mop is in plain view for `tool_pick_up`.
