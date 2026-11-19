---
id: GAP-01
title: The supply shuttle is still sent and called home by code, from wherever the technician is (no-cheats plan 4.7, approved, not built)
kind: gap
severity: high
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:419, code/modules/llm_crew/crew_npc_freight.dm:633, LLM_CREW_PLAN_NO_CHEATS.md:155
fix: Press send through work_window at the console as the owner allowed for machine windows, drop the timer that moves the shuttle, and make an order two presses at the console
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.7 and step 6 of section 5 say an order runs in five steps: place it at the console, press send (the shuttle leaves), go back to work, come back to the console after the trip time and press send again, see it dock. "The timer that moves the shuttle is removed." All eleven of that plan's questions were accepted by the owner on 2026-11-18, and the table in its section 3 lists both procs below as cheats.

Neither was changed. Today:

- After `place_order`, a timer (`supply_run_step`) runs every few seconds on the controller and moves the shuttle itself, out and back, whatever the body is doing and wherever it is. A technician that placed an order and was then arrested, shut in a room, or beaten down by Pun Pun still has its shuttle flown out and home for it.
- `send_shuttle_back` does walk the body to the console first, but then calls the shuttle subsystem and not the console. The console's own checks and its requisition form are skipped.

One case: a technician places an order at 00:05, is cuffed at 00:06 and put in Cell 1 for 15 minutes. `supply_run_active` is TRUE and the timer keeps firing. At about 00:06 the shuttle leaves by `SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)` and a minute later comes home by `moveShuttle("cargo", "cargo_home", TRUE)`, with nobody at the console. A player in that cell could not have done it.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:412`, at the end of `place_order`:

    addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)

`code/modules/llm_crew/crew_npc_cargo.dm:449` and `:460`, in `supply_run_step`:

    if(shuttle.canMove())
        SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)
        supply_held_up_since = 0
    ...
    else if(docked_at == "cargo_away")
        SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)

`code/modules/llm_crew/crew_npc_freight.dm:642` and `:653`, in `send_shuttle_back`:

    SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)
    ...
    SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)

The player's path is the `"send"` branch of `ui_act` in `code/modules/cargo/orderconsole.dm`, which the plan says cannot be reached by a body.

## How it was found

Read from the code against the plan. The change log has no entry that builds 4.7, and its 18:05 entry still calls holding a door "one of the cheats still to be taken out". Not seen in a round as a fault: the shuttle comes and goes, which is why nobody has noticed.

## How to fix it

This is the plan's own design, already approved. **The plan's change to a base-game file is no longer needed.** The plan was written before engineering was built. Since then the owner has allowed "send what the window would send" for machine windows, and `work_window` in `crew_npc_machines.dm:281` does exactly that with the window's own checks (the body is next to the machine, `machine.can_interact(body)`, then `machine.ui_act(action, params, window, window.state)` with the body as `ui.user`). The console's `"send"` branch (`orderconsole.dm:383`) needs nothing but `ui.user`, so `work_window(console, "send")` reaches the same lines a player's click reaches, with `canMove()`, `supply_blocked`, the requisition form and the console's spoken warning all applying.

1. No change to `code/modules/cargo/orderconsole.dm`.
2. Add one crew action, `press_send`, that needs the body standing at a supply console (use `start_errand` to the console as `tool_send_shuttle` does) and calls `work_window(console, "send")`. Read back whether the shuttle's mode changed to tell whether the console refused, and give `what_bars_shuttle` as the reason. (GAP-20 uses the same helper for placing the order.)
3. In `place_order`, after the order is placed, press send in the same visit. Do not start the `supply_run_step` timer. Send the brain the time the shuttle left.
4. Brain side (`jobs/cargo.ts`, the order task, and `jobs/freight.ts`): a new step "the shuttle should be at the far end by now, go to the console and call it home" that becomes ready after the trip time (read `SSshuttle.supply.callTime` on the server and send it, do not hard-code it). A workmate at the post may take the step if the technician who ordered is not in the department: this is plan 4.7's "a workmate at the post may press in its place", and it needs the pending order to be something both can see. The console shows it, so sending `shuttle away, order aboard` in `freight` to every cargo body in the bay is honest.
5. Keep `order_arrived` as it is: it only runs when the body is in the bay and sees the dock. Trigger it from the look-around, not from the removed timer.
6. `send_shuttle_back` uses the same `press_send` for both directions and loses its two `moveShuttle` calls.
7. Keep the timeout message ("still not come. Something is holding the supply shuttle up") but drive it from the brain's task age.

Question for the owner: none, the plan settled it. One thing to say when it is built: with the timer gone, an order whose technician is held up waits at the far end until someone presses, which the plan accepted.

## How to test the fix

- Simulator: the plan's scenario "an order runs with the technician held up between the two presses" (`tools/llm_crew/sim.ts` needs the fake console to model the shuttle as away or home, and a send action). The existing `order`, `qm` and `crew` scenarios must still pass.
- Server compile to a side copy.
- In a round, `game.log` should show two sends for each order, both with the body standing at the console, and `grep -n "moveShuttle" code/modules/llm_crew/` should print nothing.
