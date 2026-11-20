---
id: KNA-18
title: When the supply shuttle will not leave, the technician is told what is barring it and has no step to clear it, and the Captain is not told
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_freight.dm:26, code/modules/llm_crew/crew_npc_cargo.dm:452
fix: Give the technician a step for each thing what_bars_shuttle can name - carry a loose thing off the deck, ask a person to step off - and have the Quartermaster tell the Captain when an order has been held up
---

## What is wrong

Since the 16:15 entry of 2026-11-18 the server works out what is stopping the supply shuttle and says it: "The supply shuttle will not leave: it will not carry mail, and there is a letter lying on its deck", "a mouse is aboard it", "you are standing aboard it", "X is aboard it". That entry lists what was left:

- Known and not fixed: "A junk letter lying loose on the shuttle's deck still stops the shuttle. The technician will say so and cannot yet act on it. So will a mouse."
- Not built: "The Quartermaster telling the Captain that the shuttle is stuck. The technician now knows why and says so, and whoever ordered is still told an order is held up after two failures, as before."

So the order run ends with "The order is off until it is clear" and nothing clears it. Every order after that fails the same way until a player notices. In `round-15.09.26` the shuttle "stood in the dock from 15:32 and order 2 could not be fetched" for a letter in a crate; that case was mended, the loose letter and the passenger were not.

The case: a technician unloading a mail crate drops a junk letter on the shuttle's deck (`take_mail` drops junk "at its feet", and its feet may be aboard). The next order: `supply_run_step` finds `shuttle.canMove()` false, waits `CREW_NPC_SUPPLY_HELD_UP`, and reports the letter. The technician stands at its post. The letter lies there for the rest of the round.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:26`, `what_bars_shuttle`: the thing is found, and only its name is kept.

    var/what = format_text(passenger.name)
    if(isliving(passenger))
    	return passenger == pawn ? "you are standing aboard it" : "[what] is aboard it"
    var/obj/structure/closet/crate/within = get(passenger, /obj/structure/closet/crate)
    var/where = within ? "in the [format_text(within.name)] aboard it" : "lying on its deck"

`code/modules/llm_crew/crew_npc_cargo.dm:452`, `supply_run_step`: the run is called off.

    else if(world.time - supply_held_up_since > CREW_NPC_SUPPLY_HELD_UP)
    	// The shuttle will not fly with anyone aboard, or with cargo it is not allowed to carry.
    	supply_run_active = FALSE
    	pending_order = null
    	action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle will not leave to fetch [ordered_words]: [what_bars_shuttle(shuttle) || ...]. The order is off until it is clear.")

Note also that `deck.get_all_contents()` looks inside everyone standing aboard, so a letter in the pocket of a technician who is on the deck is reported as "a letter lying on its deck".

## How it was found

Read from the code and the change log.

## How to fix it

1. Have `what_bars_shuttle` return the thing as well as the words (a list: words, the atom, and a kind: `self`, `person`, `animal`, `loose`, `in_crate`). Send the kind and, for a person, their handle in the details of the failed order and the failed send.
2. Window (`jobs/freight.ts`, where the shuttle send is planned): a step for each kind.
   - `self`: walk off it (`go_to` the post).
   - `loose`: a new small tool, or `pick_up` by name, then walk off the shuttle and `put_down`. `tool_pick_up` already takes a thing in view by name; the letter is "mail".
   - `in_crate`: already handled for mail (the crate is hauled back off).
   - `person`: say "X, could you step off the supply shuttle, please? It will not leave with you aboard." once, by the same fixed-line path as the step-aside ask in `driver.ts` (`ASIDE_KEY`). A crew NPC that hears it steps aside (`jobs/aside.ts`); check its step lands off the shuttle's floor.
   - `animal`: nothing it can do by hand. Tell the Quartermaster.
3. After the step, try the send again once. If it is still barred, tell the Quartermaster face to face in fixed words (the path that already carries "still waiting to be collected"), and the Quartermaster sends the Captain one PDA message: "Captain, the supply shuttle cannot leave: WHAT. Order N is held up." Once per cause in ten minutes.
4. Fix the pocket case: skip things whose `loc` chain reaches a living mob, and report the mob instead.

Keeps the rules: the letter is picked up and carried by hand; nobody is moved by code.

## How to test the fix

- `tools/llm_crew/sim.ts`: the freight scenarios. Add one where the simulator's shuttle refuses to leave with kind `loose`, and pass when the technician picks the thing up, walks off, and the next send goes.
- Server compile.
- Next round, `game.log`: "The supply shuttle will not leave" followed within a minute by the shuttle leaving, or by a PDA message to the Captain.
