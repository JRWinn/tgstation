---
id: HAND-06
title: Searching and fetching call any locker that will not open locked, welded or blocked alike, and never unlock one the body's own card opens
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_storage.dm:115, code/modules/llm_crew/crew_npc_hands.dm:276, code/game/objects/structures/crates_lockers/closets.dm:474, code/game/objects/structures/crates_lockers/closets.dm:1034
fix: Open storage with the click a player makes, so a locker its card opens is unlocked first, and report welded, blocked and locked apart
---

## What is wrong

`look_inside` (a search) and `take_from_container` (a fetch) open a container by calling `container.open(body)`. If that returns FALSE the brain is told the container is locked. Two things are wrong with that.

**1. The body never unlocks a locker its own card opens.** A player who clicks a locked secure locker they have access to unlocks it (`/obj/structure/closet/attack_hand`: `toggle` fails, then `togglelock(user)`, which checks `allowed(user)` against the ID they wear), and the next click opens it. `open()` skips that: it only tests `locked`. So the Chief Engineer exploring Engineering, the Quartermaster in its own office, an officer searching the security lockers, each finds its own department's lockers "locked" and remembers them so. The security officer's kit code already does this right, by two clicks (`click_as_body(locker)` in `crew_npc_security.dm`, "a locked locker is unlocked by one click and opened by the next"); the search and the fetch do not.

**2. "Locked" is said whatever stopped it.** `can_open` refuses for a locker that is welded, for a body without `MOBILITY_USE` (knocked down in that moment), for a crate with a person standing on it ("There's something large on top"), for a strong grip on it, and a `COMSIG_CLOSET_PRE_OPEN` handler can refuse for its own reasons. All of them come back as `"locked"`, the window marks the container `locked`, and the prompt's list of places says "locked" for a crate that someone was standing on for a moment. `storage_checked_at` is set, so it is not looked at again for five minutes.

One concrete case. A Chief Engineer is sent to explore and comes into its own office. `storage_to_search` lists the Chief Engineer's locker (`/obj/structure/closet/secure_closet/engineering_chief`, locked, `req_access` the CE's own). `look_inside` → `open(body)` → `can_open` → `locked` → FALSE. The brain is told "The Chief Engineer's locker in Chief Engineer's Office is locked." and its memory of its own office says so. A CE player would have had it open in two clicks.

## Where

`code/modules/llm_crew/crew_npc_storage.dm:115`, `look_inside`:

    	if(!container.open(body))
    		return list("state" = "locked")

`code/modules/llm_crew/crew_npc_hands.dm:275`, `take_from_container`:

    	if(!was_open && !container.open(body))
    		storage_checked_at[REF(container)] = world.time
    		report_storage(container, "locked", null)
    		return list(FALSE, "The [container_name] is locked.")

Base, `code/game/objects/structures/crates_lockers/closets.dm:474`, `can_open`:

    	if(welded || locked)
    		return FALSE
    	if(isliving(user))
    		if(!(user.mobility_flags & MOBILITY_USE))
    			return FALSE
    	...
    	for(var/mob/living/L in T)
    		if(L.anchored || horizontal && L.mob_size > MOB_SIZE_TINY && L.density)

Base, `closets.dm:1034`, what a player's click does:

    	if(toggle(user))
    		return TRUE

    	if(!opened)
    		return togglelock(user)

## How it was found

Read from the code and the base closet code. Not seen in a round. KNA-04 item 5 already notes that `open()` and `close()` are called directly in place of a click; this finding is about what that loses and what is said about it.

## How to fix it

1. Write one helper on the controller, `open_storage(container)`, used by both `look_inside` and `take_from_container`. It makes the clicks a player makes: `empty_clicking_hand()`, then `click_as_body(container)`. If the container is still shut and `locked` has gone from TRUE to FALSE, the first click unlocked it: click once more to open. Return a reason when it ends shut.
2. Reasons, from what the body could see: `container.welded` → "welded shut"; `container.locked` → "locked"; a living mob on its tile → "someone is standing on it"; anything else → "it will not open".
3. Send the reason to the brain as the state (`"welded"`, `"locked"`, `"blocked"`, `"stuck"`) and in the words. In `memory.ts` `recordStorage`, treat only `"locked"` and `"welded"` as lasting; a `"blocked"` one is just not looked into this time.
4. Only set `storage_checked_at` for a lasting reason, so a crate somebody stood on is tried again on the next search.
5. When the body unlocked a locker to look in it, lock it again after shutting it (one more click), as a player who is tidy would; or leave it, if the owner prefers. **Question for the owner:** should a body that unlocked a locker to look in it lock it again?

Keeps the rules: the body does only what a player's clicks do, and its card is the one it wears.

## How to test the fix

- Server compile to a side copy.
- In a round: send a Chief Engineer (or the Quartermaster) to search its own office. `game.log` must show the locker unlocked and looked into, and the brain's sense event must list what is inside. Weld a locker and search it: the brain must be told it is welded, not locked.
