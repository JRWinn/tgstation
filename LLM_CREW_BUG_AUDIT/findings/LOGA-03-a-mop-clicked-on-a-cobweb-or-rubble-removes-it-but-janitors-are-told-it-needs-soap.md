---
id: LOGA-03
title: A mop clicked on a cobweb or rubble takes it up, but the body only ever mops the floor under it, so every cobweb and pile of rubble is called beyond the mop and starts a round-long soap-or-rag loop
kind: bug
severity: high
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: logs
files: code/modules/llm_crew/crew_npc_cleaning.dm:513, code/modules/llm_crew/crew_npc_cleaning.dm:191, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:112
fix: For a mop, click the mess itself when it is not is_mopped, judge a mop by its cleaner strength in can_clean_mess, and count a held mop as able to scrub in janitor.ts
---

## What is wrong

See also: JAN-02, which has the mop's strength right for decomposing garbage and gooey grey mass but says "the cobweb and rubble cases stay as they are: both are `is_mopped = FALSE`". That is true only of mopping the floor. A player who clicks a cobweb or a pile of rubble **itself** with a wet mop takes it up.

`is_mopped = FALSE` means only that the decal does not get `TRAIT_MOPABLE`, so washing the **floor** under it (`/turf/wash`) passes it over. It does not stop the mop working on the decal when the decal is what is clicked. The mop's `cleaner` component listens for `COMSIG_ITEM_INTERACTING_WITH_ATOM` on any atom, scrubs the thing clicked for three seconds, then calls `target.wash(CLEAN_SCRUB)`. A cobweb and rubble are `CLEAN_TYPE_HARD_DECAL`, which `CLEAN_SCRUB` includes, so `/obj/effect/decal/cleanable/wash` deletes them.

The body never does that. `clean_mess` clicks the floor whenever it holds a mop, `can_clean_mess` rules out every `is_mopped = FALSE` mess for a mop, and the window's `SCRUB_KINDS` names cobweb and rubble as wanting soap or a rag. So every cobweb and every pile of rubble is written off by a janitor with a mop and passed to the next janitor as needing soap or a rag. Most janitors carry a mop, a spray, or nothing that scrubs, so the mess is never cleaned, and cargo and the janitors trade PDA messages about it for the rest of the round (DESK-12, KNA-17 for the cargo side of that loop).

Concrete case, `data/logs/2026/11/19/round-19.33.50`, `pda.log`:

- 01:41:15, Reuben (mop): "I have done what I can in the Cargo Bay. What is left (cobweb) needs scrubbing with soap or a rag."
- 01:44:18, Reuben: the same for the Bitrunning Den (cobweb). 01:45:58, Reuben: the same for the Mining Office (rubble).
- 01:41:15, 01:44:31, 01:45:24, 01:45:27, 01:46:06, 01:57:54, 01:58:02, 01:58:05, 01:58:08: cargo technicians send the two janitors nine calls about these same three messes, to the end of the log.
- 01:44:47, 01:45:27, 01:45:51, 01:46:15, 01:57:54, 01:58:02: "I have no soap or rag, so I cannot shift the mess in the ...".

The same in the other two rounds: `round-20.00.21` 02:13:48, Marina: "What is left (rubble) needs scrubbing with soap or a rag." `round-20.43.32` 02:49:09, Abel: "I have no soap or rag, so I cannot shift the mess in the Cargo Bay."

The Cargo Bay cobweb, the Bitrunning Den cobweb and the Mining Office rubble were still on the cargo technicians' lists at 01:58 in the 19:33 round, twenty minutes after they were first called in.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:511`, in `clean_mess`:

    	// A mop works on the floor under the mess; soap and spray work on the mess itself.
    	var/atom/target = istype(tool, /obj/item/mop) ? get_turf(mess) : mess
    	body.ClickOn(target)

