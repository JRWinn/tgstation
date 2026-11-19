---
id: TRUST-10
title: A crew member stands still while its ID card or PDA is taken off it, tells nobody, and then no longer knows its own job, while the thief is that head to every other crew member
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_security.dm:1514, code/modules/llm_crew/crew_npc_cargo.dm:11, code/modules/llm_crew/crew_npc_senses.dm:14
fix: Have every body notice when its card, PDA or bag leaves it for someone else's hands, tell the brain who took it, and keep the job it was given at spawn as its own whatever card it holds
---

## What is wrong

A player can open any crew member's strip menu and take its ID card, its PDA or its bag. It takes a few seconds, during which the victim is shown "X is trying to remove your ID". A player would step away, shout, or hit back. A crew body does none of that, because nothing on the server tells it: the one listener for things leaving the body, `on_kit_gone`, is registered only for security staff, and only reports a baton or cuffs.

What follows:

1. **The thief becomes that crew member to everyone else.** A Head of Personnel's card says "Head of Personnel" and has the head's own name on it, and every crew NPC goes by the card (HOLE-01). A player wearing it is obeyed as that head: summons to meetings, orders to the Quartermaster, warrants to the Head of Security, the cargo door rules that follow the head's word. Unlike a forged card, nothing about it is wrong to check: the name and job match the PDA list.
2. **The crew member forgets its job.** `job_title` reads the job off the card the body carries. With none, it falls back to `get_assignment`, which is "" with no card. `works_in_cargo`, `works_in_security`, `works_in_engineering` and `is_quartermaster` all turn false, so the server refuses its tools ("Ordering supplies is cargo's job"). Its doors stop opening. The window keeps the old job (`brain.job = npc.job || brain.job`), so it goes on asking for tools the server now refuses, every step, for the rest of the round.
3. **Nobody is told.** Not the body's own brain, not security, not its head. Its window shows no event at all.

One concrete case: an assistant, Bob Hale, opens the Head of Personnel NPC's strip menu in its office and takes its ID, Jane Marsh's. He puts it in his own PDA and presses "Imprint ID": his PDA is now "Jane Marsh, Head of Personnel" (`imprint_id`), and since his PDA was made at round start it comes before the real one in the PDA list (TRUST-08). He sends the Head of Security "Warrant for Ann Lee, for theft." `deskTakes` gets `fromJob` "Head of Personnel": a head may declare a warrant on anyone who is not a head, so it is taken, and the Captain is sent a copy saying Jane Marsh declared it. He sends the Quartermaster "Order 4 crates of janitorial supplies": taken down as the Head of Personnel's order. The real Head of Personnel stands in its office without its card, cannot open its own doors, and says nothing.

Face to face it works less well today, by accident: wearing another's card with his face showing, Bob is seen as "Bob Hale (as Jane Marsh)" while his voice is "Bob Hale", and the window's look-up by voice name finds no such person in view and falls back to Bob's own PDA. The fix proposed in API-02 (look the speaker up by handle) would close that gap and make the card count aloud as well. Whoever does API-02 should do this one with it.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1507`, the only listener, security only:

    if(security_senses_on || !works_in_security(body))
    	return
    ...
    RegisterSignal(body, COMSIG_MOB_UNEQUIPPED_ITEM, PROC_REF(on_kit_gone))

and `on_kit_gone` itself, which looks only at batons and cuffs.

`code/modules/llm_crew/crew_npc_cargo.dm:11`, `job_title`:

    var/obj/item/card/id/card = body.get_idcard(TRUE)
    return card?.assignment || body.get_assignment(if_no_id = "", if_no_job = "")

## How it was found

Read from the code. Not tried in a round. Not checked: the exact strip delay of an ID slot, and whether the strip menu's "is trying to remove" step sends any signal to the victim that could be listened to before the item is gone (`/datum/strippable_item/proc/start_unequip` in the base game is where to look).

## How to fix it

1. Move the `COMSIG_MOB_UNEQUIPPED_ITEM` listener out of security into `start_senses`, for every body. In the handler, for an ID card, a PDA, a bag, a headset, a baton or cuffs, do what `kit_taken` does: half a second later, if the thing is in someone else's hands, tell the brain "[taker] takes your [item] off you." with `struck_by`, `how = "took"`. Keep security's own reaction as it is.
2. If the strip menu has a start signal, use it too: then the body can step back a tile, which breaks the other person's do_after, the way a player would. Stepping away is a move, not a cheat.
3. Keep a body's own job as it was given at spawn: `create_crew_npc` knows the outfit; store its job title on the controller (`own_job`), and have `job_title()` return that. A person knows what their job is with or without the card; what the card changes is which doors open, and that the server already gets right by trying them.
4. In the window, a "took" event for an ID or a PDA is a theft: tell security (the desk's sighting path, with the place) and the body's own head by PDA, if it still has its PDA. The words are code; the model only reacts aloud.
5. What heads and security do about a player wearing a head's card is for the owner and HOLE-01: but a crew member who has just reported its card stolen by Bob Hale should not then take orders from Bob Hale as that head. With step 4 done, the window can keep the name of whoever took a card, and treat that person as of no rank.

Question for the owner: should every crew member step away from being stripped (step 2), or only report it? Stepping away makes the crew harder to rob than a careless player.

## How to test the fix

- Server compile.
- In a round: strip the Quartermaster NPC's ID. `game.log` should have the "laid hands on ... took" line, the window an event "X takes your ID card off you", and the Head of Security a PDA about it. The Quartermaster's window should still show its job, and its book tool should still work.
- Simulator: a `took` event for an ID in a scenario with a Head of Security: the desk gets word of it.
