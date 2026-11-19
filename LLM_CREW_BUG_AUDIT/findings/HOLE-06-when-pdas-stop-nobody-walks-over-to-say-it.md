---
id: HOLE-06
title: When PDA messages stop going out the crew are never told, word owed by PDA is dropped after eight minutes, and nobody walks over to say it
kind: gap
severity: high
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: design
files: code/modules/llm_crew/crew_npc_cargo.dm:719, code/modules/llm_crew/crew_npc_cargo.dm:770, code/modules/llm_crew/crew_brain_link.dm:146, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:873, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:222
fix: Tell the window when the body's PDA has not been sending, treat that as having no PDA, keep word that did not go, and add one general step that carries word to someone in person
---

## What is wrong

The change log lists this under "Not the crew's fault": "PDA messages stop when station power goes. In that round every 'Your PDA would not send the message.' begins at 26 minutes, and `pda.log` has no line after it" (`LLM_CREW_CHANGELOG.md:1038`). The cause in the base game is real: a PDA message needs the message server machine, and that needs power. But what the crew do about it is ours, and it is nothing. Almost every hand-off between crew goes by PDA, so from that minute the crew stop working together for the rest of the round. This write-up adds the cause on our side and a fix.

What the code does when a send fails:

1. **The server keeps the message and tries again for eight minutes, then drops it** (`resend_unsent`: `CREW_NPC_UNSENT_KEPT` is 8 minutes, and 90 seconds for one with " now" in it). That was built for a communications blackout, which ends. A power failure does not end. After eight minutes the log says "gave up on the PDA message" and the word is gone.
2. **The window has already forgotten it.** A word waiting in `brain.toTell` is taken off the list the moment the tool call is sent, not when the server says it went: `noteDone` runs straight after `issue(step.act)` in `drive`, and does `brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells)`. The server's answer, "Your PDA would not send the message", only puts the step's key in backoff. The step is no longer there to be tried.
3. **The body goes on being told it has a working PDA.** `"has_pda" = !isnull(npc.pda_messenger())` is true as long as the PDA is in its pocket. Every plan that asks `brain.hasPda` (35 places in the window code) goes on choosing the PDA. `needStep` is typical: with the head not in view it sends a PDA message; only `if (!brain.hasPda)` makes it wait to say it face to face.
4. **Nobody goes to find anyone.** There is no step anywhere for "walk to where they work and tell them". The only face-to-face fallbacks are particular ones: the Head of Personnel takes an order to the cargo counter if the Quartermaster does not answer, and the Quartermaster gives orders to technicians face to face by design.

What stops for good once PDAs are down, read from the plans in the window code:

- A head's call to a staff meeting (the Head of Personnel's whole meeting is called by PDA). Staff never hear of it. It holds the meeting alone and "reports" to a Captain who never gets the report.
- Every report to the Captain: staff meetings, warrants declared and how they went, "the emitters are off", the Quartermaster's "Yes or no?" on a big purchase. That last one holds the order for ever.
- A warrant given to an officer who is out of sight, and the officer's word back ("in cuffs", "I am hurt", "lost them").
- Cargo's "your order has come in" with the manifest number. Without the number nobody is sent to collect, and the crate sits in the bay.
- A technician's or a head's call to a janitor about a mess.
- A shut-in body's word to whoever let it in, to a door keeper, and to its head.
- A head's order to the Quartermaster, and the Quartermaster's "noted".

