---
id: SENSE-03
title: Crew see nobody who is not human, a cyborg talking to them, a space carp biting them or a xenomorph in their room is not in view at all
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:188, code/modules/llm_crew/crew_npc_senses.dm:339, code/modules/llm_crew/crew_npc_senses.dm:439, code/modules/llm_crew/crew_npc_senses.dm:117
fix: Report every living mob in view in look_around, humans as now and the rest as creatures with kind, name and whether hostile, and let handle_for take any mob/living
---

## What is wrong

Sight in `look_around` has two outputs: `people_in_view`, built from `for(var/mob/living/carbon/human/person in in_sight)`, and `things_in_view`, built by `notable_things` from `for(var/obj/thing in in_sight)`. A mob that is not a human is neither. So a crew body never sees:

- a **cyborg or the AI's hologram**, both players. A borg that says "Can you open the cargo door?" is heard (`on_pre_hear` counts silicons as `someone`, `source: "person"`), but gets no `handle` (that needs `ishuman(speaker)`), no entry in `people_in_view`, no "comes into view" event. The window cannot point a tool at them, cannot tell whether they are in the post or at a door, and cannot match the voice to anyone in the room.
- a **hostile creature**: a space carp in the hallway, giant spiders, a xenomorph, a hostile mob from a random event. The body walks into them, keeps mopping beside them and never mentions them. When GAP-13 switches on the harm sense, `watch_for_harm` also only looks at humans, so the creature that did the harm is never "beside" anyone.
- **animals and pets**: Ian, Poly, Runtime, mice. Harmless, but a player would see them and a few lines of the window talk about "a parrot" as a speaker it cannot see.

Monkeys are not in this gap: in this codebase they are `/mob/living/carbon/human/species/monkey`, so Pun Pun is seen.

One concrete case. A space carp gets into the Cargo Bay through a breached window (a random event, `Random Event triggering: Carp Migration` in `game.log`). It bites a cargo technician. The technician's `people_in_view` and `things_in_view` hold no carp. The brain has nothing to react to; the technician keeps hauling. Only security has a sense for being struck (`on_struck`), and a technician is not security.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:188`, in `look_around`:

    	for(var/mob/living/carbon/human/person in in_sight)

`code/modules/llm_crew/crew_npc_senses.dm:339`, in `notable_things`, objects only:

    	for(var/obj/thing in in_sight)

`code/modules/llm_crew/crew_npc_senses.dm:439`, in `on_pre_hear`, a voice is tied to someone only if they are human:

    	if(ishuman(speaker) && recently_saw(speaker))
    		details["handle"] = handle_for(speaker)

`handle_for`, `person_key` and `recently_saw` all take `mob/living/carbon/human`, and so do every tool that resolves a handle (`tool_throw_out`, `tool_open_door`, `tool_arrest` and the rest).

## How it was found

Read from the code. Not seen in a round; whether a carp or borg was ever near a crew body in the logs was not checked.

## How to fix it

1. In `look_around`, after the human loop, loop `for(var/mob/living/creature in in_sight)` skipping humans, and build a short `creatures_in_view` list: `name`, `kind` ("cyborg", "AI", "animal", "creature"), `distance`, `place`, and `hostile` (`creature.combat_mode`, or a basic mob whose `ai_controller` has a hostile targeting strategy, or the faction check `!faction_check_atom(body)`; ask the owner which). Emit one `CREW_SENSE_PERSON_IN_VIEW`-like event, say `creature_in_view`, the first time each is seen, keyed the same way as people.
2. Let `handle_for`, `person_key` and `recently_saw` take `mob/living`, so a cyborg gets a handle and the voice in `on_pre_hear` can be tied to it (change the `ishuman(speaker)` test to `isliving(speaker)`). Tools that must have a human keep their own `ishuman` check after resolving the handle and say "You cannot do that to a cyborg."
3. The window: types for `creatures_in_view` in `types.ts`, and a line in the scene text for hostile ones. What the crew do about a hostile creature (get away, call security) is the reactions work the owner has put off; seeing it is the first step and costs a short list.
4. Keep the prompt budget: only hostile creatures and silicons go into the prompt; pets are left out unless they speak.

Question for the owner: should crew react to hostile creatures now (step away, tell security by PDA), or only see them for the time being?

## How to test the fix

- Sim: a scenario whose server state has a creature in view; the window shows it and does not crash on a handle that resolves to a non-human.
- Compile. In a round, spawn a carp beside a crew body and look for the new event in `crew_brain.log`; have a borg speak to a technician and check the speech event carries a `handle`.
