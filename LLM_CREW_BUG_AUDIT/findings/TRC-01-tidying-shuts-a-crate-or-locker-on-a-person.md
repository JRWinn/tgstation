---
id: TRC-01
title: Tidying shuts an open crate on a person lying on its tile, or a locker on a person standing in it, and shuts them inside
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_tidying.dm:68, code/modules/llm_crew/crew_npc_tidying.dm:212, code/modules/llm_crew/crew_npc_freight.dm:458, code/game/objects/structures/crates_lockers/closets.dm:493, code/game/objects/structures/crates_lockers/closets.dm:575
fix: Add a helper that finds any living mob bigger than tiny on a tile, the body itself included, and call it in wants_shutting, in tidy_step before close, and before every other close() our code makes
---

## What is wrong

Anyone with a work area (cargo technicians today: the post and the Cargo Lobby) tidies by shutting any open crate or locker that has an item lying on its tile. The game's `close()` takes in everything on the tile it is allowed to, people included. Nothing in our code looks for a person on that tile first. So a tidying body shuts people inside crates and lockers.

- A crate (`horizontal = TRUE`) refuses to close on a person standing up, because a standing person is dense. A person lying down is not dense (`on_lying_down` adds `TRAIT_UNDENSE`), so the crate closes and takes them in.
- A locker (`horizontal = FALSE`) closes on anyone on its tile, standing or lying, up to three of them.

The same act that makes the tile want shutting puts the person there: someone knocked down drops what they hold onto the tile they fall on. An item on the tile is all `wants_shutting` asks for.

Concrete case. The Cargo Bay floor has open crates in most rounds: crates unpacked and left open, the Quartermaster's own crate (SUP-10). Pun Pun knocks a janitor down next to the bay's crate squares (the change log tells of it beating three janitors and the officer unconscious in one round). The janitor falls on the tile of an open crate and its mop and bucket fall with it.

1. `tidy_state` counts the crate: `wants_shutting` is TRUE, `container.opened` and `locate(/obj/item) in container.loc`.
2. The brain's `planTidying` sends `tidy`. `next_to_tidy` picks the crate as the nearest thing, with no place to take it to.
3. The body walks over. `tidy_step` calls `container.close(body)`.
4. `can_close` passes (the janitor is lying, so not dense). `take_contents` calls `insert`, `insertion_allowed` passes (`horizontal && L.density` is FALSE, `mob_size` is human, under `max_mob_size`), and the janitor is moved into the crate with the mop and bucket.
5. The brain is told "You shut the crate in Cargo Bay, with what had spilled out of it back inside." The technician says nothing of a person, because it was not told of one.

The janitor is now in a shut crate in the bay. A crew body inside a closet sees nothing (`look_around` with `!isturf(body.loc)`) and has no step to get out (HOLE-11). A player in the same place has to resist out. If the Captain or a head was the one lying there, our own body has laid hands on them, which the rules forbid. And a crate holding a person counts as empty to cargo's item-only checks (`SUP-09`: only small items count as what a crate holds), so it can be picked as an empty to haul back aboard the shuttle.

## Where

`code/modules/llm_crew/crew_npc_tidying.dm:68`, in `wants_shutting`:

    /datum/ai_controller/crew_npc/proc/wants_shutting(obj/structure/closet/container)
    	if(!container.opened || !isturf(container.loc))
    		return FALSE
    	var/skipped_at = tidy_skipped[REF(container)]
    	if(skipped_at && world.time - skipped_at < CREW_NPC_TIDY_GIVE_UP)
    		return FALSE
    	return !isnull(locate(/obj/item) in container.loc)

`code/modules/llm_crew/crew_npc_tidying.dm:209`, in `tidy_step`:

    	if(istype(target, /obj/structure/closet))
    		var/obj/structure/closet/container = target
    		var/container_name = format_text(container.name)
    		if(container.opened && !container.close(body))

The base game, `code/game/objects/structures/crates_lockers/closets.dm:493`, `can_close`, stops a crate only for a dense mob:

    	for(var/mob/living/L in T)
    		if(L.anchored || horizontal && L.mob_size > MOB_SIZE_TINY && L.density)

and `insertion_allowed` (line 575) lets a mob in unless it is anchored, buckled, too big, or (for a crate) dense:

    		if(L.mob_size > MOB_SIZE_TINY) // Tiny mobs are treated as items.
    			if(horizontal && L.density)
    				return FALSE

`code/modules/mob/living/living.dm:742`, `on_lying_down` adds `TRAIT_UNDENSE`.

## How it was found

Read from the code, our side and the base closet code. Not seen in a round. I did not check that MetaStation's cargo post or lobby has a locker in it (a scan of the map's keys found lockers only in the Mining Office and the supply security checkpoint), so on MetaStation the likely case is the crate and a person lying down. On other maps, and wherever a locker stands in a work area, the standing case applies too.

## How to fix it

1. Add a helper, say `/proc/crew_npc_someone_on(turf/spot)`, that returns TRUE if any `/mob/living` on the tile has `mob_size > MOB_SIZE_TINY` (tiny ones go in as items, which is how the game treats them).
2. In `wants_shutting`, return FALSE when `crew_npc_someone_on(container.loc)`. The crate is then neither counted nor chosen while someone is on it.
3. In `tidy_step`, check again just before `container.close(body)`: someone may have fallen or stepped there during the walk. If so, return `list(FALSE, "Someone is in the way of the [container_name].")` and note `tidy_skipped[REF(container)]` so it is left a while.
4. Keep the rest: an open crate with only things on its tile is still shut.
5. While there, the same check belongs anywhere else our code calls `close()` on a container a person may be on: `take_from_container` and `look_inside` in `crew_npc_storage.dm` shut what they opened. A body that opened a locker a person then stepped into would shut them in the same way.

## How to test the fix

- Compile with the side compile in the README.
- In a round: open a crate in the Cargo Bay, drop an item on its tile, lie down on it (rest), and wait for a technician to tidy. The crate should stay open and `game.log` should show no "You shut the ... with what had spilled out" line for it. Stand up and step off: the next tidy shuts it.
- Grep `game.log` for `shut the` near any crew body's name and check the crate's tile had nobody on it.
