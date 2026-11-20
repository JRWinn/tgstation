---
id: SECT-17
title: When a Head of Security comes aboard after an officer has kept the list, or leaves after it, the list is not handed over, and the old warrants drop out of sight
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:128, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:93, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599
fix: Have whoever stops keeping the list send it to whoever takes it up, in the fixed words of the notice, and have the new keeper read that notice into its desk
---

## What is wrong

With no Head of Security aboard, the officer keeps the list in its own `desk` and serves the warrants itself. The moment a Head of Security shows on its PDA list or in view, `syncTasks` stops calling `syncDesk` and the officer's desk is never looked at again. The Head of Security starts with an empty desk of its own. Nothing passes between them.

What follows, for a warrant declared before the Head of Security came:

- Staff now send their sightings to the Head of Security (`securityDesk` prefers it). Its desk has no warrant on that name, the sender is not a head, so `deskTakes` drops the message and nobody is told. The officer gets no more word of where the person is.
- The officer still has the warrant in its own beat and goes on looking. If it jails them, the Head of Security is told and tells the Captain; if it loses them, "I lost Pun Pun in the Bar" finds no warrant and nothing is noted.
- The heads were sent the list by the officer. The Head of Security never sends a notice on it, so when the person is jailed or pardoned nobody sends the heads a new list, and they read the old name out at every meeting.
- The Captain's "Pardon Pun Pun" to the Head of Security is answered "there is nothing against Pun Pun", and the officer, which has them, is not told.

The other way round: the Head of Security leaves the PDA list (cryo, PDA lost). The officer takes up the list with whatever its own desk held from before, which is nothing or stale. The warrants the Head of Security gave it are in its beat but not its desk, so sightings of those people, now sent to the officer, are dropped the same way.

A human taking the Head of Security job part way through a round, with an NPC officer aboard, is the usual way in.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:128`, in `syncTasks`:

    const head = headAboard(brain);
    if (head) {
      // How its warrants have gone is word for the Head of Security.
      for (const outcome of takeOutcomes(brain)) {
        ...
    } else {
      // With no Head of Security aboard it keeps the list itself, and there is nobody to tell.
      beat.words = [];
      syncDesk(brain);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:93`, `securityDesk`, where every NPC sends sightings:

    everyone.find((person) => isHeadOfSecurity(person.job)) ??
    everyone.find((person) => isOfficer(person.job))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599`, a sighting is taken only for a warrant on this desk:

    const seen = nameIn(text, standing);

## How it was found

Read from the code: `officer.ts` `syncTasks` and `readsMessage`, `desk.ts` `deskTakes`, `wanted.ts` `securityDesk`. Not run, and not seen in a round. Marked "likely" because whether a Head of Security can come aboard after the officer depends on how and when crew are spawned and when the PDA list first fills; a human player joining late certainly can.

## How to fix it

1. Give the officer a hand-over step. When `headAboard` first becomes true and the officer's desk has warrants, it sends the Head of Security the list in the notice's own words (`noticeLines` of its desk), then clears its desk.
2. In `deskTakes`, when the message is a security notice from an officer (`readNotice` from `isOfficer`), add each entry to the desk as a warrant (by: the officer, `given: 'taken'`, since the officer has it), and raise `serial` so the heads get a fresh notice from the Head of Security.
3. The other way: when the officer takes up the list (first `syncDesk` after `headAboard` turns false), copy each warrant in its beat into its desk (`by` unknown, `given: 'taken'`).
4. Whether the officer should hand the warrants it holds back to the Head of Security to give out again, or keep serving them, is the owner's to say; keeping them is less work and the step above does not need to choose.

## How to test the fix

Add to `tools/llm_crew/security.ts`: an officer with no Head of Security on its PDA list takes a warrant on Pun Pun from the Captain; a Head of Security is then added to its `pdaPeople`; after one `syncTasks` it has a PDA queued to the Head of Security that `readNotice` reads as Pun Pun; the Head of Security's `deskTakes` of that line puts Pun Pun on its desk.
