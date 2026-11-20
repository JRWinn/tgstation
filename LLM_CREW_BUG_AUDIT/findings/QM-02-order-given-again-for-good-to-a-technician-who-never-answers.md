---
id: QM-02
title: An order is given to a technician who is down, dead or a human player, and given to the same one again every minute for the rest of the round
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:964, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:800, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:179, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1593
fix: Leave out technicians who are down or cuffed when picking, count how often an order has gone unanswered and after two give it to another free technician, and take a plain ok from the technician it was given to as taken
---

## What is wrong

See also: HOLE-08 (the dead and the silent counted on for good, across all jobs). This is the Quartermaster's case of it, with its own cause (`again` in `giveStep`), a proof, and a fix that stands alone: here the Quartermaster passes over a free technician standing next to it. Also KNA-09 (warrants) and ENG-03 (engineering orders), the same blind spot in other jobs.

The Quartermaster gives an order to a technician by saying "Cora, order 1: I need to order a crate of janitorial supplies, for Hop Kins." It then waits a minute (`TAKEN_WAIT_DS`, 600) to hear the technician's fixed reply "Order 1, right away." If it does not hear it, `syncTasks` puts the order back to `cleared` with `pick` set to the same technician, and `giveStep` gives it to that same technician again, because `order.givenTo` is still one of `technicians(brain)`. There is no count and no limit. Nothing else ever frees the order for another technician but the words "order 1 did not go through".

Who never says "Order 1, right away":

- A technician lying dead or knocked out. `technicians()` is everyone in view or on the PDA list with a cargo job. The PDA list is every station PDA (`people_on_pda` in `crew_npc_cargo.dm:666`), so a corpse with its PDA stays a technician. `down` and `cuffed` on `PersonInView` are never looked at by the Quartermaster.
- A human player in the technician's job. They answer "on it" or "got it", which `TAKEN_WORDS` (`/\border (\d+)\b[^.]*\bright away\b/i`) does not match. Worse, if they do go and place it, the Quartermaster goes on giving it to them, and when it comes they do not say "order 1 has come in:", so it is never marked docked and the head is never sent the crate numbers.
- A technician in the brig, or one that has walked off the station level and back.

Checked with a script (`regive.ts` in the system temp folder): a Quartermaster in the Cargo Bay with two technicians in view, Cora Tech (`down: 1`, holding the shuttle duty) and Vik Hale (standing, free). One order from the Head of Personnel. Over 20 minutes of server time:

    5300 Cora, order 1: I need to order a crate of janitorial supplies, for Hop Kins.
    6000 Cora, order 1: I need to order a crate of janitorial supplies, for Hop Kins.
    6700 Cora, order 1: ...
    ... nine times in all, every 70 seconds, always to Cora ...
    times said: 9   order state: given Cora Tech

Vik, who is free and standing next to it, is never given it. The order is never placed, the Head of Personnel is never told, and the Quartermaster stands in the bay repeating itself; its `OFFICE` task is held off the whole time because `GIVE` counts as busy.

