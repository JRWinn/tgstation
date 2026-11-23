---
id: PLAY-14
title: An officer on a warrant who got into a locked post by a door the keeper did not open for it answers Nobody sent for me and is walked out by the arm
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 2656f69bbf7
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:752, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:261, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2919, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:902
fix: In explainStep answer for a security body with a warrant standing on someone in or through that room that it is on a warrant, and have the keeper take a security answer with warrant in it as a let-in on a warrant
---

## What is wrong

An officer with a warrant on someone in a locked room, or in a room reached through it, comes into that room without the keeper having opened the door for it. It slips in through a door held for someone else, or the Captain opens the door with their own ID (the officer is built to go through then: ARR-06 in `letInStep`). The keeper sees a stranger, asks "why are you in here?", and the officer's own code answers that it has no business there: "Nobody sent for me. I should not be in here, I know." The keeper takes that as owning up and walks the officer out by the arm. The warrant is not served.

The officer should say it is there on a warrant, and the keeper should leave it to serve it, as ARR-02's fix already does for an officer the keeper let in itself.

Seen in `data/logs/2026/11/20/round-10.31.34` (played on `pre-night`). The Captain had declared a warrant on the Quartermaster, Nehemiah Knapp.

1. 16:45:41 `game.log`: "[Armando Reichard] opened Deliveries to let Braden Reade out of Cargo Bay." The officer, Kaleb Schofield, was in the Delivery Office on its way to the Cargo Bay door, and came through behind the janitor. Its brain at 16:50:22 says "You came in from the Delivery Office".
2. 16:45:48 `crew_brain.log`, Kaleb: "Nehemiah Knapp is in the Quartermaster's Office, which is locked to you. You are going to the door of the Quartermaster's Office."
3. 16:45:57 Armando: "Kaleb Schofield, Security Officer, is in the Cargo Bay ... You did not send for them and you did not let them in. In "say", ask Kaleb Schofield outright, by name, "why are you in here?""
4. 16:45:58 Kaleb, ROUTINE: "Armando Reichard has asked why you are in Cargo Bay. The truth is that nobody sent for you and nobody let you in: you have no business in here. In "say", own up to it, beginning with "Nobody sent for me"." `game.log` 16:46:00: "Nobody sent for me. I should not be in here, I know."
5. 16:46:04 Armando: "You have no business in here, Kaleb. Out you go." 16:46:09 `game.log`: "[Armando Reichard] took hold of Kaleb Schofield to walk them out of Cargo Bay." 16:46:11 "walked Kaleb Schofield out of Cargo Bay."
6. It happened again at 16:49:30 to 16:49:42 with Kathy Stahl ("Kaleb Schofield, you have no business in the Cargo Bay; I am walking you out immediately"), and Kaleb gave the same answer twice. The Captain, who watched, said aloud "ha ha they just through security out" and "security should be allowed in".

In this round the technicians never opened the door for the officer at all, though they said they were coming five times: that was CARGO-04 (the server refused `open_door` for security), fixed on master in night round M1. So on master an officer let in by a technician is noted as on a warrant and kept (`warrantStands`). The fault here is still on master for every other way in: the Captain's own ID, a door held for a janitor, a door forced by engineering (`warrant.opened`), or a door standing open.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:752`, in `explainStep`, which every crew body answers by, security included:

      if (!why) {
        return {
          ready: true,
          step: `${by} has asked why you are in ${brain.location}. The truth is that nobody sent for you and nobody let you in: you have no business in here. In "say", own up to it, beginning with "Nobody sent for me".`,
          say: 'Nobody sent for me. I should not be in here, I know.',
          needs: has('nobody'),
        };
      }

`reasonToBeHere` (guarding.ts:721) knows only a task with `askedBy` in this room, or `brain.letInBy`. A warrant is neither.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:261`, `warrantStands`, the keeper's only reason to leave security be. It reads `letInWhy`, which is filled only by `noteSentFor(..., { warrant })`:

    function warrantStands(brain: NpcBrain, name: string): boolean {
      const why = letInWhy.get(whyKey(brain))?.get(name);
      if (!why || brain.now - why.at > WARRANT_WELCOME_DS) {
        return false;
      }

and that is called only after this keeper's own door result (`jobs/cargo.ts:2919`):

        noteSentFor(
          brain,
          who,
          wasInside ? undefined : letInOnWarrant(brain, who),
        );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:902`, the officer's own side, which sends it through a door the Captain opened by hand:

      // The door it asked at stands open now, with no crew member holding it: someone let it in by
      // hand, as the Captain does with their own ID (ARR-06).

The guard reads the answer with `NO_REASON_WORDS` (guarding.ts:61), `/nobody|no one|should not be|.../`, so the officer's fixed answer is owning up by design.

## How it was found

Seen in a round log, `data/logs/2026/11/20/round-10.31.34`, lines quoted above. Then read on master: `guarding.ts` is unchanged between the tag `pre-night` and master (`git diff pre-night master -- .../jobs/guarding.ts` is empty), and `explainStep` has no case for security. Not checked: how a keeper reads an officer's answer that has "warrant" in it, beyond `NO_REASON_WORDS` and the voucher reading; not run in the simulator.

## How to fix it

1. In `explainStep`, before the "Nobody sent for me" answer: if the body is security (`isSecurity(brain.job)`) and has a standing warrant whose person is in view in this room, or was last seen in this room or a room reached through it (the officer's `beatOf(brain).warrants`, `lastSeen.place`, `shutOut.place`; export a small helper from `jobs/arrests.ts`, say `warrantHere(brain, room)`), answer with fixed words: step "... The truth is that you are here on security business, to serve a warrant. In "say", tell them so, beginning with "I am here on a warrant"", say `I am here on a warrant.`, needs `has('warrant')`. Do not name the person: the warrant rule in the officer's prompt says a warrant is not told to people met, and the person may be in earshot.
2. In the keeper's reading of a stranger's answer (where `NO_REASON_WORDS` is tested in `jobs/guarding.ts`), when the stranger's shown job is security and the answer has `warrant` in it, call `noteSentFor(brain, name, { warrant: true })` and set the verdict to stay, so `warrantStands` keeps them for `WARRANT_WELCOME_DS`. Test the warrant words before `NO_REASON_WORDS`, since "nobody" may be in the same line.
3. Keep the general rule: anyone else who owns up is still walked out, and a security body with no warrant standing there still owns up.
4. The owner's question from ARR-02 step 3 still stands: whether an officer should be walked out of a room it has a warrant to serve in at all.

## How to test the fix

- Simulator: a scenario like the cargo warrant ones with the officer put inside the Cargo Bay by a door held for a janitor (or by the Captain's ID), the person wanted in the Quartermaster's Office. Check the officer says "I am here on a warrant." and no `throw_out` of it follows.
- Type check and lint of the window code.
- Next round, `game.log`: no "Nobody sent for me" from a security body that has a warrant standing; no "took hold of <officer> to walk them out of" while the person on its warrant is in that post.
