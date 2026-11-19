---
id: HAND-12
title: A search or a fetch opens a large wooden crate with no crowbar, looks inside and shuts it again, which no player can do
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_storage.dm:11, code/modules/llm_crew/crew_npc_storage.dm:115, code/modules/llm_crew/crew_npc_hands.dm:276, code/game/objects/structures/crates_lockers/crates/large.dm:27
fix: Leave crate/large out of storage_to_search and out of take_from_container until a crowbar step is built, the way body bags and cardboard boxes are left out
---

## What is wrong

See also: GAP-02, which names the large crate as an exception for its own fix (cargo opening an ordered crate) but not for the search and the fetch, which already do it today.

A large wooden crate (`/obj/structure/closet/crate/large`) does not open by hand. Its `attack_hand` only tears the manifest off and says "You need a crowbar to pry this open!"; any item but a crowbar is refused (`item_interaction`). With a crowbar, `crowbar_act` opens it, drops its wood and its contents, and deletes the crate: it is pried apart, not opened and shut.

`look_inside` and `take_from_container` open storage by calling `container.open(body)`. The base `open()` and `can_open()` know nothing of the crowbar: a large crate has no `before_open` or `can_open` of its own. So a body opens one bare-handed, sees what is in it, stands for 0.8 seconds, and shuts it again with `container.close(body)`, as if it were a locker. The crate is left whole, its contents known, its manifest torn off and shut inside it (`after_open` → `tear_manifest()`, then `take_contents`).

`storage_to_search` leaves out body bags, cardboard boxes, coffins and supply pods. It does not leave out large crates.

How a large crate gets aboard: no station map places one (`grep` of `_maps/map_files/*/*.dmm` finds none), and the crew cannot order one (`orderable_crates`, see GAP-02). So it takes a player ordering one of the 12 packs at a cargo console. Rare in the rounds played so far, but certain once it happens.

One concrete case. A player orders a pack that comes in a large crate (12 packs in `code/modules/cargo/packs/` use `crate_type = /obj/structure/closet/crate/large`). A technician unloads it into the bay. A janitor sent to explore comes into the Cargo Bay.

1. `walk_finished` for the explore: `storage_to_search(oview(...))` lists the large crate.
2. `look_inside`: `container.open(body)` succeeds. The contents spill; `inside` lists them.
3. `sleep(0.8 s)`, `container.close(body)`. The crate is shut again, whole.
4. The brain is told "You look inside the large crate in Cargo Bay: ...". It now knows, and remembers in `storage_memory`, what a sealed crate holds.

Later, `pick_up` of something it saw in there walks to the crate and opens it again by hand (`take_from_container`).

## Where

`code/modules/llm_crew/crew_npc_storage.dm:11`, `storage_to_search`:

    	var/static/list/ignored_types = typecacheof(list(
    		/obj/structure/closet/body_bag,
    		/obj/structure/closet/cardboard,
    		/obj/structure/closet/crate/coffin,
    		/obj/structure/closet/supplypod,
    	))

`code/modules/llm_crew/crew_npc_storage.dm:115`, `look_inside`:

    	if(!container.open(body))
    		return list("state" = "locked")

`code/modules/llm_crew/crew_npc_hands.dm:276`, `take_from_container`:

    	if(!was_open && !container.open(body))

Base, `code/game/objects/structures/crates_lockers/crates/large.dm:27`:

    /obj/structure/closet/crate/large/attack_hand(mob/user, list/modifiers)
    	add_fingerprint(user)
    	if(!tear_manifest(user))
    		to_chat(user, span_warning("You need a crowbar to pry this open!"))

## How it was found

Read from the code and the base crate code. Not seen in a round (none of the test rounds is known to have had a large crate in a room a body searched).

## How to fix it

1. Add `/obj/structure/closet/crate/large` to `ignored_types` in `storage_to_search`. A body does not look in a crate it cannot open.
2. In `tool_pick_up`, skip a remembered container that is a large crate (there should be none after step 1, but a memory from before the fix, or one written by another path, should not send it there).
3. Better, and the lasting fix: have both procs open storage by the click a player makes (HAND-06's `open_storage`), which refuses a large crate by itself because its `attack_hand` will not open it. Then step 1 is still wanted so the body does not walk up to it for nothing.
4. Prying one open with a crowbar is a separate step to build if the owner wants it (an engineer, or cargo with a crowbar from its locker). **Question for the owner:** should cargo or anyone else pry open large crates at all, given that it destroys them?

Keeps the rules: the body leaves alone what a player could not open.

## How to test the fix

- Server compile to a side copy.
- In a round: spawn a `/obj/structure/closet/crate/large` with something in it in a room and send a crew NPC to search there. `game.log` and the brain's storage sense must not show it looked inside.

## Check

Confirmed, by reading the code; nothing was run.

- The quotes match the code today: `storage_to_search` (`crew_npc_storage.dm:11`) leaves out body bags, cardboard boxes, coffins and supply pods only; `look_inside` calls `container.open(body)` (`:115`); `take_from_container` the same (`crew_npc_hands.dm:276`).
- Base `closet/open` (`closets.dm:538`) checks `can_open` (`:474`: welded, locked, the user's mobility, a strong pull, something large on top) and `before_open`, which returns TRUE. `crate/large` (`crates/large.dm`) overrides neither, and is not locked. So `open(body)` succeeds on one. What a player meets is `attack_hand` (manifest only, "You need a crowbar to pry this open!") and `item_interaction` (refuses everything); only `crowbar_act` opens it, and that deletes the crate. Calling `open()` straight is a way past the crowbar no player has: a no-cheats break, so high stands though it is rare.
- `crate/after_open` (`crates.dm:118`) calls `tear_manifest()`, which drops the manifest on the tile; `look_inside` then counts it among what was "inside", and `close` takes it back in. As written.
- `typecacheof` covers subtypes, so step 1 also covers `crate/large/hats` and the rest.
- Overlap: GAP-02, KNB-06 and SUP-09 name the large crate for cargo's unpacking of an ordered crate, a different path (`tip_out`). None covers the search and the fetch, so this is not a duplicate. HAND-06's `open_storage` (step 3) is still `found`, not built.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions large crates or a crowbar for crates.

Changes made: added how a large crate gets aboard (no map has one, the crew cannot order one), which bears on how often this comes up. The fix is right and small; step 1 alone ends it.
