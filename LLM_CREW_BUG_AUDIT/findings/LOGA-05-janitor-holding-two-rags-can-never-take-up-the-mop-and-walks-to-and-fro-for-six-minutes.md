---
id: LOGA-05
title: A janitor holding two rags can never take up the mop its head ordered for it, and walks to and fro between the closet and elsewhere for six minutes
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: logs
files: code/modules/llm_crew/crew_npc_hands.dm:87, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:287, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:296
fix: Count a second of the same tool, and a rag beside anything better, as spare in free_a_hand, and in supplyStep put a rag down before going for a mop or a spray when both hands are full
---

## What is wrong

See also: KNA-05 (a thing pushed into a hand during an errand is kept for good) and DESK-10 (a mop and soap in hand, so a bucket can never be picked up). This is the same dead end with a third pair of things in the hands, and it is the reason a crate of supplies the head ordered did the janitor no good.

A janitor that holds a rag in each hand and is told its supplies have come goes to the Custodial Closet and is given the step `pick_up("mop")`. The server answers "Your hands are full of things you need. Put something down first.": `free_a_hand` finds nothing spare, because a rag counts as spare only to someone holding a mop. Nothing in the window puts a rag down. So the janitor goes off to the next mess with its rag, and when it gets there `supplyStep` sends it back to the closet for what has come ("your PDA says what you asked for has come and is in the Custodial Closet"). At the closet the mop is tried again, fails again, and so on.

Concrete case, `data/logs/2026/11/19/round-20.43.32`, Alger Ratcliff (janitor), `crew_brain.log`:

1. 02:45:52, it takes up a damp rag. 02:46:25, `pda.log`: "I need something better than a rag to clean with for my work. Could you get it ordered, please?"
2. 02:47:12 to 02:47:15, in the Bar Lounge, a second damp rag comes into its other hand: "holding damp rag" becomes "holding damp rag, damp rag". Pun Pun was in the room (Alger greeted it at 02:47:43) and hands people things (change log 19:38 entry); the bar keeps rags.
3. 02:54:52, it unpacks crate #331 (a mop, a spray, a rag, three buckets) in the Custodial Closet.
4. 02:55:23 to 02:58:29, eleven steps, all "holding damp rag, damp rag":
   - in the Custodial Closet: "you know where there is mop, and you are going to get it" => `pick_up("mop")` (02:55:51, 02:56:17, 02:57:13, 02:58:29);
   - then "You have a mess to clean up in Central Maintenance" => `go_to("Central Maintenance")`;
   - in Central Maintenance: "your PDA says what you asked for has come and is in the Custodial Closet. You are going there to get it." => `go_to("Custodial Closet")`, five times.
5. 02:58:30, its head sends it for the second crate, #332. From 02:58:33 to 03:02:07 it goes Custodial Closet, Cargo Lobby, Custodial Closet, Cargo Lobby, four times over: at the closet the crate errand comes first, at the counter "your PDA says what you asked for has come and is in the Custodial Closet" does. It asked for the crate at 03:00:58 and walked off before it was put out.
6. 03:02:07, the log ends with it hauling crate #332, still holding the two rags. The mop from #331 was never taken up.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:87`, `free_a_hand`: two rags are two trade tools, and a rag is spare only beside a mop.

    	for(var/obj/item/held in body.held_items)
    		if(held.item_flags & ABSTRACT)
    			continue
    		if(!is_trade_tool(held, trade_tools))
    			spare = held
    			break
    		if(is_spent(held))
    			spare ||= held
    		// A rag is spare to someone who holds a mop: the hand is better used for a bucket of water.
    		if(istype(held, /obj/item/rag) && (locate(/obj/item/mop) in body.held_items))
    			spare ||= held
    	if(isnull(spare))
    		return FALSE

and `tool_pick_up` (`crew_npc_hands.dm:15`):

    	if(!length(body.get_empty_held_indexes()) && !free_a_hand())
    		action_result(CREW_TOOL_PICK_UP, FALSE, "Your hands are full of things you need. Put something down first.")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:287`, `supplyStep`: the pick-up is planned with no look at the hands.

      const supply = knownSupply(brain);
      if (supply) {
        return {
          ready: true,
          step: `${lack(brain)}, but you know where there is ${supply}, and you are going to get it.`,
          act: { tool: 'pick_up', item: supply },
        };
      }

`janitor.ts:296`: away from the closet, it is sent back there however many times the pick-up there has failed.

      if (
        brain.suppliesSentAt !== null &&
        brain.now - brain.suppliesSentAt < SUPPLIES_WAIT_DS
      ) {
        const where = brain.suppliesAt ?? CARGO_LOBBY;
        if (brain.location !== where && knowsPlace(brain, where)) {
          return { ... act: { tool: 'go_to', place: where } };

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-20.43.32`, `crew_brain.log` for Alger Ratcliff from 02:45:52 to 03:02:07, `pda.log` 02:46:25, 02:52:37, 02:54:52 and 02:58:30. The server's answer to each `pick_up("mop")` is not in any log (HOLE-12): that it was the "hands are full" refusal is read from `free_a_hand`, which can return nothing else for two rags. Why at Central Maintenance the plan was the walk back and not the pick-up again was not traced to the line: `knownSupply` there did not offer the mop, so the PDA branch came next. Who put the second rag in its hand is inferred, not seen.

## How to fix it

1. Server, `free_a_hand`: a held thing is spare if the other hand holds another of the same kind (`istype(other, held.type)`), and a rag is spare beside any trade tool, not only a mop. Put it in the bag if it fits, otherwise on the floor, as now.
2. Window, `supplyStep`: before `pick_up(supply)`, if `brain.holding.length >= 2` and nothing held is spare by the rule above, return a `put_down` step for the rag (or the second of two alike) first, with a line like the one `changeForScrubbing` uses: "Your hands are full. You are putting your damp rag down here to have a hand for the mop."
3. Window, the PDA branch at `janitor.ts:296`: once the janitor has stood in `suppliesAt` and the pick-up there has failed, do not send it back there again until something has changed (a hand is free, or new word comes). Keep a note of the failure (`brain.failures` already has the pick-up's key) and test it here.
4. Keep: a janitor with one rag and a free hand still takes up the mop without putting the rag down; one holding a mop and a rag still frees the rag hand for the bucket.

## How to test the fix

- Server compile to a side copy; type check and lint.
- Simulator: a janitor scenario that starts it holding two rags, with a mop in the closet and word by PDA that supplies have come. Pass if within two steps it puts a rag down and takes up the mop, and it never walks back to the closet twice running.
- Next round, `crew_brain.log`: no janitor "holding damp rag, damp rag" for more than a minute, and no run of `go_to` between the same two rooms.
