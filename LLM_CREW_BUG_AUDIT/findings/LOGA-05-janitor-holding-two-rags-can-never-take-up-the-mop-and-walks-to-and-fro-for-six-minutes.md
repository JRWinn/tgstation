---
id: LOGA-05
title: A janitor holding two rags can never take up the mop its head ordered for it, and walks to and fro between the closet and elsewhere for six minutes
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 5155b38e027, 09cfd55eff1
found_by: Opus 5.5
checked_by: Opus 5.5
area: logs
files: code/modules/llm_crew/crew_npc_hands.dm:87, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:287, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:296
fix: In free_a_hand, count a held thing as spare when the other hand holds another of the same type, so one of two rags goes in the bag and the mop can be taken up; the window guards are optional
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

Seen in a round log: `data/logs/2026/11/19/round-20.43.32`, `crew_brain.log` for Alger Ratcliff from 02:45:52 to 03:02:07, `pda.log` 02:46:25, 02:52:37, 02:54:52 and 02:58:30. The server's answer to each `pick_up("mop")` is not in any log (HOLE-12): that it was the "hands are full" refusal is read from `free_a_hand`, which can return nothing else for two rags. Why at Central Maintenance the plan was the walk back and not the pick-up again: the mop came out of the crate onto the closet floor, and `allKnownItems` (`memory.ts:293`) holds only what is in view and what is remembered inside storage. Out of the closet the loose mop is not known, so `knownSupply` is empty and the PDA branch comes next. Who put the second rag in its hand is inferred, not seen.

## How to fix it

1. Server, `free_a_hand`: a held thing is spare if the other hand holds another of the same kind (`other != held && istype(other, held.type)`). Put it in the bag if it fits, otherwise on the floor, as now. This alone mends the case in the log: one rag is stowed, the mop is taken up, and the next `pick_up` of a bucket frees the rag hand by the rule already there. About five lines, one file.
   Leave out "a rag is spare beside any trade tool": with a rag and a full space cleaner, a `pick_up` of soap or a bucket would then stow the rag without asking, which changes what the scrubbing code (`changeForScrubbing`, `scrubberToHand`) counts on. If it is wanted, it is the owner's call.
2. Optional, window, `supplyStep`: before `pick_up(supply)`, if `brain.holding.length >= 2` and nothing held is spare by the rule above, return a `put_down` step for the rag (or the second of two alike) first, with a line like the one `changeForScrubbing` uses: "Your hands are full. You are putting your damp rag down here to have a hand for the mop."
3. Optional guard, window, the PDA branch at `janitor.ts:296`: once the janitor has stood in `suppliesAt` and the pick-up there has failed, do not send it back there again until something has changed (a hand is free, or new word comes). Keep a note of the failure (`brain.failures` already has the pick-up's key) and test it here.
4. Keep: a janitor with one rag and a free hand still takes up the mop without putting the rag down; one holding a mop and a rag still frees the rag hand for the bucket.

## How to test the fix

- Server compile to a side copy; type check and lint.
- Simulator: a janitor scenario that starts it holding two rags, with a mop on the closet floor and word by PDA that supplies have come. Pass if its first `pick_up("mop")` in the closet succeeds (one rag goes in its bag), and it never walks back to the closet twice running. Also check a janitor with a mop and one rag still frees the rag hand for a bucket, and one with a rag and a free hand takes the mop without stowing anything.
- Next round, `crew_brain.log`: no janitor "holding damp rag, damp rag" for more than a minute, and no run of `go_to` between the same two rooms.

## Check

Read `tool_pick_up` and `free_a_hand` (`crew_npc_hands.dm:9-108`), `trade_tool_types` and `is_trade_tool` (`crew_npc_inventory.dm:55-144`), `supplyStep`, `knownSupply` and the SUPPLIES task set-up in `jobs/janitor.ts`, and `allKnownItems` in `memory.ts`. Read Alger Ratcliff's decisions in `round-20.43.32/crew_brain.log` from 02:45:52 to 03:02:07: they are as the write-up says, eleven steps with "holding damp rag, damp rag" and four `pick_up("mop")` in the closet with nothing after them.

Why it holds: `/obj/item/rag` is in `janitor_tools`, so neither rag is "not a trade tool"; neither is a spent spray; and the rag rule needs a mop already in hand. `spare` stays null, `free_a_hand` returns FALSE, and `tool_pick_up` gives the "hands are full" refusal before it looks for the mop. Nothing in the janitor's window code puts a rag down outside `changeForScrubbing`, which only puts down a mop or bucket. Nothing in the change log or plans covers two of one tool in hand. Distinct from KNA-05 (how the second rag got there) and DESK-10 (mop and soap, bucket).

Changes: confidence to sure (the refusal is the only answer `free_a_hand` can give here, though HOLE-12 means it is not logged); the fix narrowed to the server rule, which alone mends the case and keeps effort small; the "rag beside any trade tool" part marked as a design change; the Central Maintenance branch explained from `allKnownItems`. Severity medium kept: two of one tool in hand needs someone to push one on the janitor, which is not every round. Not run: nothing.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 09cfd55eff1, 5155b38e027.

- LOGA-05 (window part): part done. - **LOGA-05, window part: a janitor with two of a thing in its hands (a damp rag in each) puts one down before picking up the supply it knows of**, so a hand is free for the mop (`supplyStep` in `jobs/janitor.ts`). Cases in `tools/llm_crew/janitor-hands.ts`. Left: code/modules/llm_crew/crew_npc_hands.dm free_a_hand (being done by the other worker this round). sim.ts: scenario starting a janitor with two rags, a mop on the closet floor and word by PDA that supplies came; pass if its pick_up mop succeeds and it never walks back to the closet twice running.

Round two (branch crew-bug-fixes-medium): no more code was needed. Both parts above were in round one, each by a different group, so the finding is now whole, apart from any step that waits on the owner.
