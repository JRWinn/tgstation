---
id: DOOR-10
title: Our plastic flaps rule refuses a route to a mob lying down, riding a mulebot or phasing, all of which the flaps let through
kind: bug
severity: low
effort: small
confidence: sure
status: found
area: doors
files: code/game/objects/structures/plasticflaps.dm:196, code/game/objects/structures/plasticflaps.dm:229, code/__HELPERS/paths/path.dm:279
fix: Let the route through when the one asking is lying down or buckled to a mulebot, read from the pass info, and say in the comment what the rule cannot know
---

## What is wrong

We added a rule to `/obj/structure/plasticflaps/CanAStarPass`, which every pathfinder in the game uses: anything living that is not tiny, cannot ventcrawl and has no `PASSFLAPS` gets no route through flaps. The comment says "Anything living that is on its feet and not tiny is turned back by the flaps: see CanAllowThrough()".

The rule is right for the case it was written for (a standing crew body), and it was checked here against `CanAllowThrough` case by case:

| Who | `CanAllowThrough` (what really happens) | Our `CanAStarPass` | Same? |
| --- | --- | --- | --- |
| Standing human or other mob, not tiny | turned back | no route | yes |
| The same, pulling a crate | turned back | no route | yes |
| Tiny mob (mouse) | passes | route | yes |
| Bot, mulebot (`is_bot`) | passes (they have `PASSFLAPS`) | route (base line, before ours) | yes |
| Anything with `PASSFLAPS` | passes | route | yes |
| Kitchen flaps (`require_resting = FALSE`) | passes | route | yes |
| **Mob lying down, not tiny** | **passes** (crawling under) | **no route** | **no** |
| **Mob buckled to a mulebot** | **passes** ("mulebot passenger gets a free pass") | **no route** | **no** |
| **Mob that is phasing or incorporeal** | passes (`CanPass` lets `PHASING` through before `CanAllowThrough`) | **no route** | **no** |
| Ventcrawler that is not tiny (a monkey) | passes | no route | no, but that is the base game's line above ours, not our edit |

The pass info (`/datum/can_pass_info`) has no field for whether the mob is standing, so the rule cannot tell "on its feet" from "lying down" and turns both back. Before our edit all three of the bold cases got a route (by falling through to `return TRUE`), which was right for them and wrong for a standing mob.

How much it matters: little. A mob that plans a route while lying down is rare (a crawling mob with an AI controller), a mulebot's passenger does not plan routes of its own, and a phasing mob with an AI controller is rarer still. No crew body is affected: a crew body that cannot stand does not walk. It is written up because the proc is shared by the whole game and the comment claims more than the code knows.

One concrete case: a basic mob or monkey-like carbon with an AI controller that has been knocked down and is crawling for a target on the far side of flaps. `CanAllowThrough` would let it under. With our rule `get_path_to` gives it no route, and it stays where it is.

## Where

`code/game/objects/structures/plasticflaps.dm:188` (lines 196 to 199 are ours):

    /obj/structure/plasticflaps/CanAStarPass(to_dir, datum/can_pass_info/pass_info)
    	if(!require_resting)
    		return TRUE
    	if(pass_info.is_living)
    		if(pass_info.is_bot)
    			return TRUE
    		if(pass_info.can_ventcrawl && pass_info.mob_size != MOB_SIZE_TINY)
    			return FALSE
    		// Anything living that is on its feet and not tiny is turned back by the flaps: see CanAllowThrough().
    		// A route planned through them is one the body can never walk, and it walks at them until it gives up.
    		if(pass_info.mob_size != MOB_SIZE_TINY && !pass_info.can_ventcrawl && !(pass_info.pass_flags & PASSFLAPS))
    			return FALSE

`code/game/objects/structures/plasticflaps.dm:229`, `CanAllowThrough`:

    	else if(isliving(mover)) // You Shall Not Pass!
    		var/mob/living/living_mover = mover
    		if(istype(living_mover.buckled, /mob/living/basic/bot/mulebot)) // mulebot passenger gets a free pass.
    			return TRUE

    		if(living_mover.body_position == STANDING_UP && living_mover.mob_size != MOB_SIZE_TINY && !(HAS_TRAIT(living_mover, TRAIT_VENTCRAWLER_ALWAYS) || HAS_TRAIT(living_mover, TRAIT_VENTCRAWLER_NUDE)))
    			return FALSE //If you're not laying down, or a small creature, or a ventcrawler, then no pass.

`code/game/turfs/turf.dm:1053`, why the edit takes effect with the new navmap planner: flaps have `can_astar_pass = CANASTARPASS_ALWAYS_PROC`, so `nav_classify_atom` keeps them as a live blocker and calls `CanAStarPass` with the real mover's pass info, not with the baked ground mover. That was checked, and the edit does work for crew walks.

## How it was found

Read from the code: the two procs side by side, the fields of `/datum/can_pass_info`, and how the navmap bake treats flaps. Not seen in a round.

## How to fix it

Inside our added `if`, before `return FALSE`, let these through:

1. Buckled to a mulebot: `pass_info.buckled_info?.is_bot`.
2. Phasing or incorporeal: `(pass_info.movement_type & PHASING) || pass_info.incorporeal_move`.
3. Lying down. The pass info does not carry it. Two ways:
   - read it from the mob: `var/mob/living/asker = pass_info.requester_ref?.resolve()`, and pass if `istype(asker) && asker.body_position == LYING_DOWN`. The datum's own comment says `requester_ref` should almost never be used, but it is there for exactly "proc chains that require a movable", and this keeps the edit inside the one file we already changed.
   - or add a `body_position` field to `/datum/can_pass_info` and fill it in `New`. Cleaner, but it is one more base-game file edited, and the field takes part in `compare_against`, so cached path maps would no longer be shared between a standing and a lying mob (which is correct).
   Take the first.
4. Reword the comment to say what is tested: "living, not tiny, not a ventcrawler, no PASSFLAPS, and not lying down, riding a mulebot or phasing".

Do not touch the base line about ventcrawlers above ours: it is the base game's, wrong or not.

## How to test the fix

- Server compile.
- In a round: a crew body told to go somewhere whose short way is through the mail room's flaps must still go round (grep `game.log` for `walk failed` near the Delivery Office: there should be none caused by flaps). A mulebot sent through its usual flaps must still deliver.
