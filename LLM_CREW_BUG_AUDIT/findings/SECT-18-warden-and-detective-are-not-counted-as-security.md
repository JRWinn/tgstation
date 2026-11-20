---
id: SECT-18
title: A Warden or Detective is not counted as security, so a warrant on one is taken and one who brings a warrant is told to take it to their head
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:40, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:491, tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:59
fix: Make isSecurity true for every job of the Security department in hierarchy.ts, Warden and Detective included, and keep isOfficer for who makes arrests
---

## What is wrong

`isSecurity` is true only for "Head of Security" and "Security Officer". The station's own table in `hierarchy.ts` puts the Warden and the Detective in the Security department, answering to the Head of Security. Neither will be an NPC yet (the security plan leaves them out), but either can be a player in a round with an NPC Head of Security.

What the code does with them:

- The Captain sends "Warrant for Jack Moss" and Jack Moss is the Detective. `deskTakes` checks `isSecurity(theirJob)` to refuse a warrant on its own staff; it is false, so the warrant is taken and the NPC officer goes after the Detective.
- The Warden, a player, tells the Head of Security to its face "Arrest Pun Pun". The Warden is not a head and not security, so the answer is "Kim, a warrant is for the Captain or a head of department to declare. Take it to your head." The Warden's head is the Head of Security it is talking to.
- Staff send the Warden no sightings and the Warden is not invited to the security meeting, which is as built; this is noted only so that the fix does not change it by accident.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:40`:

    export function isSecurity(title: string): boolean {
      return isHeadOfSecurity(title) || isOfficer(title);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:491`, in `deskTakes`:

    } else if (isSecurity(theirJob) || sameName(declared.name, brain.name)) {
      reply(
        brain,
        from,
        REFUSALS.onSecurity(to),

`tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:59`:

    name: 'Security',
    head: 'Head of Security',
    jobs: ['Warden', 'Security Officer', 'Detective', 'Prisoner'],

## How it was found

Read from the code. Not run and not seen in a round.

## How to fix it

1. Add `isSecurityStaff(title)` in `security.ts`: the Head of Security, or any job of the Security department in `DEPARTMENTS` except "Prisoner".
2. Use it in `deskTakes` for the refusal of a warrant on security's own staff.
3. For a Warden or Detective who brings a warrant, answer as the desk would answer a head's member of staff: "Kim, a warrant is for the Captain or a head of department to declare." without "Take it to your head" (or ask the owner whether the Warden may declare one; the plan does not say).
4. Leave `isSecurity` as it is where it means "an NPC whose own lines are read word for word" (`deskTakes` reads `readOutcome` from anyone `isSecurity`), so that a player Detective's talk is not read as an officer's report.

## How to test the fix

Add to `tools/llm_crew/security.ts`: with Jack Moss (Detective) on the PDA list, the Captain's "Warrant for Jack Moss" is refused with "I take no warrant on my own staff."
