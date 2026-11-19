---
id: CARGO-02
title: When a technician cannot find the Quartermaster, word that an order came in goes to the head only, and the Quartermaster never gives that technician another order
kind: bug
severity: high
effort: small
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1063, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:674, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1467
fix: In the PDA fall-back for an order given by the Quartermaster, also send the Quartermaster the has-come-in line by PDA, which its readsMessage already reads
---

## What is wrong

An order the Quartermaster gave is reported back to the Quartermaster face to face (`tellQuartermaster`). If the Quartermaster is not in sight and does not come to its office door in a minute and a half, or is told twice and does not answer "I have that", the technician falls back to the PDA. That fall-back sends one message, to whoever the order is for:

"Your order has come in: crate #12 (Janitorial Supplies Crate). Send someone to the Cargo Lobby counter..."

Only when the order is the Quartermaster's own does the Quartermaster get a message. For anyone else's order the Quartermaster is told nothing, then or later: the server drops the notice once the message has gone, the `order` task closes, and the technician has nothing left to say.

The Quartermaster's book goes by the words "order N has come in:". It never hears them, so the order stays `given`. Then:

- `freeTechnicians` leaves that technician out for the rest of the round. With one technician, no order is ever given out again. With two, the second fall-back ends ordering for the round.
- `moneyFree` goes on counting the order's cost as promised.
- The book never shows the order as docked, so "Lost: ... Ordered again" has no crates to go by.

One concrete case:

1. The Quartermaster gives Sam order 2 for Hop Kins, then walks off to fetch a fresh sheet of paper from a bin in another department (`get_paper` goes to the nearest bin on the level it can reach).
2. The shuttle docks. Sam's `order` task runs `tellQuartermaster`: the Quartermaster is not in view, so Sam goes to the Quartermaster's Office door, knocks, and waits `AT_QM_DOOR_DS` (90 seconds).
3. Nobody comes. `task.byPda = true`, `tellQuartermaster` returns null. `arrived.to` is "Hop Kins", not the Quartermaster, so the last branch runs and the Head of Personnel is sent the numbers.
4. The server's `tool_message` removes the notice. `orderInHand` is false, the task closes.
5. The Quartermaster comes back. Its book says "Order 2. Given to Sam Tech." for good. Order 3 waits for a free technician that never comes.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1063`, in `plan`:

    if (toQuartermaster) {
      return toQuartermaster;
    }
    // The Quartermaster's own order, and the Quartermaster not to be found. The PDA says what would
    // have been said to its face, in the same words: those are the words its order book goes by.
    // Sent the line meant for whoever ordered, it never took its own crate to have come in.
    if (
      quartermaster &&
      arrived.to === quartermaster.name &&
      typeof arrived.ref === 'number'
    ) {
      return {
        ...
        act: {
          tool: 'message',
          person: quartermaster.name,
          text: `${firstName(quartermaster.name)}, ${order} ${DOCKED} ${itemised}.`,
        },
      };
    }
    return {
      ready: true,
      step: `What ${arrived.to} ordered has come in: ${itemised}. ...`,
      act: {
        tool: 'message',
        person: arrived.to,

`code/modules/llm_crew/crew_npc_cargo.dm:709`, in `tool_message`, why there is no second chance:

    // Having tried is enough. Someone with no PDA cannot be told this way, and trying again would not change that.
    for(var/list/notice as anything in notices_owed)
        if(LOWER_TEXT(notice["to"]) == wanted)
            notices_owed -= list(notice)
            break

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1467`, the reader that is already there and is never fed:

    if (isTechnician(job)) {
      const docked = text.match(DOCKED_WORDS);
      if (docked) {
        noteDocked(brain, from, Number(docked[1]), docked[2]);
        return;
      }

## How it was found

Read from the code, not seen in a round. I followed every way `order.state` leaves `'given'` in `quartermaster.ts` (lines 346 to 356, 811, 1376, 1584): only the has-come-in words and the did-not-go-through words do it. `LLM_CREW_PLAN_QUARTERMASTER.md` says of the fall-back "the technician sends word to whoever ordered by PDA itself, as it did before" and does not say how the book is closed.

## How to fix it

1. In `afterActing` in `cargo.ts`, when the step was the `order` task's PDA message to whoever ordered (`task.kind === ORDER`, `act.tool === 'message'`) and the notice came through the Quartermaster with a number, queue a second PDA message to the Quartermaster. The notice is gone from `brain.notices` by the next state update, so capture what is needed at plan time: put `ref`, `via` and the itemised text on the task (for example `task.docked = { ref, via, itemised }`) when `plan` builds the message, and in `afterActing` push

       brain.toTell.push({
         to: via,
         line: `${firstName(via)}, order ${ref} ${DOCKED} ${itemised}.`,
         why: `You could not find ${via} to say that order ${ref} had come in. You have sent whoever ordered the numbers, and are sending ${via} the same by PDA for the order book.`,
         byPda: true,
         at: Date.now(),
       });

   `readsMessage` in `quartermaster.ts` reads that line already and calls `noteDocked`.
2. `noteDocked` then sends whoever ordered "Your order has come in: ..." a second time. Either accept the repeat (the head's `readsMessage` closes its ask on either), or pass a flag so that `noteDocked` skips `tellOrderer` when the word came by PDA from a technician for someone else's order. I would skip it: the technician has told them.
3. Do the same for the `waiting` and `lost` fall-backs only if the book needs them. `lost` does: `crateLost` in `quartermaster.ts` is what has the crate ordered again. Send the Quartermaster the `LOST_TOLD_WORDS` line by PDA in that fall-back too, and read it in `readsMessage`.
4. The rule in the comments, "nothing between a technician and the Quartermaster goes by PDA", is already broken for the Quartermaster's own order. Owner's question: is a PDA message to the Quartermaster acceptable as the last resort for every order? The alternative is to keep the word owed and say it face to face whenever the Quartermaster is next seen, with no time limit, which needs a list on the brain that outlives the task.

The related hole on the Quartermaster's side, that a `given` order has no time limit at all, belongs with the Quartermaster findings.

## How to test the fix

- Simulator: `qmgone` (the Quartermaster not to be found) should end with the Quartermaster's ledger showing the order `docked` once the Quartermaster is back, and a second order being given to the same technician. Add that check.
- `tools/llm_crew/book.ts`: the PDA line against `DOCKED_WORDS`.
- In a round: `pda.log` should show two messages from the technician after a wait at the office door, one to the head and one to the Quartermaster, and `game.log` "wrote in its order book: Order N. Docked".
