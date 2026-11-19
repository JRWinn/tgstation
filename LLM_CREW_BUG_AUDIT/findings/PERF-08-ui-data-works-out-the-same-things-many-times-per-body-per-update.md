---
id: PERF-08
title: ui_data works out the same things over and over for every body on every update - four walks of up to 300 remembered messes, two or three of every PDA, a fresh view for security and engineering, about ten ID card lookups
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_brain_link.dm:76, code/modules/llm_crew/crew_npc_cleaning.dm:217, code/modules/llm_crew/crew_npc_cargo.dm:628, code/modules/llm_crew/crew_npc_security.dm:1583, code/modules/llm_crew/crew_npc_cargo.dm:11
fix: Work out each body's sense-derived fields once per look into a snapshot list on the controller, have ui_data copy the snapshot and add only the cheap live fields, and pass the look's sight list to security_state and engineering_state
---

## What is wrong

See also: HOLE-09 point 1, which lists some of these procs and proposes rebuilding only bodies with something new. That needs a dirty list and a cache of each body's last record. This finding counts what one body's record costs, so that the dearest parts can be moved first, and proposes the simpler cut: work them out on the look, which happens once a second anyway, not on every update, which happens four to thirteen times a second (PERF-02).

For **each** body, on **each** update, `ui_data` calls (read from `crew_brain_link.dm:76` down, following each call):

| what | how many times | each one |
| --- | --- | --- |
| a walk of `remembered_messes` (up to 300 entries, PERF-06) | 4: `beyond_kinds_here`, `mess_places`, `workable_mess_places`, `work_area_messes` | `workable_mess_places` resolves a weak reference and calls `could_shift` (a loop over the hands, `can_clean_with` with a `GetComponent`, `can_clean_mess`) for each entry |
| a walk of `GLOB.pda_messengers` (one per named PDA aboard, so at least one per crew member) | 2, 3 while shut in: `people_on_pda`, `janitors_on_pda`, `door_keepers` | a `get_turf` and a station-level check for each PDA; `door_keepers` adds `get`, `get_idcard` and `check_access` |
| `get_equipped_items` (everything worn and in pockets) | 4 or 5: `pda_messenger` three times (`has_pda`, `people_on_pda`, `janitors_on_pda`), `has_custodial_locator`, `get_all_gear` in `inventory_list` | a new list of every item on the body |
| `job_title()`, which is `get_idcard(TRUE)` | about 10: `works_in_cargo` alone is called for `orderable`, `held_state`, `held_check_due`, `freight_state`, `write_off_lost_crates`, `trade_tool_types`, each a `regex.Find` on the job | the ID card search over the body's slots |
| a loop over the hands | about 12: `cleaning_tool` through `working_tool`, `proper_tool`, `dry_mop` (four times), `tool_in_hand` (twice, each three loops), `held_bucket`, `locate(/obj/item/mop)` | small |
| `view(7)` | 1 for every security body (`security_state`), 1 for an engineering body near a machine (`engineering_state`) | a whole new sight list, a second after `look_around` made one |
| `range(1)` of the body's tile | 1 (`crew_npc_clear_of_doors` for `in_doorway`) | small |

Everything in the first five rows changes only when the body looks round or does something, and both of those already happen on a clock: `look_around` every second, and `action_result` calls `look_around` before it reports. Nothing in them changes between two updates a tenth of a second apart, but each update pays for all of them again for every body.

With eleven bodies at 4.4 updates a second (the latest round, PERF-02), that is about 48 records a second; at forty bodies and some 13 updates a second, about 520 records a second, each with up to 1,200 mess-memory steps. That is the part of `ui_data` that grows with the square of the crew.

## Where

`code/modules/llm_crew/crew_brain_link.dm:105` to `:161`, among others:

    			"cleanable_messes" = npc.cleanable_messes,
    			// The kinds of mess in this room that nothing it holds will shift: those that want scrubbing.
    			"beyond_kinds" = npc.beyond_kinds_here(),
    			"mess_places" = npc.mess_places(),
    			// Those of them where what the body holds would do some good.
    			"workable_mess_places" = npc.workable_mess_places(),
    ...
    			"has_pda" = !isnull(npc.pda_messenger()),
    ...
    			"pda_people" = npc.people_on_pda(),
    ...
    			"work_area_messes" = npc.work_area_messes(),
    ...
    			"pda_janitors" = npc.janitors_on_pda(),

`cleanable_messes` on the line above them is already done the right way: worked out in `look_around` and only copied here.

`code/modules/llm_crew/crew_npc_security.dm:1583`, `security_state`, its own sight:

    	var/list/in_sight = can_look ? view(CREW_NPC_VISION_RANGE, body) : list()

`code/modules/llm_crew/crew_npc_cargo.dm:11`, `job_title`, called by every `works_in_*`:

    	var/obj/item/card/id/card = body.get_idcard(TRUE)
    	return card?.assignment || body.get_assignment(if_no_id = "", if_no_job = "")

## How it was found

