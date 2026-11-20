---
id: HEAD-05
title: When its PDA will not send, the Head of Personnel's order to the Quartermaster is tried again for ever and never taken to the counter, and no staff meeting is held meanwhile
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:894, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1363, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1242, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:624, code/modules/llm_crew/crew_npc_cargo.dm:719
fix: Note the first try to send the order whether or not it went, stop offering the same message, take a Noted that comes after the server resends it, and go to the counter once the server has stopped resending (about nine minutes)
---

## What is wrong

See also: HOLE-06, which covers PDAs going quiet across the whole crew. This is the Head of Personnel's own fallback for exactly that case, which never starts.

The head sends its order to the Quartermaster by PDA. If no "Noted" comes back within `NOTED_WAIT_DS` (3 minutes), it is meant to take the order to the cargo counter face to face (the 2026-11-18 change log: "A head whose order gets no Noted in three minutes takes it to the counter"). But the 3 minutes are counted from `order.askedAt`, and `askedAt` is set only when the server says the message went (`afterActing` needs `ok`). When the PDA will not send, the server answers "Your PDA would not send the message" with `ok` false. `askedAt` stays null, so `requisitionStep` offers the same PDA message again as soon as the driver's back-off (20 seconds, rising to 2 minutes) runs out. It never gets to `order.viaCounter = true`.

Test rounds lose station power about 15 minutes in, and PDA messages stop with it (memory: "Station power fails early"; change log line 1038). From then on a head with an order to place:

- tries the same PDA message every two minutes for the rest of the round;
- never goes to the counter, which is the one thing that would still work;
- holds no staff meeting, because `ordering` is true while `askedAt` is null, and `syncMeeting` is held back by it (see HEAD-01).

