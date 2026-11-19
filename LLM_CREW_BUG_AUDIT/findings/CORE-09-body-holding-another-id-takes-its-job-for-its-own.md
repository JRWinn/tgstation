---
id: CORE-09
title: A crew member holding someone else's ID card, or a PDA with one in it, takes that card's job for its own, on the server and in the window, for as long as it holds it
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:11, code/modules/llm_crew/crew_brain_link.dm:89, code/modules/mob/living/carbon/human/human_helpers.dm:117, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:412
fix: Read the body's own job from the card it wears first (get_idcard with hand_first FALSE), and send that same job_title() to the window instead of get_assignment
---

## What is wrong

See also: TRUST-10

See also: HOLE-01, which is about how the crew read other people's cards. This is about how a body reads its own.

A body's own job is read in two places, and both put a card held in the hand before the card worn on the body:

- `job_title()` calls `body.get_idcard(TRUE)`. With `hand_first` TRUE the base proc returns the ID of whatever is in the active hand, then the other hand, and only then the worn ID. Every job test on the server is built on `job_title()`: `works_in_cargo`, `works_in_security`, `works_in_engineering`, `is_quartermaster`, "Head of Personnel" in `learn_starting_places`, and whatever reads them.
- `ui_data` sends the window `"job" = body.get_assignment(if_no_id = "", if_no_job = "")`, whose `hand_first` also defaults to TRUE. The window takes it each update: `brain.job = npc.job || brain.job`, and `jobFor(brain.job)` is which job's `plan()` and `syncTasks` run, and `hierarchy.ts` reads who it answers to from it.

A held ID is not rare for a crew member:

- **Tidying.** `wants_tidying` takes any small item lying on the floor of the work area. A dropped ID card, or a PDA with a card in it (`GetID()` on a PDA returns its card), is picked up and carried to a table. For the whole carry the technician is not in cargo: `works_in_cargo()` is FALSE, `ui_data` sends `orderable = list()` and `freight = null`, and the window's `brain.job` is the card's job, so `jobFor` runs another job's `plan()` and `hierarchy.ts` has it answering to someone else.
- **Picking up** one named by the brain, or one taken out of a locker during a search.
- **Being given one.** A crew member handed something by a workmate (`hand_over`) keeps it: `on_item_in_hand` treats what comes to hand after `handed_at` as given. A player can only put a card in its empty hand through the strip menu (crew do not accept a "give" offer); that one is "unasked" and is put down when its hands are next free, which may be a while (`unasked_item_waits`). A Head of Personnel holding a player's card in that way is no longer a head to itself or its window, which is the very case `job_title`'s own comment was written against ("a head with no job walks off from its own staff meeting").

Holding a card is also how access works in the base game, and that part is right: a player holding a card opens what it opens. What is wrong is taking the job written on it as one's own.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:11`, `job_title`:

    	// Its own job is what its own ID says, whatever it looks like to anyone else. get_assignment()
    	// answers as a stranger would see it: with its face hidden, by a potted plant held up in front of
    	// it, say, that is no job at all, and a head with no job walks off from its own staff meeting.
    	var/obj/item/card/id/card = body.get_idcard(TRUE)
    	return card?.assignment || body.get_assignment(if_no_id = "", if_no_job = "")

`code/modules/llm_crew/crew_brain_link.dm:89`, in `ui_data`:

    			"job" = body.get_assignment(if_no_id = "", if_no_job = ""),

`code/modules/mob/living/carbon/human/human_helpers.dm:117` (base):

    /mob/living/carbon/human/get_idcard(hand_first = TRUE)
    	. = ..()
    	if(. && hand_first)
    		return
    	//Check inventory slots
    	return (wear_id?.GetID() || belt?.GetID())

`code/modules/llm_crew/crew_brain_rooms.dm:22` already does it the right way round for access:

    	return body.get_idcard(hand_first = FALSE) || body.get_idcard(hand_first = TRUE)

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:412`:

    brain.job = npc.job || brain.job;

## How it was found

Read from the code. Not seen in a round: no player has handed a crew member an ID yet, and I did not search the round logs for a tidy of an ID card.

## How to fix it

1. In `job_title`, read the worn card first, the way `crew_brain_rooms.dm:22` does: `var/obj/item/card/id/card = body.get_idcard(hand_first = FALSE)`. Only if there is no worn card at all, fall back to the hand (a body that has lost its own and picked up a spare is a separate question; see below). Drop the `get_assignment` fallback, which is also hand first.
2. In `ui_data`, send `"job" = npc.job_title()` instead of `get_assignment`. That also stops `TRAIT_UNKNOWN_APPEARANCE` from blanking the body's own job, which the window papers over today with `npc.job || brain.job`.
3. Leave the people-in-view `"job"` in `look_around` as it is here; HOLE-01 is the place to settle how others' cards are read.

Question for the owner: a crew member whose own ID has been taken, and who is then handed or finds another, has which job? The proposal keeps it to the card it wears, and with none worn, the one in its hand.

## How to test the fix

- Server compile.
- In a round, put your ID card in the Head of Personnel's empty hand through its strip menu. Without the fix its card in the window shows your job and it stops behaving as a head; with it, it stays the Head of Personnel.
- Drop an ID card on the Cargo Bay floor and wait for a technician to tidy it. Grep `crew_brain.log` for the technician's routine steps during the carry: with the fix they are still cargo steps.
