---
id: KNB-10
title: A technician answers an order the Captain spoke to the Quartermaster from seven tiles off, because a line said to nobody passes the not-said-to-someone-else test
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2186, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2222, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:136
fix: Take a spoken order or a come-for-my-crate line only when it was said to this technician, or was said to nobody by someone standing at its counter
---

## What is wrong

Listed in the 2026-11-18 12:00 entry ("eleven faults from the 09:12 round"), last line of "Known and not fixed": "Who a line is spoken to. The Captain, two tiles from the Quartermaster, was heard by a technician seven tiles away as speaking to her. Not looked into."

Looked into: the addressing code got it right, and the technician's own code then ignored the answer.

The case, from `data/logs/2026/11/18/round-09.12.44/game.log`:

    [15:17:49.243] GAME-SAY: zimfire/(Zim Fire) "The Bureaucracy Crate, order it for yourself" (Quartermaster's Office (81,152,2))
    [15:17:52.816] GAME-SAY: (Amaryllis Durstine) "Zim, orders go through the Quartermaster, Bryan Sullivan. Send it by PDA, please." (Cargo Bay (76,145,2))

The Captain was in the Quartermaster's Office, speaking to the Quartermaster. The technician was at her counter in the bay, about seven tiles away, with the other technician beside her.

1. `saidTo` (`addressing.ts`) works out who the line was for. It uses nobody's name. The technician has company, the Captain is not beside her or turned to her within three tiles, and they were not just talking. It answers `{ to: 'nobody' }`. That is right.
2. The technician's `overhears` (`jobs/cargo.ts`) then tests `event.details.said_to !== 'other'`. `'nobody'` is not `'other'`, so the test passes.
3. The rest holds: there is a Quartermaster aboard, the speaker is in sight (through the office window), is the Captain, and the line has ordering words ("order").
4. So she takes it as "a head of department trying to order at the counter" and says where orders go. The Captain is told to send by PDA what they had just said to the right person's face, and `brain.sentToQm[speaker]` is spent, so a head who really does come to the counter in the next while is not told.

The same test guards the next block, someone come for a held crate (`COLLECT_WORDS`), so "I am here for my crate" said to the Quartermaster across the bay can start a hand-over at the counter. The Captain said exactly that at 15:25:22 in the Cargo Lobby in the same round.

Only a line that names someone else (`'other'`) is left alone. Everything said in sight of the counter by a head or the Captain, to the room or to a third person without their name, is taken.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2186`, in `overhears`:

        if (
          quartermaster &&
          speakerSeen &&
          !isCargo(speakerJob) &&
          (!!speakerSeen.command || isHead(speakerJob)) &&
          event.details.said_to !== 'other' &&
          ORDERING_WORDS.test(heard) &&
          !COLLECT_WORDS.test(heard)
        ) {

`jobs/cargo.ts:2222`, the collection branch:

        if (
          speaker &&
          !isCargo(theirJob) &&
          event.details.said_to !== 'other' &&
          COLLECT_WORDS.test(heard) &&

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:128`, the end of `saidTo`, which is where this line landed:

      const talk = brain.inTalkWith;
      if (
        talk &&
        talk.name === speaker &&
        Date.now() - talk.at < STILL_TALKING_MS
      ) {
        return { to: 'me' };
      }
      return { to: 'nobody' };

## How it was found

Seen in the round log quoted above. The cause was read from the code: `saidTo` was traced by hand for that line (no name of hers, no job word of hers in it, company present, distance over three). Not run: the brain log of that round was not searched for the `said_to` value itself.

## How to fix it

1. Add a small helper in `jobs/cargo.ts`:

        /** TRUE if a line was put to this technician, or to nobody by someone standing at its counter. */
        function atMyCounter(brain: NpcBrain, event: SenseEvent, speaker: string): boolean {
          const to = event.details.said_to;
          if (to === 'me') return true;
          if (to === 'other') return false;
          const seen = brain.peopleInView.find((person) => person.name === speaker);
          return !!seen && (seen.distance ?? 99) <= COUNTER_REACH;
        }

   with `COUNTER_REACH` of 2 or 3 tiles (the counter window is one tile from the post).
2. Use it in place of `event.details.said_to !== 'other'` in both blocks quoted above.
3. Check the other hooks in the same function for the same test and decide each: a knock or a door asked for aloud is rightly heard from further off, since the speaker is at a door and not at the counter. Leave those.
4. `grep -n "said_to !== 'other'" jobs/*.ts` for the same pattern in other jobs (the Quartermaster's `overhears`, the heads'). Where the line triggers an action or a fixed answer, it wants the same care.

Keeps the rules: it is a senses matter (who was spoken to), decided by code, with no model in it.

## How to test the fix

- Type check and lint.
- `tools/llm_crew/addressing.ts` is the table of cases for who a line is to. Add the case above (Captain, seven tiles, no name, company present) and assert that a technician's `overhears` adds nothing to `brain.toTell`.
- Simulator: `qm` and `qmbig`, where a head orders at the counter with a Quartermaster aboard, must still get "orders go through the Quartermaster" when the head stands at the counter.
