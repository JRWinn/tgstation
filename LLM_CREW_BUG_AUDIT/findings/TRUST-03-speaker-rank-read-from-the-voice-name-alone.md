---
id: TRUST-03
title: Who said something is taken from the voice alone, so a voice made to sound like the Captain is the Captain, whoever is standing there
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:404, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:716, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:132, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:465, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1504
fix: Have the server send voice_matches with every line from a human (false when a player's chat would add "(as ...)"), and have the window give no rank to a line whose voice does not match, and take rank from the person behind the handle when there is one
---

## What is wrong

See also: HOLE-01 (rank from the job text on a card), and API-02 (the same voice-against-face split, seen from the other side: an honest Captain with an honorific on is not obeyed). API-02's fix, look the speaker up by handle and fall back to the name only with no handle, would also close the case below where the changeling stands in sight, provided it is applied to every `jobOf` used on speech (API-02 names the `superior` checks, not the `jobOf` calls in `desk.ts`, `officer.ts` and `quartermaster.ts`). What it leaves open is the fallback: a voice with no handle, from someone the body has not seen in the last 15 seconds, still gets the rank of whoever the PDA list shows under that name. Whoever fixes API-02 should do this one at the same time. This is a second, separate way in: the voice.

The server tells the window who spoke by `speaker.get_voice()`, and nothing else about the name. For a human that is `override_voice` if set, the ID's name if a voice changer is on, and otherwise the real name (`human_say.dm:32`). A player hearing the same line sees more: `get_message_voice` adds " (as <the name on their ID>)" whenever the voice is not the name they show (`human_say.dm:44`). So a player sees "Jane Doe (as Bob Hale)" and knows something is off. This is added whether or not the hearer can see the speaker: `compose_message` calls `get_message_voice(visible_name)` with `visible_name` FALSE by default (`say.dm:168`), and the human proc compares the voice to the speaker's `name` either way. The crew body is told "Jane Doe" and that is all.

The server does tie the line to the body that said it: `details["handle"]` is the handle of the person it saw. The window never uses the handle to decide rank. Every job looks the speaker up by the voice name: `jobOf(brain, speaker)` takes the first person in view with that name, and failing that the job the PDA list shows for that name. So a voice that names someone who is not in view gets that person's job from their PDA.

One concrete case. A changeling uses Mimic Voice (`code/modules/antagonists/changeling/powers/mimic_voice.dm`: "Will turn our voice into the name that we enter") with the Captain's name, Jane Doe. It walks up to the Head of Security as itself, Bob Hale, Assistant, in plain sight, and says: "Warrant for Jordan Vale, for theft, 15 minutes."

1. `on_pre_hear`: `speaker_name` is "Jane Doe". `details["handle"]` is Bob's handle, since the body has just seen him.
2. `deskHears`: `speaker` is "Jane Doe". `jobOf(brain, "Jane Doe")`: the real Captain is not in view, so `pdaPeople` gives "Captain".
3. `deskTakes(brain, "Jane Doe", "Captain", ...)`: `declarer` and `captain` are true. The warrant is taken, read back aloud to "Captain", and given to the officer.

The same voice can pardon anyone in the cells, tell the Quartermaster "yes" to a big purchase (`overhears` in `quartermaster.ts` reads the answer from `jobOf(brain, speaker)`), and, with the Head of Security's name, hand an officer a warrant in the Head of Security's own words, which the officer serves on anyone but the Captain with none of the desk's rules (`officer.ts:465`: `if (isHeadOfSecurity(job)) takeWord(...)`).

Even with the real Captain in view, `jobOf` finds them by the name and answers "Captain" for the changeling's line.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:404`, in `on_pre_hear`:

    var/speaker_name = message_mods[MODE_SPEAKER_NAME_OVERRIDE] || speaker.get_voice()
    ...
    if(ishuman(speaker) && recently_saw(speaker))
    	details["handle"] = handle_for(speaker)

`code/modules/mob/living/carbon/human/human_say.dm:32` and `:44` (base game):

    /mob/living/carbon/human/get_voice(add_id_name = FALSE)
    	...
    	if(override_voice)
    		return override_voice
    	...
    /mob/living/carbon/human/get_message_voice(visible_name)
    	. = ..()
    	if(. != name)
    		. += " (as [get_id_name("Unknown", honorifics = TRUE)])"

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:132` (the same `jobOf` is copied into arrests, head, quartermaster, wanted, officer, headofsecurity, chiefengineer, forcing and janitor):

    function jobOf(brain: NpcBrain, name: string): string {
      return (
        brain.peopleInView.find((person) => person.name === name)?.job ??
        brain.pdaPeople.find((person) => person.name === name)?.job ??
        ''
      );
    }

`desk.ts:716`, in `deskHears`: `const job = jobOf(brain, speaker);`

## How it was found

Read from the code, base game and ours. Not tried in a round: no changeling has been played against the crew.

Not checked: how often a voice and a face differ for ordinary reasons. Honorifics make the name in view "Captain Jane Doe" while the voice is "Jane Doe" (`get_visible_name` in `human_helpers.dm:65`), so `peopleInView.find` already misses the real Captain by name today and the PDA list is what answers. The fix below has to keep that working.

## How to fix it

1. Server, `on_pre_hear`: for every human speaker, seen or not, send `"voice_matches" = !findtext(speaker.get_message_voice(), " (as ")`. That is exactly the test a player's chat applies, and it already copes with honorifics: `get_voice(add_id_name = TRUE)` gives "Captain Jane Doe" for an honest Captain with an honorific on, which equals their `name`, so nothing is added. Also send `"voice_as" = speaker.get_id_name("Unknown", honorifics = TRUE)` when it does not match, for step 5. Keep `speaker` as `get_voice()`, as now.
2. Window: one helper, say `speakerRank(brain, event): string` (the job to use), in `addressing.ts` or `situation.ts`, built together with API-02's `speakerInView`. If `voice_matches === false`, return `''`. Else, with `details.handle`, return the job of the person in view with that handle. Else (heard, not seen) fall back to the name, as `jobOf` does now: a player hearing an unseen voice with no "(as ...)" goes by the voice too, so taking that away would stop the crew obeying a Captain talking from round a corner, which is a design change for the owner.
3. Replace every `jobOf(brain, speaker)` used on a line heard aloud (`desk.ts:716`, `officer.ts:465`, `quartermaster.ts:1504`, `wanted.ts:213`, `head.ts:1182`, `headofsecurity.ts:253`, `chiefengineer.ts:678`; grep for more) with the helper. Leave `jobOf` on PDA messages alone.
4. Where the window keeps names (warrants `by`, orders `from`, who to answer), keep using the voice name for what is said back, so that the answer still goes to the name the speaker used.
5. Tell the model when the voice does not match: in `describeEvent`, write the speaker as "Jane Doe (as Bob Hale)" the way a player's chat does. What the crew make of it is talk.

Effort is large by FORMAT.md only because it touches both the server (two lines) and the window (one helper and about ten call sites); with API-02's helper built first, it is small.

## How to test the fix

- A table test for `deskHears`: a Head of Security brain with the Captain on its PDA list, Bob in view as "Assistant" with handle p3, and a `speech_heard` event with `speaker` "Jane Doe", `handle` "p3", `voice_matches: false`, the words of a warrant. No warrant is taken and `REFUSALS.notDeclarer` is the reply. The same event from the real Captain's handle with `voice_matches: true` is taken.
- The same for the officer: a warrant in the Head of Security's words, from a handle whose job is not Head of Security, is not taken.
- The same desk event with no `handle` and `voice_matches: true` from "Jane Doe" with the Captain on the PDA list is still taken (the unseen honest Captain).
- Server compile. In a round, an admin can set `override_voice` on a player with View Variables and try the warrant above. `game.log` should show no arrest. With the honorific on the Captain's own card, the real Captain's warrant should still be taken.

## Check

Checked by Opus 5.5. The quotes match the code today. `on_pre_hear` (`crew_npc_senses.dm:404`) sends `speaker` from `get_voice()` and a `handle` only for a human seen in the last few seconds; nothing tells the window that voice and face differ. `get_voice` returns `override_voice` (`human_say.dm:32`), which Mimic Voice sets to any name (`mimic_voice.dm:25`). In the window `brain.ts:660` passes every person's line to the job's `overhears`; the Head of Security's path reaches `deskHears` (`desk.ts:716`), whose `jobOf` (`desk.ts:132`) answers from `peopleInView` by name, then `pdaPeople` by name (the server's `people_on_pda`, name and job of each PDA aboard). With the real Captain out of view that is "Captain", so `deskTakes` (`desk.ts:353`) sets `declarer` and `captain`; the same `jobOf` decides `officer.ts:465` (`isHeadOfSecurity(job)` then `takeWord`). Nothing in between looks at the handle. Not a duplicate of API-02 (confirmed): that fix keeps the name fallback, which is the hole here when the speaker is unseen, and does not touch the `jobOf` calls. Nothing in the change log or plans speaks of voices. I changed the fix: the server can send the exact test a player's chat makes, `get_message_voice` with or without " (as ", which holds for unseen speakers too and already passes the honest Captain with an honorific; and I kept the name fallback for an unseen voice that matches, because removing it would stop the crew obeying an unseen Captain, which the owner has not decided. Severity stays medium: it takes an antagonist with a changed voice, though then an innocent is arrested. Effort set to large because the fix spans the server and the window. Not run.