Read from the code: every proc named in `ui_data`, and the procs they call, counted by hand. The time each takes was not measured (PERF-04).

## How to fix it

1. On the controller, add `var/list/look_snapshot`. At the end of `look_around` (both the normal path and the early returns, which set it to the "sees nothing" values), fill it with the fields that come from senses and memory: `beyond_kinds`, `mess_places`, `workable_mess_places`, `work_area_messes`, `inventory`, `cleaning_tool`, `poor_tool`, `mop_needs_water`, `wants_bucket`, `dry_mop`, `has_locator`, `has_pda`, `pda_people`, `pda_janitors`, `door_keepers`. Work out `pda_messenger()` and `job_title()` once at the top of the look and pass them down where the procs take them.
2. In `ui_data`, copy `look_snapshot` into the body's record (`record += look_snapshot`), and keep building on the spot only what is live and cheap: `location`, `walking`, `doing`, `door_held`, `in_hand`, `at_door_of`, `acked_seq`, `events`, and the like.
3. `people_on_pda` and `janitors_on_pda` give the same list to every body with a PDA, less its own entry. Work the list out once per look on the brain link (or once a second, kept with a time) and have each body take it and drop its own messenger's name. HOLE-09 proposes the same.
4. Give `security_state` and `engineering_state` the look's own sight list instead of a new `view()`: keep the last `in_sight` from `look_around` on the controller for the length of one look (`var/list/last_sight`, cleared on the next look), and use `view` only if it is null. Note `look_around` uses `oview`, which leaves out the body's own tile. The cells and machines are never on it, but `security_state` also looks for the officer's own baton lying on the floor (`isturf(lost.loc) && (lost in in_sight)`), and a baton knocked out of its hand where it stands is on its own tile. So add the body's own turf and what is on it to the kept list (`last_sight + get_turf(body) + get_turf(body).contents`), or test `get_turf(lost) == get_turf(body)` as well, or that baton is never seen.
5. Check every proc moved for side effects first: `held_state` has some (PERF-07), and `workable_mess_places` calls `mind_what_it_holds`, which can clear `stubborn_messes`. Moving that to the look is right (it is about what the body holds), but it must still run before `tool_clean` reads `stubborn_messes`.

What must keep working: a body that picks something up must have its new tools in the window at once. `tool_pick_up` and the others end in `action_result`, which calls `look_around` before it emits, so the snapshot is fresh when the event goes.

## How to test the fix

- Server compile.
- The simulator plays the server and builds the record itself, so it cannot test this; the record's shape must not change, so the window code needs no change.
- In a round, compare the Crew Brain window's cards and details before and after for a janitor picking up a mop and a cargo technician at its post: same holdings, same mess rooms, same PDA lists.
- With PERF-04's counters in, the time in `ui_data` per call should fall by most of its size.

## Check

Confirmed as a real cost, read from the code; nothing was timed. The `ui_data` quotes are what `crew_brain_link.dm:76` to `:205` says today (`security_state` has drifted to `crew_npc_security.dm:1583`, its `view` line to `:1591`).

- `beyond_kinds_here`, `mess_places`, `workable_mess_places` (`crew_npc_cleaning.dm`) and `work_area_messes` (`crew_npc_cargo.dm`) each loop over `remembered_messes`; `beyond_kinds_here` and `workable_mess_places` resolve a weak reference and call `could_shift` per entry.
- `people_on_pda`, `janitors_on_pda` and `door_keepers` each walk `GLOB.pda_messengers`, and each first calls `pda_messenger()`, which builds `get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD)`. `has_custodial_locator` builds it again.
- `works_in_cargo` is a regex on `job_title()`, which is `get_idcard(TRUE)`; it is reached from several fields of the record.
- `security_state` makes its own `view(CREW_NPC_VISION_RANGE, body)` every update; `engineering_state` makes one when a machine is within seven tiles.
- `action_result` calls `look_around` before it emits (`crew_npc_tools.dm:131`), so a snapshot filled at the end of each look is fresh for every result, as the fix says.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans caches any of this. HOLE-09 point 1 overlaps (it lists some of the same procs) but its fault and fix are the payload and a dirty list; PERF-02 is the update rate this multiplies. Not a duplicate of either.

Severity: medium is kept, on the size it reaches at forty crew, not on anything seen. At eleven crew no lag has been reported, and with PERF-02 fixed (one update per tick at most) the rate this multiplies falls, so a fixer should take PERF-02 first and measure with PERF-04 before moving all fifteen fields. The first rows (the four mess walks and the three PDA walks) are the ones worth moving first.

On the fix: it keeps the rules; it only changes when the server works things out. Two cautions added to the steps: the kept sight list must cover the body's own tile for the dropped-baton check (step 4, mended above), and the snapshot can be up to a second stale for changes that do not go through a tool or a look, such as a player taking something out of the body's hand or giving it one. That is no worse than the rest of what the window knows from the last look, but the record's `holding` and `in_hand` must stay live, as step 2 has them.
