---
id: JOBS-07
title: Mail is never handed to someone whose ID shows an honorific, such as Captain John, because the mail is listed under the real name and the person in view goes by the shown name
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:138, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:197, code/modules/llm_crew/crew_npc_freight.dm:113, code/modules/llm_crew/crew_npc_senses.dm:191
fix: Have freight_state send, for each name in mail_for, the handle of that person when they are in view (matched by mind on the server), and match DELIVER on that handle instead of on the name
---

## What is wrong

See also: API-02, which sets out that the server names one person in three ways. This is that fault in the mail. Also CARGO-19 (the same split in a counter order).

`freight_state` lists who the carried mail is for by `crew_npc_mail_for(letter)`, which is `recipient.current?.real_name` ("John Smith"). The window decides whether that person has come to the counter by looking for that exact string among the people in view: `brain.peopleInView.some((person) => person.name === task.item)`. But `people_in_view[].name` is the mob's visible name (`person.name`), and a player who has toggled the honorific on their ID (ctrl-click on the card) shows as "Captain John" or "Captain Smith" (`get_id_name` with honorifics, `update_honorific` in `cards_ids.dm`). The same happens to anyone seen as "Face (as ID name)" while wearing someone else's card.

For such a person `here` is never TRUE. The `DELIVER` task is blocked "has been told, and has not come to the counter for it yet" for the rest of the round, `planFreight` never gives `hand_mail`, and `freightCues` never says they are here. They can stand at the counter all day. The server's `hand_mail_over` would have worked, since it matches by mind; it is simply never asked.

One concrete case: the Captain, played by the owner, turns on the honorific on their ID. A mail crate comes in with a letter for John Smith. The technician takes it out and sends "There is mail for you at cargo." The Captain walks to the Cargo Lobby counter. The technician sees "Captain Smith", which is not "John Smith", and does nothing. Asked by the Captain for the mail, the model may say it will hand it over (the cue says the body does that by itself), and the body does not.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:138`, in `syncFreight`:

    const here = brain.peopleInView.some((person) => person.name === task.item);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:197`, in `planFreight`:

    const person = brain.peopleInView.find((other) => other.name === name);
    if (person) {
      return { ... act: { tool: 'hand_mail', person: person.handle } };

`code/modules/llm_crew/crew_npc_freight.dm:113`, in `crew_npc_mail_for`:

    return recipient.current?.real_name || recipient.name

`code/modules/llm_crew/crew_npc_senses.dm:191`: `"name" = person.name` for each person in view.

## How it was found

Read from the code on both sides, and the base `get_id_name`, `get_visible_name` and `update_honorific`. Not seen in a round.

## How to fix it

1. Server, `freight_state`: as well as `mail_for` (names, for the PDA message and the cues), send `mail_here`: for each person in view (`handle_people`) whose mind is the recipient of a carried letter, their handle. `mail_carried_for` already does the mind match.
2. Window, `brain.ts` ingest: carry `mailHere` (handles) on `brain.freight`.
3. `syncFreight` and `planFreight`: a `DELIVER` task's person is here if any person in view has a handle in `mailHere` and is the one the letter is for; hand the mail to that handle. Keep the name for the PDA message (`pda_people` go by the registered name, which is the real name).
4. Better still, do it once for every name match: API-02's fix (find people by handle) is the general one.

## How to test the fix

- Simulator: a cargo scenario where the stand-in server lists the mail under "John Smith" and the person in view as "Captain Smith" with `mail_here` set to their handle. The technician must send `hand_mail` with that handle.
- In a round, toggle the honorific on the Captain's ID and go to the counter with mail waiting. `game.log` should show "You hand ... the mail that came for them."