One concrete case, from the round the change log names: at 26 minutes the Head of Personnel sends "Staff meeting in the Bar Lounge now, please" to three janitors. None goes. The server retries each for 90 seconds and gives up. The head walks to the lounge, waits `GATHER_MAX_DS` (3 minutes), closes the meeting with "0 of 3 there", and sends each janitor "the staff meeting is over. Send me your report by PDA" and the Captain its report. Those are dropped in turn. Ten minutes later it does it all again.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:719`, `tool_message`:

    	if(!own_messenger.send_message_signal(body, text, list(target)))
    		...
    		action_result(CREW_TOOL_MESSAGE, FALSE, "Your PDA would not send the message. You will try it again when your PDA is working.")
    		return

`code/modules/llm_crew/crew_npc_cargo.dm:770`, `resend_unsent`:

    		if(isnull(target) || world.time - kept["at"] > (findtext(text, " now") ? CREW_NPC_UNSENT_NOW_KEPT : CREW_NPC_UNSENT_KEPT))
    			unsent_messages -= unsent_key
    			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) gave up on the PDA message to [to_name] that would not send: [text]")

`code/modules/llm_crew/crew_brain_link.dm:146`:

    			"has_pda" = !isnull(npc.pda_messenger()),

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:873`, `noteDone`, called at `driver.ts:824` before any result is heard:

      if (step.tells) {
        brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:222`, `needStep`:

      if (!brain.hasPda) {
        return {
          ready: false,
          step: `You need ${need}. ${head} is who to ask, and they are not here.`,
        };
      }

The base-game side, for the cause: `send_message_signal` in `code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:573` returns FALSE when `signal.data["done"]` is not set, which is what happens with no working message server ("ERROR: Server is not responding.").

## How it was found

Read from the code, starting from the change log's line 1038 and the owner's note that test rounds lose power at about fifteen minutes and PDAs at about twenty-six. The retry and give-up were read in `resend_unsent`. The window dropping the word at send time was read in `drive` and `noteDone`. Not seen: I did not open that round's logs again.

## How to fix it

1. **Tell the window the truth about the PDA.** On the controller keep `pda_failing_since`: set to `world.time` when a send fails and it is 0, set back to 0 when any send succeeds. Send `"pda_down" = pda_failing_since && world.time - pda_failing_since > 30 SECONDS` in `ui_data`. This is something the body knows: its own PDA shows the error. In `ingest`, set `brain.hasPda = !!npc.has_pda && !npc.pda_down`, and keep `brain.pdaDown` for the wording of steps and cues. With that one change every `if (!brain.hasPda)` branch already written starts to be used: needs are told face to face when the head is in view, a head calls staff that are in view aloud, and so on.
2. **Do not forget word that did not go.** In `noteResult` in `driver.ts`, when `last.act.tool === 'message'` and the result is not ok, and the step had `tells`, put the tell back on `brain.toTell` (keep the `Step` on `brain.lastAct` so it can be found). Its `keepMs` still ends it in time.
3. **One general step: carry word in person.** In `nextStep`, where a `byPda` tell is picked only `if brain.hasPda`, add the other branch: with no working PDA and the person not in view, walk to where they are likely to be and say it when they come into view. Where that is, from what the body already knows: `brain.people` (where it last saw them), else the room their job works from (a small table by job: heads to their office, technicians to the cargo counter, officers to the Security Office, janitors to the Custodial Closet; the server already sends `office`, `staff_post` and `head_office` for some of these). One walk per tell, and only for tells marked as worth a walk (`walk: true`): a warrant, an officer hurt, an order to the Quartermaster, a crate's number, a shut-in call. A meeting report is not worth a walk.
4. **A head with no PDA calls its meeting by going round.** The simplest honest rule: with PDAs down, the Head of Personnel holds no meeting it cannot call aloud, and says so in its next report. Decide with the owner.
5. Drop the eight-minute limit on the server for messages that are not about "now", or raise it to the length of the round: once the window keeps the word (step 2) the server's copy matters less, but a blackout longer than eight minutes still loses whatever the window had already let go.

This keeps the rules: hand-offs are still said aloud or sent by PDA, nothing is passed by a hidden channel, and nothing goes to the model.

Questions for the owner:
- Which words are worth a walk across the station, and which are let go?
- When PDAs are down, should the crew also try the radio? They cannot use it today at all (see HOLE-07). The radio dies with power too, so it does not replace step 3.

## How to test the fix

- Simulator: `sim.ts` plays the server, so add a switch that makes every `message` tool answer "Your PDA would not send the message" and sets `pda_down` after thirty seconds. Run `crew`, `qm` and `warrant` with it on from the start. Checks: the janitor's need reaches the head (said face to face at the meeting or on a walk), the warrant reaches the officer, and no brain has an empty `toTell` with a failed message as its last act.
- Type check and server compile.
- In a round: cut the message server's power (or wait for power to fail) and grep `game.log` for "was told by its brain to say" lines that carry what the PDA lines carried before.
