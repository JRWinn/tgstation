---
id: GAP-20
title: A technician places an order, and sends the shuttle, at a supply console that has no power or is broken
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:379, code/modules/llm_crew/crew_npc_cargo.dm:176, code/modules/llm_crew/crew_npc_freight.dm:633, code/modules/cargo/orderconsole.dm:221
fix: Refuse in place_order and send_shuttle_back when the console is not operational, with words the brain can pass on, and skip dead consoles in supply_console
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 3 lists placing an order as "Checked and honest: placing an order (`console.add_item` with the body as the user)". It is honest about who orders and what is charged. It is not honest about the console. A player reaches `add_item` only through the console's window, and the game will not open or act on a machine's window when the machine has no power or is broken (`ui_act`'s parent call refuses, by the default UI state's `can_interact` test on machinery). The crew code calls `add_item` straight, and nothing in the crew code looks at the console's state: a search of `crew_npc_cargo.dm` and `crew_npc_freight.dm` for `machine_stat`, `is_operational`, `NOPOWER` and `BROKEN` finds nothing.

So the plan's rule 2 ("it goes through the same code a player's click or key press reaches ... so the game's own checks, limits and costs apply") is not met for the one action the plan marked as checked.

One case, and it is a common one: the owner's own note says test rounds used to lose power about 15 minutes in. Power is out in the Cargo Bay at 00:15. The Head of Personnel's order reaches a technician at 00:16. `supply_console()` returns the bay's console (it tests only `requestonly`, `is_express` and the z-level). The body walks to the dark console, `place_order` calls `console.add_item(body, pack_type)`, the order goes onto `SSshuttle.shopping_list`, and the body is told "You order the Janitorial Supplies Crate ... at the supply console and call the shuttle". Then the timer flies the shuttle (GAP-01). A player standing at that console could do none of it. `send_shuttle_back` has the same hole for sending the shuttle away with the empties.

It also hides the fault that matters: with the console dead, the crew should be telling engineering the bay has no power (GAP-19), and today they notice nothing because their orders still work.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:379`, `place_order`:

    /datum/ai_controller/crew_npc/proc/place_order(obj/machinery/computer/cargo/console)
        var/mob/living/carbon/human/body = pawn
        var/list/known = orderable_crates()
        if(!length(order_items))
            return list(FALSE, "You forget what you came to order.")
        ...
            for(var/crate_number in 1 to order_items[kind])
                console.add_item(body, pack_type)

`code/modules/llm_crew/crew_npc_cargo.dm:180`, `supply_console`:

    for(var/obj/machinery/computer/cargo/console as anything in SSmachines.get_machines_by_type(/obj/machinery/computer/cargo))
        if(console.requestonly || console.is_express || console.z != body.z)
            continue

`code/modules/cargo/orderconsole.dm:221`, the base proc, which begins:

    /obj/machinery/computer/cargo/proc/add_item(mob/user, id, amount = 1)
        if(is_express)
            return
        id = text2path(id) || id
        var/datum/supply_pack/pack = SSshuttle.supply_packs[id]

and has no test of power, of the console being broken, or of the user being next to it. Those tests are made before it, by the window code.

`code/modules/llm_crew/crew_npc_freight.dm:633`, `send_shuttle_back(console)`: uses `console` only as somewhere to stand.

## How it was found

Read from the code, while checking what a dead Cargo Bay would do for GAP-19. `add_item` in the base game was read to its first forty lines. Not seen in a round: no log was searched for an order placed during a power cut.

Two smaller things `add_item` shows, both already known: it records `ckey = user.ckey`, which is null for a body with no player, hence "placed by *null*" in `cargo.html` (change log 16:50: "nothing to fix"), and the order is charged to the cargo budget only because the body's ID is a cargo ID.

## How to fix it

1. Best: place the order through the helper that already makes the window's checks. `work_window` (`crew_npc_machines.dm:281`) tests reach and `machine.can_interact(body)` and then calls the machine's `ui_act` with the body as `ui.user`. The console's `"add"` action is `return add_item(ui.user, params["id"])` (`orderconsole.dm:444`), so `work_window(console, "add", list("id" = "[pack_type]"))` once per crate is the same order through the player's path. It sleeps `CREW_NPC_CLICK_GAP` each call, which is a second a crate: fine for one to five crates. If `work_window` returns FALSE, return `list(FALSE, "The supply console has no power.", list("console_dead" = TRUE))` when `!console.is_operational` (`is_operational` is FALSE for `NOPOWER` and `BROKEN`), and "You cannot work the supply console" otherwise, so the window can tell this from "will not take the order".
2. Least: if the direct call is kept, add `if(!console.is_operational || !console.can_interact(body))` before the loop in `place_order`, and the same test at the top of `send_shuttle_back`.
3. In `supply_console()`, prefer a console that is operational, but still return a dead one if it is the only one: the body should walk to it and find out, as a player would, not know from across the station. So: score a dead console +500, do not skip it.
4. Window (`jobs/cargo.ts`, where a failed `order` result is handled in `afterActing`): on `console_dead`, do not count it as the order failing twice ("held up"). Tell whoever gave the order in fixed words: "Ada, I cannot place order 3: the supply console has no power." That is the natural start of the call to engineering in GAP-19.
5. When GAP-01 is built, the same test belongs in the new send action, and the console's own refusals come for free.

This keeps the rules: nothing new is done by code, an action is refused that a player could not take.

## How to test the fix

- Server compile.
- Simulator: `tools/llm_crew/sim.ts` plays the server, so add a flag for a dead console to its fake `order` result and a scenario where the Quartermaster's order comes back "the supply console has no power": the technician tells the Quartermaster once, the order is held, and nothing loops.
- In a round: an admin cuts the Cargo Bay's APC, the Captain orders a crate. `game.log` should show the walk to the console and no "placed" line, and `SSshuttle.shopping_list` should be unchanged.
