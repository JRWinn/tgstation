---
id: GAP-13
title: Nobody notices a person hurt, down or dead, the harm senses were written and never switched on
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
area: senses
files: code/modules/llm_crew/crew_npc_danger.dm:8, code/modules/llm_crew/crew_npc_senses.dm:127, code/modules/llm_crew/crew_npc_tools.dm:13, LLM_CREW_PLAN_SECURITY.md:272
fix: Call watch_for_harm from look_around for people in view, and build the one use the plans name, any crew member who sees someone lying still tells its head or the Captain once
---

## What is wrong

`code/modules/llm_crew/crew_npc_danger.dm` holds a finished sense: it compares each person in view with how they looked a moment ago and tells the brain when someone has been hurt, has collapsed, has died, or is lying still, and who is standing over them with what in their hand. Its header says:

    * NOT SWITCHED ON. Nothing calls watch_for_harm(), and the flee tool is not one the brain can call.
    * The brain window has no handling for danger yet.

That is still true. `watch_for_harm` and `forget_old_looks` have no callers, `CREW_TOOL_FLEE` is not in the list of tools `handle_tool_call` accepts, and nothing in the window reads a `danger` event. Security was given its own narrower sense for being hit (`on_struck`, `start_security_senses`). Everyone else, and security for anyone but itself, sees nothing.

The plans lean on this in three places and none is built:

- `LLM_CREW_PLAN_SECURITY.md` 3.7, marked **Mine** and accepted with the rest: "any crew NPC that sees a security officer lying still tells the Captain by PDA, once: 'Captain, Officer Hale is down in the Bar.' That is the first use of handing a fault on, which the owner described on 2026-11-16." Section 3.0 lists it: "Not built."
- The brief's vision, section 1: crew that "react to problems".
- The change log, 20:53 entry: "Nothing more of it in any log by 20:55. No word was sent to the Head of Security, who went on believing the warrant was being served." and "Nobody goes to an officer who is down."

What the crew does today, from the logs the change log quotes: in `round-17.06.14` Pun Pun beat three janitors and the officer unconscious and put each in a disposal unit, a technician "sent one janitor four clean-up requests in 100 seconds, two of them after seeing it lying on the floor", and the Head of Personnel went on calling the downed janitors to meetings. In `round-20.43.32` the officer went down in the Courtroom and nobody was told.

The owner said on 2026-11-18, of crew who are down: "We have no medical yet so not important". So *helping* them is put off. *Knowing* is not the same thing and costs little: a head that knows a janitor is down stops sending it for crates and stops counting it absent without reason, and the Head of Security that knows its officer is down serves the warrant itself, which is built already for an officer that says "I am hurt" and never fires for one that drops without a word.

## Where

`code/modules/llm_crew/crew_npc_danger.dm:22`:

    /datum/ai_controller/crew_npc/proc/watch_for_harm(mob/living/carbon/human/person, list/in_sight)

with no caller (a search of `code/modules/llm_crew/` for `watch_for_harm` finds only its own definition and the header).

`code/modules/llm_crew/crew_npc_tools.dm:13`: the accepted tools, which do not include `CREW_TOOL_FLEE`, though `describe_doing` (`crew_npc_hands.dm:474`) and `crew_npc_grip.dm:430` both handle it.

`code/modules/llm_crew/crew_npc_senses.dm:127`, `look_around`, is where the header says the call belongs.

## How it was found

Read from the code. The round lines are from the change log, not reread in the logs.

## How to fix it

Keep it small and coded: no new prompt text for every NPC, and nothing asked of the model.

1. **Server.** In `look_around`, for each human in view call `watch_for_harm(person, in_sight)`, then `forget_old_looks()` once. Leave out the body itself for now (security has `on_struck`; the "You have just been hurt" line for everyone would wake every LLM in a fight). Keep only the kinds that matter for knowing: `CREW_HARM_DOWN`, `CREW_HARM_BODY`, `CREW_HARM_COLLAPSED`, `CREW_HARM_DIED`. Drop `CREW_HARM_HURT` for bystanders or it will fire on every baton hit of a lawful arrest. Someone cuffed and held by security, or asleep in a cell, is not "down": check `crew_npc_cell_holding(person)` and `person.pulledby`.
2. **Window, a shared duty** (beside `jobs/wanted.ts`, which has the same shape: see something, send one PDA message, throttle by person and room). On a `danger` event for someone down: if they are one of its own department, tell its head; if they are a head or security, or it has no head aboard, tell the Captain. Fixed words: "Joan, Nova Hale is down in the Courtroom." Once for each person in ten minutes, not while the receiver is in sight, and never by the person who is holding them under arrest.
3. **Readers.** `jobs/head.ts`: a head told one of its staff is down marks them so (not sent for crates, not called on at the meeting, named in the Captain's report: "Finn is down in the Bar"). `jobs/desk.ts`: the Head of Security told its officer is down treats it as it treats "I am hurt" (`outcome` hurt: it serves the warrants itself and tells the Captain).
4. **Callers of janitors.** `tidyStep` in `jobs/cargo.ts` should not call a janitor it has seen down in the last ten minutes: pick another (`janitorsOnPda`).
5. Leave `tool_flee` off. Running from danger is the reactions work the owner has put off.
6. The talk side: mark the event so it does not wake the LLM by itself (`shouldWake` in `brain.ts`), or every body in the bar will remark on it.

Question for the owner: "not important" was said about crew who are down, for want of a medical department. Is telling a head (and nothing more) wanted now, or should this wait with the rest?

## How to test the fix

- Simulator: the `hurt` and `fight` scenarios already put an officer down. Add a bystander janitor in sight and check one PDA message to the Head of Security, and that the Head of Security then serves the warrant. A second scenario: a janitor is down, a technician with a mess to report calls the other janitor.
- `tools/llm_crew/security.ts`: cases for the new fixed line and its reader.
- Server compile. In a round with the "Revenge of Pun Pun" trait, `grep -n "is down in" pda.log`.
