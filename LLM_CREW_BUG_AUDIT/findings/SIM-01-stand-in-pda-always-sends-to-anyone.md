---
id: SIM-01
title: The simulator's PDA always sends, to any name at all, so no scenario can reach a message that fails
kind: bug
severity: low
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:723, code/modules/llm_crew/crew_npc_cargo.dm:692, tools/llm_crew/sim.ts:1116
fix: List every player in the stand-in's pda_people, make the stand-in message case look the name up in that same list and fail with the server's words when it is not there, and add a PDA-down switch that answers with the would-not-send words and keeps the message to resend
---

## What is wrong

In the game a PDA message can fail three ways, and each comes back to the brain as `ok: 0` with its own words:

- the body has no PDA: "You have no PDA to send a message with."
- the name is not on its PDA: "You cannot find that person on your PDA."
- the PDA will not send (power out, a communications blackout, a broken relay): "Your PDA would not send the message. You will try it again when your PDA is working."

The third is not rare. The change log (line 1038, and the memory note on power) says test rounds lose station power about 15 minutes in and every PDA message fails from about 26 minutes. Most rounds that run longer than half an hour spend the rest of the round in that state.

The simulator's stand-in answers every `message` call with `ok: 1`, whoever it is to and whatever the state of the station. So every window path that runs on a failed message is dead code as far as the simulator is concerned. Each of these has been written up by other reviewers as a fault in the window code, and none of them can show in any scenario:

- `HEAD-05`: a head's order to the Quartermaster is sent again for ever when the PDA will not send (`head.ts` only sets `requisition.askedAt` when `ok`).
- `ARR-05`: word for the Head of Security stuck on a PDA that will not send.
- `HOLE-06`: when PDAs stop, nobody walks over to say it instead.
- `meetings.ts` `meetingsAfterActing`: a report sent by PDA because the janitor was shut out is only noted as given when `ok`, so with the PDA down it is sent again on every backoff.

It also hides any slip in the name a message is sent to. The stand-in does not look the name up at all: a message to "Captain", to a first name, or to someone who has no PDA comes back as sent. In the game it comes back "You cannot find that person on your PDA", and the server has already struck the notice owed to that name (`notices_owed` is cleared before the lookup), so the window believes the word went.

Concrete case: run `sim.ts quiet qmlost` (or any scenario built by `spawnOrderDesk`). The Quartermaster sends Hal Pott, a player Head of Personnel, "Noted, order 1: ...". Hal Pott is not in the Quartermaster's `pda_people` in the stand-in (only players who are the Captain, a Quartermaster or a Chief Engineer are listed, line 1116), yet the message is answered "You send Hal Pott a PDA message." with `ok: 1`. The stand-in contradicts its own PDA list, and the check that the message was sent passes.

(Checker's note: in the game a player Head of Personnel has a PDA, and `messenger_named` searches every PDA aboard, so this message would go there too. The Hal Pott case is a fault in the stand-in's list, not one the window code is hiding. It matters for the fix: step 1 without step 2 would make `qmlost` and the other order-desk scenarios fail for no window fault.)

## Where

`tools/llm_crew/sim.ts:723`, the stand-in:

    case 'message': {
      const target = bodies.find((other) => other.name === args.person);
      ...
      if (target) emit(target, 'pda_message', ...);
      ...
      return result(body, 'message', true, `You send ${args.person} a PDA message.`);
    }

`code/modules/llm_crew/crew_npc_cargo.dm:692`, the real `tool_message`:

    var/datum/computer_file/program/messenger/target = messenger_named(wanted, own_messenger)
    // Having tried is enough. ...
    for(var/list/notice as anything in notices_owed)
        if(LOWER_TEXT(notice["to"]) == wanted)
            notices_owed -= list(notice)
            break
    if(isnull(target))
        action_result(CREW_TOOL_MESSAGE, FALSE, "You cannot find that person on your PDA.")
        return
    ...
    if(!own_messenger.send_message_signal(body, text, list(target)))
        ...
        action_result(CREW_TOOL_MESSAGE, FALSE, "Your PDA would not send the message. You will try it again when your PDA is working.")
        return

