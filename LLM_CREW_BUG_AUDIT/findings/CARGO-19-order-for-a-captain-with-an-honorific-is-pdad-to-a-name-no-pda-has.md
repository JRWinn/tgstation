---
id: CARGO-19
title: An order taken at the counter for someone whose ID shows an honorific is held for and messaged to the shown name, which no PDA has, so the crate number never reaches them
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:364, code/modules/llm_crew/crew_npc_cargo.dm:518, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1084, code/modules/llm_crew/crew_npc_cargo.dm:710
fix: In tool_order take order_for from the asker's ID name without the honorific (get_id_name with honorifics FALSE), the name their PDA goes by, falling back to the seen name
---

## What is wrong

See also: API-02, which sets out that the server names one person three ways (voice, seen name, PDA name). This is one more place it bites, in the order path, which API-02 does not list. Also JOBS-07 (the same split in the mail).

An order taken at the counter, with no Quartermaster aboard or after a head says the Quartermaster has not answered, is placed "for" whoever asked. The window passes the asker's handle; the server turns it into `asker.name`, the mob's seen name. With an honorific on the ID that is "Captain Smith", not "John Smith". Everything after that goes by the seen name:

1. The held crate is `for_name = "Captain Smith"`, and is labelled "#12 for Captain Smith".
2. The notice owed is `to = "Captain Smith"`. The window's `order` task sends the PDA "Your order has come in: crate #12 ..." to "Captain Smith".
3. `tool_message` strikes the notice off first (it matches the name it was given), then looks the name up among PDAs by `saved_identification`, which is the card's registered name, "John Smith". No match: "You cannot find that person on your PDA." The notice is already gone, so the window closes the task as told.
4. Every five-minute reminder ("Still waiting at cargo: crate #12 ...") goes to the same name and fails the same way.

The Captain, who asked for the crate face to face, is never sent its number. They can only get it by coming back and asking without one (and then hit CARGO-08).

Concrete case: the owner plays the Captain with the "Captain" honorific shown on their ID. No Quartermaster aboard. At the counter: "Sam, can you order a crate of light bulbs?" The model agrees; `brain.ts` sets `action.for = <Captain's handle>`; `tool_order` sets `order_for = asker.name` = "Captain Smith". The shuttle docks; `order_arrived` adds `notices_owed += list("to" = "Captain Smith", ...)`. Sam's `plan` sends `message("Captain Smith", ...)`; the server answers "You cannot find that person on your PDA." `pda.log` has no line to the Captain.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:362`, in `tool_order`:

    var/datum/weakref/asker_ref = istext(for_handle) ? handle_people[for_handle] : null
    var/mob/living/carbon/human/asker = asker_ref?.resolve()
    order_for = QDELETED(asker) ? last_heard_speaker : asker.name

`crew_npc_cargo.dm:518`, in `order_arrived`:

    notices_owed += list(list("to" = order_for, "kind" = CREW_NOTICE_ARRIVED, ...

`crew_npc_cargo.dm:707`, in `tool_message`, the notice struck before the name is looked up:

    var/wanted = LOWER_TEXT(trim(person_name))
    var/datum/computer_file/program/messenger/target = messenger_named(wanted, own_messenger)
    // Having tried is enough. ...
    for(var/list/notice as anything in notices_owed)
    	if(LOWER_TEXT(notice["to"]) == wanted)
    		notices_owed -= list(notice)
    		break
    if(isnull(target))
    	action_result(CREW_TOOL_MESSAGE, FALSE, "You cannot find that person on your PDA.")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1084`, the PDA the window sends:

    return {
      ready: true,
      step: `What ${arrived.to} ordered has come in: ...`,
      act: {
        tool: 'message',
        person: arrived.to,

The base game: `code/modules/mob/living/carbon/human/human_helpers.dm:107`, `get_id_name(if_no_id, honorifics = FALSE)` gives the card's name without the honorific.

## How it was found

Read from the code on both sides and in the base game's naming procs, following API-02's account of the seen name. Not seen in a round: no round log has a player with an honorific showing. "Likely" because it needs the honorific turned on (or someone ordering while wearing another's card, which fails the same way and arguably should).

## How to fix it

1. In `tool_order`, when the asker is known by handle, set `order_for = asker.get_id_name(if_no_id = asker.name, honorifics = FALSE)`. That is the name written on the card they are seen wearing, which is what a technician would write on the crate and look up on its PDA. A masked asker with no ID stays as seen ("Unknown"), and the PDA fails as it should.
2. Leave the Quartermaster path alone: there the name comes from the Quartermaster's book, which takes it from the PDA that sent the order.
3. Separately (SUP-07, SIM-01), have `tool_message` strike a notice only once the message has gone, so a bad name is not taken for told.

## How to test the fix

- A simulator case cannot show it: the stand-in PDA sends to any name (SIM-01). Fix SIM-01's stand-in first so it looks names up, then add a counter order from a person whose seen name differs from their PDA name, wanting the arrival PDA to the PDA name.
- In a round, as Captain with the honorific shown, order a crate at the counter with no Quartermaster aboard, and check `pda.log` for "Your order has come in" to your name.
