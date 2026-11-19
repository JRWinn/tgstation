---
id: HEAD-05
title: When its PDA will not send, the Head of Personnel's order to the Quartermaster is tried again for ever and never taken to the counter, and no staff meeting is held meanwhile
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:894, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1363, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:624, code/modules/llm_crew/crew_npc_cargo.dm:719
fix: Start the wait for the Quartermaster's word from the first try to send, whether or not it went, so that after NOTED_WAIT_DS the order goes to the counter, and say at the counter that the Quartermaster has not answered
---

## What is wrong

See also: HOLE-06, which covers PDAs going quiet across the whole crew. This is the Head of Personnel's own fallback for exactly that case, which never starts.

The head sends its order to the Quartermaster by PDA. If no "Noted" comes back within `NOTED_WAIT_DS` (3 minutes), it is meant to take the order to the cargo counter face to face (the 2026-11-18 change log: "A head whose order gets no Noted in three minutes takes it to the counter"). But the 3 minutes are counted from `order.askedAt`, and `askedAt` is set only when the server says the message went (`afterActing` needs `ok`). When the PDA will not send, the server answers "Your PDA would not send the message" with `ok` false. `askedAt` stays null, so `requisitionStep` offers the same PDA message again as soon as the driver's back-off (20 seconds, rising to 2 minutes) runs out. It never gets to `order.viaCounter = true`.

Test rounds lose station power about 15 minutes in, and PDA messages stop with it (memory: "Station power fails early"; change log line 1038). From then on a head with an order to place:

- tries the same PDA message every two minutes for the rest of the round;
- never goes to the counter, which is the one thing that would still work;
- holds no staff meeting, because `ordering` is true while `askedAt` is null, and `syncMeeting` is held back by it (see HEAD-01).

When the PDA does work again (a short communications blackout, or power back), there is a second fault. The server keeps an unsent message and sends it again for up to eight minutes (`CREW_NPC_UNSENT_KEPT`; the order has no " now" in it). If the head did get to the counter meanwhile, by the 3-minute path after a message that went but got no answer, the old message still reaches the Quartermaster later. The Quartermaster's duplicate check looks only in its own book (`takeOrder`, `same = ledger.orders.find(... order.from === from ...)`), and the order placed at the counter is not in it. The same crate is ordered twice.

Concrete case: at 16:00 the head's meeting ends with one janitor short. At 16:10 station power is out. The head's "I need to order a crate of janitorial supplies for my staff, please." comes back "would not send" at 16:12, 16:12:20, 16:13, 16:14, 16:16, and every two minutes after. The 22:00 meeting is never called. The janitor never gets its supplies, though the counter in the Cargo Lobby has a technician standing at it.

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

1. Add `order.qmTriedAt: number | null` to the requisition (types.ts). In `afterActing`, when the order message to the Quartermaster comes back, set `qmTriedAt ??= brain.now` whether `ok` or not. Keep setting `askedAt` and the asks' `ordered` only on `ok`.
2. In `requisitionStep`, go to the counter when `brain.now - (order.askedAt ?? order.qmTriedAt ?? Infinity...)` passes `NOTED_WAIT_DS`. In plain terms: three minutes after the first try, sent or not, with no "Noted", it is `viaCounter`.
3. While waiting for that, do not offer the same message again: the server is already keeping it and sending it again. Return "You have sent ... and your PDA would not send it. You are waiting a little before taking it to the counter." (not ready).
4. For the double order: when the head takes an order to the counter after a PDA order that did not get a "Noted", tell the Quartermaster once it is answered that it was placed at the counter, or simpler, have the Quartermaster's `takeOrder` treat an order from the same head for the same crates, arriving while that head's earlier `QM_SILENT` order is open at the counter, as a duplicate. Which side holds the check is the owner's call; the head side is smaller: on the next "Noted, order N" after `viaCounter`, the head sends "Order N was placed at the counter, please strike it." The Quartermaster has no reader for that line yet, so the cargo side needs the matching branch.
5. HEAD-01's narrower `held` keeps meetings going in the meantime.

## How to test the fix

- Simulator: make the fake server answer every `message` from the head with `ok` false. Pass if within four minutes of the order the head walks to the Cargo Lobby and asks a technician, with "The Quartermaster has not answered." in the line.
- Type check from `tgui/`.
- In a round where power fails, grep `game.log` for "was told by its brain to PDA" from the Head of Personnel with "I need to order": there should be one, then a counter line in `game.log` ("I need to order" said aloud) within a few minutes.
