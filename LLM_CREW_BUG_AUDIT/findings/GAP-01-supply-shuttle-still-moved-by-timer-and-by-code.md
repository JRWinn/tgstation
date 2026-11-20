---
id: GAP-01
title: The supply shuttle is still sent and called home by code, from wherever the technician is (no-cheats plan 4.7, approved, not built)
kind: gap
severity: high
effort: large
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:419, code/modules/llm_crew/crew_npc_freight.dm:633, LLM_CREW_PLAN_NO_CHEATS.md:155
fix: Press send through work_window at the console as the owner allowed for machine windows, drop the timer that moves the shuttle, and make an order two presses at the console
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.7 and step 6 of section 5 say an order runs in five steps: place it at the console, press send (the shuttle leaves), go back to work, come back to the console after the trip time and press send again, see it dock. "The timer that moves the shuttle is removed." All eleven of that plan's questions were accepted by the owner on 2026-11-18, and the table in its section 3 lists both procs below as cheats.

Neither was changed. Today:

- After `place_order`, a timer (`supply_run_step`) runs every few seconds on the controller and moves the shuttle itself, out and back, whatever the body is doing and wherever it is. A technician that placed an order and was then arrested, shut in a room, or beaten down by Pun Pun still has its shuttle flown out and home for it.
- `send_shuttle_back` does walk the body to the console first, but then calls the shuttle subsystem and not the console. The console's own checks are skipped: whether it is powered or broken, whether the body is fit to use it, its spoken refusals (`safety_warning`, `blockade_warning`) and the requisition form it prints when the shuttle is called home. (KNB-05, a duplicate of this one, says the same.)

The only place the body's whereabouts matter in the timer is learning that the crate has come (`get_area(pawn) == get_area(post_turf)`). The timer asks nothing else of the body but `QDELETED(pawn)`; a technician in a cell, with its own tools refused by `custody_words()`, still has its shuttle flown for it.

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
2. Add one crew action, `press_send`, that needs the body standing at a supply console (use `start_errand` to the console as `tool_send_shuttle` does) and calls `work_window(console, "send")`. Read back whether the shuttle's mode changed to tell whether the console refused, and give `what_bars_shuttle` as the reason. (GAP-20 uses the same helper for placing the order.) Before sending, check what the window would show, because the `"send"` branch of `ui_act` does not check it itself: the Send button is there only when `SSshuttle.supply.mode == SHUTTLE_IDLE` and the console is not `requestonly` and has `can_send` (`tgui/packages/tgui/interfaces/Cargo/CargoStatus.tsx`, `docked && !requestonly && can_send`). `supply_console()` already skips request-only consoles; the idle check must be added, or a body could press a button the window has greyed out while the shuttle is in flight.
3. In `place_order`, after the order is placed, press send in the same visit. Keep the timer's check that nothing from the last trip is still aboard (`crate_to_unload()`): the console does not check it, and a crate sent back by mistake is gone. Do not start the `supply_run_step` timer. Send the brain the time the shuttle left.
4. Brain side (`jobs/cargo.ts`, the order task, and `jobs/freight.ts`): a new step "the shuttle should be at the far end by now, go to the console and call it home" that becomes ready after the trip time (read `SSshuttle.supply.callTime` on the server and send it, do not hard-code it). The order is loaded when the shuttle leaves the far end (`/obj/docking_port/mobile/supply/initiate_docking` calls `buy()` when `getDockedId() == "cargo_away"`), so it can be called home as soon as it is idle there; at the console the body can see that (the console shows where the shuttle is), so if it is still in flight it waits at the console and presses then. A workmate at the post may take the step if the technician who ordered is not in the department: this is plan 4.7's "a workmate at the post may press in its place", and it needs the pending order to be something both can see. The console shows it, so sending `shuttle away, order aboard` in `freight` to every cargo body in the bay is honest.
5. Keep `order_arrived` as it is: it only runs when the body is in the bay and sees the dock. Trigger it from the look-around, not from the removed timer.
6. `send_shuttle_back` uses the same `press_send` for both directions and loses its two `moveShuttle` calls.
7. Keep the timeout message ("still not come. Something is holding the supply shuttle up") but drive it from the brain's task age.
8. The dead-model rule: these are coded steps with no speech, so nothing waits on the model.

What must keep working (from KNB-05): "The supply shuttle will not leave: ..." (`what_bars_shuttle`), an order held up being told to whoever ordered it, and the Quartermaster's count of crates in.

Question for the owner: none, the plan settled it. One thing to say when it is built: with the timer gone, an order whose technician is held up waits at the far end until someone presses, which the plan accepted.

## How to test the fix

- Simulator: the plan's scenario "an order runs with the technician held up between the two presses" (`tools/llm_crew/sim.ts` needs the fake console to model the shuttle as away or home, and a send action). `sim.ts` plays the shuttle itself today (`const shuttle = { docked, aboard, sentWith }`), so its `order` and `send_shuttle` must be changed to need the two presses, or the scenarios pass without testing anything. The existing `order`, `qm`, `qmbig`, `qmwait` and `crew` scenarios must still pass.
- Server compile to a side copy.
- In a round, `game.log` should show two sends for each order, both with the body standing at the console, and `grep -n "moveShuttle" code/modules/llm_crew/` should print nothing. The cargo investigate log should have "sent the supply shuttle away" and "called the supply shuttle" against the technician's name, which only the console writes. With the technician held up, the shuttle should sit at the far end.

## Check

Checked by Opus 5.5 on 2026-11-19. KNB-05 is the same fault (same four `moveShuttle` calls, same fix) and is marked a duplicate of this one. This one is kept because its fix is better: KNB-05 asks for a change to `orderconsole.dm`, which `work_window` makes needless. What only KNB-05 had is copied in above.

- Read `place_order` and `supply_run_step` in `crew_npc_cargo.dm` and `tool_send_shuttle` and `send_shuttle_back` in `crew_npc_freight.dm`. The quotes at cargo 412, 450 and 461 and freight 642 and 653 are what the code says today. `supply_run_step` checks only `supply_run_active` and `QDELETED(pawn)` before moving the shuttle, so the arrested-technician case happens as written.
- Read the console's `ui_act` `"send"` branch (`orderconsole.dm:383`): it needs only `ui.user`, and makes the `canMove()` and `supply_blocked` checks and the `say()`. It does not check `requestonly`, `can_send` or whether the shuttle is idle; the window hides the button in those cases (`CargoStatus.tsx`, `CargoCart.tsx`). Added that to step 2.
- Read `work_window` (`crew_npc_machines.dm:281`): reach and `can_interact` (power, broken), then `ui_act` with the body as the user. The owner allowed it on 2026-11-18 (change log, `work_window` entry). So no base edit is needed and the fix keeps the rules.
- Read `supply.dm:143`: orders are bought as the shuttle leaves the far end, which is why it can be called home as soon as it is idle there. Added to step 4.
- Searched the change log and the plans: section 4.7 and the table at line 81 and 82 of `LLM_CREW_PLAN_NO_CHEATS.md` list both procs; no entry builds 4.7.
- Confirmed. Severity high stands (no-cheats rule, every order). Effort large: server and window both.
