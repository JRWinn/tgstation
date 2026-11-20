---
id: KNA-35
title: Any PDA message that will not send and happens to have the word now in it is given up after ninety seconds, reports to the Captain included, and the window has already let it go
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:770, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:824, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:874, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:614
fix: Have the window mark a message as short-lived when it sends it (meeting calls only) and keep every other unsent message the full eight minutes, whatever words are in it
---

## What is wrong

The change log entry of 2026-11-18, 16:15, item 25, built the keeping and resending of PDA messages that will not send, and lists under "Known and not fixed": "A message that says 'now' for some other reason is dropped after a minute and a half like a meeting call." No later entry changes it. It is a guess from the words of the message, and it matters more than it looks, because the window does not send these again itself.

The server keeps an unsent message for 8 minutes, or for 90 seconds if `findtext(text, " now")` finds anything (`findtext` is not case-sensitive and matches inside longer words too, " nowhere" among them). The meeting call ("Staff meeting in the X now, please") is the one it was meant for. Other lines the code sends word for word that have " now" in them:

- the Quartermaster to the Captain, `quartermaster.ts:614`: "Captain, order 2 no longer needs your say: there are 1,100 credits free in the budget now, and it comes to 400. I am having it placed." (sent in `data/logs/2026/11/19/round-20.43.32` at 02:54:47);
- the Quartermaster to a head, `quartermaster.ts:391`: "... What cargo can get just now: ...";
- the Chief Engineer's "Emitters off, now." when sent by PDA;
- any line the model writes into a `message`, which it often words with "now".

On the window side, a message queued in `toTell` is struck off when the step is issued, before the server says whether it went (`noteDone` is called at `driver.ts:824`, and clears `toTell` at `driver.ts:874`). So once the server gives up, nobody sends it again. In a Communications Blackout that lasts more than 90 seconds (the 16:15 entry's lasted five minutes), the Captain never hears that an order was placed without its say.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:770`, in `resend_unsent`:

    		if(isnull(target) || world.time - kept["at"] > (findtext(text, " now") ? CREW_NPC_UNSENT_NOW_KEPT : CREW_NPC_UNSENT_KEPT))
    			unsent_messages -= unsent_key
    			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) gave up on the PDA message to [to_name] that would not send: [text]")

`code/modules/llm_crew/_defines.dm`:

    #define CREW_NPC_UNSENT_KEPT (8 MINUTES)
    #define CREW_NPC_UNSENT_NOW_KEPT (90 SECONDS)

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:874`, in `noteDone`, run when the step is issued:

    if (step.tells) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
    }

## How it was found

Read from the code, starting from the change log's own note. Not seen in a round: no blackout has fallen on one of these lines yet.

## How to fix it

1. Let the `message` tool take an optional `expires` (seconds) from the window. `tool_message` passes it to the kept entry as `kept["keep"]`, and `resend_unsent` uses `kept["keep"] || CREW_NPC_UNSENT_KEPT` in place of the `findtext`.
2. In `jobs/head.ts` (the two meeting calls), `jobs/meetings.ts` and the "I am holding a staff meeting ... now" line, set `expires: 90` on the action. Nothing else sets it.
3. Keep working: a meeting call still dies after 90 seconds, and the log line "gave up on the PDA message" still names it.

## How to test the fix

Server compile and the type check. In a round, set off a Communications Blackout (admin random event) just before the Quartermaster's budget line is due, and lift it after two or three minutes: `game.log` should have "sent Zim Fire the PDA message that would not go before: Captain, order N no longer needs your say ...", where today it has "gave up on".