A smaller fault beside it: when the PDA works again, the server's kept copy goes on its own (`resend_unsent`, every 20 seconds for 8 minutes), and the Quartermaster answers "Noted, order N". The head drops that answer, because its reader needs `askedAt` set (`head.ts:1242`, `sentOrder.askedAt !== null`). It is put right only by the head's own next try, which goes and gets "Noted N already" (`takeOrder`'s `same` check), so it costs a message and up to two minutes, no more.

The double order the first write-up gave here does not happen today: the head reaches the counter only after a send that went, and a send that goes deletes the kept copy (`unsent_messages -= unsent_key`, `crew_npc_cargo.dm:733`; the key is the recipient and the text, and the text is the same each try). It does become real with a careless fix: go to the counter three minutes after a send that failed, in a five-minute Communications Blackout, and the kept copy reaches the Quartermaster at five minutes, which books and orders it (`takeOrder` looks only in its own book, and an order a technician placed at the counter on `QM_SILENT` is not in it). The fix below is built round that.

How often: only while the PDA network stays down. A short blackout heals today, since the head keeps trying and one goes when it is over. The lasting case is the station power failure seen in every test round so far, which the engineering work (`LLM_CREW_PLAN_ENGINEERING.md`, stage 1) is meant to end. In a full power failure the supply console the technician orders at may be dark too, so going on foot is worth most when telecomms is down and cargo still has power. That makes it medium, not high.

Concrete case: at 15:50 the head calls its meeting and its calls go out; at 15:55 station power is out; at 16:00 the meeting ends with one janitor short. The head's "I need to order a crate of janitorial supplies for my staff, please." comes back "would not send" at 16:00, 16:00:20, 16:01, 16:02, 16:04, and every two minutes after. The 22:00 meeting is never called. The janitor never gets its supplies, even with a technician standing at the counter in the Cargo Lobby (if cargo still has power).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:894`, in `requisitionStep`:

    if (quartermaster && !order.viaCounter && brain.hasPda) {
      if (order.askedAt === null) {
        return {
          ready: true,
          ...
          act: {
            tool: 'message',
            person: quartermaster.name,
            text: `${ORDERING} ${wanted} for my staff, please.`,
          },
        };
      }
      ...
      if (brain.now - order.askedAt < NOTED_WAIT_DS) {
        ...
      }
      order.viaCounter = true;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1363`, in `afterActing`, the only place `askedAt` is set for the PDA order:

    if (
      sent &&
      sent.askedAt === null &&
      ok &&
      act.tool === 'message' &&
      String(act.text ?? '').startsWith(ORDERING)
    ) {
      sent.askedAt = brain.now;

`code/modules/llm_crew/crew_npc_cargo.dm:719`, `tool_message`, which keeps the message and answers `FALSE`:

    if(!own_messenger.send_message_signal(body, text, list(target)))
      ...
      action_result(CREW_TOOL_MESSAGE, FALSE, "Your PDA would not send the message. You will try it again when your PDA is working.")

## How it was found

Read from the code, not seen in a round. The power failure is seen in every test round so far (memory and change log); what the head did in one was not checked.

## How to fix it

1. Add `qmTriedAt?: number` to the requisition (`types.ts:1431`). In `afterActing`, when the order message to the Quartermaster comes back not `ok`, set `qmTriedAt ??= brain.now`. Keep setting `askedAt` and the asks' `ordered` only on `ok`, as now.
2. In `requisitionStep`, with `askedAt` null and `qmTriedAt` set, do not offer the same message again: the server is keeping it and sending it again by itself. Return not ready: "You have sent ... your order for ..., and your PDA would not send it. Your PDA will keep trying; if no word comes, you will take it to the counter." Leave the asks `ordered: false` until the order is sent or said: `noteAsk` already notes nothing new for anyone with an untold ask, and an ask marked ordered for an order that never went would be stuck as in HEAD-02.
3. Go to the counter (`viaCounter = true`) only once the server has given the kept copy up: `brain.now - order.qmTriedAt > UNSENT_GIVEN_UP_DS`, a new constant of about 5400 (nine minutes: `CREW_NPC_UNSENT_KEPT` is 8 minutes, `_defines.dm:62`, plus a margin), with a comment naming the define so the two are kept together. Waiting only `NOTED_WAIT_DS` (3 minutes) would leave the kept copy live and order the crate twice when a blackout ends (see above).
4. In `readsMessage` (`head.ts:1242`), take "Noted" and the refusals when `askedAt !== null || qmTriedAt !== undefined`, and on "Noted" set `askedAt` (if null) as well as `heardBack`, so the step goes to "noted" and stops. Without this, a resend that goes is answered and the answer dropped.
5. The edge left: a "Noted" that comes after the head has gone `viaCounter` (only possible past the nine minutes). Leave it, or on that "Noted" send "Order N was placed at the counter, please strike it." The Quartermaster has no reader for that line, so that half is the owner's call and a cargo-side change.
6. HEAD-01's narrower `held` keeps meetings going in the meantime.

## How to test the fix

- Simulator: make the fake server answer every `message` from the head with `ok` false. Pass if the order message is tried once only, and about nine minutes after it the head walks to the Cargo Lobby and asks a technician, with "The Quartermaster has not answered." in the line.
- A second: the first try fails, and five minutes later the fake Quartermaster sends "Noted, order 3: ...". Pass if the head goes to "noted" and never to the counter.
- Type check from `tgui/`.
- In a round where power fails, grep `game.log` for the Head of Personnel's "its PDA would not send it. Kept to send again: I need to order" (that is the line for a send that failed; "was told by its brain to PDA" is written only when one went). There should be one, then "gave up on the PDA message" about eight minutes later, then "I need to order" said aloud at the counter within a minute or two of that.

## Check

Checked by Opus 5.5. The quotes at `head.ts:894` to 921 and `head.ts:1363` to 1371 are what the code says today; `crew_npc_cargo.dm:719` is now at about 719 to 730 and says what is quoted. Traced: `afterActing` sets `askedAt` only with `ok`; `tool_message` answers `FALSE` on a failed send and keeps the message (`unsent_messages`, `resend_unsent`, kept 8 minutes, `_defines.dm:62`); the driver backs the failed step off by `RETRY_MS * count` up to `RETRY_MAX_MS` (20 s to 2 min, `driver.ts:52`, 931) and never drops it; `brain.hasPda` stays true (it means carrying one); `quartermasterAboard` reads `pdaPeople`, which the server builds from `GLOB.pda_messengers` without the network (`people_on_pda`), so the Quartermaster is still "aboard" in a blackout. `ordering` (624) is true with `askedAt` null, so no meeting.

Ran a throwaway script (scratchpad, bun, `tools/llm_crew/fixtures.ts` and `jobs/head.ts`): a head with a janitor's ask and a Quartermaster on its PDA, every order message answered `ok` false, stepped from 3000 to 40000 with the meeting due at 6000. Result: 31 tries, no walk to the counter, `viaCounter` unset, `askedAt` null, 0 meetings called. Then a "Noted, order 3" from the Quartermaster with `askedAt` still null: `heardBack` stayed false (dropped).

The change log's 15:41 entry (item 25) says "a job that goes on foot when a message will not send still does": the head's fallback on foot was built for a silent Quartermaster, not for its own PDA failing, and nothing chooses this. Corrected the write-up: the double order it described cannot happen today (`crew_npc_cargo.dm:733` deletes the kept copy when a send goes), but would with the fix as first written, so the fix now waits out the server's eight minutes and reads a late "Noted". Lowered to medium: it lasts only while PDAs stay down, which today means the power failure the engineering work is meant to end, and in a full power failure the supply console may be dark as well. Effort medium: a field in `types.ts` and four places in `head.ts`.
