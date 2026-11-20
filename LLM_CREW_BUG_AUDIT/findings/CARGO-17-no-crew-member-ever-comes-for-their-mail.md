---
id: CARGO-17
title: No crew member ever comes for their mail, because no job reads the there is mail for you message, and a technician's own letter is sent to itself by PDA
kind: gap
severity: low
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:205, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:138, code/modules/llm_crew/crew_npc_freight.dm:278
fix: Give the mail notice fixed words that every job reads in readPickup's way, so the person goes to the counter when free, and leave out the technician's own name from the mail it messages about
---

## What is wrong

A technician takes the mail out of the mail crate into its bag (`collect_mail`), and for each person it holds mail for it sends one PDA message: "There is mail for you at cargo. Come by the counter in the Cargo Lobby when you can and I will hand it over." After that the `deliver` task is blocked until that person is in the technician's view, when it walks over and hands the mail over (`hand_mail`).

No window code reads that message. Heads, engineers, security and the Quartermaster have nothing in `readsMessage` or the shared readers (`readSummons`, `readPickup`, `readWanted`) for it, so they never go to the counter. The janitors do go, for the wrong reason (DESK-01: any message a janitor cannot read is taken as its supplies having come). So mail for a crew NPC reaches them only if they happen to walk into the technician's view, which for most of them (the Chief Engineer, the Head of Security, the officers) is never. The letters ride in the technician's bag for the round. A human player gets the PDA and can come, so this only touches NPC crew.

A smaller slip in the same place: a letter addressed to the technician itself. The server lists every name in its bag (`freight_state`, `mail_for`), its own included. `syncFreight` makes a `deliver` task for its own name; it is never in `peopleInView`, so `planFreight` sends a PDA message to itself. `tool_message` cannot find its own name on its PDA ("You cannot find that person on your PDA"); `afterFreight` marks it told all the same, and the task is blocked for good with the letter unopened in its bag. A player would just open it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:195`, in `planFreight`:

    case DELIVER: {
      const name = task.item ?? '';
      const person = brain.peopleInView.find((other) => other.name === name);
      if (person) {
        ...
      return {
        ready: true,
        step: `You are holding mail for ${name}, and are sending them a PDA message to say it is waiting at the counter.`,
        act: {
          tool: 'message',
          person: name,
          text: 'There is mail for you at cargo. Come by the counter in the Cargo Lobby when you can and I will hand it over.',

`freight.ts:138`, blocked once told:

    const told = task.item in brain.mailTold || !brain.hasPda;
    blockTask(
      task,
      here || !told
        ? null
        : `${task.item} has been told, and has not come to the counter for it yet`,
    );

`code/modules/llm_crew/crew_npc_freight.dm:278`, every name in the bag, its own included:

    for(var/obj/item/mail/letter as anything in mail_carried())
    	var/whose = crew_npc_mail_for(letter)
    	if(whose)
    		mail_for |= whose

`grep -rn "mail for you" tgui/packages/tgui/interfaces/CrewBrain` finds only the line that sends it.

## How it was found

Read from the code: the one place the line is written, and every PDA reader in `brain.ts` (`readSummons`, `readPickup`, `readWanted`, then the job's `readsMessage`), none of which looks for it. Not seen in a round log.

## How to fix it

1. Put the line in `supply.ts` as a fixed phrase, `MAIL_WAITING = 'There is mail for you at cargo.'`, the way the other cargo lines are kept there, and send it from `freight.ts`.
2. Add a shared reader next to `readPickup` (in `pickups.ts` or a small `mail.ts`), called from the same place in `brain.ts`: a message from someone in a cargo job that starts with `MAIL_WAITING` adds a routine task "collect your mail" to go to the Cargo Lobby when the body has nothing more pressing, wait at the counter a short while, and drop the task when the mail is in hand or after one try. Routine urgency, so it never pulls anyone off real work. Make DESK-01's janitor reader skip this phrase.
3. In `syncFreight`, leave out `brain.name` from `holding`. If the owner wants the technician to open its own mail, that is one click on the letter in hand: say so as a question for the owner, since it is new behaviour.
4. Keep "The mail waits for them": a person with no PDA is still handed theirs when they come into view.

## How to test the fix

- Simulator: a mail crate with a letter for the Chief Engineer and one for the technician. Want one PDA message to the Chief Engineer, none to the technician itself, and the Chief Engineer later going to the Cargo Lobby and being handed its letter.
- Type check.
- In a round, grep `pda.log` for "There is mail for you at cargo" and `game.log` for "You hand <name> the mail" for an NPC name.
