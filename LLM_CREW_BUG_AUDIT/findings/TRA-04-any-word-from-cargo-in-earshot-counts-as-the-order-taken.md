---
id: TRA-04
title: At the counter, anything any cargo worker says in the head's hearing counts as its order being taken, so an order nobody took is not asked again for ten minutes
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1181, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:924, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:934, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873, code/modules/llm_crew/crew_npc_cargo.dm:413
fix: Have the technician who places a head's order say a fixed line naming the head and what was ordered, and count only that line, said to the head, as the order taken
---

## What is wrong

When the Head of Personnel asks a technician at the counter to order something, it waits half a minute for an answer (`ANSWER_WAIT_DS`) and, if none comes, asks again: "whoever it asked may not have heard". That is the only mend at the counter for an order that was not taken.

What counts as the answer is anything at all said by anyone whose job is cargo, to anyone, while the order stands asked:

    // Anything said by someone from cargo once the order is put to them is its answer.
    const order = brain.requisition;
    if (order && order.askedAt !== null && isCargo(jobOf(brain, speaker))) {
      order.heardBack = true;
    }

Once `heardBack` is set, `requisitionStep` takes the order as placed ("They will send word, with the manifest numbers, when it has come in"), the head goes back to its office, and nothing happens until `ORDER_OVERDUE_DS` (ten minutes) has passed with no PDA.

A cargo post usually has two technicians and often a janitor or someone else at the counter, and the technicians speak as part of their work whatever the head is doing: "I am going to check to see what crates are still here." (`speak_plainly` in `tool_check_held`), "Crate 12 is out in the lobby for you", "Sorry, Jan, I am not holding a crate by that number.", "I am coming to the door of the Cargo Bay to let you in." Any of those, or the asked technician's own reply that does not take the order, is taken as the order accepted.

And the asked technician often does not take it, for reasons the head cannot see:

- `offers` gives the LLM no `order` tool while someone wants a door or has asked for a crate in the last two minutes (GAP-08 is that ask being dropped). The LLM answers in words, "I will get to that", and nothing is ordered.
- The model answered without calling the tool, or the dead-model fallback (`hears`) did not match the words.
- The line was said to Cora while Vik was the one who heard it (`said_to === 'other'` for Vik).

In each case the head hears cargo speak and leaves.

Concrete case, no Quartermaster aboard (or the head has said "The Quartermaster has not answered"): the head reaches the counter at 14:00 and says "Cora, I need to order a crate of janitorial supplies for my staff, please. Send me the manifest number when it comes in." Jan is at the counter for crate #12, so `pickupAsked` is fresh and `offers` returns nothing. Cora's model says "Of course, Hal, one moment." No order. The head hears a cargo voice: `heardBack = true`. It leaves. Its janitors wait until 24:00, when the order is asked again, and a crate comes about 28:00 instead of 15:00.

