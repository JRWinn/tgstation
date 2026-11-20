---
id: CHEAT-05
title: Cargo staff know what is inside every shut crate, which is empty, which holds mail, and what aboard the shuttle bars it, without opening anything
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_freight.dm:116, code/modules/llm_crew/crew_npc_freight.dm:26, code/modules/llm_crew/crew_npc_freight.dm:260, code/modules/llm_crew/crew_npc_held.dm:63
fix: Know a crate's contents only from having opened it or seen it open, keep that on the controller, and treat a shut crate never looked into as full
---

## What is wrong

`crew_npc_crate_holds(crate)` lists what a crate holds. For a shut crate it reads the crate's own contents (`for(var/obj/item/thing in crate)`). Every test of a crate built on it, `crew_npc_crate_spent` ("is it empty?") and `crew_npc_crate_has_mail`, therefore sees through the lid. A player sees a shut crate as a shut crate; to know what is in it they open it (or read its manifest, which lists what was ordered, not what is left).

Where that knowledge is used:

- `freight_state` counts `to_unload` and `empties_aboard` by looking inside every shut crate aboard the shuttle, and marks each full one `crew_npc_came_by_shuttle`. It also reports `mail_crate` (a shut crate in the bay or lobby has mail in it) and `empty_crates` (shut crates that are empty). The brain picks its work from these numbers.
- `crate_to_unload` skips shut crates aboard that are empty: the technician never hauls an empty off, because it knows without opening it.
- `spent_crates` and `tool_recycle` put aboard only shut crates that are empty inside.
- `misplaced_crates` treats a shut empty crate in the lobby differently from a shut full one.
- `crew_npc_crate_lost` writes a held crate off as "it has been emptied" when someone has taken things out and shut it again, wherever the crate is.
- `what_bars_shuttle` walks `deck.get_all_contents()`, which goes into shut crates, and tells the body "it will not carry mail, and there is a letter in the Mail Crate aboard it". The console a player uses says only that something aboard is not allowed.

Concrete case: a player takes the mops out of a Janitorial Supplies crate in the bay and shuts it. Every cargo NPC at once counts it as an empty (`empty_crates` goes up by one), and the next `recycle` puts it aboard to be sold, with nobody having lifted the lid. The reverse case: a player hides something in a crate a player would take for empty. It is known to hold something, so it is never sent back. And if the thing is one the shuttle will not carry (a letter, a homing beacon, the disk: `GLOB.blacklisted_cargo_types` in `supply.dm`; a gun is not one), `what_bars_shuttle` names it and the crate it is shut in. The base game's console says only its fixed `safety_warning` list (`orderconsole.dm:17`), never what or where.

The plan's own words are "Opening a crate drops everything in it onto the crate's own tile" (`LLM_CREW_PLAN_NO_CHEATS.md`, section 3); nothing in the plans or the change log allows knowing contents without that.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:116`:

    /proc/crew_npc_crate_holds(obj/structure/closet/crate/crate)
    	var/list/held = list()
    	for(var/obj/item/thing in (crate.opened ? crate.drop_location() : crate))

`:26`, `what_bars_shuttle`:

    				for(var/atom/movable/passenger in deck.get_all_contents())
    ...
    					var/obj/structure/closet/crate/within = get(passenger, /obj/structure/closet/crate)
    					var/where = within ? "in the [format_text(within.name)] aboard it" : "lying on its deck"

`:267`, in `freight_state`:

    	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
    		if(crate.anchored)
    			continue
    		if(crew_npc_crate_spent(crate))
    			empties_aboard++
    			continue

`code/modules/llm_crew/crew_npc_held.dm:63`, in `crew_npc_crate_lost`:

    	if(isnull(entry.collected_by) && crew_npc_crate_spent(crate))
    		return "it has been emptied"

## How it was found

Read from the code. SUP-09 is about the same proc missing non-item contents; it takes the see-through reading as given. KNA-18 builds a fix on `what_bars_shuttle` naming the thing; that fix should be read together with this one.

## How to fix it

1. Give the controller a memory of crates: `crate_seen[REF(crate)] = list(world.time, empty, has_mail)`, written only when the body sees the crate open (in `look_around`, for an open crate in view: what lies on its tile) and when it opens one itself (`take_mail`, `look_inside`, the honest unpack of GAP-02).
2. Replace `crew_npc_crate_spent(crate)` and `crew_npc_crate_has_mail(crate)` in the controller's procs with `crate_known_empty(crate)` and `crate_known_mail(crate)`, which read that memory and answer "not known" for a shut crate never looked into.
3. Work the rules round "not known":
   - A crate that came in on the shuttle is full until opened (that is what a delivery is). `freight_state` counts every shut crate aboard as one to unload; empties aboard are only those seen open or seen being put aboard by cargo itself.
   - Mail: a crate named "mail crate" (by its name, which anyone can read) is the mail crate. Open it to find out what is in it, as `take_mail` already does.
   - To send a crate back, the body opens it first (a click) and closes it again. That is one more click per crate, which is what a player does. It is safe in the base game: `closet/open` drops what is inside onto the crate's tile and `closet/close` takes what lies on that tile back in (`take_contents`, closets.dm:521). Use the body's own open and close, as `look_inside` (crew_npc_storage.dm:99) already does, and record what it saw.
   - `crew_npc_crate_lost` "emptied": only if a cargo body saw it open and empty.
4. `what_bars_shuttle`: report only what is in view on the deck (loose, or lying by an open crate). For a shut crate say "something aboard is not allowed to travel", and let the technician open the crates aboard to look, one at a time (a step KNA-18 would add anyway).
5. Leave `crew_npc_crate_holds` as it is for code that already has the crate open.

Question for the owner: is reading the shipping manifest (what was ordered) enough to call a crate full when it comes in, as step 3 assumes? That is how a player would judge it.

## How to test the fix

- Server compile.
- Simulator: the freight numbers come from the sim's own server stand-in, so `sim.ts` must play "not known" for shut crates for the scenarios to mean anything. Run the cargo freight scenarios.
- A round: take the things out of a delivered crate by hand and shut it. A technician must open it before sending it back (`game.log` shows the open, then the recycle). Put a letter in a shut crate aboard and press send: the reason given must not name the letter until a technician has opened that crate.

## Check

Opus 5.5, 2026-11-19. Read `crew_npc_crate_holds`, `crew_npc_crate_spent`, `crew_npc_crate_has_mail`, `what_bars_shuttle`, `crate_to_unload`, `misplaced_crates`, `mail_crate`, `spent_crates` and `freight_state` (crew_npc_freight.dm:26-290), the `STOW` destination (:448), `crew_npc_crate_lost` (crew_npc_held.dm:50), and the base game's `check_blacklist` (shuttle/mobile_port/variants/supply.dm:85) and the cargo console's `send` (cargo/orderconsole.dm:383). Quotes match. For a shut crate `crew_npc_crate_holds` iterates `crate` itself, which is its contents; nothing in any caller asks whether the body has seen inside. The console a player uses gives only a fixed list of what may not travel. No change log entry or plan allows it (change log entry (24), line 367, made mail count as not empty but did not touch how it is seen). The senses rule in the README is broken. Confirmed. Kept severity medium, as for the other knowledge findings (CHEAT-03, CHEAT-11, CHEAT-13): nothing is done to the world outside the rules, the bodies know too much. Raised effort to large: a crate memory, every caller reworked round "not known", a new open-and-close step before recycling, the sim's stand-in, and an owner question. Corrected the reverse case: a gun does not bar the shuttle. Not seen in a round.
