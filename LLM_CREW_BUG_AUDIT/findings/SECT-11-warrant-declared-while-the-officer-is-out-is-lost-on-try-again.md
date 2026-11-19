---
id: SECT-11
title: A warrant declared while the officer is out hurt is marked given, so after try again the Head of Security hands it back and the officer is never told of it
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:954, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:442, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:244
fix: When try again clears officerOut, set every warrant the officer was never given back to given no, so the give task hands it over
---

## What is wrong

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

1. Keep a mark on each desk warrant of whether the officer itself was given it: set `warrant.toOfficer = true` where it is given (`deskAfterSaying` and `deskAfterActing` on a sent `GIVE_WORDS` line), and leave it unset when `syncDesk` takes it into its own hands.
2. In `syncDesk`, when `officer` is not null and a warrant has `given !== 'no'` but no `toOfficer`, set `given = 'no'`, `gives = 0`, `walkedUp = false`. The give task then opens and the officer is told in the usual words.
3. Do the same when there was no officer aboard and one comes aboard later: today the same path leaves those warrants with the Head of Security, which drops them (`handBack`) the moment the new officer is seen on the PDA list.
4. A warrant whose person the Head of Security has by the arm stays with it, as `handBack` already allows.

## How to test the fix

Add the four steps above to `tools/llm_crew/security.ts`: after "Try again." and one `syncDesk`, there is a `give_warrant` task for Dana Reyes. Add a second case: no officer on the PDA list, a warrant declared, then an officer added to `pdaPeople`; one `syncDesk` later there is a `give_warrant` task.
