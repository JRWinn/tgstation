---
id: CARGO-20
title: A player who is Quartermaster cannot get a technician to order anything except in the NPC Quartermaster's exact words, and is told nothing it can answer in its own
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1863, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2138, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2092, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:83
fix: When the Quartermaster aboard is not one of this window's NPCs, offer the model the order option for the Quartermaster's own asking, and take any plain acknowledgement from it as heard
---

## What is wrong

With a Quartermaster aboard, a technician takes an order from the Quartermaster and nobody else, and only in one set form, read by code: "Sam, order 3: I need to order 2 crates of janitorial supplies, for Hop Kins." (`GIVEN_WORDS`). The model is offered no `order` at all while a Quartermaster is aboard (`offers` returns nothing), unless a head has said the set words "The Quartermaster has not answered."

That is built for the NPC Quartermaster, whose lines are made by code. When the Quartermaster is a player (another player joins as QM; the owner plays Captain), the player talks like a person: "Sam, order a crate of soap for the janitors, please." No branch of `overhears` reads it (it is not `GIVEN_WORDS`; the head-at-the-counter branch skips anyone in cargo). The model is woken and is offered no `order`, so whatever it says ("Right away!") nothing is placed. A player Quartermaster cannot use its own staff for the one thing they are there for.

The rest of the word between them is set phrases too:

- An order that has come in is told to the Quartermaster face to face ("Ada, order 3 has come in: crate #12 ...") and is taken as heard only on "<first name>, I have that." A player who says "thanks" or "got it" is not heard; after two tries the technician goes round them by PDA to the head (CARGO-02), so the player's own book, if they keep one, never gets the numbers.
- Heads ordering at the counter are sent away: "orders go through the Quartermaster, <player>. Send it by PDA, please." The NPC Head of Personnel comes back after three minutes with "The Quartermaster has not answered." and is then served; the human Captain is just sent away.

HOLE-13 covers the other way round (a player technician under an NPC Quartermaster). Nothing covers a player Quartermaster over NPC technicians.

Concrete case: a player joins as Quartermaster. Sam and Maria are NPC technicians. The player, at the counter: "Sam, can you order a crate of light bulbs for engineering?" Sam's `overhears`: `GIVEN_WORDS` does not match; `isCargo(speakerJob)` is TRUE so the head branch is skipped; no door words. The model is woken; `offers(brain, [player])`: `quartermasterAboard` is the player, `brain.qmSilent` is unset, so `[]`. The model answers in words only. No order is placed, and nothing tells the player so.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1863`, in `offers`:

    if (quartermasterAboard(brain)) {
      const silent = brain.qmSilent;
      if (
        !silent ||
        brain.now - silent.at > QM_SILENT_DS ||
        !askers.some((person) => person.name === silent.by)
      ) {
        return [];
      }
    }

`cargo.ts:2138`, in `overhears`, the only way an order from the Quartermaster is taken:

    const given = heard.match(GIVEN_WORDS);
    if (
      given &&
      isQuartermaster(speakerJob) &&
      new RegExp(`^${firstName(brain.name)}\\b`, 'i').test(heard.trim())
    ) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:83`:

    export const GIVEN_WORDS =
      /\border (\d+): i need to order\b(.+?),? for ([^.]+)\./i;

`cargo.ts:2092`, the only way word to the Quartermaster is taken as heard:

    if (
      isQuartermaster(speakerJob) &&
      WORD_HEARD_WORDS.test(heard) &&
      new RegExp(`\\b${firstName(brain.name)}\\b`, 'i').test(heard)
    ) {

## How it was found

Read from the code: every branch in `overhears` and `offers`, with the speaker a Quartermaster who is not driven by this window. Not seen in a round: the test rounds' Quartermaster is an NPC.

## How to fix it

Owner question first: should NPC technicians serve a player Quartermaster the way they serve a head with no Quartermaster aboard (the model agrees, code reads what and how many), or should the player be expected to use the console themselves? The fix below assumes the first.

1. Know whether the Quartermaster is one of this window's NPCs. `brain.ts` already builds the list of NPC names (`[...brains.values()].map(...)` for `saidTo`); pass a set of them to jobs, or add `brain.fellowNpcs`. Call the Quartermaster "a player" when it is aboard and not in that set.
2. In `offers`, when the Quartermaster is a player and is among the askers, return the order option as for a head (the existing text, which tells the model what counts as asking). `agrees` and `fills` already read the kinds and counts from the words, and `takeOrder` keeps two technicians from both placing it. The order is for the Quartermaster unless the words name someone (`for <name>` on the PDA list).
3. Word that it has come in, to a player Quartermaster: keep it face to face, but take anything the Quartermaster says to the technician by name, or any line said to it within the wait, as heard (HOLE-13's `acknowledges` helper), and also send the PDA to the Quartermaster rather than going round it to the head.
4. Keep every set phrase as it is for the NPC Quartermaster.

## How to test the fix

- Simulator: a Quartermaster with no brain (a scripted player) who says "Sam, order a crate of light bulbs, please." Want one `order` from Sam for Replacement Lights, none from Maria, and Sam's arrival word answered by "thanks" taken as heard.
- Type check.
- In a round with a player Quartermaster, ask a technician for a crate and check `game.log` for the order line.