The same reader also takes cargo speech as the Quartermaster's "Noted" on the PDA path: a head that has sent its order by PDA and then hears any technician in passing within three minutes never takes its order to the counter, even if the Quartermaster never got it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1181`, in `overhears`, quoted above.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:924`, in `requisitionStep`, the mend it skips:

    if (order.askedAt !== null && !order.heardBack) {
      if (brain.now - order.askedAt < ANSWER_WAIT_DS) {
        return { ... 'You have asked cargo for ..., and are waiting at the counter for an answer.' };
      }
      order.askedAt = null;
    }
    if (order.askedAt !== null) {
      return {
        ready: false,
        step: `You have asked cargo to order ${wanted}. They will send word, with the manifest numbers, when it has come in.`,
      };
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:906`, the Quartermaster path, which goes by `heardBack` too:

    if (order.heardBack) {
      return {
        ready: false,
        step: `You have sent ${quartermaster.name}, the Quartermaster, your order for ${wanted}, and have word that it is noted. ...`,
      };
    }

`code/modules/llm_crew/crew_npc_cargo.dm:413`, `place_order`: the order is placed in silence. The body is told "You order ... at the supply console and call the shuttle" and nothing is said to whoever asked.

## How it was found

Read from the code. Not seen in a round; the case at the counter while a janitor collects is GAP-08's case from `round-00.56.30` seen from the head's side.

## How to fix it

1. Give the technician a fixed line for an order placed for someone: in `supply.ts`, `PLACED = 'I have put your order in'` and `PLACED_WORDS`. In `cargo.ts` `afterActing`, when an `order` placed from the counter (`task` is not `GIVEN`) comes back `ok`, push a `toTell` to the asker, said word for word: "Hal, I have put your order in: a crate of janitorial supplies. I will send you the manifest number when it comes in." The asker is known: the window sets `action.for` to their handle, and the server's result names `order_for`.
2. In `head.ts` `overhears`, set `heardBack` only on that line (or on the technician's "orders go through the Quartermaster", which should set `viaCounter` false and send it back to the PDA path), said by a cargo worker and naming this head. Drop the any-word rule.
3. On the Quartermaster path, `heardBack` should come only from `NOTED_WORDS` in `readsMessage`, as the comment there already says. Do not let `overhears` set it while `viaCounter` is false.
4. Keep `ANSWER_WAIT_DS` as it is: with step 2 it now does what it was meant to. Cap the re-asks (HEAD-01 asks the same).
5. If step 1 is put off, a smaller stop-gap in `overhears` alone: count only a line from the technician the head named in its ask, with `said_to === 'me'`, and not one that matches the lines cargo says about other work (`crate .* is out in the lobby`, `not holding a crate`, `coming to the door`). This still takes "One moment" as a yes, so it is not the fix.

## How to test the fix

- Type check from `tgui/`.
- Simulator: in a no-Quartermaster scenario, have a janitor ask for a crate at the counter just before the head orders, so the order tool is withheld. Pass if the head asks again within a minute and the order is placed before the janitor's crate is out.
- In the next round's `game.log`, every "I need to order" line said by a head at the counter should be followed within a minute by an `order` result for that head, or by the head saying it again.

## Check

Checked by Opus 5.5. Confirmed.

- The quote in `overhears` (`jobs/head.ts:1179-1184`) is the code today. `brain.ts:659-660` calls `overhears` for every `speech_heard` from a person, whoever it is said to, so a technician's word to Jan or to nobody reaches it. `isCargo` (`jobs/cargo.ts:84`) is any title with "cargo" or "quartermaster" in it.
- `requisitionStep` (`head.ts:924-938`) is as quoted: with `heardBack` set it skips the 30-second re-ask and stands on "They will send word". The only thing that undoes that is the `ORDER_OVERDUE_DS` (6000 ds, ten minutes) reset in `syncTasks` (`head.ts:645-653`).
- `offers` (`cargo.ts:1858-1885`) does withhold the `order` tool while `pickupAsked` is under `PICKUP_ASK_DS` (1200 ds) old or `doorWanted`, and the dead-model fallback `hears` (`cargo.ts:2344`) goes through `offers` too, so in that case nothing can place the order while the technician still answers in words. The finding's concrete case holds.
- `place_order` (`crew_npc_cargo.dm:413`) returns its result to the body only; nothing is said to the asker, so there is no line today that could be told apart from other cargo talk. The server already knows the asker (`order_for`, set from `for_handle` at `crew_npc_cargo.dm:362-364`; the window sets `action.for` in `brain.ts:1507`), so step 1 of the fix has what it needs.
- The Quartermaster path is touched too, as the write-up says: after the PDA is sent `askedAt` is set, and `overhears` does not look at `viaCounter`. It needs the head to be within earshot of a cargo worker in the three minutes, so it is the rarer half.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans records the any-word rule as chosen or the fault as known.

Severity medium stands: the order is still placed, ten minutes late, in a case (the counter busy with a collection or a door) that comes up in some rounds. Effort medium stands: `supply.ts`, `cargo.ts` and `head.ts`, all on the window side. Not run in the simulator.

## Fix so far

Head side done (group m-heads, 402c7192c22): steps 2, 3 and 5. The head's `overhears` takes as the answer only a line matching `PLACED_WORDS` ("I have put your order in"), or a line said to it (`said_to === 'me'`) that is not about other cargo work; nothing on the Quartermaster path; "orders go through the Quartermaster" sends it back to the PDA path. Re-asks are capped by HEAD-01. Left, in `jobs/cargo.ts` (and the constant in `supply.ts`): step 1, the technician saying "<first>, I have put your order in: <what>. I will send you the manifest number when it comes in." after an `order` placed for a head comes back ok. Once that is said, the stop-gap branch in `head.ts` can be dropped.
