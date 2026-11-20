---
id: JAN-02
title: A wet mop is taken as unable to shift decomposing garbage and a gooey grey mass, which it does shift, so a janitor leaves them or swaps its mop for a rag
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 8379468dc7c, 6950c85dbe1
found_by: Opus 5.5
checked_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:187, code/game/objects/items/mop.dm:40, code/datums/components/cleaner.dm:19, code/game/turfs/turf.dm:749, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:112
fix: In can_clean_mess judge a mop by its cleaner component strength (CLEAN_SCRUB) and is_mopped, not by CLEAN_WASH, and take garbage and gooey grey mass out of SCRUB_KINDS for a body with a mop
---

## What is wrong

`can_clean_mess` says a mop shifts a mess only if the mess washes off (`clean_type & CLEAN_WASH`) and is one a mop reaches (`is_mopped`). The first half is wrong for a mop. The game's mop does not wash: it scrubs. `/obj/item/mop` adds its `cleaner` component without a strength, so it gets the default, `CLEAN_SCRUB`, and a scrubbed floor (`/turf/wash`) washes every mopable thing on it at that strength. `CLEAN_SCRUB` includes `CLEAN_TYPE_HARD_DECAL`.

Two common messes are hard decals that a mop does reach (`is_mopped` is left at its default, TRUE):

- `/obj/effect/decal/cleanable/garbage`, "decomposing garbage": put down by the maintenance trash spawners (`spawners/random/trash.dm`, 62 of those spawners on MetaStation).
- `/obj/effect/decal/cleanable/molten_object`, "gooey grey mass": left by anything melted by acid (`items.dm:1000`) and by some plants.

So a janitor with a wet mop:

1. leaves them out of `messes_to_clean` and `workable_mess_places` (through `tool_for_mess` and `could_shift`), so it never sets off for a room that has only those;
2. names them in `beyond_kinds_here`, and the brain says "What is left (decomposing garbage) needs scrubbing with soap or a rag";
3. when called to such a mess, puts down its mop and bucket and goes for a rag, because the window's `SCRUB_KINDS` also lists `decomposing garbage` and `gooey grey mass` (`changeForScrubbing` in `jobs/janitor.ts`). That is a walk back to the closet, and then, with only a rag, a walk back for the mop.

Concrete case: a janitor with a wet mop walks a maintenance tunnel with a pile of decomposing garbage in it. `can_clean_mess(mop, garbage)`: `washes_off = !!(CLEAN_TYPE_HARD_DECAL & CLEAN_WASH)` is FALSE, so FALSE. The garbage is never cleaned, and it is reported as beyond the janitor, though one click of its mop on that floor would take it up.

The spray's half of the rule is right: space cleaner washes at `CLEAN_WASH` (`/datum/reagent/space_cleaner`, `clean_types = CLEAN_WASH`), so it does not shift garbage.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:187`, in `can_clean_mess`:

    /datum/ai_controller/crew_npc/proc/can_clean_mess(obj/item/tool, obj/effect/decal/cleanable/mess)
    	var/washes_off = !!(mess.clean_type & CLEAN_WASH)
    	if(istype(tool, /obj/item/reagent_containers/spray))
    		return washes_off
    	if(istype(tool, /obj/item/mop))
    		return washes_off && mess.is_mopped
    	return TRUE

`code/game/objects/items/mop.dm:40`, the mop's cleaner, no strength given:

    	AddComponent(/datum/component/cleaner, mopspeed, pre_clean_callback=CALLBACK(src, PROC_REF(should_clean)), on_cleaned_callback=CALLBACK(src, PROC_REF(apply_reagents)))