With the technician out of sight the case is the same but quieter: `giveStep` takes `again` and skips the "another of them is here, this one will do" branch, so it goes to the Cargo Bay and waits there with the order for good.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:800`, in `syncTasks`:

    if (
      order.state === 'given' &&
      !order.taken &&
      order.givenAt !== null &&
      brain.now - order.givenAt > TAKEN_WAIT_DS
    ) {
      ...
      order.state = 'cleared';
      order.pick = order.givenTo;
      order.walkedUp = false;
    }

`quartermaster.ts:964`, in `giveStep`:

    const again =
      order.givenTo && technicians(brain).includes(order.givenTo)
        ? order.givenTo
        : null;
    if (again) {
      order.pick = again;

`quartermaster.ts:179`, `technicians`, which takes in anyone with a cargo job, standing or not:

    [...brain.peopleInView, ...brain.pdaPeople]
      .filter((person) => isTechnician(person.job))

`quartermaster.ts:1593`, the only thing that sets `taken`:

    const taken = heard.match(TAKEN_WORDS);

The comment above the `again` branch gives the reason it goes to the same technician: given to someone else, order 2 was once placed by both. That reason holds for a technician who may have heard. It does not for one who is down, or after the same order has gone unanswered several times.

## How it was found

Read from the code, then the script above (imports `tools/llm_crew/fixtures.ts` and `jobs/quartermaster.ts`, drives `syncTasks`, `plan` and `afterSaying` every 10 seconds). Not seen in a round. Not listed in the change log or the plans. CARGO-12 is the same blind spot on the technicians' side (a workmate down still counts as about); this is the Quartermaster's.

## How to fix it

1. In `technicians()` (or a new `ableTechnicians()` used by `freeTechnicians` and `giveStep`), leave out anyone in view who is `down` or `cuffed`. Keep `technicians()` as it is for the meeting and the duty split, or apply the same filter there too (`dutiesFor` would then give a dead technician's work to the others, which is what is wanted).
2. Add `unheard?: number` to `LedgerOrder` (in `types.ts`). In the `syncTasks` block above, add one each time it lapses. In `giveStep`, take `again` only while `unheard < 2` and the technician is not down; after that, set `givenTo = null` and pick from `free` the usual way. The double-placing the comment warns of is then only possible after two whole minutes with no word, and the technician's side drops a second giving of an order it already has (`brain.givenOrder?.n !== n` in `cargo.ts:2147`).
3. Take a short acknowledgement from the technician the order was given to, within the minute after it was given, as taken: "ok", "on it", "got it", "will do", "right away", "sure", "yes", with or without the number. A human technician then has the order taken, and the code moves on.
4. For a human technician the order will still never be marked docked. Step 2 makes the order end somewhere; whether the Quartermaster should then ask the human "Has order 1 come in?" or just tell the head who it was given to is a question for the owner.

## How to test the fix

Add the case above to `tools/llm_crew/book.ts`: one technician `down`, one standing; the order must go to the standing one. Add a second: one technician who never answers; after two lapses the order goes to the other. Add a third: the technician answers "on it"; `taken` is set. Type check and lint. In the next round, grep `game.log` for the give line ("order N: I need to order") and count how often the same line is said to the same person.

## Check

Read `syncTasks` (the lapse block), `giveStep` (`again`), `technicians`, `freeTechnicians` and the `TAKEN_WORDS` branch of `overhears` in `jobs/quartermaster.ts`; `TAKEN_WORDS` in `jobs/supply.ts:88`; the technician's side in `jobs/cargo.ts:2138` (it answers "Order N, right away." each time it is given the order, so a living NPC technician does answer); `people_on_pda` in `crew_npc_cargo.dm:666` (every named PDA on a station level, dead owner or not) and the `down` and `cuffed` fields in `crew_npc_senses.dm:191`. The quotes are what the code says. Ran a throwaway script in the scratchpad: a Quartermaster in the Cargo Bay, Cora Tech (`down`) and Vik Hale (standing) in view, order 1 given to Cora at 100; stepping `syncTasks`, `plan` and `afterSaying` every 10 seconds to 12,100 it said "Cora, order 1: ..." 17 times, every 70 seconds, and never to Vik. Not refuted: nothing passes over a down technician or counts lapses.

Giving it again to the same one is a choice (change log, 12:23 round item (15); `LLM_CREW_PLAN_QUARTERMASTER.md:94`, "it gives the order again"), made so a technician who was not heard is not doubled up. That choice is sound for a living NPC technician; the fault is that it has no end. Severity lowered to medium: a living NPC technician always answers, so this needs a technician who is dead, unconscious or a human player, which comes up in some rounds, not most. Effort raised to medium: steps 1 to 3 touch `quartermaster.ts` and `types.ts` and come to more than 20 lines. Note for step 1: `down` is also set for a technician who has only slipped (`TRAIT_FLOORED`, `crew_npc_person_down`); such a one can still hear and answer, so passing over them for one giving is harmless, but do not count a slip as a lapse. Note for step 3: only take the short ok while the order is `given`, from `givenTo`, and within `TAKEN_WAIT_DS`, or a technician's unrelated "sure" marks the wrong order taken.

## Fix so far

Done on branch `m-cargo` (`jobs/quartermaster.ts`; new table `tools/llm_crew/qm-unanswered.ts`, 10 cases; `book.ts`, `qm-knock.ts`, `qm-own-crate.ts` pass; simulator qm and qmbig passed, qmwait failed once in three runs on "with nothing left to see to it goes back to its office", and failed the same way once in three on the code from before the change, so it is not this change; not played):

- Step 1: `freeTechnicians` leaves out a technician seen `down` or `cuffed` (`unfit`). `technicians()` is unchanged, so the meeting and the duty split are as before.
- Step 2: the lapses of an order given and not answered are counted (`unanswered`, a map by brain id and order number, so `LedgerOrder` in `types.ts` is not changed). `giveStep` gives the order again to the same one only while it is not seen unfit and has not twice failed to answer; after that it goes to another free technician, and back to the same one only if there is nobody else.
- Step 3: a short ok at the start of what the technician it was given to says ("ok", "on it", "got it", "will do", "right away", "sure", "yes", "yep", "aye", "roger"), within `TAKEN_WAIT_DS` of giving it and for an order not yet answered, marks the order taken.
- Step 4 (a human technician never says the order came in) is the owner's question and not done.
