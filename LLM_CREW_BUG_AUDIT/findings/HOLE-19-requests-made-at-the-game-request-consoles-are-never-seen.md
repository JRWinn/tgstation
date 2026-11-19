---
id: HOLE-19
title: Supplies asked for the game's own way, at a supply request console, are never seen by cargo, so a player who orders as players do waits for good
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/cargo/orderconsole.dm:137, code/modules/cargo/orderconsole.dm:343, code/modules/llm_crew/crew_npc_cargo.dm:181, code/modules/cargo/orderconsole.dm:486
fix: Have a technician standing at its supply console read the console's request list the way its screen shows it, and pass each new request to the Quartermaster as an order taken from its orderer, approving it at the console once the Quartermaster says yes
---

## What is wrong

The crew's whole supply chain starts with words: a head tells the Quartermaster, or someone comes to the cargo counter and says what they want. That is one of the ways players ask for supplies. The way the game itself offers, and the one most players use, is the **supply request console**: a computer in the Cargo Lobby (MetaStation has three of them, `obj/machinery/computer/cargo/request` in the map) and in some departments, where anyone picks a crate, types a reason, and presses Request. The request goes into `SSshuttle.request_list`. Cargo sees it on the Requests tab of the supply console in the bay, with who asked and why, and approves or denies it there. The console also announces it on the Supply radio channel.

None of that reaches the crew:

- The crew never look at the request list. A search of `code/modules/llm_crew/` for `request_list` finds nothing. The only thing the crew code knows of request consoles is to skip them when choosing which console to work at (`if(console.requestonly || ...) continue` in `supply_console`).
- The announcement goes out by radio (`aas_config_announce(..., list(RADIO_CHANNEL_SUPPLY), ...)`), and a crew body hears no radio (`on_pre_hear` returns on `HEARING_RADIO_FREQ`).
- The technicians stand at the very console that shows the list (their post is "at the counter ... The supply console you order at is in the same room").

One concrete case. A friend playing a botanist wants seeds. He goes to the Cargo Lobby, as he would on any server, and at the request console asks for a Hydroponics Seeds crate, reason "for hydroponics". The console says it has been requested. The cargo technician three tiles away, behind the counter, carries on with its rounds. The Quartermaster hears of nothing. The request sits in the list until the round ends, or until a player in cargo approves it. Nobody tells the botanist anything, since nobody knows. If he then asks the technician in words, "did you get my request?", the model answers with nothing to go on.

The case grows with the owner's plan: every human player aboard who wants something from cargo will try the console first.

## Where

`code/modules/cargo/orderconsole.dm:137`, what the supply console's screen shows, which a technician standing at it could read:

	data["requests"] = list()
	for(var/datum/supply_order/order in SSshuttle.request_list)
		var/datum/supply_pack/pack = order.pack
		data["requests"] += list(list(
			"object" = pack.name,
			"cost" = pack.get_cost(),
			"orderer" = order.orderer,
			"reason" = order.reason,
			"id" = order.id,

`code/modules/cargo/orderconsole.dm:343`, the only word that a request was made, by radio:

	if(requestonly && message_cooldown < world.time)
		aas_config_announce(/datum/aas_config_entry/cargo_orders_announcement, list("AMOUNT" = amount), src, list(RADIO_CHANNEL_SUPPLY), amount == 1 ? "Single Order" : "Multiple Orders")

`code/modules/cargo/orderconsole.dm:486`, the button that approves one:

	if("approve")
		var/id = text2num(params["id"])
		for(var/datum/supply_order/SO in SSshuttle.request_list)
			if(SO.id == id)
				SSshuttle.request_list -= SO
				SSshuttle.shopping_list += SO

`code/modules/llm_crew/crew_npc_cargo.dm:181`, the crew's only reference to request consoles:

	if(console.requestonly || console.is_express || console.z != body.z)
		continue

## How it was found

Read from the code: the supply console's `ui_data` and `ui_act`, the request console type, and a search of the crew's code. Counted the request consoles in `_maps/map_files/MetaStation/MetaStation.dmm` with grep (3). Not seen in a round: no round has had a second player.

## How to fix it

1. Server: a new field in what a cargo technician is sent, `requests`, filled only while the body stands within reach of its supply console and can see it, and the console has power (GAP-20 is the fault of the crew working a console with none). Each entry is the pack name, cost, orderer, reason and id, as the screen shows them. Away from the console, the list it last read is kept on the controller with the time it was read; it is not refreshed from afar.
2. Window, the technician's job (`jobs/cargo.ts`): a request it has not seen before is word from that orderer, the same as one said at the counter. Take it through the existing path for a head's order: "Captain"/"Quartermaster" rules and all. With a Quartermaster aboard it goes to the Quartermaster face to face or by PDA, as orders already do, worded "Bob Hale asked at the request console for a Hydroponics Seeds crate, for hydroponics." The Quartermaster books it like any other order (`jobs/quartermaster.ts`, the ledger), so the big-purchase rule and the budget check apply.
3. When an order from a request is to be placed, place it by approving the request at the console rather than ordering anew (a new tool, or a `via: "request"` argument to `tool_order` that presses `approve` with the id through the console's own `ui_act`, as GAP-01 proposes for the Send button). That keeps the orderer's name and account on the order, which the base game uses when the crate comes in.
4. A request the Quartermaster or the Captain says no to is denied at the console (`deny`) and the orderer is sent a PDA message saying so, if they are on the PDA list.
5. Questions for the owner: may a technician approve a small request itself when no Quartermaster is aboard, as a human technician would? And should the crew answer the Supply radio announcement once radio is a sense, or only the console?

## How to test the fix

- Simulator: add `requests` to the stand-in server's cargo state, and a scenario where a request appears at minute 2. Pass when the Quartermaster's book has an order from the requester and the technician presses approve.
- DM compile, and the type check.
- In a round: at the Cargo Lobby request console, request any crate as the Captain. Grep `game.log` for the technician reading the request and `pda.log` for the word to the Quartermaster; the request should leave the console's Requests tab once approved.
