---
id: SIM-11
title: The stand-in's pick_up takes an item out of any closet the body has ever looked in, from wherever it stands, in two seconds and without moving
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:611, code/modules/llm_crew/crew_npc_hands.dm:9
fix: Make the stand-in's pick_up from a remembered box walk the body to that box's room first, through the same door and fire-door checks as go_to, and leave the body there
---

## What is wrong

The real `tool_pick_up` takes, in this order: something the body has stowed in its bag; the nearest thing of that name lying in view; otherwise the nearest container it remembers seeing one in, which it walks to as an errand (`start_errand(container, ...)`). That walk can be long, can meet a locked door or fire doors, and can find the thing gone.

The stand-in looks for the item in any box, in any room, that the body has ever opened, and if it finds one it takes the item out after two seconds where the body stands. The body does not move: `body.room` is unchanged, no door is checked, and nothing on the way can stop it. In effect the item is fetched across the station by nobody.

    const loose = room.items.indexOf(args.item);
    const box = Object.values(rooms).flatMap((r) => r.boxes).find((b) => b.openedBy.has(body.id) && b.contents.includes(args.item));
    ...
    return busy(body, 2, `going to get ${args.item}`, false, () => {
      ...
      else if (box?.contents.includes(args.item)) box.contents.splice(box.contents.indexOf(args.item), 1);
      ...
      body.holding.push(args.item);

In today's scenarios this rarely bites, because the mop and the spray lie loose in the Custodial Closet and what comes in a crate is tipped out loose (`collect_crate`). But any scenario that puts gear in a closet (the biohazard closet's gloves, the emergency closet's oxygen tank, a bucket put in a locker, the soap a fix for `DESK-03` would need) gets a janitor that fetches it from another room without going there, and then goes on as if it were still where it was. A window fault in getting there (the closet behind the cargo door, fire doors on the way) cannot show.

Two smaller differences in the same case:

- The stand-in matches the item by its exact name (`room.items.indexOf(args.item)`), where the server uses `name_matches` on lower-cased text: a window that asked for "Mop" would fail in the stand-in and work in the game, the reverse of the usual risk.
- The stand-in has no bag: "something stowed comes first" (the server's first rule, and `brain.stowed` in the window) never runs.

## Where

`tools/llm_crew/sim.ts:611`, the stand-in's `pick_up`, quoted above.

`code/modules/llm_crew/crew_npc_hands.dm:53`, the real one:

    // Otherwise, the nearest container the body remembers seeing one in.
    var/obj/structure/closet/nearest_container
    ...
    for(var/container_ref in storage_memory)

## How it was found

Read from the code. Not run: no scenario today has a needed item in a closet.

## How to fix it

1. In the stand-in's `pick_up`, when the item is only in a remembered box in another room, answer as `go_to` would for that room first (the same `shutDoor` and `fireStops` checks, the same failure words), then on arrival take it out of the box, and leave the body in that room.
2. Match names as the server does: lower case, trimmed, and the server's `name_matches` rule (read it in `crew_npc_hands.dm` and copy it).
3. Give each body a bag (`stowed: string[]`) that `put_down` with a `stow` flag and the server's own stowing put things in, and have `pick_up` take from it first; send it as the server sends what is stowed.

## How to test the fix

`quiet solo` and `quiet crew` still pass. A new short scenario with soap in the biohazard closet and a mess that wants scrubbing shows the janitor walk to the Custodial Closet for it.
