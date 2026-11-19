---
id: GAP-17
title: No body leaves a room because its air has turned bad or its alarm is ringing, and four more leftovers of the locked-areas plan
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: core
files: LLM_CREW_PLAN_SECURE_AREAS.md:26, code/modules/llm_crew/crew_npc_motor.dm:43, code/modules/llm_crew/crew_npc_senses.dm:127, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:316
fix: Have the server say when the air on the body's own tile is not fit to stand in, and have the driver treat that as the one emergency that comes before any job, walking to the nearest room it knows with good air
---

## What is wrong

`LLM_CREW_PLAN_SECURE_AREAS.md` lists what was left out when it was built on 2026-11-17 ("Not built", lines 26 to 34). Nothing since has built any of them. Checked by search on today's code.

1. **"Leaving at once for bad air or an alarm in the room."** The plan's section 2: "There is bad air or an alarm in the room. This comes before the job." The crew code knows good air from bad only for where a body is *going*: `crew_npc_safe_turf(destination)` is asked of the next wander step, of a spot to stand, of a route's end. Nothing asks it of the tile the body is on and acts on the answer, except to refuse two errands (`tool_reset_alarm`: "The air where you stand is not right", and waiting at a door, `crew_npc_doors.dm:322`). A janitor mopping a room when a window breaks goes on mopping until it drops. This is the worst of the five: it is a body lost for the round, and the owner's design notes say "urgency must be part of the design".
2. **"The 'my post is gone' state once out."** A technician whose bay is breached or cut off still walks at it. Section 2: "it tells its head and carries on with work that does not need the post."
3. **"Handing a visitor over to a workmate aloud."** Section 3: the host who let a visitor in does not leave the post "unless a workmate takes the visitor over, said aloud". What was built instead: a technician does not go on its rounds with a visitor inside unless a workmate is at the post, with nothing said. (See GAP-06: the list of who is inside is shared in code, which is why nothing needed saying.)
4. **"Backing out the way it came when there is nowhere to step aside to."** Section 4. Asked to step aside in a one-tile passage, a body tries and stays.
5. **"Walking someone out of a room other than the post: the server only does it there."** See GAP-14, which proposes the general fix.

Also in that list and since settled: "Reordering a lost crate" (the Quartermaster plan did it: the Quartermaster orders it again once), and "Why the Cargo Bay never counted as shut in is still unknown" (the change log does not say it was ever found).

One case for 1: `round-17.06.14` and others have Pun Pun pulling fire alarms, and random events breach hulls. A fire in the Bar Lounge during a staff meeting: the Head of Personnel and three janitors are standing in the room at a meeting step. Fire doors shut. Nothing in `driver.ts` ranks above the meeting but being shut in, and being shut in sends them to stand at the door and ask to be let out. They do not try another room, and they do not know the air is why they are hurt.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:43`, the only air test:

    /proc/crew_npc_safe_turf(turf/destination)
        if(!isopenturf(destination) || isspaceturf(destination))
            return FALSE
        ...
        var/pressure = air.return_pressure()
        return pressure >= WARNING_LOW_PRESSURE && pressure <= WARNING_HIGH_PRESSURE

It tests pressure only: not heat, and not what the gas is. A room full of plasma or carbon dioxide at normal pressure is "safe" to it.

`ui_data` in `crew_brain_link.dm` sends no field for the air where the body stands (the list runs from `"id"` to `"events"`, lines 86 to 201: nothing about air, heat or the body's own health for non-security staff).

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:316`: the first things `decide` looks at are a door held open, being shut in, and the fire-door reflex. There is no "the air here is bad".

## How it was found

Read from the plan's Status and a search of both code trees for bad air, alarm, "post is gone", handing over and backing out. `crew_brain_link.dm` `ui_data` was read in full. `driver.ts` was read only around the shut-in steps, not in full.

## How to fix it

Bad air first: it is the one that loses bodies.

1. **Server: what the body feels.** In `look_around` (`crew_npc_senses.dm:127`), work out once a look whether the tile it stands on is fit: pressure as now, temperature inside what a human can stand (`BODYTEMP_COLD_DAMAGE_LIMIT` to `BODYTEMP_HEAT_DAMAGE_LIMIT` on the turf's air), and whether the body is taking breathing damage (the game sets alerts on the mob for not enough oxygen and for toxins: `body.has_alert(ALERT_NOT_ENOUGH_OXYGEN)` and the like, which is exactly what a player sees on screen, so it is a sense). Send `air_bad` in `ui_data`, and emit one sense event when it turns bad: "The air here is bad: you cannot breathe it." A fire alarm ringing in the room the body stands in is seen and heard: send `alarm_here`.
2. **Server: somewhere to go.** A small tool, or `tool_flee` from the unused `crew_npc_danger.dm` (it already picks the nearest room it knows that is out of sight): prefer a room it knows whose spot passes `crew_npc_safe_turf`.
3. **Window.** In `driver.ts`, at the top of `decide` with the other reflexes: `air_bad` and not already walking out is an emergency step, ahead of being shut in and ahead of any task. It drops a walk (`dropsWalk`). It does not need the model. After it is out it tells its head once by PDA: "Joan, the air in the Bar Lounge is bad. I have left it." (a fixed line, read by the head as a room to keep its staff out of).
4. **`crew_npc_safe_turf`** should use the same test as step 1 for destinations, so nobody is sent to stand in hot or poisoned air at normal pressure.
5. **"My post is gone."** With 1 to 4 in, a post is gone when its spot fails the test, or two walks to it have failed with no door to ask at. `return_to_post` stops trying, the body tells its head once, and jobs that need the post (`keepsPost`) fall back to their PDA work. Medium, and best done after a round shows 1 to 4 working.
6. **Backing out.** `tool_step_aside`: when no free tile is found beside it, walk back to `cameFrom` (the brain knows the room it came from) for 15 seconds. Small.
7. **Handing a visitor over aloud** waits on the owner's answer to GAP-06.

Keep the rules: this is a reflex in code, the model is not asked, and nothing is opened or moved by code.

## How to test the fix

- Simulator: `tools/llm_crew/sim.ts` needs an `air_bad` flag on a fake room. Scenario: a staff meeting, the air turns bad at 40 seconds, everyone is out of the room within ten seconds and the head is told once. With a dead LLM as well.
- Server compile. In a round: an admin can drain a room's air. Read `game.log` for the walk out and `pda.log` for the one message.