`code/datums/components/cleaner.dm:19`, the default:

    /datum/component/cleaner/Initialize(
    	base_cleaning_duration = 3 SECONDS,
    	skill_duration_modifier_offset = 0,
    	cleaning_strength = CLEAN_SCRUB,

`code/game/turfs/turf.dm:749`, a scrubbed floor:

    /turf/wash(clean_types, all_contents = FALSE)
    	. = ..()
    	for(var/atom/movable/to_clean as anything in src)
    		if(all_contents || HAS_TRAIT(to_clean, TRAIT_MOPABLE))
    			. |= to_clean.wash(clean_types)

`code/game/objects/effects/decals/cleanable/mess.dm:365` (garbage) and `:172` (molten object): `clean_type = CLEAN_TYPE_HARD_DECAL`, no `is_mopped = FALSE`.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:112`:

    const SCRUB_KINDS = /^(cobweb|rubble|decomposing garbage|gooey grey mass)$/i;

## How it was found

Read from the code, and the base game's mop, cleaner component, turf wash and decal types read to check what a mop really shifts. Not seen in a round.

## How to fix it

1. In `can_clean_mess`, for a mop: `return mess.is_mopped && !!(mess.clean_type & CLEAN_SCRUB)`. Better still, read the strength off the tool so a changed mop is followed: `var/datum/component/cleaner/cleaner = tool.GetComponent(/datum/component/cleaner)` and test `mess.clean_type & cleaner.cleaning_strength`. Keep the spray rule as it is.
2. A mop that holds nothing that cleans (`should_clean` returns `CLEAN_NO_WASH` when no reagent with `REAGENT_CLEANS` is at 1 unit or more) shifts nothing. `can_clean_with` only checks `total_volume >= 0.1`. Make it check `tool.reagents.has_reagent(amount = 1, chemical_flags = REAGENT_CLEANS)` for a mop, so a mop wetted with something else is taken as dry.
3. In `jobs/janitor.ts`, `SCRUB_KINDS` is used to decide that a mop will not do. Take `decomposing garbage` and `gooey grey mass` out of it, or better, let the server say which kinds the body's own tools cannot shift (it already sends `beyondKinds`) and use that instead of a fixed list.
4. The cobweb and rubble cases stay as they are: both are `is_mopped = FALSE`.

## How to test the fix

- Server compile to a side copy. Type check the window.
- `tools/llm_crew/sim.ts`: any janitor scenario with a mess named "decomposing garbage" in a room, a janitor holding a wet mop: it should clean it, not change tools. Add one if none has it.
- In a round: put a `decomposing garbage` decal in a hallway with a janitor holding a wet mop near. Grep `game.log` for its clean report: "You clean up 1 mess in ...".

## Check

Confirmed. Every quote is what the code says today. Traced end to end:

- `clean_mess` (`crew_npc_cleaning.dm:512`) clicks the turf under the mess when the tool is a mop. The mop's `cleaner` component (`mop.dm:40`, no strength given, so `CLEAN_SCRUB` from `cleaner.dm:19`) runs `clean`, whose `do_after` ends in `target.wash(cleaning_strength)` (`cleaner.dm:129-135`). `/turf/wash` (`turf.dm:749`) washes each thing on it with `TRAIT_MOPABLE`, which a cleanable gets from `is_mopped` (`cleanable.dm:32`).
- `garbage` (`mess.dm:365`) and `molten_object` (`mess.dm:172`) set `clean_type = CLEAN_TYPE_HARD_DECAL` and leave `is_mopped` TRUE. `CLEAN_SCRUB` includes `CLEAN_TYPE_HARD_DECAL` (`__DEFINES/cleaning.dm`), so `/obj/effect/decal/cleanable/wash` qdels them. `CLEAN_WASH` does not, so `can_clean_mess` says no for a mop.
- Cobweb (`mess.dm:167`) and rubble (`mess.dm:391`) do set `is_mopped = FALSE`: the finding is right that those two stay.
- Water has `REAGENT_CLEANS` (`other_reagents.dm:119`), so a mop wetted from a bucket of water does wash.

Not chosen on purpose. The change log entry "(5) A mop does not scrub" (`LLM_CREW_CHANGELOG.md:479`) and row 5 of `LLM_CREW_PLAN_ROUND_1332.md` state that garbage and gooey grey mass stay when the floor is mopped, "in the game's code". That was a misreading of the code: the owner's complaint in that row was about rubble and a cobweb, both `is_mopped = FALSE`. The fix keeps what the owner asked for.

On the fix: step 1 is right; reading `cleaning_strength` off the tool's component is better than a constant. Step 3: if the two words are simply taken out of `SCRUB_KINDS`, a janitor holding only a spray who is called to garbage will take the call and then report it as beyond the spray. That is still a true report, so it is acceptable, but the better way is the one the finding names: let the server's `beyondKinds` decide. Effort stays small: one line in `can_clean_mess` and one regex in `janitor.ts` (two files, but no design change). Severity medium: garbage is common in maintenance and some rooms, and the wrong tool swap costs a walk to the closet and back.

Read only. Nothing was run.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 8379468dc7c.

- JAN-02 (server part): part done. JAN-02: a wet mop now counts as shifting what it scrubs up. can_clean_mess judges a mop by its cleaner component's strength (CLEAN_SCRUB) and is_mopped, not by CLEAN_WASH, so decomposing garbage and a gooey grey mass are cleaned with the mop (crew_npc_cleaning.dm). Left: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts: take `decomposing garbage` and `gooey grey mass` out of SCRUB_KINDS (line `const SCRUB_KINDS = /^(cobweb|rubble|decomposing garbage|gooey grey mass)$/i;` becomes `/^(cobweb|rubble)$/i`), or better, use the server's beyondKinds in changeForScrubbing instead of the fixed list. Simulator (sim.ts / fixtures.ts, owned by nobody this round): a scenario where a janitor holding a wet mop is called to a room with a "decomposing garbage" mess; pass if it cleans it and does not go for a rag.

Round two (branch crew-bug-fixes-medium): 6950c85dbe1. This finishes the parts left above, apart from any step that waits on the owner.
