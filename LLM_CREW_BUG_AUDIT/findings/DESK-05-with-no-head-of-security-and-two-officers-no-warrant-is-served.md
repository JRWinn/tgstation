---
id: DESK-05
title: With no Head of Security and two officers, the officer who keeps the list hands every warrant to the other, who does not read it, so nobody serves any
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:949, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:441, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:466, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:334
fix: With no Head of Security, have each officer keep and serve its own list (officerAboard returns null for an officer keeping the desk), or have officers read a fellow officer's give, seen and let-go lines with takeWord
---

## What is wrong

With no Head of Security aboard, "an officer keeps the list itself" (desk.ts header). Every officer runs `syncDesk` then (officer.ts:141). `syncDesk` sends each warrant to `serving(brain)`, which is `officerAboard(brain)`: any security officer in view or on the PDA other than itself. With two officers, each one's "officer to send" is the other.

The other officer does not take it. An officer only reads warrants given in `giveLine` words through `takeWord`, and `takeWord` is only called when the sender's job is Head of Security (officer.ts:441 for PDA, officer.ts:466 for speech). From a fellow officer the line goes to `deskTakes` instead, which for security staff only looks for the "I have the warrant" words and for an outcome (desk.ts:334 to 351), and returns FALSE. Then `deskUnread` drops it, because a security officer is not a head.

Meanwhile the officer that keeps the list hands its own copy back (`handBack`, desk.ts:952), because there is an officer to send. So nobody serves it.

Concrete case. No Head of Security. Officers Hale Stone and Dana Reyes. The Captain sends Hale "Warrant for Pun Pun, for wrecking the Custodial Closet."

1. Hale's `deskTakes`: a warrant from the Captain, put on Hale's list, answered word for word.
2. Hale's `syncDesk`: `officerAboard` is Dana. `handBack` empties Hale's own beat. A GIVE task opens for Pun Pun.
3. Dana is not in sight. Hale sends Dana "Dana, warrant: Pun Pun, for wrecking the Custodial Closet. Bring them in, 5 minutes." It sends, so `deskAfterActing` marks it `taken`.
4. Dana's `readsMessage`: the sender's job is Security Officer, not Head of Security, and there is no head aboard, so `deskTakes(Dana, Hale, 'Security Officer', ...)`. No ack words, no outcome: FALSE. `deskUnread`: `isHead('Security Officer')` is FALSE: dropped.
5. Pun Pun stays on Hale's list for the round. Sightings are passed to Dana (`seenLine`) and dropped the same way. The heads are sent the notice and read Pun Pun out at every meeting.

The same holds said aloud: Dana's `overhears` sends Hale's line to `deskHears`, then `deskTakes`, with the same result. And it holds both ways: a warrant the Captain gives Dana goes to Hale and is lost.

The plan has a second officer as stage 3 (LLM_CREW_PLAN_SECURITY.md:392), so this crew was not designed for. But nothing stops it: two officers on the station, or a second spawned, and no Head of Security, which is also the case once the Head of Security's PDA leaves the station level (crew_npc_cargo.dm:677). The project rule is that a job does not work with only one size of crew.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152`:

    export function officerAboard(brain: NpcBrain): string | null {
      const isOther = (person: { name: string; job: string }) =>
        isOfficer(person.job) && person.name !== brain.name;

`desk.ts:949`, in `syncDesk`:

    const officer = serving(brain);
    // With an officer to send, whoever keeps the list does not go after anyone itself.
    if (officer) {
      handBack(brain);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:441`, in `readsMessage`:

    if (isHeadOfSecurity(job)) {
      takeWord(brain, from, text, false);
      return;
    }
    if (!headAboard(brain)) {
      ...
      if (!deskTakes(brain, from, job, text, false)) {
        deskUnread(brain, from, job, text);
      }

`desk.ts:334`, what `deskTakes` reads from security staff:

    if (isSecurity(fromJob)) {
      if (WARRANT_ACK_WORDS.test(text)) {
        ...
      }
      const outcome = readOutcome(text);
      ...
      return false;
    }

## How it was found

Read from the code, on both officers' side. Not run in the simulator and not seen in a round.

## How to fix it

Two ways. The owner should pick, since it is how two officers share work, which the plan left for later.

1. Simplest, and what I would take now: with no Head of Security aboard, an officer that keeps the list serves its own warrants. In `serving`, return null when the brain itself is a Security Officer (`isOfficer(brain.job)`), so `syncDesk` takes every warrant into its own hands as it does today with one officer. Two officers then each serve what was declared to them, and neither hands anything to the other.
2. Fuller: let an officer read a fellow officer's `giveLine`, `seenLine` and `letGoLine` by calling `takeWord` when the sender is an officer and no Head of Security is aboard, and send the outcome back to the officer that gave it. This needs one officer chosen to keep the list (for example the first by name), or both lists drift apart.

Either way, keep the Head of Security's path as it is.

## How to test the fix

- Add a case to `tools/llm_crew/security.ts`: two officers, no Head of Security on the PDA list, the Captain declares a warrant to one. After one `syncDesk`, that officer (fix 1) or the other (fix 2) has the warrant in its own beat.
- Type check from `tgui/`.
- In a round with two officers and no Head of Security, grep `game.log` for the officer's arrest steps on the declared name.
