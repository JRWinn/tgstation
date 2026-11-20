---
id: CORE-09
title: A crew member holding someone else's ID card, or a PDA with one in it, takes that card's job for its own, on the server and in the window, for as long as it holds it
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 8406c5717a3
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:11, code/modules/llm_crew/crew_brain_link.dm:89, code/modules/mob/living/carbon/human/human_helpers.dm:117, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:412
fix: Read the body's own job from crew_npc_own_card (worn card first, hand only if none worn), and send that same job_title() to the window instead of get_assignment
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

1. In `job_title`, use the helper that already exists: `var/obj/item/card/id/card = crew_npc_own_card(body)` (`crew_brain_rooms.dm:21`). It returns the worn card (ID slot, then belt) and only with none worn the one in a hand, which is the fallback step 1 asks for. Note that the base `get_idcard(hand_first = FALSE)` on its own returns only the worn card, never the hand. Drop the `get_assignment` fallback, which is also hand first; keep a fallback only for a worn PDA with no card in it if that matters (`get_assignment` reads `pda.saved_job` then), e.g. `get_assignment(if_no_id = "", if_no_job = "", hand_first = FALSE)`.
2. In `ui_data`, send `"job" = npc.job_title()` instead of `get_assignment`. That also stops `TRAIT_UNKNOWN_APPEARANCE` from blanking the body's own job, which the window papers over today with `npc.job || brain.job`.
3. Leave the people-in-view `"job"` in `look_around` as it is here; HOLE-01 is the place to settle how others' cards are read.

Question for the owner: a crew member whose own ID has been taken, and who is then handed or finds another, has which job? The proposal keeps it to the card it wears, and with none worn, the one in its hand.

## How to test the fix

- Server compile.
- In a round, put your ID card in the Head of Personnel's empty hand through its strip menu. Without the fix its card in the window shows your job and it stops behaving as a head; with it, it stays the Head of Personnel.
- Drop an ID card on the Cargo Bay floor and wait for a technician to tidy it. Grep `crew_brain.log` for the technician's routine steps during the carry: with the fix they are still cargo steps.

## Check

Read `job_title` (`crew_npc_cargo.dm:11`), `ui_data` (`crew_brain_link.dm:89`), base `get_assignment` (`human_helpers.dm:9`, `hand_first = TRUE` by default), human `get_idcard` (`human_helpers.dm:117`) and living `get_idcard` (`living.dm:633`, active hand then other hand), and `/obj/item/modular_computer/GetID` (`computer.dm:268`, returns the stored card). All quotes match the code today. With `hand_first` TRUE any ID or PDA-with-ID in either hand wins over the worn one, so both the server's job tests (nine `job_title()` callers: cargo, security, engineering, quartermaster, HoP, janitor inventory) and the window's `brain.job` -> `jobFor` follow the held card. `wants_tidying` (`crew_npc_tidying.dm:48`) has no filter against ID cards or PDAs (only bulky, anchored, pulled, abstract, shards, named mail), so a technician tidying a dropped card carries another job for the length of the carry. Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose this; the only `job_title` entry is the spawn-time fix (H1). The fix is sound and small; `crew_npc_own_card` already does the right order and is used for the card colour, so the window's name colour and its job already disagree in this case. Severity medium stands: it needs a held card, which tidying makes possible in ordinary rounds, but the job comes back when the card is put down. Not run in a round.