`tools/llm_crew/sim.ts:1116`, the stand-in's PDA list:

    pda_people: [...bodies.filter((other) => other !== body), ...players.filter((player) => player.job === 'Captain' || player.job === 'Quartermaster' || player.job === 'Chief Engineer')].map(...)

Two smaller differences in the same case: the real line is `from [sender], [sender_job]: "..."` (the stand-in leaves out the job), and the real text has line breaks folded to spaces before the 200 character cut.

## How it was found

Read from the code: the stand-in case, the real `tool_message`, `messenger_named` and `resend_unsent`. The Hal Pott case was read from `spawnOrderDesk` and the `pda_people` line, not run.

## How to fix it

1. In the stand-in `message` case, look `args.person` up (case-insensitive) in the list the stand-in itself sends as `pda_people` for that body. Make that list one function (`pdaPeople(body)`) so `uiData` and `message` use the same one. If the name is not there, strike the owed notice first (as the server does) and answer `ok: 0`, "You cannot find that person on your PDA."
2. List every player in `pda_people` (the game's `people_on_pda`, `crew_npc_cargo.dm:666`, lists every PDA on the station level). Pun Pun has none, which is right. Do this in the same change as step 1, or the order-desk scenarios fail on the stand-in's own short list.
3. Add a station state `pdaDown: { from, until }`, set by a new scenario (and by a `PDA_DOWN=<second>` environment switch any scenario can take). While it holds, answer `ok: 0` with the would-not-send words, keep the message, and deliver it when the PDA comes back, as `resend_unsent` does (every 20 seconds, given up after 8 minutes, or 90 seconds for a line with " now" in it).
4. Put the job in the delivered text: `from ${name}, ${job}: "..."`.
5. Add the scenario `pdadown`: the `crew` scenario with the PDA down from 100 seconds to 400 seconds. Checks: no message is sent more than twice to one person with the same words; the meeting still happens or the janitors report by other means; nobody is owed a notice at the end. Expect this to fail today: that is the point of it, and the failures are `HEAD-05`, `ARR-05` and `HOLE-06`.

## How to test the fix

Run `sim.ts quiet qm` and `sim.ts quiet crew` once each with the change: they should still pass if the window code only sends to names on the PDA. Any new FAIL there is a real slip in a name. Then run the new `pdadown` scenario; its failures are the window faults named above, to be fixed under their own findings. Also run `quiet qmlost` and `quiet waiting`: they send to Hal Pott, a player, and must still pass once step 2 lists players. A quick check of step 1 by itself: make a scratch window copy (with `BRAIN=`) send one message to "Captain" and see it answered `ok: 0`, "You cannot find that person on your PDA.", and the owed notice struck.

## Check

Read `sim.ts:723` (the stand-in `message` case: no branch returns `ok: 0`; grep finds no "would not send", "cannot find that person" or "no PDA" anywhere in `tools/llm_crew/`), `sim.ts:1116` (`pda_people` lists NPCs and only Captain, Quartermaster and Chief Engineer players), and the real `tool_message`, `messenger_named` and `people_on_pda` in `crew_npc_cargo.dm:666-748`: the quotes match the code today, the three failures and their words are as stated, and `notices_owed` is struck before the lookup. Checked the window side named: `meetingsAfterActing` (`jobs/meetings.ts:690-699`) notes a PDA report as given only when `ok`; `HEAD-05`, `ARR-05` and `HOLE-06` exist as findings. The change log's power note (line 1038, "PDA messages stop when station power goes") says the would-not-send case is common in real rounds, and the 16:50 entry (line 351) says the kept PDA messages are compile-checked only, so the gap is known in outline but no entry fixes it or chooses it. `SIM-04` points here for the `message` failures rather than covering them itself. Confirmed. Severity lowered to low: by FORMAT.md a test or tool that misleads is low; the faults it hides carry their own severities. Effort raised to medium: a kept-message queue, a PDA-down switch and a new scenario in `sim.ts` come to more than 20 lines.
