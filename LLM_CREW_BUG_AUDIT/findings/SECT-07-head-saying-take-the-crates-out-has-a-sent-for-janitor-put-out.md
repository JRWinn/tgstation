---
id: SECT-07
title: A head saying take the crates out, or remove the empty crates, in its own room has a janitor it sent for walked out by the arm and struck off the call
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 5ff04047167
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:76, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:710, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:181
fix: Take a put-out order only when the line names a person or says him, her, them or that one as the object of the verb, and never pick the lone stranger when nobody was named
---

## What is wrong

`PUT_OUT_WORDS` matches any line with one of a dozen common verbs and, anywhere after it, the word "out". It also matches "remove" on its own. When the head of the post, or the Captain, says such a line and is not plainly speaking to someone else (`said_to` is anything but `'other'`), `strangerMeant` picks whom to put out. With no name in the line it falls back to "the only person in there who does not belong". So a line about crates puts out whoever is visiting.

Concrete case. A janitor, Tolly Field, has been sent for to the Cargo Bay and is cleaning (the call is on the department's list, so the technician's record of Tolly is `verdict: 'stay', sent: true`). The Quartermaster, Jameson Pike, says to the room "Take the crates out to the shuttle." The technician Donna Sholl hears it:

1. `superior` is true, `said_to` is `'nobody'`, `PUT_OUT_WORDS` matches "take ... out".
2. `strangerMeant` finds no name and no job word, and Tolly is the only one in the post who does not belong, so the target is Tolly.
3. `takeOrder` gives it to Donna, her record of Tolly is set to `verdict: 'go'` with `orderedBy: 'Jameson Pike'`, `forgetExpected` strikes Tolly's call off the list for every technician, and every janitor call to Tolly is marked declined.
4. Donna says "Yes, Jameson. I am putting Tolly out.", then "Tolly, Jameson wants you out of here. Out you go." and walks Tolly out by the arm. Tolly keeps out of the Cargo Bay for a while (`put_out_of`), and the mess is left.

"Can you get the mail out today?", "See if the shuttle is out yet", "Remove the empty crates from the bay" and "Put the order out on the counter" all did the same.

Tolly answers to the Head of Personnel, not the Quartermaster, so `LEAVE_WORDS` in Tolly's own brain does not fire on this line. Only the technician acts.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:76`:

    const PUT_OUT_WORDS =
      /\b(toss|throw|kick|get|take|walk|haul|drag|escort|chuck|boot|see|put)\b.*\bout\b|\bremove\b|\b(not|un)\s?authori[sz]ed\b|\bno business\b|\btrespass/;

`guarding.ts:710`, in `guardOverhears`:

    if (
      superior &&
      event.details.said_to !== 'other' &&
      PUT_OUT_WORDS.test(heard)
    ) {
      const target = strangerMeant(brain, heard);
      if (target) {
        ...
        forgetExpected(brain.post, target);
        delete brain.sentFor[target];

`guarding.ts:198`, in `strangerMeant`, the fallback with no name:

    return inPost.length === 1 ? inPost[0].name : null;

## How it was found

A bun script in the system temp folder (brain from `tools/llm_crew/fixtures`, `expected.ts` for the call): a technician at its post in the Cargo Bay, the Quartermaster (`superior: true`) and a sent-for janitor (`in_post: true, belongs: false`) in view. Each line above was fed to `guardOverhears` with `said_to: 'nobody'`. Each time the janitor's record went from `"verdict":"stay","sent":true` to `"verdict":"go","orderedBy":"Jameson Pike"`, `expectedCall` for Tolly became false, and the technician queued "Yes, Jameson. I am putting Tolly out." Not seen in a round.

## How to fix it

1. Read the object of the verb, not the whole line. Take a put-out order only when, between the verb and "out", there is a person: a name of someone in the post (`strangerNamedIn` on those words), "him", "her", "them", "that one", "this one", or a job word that matches a stranger's job ("that janitor"). Do the same for "remove": "remove him", "remove the clown".
2. Keep "not authorized", "no business" and "trespass" only with a person in the line: "the clown is not authorized in here", "Tolly has no business here".
3. In `strangerMeant`, drop the "only stranger in the post" fallback unless the line has "him", "her", "them" or "that one" in it, so a line with no person at all never puts anyone out.
4. Leave who may give the order (`superior`), and the rule that no head or Captain is touched, as they are.
5. A line not taken as an order goes on to the voice as talk, as now.
6. Mind "Get out of here" and "Out you go" said by the head straight to the stranger, with no name: today the technician acts on it (the regex allows nothing between "get" and "out", and the lone stranger is picked). After steps 1 and 3 it would not. That is acceptable, since the stranger heard it and a head who wants help names them or says "him"; if the owner wants the technician to back the head up there, accept a bare "get out" only when there is exactly one stranger in the post and the line has no other object ("get out of here", "out you go"), not "get the mail out".
7. Put the object test in one helper (say `putOutMeant(brain, heard)`) that returns the name or null, and have `guardOverhears` use it in place of `PUT_OUT_WORDS.test` plus `strangerMeant`, so the two cannot drift apart again.

## How to test the fix

Add cases for `guardOverhears`: with a sent-for janitor in the bay, each line above leaves the record at `verdict: 'stay'` and the call on the list; "Get him out of here", "Put Tolly out", "Throw that janitor out" and "Remove him" each set `verdict: 'go'`. In a round, grep `game.log` for "I am putting" and read the line the head said just before.

## Check

Checked by Opus 5.5 on 2026-11-19. The quotes are what the code says today: `PUT_OUT_WORDS` at `guarding.ts:76`, the order branch in `guardOverhears` at `guarding.ts:710-750`, and the fallback `return inPost.length === 1 ? inPost[0].name : null;` at the end of `strangerMeant`.

Traced: `guardOverhears` is called from `brain.ts:661` for every `speech_heard` from a person, after `saidTo` (`addressing.ts:83`) has set `said_to`; with no name, no group word and the speaker not beside the technician, `said_to` is `'nobody'`, which passes `!== 'other'`. `superior` is the server's `answers_to` (`crew_npc_guarding.dm:59`): true for the Quartermaster over a technician and for the Captain over anyone, by the worn card. Nothing before the branch looks at what the verb is applied to. On the server `why_not_put_out` (`crew_npc_guarding.dm:136`) refuses only those who belong (door access) or are command, so a sent-for janitor is taken by the arm. No entry in `LLM_CREW_CHANGELOG.md` or the plans chose this or fixed it; no other finding covers it (PARSE-07 and SECT-08 are other paths into the same put-out).

Ran a throwaway bun script outside the repo (`makeBrain` from `tools/llm_crew/fixtures.ts`, `expectSomeone` for Tolly's call, a stranger record `verdict: 'stay', sent: true`, the Quartermaster `superior: true` in view, `said_to: 'nobody'`). For each of "Take the crates out to the shuttle.", "Can you get the mail out today?", "See if the shuttle is out yet", "Remove the empty crates from the bay" and "Put the order out on the counter" it printed `go false [ "Yes, Jameson. I am putting Tolly out." ]`: verdict `go`, the call gone from the list, and the line queued. So the fault is real.

Severity stays high: the wrong person is acted on (a worker the department sent for is walked out and struck off its call), and the lines that set it off are ordinary talk from a head or the Captain in their own department. Effort stays small: one file, the regex and `strangerMeant`. The fix keeps the rules (it only narrows when code takes an order). Added steps 6 and 7 on the bare "get out" case and on keeping the test in one helper.