`code/modules/llm_crew/crew_npc_cleaning.dm:191`, in `can_clean_mess`:

    	if(istype(tool, /obj/item/mop))
    		return washes_off && mess.is_mopped

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:112`:

    const SCRUB_KINDS = /^(cobweb|rubble|decomposing garbage|gooey grey mass)$/i;

The base game, `code/game/objects/effects/decals/cleanable/mess.dm:156` and `:381`:

    /obj/effect/decal/cleanable/cobweb
    	...
    	clean_type = CLEAN_TYPE_HARD_DECAL
    	is_mopped = FALSE

    /obj/effect/decal/cleanable/rubble
    	...
    	clean_type = CLEAN_TYPE_HARD_DECAL
    	is_mopped = FALSE

`code/game/objects/effects/decals/cleanable.dm:16`, what `is_mopped` is for:

    	/// If TRUE, gains TRAIT_MOPABLE on init - thus this cleanable will cleaned if its turf is cleaned

`code/game/atom/atom_tool_acts.dm:29`, any item clicked on any atom sends the signal the mop's cleaner listens for:

    		|| SEND_SIGNAL(tool, COMSIG_ITEM_INTERACTING_WITH_ATOM, user, src, modifiers) \

`code/datums/components/cleaner.dm:135`, what it does to the thing clicked once the scrub is done (`cleaning_strength` defaults to `CLEAN_SCRUB`, and the mop's `should_clean` allows the wash when the mop holds water, which is `REAGENT_CLEANS`):

    		if(call_wash && target.wash(cleaning_strength) && grant_xp)

## How it was found

Seen in round logs (the PDA lines above), then traced in the code: the click target in `clean_mess`, the base game's `base_item_interaction`, the cleaner component, the mop's `should_clean` and the decal's `wash`. **Not tried in a game**: nobody has clicked a cobweb with a mop to watch it go. Two things could make me wrong and were looked for and not found: an `item_interaction` on the cobweb or rubble that blocks it (there is none in `mess.dm`), and a `mouse_opacity` that makes them unclickable (only three other decals in `mess.dm` set it).

## How to fix it

1. In `clean_mess`, click the mess itself when the tool is a mop and the mess is not `is_mopped`: `var/atom/target = (istype(tool, /obj/item/mop) && mess.is_mopped) ? get_turf(mess) : mess`. Mopping the floor stays as it is for everything else, which also takes up the other mopable messes on that tile.
2. In `can_clean_mess`, for a mop: shift anything its cleaner's strength covers, whether or not it is mopped. Read the strength off the tool: `var/datum/component/cleaner/cleaner = tool.GetComponent(/datum/component/cleaner); return cleaner && (mess.clean_type & cleaner.cleaning_strength)`. This also covers JAN-02's garbage and gooey grey mass.
3. In `jobs/janitor.ts`, the window works from the same wrong belief in three places, all through `canScrub` (`janitor.ts:122`, soap or a rag only): `changeForScrubbing` makes a janitor holding a mop and bucket carry them back to the closet and fetch a rag for a cobweb call; the call handler (`janitor.ts:819-833`) declines a call that names only cobwebs or rubble with "I have no soap or rag"; and `whatIsLeft` / the room line say a cobweb "needs scrubbing with soap or a rag". Make `canScrub` true for a held mop as well (`/soap|rag$|mop$/i`), and leave `SCRUB_KINDS` as it is: it still means "a spray cannot shift this", which stays true. Change the words to "needs a mop, soap or a rag" (`NEEDS_SCRUBBING`, `ONLY_IF_WORDS`, `whatIsLeft`, the room line), and change `ONLY_IF_WORDS` and the cargo side that writes the call (`jobs/cargo.ts`, which builds its call from `NEEDS_SCRUBBING`) together so they still match. A dry mop is fine to count: the server wets it before it cleans (`dry_mop`, `wet_mop`).
4. Check `beyond_kinds_here`, `could_shift` and `messes_to_clean` all go through `can_clean_mess`, so that rooms with only a cobweb left are no longer marked "beyond what you are holding" for a janitor with a mop.
5. Check the walk to the mess stops next to it: the click is on the decal, which may sit against a wall, and `CanReach` needs the body beside it.

## How to test the fix

- Server compile to a side copy.
- In a round: put a janitor with a wet mop beside a cobweb in maintenance. `game.log` / the brain: "You clean up the cobweb". The cobweb should be gone.
- Next round, `pda.log`: no "What is left (cobweb) needs scrubbing" or "(rubble)" from a janitor holding a mop, and far fewer cargo calls about the Bitrunning Den and the Mining Office.
- Simulator: the `janitor` scenarios do not run the server; check only that a janitor holding a mop is not sent for a rag for a cobweb (`changeForScrubbing`).
- Window: a throwaway case for the call handler: a janitor holding `mop` and `bucket`, sent "There is a mess in the Cargo Bay: cobweb. Could you come ...", should take the call, not send "I have no soap or rag", and `changeForScrubbing` should give null.

## Check

Checked by Opus 5.5. Read: `clean_mess` and `can_clean_mess` in `crew_npc_cleaning.dm` (the quotes are as on disk; the click is at line 513), `canScrub`, `changeForScrubbing`, `whatIsLeft` and the call handler in `jobs/janitor.ts`, and in the base game `/obj/item/mop` (`mop.dm`: the cleaner is added with no strength, so the default `CLEAN_SCRUB`; `should_clean` allows a wash when the mop holds a `REAGENT_CLEANS` reagent), `/datum/component/cleaner` (`on_interaction` on any atom clicked, then `target.wash(cleaning_strength)` after the `do_after`), `melee_attack_chain` (calls `base_item_interaction` first), `base_item_interaction` (the tool's `COMSIG_ITEM_INTERACTING_WITH_ATOM` comes before the decal's own `item_interaction`), `/obj/effect/decal/cleanable/item_interaction` (only acts for a cup that is not a rag, so it returns NONE for a mop after the signal has already run anyway), `/obj/effect/decal/cleanable/wash` (deletes when `clean_types & clean_type`), and `cleaning.dm` (`CLEAN_SCRUB` includes `CLEAN_TYPE_HARD_DECAL`). So a wet mop clicked on the cobweb itself deletes it, and the body never clicks it: the mop branch has clicked the turf since the first commit (`git log -S` finds the line in `82810bef`). `is_mopped` only decides `TRAIT_MOPABLE`, which `/turf/wash` uses.

The change log's 15:07 round-13.32 entry, item (5) "A mop does not scrub", and `LLM_CREW_PLAN_ROUND_1332.md` row 5 built the present behaviour on the reading that cobwebs "want scrubbing with soap": that reading is right for washing the floor and wrong for clicking the decal, so this is a mistaken premise, not an owner's choice. The comment above `can_clean_mess` ("a janitor with a wet mop scrubbed at a cobweb, gave it up") is that turf click. Round logs: the 19.33.50 `pda.log` lines quoted are there (lines 55, 56, 65, 84 and on).

Changed: effort to large (both the server and the window, as FORMAT.md counts it, though each side is small); confidence to sure; step 3 of the fix, since the window's harm is in `canScrub`, not only in `SCRUB_KINDS`, and `SCRUB_KINDS` should stay for the spray. Severity stays high: cobwebs and rubble were left in all three rounds of 2026-11-19 and fed the cargo call loop. Not run in a game.
