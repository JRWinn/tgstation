---
id: DESK-10
title: With a mop in one hand and soap or a spray in the other, a janitor that knows of a bucket tries to pick it up before every mess elsewhere, fails, and never sets off
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:582, code/modules/llm_crew/crew_brain_link.dm:119, code/modules/llm_crew/crew_npc_hands.dm:15, code/modules/llm_crew/crew_npc_hands.dm:87, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:539
fix: Take the go-for-a-bucket step only when a hand is free or the other hand holds a rag, and after a failed try at the bucket stop offering it for that task
---

## What is wrong

See also: LOGA-05 (two rags in hand, so the mop is never taken up: the same `free_a_hand` finds nothing spare, with another pair of things and another fix).

Before setting off for a mess in another room, `plan` sends a janitor that holds a mop and no bucket to pick up a bucket it knows of (`brain.wantsBucket`). That step comes before the `go_to`, for every CLEAN task that is not in the room it stands in.

`wants_bucket` (server) is only "holds a mop and no bucket". It does not ask whether there is a hand for one. With the other hand holding soap or a full spray, `tool_pick_up` calls `free_a_hand`, which finds nothing spare (a mop, soap and a spray are all trade tools, and only a rag beside a mop counts as spare), and fails: "Your hands are full of things you need. Put something down first."

The driver backs that step off. The next plan for the same task is the same pick-up, so the task is skipped while backed off and tried and failed again after. The `go_to` the mess is never reached. Every CLEAN task elsewhere has the same first step, so the janitor cleans only what is in the room it stands in, and otherwise idles.

How it comes to hold a mop and soap: `changeForScrubbing`, called to a cobweb with a mop and a free hand, takes its soap out of its bag ("With a hand free it only has to take the rag up"). After the scrub it still holds both. The bucket it put down, or one in a locker it has looked in, is then "known".

Concrete case:

1. A janitor holds a wet mop; soap is in its bag; a bucket is in a locker it searched in the Custodial Closet.
2. Called to a cobweb in the Cargo Bay, it takes out the soap (one hand free), scrubs the cobweb.
3. It knows of oil in the Bar. `plan` for the Bar: no `bucketToFill`, no `mopNeedsWater` (soap is a proper tool), `wantsBucket` is TRUE and the bucket is in `allKnownItems`: "You have a mop and nothing to carry water in, and you know where there is a bucket." `pick_up bucket`.
4. Server: no empty hand, `free_a_hand` returns FALSE: fails. Backed off, tried again, fails again.
5. It never goes to the Bar.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:582`, in `plan`:

    if (brain.wantsBucket && task.place !== brain.location) {
      const bucket = allKnownItems(brain).find((item) => /^bucket$/i.test(item));
      if (bucket) {
        return {
          ready: true,
          step: `You have a mop and nothing to carry water in, and you know where there is a bucket. ...`,
          act: { tool: 'pick_up', item: bucket },
        };
      }
    }

`code/modules/llm_crew/crew_brain_link.dm:119`:

    "wants_bucket" = !isnull(locate(/obj/item/mop) in body.held_items) && isnull(npc.held_bucket()),

`code/modules/llm_crew/crew_npc_hands.dm:15`, in `tool_pick_up`:

    if(!length(body.get_empty_held_indexes()) && !free_a_hand())
        action_result(CREW_TOOL_PICK_UP, FALSE, "Your hands are full of things you need. Put something down first.")

`crew_npc_hands.dm:99`, the only spare a janitor's trade tools give up:

    // A rag is spare to someone who holds a mop: the hand is better used for a bucket of water.
    if(istype(held, /obj/item/rag) && (locate(/obj/item/mop) in body.held_items))
        spare ||= held

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:539`: a backed-off step makes the driver skip the task, it does not fall through to the task's next step.

## How it was found

Read from the code on both sides. How often a janitor ends up holding a mop and soap was not measured, hence `likely`. Not seen in a round.

## How to fix it

1. Server: make `wants_bucket` also require a hand for it: an empty hand, or a rag in the other hand (what `free_a_hand` would put away). A small helper next to `free_a_hand` can answer "could a hand be freed" without moving anything.
2. Window: as a second guard, in the janitor's `afterActing`, on a failed `pick_up` of a bucket, set `task.noBucket = true`, and skip the bucket step for that task while it is set.
3. Owner question, for later: with a mop and soap, should the janitor put the soap away in its bag to carry water? `free_a_hand` stows only what is not a trade tool. Leaving it as it is (no bucket) is the safe choice for now.

## How to test the fix

- Simulator: a janitor holding a mop and soap, a bucket in a remembered locker, a mess in another room. It must go to the mess.
- Server compile to a side copy.
- Next round: grep `game.log` for "Your hands are full of things you need" from a janitor, repeated.
