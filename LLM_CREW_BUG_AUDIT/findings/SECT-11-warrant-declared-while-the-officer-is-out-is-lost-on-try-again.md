---
id: SECT-11
title: A warrant declared while the officer is out hurt is marked given, so after try again the Head of Security hands it back and the officer is never told of it
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: de271d9f7b7
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:954, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:442, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:244
fix: In syncDesk, remember who was serving last time, and when it changes from nobody to an officer set every warrant the Head of Security does not have by the arm back to given no, so the give task hands it over
---

## What is wrong

See also: TRB-03 (while the officer is out hurt both it and the Head of Security hold each warrant, and the one that did not make the arrest arrests again). Same handover, different fault: here a warrant declared during the break is never given back after "try again"; there no word goes to the other holder when a warrant is served. Each has its own fix.

While the officer is out hurt, the Head of Security serves the warrants itself. `syncDesk` takes each one into its own hands and marks it `given: 'taken'`, as if the officer had it. When the Captain says "try again", `officerOut` is cleared, the next `syncDesk` finds an officer to send and calls `handBack`, which drops the Head of Security's own copies. Nothing sets `given` back. The give task is opened only for `given === 'no'`, so a warrant declared while the officer was out is never given to the officer. Nobody serves it.

Concrete case, run in a script:

1. The officer, Hale Stone, tells the Head of Security "Joan, I am hurt and can make no arrests." `officerOut` is `'hurt'`.
2. The Captain declares "Warrant for Dana Reyes, for theft." `syncDesk` puts Dana in the Head of Security's own beat and marks the desk's warrant `given: 'taken'`.
3. The Captain sends "Try again." The officer is told "Hale, you are to make arrests again."
4. The next two `syncDesk` calls: the desk's warrant on Dana is still `given: 'taken'`, the Head of Security's beat is empty, and there is no `give_warrant` task.

Dana stays on the list for the rest of the round. Sightings of her are passed on to the officer ("Hale, Dana Reyes was seen in the Bar.", since `given !== 'no'`), and the officer does nothing with them: `noteSeen` finds no warrant of its own with that name. Every head reads Dana out at every meeting, and the Captain is told "Still wanted: Dana Reyes" in every security meeting report.

Warrants the officer held before it was hurt are not lost: the officer keeps them in its own beat while hurt, and `arrestAgain` on the officer starts them again. ARR-09 assumes the warrant is given again after "try again"; it is only for these older warrants that this is so.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:954`, in `syncDesk`:

    for (const warrant of desk.warrants) {
      if (!officer) {
        // Nobody to send. It serves the warrant itself.
        giveWarrant(brain, warrant);
        warrant.given = 'taken';

`desk.ts:1010`, the give task needs `'no'`:

    for (const warrant of desk.warrants) {
      keep(brain, GIVE, !!officer && warrant.given === 'no', warrant.name);
    }

`desk.ts:442`, in `deskTakes`, "try again" clears the flag and nothing else:

    if (captain && TRY_AGAIN_WORDS.test(text)) {
      desk.officerOut = null;
      arrestAgain(brain);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:244`, `handBack`:

    beat.warrants = beat.warrants.filter(
      (it) => !!holding && sameName(it.name, holding),
    );

## How it was found

A bun script in the system temp folder (brain from `tools/llm_crew/fixtures`, `jobs/desk` and `jobs/arrests`) ran the four steps above. It printed:

    after declare: desk [["Dana Reyes","taken"]] own beat [ "Dana Reyes" ]
    after try again: desk [["Dana Reyes","taken"]] own beat [] tasks [ "hold_meeting:undefined", "security_notice:undefined" ]

Not seen in a round.

## How to fix it

The simplest fix that covers every way in is to act on the moment the server of the warrants changes, not on "try again" alone:

1. Add `servedBy: string | null` to the desk (`deskOf`'s default object, next to `officerOut`).
2. In `syncDesk`, right after `const officer = serving(brain);`: if `officer && officer !== desk.servedBy`, then for every warrant that is not for the person `brain.security?.holding` names, set `given = 'no'`, `gives = 0`, `walkedUp = false`. Then set `desk.servedBy = officer` (also when it is null). `handBack` runs just after, as now, and the give task opens for each in the same call.
3. That covers the three cases: "try again" after a hurt officer (`officerOut` cleared, `serving` goes from null to the officer); no officer aboard and one seen later; and an officer missing from `pdaPeople` and `peopleInView` for one look and back the next, which today also turns every `'no'` and `'said'` warrant into `'taken'` and then hands them back.
4. A warrant the officer already holds is given again. That is harmless: the officer's `giveWarrant` (`arrests.ts:132`) only puts right the time on one it has, and it says "I have that". It also keeps this fix right if TRB-03 is fixed by having the hurt officer hand its warrants back.
5. A warrant whose person the Head of Security has by the arm stays with it, as `handBack` already allows.

The first write-up's way (a `toOfficer` mark set in `deskAfterSaying`/`deskAfterActing`) also works, but needs the mark cleared on hurt and on TRB-03's hand-back, and is easier to get wrong.

## How to test the fix

Add the four steps above to `tools/llm_crew/security.ts`: after "Try again." and one `syncDesk`, there is a `give_warrant` task for Dana Reyes. Add a second case: no officer on the PDA list, a warrant declared, then an officer added to `pdaPeople`; one `syncDesk` later there is a `give_warrant` task. Keep the existing cases in `tools/llm_crew/security.ts` passing, above all the ones on the officer being hurt and on a new time for a warrant (`setTerm`). In a round: have the officer break off hurt, declare a warrant, say "Try again" to the Head of Security, and grep `pda.log` for the warrant line to the officer that follows.

## Check

Checked by Opus 5.5 on 2026-11-19. The quotes are what the code says today: `syncDesk` at `desk.ts:938-1012` (the `!officer` branch sets `given = 'taken'`, the give task needs `'no'`), the "try again" branch at `desk.ts:442` (clears `officerOut`, calls `arrestAgain`, tells the officer, nothing else), and `handBack` at `arrests.ts:244`. The hurt branch at `desk.ts:810` sets every warrant to `'no'` then, but the next `syncDesk`, with `serving()` null (`desk.ts:163`), sets them all to `'taken'`, and a warrant declared afterwards (created `given: 'no'` at `desk.ts:552`) goes the same way. The only other places that set `given` back to `'no'` are `setTerm` (a new time) and the resend after no answer, which needs `'said'`. `giveWarrant` on the Head of Security's side is called only from `desk.ts:298` and `:957`; the officer gets a warrant only from a give line (`officer.ts:333`).

Ran a throwaway bun script outside the repo (Head of Security from `tools/llm_crew/fixtures.ts`, Captain and officer on `pdaPeople`, `officerOut = 'hurt'`, "Warrant for Dana Reyes, for theft." from the Captain, then "Try again.", then two `syncDesk`). It printed `after declare [["Dana Reyes","taken"]] ["Dana Reyes"]` and `after try again [["Dana Reyes","taken"]] [] ["hold_meeting:undefined"]`: no `give_warrant`, the Head of Security's beat empty. The fault is real. Nothing in `LLM_CREW_CHANGELOG.md` (the "try again" entry at line 585) or the plans covers a warrant declared during the break. Not a duplicate: ARR-09 is about breaking off again, TRB-03 about two holders, KNA-09 about a down officer.

Severity lowered from high to medium: the warrant is lost for good, but only when the officer has broken off hurt and a warrant is declared before the Captain says "try again" (or an officer turns up after a warrant was declared), which is not most rounds. Effort stays small. Rewrote "How to fix it" to act on the change of who serves, which also covers the late officer and a one-look gap in the PDA list.
